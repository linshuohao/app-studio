"""Rebuild supplied 01–05, then add explicit coverage fixtures 06–08. Not a Runtime."""
from pathlib import Path
import runpy,json
P=Path(__file__).resolve().parent
ns=runpy.run_path(str(P/'build_cases.py'))
for k in ['R','ER','OP','E','B','N','S','USE','CINT','CEXT','REAC','DF','inp','write']:globals()[k]=ns[k]
def SET(path,value,scope=None):return {'op':'set','target':R(path,scope),'value':value}
def obj(props,required=None):return {'type':'object','properties':props,'required':list(props) if required is None else required,'additionalProperties':False}
def string(**kw):return {'type':'string',**kw}
def num():return {'type':'number'}
def button(label,command):return N('button',props={'label':label},on={'activate':{'type':'form.command','command':command}})
# 06 Two independent chains, item -> parent aggregation, guarded multi-watch and ordered writes.
line=obj({'sku':string(),'quantity':{'type':'integer','minimum':1},'unitPrice':num(),'subtotal':num()})
cart=obj({'country':string(),'city':{'type':['string','null']},'district':{'type':['string','null']},'lines':{'type':'array','items':{'$ref':'#/$defs/Line'}},'total':num(),'discount':num(),'payable':num(),'discountEnabled':{'type':'boolean'},'campaign':string(),'note':string()},required=['country','city','district','lines','total','discount','payable','discountEnabled','campaign'])
schema=obj({'cart':cart});schema['$defs']={'Line':line}
expressions={'gross':OP('demo.sumSubtotals.v1',ER('/cart/lines')),'net':OP('sub',{'use':'gross'},ER('/cart/discount'))}
ls=B(R('/cart/lines'),'line')
rules=[REAC('country-clears-city',[R('/cart/country')],[SET('/cart/city',None)]),REAC('city-clears-district',[R('/cart/city')],[SET('/cart/district',None)]),REAC('line-subtotal',[R('/quantity','line'),R('/unitPrice','line')],[SET('/subtotal',E(OP('mul',ER('/quantity','line'),ER('/unitPrice','line'))),'line')],ls),REAC('aggregate-total',[R('/cart/lines')],[SET('/cart/total',E({'use':'gross'}))]),REAC('campaign-discount',[R('/cart/campaign'),R('/cart/total')],[SET('/cart/discount',0),SET('/cart/discount',E(OP('mul',ER('/cart/total'),0.1)))],when=ER('/cart/discountEnabled')),REAC('net-payable',[R('/cart/total'),R('/cart/discount')],[SET('/cart/payable',E({'use':'net'}))])]
view=N('stack',slots={'default':[inp('国家','/cart/country','country-picker'),inp('城市','/cart/city','city-picker'),S(ls,N('section',props={'title':E(ER('/sku','line'))},slots={'default':[inp('数量',R('/quantity','line'),'number-input'),inp('单价',R('/unitPrice','line'),'number-input'),N('summary-card',props={'title':'当前行金额','total':E(ER('/subtotal','line'))})]})),N('summary-card',props={'title':'应付','total':E({'use':'net'})}),N('button',props={'label':'请求重新报价'},on={'activate':{'type':'host.emit','event':'cart.quoteRequested','payload':{'lines':E(ER('/cart/lines'))}}})]})
d=DF('cascade-cart',schema,{'default':view},expressions=expressions,reactions=rules,constraints=[CINT('payable-nonnegative',OP('gte',ER('/cart/payable'),0),R('/cart/payable'))],metadata={'scenario':'多级联动与跨项汇总','testPureFunctions':['demo.sumSubtotals.v1'],'note':'价格计算演示；不代表真实计价规则'})
write('cases/06-cascade-cart.json',d);write('fixtures/06-valid-data.json',{'cart':{'country':'A','city':'CityA','district':'DistrictA','lines':[{'sku':'L1','quantity':2,'unitPrice':100,'subtotal':200},{'sku':'L2','quantity':1,'unitPrice':50,'subtotal':50}],'total':250,'discount':25,'payable':225,'discountEnabled':True,'campaign':'standard','note':'保留'}})
# 07 Versioned date-domain pure functions: synthetic country rules, never a real legal policy.
person=obj({'name':string(),'birthDate':string(format='date'),'region':string(enum=['demo-A','demo-B']),'passport':string(),'needsReview':{'type':'boolean'}})
trip=obj({'startDate':string(format='date'),'endDate':string(format='date')})
schema=obj({'trip':trip,'travellers':{'type':'array','items':{'$ref':'#/$defs/Traveller'},'minItems':1}});schema['$defs']={'Traveller':person}
ts=B(R('/travellers'),'traveller');dates=OP('demo.dateOrdered.v1',ER('/trip/startDate'),ER('/trip/endDate'))
age=OP('demo.ageEligible.v1',ER('/birthDate','traveller'),ER('/trip/startDate'),ER('/region','traveller'),18)
constraints=[CINT('travel-period',dates,R('/trip/endDate')),CINT('age-on-departure',age,R('/birthDate','traveller'),ts),CEXT('passport-required',[R('/passport','traveller'),R('/region','traveller'),R('/trip/startDate')],R('/passport','traveller'),ts,True,ER('/needsReview','traveller')),CEXT('optional-advisory',[R('/region','traveller')],R('/region','traveller'),ts,False)]
fields=N('section',props={'title':'旅客'},slots={'default':[inp('姓名',R('/name','traveller')),inp('出生日期',R('/birthDate','traveller'),'date-input'),inp('演示地区',R('/region','traveller'),'select'),inp('护照',R('/passport','traveller')),N('summary-card',props={'title':'出行年龄资格','badge':{'visible':E(age),'text':'满足演示规则'}})]})
view=N('stack',slots={'default':[N('date-range',{'start':R('/trip/startDate'),'end':R('/trip/endDate')},props={'label':'出行期间'}),S(ts,USE('traveller-fields',{'traveller':R('','traveller')})),N('button',props={'label':'提交申请'},on={'activate':{'type':'host.emit','event':'travel.submitRequested','payload':{'departure':E(ER('/trip/startDate'))}}})]})
write('cases/07-travel-date-rules.json',DF('travel-dynamic-age',schema,{'default':view},constraints=constraints,templates={'traveller-fields':{'params':{'traveller':{'schemaRef':'#/$defs/Traveller'}},'node':fields}},metadata={'scenario':'出行日期 × 生日 × 地区规则','notice':'demo-A 计算已满周岁；demo-B 仅比较年份差。两者是合成测试，不代表任何真实国家法规。'}))
write('fixtures/07-valid-data.json',{'trip':{'startDate':'2026-11-01','endDate':'2026-11-20'},'travellers':[{'name':'A','birthDate':'2000-12-01','region':'demo-A','passport':'DEMO-001','needsReview':True},{'name':'B','birthDate':'2008-12-01','region':'demo-B','passport':'DEMO-002','needsReview':False}]})
# 08 Protocol edge cases, structured event/context reads, all Command forms.
item=obj({'label':string()});prefs=obj({'theme':string(default='light'),'nested':obj({'keep':string(),'replace':string()},required=['replace'])},required=['theme','nested'])
schema=obj({'profile':obj({'name':string(),'alias':{'type':['string','null']}},required=['name']),'prefs':prefs,'items':{'type':'array','items':{'$ref':'#/$defs/Item'}},'literalBox':{'type':'object'},'':string(),'a/b':obj({'~tag':string()})});schema['$defs']={'Item':item}
bs=B(R('/profile'),'profile','one');is_=B(R('/items'),'item')
batch={'op':'batch','commands':[{'op':'patch','target':R('/prefs'),'value':{'theme':'dark','nested':{'replace':'new'}}},{'op':'remove','target':R('/profile/alias')},SET('/literalBox',{'$literal':{'$expr':{'op':'this-is-data','args':[]}}})]}
eventCommand=SET('/profile/name',E({'ref':{'source':'event','path':'/name'}}))
view=N('stack',slots={'default':[
 S(bs,inp('姓名',R('/name','profile'))),
 N('demo-event-picker',props={
  'label':'从事件载荷回填','options':E({'ref':{'source':'context','path':'/nameOptions'}})
 },on={
  'confirm':{'type':'form.command','command':eventCommand},
  'request':{'type':'host.emit','event':'demo.lookupRequested','payload':{
   'query':E({'ref':{'source':'event','path':'/query'}}),'name':E(ER('/profile/name'))
  }}
 }),
 button('浅 patch / remove / Literal / batch',batch),
 N('debug-panel',props={'sample':{
  'emptyKey':E(ER('/')),'escaped':E(ER('/a~1b/~0tag')),'rootSnapshot':E(ER('')),
  'rows':[E(ER('/profile/name')),{'$literal':{'$expr':'保留原样'}}],
  'literalAst':E({'literal':{'op':'not-a-pure-function'}})
 }}),
 S(is_,N('section',props={'title':E(ER('/label','item'))},slots={'default':[
  button('删除当前实例',{'op':'array.remove','target':R('/items'),'item':{'$scope':'item'}}),
  button('移动当前实例（位置待固化）',{'op':'array.move','target':R('/items'),'item':{'$scope':'item'}})
 ]})),
 button('插入项（位置待固化）',{'op':'array.insert','target':R('/items'),'value':{'label':'New'}})
]})
write('cases/08-protocol-edges.json',DF('protocol-edge-showcase',schema,{'default':view},metadata={'scenario':'协议边界、七类命令与事件环境','pending':['array.insert 位置形状及默认位置未定稿','array.move 缺少目的位置，仅展示已确认的类别/身份字段，不可执行'],'note':'本样本结构通过不表示两个位置未定命令可运行。'}))
write('fixtures/08-valid-data.json',{'profile':{'name':'Ada','alias':None},'prefs':{'theme':'light','nested':{'keep':'old','replace':'old'}},'items':[{'label':'Alpha'},{'label':'Beta'}],'literalBox':{},'':'empty-name-key','a/b':{'~tag':'escaped-value'}})
# Test-only contracts and pure function signatures, kept outside Definition.
m=json.loads((P/'manifests/materials.json').read_text())
def manifest(id,bindings=None,props=None,events=None):return {'id':id,'version':'1.0.0','bindings':bindings or {},'slots':{},'events':events or {},'propsSchema':{'type':'object','properties':props or {},'additionalProperties':False}}
m['date-input']=manifest('date-input',{'value':{'type':'string','required':True}},{'label':string()})
m['demo-event-picker']=manifest('demo-event-picker',props={'label':string(),'options':{'type':'array','items':string()}},events={'confirm':{'payloadSchema':obj({'name':string()})},'request':{'payloadSchema':obj({'query':string()})}})
m['debug-panel']=manifest('debug-panel',props={'sample':{'type':'object'}})
write('manifests/materials.json',m)
h=json.loads((P/'manifests/host-events.json').read_text());h['allowedEvents']+=['cart.quoteRequested','travel.submitRequested','demo.lookupRequested'];h['payloadSchemas']={'cart.quoteRequested':obj({'lines':{'type':'array'}}),'travel.submitRequested':obj({'departure':string()}),'demo.lookupRequested':obj({'query':string(),'name':string()})};write('manifests/host-events.json',h)
write('manifests/context.json',{'schema':obj({'nameOptions':{'type':'array','items':string()}}),'value':{'nameOptions':['Ada','Lin']}})
write('manifests/pure-functions.json',{'status':'测试域纯函数，不是正式内置 Pure Function 清单','pureFunctions':[{'id':'demo.sumSubtotals.v1','args':['Line[]'],'result':'number','pure':True},{'id':'demo.dateOrdered.v1','args':['date','date'],'result':'boolean','pure':True},{'id':'demo.ageEligible.v1','args':['birthDate','departureDate','demoRegion','minimumAge'],'result':'boolean','pure':True}]})
print('wrote eight cases; 06–08 cover cascades, date rules and protocol edges')
