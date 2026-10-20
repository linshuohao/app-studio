from pathlib import Path
import json
p=Path(__file__).resolve().parent
rows=[]
def add(id,name,case,pointer,level='静态+抽测',note=''):
 rows.append({'id':id,'capability':name,'case':case,'pointer':pointer,'evidence':level,'note':note})
add('D01','JSON Schema 数据结构与基础约束',1,'/data/schema','静态+数据')
add('D02','对象 / 数组 / 复用 $defs / $ref',3,'/data/schema','静态+数据')
add('D03','Schema default、Missing 与 null 区分',8,'/data/schema/properties/prefs/properties/theme','图解','参见跨层契约生命周期；不宣称默认合成算法已实现')
add('R01','Data Root、空 Pointer 与空字段名',8,'/views/default/slots/default/3/props/sample')
add('R02','JSON Pointer ~1 / ~0 转义',8,'/views/default/slots/default/3/props/sample/escaped')
add('R03','只读 Context Reference',8,'/views/default/slots/default/1/props/options')
add('R04','Event Reference：限定交互上下文',8,'/views/default/slots/default/1/on/confirm')
add('S01','ScopeBinder one',8,'/views/default/slots/default/0/scope','静态')
add('S02','ScopeBinder each 与多层词法链',5,'/constraints/0/scope')
add('S03','跨父级 Scope 读取与约束',5,'/constraints/0/assert')
add('S04','ScopeHandle 精确删除当前数组项',8,'/views/default/slots/default/4/node/slots/default/0/on')
add('E01','纯 AST / 基础 Pure Function',6,'/reactions/2/then/0/value')
add('E02','命名 Expression DAG 与复用',6,'/expressions')
add('E03','递归 ValueSpec 对象与数组',8,'/views/default/slots/default/3/props/sample')
add('E04','$literal 与 Expression literal 转义',8,'/views/default/slots/default/3/props/sample/literalAst')
add('E05','版本化领域纯函数：地区年龄、日期范围',7,'/constraints/1/assert','静态+抽测','合成地区规则；非真实国家法规')
add('C01','Internal Constraint、Issue Target',5,'/constraints/0')
add('C02','条件 Constraint.when',5,'/constraints/1')
add('C03','External watch、逐项义务与作用域',7,'/constraints/2')
add('C04','外部约束适用条件、必需/非必需',7,'/constraints/3')
for i,(op,ptr) in enumerate([('set','/views/default/slots/default/1/on/confirm/command'),('patch','/views/default/slots/default/2/on/activate/command/commands/0'),('remove','/views/default/slots/default/2/on/activate/command/commands/1'),('batch','/views/default/slots/default/2/on/activate/command'),('array.remove','/views/default/slots/default/4/node/slots/default/0/on/activate/command'),('array.insert','/views/default/slots/default/5/on/activate/command'),('array.move','/views/default/slots/default/4/node/slots/default/1/on/activate/command')],1):
 add(f'M{i:02d}','Command '+op,8,ptr,'方向示意' if op in ['array.insert','array.move'] else '静态+抽测','位置语法未定；抽测器拒绝执行，不计作行为通过' if op in ['array.insert','array.move'] else '')
add('L01','多 watch OR、when 不自动变 watch',6,'/reactions/4')
add('L02','有序 then、同目标后写覆盖',6,'/reactions/4/then')
add('L03','多级联动：国家 → 城市 → 区县',6,'/reactions/0')
add('L04','逐项计算 → 父级汇总 → 折扣 → 应付',6,'/reactions/2')
add('L05','Host 异步结果由新 Command 触发同步联动',6,'/views/default/slots/default/4/on','抽测+图解','以测试报价响应模拟 Host 回写；未发送网络请求')
add('V01','MaterialNode / ScopeNode / TemplateUse',4,'/views','静态')
add('V02','多 Profile 同数据、共享业务规则',4,'/views','静态+图解')
add('V03','Typed Template schemaRef + DataReference',3,'/viewTemplates/member-fields','静态')
add('V04','具名 Binding Ports，复合日期输入',5,'/views/desktop/slots/default/1/node/slots/default/0','静态')
add('V05','Slots、容器物料 trigger / content',4,'/viewTemplates/compact-form','静态+结构图')
add('V06','动态 Props、条件物料显示',5,'/viewTemplates/claim-fields/node/slots/default/4','静态+结构图')
add('I01','form.command 与捕获局部 Scope',3,'/views/default','静态')
add('I02','host.emit：Event + Data 动态 Payload',8,'/views/default/slots/default/1/on/request')
add('H01','Host 路径一：External Validator',7,'/constraints/2','静态+图解')
add('H02','Host 路径二：有类型业务事件',8,'/views/default/slots/default/1/on/request','静态+抽测')
add('H03','Host 路径三：物料服务注入',5,'/viewTemplates/claim-fields','图解','见跨层契约；上传/远程选项不新增 Definition 调度字段')
for id,name,key in [('X01','实例装载 / 首次激活 / Host 业务恢复边界','lifecycle'),('X02','外部校验五态与 Readiness','validation'),('X03','失效、乱序与 ABA 结果接收','async'),('X04','编辑态、解析错误、Field State 与输出','output'),('X05','Authoring → Canonical → Prepared、Profile 交付','delivery')]:
 rows.append({'id':id,'capability':name,'file':'walkthroughs.json','pointer':'/'+key,'evidence':'图解','note':'跨层契约示意；尚无生产 Runtime/Renderer 验收'})
# Mechanical evidence integrity check.
for row in rows:
 path=p/row.get('file',next((str(x.relative_to(p)) for x in (p/'cases').glob(f'{row.get("case",0):02d}-*.json')),''))
 data=json.loads(path.read_text())
 for seg in row['pointer'].split('/')[1:]:
  seg=seg.replace('~1','/').replace('~0','~');data=data[int(seg)] if isinstance(data,list) else data[seg]
(p/'coverage.json').write_text(json.dumps({'scope':'覆盖 V1.0 已确认 L1 能力类别及其跨层契约边界；不宣称覆盖所有业务组合和未知领域纯函数','items':rows},ensure_ascii=False,indent=2)+'\n')
print('coverage rows',len(rows))
