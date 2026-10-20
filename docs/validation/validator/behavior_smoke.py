#!/usr/bin/env python3
"""Small deterministic semantics probes. NOT a scheduler, state machine or production runtime."""
import copy, json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent

def segments(s):
 if not s:return []
 assert s.startswith('/')
 return [x.replace('~1','/').replace('~0','~') for x in s[1:].split('/')]
def get(data,path):
 t=data
 for s in segments(path):t=t[int(s)] if isinstance(t,list) else t[s]
 return t
def put(data,path,value):
 parts=segments(path);t=data
 for s in parts[:-1]:t=t[int(s)] if isinstance(t,list) else t[s]
 tail=parts[-1];t[int(tail) if isinstance(t,list) else tail]=value

def ref_path(ref,env):
 path=ref.get('path','')
 base=env[ref['scope']] if 'scope' in ref else ''
 return base+path

def frames(data,decl,base=None):
 current=[base or {}]
 for b in (decl if isinstance(decl,list) else ([decl] if decl else [])):
  nxt=[]
  for env in current:
   p=ref_path(b['from'],env)
   if b.get('mode','one')=='each':
    for i in range(len(get(data,p))):
     n=env.copy();n[b['as']]=p+'/'+str(i);nxt.append(n)
   else:
    n=env.copy();n[b['as']]=p;nxt.append(n)
  current=nxt
 return current

def expr(doc,data,e,env):
 if not isinstance(e,dict):return e
 if 'ref' in e:
  r=e['ref'];return get(data,ref_path(r,env))
 if 'literal' in e:return e['literal']
 if 'use' in e:return expr(doc,data,doc['expressions'][e['use']],{})
 op=e['op'];v=[expr(doc,data,x,env) for x in e['args']]
 return {'eq':lambda:v[0]==v[1], 'gt':lambda:v[0]>v[1], 'gte':lambda:v[0]>=v[1], 'lt':lambda:v[0]<v[1], 'lte':lambda:v[0]<=v[1], 'length':lambda:len(v[0]),'mul':lambda:v[0]*v[1], 'and':lambda:all(v), 'or':lambda:any(v), 'not':lambda:not v[0]}[op]()

def run_change(doc,sample,changed,new):
 data=copy.deepcopy(sample)
 put(data,changed,new);fired=[]
 for rule in doc.get('reactions',[]):
  for env in frames(data,rule.get('scope')):
   if changed not in [ref_path(w,env) for w in rule['watch']]:continue
   if 'when' in rule and not expr(doc,data,rule['when'],env):continue
   for c in rule['then']:
    if c['op']!='set':raise ValueError('smoke runner only supports Reaction set')
    v=c['value']
    if isinstance(v,dict) and '$expr' in v:v=expr(doc,data,v['$expr'],env)
    put(data,ref_path(c['target'],env),v)
   fired.append({'id':rule['id'],'scopePath':env})
 return data,fired

def inspect_constraints(doc,data):
 passed=failed=external=0;issues=[]
 for c in doc.get('constraints',[]):
  for env in frames(data,c.get('scope')):
   if 'when' in c and not expr(doc,data,c['when'],env):continue
   if c['kind']=='external':external+=1;continue
   if expr(doc,data,c['assert'],env):passed+=1
   else:failed+=1;issues.append({'id':c['id'],'target':ref_path(c['issue']['target'],env)})
 return {'internalPassed':passed,'internalFailed':failed,'externalObligations':external,'issues':issues}

def main():
 report=json.loads((ROOT/'report.json').read_text())
 tests=[]
 for num,name,change,value,target,other,expectedOther in [
  (2,'订单修改国家只清理城市','/order/country','SG','/order/city',None,None),
  (3,'嵌套成员只清理自身城市','/teams/0/members/1/address/country','US','/teams/0/members/1/address/city','/teams/0/members/0/address/city','Tokyo'),
  (4,'被保人地区联动','/insureds/0/country','SG','/insureds/0/city',None,None),
  (5,'三层理赔项联动不影响兄弟项','/policies/0/travellers/0/claims/0/incidentCountry','SG','/policies/0/travellers/0/claims/0/incidentCity','/policies/0/travellers/0/claims/1/incidentCity','Singapore')]:
  p=next((ROOT/'cases').glob(f'{num:02d}-*.json'))
  d=json.loads(p.read_text());sample=json.loads((ROOT/'fixtures'/f'{num:02d}-valid-data.json').read_text())
  after,events=run_change(d,sample,change,value)
  ok=get(after,target) is None and len(events)==1 and (other is None or get(after,other)==expectedOther)
  tests.append({'name':name,'pass':ok,'fired':events,'targetResult':get(after,target),'independentValue':get(after,other) if other else None})
 # Basic valid constraint results; each external obligation is per scoped item, not global rule ID only.
 obligations=[]
 for num in range(1,6):
  p=next((ROOT/'cases').glob(f'{num:02d}-*.json'))
  d=json.loads(p.read_text());sample=json.loads((ROOT/'fixtures'/f'{num:02d}-valid-data.json').read_text())
  x=inspect_constraints(d,sample)
  obligations.append({'case':p.name,**x,'pass':x['internalFailed']==0})
 # Trigger a targeted invalid internal constraint while keeping the data structurally JSON-Schema-valid.
 d=json.loads((ROOT/'cases/05-claims-complex.json').read_text());sample=json.loads((ROOT/'fixtures/05-valid-data.json').read_text())
 faulty=copy.deepcopy(sample);put(faulty,'/policies/0/travellers/0/claims/0/amount',6000)
 fail1=inspect_constraints(d,faulty)
 faulty2=copy.deepcopy(sample);put(faulty2,'/policies/0/travellers/0/claims/0/documents',[])
 fail2=inspect_constraints(d,faulty2)
 tests.append({'name':'超过保单额度的内部约束拒绝','pass':any(x['id']=='claim-under-limit' for x in fail1['issues']),'issues':fail1['issues']})
 tests.append({'name':'医疗类型无凭证时条件约束拒绝','pass':any(x['id']=='medical-documents' for x in fail2['issues']),'issues':fail2['issues']})
 report['behaviorSmoke']={'tests':tests,'obligations':obligations,'summary':{'scenarios':len(tests),'passed':sum(t['pass'] for t in tests),'internalConstraintsPass':all(x['pass'] for x in obligations)},'limitations':'Only deterministic change → scoped watch → set and internal predicate evaluation with sample data. Does not check stable array item IDs after reorder, real transactions, external validator scheduling, races, view rendering or submission.'}
 (ROOT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print('BEHAVIOR',report['behaviorSmoke']['summary'])
 for t in tests:print(t['name'],t['pass'])
 for o in obligations:print('OBLIGATIONS',o['case'],o['externalObligations'],o['internalPassed'],o['internalFailed'])
 assert all(t['pass'] for t in tests)
 assert all(x['pass'] for x in obligations)
if __name__=='__main__':main()
