#!/usr/bin/env python3
"""L1 Canonical candidate static verifier: executable, deliberately NOT a Form Runtime.
Structural JSON Schema + lexical/reference/schema/material/pure function checks + sample data.
"""
import copy,json,sys
from collections import Counter
from pathlib import Path
from jsonschema import Draft202012Validator,FormatChecker
ROOT=Path(__file__).resolve().parent.parent
SCHEMA=json.loads((ROOT/'validator/l1-candidate-structural.schema.json').read_text())
MATS=json.loads((ROOT/'manifests/materials.json').read_text())
HOST_CONTRACT=json.loads((ROOT/'manifests/host-events.json').read_text())
HOSTS=set(HOST_CONTRACT['allowedEvents'])
CONTEXT=json.loads((ROOT/'manifests/context.json').read_text())['schema']
def R(path,scope=None):
 return {'source':'data','path':path, **({'scope':scope} if scope else {})}
def ER(path,scope=None):return {'ref':R(path,scope)}
PURE_FUNCTION_ARITY={'eq':2,'gt':2,'gte':2,'lt':2,'lte':2,'mul':2,'length':1,'and':-2,'or':-2,'not':1,'add':-2,'sub':2}
PURE_FUNCTION_ARITY.update({'demo.sumSubtotals.v1':1,'demo.dateOrdered.v1':2,'demo.ageEligible.v1':4})
PURE_FUNCTION_RESULT={'eq':'boolean','gt':'boolean','gte':'boolean','lt':'boolean','lte':'boolean','and':'boolean','or':'boolean','not':'boolean','mul':'number','add':'number','sub':'number','length':'integer'}

PURE_FUNCTION_RESULT.update({'demo.sumSubtotals.v1':'number','demo.dateOrdered.v1':'boolean','demo.ageEligible.v1':'boolean'})

def getref(schema,ptr):
 if not isinstance(ptr,str) or not ptr.startswith('#/'):
  raise ValueError(f'schemaRef 无效: {ptr}')
 out=schema
 for seg in ptr[2:].split('/'):
  seg=seg.replace('~1','/').replace('~0','~')
  if isinstance(out,dict) and seg in out:out=out[seg]
  else:raise ValueError(f'找不到 Schema 节点 {ptr}')
 return out

def deref(schema,root):
 count=0
 while isinstance(schema,dict) and '$ref' in schema:
  schema=getref(root,schema['$ref']);count+=1
  if count>15:raise ValueError('循环 SchemaRef 未被当前检查器支持')
 return schema

def ptrsegments(path):
 if path=='':return []
 if not isinstance(path,str) or not path.startswith('/'):raise ValueError('无效 JSON Pointer')
 parts=path[1:].split('/')
 for p in parts:
  k=0
  while k<len(p):
   if p[k]=='~' and (k==len(p)-1 or p[k+1] not in '01'):raise ValueError('JSON Pointer escape 无效')
   k+=2 if p[k]=='~' else 1
 return [p.replace('~1','/').replace('~0','~') for p in parts]

def walk_schema(src,ptr,root):
 s=deref(src,root)
 for seg in ptrsegments(ptr):
  s=deref(s,root)
  if not isinstance(s,dict):raise ValueError(f'路径 {ptr} 无法静态确定')
  if s.get('type')=='object' or 'properties' in s:
   if seg in s.get('properties',{}):s=s['properties'][seg]
   else:raise ValueError(f'属性 {seg!r} 不在 Schema 中（{ptr}）')
  elif s.get('type')=='array':
   if not seg.isdigit():raise ValueError(f'数组索引非法 {seg!r}')
   s=s['items']
  else:raise ValueError(f'无法继续访问 {seg!r}（{ptr}）')
 return deref(s,root)

def tp(s,root):
 s=deref(s,root)
 t=s.get('type') if isinstance(s,dict) else None
 if t is None:return {'unknown'}
 return set(t) if isinstance(t,list) else {t}

def compatible(actual,expected):
 if expected is None:return True
 if not isinstance(expected,list):expected=[expected]
 return all(a in expected or (a=='integer' and 'number' in expected) for a in actual if a!='unknown')

class Checker:
 def __init__(self,doc):
  self.d=doc;self.data=doc['data']['schema'];self.errors=[];self.stats=Counter();self.template_stack=[]
 def fail(self,where,msg):self.errors.append({'at':where,'reason':str(msg)})
 def guard(self,where,fn):
  try:return fn()
  except (ValueError,KeyError,TypeError,IndexError,RecursionError) as ex:
   self.fail(where,str(ex));return None
 def ref(self,r,env,where,allow_nondata=False):
  if isinstance(r,str):raise ValueError('Canonical Data Reference 不能使用字符串简写')
  if not isinstance(r,dict):raise ValueError('必须是 Reference 对象')
  if r.get('source')!='data':
   if allow_nondata and r.get('source') in ['context','event']:
    root=CONTEXT if r['source']=='context' else getattr(self,'event_schema',None)
    if root is None:raise ValueError('当前事件没有 Payload 契约')
    return walk_schema(root,r.get('path',''),root)
   raise ValueError('此处只能引用 Form Data')
  root=env.get(r.get('scope')) if r.get('scope') else self.data
  if root is None:raise ValueError('未定义或不可见 Scope: '+str(r.get('scope')))
  return walk_schema(root,r.get('path',''),self.data)
 def bind(self,decl,env,where):
  nextenv=env.copy()
  for b in decl if isinstance(decl,list) else [decl]:
   schema=self.guard(where+'/from',lambda b=b:self.ref(b['from'],nextenv,where))
   if schema is None:continue
   t=tp(schema,self.data)
   mode=b.get('mode','one');alias=b['as']
   if alias in nextenv:self.fail(where,f'Scope 别名遮蔽或重名: {alias}')
   if mode=='each':
    if 'array' not in t:self.fail(where, f'each 必须作用于数组，实际 {t}')
    elif 'items' in schema:schema=deref(schema['items'],self.data)
   elif 'array' in t:self.fail(where,'one 不能隐式遍历集合')
   nextenv[alias]=schema
   self.stats['scopeBinder']+=1
  return nextenv
 def exp(self,e,env,where,allowed_event=False,seen=None):
  self.stats['expressionNodes']+=1
  if isinstance(e,(str,int,float,bool)) or e is None:
   return {'null' if e is None else ('boolean' if isinstance(e,bool) else 'integer' if isinstance(e,int) else 'number' if isinstance(e,float) else 'string')}
  if not isinstance(e,dict):self.fail(where,'Expression AST 无效');return {'unknown'}
  if 'literal' in e:
   v=e['literal'];return {'null' if v is None else 'array' if isinstance(v,list) else 'object' if isinstance(v,dict) else 'boolean' if isinstance(v,bool) else 'integer' if isinstance(v,int) else 'number' if isinstance(v,float) else 'string'}
  if 'ref' in e:
   r=e['ref']
   if r.get('source')=='event' and not allowed_event:self.fail(where,'Event Reference 只能出现在 Material Interaction 内')
   s=self.guard(where+'/ref',lambda:self.ref(r,env,where,True));return tp(s,self.data) if s is not None else {'unknown'}
  if 'use' in e:
   name=e['use'];expr=self.d.get('expressions',{}).get(name)
   if expr is None:self.fail(where,f'不存在的命名表达式: {name}');return {'unknown'}
   seen=seen or set()
   if name in seen:self.fail(where,'命名 Expression 循环依赖: '+name);return {'unknown'}
   # Named Expression evaluates in ROOT lexical environment; it cannot capture caller scopes.
   return self.exp(expr,{},where+'/use/'+name,False,seen|{name})
  if 'op' in e:
   op=e['op'];args=e['args']
   if op not in PURE_FUNCTION_ARITY:self.fail(where,f'未注册 Pure Function: {op}')
   else:
    ar=PURE_FUNCTION_ARITY[op]
    if (ar>=0 and len(args)!=ar) or (ar<0 and len(args)<-ar):self.fail(where,f'Pure Function {op} arity 错误')
   ats=[self.exp(v,env,where+f'/args/{i}',allowed_event,seen) for i,v in enumerate(args)]
   if op=='length' and ats and not (ats[0]&{'array','string','unknown'}):self.fail(where,'length 仅适用于数组或字符串')
   if op in ('mul','add','sub','gt','gte','lt','lte'):
    for i,a in enumerate(ats):
     if a and not (a&{'number','integer','unknown'}):self.fail(where+f'/args/{i}',f'{op} 需要数值')
   expected={'demo.sumSubtotals.v1':[{'array'}],'demo.dateOrdered.v1':[{'string'},{'string'}],'demo.ageEligible.v1':[{'string'},{'string'},{'string'},{'integer','number'}]}.get(op)
   if expected:
    for i,(actual,want) in enumerate(zip(ats,expected)):
     if not actual & (want|{'unknown'}):self.fail(where+f'/args/{i}','测试领域纯函数参数类型不匹配')
   return {PURE_FUNCTION_RESULT.get(op,'unknown')}
  self.fail(where,'无法识别 Expression AST');return {'unknown'}
 def valuespec(self,v,env,where,allow_event=False):
  if isinstance(v,dict):
   if '$expr' in v:
    if set(v)!={'$expr'}:self.fail(where,'$expr 保留包装对象不能包含其他属性')
    return self.exp(v['$expr'],env,where,allow_event)
   if '$literal' in v:
    if set(v)!={'$literal'}:self.fail(where,'$literal 保留包装对象不能包含其他属性')
    return {'unknown'}
   if '$scope' in v:self.fail(where,'ScopeHandle 不能放在普通 ValueSpec 中')
   for k,val in v.items():self.valuespec(val,env,where+'/'+k,allow_event)
   return {'object'}
  if isinstance(v,list):
   for i,x in enumerate(v):self.valuespec(x,env,where+f'/{i}',allow_event)
   return {'array'}
  return {'null' if v is None else 'boolean' if isinstance(v,bool) else 'integer' if isinstance(v,int) else 'number' if isinstance(v,float) else 'string'}
 def command(self,c,env,where,allow_event=False):
  self.stats['commands']+=1;op=c['op']
  if op=='batch':
   for i,v in enumerate(c['commands']):self.command(v,env,where+f'/commands/{i}',allow_event)
   return
  s=self.guard(where+'/target',lambda:self.ref(c['target'],env,where))
  if op.startswith('array.'):
   if s is not None and 'array' not in tp(s,self.data):self.fail(where,'ArrayCommand 目标不是数组')
  if op in ('array.remove','array.move'):
   name=c['item']['$scope']; item=env.get(name)
   if item is None:self.fail(where,'命令引用不可见的 ScopeHandle: '+name)
   elif s is not None and 'array' in tp(s,self.data):
    item_target=deref(s.get('items',{}),self.data)
    if deref(item,self.data)!=item_target:self.fail(where,'ScopeHandle 与目标数组项 Schema 不匹配')
  if op in ('set','patch','array.insert'):
   out=self.valuespec(c['value'],env,where+'/value',allow_event)
   if op=='patch' and s is not None and 'object' not in tp(s,self.data):self.fail(where,'patch 目标必须是对象')
   if op=='set' and s is not None and not compatible(out,s.get('type')):self.fail(where,'Command 值类型与目标不匹配')
 def constraint(self,c,where):
  env=self.bind(c['scope'],{},where+'/scope') if c.get('scope') else {}
  if 'when' in c:
   tt=self.exp(c['when'],env,where+'/when')
   if 'boolean' not in tt and 'unknown' not in tt:self.fail(where,'Constraint.when 必须为布尔 Expression')
  if c['kind']=='internal':
   tt=self.exp(c['assert'],env,where+'/assert')
   if 'boolean' not in tt and 'unknown' not in tt:self.fail(where,'Constraint.assert 必须为布尔 Expression')
   self.guard(where+'/issue/target',lambda:self.ref(c['issue']['target'],env,where))
  else:
   for i,r in enumerate(c['watch']):self.guard(where+f'/watch/{i}',lambda r=r:self.ref(r,env,where))
   self.guard(where+'/target',lambda:self.ref(c['target'],env,where))
  self.stats['constraints']+=1
 def reaction(self,c,where):
  env=self.bind(c['scope'],{},where+'/scope') if c.get('scope') else {}
  for i,r in enumerate(c['watch']):self.guard(where+f'/watch/{i}',lambda r=r:self.ref(r,env,where))
  if 'when' in c:
   tt=self.exp(c['when'],env,where+'/when')
   if 'boolean' not in tt and 'unknown' not in tt:self.fail(where,'Reaction.when 必须为布尔 Expression')
  for i,x in enumerate(c['then']):self.command(x,env,where+f'/then/{i}')
  self.stats['reactions']+=1
 def props_check(self,props,manifest,env,where):
  ps=manifest.get('propsSchema',{})
  properties=ps.get('properties',{})
  for key,v in props.items():
   st=properties.get(key)
   if st is None and ps.get('additionalProperties') is False:self.fail(where+'/'+key,'物料 Props 未声明此属性')
   def walk_prop(value,schema,w):
    if not schema:
     self.valuespec(value,env,w);return
    if isinstance(value,dict) and '$expr' in value:
     t=self.valuespec(value,env,w)
     if 'unknown' not in t and not compatible(t,schema.get('type')):self.fail(w,f'动态属性表达式返回 {t}，Props 期望 {schema.get("type")}')
    elif isinstance(value,dict) and '$literal' in value:
     self.valuespec(value,env,w)
    elif isinstance(value,dict):
     for k,v in value.items():walk_prop(v,schema.get('properties',{}).get(k,{}),w+'/'+k)
    elif isinstance(value,list):
     for i,v in enumerate(value):walk_prop(v,schema.get('items',{}),w+f'/{i}')
    else:
     x=self.valuespec(value,env,w)
     if not compatible(x,schema.get('type')):self.fail(w,'静态属性类型不匹配')
   walk_prop(v,st or {},where+'/'+key)
 def view(self,node,env,where):
  self.stats['viewNodes']+=1
  if 'scope' in node:
   self.view(node['node'],self.bind(node['scope'],env,where+'/scope'),where+'/node');return
  if '$use' in node:
   key=node['$use'];self.stats['templateUses']+=1
   if key not in self.d.get('viewTemplates',{}):self.fail(where,'引用不存在的 Template: '+key);return
   if key in self.template_stack:self.fail(where,'ViewTemplate 循环依赖: '+ ' → '.join(self.template_stack+[key]));return
   template=self.d['viewTemplates'][key];decl=template.get('params',{});args=node.get('with',{})
   for p in decl:
    if p not in args:self.fail(where,'缺少 Template 参数: '+p)
   for p in args:
    if p not in decl:self.fail(where,'未知 Template 参数: '+p)
   template_env={}
   for name,info in decl.items():
    formal=self.guard(where+'/params/'+name,lambda info=info:getref(self.data,info['schemaRef']))
    if formal is None:continue
    if name in args:
     actual=self.guard(where+'/with/'+name,lambda name=name:self.ref(args[name],env,where))
     if actual is not None and deref(actual,self.data)!=deref(formal,self.data):
      self.fail(where+'/with/'+name,'Template 参数 Schema 不兼容')
    template_env[name]=deref(formal,self.data)
   self.template_stack.append(key)
   self.view(template['node'],template_env,where+'/$use:'+key)
   self.template_stack.pop();return
  mat=node.get('material'); self.stats['materialNodes']+=1
  if mat not in MATS:self.fail(where,'没有注册 Material: '+str(mat));return
  m=MATS[mat];self.props_check(node.get('props',{}),m,env,where+'/props')
  ports=m['bindings']
  for port in ports:
   if ports[port].get('required') and port not in node.get('bindings',{}):self.fail(where,'缺少必需 Binding Port: '+port)
  for k,r in node.get('bindings',{}).items():
   if k not in ports:self.fail(where,'未知 Binding Port: '+k);continue
   s=self.guard(where+'/bindings/'+k,lambda r=r:self.ref(r,env,where))
   if s is not None and not compatible(tp(s,self.data),ports[k].get('type')):
    self.fail(where+'/bindings/'+k,f'Binding 业务类型 {tp(s,self.data)} 与物料端口类型 {ports[k]["type"]} 不兼容')
   self.stats['bindings']+=1
  for slot,arr in node.get('slots',{}).items():
   if slot not in m['slots']:self.fail(where,'Material 不支持 Slot: '+slot);continue
   if m['slots'][slot]['cardinality']=='one' and len(arr)!=1:self.fail(where,'Slot '+slot+' 必须恰好一个节点')
   for i,sub in enumerate(arr):self.view(sub,env,where+f'/slots/{slot}/{i}')
  for event,intent in node.get('on',{}).items():
   self.event_schema=m['events'].get(event,{}).get('payloadSchema')
   if event not in m['events']:self.fail(where,'Material 未声明 Event: '+event)
   if intent['type']=='host.emit':
    if intent['event'] not in HOSTS:self.fail(where,'Host 未声明业务事件: '+intent['event'])
    if 'payload' in intent:
     self.valuespec(intent['payload'],env,where+'/on/'+event+'/payload',True)
     ps=HOST_CONTRACT.get('payloadSchemas',{}).get(intent['event'])
     if ps:self.payload_check(intent['payload'],ps,env,where+'/on/'+event+'/payload')
   elif intent['type']=='form.command':self.command(intent['command'],env,where+'/on/'+event+'/command',True)
   self.stats['interactions']+=1
 def payload_check(self,v,schema,env,where):
  if isinstance(v,dict) and '$expr' not in v and '$literal' not in v:
   for key in schema.get('required',[]):
    if key not in v:self.fail(where,'Host Payload 缺少 '+key)
   for key,value in v.items():
    if key not in schema.get('properties',{}) and schema.get('additionalProperties') is False:self.fail(where,'Host Payload 未声明 '+key)
    self.payload_check(value,schema.get('properties',{}).get(key,{}),env,where+'/'+key)
  else:
   t=self.valuespec(v,env,where,True)
   if not compatible(t,schema.get('type')):self.fail(where,'Host Payload 类型不兼容')
 def check(self):
  # JSON Schema validation first; prevent syntax-invalid payloads from breaking semantic traversal.
  errors=sorted(Draft202012Validator(SCHEMA).iter_errors(self.d),key=lambda e:str(list(e.path)))
  for e in errors[:25]:self.fail('/'+'/'.join(map(str,e.path)),'STRUCTURE: '+e.message[:250])
  if errors:return self.errors
  Draft202012Validator.check_schema(self.data)
  for name,e in self.d.get('expressions',{}).items():self.exp(e,{},'/expressions/'+name)
  for field in ('constraints','reactions'):
   records=self.d.get(field,[]);names=[c['id'] for c in records]
   if len(names)!=len(set(names)):self.fail('/'+field,'重复规则 ID')
   for i,c in enumerate(records):getattr(self,field[:-1])(c,'/'+field+f'/{i}')
  for k,v in self.d['views'].items():self.view(v,{},'/views/'+k)
  # Template definitions are also checked independently, including ones not currently reached by a Profile.
  for name,t in self.d.get('viewTemplates',{}).items():
   env={}
   for k,p in t.get('params',{}).items():
    s=self.guard('/viewTemplates/'+name+'/params/'+k,lambda p=p:getref(self.data,p['schemaRef']))
    if s is not None:env[k]=deref(s,self.data)
   self.template_stack=[name];self.view(t['node'],env,'/viewTemplates/'+name+'/node');self.template_stack=[]
  return self.errors

def main():
 results=[]
 for path in sorted((ROOT/'cases').glob('*.json')):
  d=json.loads(path.read_text());c=Checker(d);issues=c.check()
  sample=ROOT/'fixtures'/path.name.replace(path.name.split('-')[0]+'-','').replace('.json','') # not used
  sample=ROOT/'fixtures'/(path.name[:2]+'-valid-data.json')
  data=json.loads(sample.read_text());valueErr=[e.message for e in Draft202012Validator(d['data']['schema'],format_checker=FormatChecker()).iter_errors(data)]
  results.append({'case':path.name,'id':d['id'],'scenario':d.get('metadata',{}).get('scenario','保险投保基线'),'structuralAndSemanticPass':not issues,'dataSamplePass':not valueErr,'issues':issues,'dataIssues':valueErr,'stats':dict(c.stats),'profiles':list(d['views']),'constraints':len(d.get('constraints',[])),'externalObligations':sum(1 for x in d.get('constraints',[]) if x['kind']=='external'),'pendingSemantics':d.get('metadata',{}).get('pending',[])})
 # Negative probes, one deliberate defect each
 originals={p.name:json.loads(p.read_text()) for p in (ROOT/'cases').glob('*.json')}
 def mutate(file,fn):
  d=copy.deepcopy(originals[file]);fn(d);return d
 neg=[
 ('缺失字段引用',mutate('01-basic.json',lambda d:d['views']['default']['slots']['default'][0]['bindings']['value'].update({'path':'/ghost'}))),
 ('未知物料',mutate('01-basic.json',lambda d:d['views']['default']['slots']['default'][0].update({'material':'unknown-widget'}))),
 ('不合法的 each 绑定',mutate('03-nested.json',lambda d:d['views']['default']['slots']['default'][0]['scope'].update({'from':R('/teams/0/title')}))),
 ('Template 参数类型不兼容',mutate('03-nested.json',lambda d:d['views']['default']['slots']['default'][0]['node']['slots']['default'][0]['node']['slots']['default'][0]['with'].update({'member':R('/teams')}))),
 ('Manifest 端口类型冲突',mutate('01-basic.json',lambda d:d['views']['default']['slots']['default'][2].update({'material':'text-input'}))),
 ('未注册 Host 事件',mutate('01-basic.json',lambda d:d['views']['default']['slots']['default'][-1]['on']['activate'].update({'event':'unregistered.event'}))),
 ('禁止 view.present',mutate('01-basic.json',lambda d:d['views']['default']['slots']['default'][-1]['on']['activate'].update({'type':'view.present','target':'other'}))),
 ('作用域别名不可见',mutate('01-basic.json',lambda d:d['views']['default']['slots']['default'][0]['bindings']['value'].update({'scope':'phantom'}))),
 ('表达式非布尔断言',mutate('02-order.json',lambda d:d['constraints'][0].update({'assert':ER('/order/quantity')}))),
 ('重复 Constraint ID',mutate('05-claims-complex.json',lambda d:d['constraints'][1].update({'id':'claim-under-limit'}))),
 ('跨 Scope 读取不存在属性',mutate('05-claims-complex.json',lambda d:d['constraints'][0]['assert']['args'][1]['ref'].update({'path':'/missingLimit'})))
 ]
 neg.extend([
 ('when 不能读取 Event',mutate('06-cascade-cart.json',lambda d:d['reactions'][4].update({'when':{'ref':{'source':'event','path':'/x'}}}))),
 ('命名表达式循环',mutate('06-cascade-cart.json',lambda d:d['expressions'].update({'gross':{'use':'net'}}))),
 ('命名表达式不能捕获调用者 Scope',mutate('06-cascade-cart.json',lambda d:d['expressions'].update({'gross':ER('/subtotal','line')}))),
 ('禁止 Scope 别名遮蔽',mutate('03-nested.json',lambda d:d['reactions'][0]['scope'][1].update({'as':'team'}))),
 ('Context 只读，不能当写入目标',mutate('06-cascade-cart.json',lambda d:d['reactions'][0]['then'][0]['target'].update({'source':'context'}))),
 ('非法 Pointer 转义',mutate('01-basic.json',lambda d:d['views']['default']['slots']['default'][0]['bindings']['value'].update({'path':'/bad~2'}))),
 ('禁止动态模板 ID',mutate('04-insurance-archive.json',lambda d:d['views']['expanded'].update({'$use':{'$expr':'dynamic'}}))),
 ('保留 $expr 包装不能附带普通字段',mutate('06-cascade-cart.json',lambda d:d['views']['default']['slots']['default'][-2]['props']['total'].update({'extra':1}))),
 ('Event Payload 缺失字段',mutate('08-protocol-edges.json',lambda d:d['views']['default']['slots']['default'][1]['on']['confirm']['command']['value']['$expr']['ref'].update({'path':'/missing'}))),
 ('Host Payload 类型不符',mutate('08-protocol-edges.json',lambda d:d['views']['default']['slots']['default'][1]['on']['request']['payload'].update({'query':42}))),
 ('Context 未声明字段',mutate('08-protocol-edges.json',lambda d:d['views']['default']['slots']['default'][1]['props']['options']['$expr']['ref'].update({'path':'/missing'})))
 ])
 neg.append(('旧 entry 包装不再是 Canonical',mutate('01-basic.json',lambda d:d['views'].update({'default':{'entry':d['views']['default']}}))))
 def mutate_external(fn):
  return mutate('04-insurance-archive.json',lambda d:fn(next(c for c in d['constraints'] if c['kind']=='external')))
 neg.extend([
  ('External 旧 dependsOn 必须显式迁移',mutate_external(lambda c:c.update({'dependsOn':c.pop('watch')}))),
  ('External 不接受 watch 与 dependsOn 混用',mutate_external(lambda c:c.update({'dependsOn':copy.deepcopy(c['watch'])})))
 ])
 negResults=[]
 for title,d in neg:
  c=Checker(d);e=c.check();negResults.append({'test':title,'rejected':bool(e),'reason':e[0]['reason'] if e else None,'issues':e[:3]})
 report={'source':'../design/l1/README.md','validationScope':'candidate structural schema + static semantic resolver + JSON Schema sample validation; not full runtime/async/host tests','cases':results,'negativeTests':negResults,'summary':{'casesTotal':len(results),'casesPass':sum(bool(x['structuralAndSemanticPass'] and x['dataSamplePass']) for x in results),'negativeTotal':len(negResults),'negativeCaught':sum(x['rejected'] for x in negResults)}}
 (ROOT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(report['summary'],ensure_ascii=False))
 for r in results:print(r['case'],r['structuralAndSemanticPass'],r['dataSamplePass'],r['issues'][:4],r['dataIssues'][:3])
 for r in negResults:print('NEG',r['test'],r['rejected'],r['reason'])
 if report['summary']['casesPass']!=len(results) or report['summary']['negativeCaught']!=len(negResults):sys.exit(1)
if __name__=='__main__':main()
