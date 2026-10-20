"""Bounded, test-only semantic probes. FIFO is a harness choice, not the L3 contract.
No production scheduler, real network, renderer, transactional rollback or durable IDs.
"""
from pathlib import Path
import copy,json,datetime,importlib.util
ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('old_smoke',Path(__file__).with_name('behavior_smoke.py'));old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old)
get=old.get;put=old.put;frames=old.frames;ref_path=old.ref_path
CONTEXT=json.loads((ROOT/'manifests/context.json').read_text())['value']
def expr(doc,data,e,env=None,event=None):
 env=env or {}
 if not isinstance(e,dict):return e
 if 'literal' in e:return copy.deepcopy(e['literal'])
 if 'ref' in e:
  r=e['ref'];src=r['source']
  return get(CONTEXT if src=='context' else event if src=='event' else data,r['path'] if src!='data' else ref_path(r,env))
 if 'use' in e:return expr(doc,data,doc['expressions'][e['use']],{},None)
 op=e['op'];v=[expr(doc,data,a,env,event) for a in e['args']]
 if op=='demo.sumSubtotals.v1':return sum(x['subtotal'] for x in v[0])
 if op=='demo.dateOrdered.v1':return datetime.date.fromisoformat(v[0])<=datetime.date.fromisoformat(v[1])
 if op=='demo.ageEligible.v1':
  birth,departure=map(datetime.date.fromisoformat,v[:2]);years=departure.year-birth.year
  if departure<birth:return False
  if v[2]=='demo-A':years-=((departure.month,departure.day)<(birth.month,birth.day))
  elif v[2]!='demo-B':raise ValueError('Unknown synthetic region')
  return years>=v[3]
 ops={'eq':lambda:v[0]==v[1],'gt':lambda:v[0]>v[1],'gte':lambda:v[0]>=v[1],'lt':lambda:v[0]<v[1],'lte':lambda:v[0]<=v[1],'mul':lambda:v[0]*v[1],'add':lambda:sum(v),'sub':lambda:v[0]-v[1],'length':lambda:len(v[0]),'and':lambda:all(v),'or':lambda:any(v),'not':lambda:not v[0]}
 return ops[op]()
def value(doc,data,x,env=None,event=None):
 if isinstance(x,list):return [value(doc,data,a,env,event) for a in x]
 if isinstance(x,dict):
  if '$literal' in x:return copy.deepcopy(x['$literal'])
  if '$expr' in x:return expr(doc,data,x['$expr'],env,event)
  return {k:value(doc,data,v,env,event) for k,v in x.items()}
 return x
def execute(doc,data,c,env=None,event=None):
 env=env or {};op=c['op'];changes=[]
 if op=='batch':
  for child in c['commands']:changes+=execute(doc,data,child,env,event)
  return changes
 target=ref_path(c['target'],env)
 if op in ['array.insert','array.move']:raise NotImplementedError('位置语法尚未固化，禁止伪造执行结果')
 if op=='set':
  result=value(doc,data,c['value'],env,event)
  try:before=get(data,target);same=type(before)==type(result) and before==result
  except KeyError:same=False
  if not same:put(data,target,copy.deepcopy(result));changes.append(target)
 elif op=='patch':
  for k,v in value(doc,data,c['value'],env,event).items():
   p=target+'/'+k.replace('~','~0').replace('/','~1');t=get(data,target)
   if k not in t or t[k]!=v or type(t[k])!=type(v):t[k]=copy.deepcopy(v);changes.append(p)
 elif op=='remove':
  parts=old.segments(target);parent=get(data,'/'+ '/'.join(p.replace('~','~0').replace('/','~1') for p in parts[:-1])) if len(parts)>1 else data
  if parts[-1] in parent:del parent[parts[-1]];changes.append(target)
 elif op=='array.remove':
  item=get(data,env[c['item']['$scope']]);arr=get(data,target);idx=next(i for i,x in enumerate(arr) if x is item);arr.pop(idx);changes.append(target)
 else:raise ValueError(op)
 return changes

def overlap(a,b):return a==b or a.startswith(b+'/') or b.startswith(a+'/') or a=='' or b==''
def cascade(doc,sample,command,event=None):
 data=copy.deepcopy(sample);changed=execute(doc,data,command,event=event);queue=list(changed);trace=[{'stage':'input','changed':changed}];budget=0
 while queue:
  p=queue.pop(0);budget+=1
  if budget>150:raise RuntimeError('Test harness budget exceeded')
  for rule in doc.get('reactions',[]):
   for env in frames(data,rule.get('scope')):
    if not any(overlap(p,ref_path(w,env)) for w in rule['watch']):continue
    if 'when' in rule and not expr(doc,data,rule['when'],env):continue
    updates=[]
    for cmd in rule['then']:updates+=execute(doc,data,cmd,env)
    if updates:trace.append({'stage':rule['id'],'scope':env,'changed':updates});queue+=updates
 return data,trace

def constraints(doc,data):
 issues=[];obligations=[]
 for c in doc.get('constraints',[]):
  for env in frames(data,c.get('scope')):
   if 'when' in c and not expr(doc,data,c['when'],env):continue
   if c['kind']=='external':obligations.append({'id':c['id'],'scope':env,'required':c.get('requiredForSubmit',False)})
   elif not expr(doc,data,c['assert'],env):issues.append({'id':c['id'],'target':ref_path(c['issue']['target'],env)})
 return issues,obligations

def main():
 report=json.loads((ROOT/'report.json').read_text());tests=[];scenarios=[]
 def load(n):return json.loads(next((ROOT/'cases').glob(f'{n:02d}-*.json')).read_text()),json.loads((ROOT/f'fixtures/{n:02d}-valid-data.json').read_text())
 def test(name,passed,case,evidence=None):tests.append({'name':name,'pass':bool(passed),'case':case,'evidence':evidence})
 def scenario(id,title,case,before,after,trace,paths):
  def read(d,p):
   try:return get(d,p)
   except KeyError:return {'missing':True}
  scenarios.append({'id':id,'title':title,'case':case,'trace':trace,'changes':[{'path':p,'before':read(before,p),'after':read(after,p)} for p in paths]})
 for n,path,new,target in [(1,'/name','Lin','/name'),(2,'/order/country','SG','/order/city'),(3,'/teams/0/members/1/address/country','US','/teams/0/members/1/address/city'),(4,'/insureds/0/country','SG','/insureds/0/city'),(5,'/policies/0/travellers/0/claims/0/incidentCountry','SG','/policies/0/travellers/0/claims/0/incidentCity')]:
  d,b=load(n);after,t=cascade(d,b,{'op':'set','target':{'source':'data','path':path},'value':new})
  test(f'{n:02d} 图例操作结果',get(after,target)==('Lin' if n==1 else None),n,t)
  scenario(f'case-{n}-change','示例：修改绑定字段后查看影响',n,b,after,t,[path] if path==target else [path,target])
 d,b=load(6)
 setc=lambda p,v:{'op':'set','target':{'source':'data','path':p},'value':v}
 after,t=cascade(d,b,setc('/cart/lines/0/quantity',3))
 test('行金额 → 集合汇总 → 折扣 → 应付四级传播',get(after,'/cart/payable')==315 and get(after,'/cart/lines/1/subtotal')==50,6,t)
 scenario('pricing','修改第一行数量 2 → 3',6,b,after,t,['/cart/lines/0/subtotal','/cart/lines/1/subtotal','/cart/total','/cart/discount','/cart/payable'])
 after,t=cascade(d,b,setc('/cart/country','B'));test('国家 → 城市 → 区县两级清空',after['cart']['city'] is None and after['cart']['district'] is None,6,t);scenario('address','修改国家 A → B',6,b,after,t,['/cart/country','/cart/city','/cart/district','/cart/lines/0/subtotal'])
 after,t=cascade(d,b,setc('/cart/discountEnabled',False));test('仅 when 依赖变化不触发 Reaction',after['cart']['discount']==25 and len(t)==1,6,t);scenario('when-only','只改 discountEnabled，未命中 watch',6,b,after,t,['/cart/discountEnabled','/cart/discount','/cart/payable'])
 no=copy.deepcopy(b);no['cart']['discountEnabled']=False;after,t=cascade(d,no,setc('/cart/campaign','vip'));test('watch 命中但 when=false 不执行',len(t)==1,6,t)
 changed=copy.deepcopy(b);changed['cart']['discount']=0;after,t=cascade(d,changed,setc('/cart/campaign','vip'));test('多 watch 为 OR，then 有序后写覆盖',after['cart']['discount']==25 and any(x['stage']=='campaign-discount' for x in t),6,t)
 after,t=cascade(d,b,setc('/cart/lines/0/unitPrice',120));test('Host 回写 Command 继续同步联动',after['cart']['payable']==261,6,t);scenario('host-return','Host 报价返回 unitPrice=120，显式 Command 回填',6,b,after,[{'stage':'Host 请求/响应（测试输入）','changed':[]},*t],['/cart/lines/0/unitPrice','/cart/total','/cart/payable'])
 d,b=load(7);baseissues,obs=constraints(d,b);test('日期样本内部通过，必需1/可选2外部义务',not baseissues and sum(x['required'] for x in obs)==1 and len(obs)==3,7,obs)
 after=copy.deepcopy(b);after['trip']['startDate']='2025-11-01';issues,_=constraints(d,after);test('出行日期变更重算生日资格',any(x['id']=='age-on-departure' for x in issues),7,issues)
 scenario('departure','出行日期提前至 2025-11-01；地区 B 年份差不足',7,b,after,[{'stage':'Constraint 重新求值，未写生日','changed':['/trip/startDate']},{'stage':'Issue: age-on-departure','changed':['/travellers/1/birthDate']}],['/trip/startDate','/travellers/1/birthDate'])
 after=copy.deepcopy(b);after['travellers'][1]['region']='demo-A';issues,_=constraints(d,after);test('同一生日因地区切换变为不满足已满周岁',any(x['target']=='/travellers/1/birthDate' for x in issues),7,issues)
 scenario('region','第二位旅客 demo-B → demo-A；保持生日不变',7,b,after,[{'stage':'纯年龄 Pure Function → Constraint Issue','changed':['/travellers/1/region']}],['/travellers/1/region','/travellers/1/birthDate'])
 after=copy.deepcopy(b);after['trip']['endDate']='2026-01-01';issues,_=constraints(d,after);test('日期范围跨字段约束拒绝',any(x['id']=='travel-period' for x in issues),7,issues)
 try:expr(d,b,{'op':'demo.ageEligible.v1','args':['invalid','2026-11-01','demo-A',18]});ok=False
 except ValueError:ok=True
 test('日期求值错误保持错误，不冒充 false/valid',ok,7)
 d,b=load(8);node=d['views']['default']['slots']['default'];cmd=node[2]['on']['activate']['command'];after,t=cascade(d,b,cmd)
 test('浅 Patch 替换嵌套对象，不做深合并','keep' not in after['prefs']['nested'],8)
 test('Remove 删除属性，与 null 不同','alias' not in after['profile'] and b['profile']['alias'] is None,8)
 test('batch 有序命令和 $literal 原样保留',after['literalBox']=={'$expr':{'op':'this-is-data','args':[]}},8)
 scenario('batch','执行 Patch → Remove → Literal 三条命令',8,b,after,t,['/prefs/nested','/profile/alias','/literalBox'])
 command=node[1]['on']['confirm']['command'];after,t=cascade(d,b,command,{'name':'Lin'});test('Event Payload 进入受控 Command',after['profile']['name']=='Lin',8,t);scenario('event-command','confirm{name:Lin} → set profile.name',8,b,after,t,['/profile/name'])
 payload=value(d,b,node[1]['on']['request']['payload'],event={'query':'Ada'});test('host.emit 组合 Event 与 Data 的 Payload',payload=={'query':'Ada','name':'Ada'},8,payload)
 props=value(d,b,node[1]['props']);test('Context 只读远程选项示例',props['options']==['Ada','Lin'],8,props)
 v=value(d,b,node[3]['props']['sample']);test('空根/空字段名/~1/~0/嵌套数组 ValueSpec/Literal',v['emptyKey']=='empty-name-key' and v['escaped']=='escaped-value' and v['rootSnapshot']==b and v['rows'][1]=={'$expr':'保留原样'} and v['literalAst']=={'op':'not-a-pure-function'},8)
 after=copy.deepcopy(b);execute(d,after,{'op':'array.remove','target':{'source':'data','path':'/items'},'item':{'$scope':'item'}},{'item':'/items/0'});test('ScopeHandle 指定当前项删除',after['items']==[{'label':'Beta'}],8)
 for op in ['array.insert','array.move']:
  cmd={'op':op,'target':{'source':'data','path':'/items'},'value':{'label':'new'}} if op.endswith('insert') else {'op':op,'target':{'source':'data','path':'/items'},'item':{'$scope':'item'}}
  try:execute(d,copy.deepcopy(b),cmd,{'item':'/items/0'});ok=False
  except NotImplementedError:ok=True
  test(op+' 位置语义未定，抽测器明确拒绝执行',ok,8)
 for n in range(1,9):
  d,b=load(n);issues,obs=constraints(d,b);test(f'{n:02d} 有效样本内部约束通过',not issues,n,{'externalInstances':len(obs)})
 report['extendedSmoke']={'tests':tests,'summary':{'total':len(tests),'passed':sum(x['pass'] for x in tests)},'scenarios':scenarios,'limitations':'Bounded FIFO reference harness: not production L3, no atomic rollback, stable handles across reorder/replacement, asynchronous races, actual renderer or HTTP submission.'}
 (ROOT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print(report['extendedSmoke']['summary'])
 for x in tests:
  if not x['pass']:print('FAILED',x)
 assert all(x['pass'] for x in tests)
if __name__=='__main__':main()
