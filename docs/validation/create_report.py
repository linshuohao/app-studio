# -*- coding: utf-8 -*-
"""Protocol-first sample reference. Diagrams explain declarations; no simulated UI."""
from pathlib import Path
import json,html,sys
P=Path(__file__).resolve().parent
sys.path.insert(0,str(P.parent.parent/"tools/docs"))
from reader import render_document,section_heading
esc=lambda v:html.escape(str(v),quote=True)
def dump(v):return json.dumps(v,ensure_ascii=False,indent=2)
report=json.loads((P/'report.json').read_text());coverage=json.loads((P/'coverage.json').read_text());walk=json.loads((P/'walkthroughs.json').read_text())
def ref(r):
 if not isinstance(r,dict):return str(r)
 return (r.get('scope') or r.get('source','data'))+':'+(r.get('path') or '〈根〉')
def exp(e):
 if not isinstance(e,dict):return dump(e)
 if 'ref' in e:return ref(e['ref'])
 if 'use' in e:return 'use('+e['use']+')'
 if 'literal' in e:return 'literal('+dump(e['literal']).replace('\n',' ')+')'
 return e['op']+'('+', '.join(exp(x) for x in e['args'])+')'
def value(v):
 if isinstance(v,dict) and '$expr' in v:return exp(v['$expr'])
 if isinstance(v,dict) and '$literal' in v:return '$literal（保留原始 JSON）'
 return json.dumps(v,ensure_ascii=False)
def command(c):
 op=c['op']
 if op=='batch':return 'batch\n'+'\n'.join('  '+command(x).replace('\n','\n  ') for x in c['commands'])
 s=op+' '+ref(c['target'])
 if 'value' in c:s+=' ← '+value(c['value'])
 if 'item' in c:s+=' · item=$scope('+c['item']['$scope']+')'
 if op in ['array.insert','array.move']:s+=' [位置语法待固化]'
 return s

def tree(lines):
 # A lexical tree, not a rendered or fixture-expanded component tree.
 out=[]
 def rec(label,kids,prefix='',last=True,root=False):
  out.append(prefix+('' if root else '└─ ' if last else '├─ ')+label)
  for i,(l,k) in enumerate(kids):rec(l,k,prefix+('' if root else '   ' if last else '│  '),i==len(kids)-1)
 rec(lines[0],lines[1],root=True);return '\n'.join(out)
def data_node(name,s):
 t=s.get('$ref') or (' | '.join(s['type']) if isinstance(s.get('type'),list) else s.get('type','schema'))
 label=name+' : '+t
 if 'default' in s:label+=' · default='+value(s['default'])
 children=[data_node(k,v) for k,v in s.get('properties',{}).items()]
 if isinstance(s.get('items'),dict):children.append(data_node('[]',s['items']))
 return label,children
def view_node(n):
 if 'scope' in n:
  b=n['scope'];return 'Scope '+b.get('mode','one')+' '+b['as']+' ← '+ref(b['from']),[view_node(n['node'])]
 if '$use' in n:return '$use '+n['$use'],[(k+' ← '+ref(v),[]) for k,v in n.get('with',{}).items()]
 children=[('bindings.'+k+' ↔ '+ref(r),[]) for k,r in n.get('bindings',{}).items()]
 children += [('slots.'+slot,[view_node(x) for x in arr]) for slot,arr in n.get('slots',{}).items()]
 children += [('on.'+event+' → '+intent['type']+((' '+intent['event']) if 'event' in intent else ''),[]) for event,intent in n.get('on',{}).items()]
 return 'Material '+n['material'],children

def flow_diagrams(doc):
 blocks=[]
 for r in doc.get('reactions',[]):
  b=r.get('scope');bs=b if isinstance(b,list) else [b] if b else []
  scope=' → '.join(x['as']+' ← '+ref(x['from'])+' ['+x.get('mode','one')+']' for x in bs)
  text=(('scope  '+scope+'\n') if scope else '')+'watch  '+' OR '.join(ref(x) for x in r['watch'])+'\n  ↓ 数据变化命中\n'+('when   '+exp(r['when'])+'\n  ↓ 为 true 时执行\n' if 'when' in r else '')+'then\n'+'\n'.join(f'  {i+1}. '+command(c).replace('\n','\n     ') for i,c in enumerate(r['then']))
  blocks.append('<figure><figcaption>'+esc(r['id'])+'</figcaption><pre class="diagram">'+esc(text)+'</pre></figure>')
 for c in doc.get('constraints',[]):
  if c['kind']=='external':
   text='watch  '+', '.join(ref(x) for x in c['watch'])
   if 'when' in c:text+='\n合并 when 读取  '+exp(c['when'])
   text+='\n  ↓ 依赖变化使旧结论失效\n按 blur / validate / submit 等策略请求 Host\n  ↓ 有效结果上报\n'+ref(c['target'])+' ← 状态 / Issues'
  else:
   text='自动观察 when + assert 的全部读取\n'
   if 'when' in c:text+='适用条件  '+exp(c['when'])+'\n  ↓ 适用时断言；不适用清除本规则旧 Issue\n'
   text+=exp(c['assert'])+'\n  ↓ 不满足时\nIssue → '+ref(c['issue']['target'])
  blocks.append('<figure><figcaption>'+esc(c['id'])+' · '+esc(c['kind'])+'</figcaption><pre class="diagram">'+esc(text)+'</pre></figure>')
 if not blocks:blocks=['<figure><figcaption>绑定与宿主交互</figcaption><pre class="diagram">Material.bindings.value ↔ DataReference\n\non.activate → host.emit\n                  ↓\n                Host 业务处理</pre></figure>']
 return ''.join(blocks)

titles=['基础资料','订单表达式与联动','嵌套成员与模板','投保协议基线','多层理赔与父级约束','多级联动与汇总','出行日期、生日与地区规则','命令、引用与事件环境']
notes=[
'最小定义由 Data Schema、Material、Binding 和 Host Event 组成；不需要引入 Scope 或 Reaction。',
'同一份数据分别被表达式读取、被 Reaction 修改、被 Constraint 检查。动态摘要直接引用命名 Expression。',
'团队与成员建立两层词法绑定；Template 通过 DataReference 参数接收当前成员，校验义务按成员展开。',
'两个 Profile 选择不同 View 入口，复用同一编辑模板、Data 和业务规则；容器呈现不引入新的 Command。',
'claim 可以读取祖先 policy 的额度。凭证要求与凭证视图的条件分别表达，视图隐藏不会删除业务约束。',
'联动分为地址清空链和金额计算链。watch 决定触发，when 仅作执行门控；按项计算与父级汇总通过明确数据引用连接。',
'出行日期与生日送入领域纯函数，按合成地区规则生成资格结论；Constraint 归属到当前旅客的生日字段，不自动修改生日。',
'区分 Data、Context 与 Event 的读取位置；用 Command 表达修改，用 Literal 保留标记对象。数组位置尚未定稿的命令只展示已确认部分。']
explanations={
1:'Binding 只关联数据位置；on.activate 声明提交意图，实际提交由 Host 负责。',
2:'orderTotal 是只读计算。reset-city 只 watch country；修改 quantity 影响摘要，但不会清空 city。',
3:'rule.scope 是有序链：先绑定 team，再从 team.members 绑定 member。模板不隐式捕获调用方作用域。',
4:'expanded 与 compact 的值直接是 ViewNode，可用 $use 引用静态模板。trigger/content 是容器物料的 Slots，不是 Runtime 的开窗指令。',
5:'三层作用域为 policy → traveller → claim。跨父级额度与当前理赔项金额参与同一断言，Issue 仍指向当前 claim.amount。',
6:'line.quantity / unitPrice → line.subtotal → cart.total → cart.discount → cart.payable。discountEnabled 只在 when 中，单独改变它不会触发规则。',
7:'birthDate、trip.startDate、region 共同决定断言；改变出行日期或地区会重新检查同一生日，不产生修改生日的 Command。demo-A/B 是测试规则。',
8:'confirm 的 Event Payload 可作为 set 的值；Context 只读。batch 示例按顺序浅 patch、删除属性、写入 Literal；现行设计默认逐条即时生效，不整体回滚。候选探针不证明生产失败隔离已实现。'
}
def protocol_board(doc,case):
 labels={'data':'Data · 数据定义','expressions':'Expressions · 命名计算','constraints':'Constraints · 校验约束','reactions':'Reactions · 数据联动','views':'Views · 视图入口','viewTemplates':'View Templates · 模板定义'}
 groups=[('定义信息',{k:doc[k] for k in ['protocolVersion','id','version','metadata'] if k in doc})]
 groups.extend((labels.get(k,k),{k:v}) for k,v in doc.items() if k not in ['protocolVersion','id','version','metadata'])
 cards=[]
 for n,(label,block) in enumerate(groups,1):
  keys=', '.join(block)
  cards.append('<section class="protocol-card"><div class="protocol-card-head"><span>'+str(n).zfill(2)+'</span><h4>'+esc(label)+'</h4></div><p class="module-path">'+esc(keys)+'</p><pre class="protocol module-definition" data-definition="'+esc(case)+'"><code>'+esc(dump(block))+'</code></pre></section>')
 return '<div class="protocol-board" tabindex="0" role="region" aria-label="完整协议模块，横向排列">'+''.join(cards)+'</div>'

articles=[]
for i,result in enumerate(report['cases'],1):
 doc=json.loads((P/'cases'/result['case']).read_text())
 data=tree(data_node('Data',doc['data']['schema']))
 views=''.join('<details'+(' open' if j==0 else '')+'><summary>views.'+esc(name)+'</summary><pre class="diagram">'+esc(tree(view_node(v)))+'</pre></details>' for j,(name,v) in enumerate(doc['views'].items()))
 templates=''.join('<details><summary>viewTemplates.'+esc(name)+'</summary><pre class="diagram">'+esc(tree(view_node(t['node'])))+'</pre></details>' for name,t in doc.get('viewTemplates',{}).items())
 scenarios=[s for s in report['extendedSmoke']['scenarios'] if s['case']==i]
 evidence=[]
 for s in scenarios:
  rows=''.join('<tr><td><code>'+esc(c['path'])+'</code></td><td><code>'+esc(json.dumps(c['before'],ensure_ascii=False))+'</code></td><td><code>'+esc(json.dumps(c['after'],ensure_ascii=False))+'</code></td></tr>' for c in s['changes'])
  sequence='\n  ↓\n'.join(t['stage'] for t in s['trace'])
  evidence.append('<details><summary>'+esc(s['title'])+'</summary><pre class="diagram">'+esc(sequence)+'</pre><div class="table"><table><tr><th>引用位置</th><th>之前</th><th>之后</th></tr>'+rows+'</table></div></details>')
 pending='<p class="note">array.insert / array.move 的位置语法未固化；只展示确认字段，抽测器拒绝执行。</p>' if result.get('pendingSemantics') else ''
 articles.append(f'''<article id="case-{i}" data-case="{i}">{section_heading(titles[i-1],i)}<p class="intro">{esc(notes[i-1])}</p>{pending}<div class="case-nav"><a href="#case-{i}-protocol">协议定义</a> · <a href="#case-{i}-structure">结构关系</a> · <a href="#case-{i}-flow">变化流程</a></div><section id="case-{i}-protocol" class="definition"><h3>完整事例协议 · 按模块并列</h3><p class="caption">{esc(result['case'])} · 横向滚动查看所有模块；各卡片保留完整内容，纵向独立滚动。所有卡片的顶层字段合起来就是这份完整 FormDefinition。</p><p class="case-nav"><a href="cases/{esc(result['case'])}">打开完整 JSON</a> · <a href="fixtures/{i:02d}-valid-data.json">查看输入数据 Fixture</a> · <a href="#case-{i}-structure">结构示意</a> · <a href="#case-{i}-flow">流程说明</a></p>{protocol_board(doc,result['case'])}</section><div class="diagrams"><section id="case-{i}-structure"><h3>结构关系</h3><p class="caption">树表示定义与引用，不按 Fixture 展开实际组件实例。</p><pre class="diagram">{esc(data)}</pre>{views}{templates}</section><section id="case-{i}-flow"><h3>变化流程</h3><p>{esc(explanations[i])}</p>{flow_diagrams(doc)}</section></div><details class="evidence"><summary>数据变化举证 · {len(scenarios)} 个场景</summary><p class="caption">来自有界抽测器的实际输出；步骤顺序不冻结正式 L3 调度算法。</p>{''.join(evidence)}</details></article>''')
rows=[]
for x in coverage['items']:
 target=f'case-{x["case"]}-protocol' if 'case' in x else 'contracts'
 rows.append('<tr id="cap-'+x['id']+'"><td>'+esc(x['id'])+'</td><td><a href="#'+target+'">'+esc(x['capability'])+'</a></td><td>'+esc(x['evidence'])+'</td><td>'+('样本 '+str(x['case']) if 'case' in x else '跨层说明')+'<small>'+esc(x['pointer'])+'</small>'+('<small>'+esc(x['note'])+'</small>' if x['note'] else '')+'</td></tr>')
labels={'lifecycle':'实例、快照与 Host 业务恢复','validation':'校验五态与 Readiness','async':'失效、乱序与 ABA','output':'编辑态、Field State 与输出','delivery':'表达形式与 Profile 交付','hostServices':'Host Services 边界','pendingCommands':'位置命令待固化事项'}
contracts=[]
for key,label in labels.items():
 entries=walk[key]
 if isinstance(entries[0],str):content='<ol>'+''.join('<li>'+esc(x)+'</li>' for x in entries)+'</ol>'
 else:content='<pre class="diagram">'+esc(dump(entries))+'</pre>'
 contracts.append('<details><summary>'+label+'</summary>'+content+'</details>')
probes=report['behaviorSmoke']['tests']+report['extendedSmoke']['tests']
checks=''.join('<tr><td>'+esc(t['name'])+'</td><td>'+('通过' if t['pass'] else '失败')+'</td></tr>' for t in probes)
neg=''.join('<tr><td>'+esc(n['test'])+'</td><td>'+('已拦截' if n['rejected'] else '未拦截')+'</td></tr>' for n in report['negativeTests'])
body=f'''<p class="caption">每张卡片保留所属模块的全部定义，不省略嵌套内容。横向看模块分工，纵向读模块内部；下方结构与流程提供辅助说明。</p><ol class="contents">{''.join('<li><a href="#case-'+str(i)+'"><span>'+str(i).zfill(2)+'</span>'+esc(t)+'</a></li>' for i,t in enumerate(titles,1))}</ol>{''.join(articles)}<section class="section" id="coverage">{section_heading("能力覆盖索引",9)}<p class="caption">48 项能力与相关跨层边界。出处 Pointer 可在相应完整 Definition 中定位；图解与待定语法不计作生产实现验收。</p><div class="table"><table><tr><th>ID</th><th>能力</th><th>证据</th><th>出处与边界</th></tr>{''.join(rows)}</table></div><p><a href="coverage.json">覆盖表 JSON</a></p></section><section class="section" id="contracts">{section_heading("跨层契约补充",10)}<p class="caption">以下为预期语义说明，尚非 Runtime 状态机测试；不新增 Definition 字段。</p>{''.join(contracts)}<p><a href="walkthroughs.json">契约说明数据</a></p></section><section class="section" id="checks">{section_heading("验证记录",11)}<p class="validation-status">候选结构/静态语义/Fixture：{report['summary']['casesPass']}/{report['summary']['casesTotal']} · 反例拦截：{report['summary']['negativeCaught']}/{report['summary']['negativeTotal']} · 有界检查：{sum(t['pass'] for t in probes)}/{len(probes)}</p><details><summary>行为与语义检查明细</summary><table><tr><th>检查</th><th>结果</th></tr>{checks}</table></details><details><summary>反例明细</summary><table><tr><th>反例</th><th>结果</th></tr>{neg}</table></details><p class="caption">测试抽测器采用有界 FIFO，未验证不可变 Snapshot、Reaction pending 合并、Prepared 唯一入口、真实 Flush、可隔离 Command 错误继续、整体熔断与再触发、Trace、持久身份跨重排与替换、真实异步竞态、提交 Readiness 或跨端渲染。<a href="../reading/l3-reactive-engine.html#l3-acceptance">L3 的 C01–C18</a> 及 <a href="../reading/dependency-reactivity.html#dependency-v05-acceptance">V0.5 的 12 个跨层场景</a> 及 <a href="../reading/l3-reactive-engine.html#l3-v06-acceptance">V0.6 的 16 个场景</a> 是设计验收，尚不计入通过统计；候选 Schema 未固化 runOnActivate，探针未实现前后 ScopeReadView、候选索引、相对位置比较、稳定 snapshot / 新实例激活和独立执行事件。<a href="../reading/l3-reactive-engine.html#l3-runtime-host-boundary">后续用户确认的 B01–B08</a> 以及 <a href="../reading/l3-validation.html#validation-acceptance">V0.7 校验 V01–V16</a> 也是设计验收；本轮前置、Schema Adapter 缓存、来源 / 字段聚合和完整结果 API 尚未由探针实现，requires / 消息覆盖尚未纳入候选 Schema；五态图不要求 UI 暴露每来源状态机。Dirty / 业务 Baseline / Reset 策略归 Host，Runtime 不保留 Reset 主动重算模式。日期地区规则为虚构测试规则。array.insert / array.move 的位置语法仍待固化，结构通过不表示可以完整执行。</p><details id="reproduce"><summary>复现与来源</summary><pre class="protocol">cd docs/validation
python3 -m pip install -r requirements.txt
python3 run_validation.py</pre><p><a href="report.json">机器报告</a> · <a href="validator/l1-candidate-structural.schema.json">候选 Schema</a> · <a href="manifests/materials.json">物料契约</a> · <a href="manifests/pure-functions.json">测试纯函数</a> · <a href="manifests/host-events.json">Host 契约</a> · <a href="../history/l1-protocol-validation-source.zip">来源归档</a></p></details></section>'''
text=render_document(
 output=P/'index.html',title='协议定义、结构与变化流程',
 eyebrow='FORM ENGINE · DEFINITION PROTOCOL · EXAMPLES',
 lead='每个事例按顶层模块横向并列展示完整 FormDefinition：数据、计算、约束、联动、视图与模板各占一张卡片，便于对照它们之间的关系。',
 body=body,toc=[('case-'+str(i),title) for i,title in enumerate(titles,1)]+[('coverage','能力覆盖索引'),('contracts','跨层契约补充'),('checks','验证记录'),('reproduce','复现与来源')],
 source=P/'README.md',wide=True,extra_css='examples.css',
)
text='<!-- Generated by docs/validation/create_report.py; shared reading shell. -->\n'+text
if '--check' in sys.argv:
 if not (P/'index.html').exists() or (P/'index.html').read_text()!=text:
  sys.exit('Sample reading page needs rebuilding: docs/validation/index.html')
 print('Sample reading page matches its source.')
else:
 (P/'index.html').write_text(text)
 print('Built protocol-first reference with shared reading shell.')
