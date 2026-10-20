import json,re
from pathlib import Path
P=Path(__file__).resolve().parent
def write(rel,o):
 f=P/rel; f.parent.mkdir(parents=True,exist_ok=True);f.write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n');return f

def R(path,scope=None):
 x={'source':'data','path':path}
 if scope:x['scope']=scope
 return x
def ER(path,scope=None):return {'ref':R(path,scope)}
def OP(op,*args):return {'op':op,'args':list(args)}
def E(expr):return {'$expr':expr}
def B(from_,name,mode='each'):return {'from':from_,'as':name,'mode':mode}
def N(mat,bind=None,props=None,slots=None,on=None):
 x={'material':mat}
 if bind is not None:x['bindings']={k:R(v) if isinstance(v,str) else v for k,v in bind.items()}
 if props:x['props']=props
 if slots:x['slots']=slots
 if on:x['on']=on
 return x
def S(b,node):return {'scope':b,'node':node}
def USE(name,params=None):
 x={'$use':name}
 if params is not None:x['with']=params
 return x
def CINT(id,cond,target,scope=None,when=None):
 x={'id':id,'kind':'internal','assert':cond,'issue':{'target':target,'code':id.upper().replace('-','_')}}
 if scope:x['scope']=scope
 if when:x['when']=when
 return x
def CEXT(id,watch,target,scope=None,req=True,when=None):
 x={'id':id,'kind':'external','watch':watch,'target':target,'requiredForSubmit':req}
 if scope:x['scope']=scope
 if when:x['when']=when
 return x
def REAC(id,watch,then,scope=None,when=None):
 x={'id':id,'watch':watch,'then':then}
 if scope:x['scope']=scope
 if when:x['when']=when
 return x
def submit(ev):return N('button',props={'label':'提交'},on={'activate':{'type':'host.emit','event':ev}})
def DF(id,schema,view,constraints=None,reactions=None,templates=None,metadata=None,expressions=None):
 x={'protocolVersion':'1.0','id':id,'version':'1.0.0','data':{'schema':schema}}
 if expressions:x['expressions']=expressions
 if constraints:x['constraints']=constraints
 if reactions:x['reactions']=reactions
 x['views']=view
 if templates:x['viewTemplates']=templates
 if metadata:x['metadata']=metadata
 return x

def inp(label,path,mat='text-input'):
 return N(mat,{'value':path},props={'label':label})
# 01 基础
schema1={'type':'object','additionalProperties':False,'required':['name','email','age'],'properties':{'name':{'type':'string','minLength':1},'email':{'type':'string','format':'email'},'age':{'type':'integer','minimum':18},'notes':{'type':'string'}}}
case1=DF('basic-enrollment',schema1,{'default':N('stack',slots={'default':[inp('姓名','/name'),inp('邮箱','/email'),inp('年龄','/age','number-input'),submit('basic.submitRequested')]})},metadata={'tier':'01','scenario':'基础信息表单','testValue':'仅 Data + Material + Binding'})
write('cases/01-basic.json',case1)
# 02 规则及动态 Props
schema2={'type':'object','required':['order'],'properties':{'order':{'type':'object','required':['country','quantity','unitPrice','type'],'properties':{'country':{'type':'string'},'city':{'type':['string','null']},'type':{'type':'string','enum':['standard','premium']},'quantity':{'type':'integer','minimum':1},'unitPrice':{'type':'number','minimum':0}}}}}
order=N('stack',slots={'default':[
 inp('国家','/order/country','country-picker'),inp('城市','/order/city','city-picker'),inp('商品类型','/order/type','select'),inp('购买数量','/order/quantity','number-input'),inp('单价','/order/unitPrice','number-input'),
 N('summary-card',props={'title':'订单摘要','total':E(OP('mul',ER('/order/quantity'),ER('/order/unitPrice'))),'badge':{'visible':E(OP('eq',ER('/order/type'),'premium')),'text':'尊享'}}), submit('order.submitRequested')]})
case2=DF('order-live-pricing',schema2,{'default':order},constraints=[CINT('positive-quantity',OP('gt',ER('/order/quantity'),0),R('/order/quantity'))],reactions=[REAC('reset-city',[R('/order/country')],[{'op':'set','target':R('/order/city'),'value':None}])],metadata={'tier':'02','scenario':'订单联动与动态摘要','testValue':'Expression + Reaction + Constraint + nested ValueSpec'})
write('cases/02-order.json',case2)
# 03 嵌套集合
memberSchema={'type':'object','required':['name','age','passport','address'],'properties':{'name':{'type':'string'},'age':{'type':'integer'},'passport':{'type':'string'},'address':{'type':'object','properties':{'country':{'type':'string'},'city':{'type':['string','null']}}}}}
teamSchema={'type':'object','properties':{'title':{'type':'string'},'members':{'type':'array','items':{'$ref':'#/$defs/Member'},'minItems':1}},'required':['title','members']}
schema3={'type':'object','required':['teams'],'properties':{'teams':{'type':'array','minItems':1,'items':{'$ref':'#/$defs/Team'}}},'$defs':{'Team':teamSchema,'Member':memberSchema}}
groupScope=B(R('/teams'),'team');memberScope=B(R('/members','team'),'member')
memberFields={'params':{'member':{'schemaRef':'#/$defs/Member'}},'node':N('section',props={'title':'成员'},slots={'default':[inp('姓名',R('/name','member')),inp('年龄',R('/age','member'),'number-input'),inp('护照',R('/passport','member')),inp('国家',R('/address/country','member'),'country-picker'),inp('城市',R('/address/city','member'),'city-picker')]})}
teamTree=N('stack',slots={'default':[
 S(groupScope,N('section',props={'title':E(ER('/title','team'))},slots={'default':[
 S(memberScope,N('stack',slots={'default':[
 USE('member-fields',{'member':R('','member')}),
 N('button',props={'label':'移除成员'},on={'activate':{'type':'form.command','command':{'op':'array.remove','target':R('/members','team'),'item':{'$scope':'member'}}}})]}))]})),submit('team.submitRequested')]})
scopes3=[groupScope,memberScope]
case3=DF('team-members-nested',schema3,{'default':teamTree},constraints=[CINT('member-adult',OP('gte',ER('/age','member'),18),R('/age','member'),scopes3),CEXT('passport-screen',[R('/passport','member'),R('/address/country','member')],R('/passport','member'),scopes3)],reactions=[REAC('member-country-reset',[R('/address/country','member')],[{'op':'set','target':R('/address/city','member'),'value':None}],scopes3)],templates={'member-fields':memberFields},metadata={'tier':'03','scenario':'多层嵌套数组与模板类型','testValue':'Scope 链 + Typed Template Params + scoped Command/Constraint'})
write('cases/03-nested.json',case3)
# 04 直接读取设计正文；生成的 HTML 不再参与样本构建。
source=(P.parent/'design/l1/07-examples.md').read_text(encoding='utf-8')
sample=source.split('{#sample}',1)[1].split('\n## ',1)[0]
blocks=re.findall(r'^```json\n(.*?)\n```',sample,re.MULTILINE|re.DOTALL)
if len(blocks)!=1:raise ValueError('The #sample section must contain exactly one JSON code block')
base=json.loads(blocks[0])
write('cases/04-insurance-archive.json',base)
# 05 复杂理赔：3层 scope, 多 profile, shared template, cross-scope constraints, external validators
Claim={'type':'object','required':['type','amount','incidentCountry','incidentCity','documents'],'properties':{'type':{'type':'string','enum':['medical','baggage']},'amount':{'type':'number','minimum':0},'incidentCountry':{'type':'string'},'incidentCity':{'type':['string','null']},'documents':{'type':'array','items':{'type':'string'}}}}
Traveller={'type':'object','required':['name','passport','claims'],'properties':{'name':{'type':'string'},'passport':{'type':'string'},'claims':{'type':'array','items':{'$ref':'#/$defs/Claim'}}}}
Policy={'type':'object','required':['policyNo','maxClaim','travellers'],'properties':{'policyNo':{'type':'string'},'maxClaim':{'type':'number','minimum':0},'travellers':{'type':'array','items':{'$ref':'#/$defs/Traveller'}}}}
schema5={'type':'object','required':['applicant','policies'],'properties':{'applicant':{'type':'object','required':['email'],'properties':{'email':{'type':'string'}}},'policies':{'type':'array','items':{'$ref':'#/$defs/Policy'},'minItems':1}},'$defs':{'Policy':Policy,'Traveller':Traveller,'Claim':Claim}}
ps=B(R('/policies'),'policy');ts=B(R('/travellers','policy'),'traveller');cs=B(R('/claims','traveller'),'claim');allScopes=[ps,ts,cs]
claimFields={'params':{'claim':{'schemaRef':'#/$defs/Claim'}},'node':N('section',props={'title':'理赔明细'},slots={'default':[
 inp('理赔类型',R('/type','claim'),'select'),inp('金额',R('/amount','claim'),'number-input'),inp('事发国家',R('/incidentCountry','claim'),'country-picker'),inp('事发城市',R('/incidentCity','claim'),'city-picker'),inp('凭证',R('/documents','claim'),'file-upload')
 ]})}
claimRemove=N('button',props={'label':'删除理赔项'},on={'activate':{'type':'form.command','command':{'op':'array.remove','target':R('/claims','traveller'),'item':{'$scope':'claim'}}}})
claimDetailed=S(cs,N('stack',slots={'default':[USE('claim-fields',{'claim':R('','claim')}),claimRemove]}))
claimMobile=S(cs,N('bottom-sheet-editor',slots={'trigger':[N('claim-summary',{'value':R('','claim')})],'content':[USE('claim-fields',{'claim':R('','claim')}),claimRemove]}))
def policyTree(mobile=False):
 return N('stack',slots={'default':[
 inp('申请人邮箱',R('/applicant/email')),
 S(ps,N('section',props={'title':E(ER('/policyNo','policy'))},slots={'default':[
 S(ts,N('section',props={'title':E(ER('/name','traveller'))},slots={'default':[claimMobile if mobile else claimDetailed]}))
 ]})),submit('claim.submitRequested')]})
case5=DF('travel-claim-complex',schema5,{'desktop':policyTree(False),'mobile':policyTree(True)},templates={'claim-fields':claimFields},constraints=[
 CINT('claim-under-limit',OP('lte',ER('/amount','claim'),ER('/maxClaim','policy')),R('/amount','claim'),allScopes),
 CINT('medical-documents',OP('gt',OP('length',ER('/documents','claim')),0),R('/documents','claim'),allScopes,OP('eq',ER('/type','claim'),'medical')),
 CEXT('fraud-screening',[R('/passport','traveller'),R('/amount','claim'),R('/incidentCountry','claim')],R('/amount','claim'),allScopes)
],reactions=[REAC('reset-incident-city',[R('/incidentCountry','claim')],[{'op':'set','target':R('/incidentCity','claim'),'value':None}],allScopes)],metadata={'tier':'05','scenario':'三层嵌套、双端容器与理赔校验','testValue':'cross-parent scope + conditional constraint + multi-profile + external'})
write('cases/05-claims-complex.json',case5)
# Materials manifests based on capabilities, not Form Definition. Simple reproducible fixtures.
ms={
 'stack':{'bindings':{},'slots':{'default':{'cardinality':'many'}},'events':{},'propsSchema':{'type':'object','additionalProperties':False}},
 'section':{'bindings':{},'slots':{'default':{'cardinality':'many'}},'events':{},'propsSchema':{'type':'object','properties':{'title':{'type':'string'}},'additionalProperties':False}},
 'text-input':{'bindings':{'value':{'type':'string','required':True}},'slots':{},'events':{},'propsSchema':{'type':'object','properties':{'label':{'type':'string'}},'additionalProperties':False}},
 'number-input':{'bindings':{'value':{'type':'number','required':True}},'slots':{},'events':{},'propsSchema':{'type':'object','properties':{'label':{'type':'string'}},'additionalProperties':False}},
 'country-picker':{'bindings':{'value':{'type':'string','required':True}},'slots':{},'events':{},'propsSchema':{'type':'object','properties':{'label':{'type':'string'}},'additionalProperties':False}},
 'city-picker':{'bindings':{'value':{'type':['string','null'],'required':True}},'slots':{},'events':{},'propsSchema':{'type':'object','properties':{'label':{'type':'string'}},'additionalProperties':False}},
 'select':{'bindings':{'value':{'type':'string','required':True}},'slots':{},'events':{},'propsSchema':{'type':'object','properties':{'label':{'type':'string'}},'additionalProperties':False}},
 'button':{'bindings':{},'slots':{},'events':{'activate':{}},'propsSchema':{'type':'object','properties':{'label':{'type':'string'}},'required':['label'],'additionalProperties':False}},
 'summary-card':{'bindings':{},'slots':{},'events':{},'propsSchema':{'type':'object','properties':{'title':{'type':'string'},'total':{'type':'number'},'badge':{'type':'object','properties':{'visible':{'type':'boolean'},'text':{'type':'string'}}}},'additionalProperties':False}},
 'applicant-summary':{'bindings':{'value':{'type':'object','required':True}},'slots':{},'events':{},'propsSchema':{'type':'object','additionalProperties':False}},
 'insured-summary':{'bindings':{'value':{'type':'object','required':True}},'slots':{},'events':{},'propsSchema':{'type':'object','additionalProperties':False}},
 'claim-summary':{'bindings':{'value':{'type':'object','required':True}},'slots':{},'events':{},'propsSchema':{'type':'object','additionalProperties':False}},
 'bottom-sheet-editor':{'bindings':{},'slots':{'trigger':{'cardinality':'one'},'content':{'cardinality':'many'}},'events':{},'propsSchema':{'type':'object','additionalProperties':False}},
 'file-upload':{'bindings':{'value':{'type':'array','required':True}},'slots':{},'events':{},'propsSchema':{'type':'object','properties':{'label':{'type':'string'}},'additionalProperties':False}}
}
write('manifests/materials.json',{k:{'id':k,'version':'1.0.0',**v} for k,v in ms.items()})
write('manifests/host-events.json',{'allowedEvents':['basic.submitRequested','order.submitRequested','team.submitRequested','insurance.submitRequested','claim.submitRequested']})
# Data samples: illustrate schema and external validation obligation, not actual runtime.
fx=[
 {'name':'Alice','email':'alice@example.com','age':28},
 {'order':{'country':'Japan','city':'Tokyo','type':'premium','quantity':2,'unitPrice':120}},
 {'teams':[{'title':'第一团','members':[{'name':'A','age':28,'passport':'P123','address':{'country':'JP','city':'Tokyo'}},{'name':'B','age':19,'passport':'P456','address':{'country':'SG','city':'Singapore'}}]}]},
 {'applicant':{'name':'Alice','phone':'13812345678'},'insureds':[{'name':'A','age':30,'country':'JP','city':'Tokyo','idNumber':'ID-A'}],'plan':'basic'},
 {'applicant':{'email':'user@example.com'},'policies':[{'policyNo':'POL-1','maxClaim':5000,'travellers':[{'name':'A','passport':'P123','claims':[{'type':'medical','amount':1200,'incidentCountry':'JP','incidentCity':'Tokyo','documents':['receipt-1']},{'type':'baggage','amount':100,'incidentCountry':'SG','incidentCity':'Singapore','documents':[]}]}]}]}
]
for i,o in enumerate(fx,1):write(f'fixtures/{i:02d}-valid-data.json',o)

# Enhanced complexity: dynamic visibility via Container Material, compound ports, named root Expression.
case2['expressions']={'orderTotal':OP('mul',ER('/order/quantity'),ER('/order/unitPrice'))}
case2['views']['default']['slots']['default'][-2]['props']['total']=E({'use':'orderTotal'})
write('cases/02-order.json',case2)
for d in [Policy,]:
 d['properties']['travelStart']={'type':'string','format':'date'}
 d['properties']['travelEnd']={'type':'string','format':'date'}
 d['required'].extend(['travelStart','travelEnd'])
# A registered composite material rather than a new L1 concept.
for mobile in [False,True]:
 tree=case5['views']['mobile' if mobile else 'desktop']
 section=tree['slots']['default'][1]['node']
 section['slots']['default'].insert(0,N('date-range',{'start':R('/travelStart','policy'),'end':R('/travelEnd','policy')},props={'label':'保障期间'}))
claim_fields=case5['viewTemplates']['claim-fields']['node']['slots']['default']
last=claim_fields.pop()
claim_fields.append(N('conditional',props={'show':E(OP('eq',ER('/type','claim'),'medical'))},slots={'default':[last]}))
write('cases/05-claims-complex.json',case5)
ms['date-range']={'bindings':{'start':{'type':'string','required':True},'end':{'type':'string','required':True}},'slots':{},'events':{},'propsSchema':{'type':'object','properties':{'label':{'type':'string'}},'additionalProperties':False}}
ms['conditional']={'bindings':{},'slots':{'default':{'cardinality':'many'}},'events':{},'propsSchema':{'type':'object','properties':{'show':{'type':'boolean'}},'required':['show'],'additionalProperties':False}}
write('manifests/materials.json',{k:{'id':k,'version':'1.0.0',**v} for k,v in ms.items()})
fx[-1]['policies'][0]['travelStart']='2026-11-01'
fx[-1]['policies'][0]['travelEnd']='2026-11-20'
write('fixtures/05-valid-data.json',fx[-1])

print('wrote five cases, manifests, five samples')
