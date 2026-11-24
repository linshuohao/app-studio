---
id: DESIGN-L3-RUNTIME
title: L3 运行时总览与 Flush
type: design
status: active
layer: L3
modules:
- M07
- M08
- M09
- M16
tags: []
related:
  decisions:
  - ADR-FE-020
  - ADR-FE-019
  - ADR-FE-018
  - ADR-FE-006
  - ADR-FE-007
  - ADR-FE-008
sources:
- SRC-RUNTIMEIMPLEMENTATION
- SRC-REACTIONSTATE
- SRC-RUNTIMEOVERVIEW
- SRC-L3BASELINE
- SRC-V04
- SRC-V05
- SRC-V06
- SRC-HOST
navigation:
  group: 04 · L3 运行时
  order: 50
last_reviewed: '2026-10-24'
reading_next: DESIGN-L3-DATA
relocated_sections:
- source: docs/design/architecture.md
  anchor: runtime
  target: runtime
---

# L3 运行时总览与 Flush

## 当前实现批次与 Review 路线 {#runtime-implementation}

2026-10-23 用户授权先搭框架、编写场景用例，再逐模块实现，以总图和局部图审查。此处记录交付范围，不将实现选择提升为新的架构共识。实现入口为 `packages/runtime`；总图、局部图、目录、方法与四类场景的影响路径见 [Runtime 代码 Review 入口](../../packages/runtime/README.md)。生产代码只消费 Prepared /2，不反向调用 Compiler。测试使用真实 Compiler 生成输入。

| 批次 | 文件与接口 | 验收 |
| --- | --- | --- |
| 1 数据与身份 | `data/store.ts`、`scope/registry.ts`；read / snapshot / bind / dispatch | 即时写、旧快照、成员移动 / 替换、逐命令比较、非法操作隔离 |
| 2 求值与传播 | `expression/evaluator.ts`、`observation/registry.ts`、`reactions/scheduler.ts`；evaluate / observe / flush | 显式 watch、最新值去重、同步重入、次数保护、host.emit |
| 3 校验与结果 | `validation/manager.ts`；getValidation / validate | 根 Schema、同步前置、来源隔离、逐结果发布、任务过期、四类完整结果 |
| 4 接缝与交付 | `runtime.ts`、`tests/integration`；createRuntime / replaceContext / dispose | 初始化→编辑→结果反馈→Host 成功 / 失败，真实跨包输入输出与清理 |
| 5 单轮记录生命周期 | `reactions/context.ts`、`diagnostics/journal.ts`、`diagnostics/reporter.ts`；onDiagnostic / diagnostics | 每轮新建和释放、前置来源、迟到任务引用、截断、销毁及出口异常隔离 |

各批次先写有明确预期的失败用例，再实现并跑通；公共接口是本次代码 Review 的草案。既有干净特性分支上保留增量供用户审查，不自动提交或发布。检查覆盖类型、行为、边界与打包；React 物料实际交互已由后续 L4 / 资产批次本地验收；Flutter 等价和目标设备性能仍单独验收，不以无界面 Runtime 用例替代。

当前已实现无界面核心、Scope 相对索引 / 旧视图与 React Adapter / 首批物料交互，见 [Scope 实现](l3-data-scope.md#l3-scope-index)及[完整表单证据](engineering.md#business-travel-implementation)。待实现或继续设计的是首次输入默认值策略等剩余能力；待验收的是依赖 / 字段聚合及整体编辑成本、生产预算、真实 Host 和跨端一致性。已实现范围不再列为从零实现待办，稳定公开 SDK 尚未冻结。format 目前按注解处理，未提供格式断言。SDK 字段状态与方法结构供用户 review，未新增架构 ADR 或冻结发布契约。

初批本地证据曾覆盖 Runtime 41 个用例、纯函数 1 个用例、根级集成 5 个用例；后续增加类方法兼容回归及清理初始化标记链，根级集成保留 4 个真实用例。2026-10-24 按用户授权修正 Journal 生命周期后，Runtime 52 个用例及类型检查通过；10 个新增用例覆盖独立轮次、前置来源、异步回报、销毁、截断与同步 / 异步诊断出口异常。既有六包构建与打包消费证据不替代本批重新验证，也不包含真实表单 UI、Flutter 或设备性能验收。

实例诊断出口与单轮执行记录已拆开：每次实际 drain 新建 FlushContext / Journal，结束后先封存不可变报告再释放，onDiagnostic 异步交付 Host。调度前仅暂存有界触发元数据；异步任务仅捕获启动事件编号，不捕获旧 Journal。具体字段与局部图见代码 Review 入口；逐 Command / Change 完整因果 Trace、字节预算及生产报告策略仍属剩余范围，无新增架构 ADR。

L3 管理唯一 Working Data、真实 Scope 身份、统一变化匹配、Command 与 Reaction Flush。数据 / Scope 与 Trace 分别维护在[数据与身份](l3-data-scope.md)和[诊断与 Trace](l3-observability.md)。本篇按模型、数据修改、生命周期、执行和错误展开；校验另见[校验与结果](l3-validation.md)。

## 运行时、调度与外部能力全景 {#runtime-overview}

这张总图贯穿 L1 声明、L2 准备、L3 运行和 L4 呈现，重点展开 Runtime 的状态、指令、依赖分发、联动与校验。左侧区分物料 / 纯函数的契约及实现，右侧按接入点放置 Host 的 Command、Validator 和物料请求 / 事件；分区表示职责，不增加新的执行层，也不要求 UI 调用按 L1–L4 逐跳转发。

```diagram
{
  "id":"figure-runtime-overview",
  "title":"运行时全景 · 四层核心、能力资产与 Host 接入",
  "canvas":[1870,1920],
  "rows":[
    [
      {"title":"能力资产 · 静态契约","body":"","position":[30,140,285,595],"kind":"group"},
      {"title":"Material · 物料资产","body":"","position":[31,190,280,45],"kind":"label"},
      {"title":"Manifest / 契约","body":"Props / Bindings\nSlots / Events / Requests\n端口 Schema · 版本","position":[31,238,280,180],"kind":"label"},
      {"title":"Pure Function","body":"纯函数签名 / 契约\n名称 · 输入 / 输出类型\n版本 · 平台实现契约","position":[31,430,280,170],"kind":"label"},
      {"title":"L2 检查契约","body":"","position":[31,610,280,45],"kind":"label"},
      {"title":"L2 检查签名与引用","body":"","position":[31,655,280,45],"kind":"label"},
      {"title":"Pure Function","body":"","position":[30,770,285,665],"kind":"asset"},
      {"title":"同步纯计算实现","body":"内置函数 / 领域计算\n无网络与数据写入","position":[31,835,280,160],"kind":"label"},
      {"title":"L3 绑定确定实现","body":"由统一表达式求值调用","position":[31,1050,280,130],"kind":"label"},
      {"title":"签名与实现分开","body":"绑定到当前 Runtime","position":[31,1270,280,120],"kind":"label"},
      {"title":"Material · 平台实现","body":"平台组件实现\nInput / Select / 上传物料\n容器与领域组件\nReact / Flutter 实现\nL4 装配并连接端口","position":[30,1470,285,260],"kind":"asset"},
      {"title":"检查","body":"","position":[315,265,85,45],"kind":"label"},
      {"title":"绑定","body":"","position":[315,1330,90,45],"kind":"label"},
      {"title":"装配","body":"","position":[315,1515,85,45],"kind":"label"}
    ],
    [
      {"title":"L1 · 协议与领域声明","body":"数据模型 · Scope · 表达式 / 纯函数引用 · 规则 / 约束 · 物料 / 视图","position":[400,140,1060,110],"kind":"layer"},
      {"title":"L2 · 静态编译与准备","body":"检查定义与能力契约 → 补全依赖 / 同步前置 → 生成兼容 PreparedForm","position":[400,275,1060,110],"kind":"layer"},
      {"title":"L3 · Runtime / 唯一 Working Data · 受控修改 · 统一观察","body":"","position":[400,425,1060,1010],"kind":"group"},
      {"title":"对外接口  dispatch / read / snapshot / subscribe","body":"","position":[430,490,1000,75],"kind":"layer"},
      {"title":"① Command","body":"保留显式顺序与次数","position":[430,600,270,110],"kind":"node"},
      {"title":"② Data + Scope","body":"同步、一致更新","position":[730,600,320,110],"kind":"node"},
      {"title":"③ Reactive Engine","body":"匹配依赖，比较观察值","position":[1080,600,350,110],"kind":"node"},
      {"title":"④ Reaction Pending","body":"按实例去重，合并触发来源\n首次延迟启动；执行中追加本轮","position":[450,785,455,130],"kind":"reaction"},
      {"title":"⑤ 同步 Flush","body":"取出实例 → 读取最新状态\n执行命令 / host.emit，持续消费\n队列空 → idle；超限中止并清队列","position":[450,950,455,170],"kind":"reaction"},
      {"title":"Validation Pending","body":"根 Schema 待校验标记\nConstraint 实例去重集合","position":[970,785,460,130],"kind":"validation"},
      {"title":"⑥ 校验执行","body":"完整根 Schema → 补齐同步前置\n去重、重排，按本轮资格执行\n无 Reaction / 主动校验也可进入","position":[970,950,460,170],"kind":"validation"},
      {"title":"③ → 数据 / 动态属性通知","body":"按实际依赖变化通知消费者","position":[450,1180,455,110],"kind":"node"},
      {"title":"⑦ 发布校验结果","body":"资格检查 → 来源 / 字段一致发布","position":[970,1180,460,110],"kind":"validation"},
      {"title":"写回继续本轮；正常收敛后进入校验","body":"","position":[440,1120,490,45],"kind":"label"},
      {"title":"就绪 → 字段观察 / 联动","body":"","position":[1205,1120,240,45],"kind":"label"},
      {"title":"L3 共享基础 · 被上述模块共同使用","body":"","position":[425,1300,1000,45],"kind":"label"},
      {"title":"统一表达式 / 纯函数求值","body":"","position":[430,1350,316,65],"kind":"state"},
      {"title":"Data / Context / Scope","body":"","position":[759,1350,317,65],"kind":"state"},
      {"title":"Issues / 注册 / Trace","body":"","position":[1089,1350,341,65],"kind":"state"},
      {"title":"状态通知 → 重读与呈现","body":"","position":[750,1433,400,45],"kind":"label"},
      {"title":"L4 · Renderer / 共用 Material Adapter","body":"物料装配 · Binding / Props / Issues · UI 生命周期","position":[400,1500,1060,120],"kind":"layer"},
      {"title":"Request Bridge","body":"","position":[1120,1550,300,45],"kind":"label"},
      {"title":"物料值变化 → Binding → Command；物料业务事件 → Host；Request 返回值不自动写入 Data。","body":"","position":[398,1625,1070,45],"kind":"label"},
      {"title":"物料 requests ↔ Host；外部请求由 Host 管理。","body":"","position":[398,1670,1070,45],"kind":"label"},
      {"title":"虚线：契约检查、实现接入；实线：运行期数据与调用","body":"","position":[398,1715,1070,45],"kind":"label"},
      {"title":"横向契约 · 贯穿 L1–L4","body":"依赖 / Scope · 校验 / 完成 · 受控扩展 · 诊断 / Trace · 兼容 / 交付","position":[30,1785,1810,115],"kind":"layer"}
    ],
    [
      {"title":"Host · 业务应用","body":"提供 Context / 导入数据\n观察数据 / 接收业务事件\n普通 Command 写回\nBaseline / 保存 / 提交","position":[1530,140,310,415],"kind":"host"},
      {"title":"需改值时经受控入口","body":"","position":[1530,465,300,45],"kind":"label"},
      {"title":"⑤ Host 行为 · host.emit","body":"按 watch / when 触发\n同步交付，不等待异步任务\n取消 / 过期 / 防覆盖归 Host\n有效结果经 Command 写回","position":[1530,590,310,240],"kind":"host"},
      {"title":"Host 接入 · Validator","body":"Validator：执行外部校验\n任务 / 取消 / 缓存 / 重试\n当前有效结果回报 Runtime","position":[1530,955,310,325],"kind":"host"},
      {"title":"外部 I/O","body":"","position":[1530,855,300,45],"kind":"label"},
      {"title":"由 Host / 平台实现承接","body":"","position":[1530,900,300,45],"kind":"label"},
      {"title":"Host 业务服务","body":"查询 / 上传 / 保存 / 提交\n网络 / 鉴权 / 请求错误\nBackend / 外部系统","position":[1530,1310,310,175],"kind":"host"},
      {"title":"Host 接入 · 请求 / 事件","body":"Request：物料业务请求\nEvent：承接业务意图\n结果经 Adapter 返回物料\n选择 / 确认后再写 Command","position":[1530,1510,310,220],"kind":"host"},
      {"title":"指令","body":"","position":[1460,485,70,45],"kind":"label"},
      {"title":"调用","body":"","position":[1460,1010,70,45],"kind":"label"},
      {"title":"回报","body":"","position":[1460,1235,70,45],"kind":"label"}
    ]
  ],
  "edges":[
    {"points":[[930,250],[930,275]]},
    {"points":[[930,385],[930,425]]},
    {"points":[[610,565],[610,600]]},
    {"points":[[700,655],[730,655]]},
    {"points":[[1050,655],[1080,655]]},
    {"points":[[1245,710],[1245,740],[675,740],[675,785]]},
    {"points":[[1265,710],[1265,785]]},
    {"points":[[675,915],[675,950]]},
    {"points":[[450,1030],[420,1030],[420,735],[565,735],[565,710]]},
    {"points":[[905,1030],[943,1030],[943,930],[1090,930],[1090,950]]},
    {"points":[[1200,915],[1200,950]]},
    {"points":[[1200,1120],[1200,1180]]},
    {"points":[[677,1290],[677,1310],[413,1310],[413,1470],[700,1470],[700,1500]]},
    {"points":[[1200,1290],[1200,1310],[1447,1310],[1447,1470],[1130,1470],[1130,1500]]},
    {"points":[[315,330],[400,330]],"binding":true},
    {"points":[[315,1382],[430,1382]],"binding":true},
    {"points":[[315,1570],[400,1570]],"binding":true},
    {"points":[[1530,530],[1430,530]]},
    {"points":[[1430,1050],[1530,1050]]},
    {"points":[[1530,1235],[1430,1235]]},
    {"points":[[1430,1580],[1530,1580]],"both":true},
    {"points":[[1700,1280],[1700,1310]]},
    {"points":[[1700,1510],[1700,1485]]}
  ],
  "note":"以职责分区和就近接入保留完整说明。Data / Scope 在每条 Command 内即时更新；Reaction 延迟启动一次，随后同步执行至结束；校验按有效结果就绪更新来源并通知实际变化的聚合。Host 网络不进入同步 Flush，⑤ 可同步发出 host.emit；⑦ 一致发布后通知显式 Validation 观察（含 Reaction）。Context 只读且由独立宿主入口管理。调度阶段 / SDK 名称仍依现行契约固化；当前轮超限清队列，后续新有效失效正常建立新轮次。"
}
```

读图时先看中间主链，再看左右接入与底部共享基础：

- **即时修改与分发：**View / Host / Reaction 共用 Command 入口；Data 与 Scope 同步一致更新，依赖索引定位候选后比较观察值，分别登记 Reaction / Validation Pending 与订阅通知。显式 Command 次数不合并。
- **联动调度：**Pending 按 Reaction 实例去重，执行读取最新状态；首次延迟启动，执行中新增联动或同步回调写回继续当前轮，不重新等待启动边界。队列空后结束本轮；超限中止并清空本轮剩余任务，按现行 [ADR-FE-018](decisions/ADR-FE-018-flush-round-protection.md)处理后续新触发，不恢复旧持续暂停方案。
- **校验与通知：**正常联动收敛后先完整根 Schema，再从本轮 Pending 递归补齐同步前置、去重并重排，按本轮前置资格执行；外部任务交 Host，独立规则不等待网络。就绪 → 字段观察 / 联动就更新其来源和字段聚合，有变化就通知对应消费者，不等待全部异步任务结束才展示；完整校验仍须覆盖并等待全部适用义务。
- **状态与外部能力：**Working Data、只读 Context、Scope / 规则 / 订阅、能力绑定和校验状态各有所有权；Flush 计数、预算与受限 Trace 只属于本轮。物料和纯函数契约供 L2 检查，实现分别在 L4 与 L3 绑定；Request 结果返回物料，业务值经 Binding / Command 写入。Context 替换使用独立受控入口，不是 Data Command，也不触发 Reaction。

局部机制继续见[整体领域骨架](#l3-domain-model)、[状态所有权](#l3-ownership)、[Flush 生命周期](#l3-flush)、[校验与结果](l3-validation.md#validation-round)及[物料 / Host 接入](extension-integration.md#materials)。总图不替代这些完整设计，也不表示生产 Runtime / SDK 已实现。

## L3 · Runtime：状态、身份与内部执行 {#runtime}

核心投入集中在复杂表单的状态一致性、动态数组、依赖传播和时序边界。Runtime 拥有唯一可写 Working Data；不拥有业务网络请求、Resource Store 或通用外部动作执行器。

| 内部模块 | 需要设计的内容 | 边界 |
| --- | --- | --- |
| Data / Field State | 工作态、读取、字段状态、订阅与输出 | 允许无效工作态，不保留第二份可写业务真相 |
| Scope / Identity | 实例身份、数组增删移动、词法引用关联 | 下标不是永久身份，不强制注入业务 `__id` |
| Expression / Dependencies | 纯求值、依赖失效、缓存和成本保护 | 不发请求、不写数据、不执行任意脚本 |
| Reactive Engine | 消费 L2 计划，按来源 / 引用 / Scope 匹配统一订阅；按生命周期激活 | 不重复扫描 AST，不统一各消费者的执行策略或直接刷新组件 |
| Command / Reaction | 数据修改、实际变化、触发候选、门控和同步级联 | 不增加异步 Reaction 或业务事件总线 |
| Validation / Readiness | Schema、内部约束、外部义务、Issues 和有效性 | 不执行远程校验或替代 Host 提交许可 |
| Flush Outcome / Diagnostics | 本轮执行结果、临时 Trace、整体预算和异常报告 | 不做局部 Health / 影响链传播，不逐步保存生产全量快照 |
| Instance Lifecycle | 实例装载、真实 Scope / 规则新建、替换与销毁 | runOnActivate 仅新实例；业务编辑 / 恢复策略归 Host |

### 整体领域骨架与协作入口 {#l3-domain-model}

2026-10-22 用户确认先整理完整 L3 领域，再逐模块补齐可实现契约。FormRuntime 是运行实例的统一入口：消费兼容 PreparedForm、初始数据、确定纯函数实现、Host 能力及只读 Context，交付数据 / Scope 读取、求值、订阅、修改、联动结果、校验结果和诊断。下表为协作与状态所有权，不要求建立同等数量的包、基类或独立引擎。

| 协作模块 | 输入、主要功能与输出 | 状态所有权 |
| --- | --- | --- |
| 装载与实例生命周期 | 核对 Prepared / 能力，接管输入，初始化、替换和销毁；建立或结束其余模块 | Runtime 身份 / 代次、生命周期、能力装配 |
| 数据与 Scope | 接收受控修改，提供稳定读、快照、成员身份及位置解析 | 当前不可变 Root、数据修订身份、Scope 登记；一次结构操作一致发布 |
| 引用与表达式求值 | 使用读取视图与词法绑定解释 Reference / Expression / ValueSpec，调用确定纯函数，返回值或求值错误 | 静态可复用准备及临时调用上下文；不持有另一份业务数据 |
| 统一观察机制 | 消费 Prepared watch 或明确引用，查候选、比较前后观察值、通知各消费者 | 活跃订阅与依赖索引；释放随消费者 / Scope 生命周期 |
| Command 执行 | 解析目标与调用值、检查结构、修改 Data / Scope、完成本条变化检测 | 临时 ChangeContext 与单条执行结果；有序 batch 保留逐条事实 |
| Reaction / Flush | 绑定规则实例，去重 Pending，读取最新数据执行，同轮级联与预算停止 | Reaction 实例、Pending、调度阶段、临时 Flush Context |
| Validation | Schema、同步前置、Internal / External 执行，来源 / 字段聚合及完整校验 | Constraint 实例、Pending、来源结果、任务代次、完整调用与输入证明 |
| 诊断与 Trace | 接收真实执行事实，记录受限来源、错误及中止原因，交付 Host / Devtools | 本轮受限记录及提取报告；不参与调度许可 |

| 核心关系 | 身份与生命周期 |
| --- | --- |
| Runtime → Data / Context / Scope | Data 与 Context 各有输入身份；真实替换 / 销毁使旧实例代次失效，晚到调用不能借新实例发布 |
| 词法绑定 → 数据位置 / 成员身份 | Binder 名称不是 ScopeId；不同别名可绑定同一底层成员，根级规则有唯一根上下文 |
| 规则声明 + 真实绑定上下文 → 规则实例 | Reaction / Constraint 还要结合声明身份，不能只用下标或 ScopeId 混同同项多条规则 |
| Command → ChangeContext → 消费者失效 | 前后 Data / Scope 读取视图只服务本条比较，检测后释放，不进入 Pending 或异步任务 |
| Snapshot / 调用读取视图 → 确定输入 | 数据快照稳定；异步调用还须保留对应 Scope 与 Context 读取视图，成员移动后不能按新位置读旧输入 |
| Constraint 实例 → 来源结果 / 执行任务 | 来源归属稳定；每次任务有独立代次，同值往返不能复活旧请求 |
| 完整校验调用 → 整体输入与覆盖集合 | 单任务适用性与整表证明分别判断，普通增量没有整表完备性含义 |

```diagram
{
  "id":"figure-l3-domain-flow",
  "title":"L3 模型、修改、联动与校验的贯穿流程",
  "rows":[
    [{"title":"兼容 Prepared + 初始 Data + 能力 + Context","body":"装载检查 → 建立 Runtime / Scope / 规则；保留 Host 初值优先与真正缺失默认值语义"}],
    [{"title":"Host / View → Command","body":"统一求值、检查结构、不可变修改；本条 Data / Scope 一致发布","major":true}],
    [{"title":"统一观察","body":"候选定位 → 前后逻辑值比较 → 生命周期处理；各消费者分别响应"}],
    [{"title":"Reaction / Flush","body":"Pending 去重，执行读最新值；Command 写回继续当前轮；超限清空剩余任务"},{"title":"View / Host","body":"通知重读当前状态；首次读 / 订阅安全交接，呈现节奏由 L4 决定"}],
    [{"title":"统一 Validation","body":"Flush 结束后先根 Schema，再按同步前置执行内外校验；独立规则不等待网络，无 Reaction 时独立启动"}],
    [{"title":"结果与交付","body":"核对任务 / Scope / 输入资格 → 来源替换及字段聚合；完整调用覆盖全部适用义务后交付对应快照"}]
  ],
  "arrows":["↓","↓","↓","↓","↓"],
  "note":"初始化 / 新实例与显式完整校验有独立入口；异步不计入同步 Flush。诊断贯穿各步。Context 替换由 Host 显式管理，失效呈现与校验但不自动触发 Reaction。"
}
```

对外能力按创建 / 替换 / 销毁、read / snapshot、Scope 查询、Prepared 求值、dispatch、数据 / 校验订阅、Flush 结果观察、局部 / 完整校验、执行事件与诊断分组。数据读取须区分值、Missing 和无效 Scope；订阅返回可释放关系，通知表达重读当前状态，不要求重放事件形成另一份数据。DataWatch 不涵盖执行事件或校验 Issue；显式 ValidationWatch 使用独立字段状态源，共用观察注册与生命周期。

三个完成边界分别交付：Command 返回表示本条数据修改完成；Flush Outcome 表示联动正常结束、带错误结束或预算中止；完整校验结果表示确定输入的适用义务是否全部通过。三者均不等于 UI 已绘制或 Host 已提交。

后续顺序是整体骨架 → Data / Snapshot / Scope → 引用与求值 → Command / 观察 → Reaction / Flush → Validation → 生命周期及 Host / L4 接缝联验，再排代码交付。每个模块统一输出输入输出、状态、步骤、失败 / 清理和验收。已有原则直接整理；接口名称、容器、类型组织由维护者细化，只有新可观察行为或真实冲突才重新讨论。这里没有声明生产 SDK 已冻结或 Runtime 已实现。

### State Store：数据与状态如何分开

| 类别 | 示例 | 所有权与提交关系 |
| --- | --- | --- |
| Working Data | 年龄、姓名、目的地、被保人数组 | Runtime 中唯一业务数据；工作态可不合法 |
| 纯求值结果 | isMinor、动态摘要、View Props 值 | 可缓存，但不因此自动进入业务数据或输出 |
| 校验与 Field State | Schema / Constraint 状态、Issues、有效性 | Runtime 管理，经既有 Binding 供物料消费 |
| 业务编辑状态 | Dirty、业务 Baseline、Reset 意图 | Host 自行定义和保存，不属于 Runtime 核心状态 |
| 局部 UI State | touched、焦点、输入法组合态、弹层开闭 | Renderer / Material 管理，不成为第二份 Working Data |
| 外部请求状态 | loading、error、候选列表、报价结果 | Host / 物料服务管理；写业务字段时显式 Command |
| Host 业务输出 | Host 构造的提交请求数据 | 归 Host；不作为 Runtime 第二份核心状态，不提供输出转换流水线 |

数据采用不可变 Working Data Root + 结构共享：有效 Command 同步发布新 Root，旧 Snapshot 保持稳定，未变化子树可复用。每条 Command 保留前后 Root 进行观察比较；推荐 Object.is 比较观察值，子路径同值跳过、对象 / 数组新引用保守失效，不逐步深比较全表。具体更新、缓存、防御外部原地修改、存在性与跨端等值仍需验证；不可变语义不要求每步深拷贝全表，也不要求永久保留所有旧 Root。

Data / Scope 与活跃观察者跨轮存在，稳定快照可由消费者持有；Host 可自行保存业务 Baseline 和 Dirty；计数与完整 Trace 仅属于本轮 Flush Context；Validation 自管 Issues / 新鲜度；异常在清理前提取报告交 Host。不建立局部 Health、父子规则控制与链级恢复；安全预算保护整个 Flush。状态所有权继续分别管理，详见 [状态所有权](l3-reactive-engine.md#l3-ownership)。

Typed Read 失败不能静默回退旧值；Missing、null、空字符串、0 与 false 分开。初始化缺失时由业务 when / Pure Function 明确跳过或返回 null，用户清空时如需清空派生值必须显式写回；跳过不会自动清旧值。不建立通用 Reaction Ready 状态机；首次激活已确认显式可配置，默认不执行，现行字段 runOnActivate 与 createRuntime 初始化入口已实现。读取结果和诊断的当前 SDK 形状见 ReadResult / Diagnostic，发布兼容承诺尚未冻结。

### Scope & Identity：动态数组不是普通 splice

```text
Form Instance
└─ insuredList
   ├─ Runtime Item ID: a1
   │  ├─ age
   │  └─ guardianName
   └─ Runtime Item ID: b2
      ├─ age
      └─ guardianName

删除 a1 后：b2 的当前数组路径改变，实例身份不应串项。
字段身份方向：Scope Instance Identity + Field Definition Identity。
当前 Data Path 是可变地址，不是永久身份，也不是业务 ID。
```

详细设计包括数组插入、删除、移动、替换、嵌套 Scope、注册销毁与状态回收，以及错误、外部义务、订阅、Trace 和组件实例如何跟随身份。单次结构操作不能暴露 Data 与身份映射的半完成状态；执行前取消已删除 Scope 的过期任务。必须用兄弟项隔离、重排、替换和删除后异步结果等用例验证。

明确位置事实存为父 Scope + 相对集合位置 + 本层位置，完整路径按需向上解析；父被保人移动时，不重写其全部受益人的绝对路径。相对年龄观察沿同一 ScopeId 比较，固定索引观察沿同一物理位置比较。结构操作前推荐短暂保存受影响集合的旧位置视图，提交后完成比较即释放，不能只保留同一个可变 Registry 引用；旧 ScopeChange 不传入 pending 或沿规则链传播。整数组替换即销毁旧成员并创建新成员已确认，即使数据相同也不复用身份；生命周期实现须验收，见 [Scope Index 与旧视图](l3-data-scope.md#l3-scope-index)。

### Dependency & Rules：纯派生与修改分开

```diagram
{
  "id":"figure-dependency",
  "title":"图 4 · Dependency Plan → Subscription：同一输入参与不同消费者",
  "rows":[
    [{"title":"L1 · 年龄与监护人姓名","body":"isMinor = age < 18；Constraint when + assert；View 动态 Props"}],
    [{"title":"L2 · 递归分析与静态计划","body":"Constraint 观察 age + guardianName；父 View 观察 age；保留 Scope 模式"}],
    [{"title":"L3 · Data + Reactive Engine","body":"按状态来源、引用与真实实例匹配已激活订阅","major":true}],
    [{"title":"guardianName 的 View Props","body":"L4 随挂载订阅；父级条件观察者负责创建子视图"},{"title":"guardianName 的 Constraint","body":"L3 随 Scope 激活；未成年姓名非空，独立于 View 生命周期"}]
  ],
  "arrows":["↓","↓","↕"],
  "note":"纯表达式自身没有订阅生命周期，读取不必然触发业务行为。图中的 required 不新增数据字段；校验状态变化不触发只观察 Data 的 Reaction。需要保存计算值时另行声明 Command。"
}
```

高频、确定性的展示派生优先纯计算。表达式不发请求、埋点或任意修改其他数据；业务字段需要修改时使用 Command / Reaction。

| 设计点 | 方向与待验证项 |
| --- | --- |
| 依赖追踪 | 消费 L2 静态 Dependency Plan，统一按状态来源、引用与实例匹配；定义缓存失效 |
| 全量与增量 | 初始化建立业务观察关系，L4 按挂载激活 View；首次校验与读取有独立入口 |
| watch / when | Reaction 只用显式 watch；Constraint 按使用位置合并 when / assert 或 external watch；失效不等于请求 |
| then 顺序 | 同步、有序 Command / host.emit；同目标后写覆盖，不默认引入 priority 或冲突仲裁 DSL |
| Reaction 交付 | 最新状态收敛；同实例 pending 合并，执行后再次失效可重新入队；每次执行读取最新 Data |
| 循环与成本 | 纯表达式环尽早诊断；同值短路、单实例与本轮次数保护；潜在规则环不等于死循环 |
| 等值与索引 | 一次对象替换命中已有观察子树，再比较前后观察值；Object.is / Trie 模板为推荐，索引命中不等于失效 |

纯表达式本身不写数据，因此不能沿用最初稿“多个纯派生规则写同目标一律报错”的假设。对 Command / Reaction 的潜在写入可以做诊断，但合理的有序覆盖不能自动当作非法协议。

L3 概念入口为 read / dispatch / subscribe，支持 Prepared 计划 + Scope，或 Host / 调试器给出的明确引用；释放函数随调用方生命周期管理。状态引用、Prepared 求值与只读快照已由当前 Runtime SDK 实现，L1 已加入只读 ValidationReference 与显式 ValidationWatch，见[状态观察](l1/04-command-reaction.md#reaction-state-host)；当前 SDK 使用 observe / evaluateValue / snapshot 等入口，见 Runtime README。只改变 Issue 不使 Data-only Reaction 重跑；新 Reaction Command 继续经同一数据入口传播。有效 Change 与 Flush 的职责已明确，底层路径 / 事件编码、ID 与正式接口仍需固化。

### Command & Flush：即时修改与独立收敛边界

```diagram
{
  "id":"figure-transaction",
  "title":"图 5 · Command / Flush：即时数据更新与联动收敛",
  "flow":true,
  "rows":[
    [{"title":"Operation → Command","body":"保留来源与显式动作次数；batch / then 按序执行"},{"title":"即时更新 Data + Scope","body":"不可变 Root、结构共享；单次结构操作内部一致"},{"title":"索引候选 → 观察值比较","body":"临时前后 Data / Scope；只投递失效标识与必要 ChangeId"}],
    [{"title":"延迟启动同步 Flush","body":"逐 Command 检测与 pending 去重；执行时读最新 Data / Scope，内部写回留在本轮"},{"title":"收敛或保护停止","body":"同值短路、次数预算；可隔离错误继续独立行为；超限整体停止，保留已写数据"},{"title":"追踪 / 通知 / 释放","body":"临时有序事实与 Change 来源；异常提取报告；同步回调写回归本轮","major":true}]
  ],
  "arrows":["↓"],
  "note":"取代早期候选树 / 整组原子提交议题图，保留原图 ID。Flush 不提交或回滚整轮数据；默认 batch 非原子。单命令可隔离错误继续、整体熔断已确认；同轮回调已确认；队列与 FlushOutcome 已实现；生产预算仍待标定。"
}
```

Command 保留修改意图、顺序与次数。两次添加被保人不能因为目标路径相同就合并成一次；一次替换对象也不一定只产生一条变化引用。

来源不改变检测语义：Host 导入、用户输入、Reaction 写回都在每条 Command 内一致更新 Data / Scope、查候选并比较逻辑观察值；不建立派生字段所有权。Trie / 路径模板只定位已有观察路径，父对象导入不需遍历全部数据字段。Reaction、Validation、View、Host 共享数据检测，执行完成 / 中止 / Error 事件经独立事件观察或 Trace，不进入 Data Trie。完整前后读取、索引、逐命令合并轨迹见 [L3 数据变更链路](l3-data-scope.md#l3-change-detection)。

统一订阅不统一完成条件：Renderer 可读取最新状态，Reaction 按最新状态收敛，待执行时合并重复失效；需要每次执行的新增或副作用应明确发出 Command / Host 事件。延迟一次启动 Flush，同步执行直到结束；多个外部 Operation 可合并一轮，内部联动留在当前轮，后续异步操作另起一轮。数据即时写入不保证 UI 先绘制，也不冻结所有订阅的同步交付顺序，见 [跨层时序](dependency-reactivity.md#dependency-scheduling) 和 [L3 归属边界](l3-reactive-engine.md#l3-flush)。

应验证即时读取与旧快照稳定、单次结构操作的身份一致、pending 合并、同轮级联、显式动作次数、预算停止及异常恢复。默认 batch 与 then[] 有序实时写入，不默认整体回滚，允许存在尚未联动完成的工作态；业务不合法由 Validation 报告，不能当作结构性执行失败。可隔离错误不自动阻断后续独立子命令和规则，后续触发只看真实 Change / 自身 Watch，不检查上游成功状态；精确错误类型和接口继续固化。

外部 I/O 由 Host 管理。`array.insert` / `array.move` 已确认数字 / 锚点双定位、移动按最终下标和位置失效明确失败；ArrayPosition、命令执行与结果 / 诊断类型已实现。超限统一中止整个 Flush，不能自动把遗留任务搬到下一轮无限重试，也不能把中止记成正常收敛。不做局部熔断、下游禁用或 Health 影响链；当前轮中止清队列、后续新触发正常执行已确认，保留填写和独立校验，轮次结果 FlushOutcome 已实现，生产阈值待标定，详见 [错误与整体熔断](l3-reactive-engine.md#l3-errors)。

### Validation：合法性不能只依赖 UI {#validation}

Runtime 管理完整根 Schema、内部 / 外部 Constraint、来源 Issues 和有效性。以完整 Schema + 本轮增量 Constraint + 字段聚合明确执行方向，物料经既有 Binding 读取聚合结果，不新建 `validationBind`、`errorBind` 或独立 ValidationMetadata DSL。

- UI 负责必填提示、错误展示和校验中反馈；这些投影不能替代独立的数据约束。
- Host 执行外部校验并上报，Runtime 按实例与当前有效依赖接收结论；unverified、pending、error 不可冒充 valid。
- Data Change 阶段复用依赖索引登记去重 Pending，正常 Reaction 收敛后执行完整根 Schema / 本轮 Constraint；前置在本轮检查并必要重排，不建结果 PubSub 或通用异步 DAG。
- 推荐按 Source 原子替换 Issue，以稳定 Scope + 相对路径派生字段聚合；对象 / 数组可报告容器错误。通知只关注实际聚合变化，内部执行完备性仍需维护。
- 隐藏不自动清空或排除业务字段，也不删除共享约束；具体输出语义由数据契约与 Host 决定。
- Readiness 由当前数据的 Schema、内部约束、全部当前适用异步约束决定，不以历史 Reaction 成功为条件；熔断后仍可独立完整校验并由 Host 提交，不建立局部受损范围传播，不替代 Host 的权限、风控和真实提交。

完整 Schema 不自动拆分局部单元；Adapter 统一标准化 Issue，Web 复用编译函数、Dart 用等价契约实现。消息模板 + 局部覆盖、Source Store / 字段索引为推荐；requires / 消息覆盖语法、严格缺失前置的增量兼容、完整返回与跨端性能尚待验证。完整职责、取舍、19 项来源状态和 16 个案例见 [L3 校验专题](l3-validation.md)。

### 外部竞态与表单生命周期

```text
destination = JP → Host 发起 requestQuote(JP)  // 请求 A
destination = SG → Host 发起 requestQuote(SG)  // 请求 B

A 晚于 B 返回：
  Host 检查它仍适用于当前实例和依赖，不能覆盖当前报价。
  若结果只供展示，留在外部状态；若要写业务字段，显式提交 Command。
  外部校验报告还要由 Runtime 检查登记义务与依赖有效性。
```

请求取消、去重、超时、重试、Loading/Error 和 Cache 归 Host；不能为恢复原图而把 Resource Manager 放回 Runtime。实例销毁、重初始化、数组项替换、同值往返和 ABA 等有效性问题仍需跨层共同验证。

| 生命周期操作 | 语义 / 设计边界 | 仍需设计 |
| --- | --- | --- |
| 实例装载 | Host 初始输入 / 缺失默认语义；创建 Scope 与规则，新实例按 runOnActivate 首次运行 | 激活字段形状、稳定快照与实例 / 完成 SDK；无自动业务基准 |
| Update | 修改当前 Working Data | 批量边界、诊断、失败与通知契约 |
| 新外部数据 / 实例替换 | Host 明确选择普通 Command 或真实替换实例；不把已有实例当作首次激活重跑 | 身份、订阅、校验与外部义务的生命周期 |
| Host Reset 便捷封装 | Host 根据业务意图生成普通 Command，已有规则只响应有效 Watch 变化 | 业务 Baseline / Dirty 策略由 Host 决定；不设 Runtime 重算模式 |
| 实例销毁（SDK 名称待设计） | 释放实例、订阅及适用性关联 | 与 Host 请求和 Renderer 销毁的协作 |

Host 管异步加载和防止迟到输入覆盖编辑；Runtime 只装载明确输入、管理真实实例并提供稳定 snapshot。Host 可在所需联动完成后自选快照为业务基准，Dirty 和 Reset 策略也归 Host。Reset 仅生成普通恢复 Command，Watch 未变就不新增已有规则任务；不增加主动重算或编辑来源分类。当前 Command 的 previousRoot 与 Flush Trace 继续只为比较和诊断，详见 [实例初始化与业务基准](l3-data-scope.md#l3-initialization-baseline)。

**本层交付物与验收：**不可变数据与状态模型、身份规范、Command / 订阅 / 快照 API、Flush 时序、预算、可隔离错误契约与整体熔断、Outcome / Trace、校验有效性及生命周期契约。重点验证多级联动、兄弟项隔离、重排替换、同目标有序覆盖、过期结果、重初始化与异常恢复；[C01–C18](l3-reactive-engine.md#l3-acceptance) 是设计验收，尚非实现通过记录。

## 执行基线与设计状态 {#l3-baseline}

核心路径是：外部 Operation 发出 Command → Working Data 即时更新 → Dependency Index 定位 Watch 候选 → 比较前后观察值 → 无有效变化则跳过，有变化才使对应 Reaction 入队 → 合并 pending → 延迟启动 Flush，执行至队列清空或安全停止。Reaction 写回继续进入当前 Flush；前轮结束后到达的 Host 异步结果形成新的失效和轮次。

当前规范按状态所有权、数据 / Scope、执行、错误、追踪和消费者顺序展开，讨论总账单独放在[设计演进](design-history.md)。非原子修改、Scope、Host 编辑边界和错误 / Trace 的背景分别见 [ADR-006](decisions/ADR-FE-006-command-flush.md)、[007](decisions/ADR-FE-007-scope-comparison.md)、[008](decisions/ADR-FE-008-host-editing.md)、[018](decisions/ADR-FE-018-flush-round-protection.md)。仍需整理的 Outcome / 完整结果 SDK、旧值防御及实际验收在[审查问题](design-review.md#consistency-findings)与[路线 T02 / T04](governance.md#design-roadmap)集中跟进，不改变本篇已确认基线。

| 状态 | 内容 |
| --- | --- |
| 已确认 | L3 只消费 PreparedForm；不可变 Working Data / 即时 Command / 非原子 batch；最新状态合并与同轮级联；延迟启动同步 Flush；可隔离错误继续独立命令和规则；超限整体熔断；临时线性 Trace 与最小来源；首次入队保留起点，实际执行建立本轮上下文；缺失值由业务规则处理 |
| 已确认方向 | Devtools 可独立观察并保存执行历史，开启与关闭不改变语义 |
| 推荐 | Object.is 观察值比较、Trie / 模板组合、局部旧 ScopeReadView、位置型匹配；稳定队列顺序、静态 SCC 算法、Trace 头尾截断和编译 Source Map |
| 已确认 · 现行职责边界 | 每条 Command 前后 Root / Scope 检测；常规 Reaction 只响应有效 Watch 变化；runOnActivate 仅新实例首次激活；字段无业务所有权；稳定 snapshot；整数组替换重建成员身份；Dirty / 业务 Baseline / Reset 策略归 Host，不绕过 Watch 重跑已有实例 |
| 待讨论 / 固化 | 首次激活字段形状、实例建立 / 替换与稳定快照 SDK；队列实现、当前轮清队列 / 新触发验收、完整校验结果接口、错误分类及 ABI；业务 Dirty / Reset 策略不再作为 Runtime 未决项 |
| 已实现 / 待验收 | Scope 相对索引、局部旧视图及共享对象防御已有实现 / 回归；整体编辑性能、执行次数、耗时、记录容量和生产上报限频阈值待标定 |
| 延期 | 时间切片 / 优先级、全量或局部 Hash、高级因果图分析、历史 Snapshot 恢复与确定性 Replay |

可隔离错误继续与超限整体熔断已有共识。首次激活默认不执行已确认；字段形状、稳定快照与 Pending 接口继续细化；预算与参数在实现验证中标定。

## Runtime / Host 职责：四条已确认原则 {#l3-runtime-host-boundary}

当前已确认以下原则。Runtime 是协议驱动的数据、规则和校验运行时，保证按声明正确执行；它不推断作者的业务结果期望，也不主动修复未被正确配置触发的字段。

| 已确认原则 | L3 执行含义 |
| --- | --- |
| 数据是事实 | 用户、Host、Reaction 修改同一字段进入同一 Command / 变化检测流程；来源可供诊断，不改变执行资格或字段所有权 |
| 有效依赖变化决定常规执行 | Dependency Index 定位 Watch 候选后比较观察值；无有效变化不新增入队，不因业务结果看似错误重算 |
| 初始化激活是独立入口 | runOnActivate 只在新 Reaction 实例首次建立时应用，不是重跑已有实例的便捷入口 |
| 编辑状态归外部业务 | Dirty、业务 Baseline、Reset 意图由 Host 定义；Runtime 提供稳定读 / snapshot / Command / Validation / Flush 等能力 |

```text
已有 Reaction：watch = [data:/age]，then = set premium 为按年龄计算的值
当前 Data：{ age: 25, premium: 150 }
Host 普通对象导入：{ age: 25, premium: 80 }
观察 age：25 → 25，无有效变化，已有规则不新增入队
结果：premium 保持 Host 导入的 80；Runtime 不主动恢复成 150
```

若整对象本身被另一条规则明确观察，引用变化仍可能使那条规则失效；这不改变只观察 age 的规则。常规修改不重建现有实例来伪装首次激活。若数组替换按身份契约真正创建新 Scope / 新规则实例，则按新实例的显式激活策略处理，不能把它解释成已存在实例的 Reset 重算模式。

“无有效变化不新增入队”不取消先前变化已经登记的 pending。逐条 Command 的 age 25→26→25 发生了两次有效观察值变化，同实例可合并执行一次；它与“从头到尾 age 都是 25、仅 premium 被覆盖”不同。Flush 的队列处理仍以已登记失效为依据，不通过业务结果正确性或上次执行参数猜测是否运行。

Context 的当前契约：Command 只修改 Data，Reaction.watch 仍为 DataReference[]，Context 对表单表达式只读且由 Host 提供。Context 不属于 L1 Command 的写入目标，也不因此新增 Context Watch 或强制重算。Host 可通过显式替换快照更新 Context，并保守失效挂载动态表达式及校验；它属于实例管理操作，不自动触发 Reaction，见 [Context 交接](extension-integration.md#host-context-update)。

以下是后续实现的边界验收，不是现有候选探针通过记录：

| 编号 | 场景 | 必须观察到 |
| --- | --- | --- |
| B01 | 无先前 pending，导入 age25 / premium80 覆盖 age25 / premium150 | 只 watch age 的现存规则不执行，不自动修复 premium |
| B02 | Host Reset 恢复值，所有相关 Watch 均无有效变化 | 不新增已有规则任务，不重用 runOnActivate |
| B03 | Host 恢复 Command 使实际 Watch 值改变 | 正常匹配、比较、入队、合并与 Flush，无特殊 Reset 分支 |
| B04 | 取得 snapshot 后继续修改 Data | 旧快照稳定；读取不 Flush、不标 Clean、不创建 Baseline |
| B05 | 新建规则实例，随后仅重挂 View 或恢复同一实例数据 | 首次按策略运行；后两者不会再次当作该实例首次激活 |
| B06 | Host 自选快照与字段定义 Dirty / 保存 / Reset | Runtime 无 isDirty、markClean、resetToBaseline 或用户 / 派生字段分类 |
| B07 | age25→26→25 在 Flush 前先后发生 | 两次有效失效保留语义，pending 可合并；不因最终值等于旧值撤销既有任务 |
| B08 | 尝试将 Context 当作 L1 Command 目标或新 Watch 类别 | 维持只读 Context，Context 不是 watch 来源；显式 ValidationWatch 按 ADR-FE-020 另行处理 |

## 概念与状态所有权 {#l3-ownership}

| 概念 | 含义与身份 | 生命周期 |
| --- | --- | --- |
| Operation | 外部 dispatch 的来源，可有 Operation ID | 不独占一轮 Flush；未命中 Reaction 时可无需 Flush |
| Command | set / patch / remove / array.* / batch 数据修改意图 | 按顺序执行，保留显式动作次数 |
| Data Change | 真实有效变化；Change ID 关联目标 Scope / Path | 用于失效匹配与追踪；同值调用不虚构有效变化 |
| Reaction Instance | Reaction ID + 实际 Scope 身份 | 随 Form / Scope 激活，可在同轮多次执行 |
| Pending | 按 ReactionInstanceKey 去重的待执行集合 | 属于 Reactive Engine，执行或中止时消费 / 处理 |
| Flush | 一次消费待执行实例的过程，具有 Flush ID | 队列清空、执行错误处理或保护停止时结束 |
| Flush Context | 本轮计数、来源、临时 Trace、预算和异常标志 | 首次入队开始收集来源，实际调度时建立执行上下文；结束后封存报告并释放 |
| ChangeContext | 当前 Command 前后 Data / Scope ReadState 与局部 impact | 本次比较结束即释放，不进 pending 或后续轮次 |

| 所有者 | 状态 | 释放 / 更新条件 |
| --- | --- | --- |
| L3 Data / Scope | 当前不可变 Root、稳定只读快照、数组身份与位置映射 | Runtime 生命周期；有效 Command 更新当前状态；不持有业务 Baseline / Dirty |
| Host 业务应用 | 异步加载、所选业务快照、Baseline / Dirty / Reset 意图、保存与提交策略 | Host 自行定义与保存；恢复意图生成普通 Command |
| Reactive Engine | 依赖索引、活跃观察者、pending、调度阶段 | 订阅 / Runtime 生命周期；不是全部放进 Context |
| Flush Context | 总执行数、单实例次数、外部重入标记、有序执行证据 | 本轮结束 / 中止；异常先提取报告 |
| Validation | Issues、校验状态、请求新鲜度及失效状态 | 独立于 Reaction Flush |
| Diagnostics / Host | 真实错误、整体预算停止原因、必要轮次报告 | Context 清理前提取；Host 可去重限频，不维护局部 Reaction Health 传播 |
| L4 / Host / Devtools | UI 状态与框架订阅、外部任务、可选历史 | 各自消费者生命周期 |

调度阶段与轮次结果分别表达。`idle / scheduled / flushing` 是阶段草图；`settled / aborted / completed_with_errors` 是结果草图，均非正式冻结枚举。可隔离错误继续其他独立行为已确认，但不能把出错或预算中止记为无异常收敛。曾建议跨轮保存局部不可信范围，明确不建立这套 Health、失败下游禁用或链级恢复状态；Submit 不以 Reaction Outcome 成功为门槛，完整校验与联动结果独立报告，准确接口待固化。

Runtime 实例只根据兼容 PreparedForm 建立，按 Prepared Observation 匹配实际变化；不直接解释原始 L1，也不在运行时补 Watch。ABI 失败不得回退到原始定义解释器，见 [两份协议与唯一执行路径](dependency-reactivity.md#dependency-compiled-protocol)。

## Flush 生命周期与外部操作归属 {#l3-flush}

```diagram
{
  "id":"figure-l3-flush",
  "title":"即时写入与一轮联动收敛",
  "rows":[
    [{"title":"Operation → Command","body":"同步更新不可变 Root 与 Scope；按有效变化匹配依赖"}],
    [{"title":"idle → scheduled","body":"首次出现 pending 后安排一次启动，暂存有界触发来源以保留起点"}],
    [{"title":"flushing · 建立本轮上下文","body":"接入前置来源；从 pending 取出实例，读取最新 Data，求值 when，按序执行 then","major":true}],
    [{"title":"当前轮继续","body":"内部有效修改追加失效；同实例执行后可再次入队"},{"title":"本轮结束 / 停止","body":"队列空或整轮预算停止；可隔离错误继续，真实结果与异常报告分别记录"}],
    [{"title":"释放本轮 Context","body":"正常不留生产完整历史；异常先向 Host 提取报告；Devtools 自行保存"}]
  ],
  "arrows":["↓","↓","↕","↓"],
  "note":"Flush 是联动调度边界，数据在每条 Command 时已经生效。可隔离错误继续，超限整体中止；同轮回调已确认；当前轮清队列和后续新触发已确认，队列与 FlushOutcome 已实现；生产预算待标定。"
}
```

延迟一次启动，然后在同一同步执行过程消费任务直至结束；不实现时间切片。首次 Reaction 入队、进入 scheduled 时即开始保留首次有效变化及后续合并来源，不能等执行开始才采集起因。2026-10-24 按用户确认将来源暂存与实际执行上下文分阶段实现：scheduled 阶段仅暂存有界元数据，实际 drain 时创建独立 FlushContext / Journal 并移交来源，结束后先封存只读报告再释放。微任务启动是当前实现选择；记录截断不影响调度预算。

| 发生时机 | 数据 | Reaction 归属与状态 |
| --- | --- | --- |
| scheduled 期间多个 Operation | 每次同步生效 | 加入已安排轮次，合并同一 pending 实例 |
| Flush 内部 Reaction 发出 Command | 同步生效 | 新失效加入当前轮，不为 A → B → C 各开一轮 |
| 前轮结束后 Host 异步返回 | 同步生效 | 新失效安排下一轮，计数独立 |
| 同步 Flush 中外部回调重入 dispatch | 同步生效 | 归当前轮，沿用去重与执行预算；不另开轮次或重置计数，来源标记为实现细节 |
| 外部修改未命中 Reaction | 同步生效 | 无需安排 Reaction Flush；Validation / View 仍按自身契约响应 |

同一 JS 主线程的普通输入事件或 Promise 回调不能插入已经开始的同步 Flush 调用栈。同步订阅回调、外部注册代码在当前 Flush 中写回，仍归当前轮，沿用既有整体保护；不额外定义通知队列或第二套通知保护协议。外部重入不重置本轮计数；此时队列能否清空仍可判断，但报告不能轻率归因为纯内部循环。

### 同步回调写回与当前轮次

同步订阅回调在 Flush 执行期间再次通过 Command 写入数据，写入立即生效，由此产生的联动直接归当前 Flush 处理，沿用本轮去重、执行计数与熔断预算；不另开一轮、不重置预算、不再次延迟启动。Flush 尚未开始时，Pending 用于汇集同步修改和快速交互的重复触发，再统一启动；当前轮真正结束后的新修改进入后续轮次。执行器内部的待执行集合只是当前轮的工作集合，不等于下一轮或一个新的调度阶段。

不新增独立的“通知先入队、回调返回后再交付”机制要求，也不新增第二套通知熔断协议。实现验收须证明同步回调写回不绕过现有整轮保护、不因嵌套调用失控；具体内部容器和调用栈处理属于实现细节，不能把它重新列为未决业务行为。

## Reaction 合并、重入队与执行顺序 {#l3-reactions}

2026-10-19 已确认：Reaction 不声明彼此前后依赖、业务优先级或拓扑调度关系。一个完整业务计算优先在同一 Reaction 内表达；跨 Reaction 通过真实 Data Change 与自身 Watch 自然级联。业务不应依赖无关规则谁先执行，稳定调度顺序用于复现与排查，不是业务排序手段。多条规则竞争覆盖同一字段、结果依赖最后写入者时，先检查规则拆分与数据模型，不新增优先级或冲突仲裁协议。

Pending 按具体 Reaction 实例去重，执行时读取最新输入；取出执行后再次被有效变化命中仍可重新入队。不承诺任意冲突配置都与顺序无关，也不改变同一 then[] 内显式 Command 的有序语义。同步回调写回归当前轮已确认，具体队列容器与调用栈处理留给实现验收。

Reaction 可通过 host.emit 同步发起 Host 行为，不等待其异步完成。Host 负责报价请求、取消、过期与防覆盖，适用结果通过普通 Command 写回；Reaction Pending 去重与 Host 请求合并分别处理，显式两次 emit 保留两次交付。具体观察与出口见[状态响应](l1/04-command-reaction.md#reaction-state-host)。

Reaction 是最新状态驱动的收敛行为。年龄和产品在执行前各变化一次，同一个保费实例只保留一份 pending，执行时读取最终年龄与产品；追踪保留两条失效来源。需要每次点击都新增一条记录的业务，使用明确 Command / Host 事件表达，不依赖 Reaction 的触发计数。

```text
invalidate(instance, change):
  尚未 pending → 登记实例与触发来源
  已经 pending → 合并触发来源，不重复入队
takeNext():
  从 pending 取出并移除实例
  执行时读取最新状态
  执行后再被有效变化命中 → 允许重新入队
```

推荐按 PreparedForm 稳定规则顺序完成初始入队，执行中新增任务按首次登记顺序追加；重复失效不移动已排队实例。推荐当前 Reaction 不被新失效打断，完成当前 `then[]` 后再取下一项，避免规则嵌套调用。业务不依赖跨规则先后顺序已确认；上述具体队列策略仍为推荐，运行中再次失效与通知交付细节继续固化。

稳定顺序帮助复现，不能保证冲突写入的最终值与顺序无关。同目标覆盖、互相依赖、结构修改都需验收。`then` 允许 array.insert/remove/move，但配置必须符合状态收敛意图；无条件反复新增需诊断风险，不能据此假定每次触发均应完整保留为业务事件。

## 初始化、缺失与清空由业务规则表达 {#l3-missing-values}

确认不新增通用 Reaction Ready 状态机。必须区分读取缺失 / 未初始化、null、空字符串、0 与 false，不能用统一 falsy 判断表示“未就绪”。Missing 已由当前 ReadResult 的 missing 分支表达；示意中的 undefined 不作为 JSON 数据值写入协议。

| 场景 | 业务规则需要表达什么 | 结果 |
| --- | --- | --- |
| 初始缺少 age | 用 when 或纯函数的显式空值契约跳过 / 返回 null | 不误调要求有效年龄的保费算法 |
| 用户后来清空 age | 若业务要求同步清空 premium，明确计算并写 null | 该有效 Change 正常影响其他依赖，不默认留旧保费 |
| when 不成立 | 不执行当前 then[] | 跳过本身不会撤销以前写过的值；需要清空应另行表达 |

```text
示意业务纯函数：
  age 为 Missing / null / 空字符串 → 返回 null
  否则 → 按明确的输入类型契约计算保费
Reaction 的 set 把返回值写入 premium，仍经过正常变化匹配。
```

首次激活策略可配置，由 L1 表达、L2 编译，仅在新 Reaction 实例建立时应用；默认不执行，正式字段 runOnActivate 与 Runtime 激活路径已实现。Reset 由 Host 生成普通 Command，没有 Watch 有效变化就不重跑已有实例；这取代旧的主动重算目标。空值处理仍由配置表达，L3 不补 watch 或修复派生值；详见 [初始化与 Host 业务基准](l3-data-scope.md#l3-initialization-baseline)。

## 四种执行轨迹 {#l3-traces}

以下是逻辑演示，字母为规则实例，数值为解释用途，不是运行算法或真实性能数据。

| 场景 | 步骤 | 可观察结论 |
| --- | --- | --- |
| 正常级联 | Operation 写 age=25 → pending A；Flush #1 中 A 写 premium=150 → B；B 写 totalPremium=150 → C；C 无有效修改 | 全部在 #1；队列清空，正常释放 Context |
| 多次输入合并 | scheduled 时 Operation #1 写 age=21 使 A 入队；#2 写 product=PLUS 再命中 A；A 执行一次读取最终二者 | 同一 pending，多对一 triggeredBy 来源 |
| 往复震荡 | A 将 age 17→18 使 B 入队；B 将 18→17 再使 A 入队，持续有效变化 | pending 去重不能阻止循环；整个 Flush 达到预算后停止，保留已写 Data 并报告 |
| 同步外部重入 | Flush #4 中 A 写 premium；通知回调由 Host 同步写 discount；新失效使 B 入队 | 归当前轮、沿用本轮去重与预算，不新开轮次；Trace 可记录外部来源 |

同规则的 `A#1 → B#1 → A#2` 是三次独立执行，需要各自 executionId；不能把 A 的所有执行折叠成一条运行记录。

## 静态风险与运行时有限执行 {#l3-protection}

| 机制 | 发现 / 保护什么 | 取舍与状态 |
| --- | --- | --- |
| 同值短路 | 相同观察值反复写入 | 基本保护；推荐 Object.is / 存在性比较，不默认全表深比较 |
| 同实例 pending 去重 | 执行前的重复失效 | 必须；不解决执行后的往复循环 |
| 本轮总执行数 + 单实例次数 | 无界传播与局部重复 | 必须；计数低成本，具体阈值待标定 |
| 执行边界耗时检查 | 过慢轮次 | 可以报告并阻止继续调度；不能强制抢占正在执行的同步函数 |
| L2 Watch / Write 图与 SCC | 潜在规则环链 | 推荐；Tarjan / Kosaraju 可用，风险默认 Warning，不能禁止所有环 |
| 每步全量 Data Hash | 重复数据状态 | 不做默认判环；单次 O(S)，K 次为 O(K×S)，也漏掉无限增长 |
| Runtime 执行图与 SCC | 实际反复触发的规则集合 | 不进入默认热路径；留给 Devtools / 高级诊断 |
| 局部指纹 / Merkle 式 Hash | 局部往复状态 | 延期；需要完备读取、Scope 和状态信息 |

重复 Data 不等于重复完整执行状态，图中有环也不等于一定不终止。目标是提前提示风险、限制执行、解释异常，无法对任意函数与修改组合通用证明终止。正常多轮收敛不用报错；已删除 Scope 的过期待执行任务正常取消。

早期本地 Node 的毫秒数不能成为 Web / Flutter 的性能预算。全表 Hash 的复杂度随数据字节数 S 增长；轻量记录成本主要随执行事件数、实际变化与额外复制参数量增长。具体常数须用大型数组、高频输入及目标平台 benchmark 标定。

## Command 错误隔离与整体 Flush 熔断 {#l3-errors}

2026-10-19 已确认：Reaction 错误只表示相应联动未完成，不自动阻止提交；独立规则继续，已写 Data 不回滚。代码异常报告交 Host，用于正确用户提示与监控告警；网络失败由 Host 提示 / 重试。业务校验不通过与校验执行异常分别表达，必要校验无法完成不能放行。非关键辅助操作失败不阻断主流程。

整体预算熔断只停止整个当前 Reaction Flush，清空剩余待执行 Reaction；保留已写 Data、填写 / Command、读取 / 快照与独立完整校验。旧 Pending 不跨轮转移或自动重试，当前轮真正结束后的下一次外部交互或 Host 新操作若产生有效 Watch 失效，按正常流程建立新轮次与新预算。无有效变化不伪造入队，不补跑被清空任务，不重新激活已有实例，也不需要显式恢复入口。开发端报告可定位错误，生产交 Host 监控告警及业务承接；继续填写不保证未执行的业务计算已经完成，必须成立的关系仍由 Constraint 检查。不建立局部 Health 或失败下游传播。2026-10-22 本轮决定替代原持续暂停方案，见 [ADR-FE-018](decisions/ADR-FE-018-flush-round-protection.md)。

Host 主动对当前数据发起完整校验，不为提交额外触发一轮 Reaction，也不要求历史 Reaction 成功。Schema 与全部适用同步 / 异步 Constraint 通过后，可提交该次证明对应的数据快照。必须成立的业务关系应表达为校验约束，不能只依靠联动成功维护。联动 Outcome 与完整校验结论分别报告；校验通过不把熔断改记为正常收敛。若数据已无法可靠读取或校验机制不可用，则无法证明合规，不允许据此提交。

| 现象 | 当前约束 | 尚需固化 |
| --- | --- | --- |
| 合法多轮收敛 | 正常结束，不持久上报完整轨迹 | 不将次数多直接判错 |
| 疑似往复写入 / 持续覆盖 | 如实记录实际是否收敛，可报告异常模式 | 分类、阈值与上报限频 |
| Function / Command 可隔离错误 | 记录并报告，不回滚其他成功修改；后续独立 Command 继续尝试，其他 Reaction 按实际 Change 响应 | 错误类型、诊断、门控求值失败等具体继续条件与 API |
| 单实例 / 本轮执行数超限 | 中止整个当前 Flush，清空剩余 Reaction，不做局部链路熔断 | 下一次新操作产生有效失效时正常建新轮；旧任务不自动续跑，Outcome SDK 已实现，生产阈值待标定 |
| 耗时异常 | 执行边界判断并报告，无法抢占正在执行的同步函数 | 阈值和边界处理 |
| Scope 已删除 | 正常取消过期实例任务，回收关联 | 不作为业务错误上报 |

Reaction 没有执行控制意义的父子关系：A 修改数据使 B 失效，B 不检查 A 的成功状态，只检查自身 Scope、watch 与运行条件。某条命令失败，不自动禁用“下游”，不回滚其他成功修改；后续命令依次读取执行时的最新数据。可隔离错误与预算超限分别处理，安全预算到达时终止整轮，不能把“继续独立行为”理解成忽略保护。

整体停止的最小约束：保留已写 Data；不把停止伪装为正常收敛；清理 Context 前提取真实错误 / 超限类型与临时路径，交给 Host 报告；不自动无限重启同一批遗留任务。清空剩余 Reaction，不以旧任务安排新轮；后续新操作按有效失效正常触发。保留填写、快照与独立完整校验，清队列及新轮预算须实际验收。

Reaction 执行错误的报告必须保留完整触发 / 调用输入、具体 Reaction 与 Scope 实例、配置身份及错误阶段，遵循[完整现场契约](l3-observability.md#l3-error-evidence)。记录可由 Host / Devtools 保存到外部介质，不要求完整历史常驻 Runtime；受限 Trace 不得替代必需现场。此要求不改变执行隔离与熔断规则，当前轻量错误记录仍需补齐验证。

曾保留“局部不可信范围、长期 Health、相关规则恢复后清除标记、利用依赖计划传播影响”的候选，为降低状态机与影响链成本明确替代该方向：不做父子 Reaction 状态、失败下游禁用、局部熔断或链级恢复。解释异常的 Trace 不参与调度和权限决策；Validation 的 Issues / 新鲜度仍按自身契约管理。旧约束完整留在 [整合前正文](../history/README.md#protocol-runtime-v05-integration)。

## Validation、Renderer 与 Submit 的边界 {#l3-consumers}

共用匹配不等于共用完成条件。Reaction Flush 处理同步联动收敛，不等待所有外部校验或 UI 绘制。

| 消费者 | 失效时 | 执行 / 完成时 |
| --- | --- | --- |
| Reaction | 合并 pending 与来源 | 读取最新 Data；有效写入归当前轮 |
| Root Schema | 有效 Data Change 登记待校验标记 | 正常联动收敛后完整根校验一次，不自动拆成 Keyword 单元 |
| Internal Validation | 旧结论失效，实例 ID 去重入校验 Pending | 执行本轮前置整理后的 Constraint；按来源替换、字段聚合 |
| External Validation | 旧结论失效，撤销过期来源 Issue；取消由 Host 负责 | Flush 结束后同批执行，满足同步前置即发起；独立任务不等待网络，返回成功 / 异常均核对有效性 |
| Renderer | 获知最新状态变化 | 读取 Data / Props 与字段 Issue 聚合，不要求消费同步校验的每个中间状态 |
| Submit | 显式完整校验覆盖全部适用约束与输出，不要求 Reaction 成功 | 无 Issue 不等于完备；熔断后仍可校验，完整通过后由 Host 提交 |

已明确正常路径：共享依赖匹配登记校验 Pending，Reaction 收敛后执行完整根 Schema 与本轮 Constraint 链，结果按 Source 保存、字段聚合。没有 Reaction 时校验也有独立入口；初始化 / 主动完整校验不能等待第一次修改。L2 补全可推导依赖，L3 递归补齐本轮前置并按实例去重；requires 类型、实例处理与 FullValidationResult 已实现，不引入前置结果 PubSub。

完整校验需区分当前通过、业务失败、不完备与过期，核对必要外部义务、当前输入与输出。Reaction 可隔离错误不自动阻止提交；整体熔断停止当前轮并清队列，后续新触发正常执行；保留填写与独立完整校验，通过后 Host 可提交对应快照。FlushOutcome 与 FullValidationResult 已实现，正式发布兼容承诺待验收。按局部受损范围 / Health 传播决定提交方案已退出，不引入失败下游禁用；实际提交、权限和风控归 Host。完整职责、推荐存储、异步与 V01–V16 设计验收见 [L3 校验专题](l3-validation.md)。

微任务启动 Flush 可能仍发生在浏览器绘制前，耗时同步纯函数会阻塞主线程，这是当前接受的简化取舍。未来可以替换 Scheduler，但需保持数据写入、收敛、身份及异常契约。

## 设计验收与下一步 {#l3-acceptance}

| 用例 | 场景 | 输入 / 过程 | 必须观察到 |
| --- | --- | --- | --- |
| C01 | 单步输入 | set age=25 后立即读取 | 返回 25，不等待 Flush |
| C02 | 多次合并 | 启动前两次修改 A 的 watch | A 仅一份 pending，执行读最终值 |
| C03 | 链式写入 | A 写 premium，B 观察 premium | B 进入当前 Flush |
| C04 | 重复失效 | A 执行后 C 再改其 watch | A 可重新入队，保留新来源 |
| C05 | 同值短路 | A set 与当前原始值相同 | 无有效 Change，不继续触发 |
| C06 | 动态数组移动 | B 从 index1 移到 index0 | Scope B 稳定；订阅与 Trace 不串项 |
| C07 | 业务校验失败 | 输入超范围年龄 | Data 接受，Validation 产生 Issue |
| C08 | 简单自环收敛 | age16→A 设置18，再执行无修改 | 正常结束，无错误上报 |
| C09 | 往复震荡 | A→B→A 持续有效变化 | 达到预算停止并生成定位报告 |
| C10 | 合并来源 | 两个 Change 命中待执行 A | A 的一次执行关联两个 Change ID |
| C11 | 多次规则执行 | A#1→B#1→A#2 | 独立 executionId，可还原链条 |
| C12 | 正常清理 | 正常 Flush 完成 | 生产 Runtime 不保留完整 Trace 历史 |
| C13 | 异常上报 | 熔断后提取报告 | 定位 Definition 版本、Reaction / Scope / Path 和截断 |
| C14 | 记录预算满 | Trace 先于执行保护达到上限 | 停止详细采集 / 截断，保护仍工作 |
| C15 | 异步 Host 操作 | 前轮结束后 Host 写入 | 新轮次，不复用旧执行计数 |
| C16 | 同步重入 | 通知回调再次同步 dispatch | Data 即时更新；新联动归当前轮，去重 / 计数 / 熔断不重置；无新增延迟启动，验证调用栈不失控 |
| C17 | 整体熔断后再触发 | 当前轮中止后又出现外部修改 | 不回滚已写 Data；清空剩余 Reaction，旧任务不自重试；新有效失效建立新 Flush / 预算，无变化不入队；独立完整校验通过可提交 |
| C18 | Devtools 关闭 | 开关 Devtools 运行同表单 | Reaction 输出和调度语义一致 |

这些是 Runtime 的设计验收目标；当前真实实现与 reaction / diagnostics / lifecycle 用例已有本地记录，见本篇实现入口。候选协议探针不实现真实 Flush / Trace / 整体熔断，不能将其计数当成本表逐项通过；完整目标覆盖与生产验收仍须分别核对。C17 采用整体保护边界，旧行在归档保留；C16 的同轮语义已确认，C17 的当前轮清队列及后续新触发已实现并有本地回归，生产阈值待验收。新增的 Command 隔离、初始化空值和 Prepared 拒绝回退见 [12 个跨层场景](dependency-reactivity.md#dependency-v05-acceptance)。

下一步以 [逐 Command 数据 / Scope 检测的 16 个场景](l3-data-scope.md#l3-v06-acceptance) 与 [现行边界验收](#l3-runtime-host-boundary) 验证稳定快照、新实例激活、已有实例同值不重跑、普通恢复 Command、替换 / Dispose、通知重入与精确排序。当前轮清队列 / 后续新触发及 Context 交接继续做实现验收，完整校验 SDK 继续补齐；正常路径已纳入 [校验专题](l3-validation.md#validation-completeness)。随后固化 Trace / 参数 / 错误接口，以动态数组与高频输入标定预算。可隔离错误继续与整轮熔断不再重开为局部传播设计。正式类型、Schema、Prepared ABI、Runtime 与适配器按落地任务建立，不将本篇概念结构当成生产发布包。


### 数据交付与 Host 输出边界

引擎完整校验只证明对应 Working Data 满足表单声明的全部适用校验，并向 Host 交付对应数据快照与结果身份；不负责构造或验证另一个业务请求输出。Host 自行转换、组装业务请求及执行所需输出检查，转换失败属于 Host 业务交付错误，不回写或改写引擎已完成的表单校验结论。表单业务本身需要正确的数据应在配置的数据模型、Binding、同步联动和约束中表达，不依赖提交时隐式修正。Normalized Output 如保留该术语，仅表示 Host 构造的业务提交数据，不是 Runtime 的第二份核心状态或新的通用输出 DSL。

### 业务数据防御与内部管理结构

外部输入的对象 / 数组值进入引擎时复制，解除 Host 原对象与内部数据的可变别名；内部以不可变 Root 和结构共享更新。read / snapshot 返回只读契约，不在生产环境为每次读取深拷贝或默认增加代理。开发环境递归冻结引擎持有的业务数据，捕获误写，不冻结 Host 原对象、Scope Index、Pending 或其他内部可变管理结构。Command 必须先构造修改路径上的新容器再写入，不能原地修改冻结的旧对象或数组；新数据发布前冻结，未变化且已保护的共享子树可复用。生产环境违反只读契约属于错误使用，不保证绕过 Command 修改后的状态正确。

比较按观察位置执行，基本值与存在性、对象 / 数组引用分别处理，不默认全表深比较。冻结不替代 Command 路径复制，不妨碍内部队列 / Scope 索引按既有职责更新。

## 校验观察与 Host 行为的调度交接 {#runtime-state-actions}

Reaction 仍由 Runtime / Scope 激活，watch 可显式匹配 Data 或 Validation 发布；只观察 Data 的规则不会因 Issues 改变而运行。执行 then 时，Command 走既有写入入口，host.emit 同步求值并交付已注册 Host 行为，不等待 Promise，不消费 Host 返回值。重复显式 emit 保留次数，Host 请求合并与防覆盖独立。

View 更新与校验展示共享观察注册 / 通知 / 释放框架，分源匹配；先一致更新状态并完成内部失效登记，再同步通知外部回调重读。校验发布命中新 Reaction 时登记 Pending，不能递归执行 Runner；活动 Flush 的交接继续消费新工作，无活动轮则延迟启动，沿 ADR-FE-018 的预算与重入约束。完整校验的输入资格仍需核对，不能把发布后新 Command 改变的输入说成旧调用已验证。

[统一观察](dependency-reactivity.md#state-observation)、[L1 响应项](l1/04-command-reaction.md#reaction-state-host)、[逐结果发布](l3-validation.md#validation-state-observation)共同约束该链路；不新增通用异步队列。
