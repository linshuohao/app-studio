---
id: DESIGN-L3-DIAGNOSTICS
title: L3 诊断与 Trace
type: design
status: active
layer: L3
modules:
- M16
sources:
- SRC-OBSERVABILITY
- SRC-DEVTOOLS
- SRC-RUNTIMEIMPLEMENTATION
- SRC-L3BASELINE
- SRC-V04
- SRC-V05
- SRC-V06
- SRC-HOST
related:
  decisions:
  - ADR-FE-025
  - ADR-FE-023
  - ADR-FE-021
  - ADR-FE-019
  - ADR-FE-018
  - ADR-FE-006
  - ADR-FE-007
  - ADR-FE-008
navigation:
  group: 04 · L3 运行时
  order: 54
reading_next: DESIGN-L4
last_reviewed: '2026-11-08'
relocated_sections:
- source: docs/design/l3-reactive-engine.md
  anchor: l3-trace
  target: l3-trace
- source: docs/design/l3-reactive-engine.md
  anchor: l3-trace-budget
  target: l3-trace-budget
- source: docs/design/l3-reactive-engine.md
  anchor: l3-devtools
  target: l3-devtools
---

# L3 诊断与 Trace

Trace 记录运行事实，帮助解释修改、失效和规则执行；诊断不参与业务调度或权限门控。Flush 的执行与保护见[运行时与 Flush](l3-reactive-engine.md)。

## Trace：事实、来源与记录边界 {#l3-trace}

Runtime 记录有序执行事实与实际变化，Devtools / 离线平台重建因果关系。记录应能表达 Operation 来源、Reaction / Scope、执行顺序、状态和产生的有序修改，`triggeredBy[]` 支持多个变化合并触发一次执行。

```text
Operation #1 → Change #11：age 20→17
Operation #2 → Change #12：product BASIC→PLUS
Reaction A · Execution #13 · triggeredBy [#11,#12]
  → Change #14：premium 100→150
Reaction B · Execution #15 · triggeredBy [#14]
  → Change #16：discount 0→10%
Reaction A · Execution #17 · triggeredBy [#16]
```

| 信息 | 用途 | 限制 |
| --- | --- | --- |
| executionId | 区分同一实例在本轮的多次执行 | 不等于 L1 Reaction ID |
| changeId | 定位 Command 造成的真实变化 | 无变化调用可记录执行事实，不伪造有效 Change |
| triggeredBy | 标识使本次执行失效的变化 | 表示调度原因，不证明每项都是业务计算的必要条件 |
| dataVersion | 标识读取的工作状态版本及变化前后版本 | 版本号本身不保存历史值 |
| Scope / Path / op | 解释实际对象与修改位置 | Scope 稳定身份与当时路径需分别说明 |

早期概念级结构如下，保留执行与变化的基本区分；现行身份、事件粒度与失败语义见[通用观测契约](#observation-contract)，具体传输编码不直接发布成正式 TS 包：

```typescript
interface ExecutionRecord {
  id: number;
  kind: 'operation' | 'reaction';
  name: string;
  scopeId?: string;
  triggeredBy?: ChangeId[];
  changes: DataChangeRecord[];
  status: 'success' | 'error';
}
interface DataChangeRecord {
  id: ChangeId;
  target: { scopeId?: string; path: string };
  op: string;
  beforeVersion: number;
  afterVersion: number;
}
```

来源草图同时给变化记录放入 `changed` 标志；本篇将有效变化与无变化 Command 事实分开说明，保留其信息需求，不冻结两套并行变化模型。首个失效之前的 Operation / Change 必须能在建立 Context 时被关联，具体上报编码按[事件契约](#observation-events)细化。

继续要求记录预算内的 Operation、Reaction 与 Command 结果。可隔离错误后仍可能有成功修改，因此记录应能区分失败命令、无变化尝试与后续实际 Change，不能只用整条 Reaction 的 success / error 推断每条命令的结果。事件语义按[事件契约](#observation-events)固化，具体传输字段留实施阶段；这些状态只用于诊断，不用来禁用其他规则。推荐 Prepared Source Map 关联原始 L1 的身份、版本和位置，便于由报告回查配置，详见 [编译来源](l2-preparation.md#l2-authoring-diagnostics)。

## 记录预算、参数与异常上报 {#l3-trace-budget}

执行预算与记录预算独立：前者停止无限联动，后者限制辅助 Trace 的事件条数及字节数。Trace 满了可停止辅助详细采集或截断，但计数与循环保护必须继续。合并来源、参数副本等附属记录也需计入容量，不能通过大 `triggeredBy` 绕过记录预算。下方异常现场的必需信息不得按辅助 Trace 截断策略静默省略；完整性、采集载体和资源成本须分别处理。

TS 实现中，辅助 Trace 容量为零时仍保留执行身份、触发关联、预算与完整异常报告，但不序列化成功 Command 的完整字符串；异常动作和对应输入继续独立交付。关闭辅助记录不能关闭运行保护或必需错误现场。

推荐在正常容量内保留完整本轮，溢出时保留初始来源与最近一段，并标记 `truncated`；仅保留尾部是替代方案，最终策略仍待决策。截断造成的缺失引用必须如实表达，不能伪造完整因果链。

| 对象 | 生产临时 Trace 方向 | Devtools 可选扩展 |
| --- | --- | --- |
| Reaction / Scope、实际 Command 与目标 | 记录身份和事实 | 同一来源进一步展示 |
| when 结果 / Pure Function ID | 必要的少量元数据 | 更细的求值过程 |
| 标量业务参数 | 脱敏值、受限摘要或不留原值，策略待定 | 在明确授权范围扩展 |
| 大对象 / 数组参数 | 类型、大小、摘要，避免逐步深拷贝 | 受限稳定副本或检查点 |
| Working Data 全量 Snapshot | 不逐步复制 | 历史恢复属于延期能力 |

上表的摘要和不逐步复制策略适用于辅助 Trace，不替代执行异常报告的完整输入要求。保存可变 Context / 外部对象引用不能证明历史参数；必须固定所记录输入的时点，使用稳定快照或可完整取回的记录。正常结束释放 Runtime 不再需要的临时记录，异常先提取完整现场；Host / Devtools 可另行保存，采集介质不限定在 Runtime 内存。

### 执行异常的完整现场与 Devtools 轨迹 {#l3-error-evidence}

2026-10-25 用户明确要求：Reaction 或 Validation 执行错误上报必须有完整触发数据和准确执行对象，才能复现对应输入并追溯错误来源；随后确认信息可保存到 local storage 或其他地方，逐次或阶段性交付均属实现选择。核心要求是信息完整、关联准确、可供复现与溯源，不将全部历史常驻 Runtime 内存作为前提。

| 必需信息 | 内容与一致性要求 |
| --- | --- |
| 完整输入现场 | 对应触发时的整份 Data 与 Host Context、输入版本及 Scope 绑定；不是只记录版本号、摘要、变化字段或当前行 |
| 实际执行对象 | Reaction ID；Internal / External 的 Constraint ID；External 另有 Host Validator 注册名，Schema 校验记录对应 Schema 身份；同时定位本次执行 / 任务、轮次和 Scope 实例 |
| 配置及实现身份 | Definition / Prepared 与相关能力制品身份，使报告能找到当时使用的配置和实现，不能仅凭可能已变更的同名规则定位 |
| 错误及触发关系 | 出错阶段、错误信息与可取得的调用栈，以及对应 Operation / Change / 校验发布等触发来源；实际可读的校验投影、Event / Payload 或相关外部结果须有对应现场或可完整取回的稳定关联 |

触发入队、实际调用及出错处理是不同时间点。排队合并或前序动作写入使输入不同时，应保留相应完整快照及关联，不能用后来状态冒充早先输入；相同输入可共享一份稳定快照。Reaction 部分动作成功后另一个动作失败时，还需定位失败动作和对应输入。异步 Validator 使用发起任务时捕获的完整输入，不能在拒绝处理时读取最新表单替代。现场应在可重入通知或清理丢失关联前固定。

完整错误信息可以在内存中短暂交接，也可以由 Host / Devtools 保存到 local storage 或其他存储；可以逐次交付或阶段性收集后上报。本轮不选定存储产品、缓存实现或发送批次，也不要求 Runtime 自带持久化和网络能力。外置快照时，关联必须能够完整取回对应内容；只有 ID、摘要或失效引用不算完整。容量和交付失败必须如实暴露，不能静默删除必需现场后仍宣称完整；上报不能成为数据写入或执行清理的等待条件。

Devtools 可额外保存更完整的执行顺序、实际变化、输入状态及跨轮关联，用于呈现从触发到失败的整条路径。基础 Trace 的有界记录与 Devtools 扩展采集分开，存储位置不改变各自信息要求。完整路径呈现必须有对应证据，记录缺失或截断时明确表示不能完整恢复，不能用推断补成事实。完整现场不等于已经实现自动或确定性 Replay；相关边界见[复现层次](#l3-devtools)。

2026-10-25 本批 Runtime 已交付 `Diagnostic.evidence` 的触发 / 调用输入、执行对象、Prepared 身份、阶段与错误堆栈；错误独立交付，不受辅助 Trace 容量抑制。异步任务捕获启动现场，完整校验按调用身份收集诊断，结束释放收集器。字段和实际用例见 [Runtime Review 入口](../../packages/runtime/README.md)及包内 diagnostics 测试；持久化与完整因果路径仍待实现，生产容量待验收；独立只读 DevTools 已有[本地扩展证据](engineering.md#devtools-implementation)，不据此宣称本章全部验收通过。

最初归档仅固化信息要求；上述 TS Runtime 实施已补齐对应调用边界的完整现场，仍不冻结跨端 SDK、采集后端或提高 M16 整体完成度。2026-10-26 任务合并进一步区分启动身份与消费关联：`execution.callId` / `origin` 保留真实执行来源，`relatedCalls` 关联正在等待共享任务的完整调用，确保新调用能够收集复用任务的异常。调用结束解除关联、封存收集器，任务只保留必要输入与编号，不持有已结束的调用 / Flush 上下文。规则见 [调用合并](l3-validation.md#validation-work-coalescing)。来源见 [SRC-RUNTIMEIMPLEMENTATION](source-map.md#src-runtime-implementation)。

报告交给 Host / 配置平台去重、限频，不能成为正常 Data 写入的等待或许可条件；Devtools 的历史保存与事件消费 API 遵循[只读接缝契约](#observation-api)，具体编码在实现阶段确定。首次入队前后的触发信息需采集并接入本轮；执行上下文与 Journal 在实际调度开始时建立，结束后先封存并交付记录再释放。信息可由外部采集设施承接，不以异常为由给生产 Runtime 增加所有正常轮次的长期历史。

首期生产接入由 Host 接收错误现场，经受信服务上报，Platform 分开保存错误索引与可用的原始现场。Host 的现场标识关联到同一错误事件；原值按独立授权查看和复现，Agent 模型使用结构化证据与复现结果。独立诊断和轮次报告中的同一条目用 Runtime 实例身份与事件序号关联。首期白名单及 `flush.aborted` 的精确匹配规则见[平台诊断事件映射](platform-studio.md#platform-diagnostic-mapping)。

2026-10-24 用户确认并授权落实该生命周期拆分。当前代码中，FlushContext 持有本轮预算计数、停止标志和临时 Journal；DiagnosticReporter 是实例诊断出口及有限最近事件查询，异步交付封存轮次报告和独立事件。异步 Host / Validator 仅持有启动来源编号，迟到回报不会追加到旧 Journal 或冒充其他同步轮次事件。代码入口及局部图见 `packages/runtime/README.md`。该历史批次实现条数截断与来源关联；后续新版 DevTools 观测已补 Command / Change 因果与观测字节预算，见当前实施边界。生产报告脱敏及目标设备阈值仍需单独验收，不因本地工具回归通过而整体标记 Trace 完成。

## Devtools 因果分析与复现的三种层次 {#l3-devtools}

事后先扫描 changes 建立 `changeId → executionId` 索引，再扫描 triggeredBy 连边。记录完整时，成本随执行数、变化数和引用数线性增长；Runtime 无需实时维护父子树或运行 Tarjan。以执行实例为节点按时间向前连边，以 Reaction Instance 折叠展示时才可能出现 A ↔ B。

| 能力 | 边界 | 额外条件 |
| --- | --- | --- |
| 复原执行顺序和触发链 | 推荐支持；受截断范围限制 | 有序记录与 Change 关联 |
| 复原历史 Data 值 | 暂不承诺 | 初始 Data + 可重放的实际修改日志 + 数组 / Scope 恢复信息 |
| 确定性重新执行 | 暂不承诺 | Definition / Prepared / Function 版本、初始 Data / Context、外部输入、非确定性来源与环境约束 |

上述历史恢复 / Replay 边界不减免[执行异常完整现场](#l3-error-evidence)的必需采集与交付。Devtools 完整路径是扩展采集和呈现目标，不以当前有界事件尾部已存在而声称完成。

异常可定位不等于时间旅行。Devtools 关闭也必须得到同样的 Reaction 输出与调度结果。



## 独立 DevTools：发现、采集与展示 {#independent-devtools}

2026-10-26 用户确认 [ADR-FE-023](decisions/ADR-FE-023-independent-devtools.md)：DevTools 独立成包，以浏览器扩展为主要入口，业务应用不导入工具、不添加调试组件、不传技术诊断展示开关。Runtime / Renderer 仅提供开发态观测接缝和本来就必须存在的结构化错误事实，业务执行不依赖工具。

```diagram
{
  "id": "figure-independent-devtools",
  "title": "独立工具消费运行事实，业务执行不依赖工具连接",
  "rows": [
    [{"title":"Runtime / Renderer","body":"权威状态、正确执行、错误隔离和必要诊断"}],
    [{"title":"开发态观测接缝","body":"实例发现、只读查询、可释放的事实订阅"}],
    [{"title":"DevTools 页面桥接","body":"版本握手、按需复制、连接租约；不创建生产 Hook"}],
    [{"title":"独立工具与扩展面板","body":"目录、状态、请求、校验、轨迹和诊断呈现"}]
  ],
  "arrows": ["开发产物登记运行事实", "工具按需读取与订阅", "独立分析和展示；不反向控制业务执行"],
  "note": "源码职责图。扩展发现标记不等于可以访问闭包内部状态，准确采集需要显式的观测接口。"
}
```

### 观测接口与所有权

下述 list / read / subscribe、连接数和缓冲条数描述首期已有实现，保留作迁移基线；新的接口及资源约束以[详细技术契约](#observation-technical)为准，已同批替换旧工具协议，不保留兼容入口；下述旧接口与旧容量不再适用于现行实现。独立只读及业务所有权原则继续有效。

Runtime 的 /devtools 子入口定义版本化 list / read / subscribe。目录区分 runtime、view、material，每次执行实例独立编号，parentId 关联业务实例与呈现关联；nodeId、Profile、occurrence 用于定位，不拿定义 ID 冒充运行实例 ID。共享 Symbol 仅用于同页引擎副本登记观测源，不暴露 Runtime 对象、业务指令、Host 函数或请求 cancel。

list 只读取元数据，read 在开发者选中对象后复制当前展示数据。Runtime 提供当前 Data / Context / Prepared 与轻量诊断尾部；view 提供当前 Prepared 结构和装配 / 呈现诊断；material 提供已存在的投影缓存、Scope / owners、Binding 和在途请求元数据。工具查询不得重新求值表达式、发起校验或注册业务 observe。完整树结构可包含未挂载节点，material 目录只表示当前已挂载关联，两者不能混同。

Renderer 的 DiagnosticEmitter 面向任意消费者，仅发布诊断和交接提交前记录，不同步业务状态、不保存工具历史。根建立开发与 Host 订阅后统一 flushPending，初次错误完整交付全部消费者。开发目录的 DiagnosticHistory 保存 100 条诊断及截断标记，弱关联根身份；Strict Mode 模拟清理 / 重连复用窗口，真实注销后不再对目录公开，避免为了工具历史在生产 Renderer 保留缓存。

Working Data、成员身份和校验仍归 Runtime；当前投影归 Renderer；选择项、连接状态、轮询及显示缓存归 DevTools。开发者错误上报 onDiagnostic、业务错误降级与工具发现独立：更换上报 / 呈现回调不重建装配或撤销请求。

### 环境与生命周期

默认产物关闭发现注册；development 条件提供开发产物，工作区读取源码，安装包读取独立编译的开发入口。标记不存在时扩展保持等待，不往生产页注入引擎发现能力；构建器不能在生产发布时强制选择 development 条件。服务端不自动建立浏览器目录。

注册在 Runtime 完成初始化、Renderer 提交挂载后建立；真实卸载 / 改绑注销，Strict Mode 的模拟清理允许重新登记同一关联。父实例销毁注销工具子树。连接可以早于或晚于业务实例，晚连接读取当前状态，不能补造连接前的历史。工具失败被隔离，通知经独立微任务交付，不进入业务 Flush 观察预算，不作为业务写入或清理的等待条件。

连接断开释放工具订阅、快照和轨迹缓存；扩展丢失关闭通知时按 15 秒连接租约释放，单页面最多 8 个连接。引擎通知队列最多 200 条；工具客户端 / 页面面板缓冲各 100 条。展示副本限制深度、节点、字符和容器项数，并显式 truncated；丢弃事件另报数量。工具副本不是完整异常报告，不降低前文完整现场的交付要求。

默认轨迹只发布执行、错误定位和请求终态元数据，不广播整份异常 Data / Context 或请求输入输出；当前数据仅在明确选择后读取，不默认持久化到 local storage 或网络。异常完整现场继续交 Host 原诊断出口。首期只读，不提供编辑、重放、时间旅行或重新执行入口。

### 实现入口与验收边界

核心接缝为 packages/runtime/src/devtools；Renderer 接入在 renderer-content.tsx、adapter/projection.ts 和 requests/bridge.ts；独立工具与扩展在 [DevTools README](../../packages/devtools/README.md)。浏览器桥接通过 inspectedWindow.eval 在页面世界执行自包含只读查询，不扫描 React 私有树。扩展本地解压加载，未发布浏览器商店；当前主 frame，其他宿主 / frame 仍待适配。

验收覆盖无工具、晚连接、断开重连、工具异常、Strict Mode、业务请求稳定性、父实例释放、数据副本不可写与容量截断，并区分开发源码 / 开发包 / 默认生产包。实际结果见 [工程证据](engineering.md#devtools-implementation)；完整因果链、跨端与生产性能仍保持原有剩余范围。

## 通用观测契约：结构、事实与四个视图 {#observation-contract}

2026-11-08 用户确认完整方案及以下三个原则，见 [ADR-FE-025](decisions/ADR-FE-025-observation-contract.md)。本节是现行目标契约；前文首期实现证据不代表本节已实现。概念字段说明信息语义，不直接发布新的 TS 类型、Prepared ABI 或通信协议版本。

1. **可能影响与实际发生分别表达。** Schema / Prepared 给出结构和声明关系；只有运行事实能证明入队、执行、变化及结果发布。视图可以切换二者，不能把静态可达路径画成已经执行。
2. **自动订阅、按需读取。** DevTools 接入后自动订阅目录和各生产者执行事实，事件发生时主动推送；不依赖选中对象、轮询或手动录制。选中对象才读取结构与当前状态快照，业务值仍须显式检查。连接前的历史不补造；必要异常完整现场始终沿原出口交付，不依赖工具连接。Hook 存在不代表工具已连接，以真实活跃订阅判定采集需求。
3. **有界且不干扰业务。** 事件、字节、引用及工具缓存均受预算约束；丢失、截断、晚连接与不支持必须显式表达。工具异常、断开或缓冲溢出不阻塞写入、改变调度、取消业务请求或降低必需异常现场要求。

### 所有权与通用模型 {#observation-model}

Runtime 拥有 Working Data、成员身份、规则实例、调度及校验事实；Compiler 提供 Prepared 定义、依赖与可用来源；Renderer 提供当前投影、装配及请求事实；DevTools 拥有选择、布局、折叠、历史缓存和分析索引。读取不能重新求值、发起校验、注册业务 observe 或驱动任务。模型不含投保人、被保人等业务专用类型。

| 逻辑数据集 | 最小语义 | 权威来源 |
| --- | --- | --- |
| 定义目录 | Definition / Prepared 身份与版本，Schema、Reaction、Constraint、能力制品及视图定义引用 | Compiler / 已加载 Prepared |
| 位置、绑定和实例目录 | 对象 / 数组 / 成员包含关系，完整词法绑定，实例激活与移除 | Runtime；呈现实例由 Renderer 补充 |
| 类型化关系 | 起止引用、关系类型、定义或绑定实例层级、来源与解析情况 | 声明、编译推导或运行绑定 |
| 当前状态 | 数据 / Context 版本、来源校验状态、Issue、任务资格、请求状态 | 各自状态所有者 |
| 运行事件 | 操作、入队合并、执行、命令、有效变化、异步及结果发布的身份与因果 | 实际发生处采集 |
| 观测完整性 | 能力、快照边界、分页、事件窗口、缺失引用与值可用性 | 采集端及传输 / 消费端 |

数据包含树、词法 ScopeBinding、规则实例、单次执行是四个不同维度。字段挂在哪个对象下，并不决定它能观察或影响哪些对象。规则实例由定义及完整绑定定位，不能只用最后一级成员 ID；跨多个 Scope 的实例可归于共同祖先或跨对象分组，各处展示入口引用同一实例，统计去重。

数组成员复用 Runtime 的稳定身份，索引仅是当前或事件发生时的位置。移动和 set 现有成员对象保留该行身份，嵌套结构另行处理；删除后新建或 set 整个数组产生的新成员不得借原索引、姓名或业务主键延续旧身份。普通对象 / 字段以 Root 或稳定成员锚点加相对 JSON Pointer 定位，不向业务 Data 注入调试 ID。历史窗口保留被删除实例的最小目录 / 墓碑和当时路径；目录回收后明确显示引用缺失。

所有引用处于 Runtime 与 Prepared 身份限定的命名空间内；实例、事件、执行、Work、Call 的 ID 不能混用。ScopeBinding 复用既有语义；Prepared Source Map 是可选定位附件，不可用时回退到 Prepared 定义定位，不承诺跳到原始文件。

```typescript
// 概念信息模型；具体 DTO、判别联合及传输字段在实施阶段固化。
type DataLocation = { memberId?: string; relativePath: string };
type ObservedInstance = {
  id: string; definitionId: string;
  kind: 'reaction' | 'constraint' | 'schema' | 'material';
  binding: ScopeBinding; lifecycle: 'active' | 'disposed';
};
type ObservedRelation = {
  id: string; kind: RelationKind;
  from: EntityReference; to: EntityReference;
  level: 'definition' | 'bound-instance';
  provenance: 'declared' | 'compiler-derived' | 'runtime-resolved';
  resolution: 'resolved' | 'unresolved' | 'not-applicable';
};
type ObservationEvent = {
  id: EventReference; runtimeId: string; sequence: number;
  kind: EventKind; instanceId?: string; executionId?: string; workId?: string;
  parentExecutionId?: string; causedBy?: EventReference[];
  inputVersion?: { dataRevision: number; contextRevision: number };
  payload: EventPayload;
};
```

上面的局部引用通过所在快照 / 事件流的 Runtime、Prepared 信封解释；跨信封引用必须携带完整限定信息。`parentExecutionId` 表示执行包含，`causedBy` 表示事实因果，两者不能互相替代。需要的 Call 关联、输入与结果版本、终态原因按事件种类进入 payload，不把所有字段都变成无约束可选项。

### 关系语义与可推导边界 {#observation-relations}

| 关系 | 来源与用途 | 禁止的推断 |
| --- | --- | --- |
| contains | Schema 结构 + 当前数据拓扑 + 成员目录，组织嵌套对象与数组 | Schema 模板不证明当前成员存在 |
| watches | Reaction 显式 Watch，包括校验引用 | 不把表达式所有读取补成 Reaction 触发源 |
| invalidatedBy | Constraint 有效依赖，表示失效匹配 | 失效不等于立即执行或发出网络请求 |
| mayRead | 可解析表达式 / when 的潜在读取 | 读取不等于触发；自定义函数内部不可猜测 |
| mayWrite | 声明 Command 的潜在目标 | 潜在写入不等于有效 Change |
| requires | 校验前置关系 | 不创建第二套全局异步调度器或前置结果 PubSub |
| reportsTo | Source 的 Issue / 状态归属目标 | 结果归属不表示输入复制或业务数据写入 |
| bindsTo | 物料、视图、owners 与数据绑定 | 挂载目录不代表所有定义节点已挂载 |

解析不了的动态目标保留 unresolved 和原因；不存在的绑定与不适用分开表达。根 Schema 校验按实际整根工作展示，字段 Issue 可定位，但不伪造逐字段 Schema 执行。定义图可有环；实际事件以发生顺序连接，多次执行使用不同 executionId，不能把实例图中的环误判成重复事件。

### 当前可复用数据与缺口 {#observation-reuse}

| 现有数据 / 接缝 | 复用方式 | 为目标视图补充的契约 |
| --- | --- | --- |
| Schema / Prepared、规则及能力身份 | 生成定义结构、声明依赖与可解析的读写关系 | 类型化关系、未解析说明、定义到实例的绑定映射；不要求修改业务 Schema |
| Runtime 当前 Data / Context、版本及 Prepared 查询 | 当前状态、选中位置的值检查 | 元数据与值读取分离，快照游标及分页一致性 |
| Runtime 成员身份与内部实例 / 依赖索引 | 稳定定位成员和规则 | 对工具提供只读目录、生命周期及完整绑定；不直接暴露内部可变容器 |
| 现有诊断、执行来源及轮次信息 | 错误入口、有限历史尾部、原始执行定位 | 结构化入队 / 条件 / 命令 / 有效 Change / 发布事实，不能把执行开始当作成功结束 |
| Source / ValidationWork / ValidationCall | 当前来源结果、共享工作与完整调用关联 | 失效、复用、资格撤销、迟到回报及发布 / 丢弃的分别记录 |
| Renderer 结构、物料缓存 / Scope / owners、请求元数据 | 呈现绑定与现有请求状态 | 生产者版本及请求因果关联；不可通过查询触发投影重算 |
| Diagnostic.evidence、origin、relatedCalls | 完整异常现场与共享任务归因 | 展示摘要与完整现场引用分离，完整内容的可取回性 / 失败状态 |
| 可选 Prepared Source Map | 从定义回查配置 | 不可用时明确降级；不以它作为四视图运行前提 |

此表是已存在能力的复用方向和目标差距，不宣称内部数据已经作为稳定观测 API 暴露。旧事件尾部或命令字符串不能可靠恢复结构化 Change；粗粒度校验通知也不能替代完整 Source 状态。实施前仍须按源码核对具体字段、事件时点和各端同步替换检查。

### 事件上报与因果契约 {#observation-events}

| 事实类别 | 必须表达的信息与时点 |
| --- | --- |
| 操作与生命周期 | 操作来源、输入版本；初始化 / dispatch / Context 替换 / 完整校验等入口；实例激活、成员移动、移除及当时位置 |
| 入队与合并 | 首次入队及追加触发来源；同一执行接受多个变化的原因集合，不能只保留最后触发者 |
| Reaction 执行 | 开始、输入身份、when 的 true / false / error、结束或中断；未执行动作要说明原因，未观测不能标为跳过 |
| Command 与 Change | 动作序号、成功 / 错误 / 无变化 / 未执行；实际有效变化另记稳定目标、当时路径、前后版本及执行引用。部分成功修改保留，不被整条 Reaction 错误状态覆盖 |
| 校验排队与资格 | Source 失效、所需前置、适用性、入队、工作创建 / 复用及启动输入；失效不等于启动 |
| 异步返回与发布 | Work 启动、资格撤销、取消尝试、返回、结果发布或丢弃分别记录；返回成功不证明允许发布，取消尝试不证明请求已停止 |
| 完整校验调用 | Call 固定的覆盖工作、复用关系、等待及结论；stale 与任务取消分开，多个 Call 共享一个 Work 不复制执行 |
| Renderer 请求 | 实际请求身份、启动来源和终态，区分物料请求与 Runtime Validator；Host 未提供关联时显示未知 |
| 诊断 | 错误阶段、实例 / 执行 / Work / Call 关联、完整现场引用及可用性；技术错误与业务 invalid 分开 |

既有 Source / Work / Call 的所有权和发布资格见[校验调用合并](l3-validation.md#validation-work-coalescing)。任务 origin 保留真实启动身份，relatedCalls 表示消费关联，调用结束释放关联。迟到事件有独立记录与原来源编号，不能追加到已封存 Flush Journal。观测记录不改变通知次序、同步结果替换或原有校验调度。

因果模型允许多根、合流与跨轮：Operation A 的 Change a 和 Operation B 的 Change b 可共同触发一次 Execution e，e 在两次操作的追踪入口可见，但全局只计一次。执行包含关系、调度触发关系、Call 等待 Work 关系分别保存；不能只靠时间相邻拼边。任意 Host 副作用只有提供显式来源时才建立因果。

“操作结束”要说明范围：入口返回、同步 Flush 已结束、已记录关联工作全部终结或记录边界未知。不能用一个布尔值宣称所有未来 Host 行为完成。对已知异步工作可继续展示，缺失事件时保留未知，不为了等待图完成而驱动业务。

### 快照、游标与完整性 {#observation-consistency}

当前元数据快照应带观测游标，后续从该边界接续增量；采集侧通过一致切点及必要缓冲避免静默漏读。观测序号不替代 Data / Context 版本，不要求业务等待工具。分页绑定同一快照版本，过期则明确要求刷新，不能将不同时间页面合成一份一致快照。Renderer 与 Runtime 分别携带版本及关联，允许展示滞后，不承诺跨生产者全局原子快照。

完整性至少分别表达：结构是否完整及分页范围、状态所属版本、事件窗口与是否中途开始、丢失 / 截断范围、因果引用是否齐全，以及值是 available / not-recorded / redacted / truncated。字段名称可细化，语义不能合并成一个含糊的 complete。

丢失引用保留占位及缺失原因；刷新当前快照不能补回过去事件。未记录的历史值不能通过读取当前值冒充。新连接可以读取当前状态和仍可用的有限尾部，不承诺连接前路径完整。异常完整现场的检索与交付仍遵守前文必需要求；仅有失效 ID 不算完整现场。

### 四个视图如何消费同一数据 {#observation-views}

| 视图 | 消费数据及展示 | 切换时保留的定位 |
| --- | --- | --- |
| 关系 | 定义 / 实例目录 + 类型化关系，区分潜在影响与某次操作实际经过；直接上下游优先，按需展开完整链 | Runtime / Prepared、实例与完整绑定；可定位同一规则的具体执行 |
| 执行 | 实际事件及因果，多分支、合流、异步泳道与逐步高亮；同一实例多次执行分开 | 实例、操作、executionId / workId / callId 及事件游标 |
| 状态 | 当前一致快照、Source 状态 / Issues / 资格、当前任务及版本 | 同一实体；明确正在看当前结果，不能冒充所选历史执行结果 |
| 诊断 | 错误事实、归属、执行 / 工作关联及现场可用性 | 从结果回到来源规则、失败动作与实际路径；缺失记录保留说明 |

四视图共用选择引用，不通过标题、数组下标或图节点坐标匹配。一次实例对应多个执行时提供选择，不擅自覆盖成最近一次；被删除实体允许保留历史定位并说明当前已不存在。切换当前 / 历史是显式语义，当前 valid 不证明旧操作通过，历史 valid 也不证明当前仍有效。

当前状态沿用既有 unverified / pending / valid / invalid / incomplete / blocked 及适用性语义；完整调用的 stale 单独表达。任务结束、业务校验通过、无技术异常、观测完整是不同结论，不能用同一个绿色标记代替。

### 对象 / 数组折叠与跨对象影响链 {#observation-folding}

折叠仅是视图投影，不改变原始节点与边。隐藏实体映射到最近可见容器，跨容器边按关系类型聚合，并保留原始引用、数量与展开入口；容器内部边不能伪装成自触发。跨对象实例的多个展示入口去重，分页未显示的成员仍纳入有证据的统计。

例如修改 `applicant`，可能涉及 `insureds` 中 36 个成员，实际触发 12 个成员：折叠图应分别标注“潜在 36 / 已观测触发 12”，并展示执行中、完成、业务失败、技术异常及未知信息。不能以没有事件判定其他 24 个未受影响；只有完整覆盖证据才允许该结论。数量是示例，不是生产规模或预算阈值。

统计必须标明口径：当前状态按当前成员集合；执行视图按所选操作涉及成员的并集，保留新建 / 删除标记；若比较起始和当前数量，分别标注。完成数、invalid 数、异常数可能重叠，不能相加成总数；已知工作终态与观测未知分别展示。选中成员后高亮直接上下游；展开完整影响链时仍区分潜在可达与实证路径，折叠后跨对象边不能消失。

### 只读接缝、兼容与资源边界 {#observation-api}

新观测协议直接替换旧工具协议，提供：能力发现 / 协商、定义读取、带游标的元数据快照与分页、选中位置值检查、自动事件 / 增量订阅，以及异常现场定位与可用性查询。连接生命周期控制工具采集，不关闭业务保护、必要诊断或异常现场交付；断开不取消在途业务工作。

用户在技术方案确认后明确改为直接破坏性升级：不保留旧协议兼容层、双版本并存或降级路径；版本不匹配明确拒绝并提示升级。Runtime、Renderer、页面桥接和面板同步迁移。具体技术契约见[详细方案](#observation-technical)；本次变更限于观测接口，不改变业务 public API / Prepared ABI。事件去重、序号缺口、引用预算、快照过期和传输断开须可观测；不以背压阻塞业务。正常 Trace 的保留头尾方式、容量、脱敏策略与生产阈值仍按原未决边界推进，不把 demo 的默认数值升为规范。

## 分阶段实施范围与验收清单 {#observation-delivery}

以下是已确认目标的交付拆分与验收准备，不是本轮编码授权。实现前依 W3 对照当前代码补齐具体 DTO、同步升级清单与测试入口；契约内选择自主处理，若改变状态所有权、执行顺序或公开行为再集中提出。复用 T01 / T04 / T05 / T06 / T11 现有接缝，不等待 Platform / Studio 全部设计完成；全端与生产性能继续由 T08 承接。

| 阶段 | 范围与交付物 | 阶段验收 / 不包含 |
| --- | --- | --- |
| OBS-0：契约映射 | 固定代码基线；定义身份 / 引用 / 事件判别、精确版本检查与旧接缝替换；关联本章每项不变量到生产者和消费者 | 模型能表达下表反例，未知与缺失有明确编码；形成可审查契约和验证入口。不开新业务 DSL，不将概念示例直接发布为 SDK |
| OBS-1：结构与当前状态 | 稳定成员 / 实例目录、声明关系、只读状态快照及分页；初步对象折叠、当前状态与现有诊断入口 | 成员移动不串项，快照页不混版，展开不触发业务；只能展示潜在关系，不宣称实际链已可复原 |
| OBS-2：Reaction 实际路径 | 自动订阅、操作 / 入队合并 / 条件 / 命令 / Change / 终结事件、因果图与步进高亮 | 多根合流、多次执行、条件跳过、部分成功及缺失窗口准确；不宣称异步校验全链已闭环 |
| OBS-3：校验与异步关联 | Source / Work / Call、前置 / 适用性、复用 / 资格撤销 / 迟到结果、Renderer 请求和异常现场定位 | 启动、返回、发布、丢弃区分；共享任务只执行和统计一次；当前 / 历史结论不混同 |
| OBS-4：四视图联验与发布准备 | 共用选择、跨对象聚合边、完整影响链、大成员量分页、覆盖提示、版本不匹配拒绝、生命周期和成本测量 | 下表全链回归；关闭 / 溢出不改变业务；给出实际预算与性能证据。跨端、生产阈值和发布范围未验收项继续公开 |

各阶段应交付 Design Intent → Contract → Code → Execution → Evidence 关联；本次只有前两项设计归档，不能登记后三项已通过。OBS-4 的成本测量结果用于具体阈值决策，不能预先声称无限成员数或零采集开销。

| 验收 ID | 场景与必须观察到的结果 | 主要阶段 |
| --- | --- | --- |
| OBS-A01 | 修改投保人触发多个被保人连锁 Reaction，潜在关系和实际路径分别显示，折叠保留跨对象聚合边 | 1 / 2 / 4 |
| OBS-A02 | 多层对象及嵌套数组移动、删除、再插入：移动及 set 现有成员对象保留行身份，set 整个数组重建成员；旧实体历史不错误绑定新实体 | 1 / 4 |
| OBS-A03 | 一个规则绑定多个 Scope，多个容器可定位同一实例；成员、实例及工作数量不重复统计 | 1 / 4 |
| OBS-A04 | 两次操作共同触发一次执行：两条原因保留，按操作可查看，全局只计一次执行 | 2 |
| OBS-A05 | when=false、when 抛错、连接前未观测三种情况分别显示；不通过静态分支猜测真实路径 | 2 |
| OBS-A06 | 前一动作成功、后一动作失败或无变化：有效 Change、失败动作与未执行动作分别定位 | 2 |
| OBS-A07 | A→B→A 与多轮联动：规则实例保持、executionId 区分；图中实例环不合并成一次执行 | 2 |
| OBS-A08 | 异步逆序返回、输入变化、成员删除：资格撤销、取消尝试、返回和丢弃如实展示，旧结果不标为发布 | 3 |
| OBS-A09 | 多个完整 Call 共享 Work：启动 origin 不改写，消费关联可追踪；stale 调用不取消共享任务 | 3 |
| OBS-A10 | 根 Schema 整体执行产生多个字段 Issue：一次工作关联多目标，不制造逐字段执行 | 1 / 3 |
| OBS-A11 | 晚连接、事件溢出、缺失引用、断开订阅：覆盖范围及未知显式展示；刷新当前状态不补造历史 | 2 / 4 |
| OBS-A12 | 分页期间数据修改、Renderer 滞后：固定版本或明确快照过期，不声称跨生产者原子一致 | 1 / 4 |
| OBS-A13 | 在关系、执行、状态、诊断间切换：同一绑定 / 执行可追踪，已删除实体与当前 / 历史结果明确区分 | 4 |
| OBS-A14 | 数十成员折叠：实际受影响并集、当前集合、完成 / 失败 / 未知口径准确，展开保持选择和跨组路径 | 4 |
| OBS-A15 | 无工具、连接未选中、选中对象、断开、租约释放、查询抛错及容量溢出下，相同输入的业务数据、校验结论、执行顺序和请求资格一致 | 各阶段 / 4 |
| OBS-A16 | 异常轨迹截断但完整现场仍按原出口交付；无法取回时如实报错；未记录历史值不能展示当前值代替 | 3 / 4 |
| OBS-A17 | 旧协议明确拒绝并提示同步升级，无回退；缺少 Source Map / Host 未提供因果时明确缺口，不伪造关系、不阻止已有业务运行 | 0 / 4 |

当前剩余工作是具体上报 / 查询 SDK、生产者接入、工具实现及测量，不能再以“原则未定”重复讨论三个已确认原则。历史数据重建、确定性 Replay、任意 Host 副作用自动追踪、全端全 frame 支持仍不在这次能力承诺内。

## 详细技术方案与接口契约 {#observation-technical}

2026-11-08 用户确认完整技术方案、会话录制租约和固定版本分页失败语义；随后明确改为直接破坏性升级，不保留 V1 兼容。2026-11-09 用户进一步确认端到端自动订阅 / 推送，替代显式录制及轮询，要求接收与视图刷新解耦并保持视觉 demo 风格。以下是合并修订后的现行技术契约。源码核对基础为 fd96b3c 加当时工作区；首次确认时仅归档，当时没有实现、业务测试或性能验收证据；后续实施状态见下文。正式导出类型在后续交付中建立，下方 TypeScript 用于明确设计结构，不是已发布 SDK。

### 当前实施边界 {#observation-implementation}

2026-11-09，源码基线为 `fd96b3c` 加本地混合工作区。页面 Hook、Runtime / Renderer 注册、桥接、客户端及面板已同步切换版本 2，旧 list / read / 旧版 subscribe 及旧客户端删除，无兼容回退；版本 2 增加类型化 subscribe。默认生产包不注册；连接即自动接收，默认聚焦一个可用表单并固定其元数据快照；多表单时允许切换，业务值仍按需显式检查。当前已经是公开新协议接线，不再仅为内部目录切片。

目录覆盖 Prepared 规则 / Schema、真实数据对象与数组成员、Reaction 实例及完整绑定、Validation Source / Work / Call / Issue 当前目录和 Renderer view / material。数组移动保留身份，删除后再激活或 Renderer 重挂产生新引用；父级销毁立即释放后代会话。查询不求值、不校验，协调中返回 busy。元数据 revision 按目录内容变化推进，头部 updates=versioned-delta。选中后建立固定快照，以事件 / 目录失效通知触发 readMetadataChanges；生产者在一致边界读取目录并只传变化行、删除键及顺序，不定时扫描，不推送整份业务值。固定分页与增量基线独立保留，旧 base 重试返回同一 offer，新 revision 请求确认上一份。过期或版本缺口重新建立快照。实例删除事实和快照差分共同保留有界墓碑，覆盖两次读取之间新增并删除的实例。Prepared 以接管对象身份共享目录（每对象最多 8 个预算版本），包含 View / 模板 / scope / material 定义，不以业务 formId 合并不同产物。

真实事件现已包含 initialize / dispatch / replaceContext / validate 入口及同步返回、Reaction 排队 / 合并 / 取消、开始 / 条件 / 终结、已执行动作、叶命令结果与 target-only Change；Validation 记录 Source 失效 / 结果发布、Work 创建 / 启动 / pending / settling / 完成、资格撤销、cancel 尝试与同步 / 异步取消失败、实际返回 / 丢弃，以及 Call 关联 / 结论。Work 创建代次和具体资格代次分开，复用不会再次上报启动，stale Call 不取消共享工作。Renderer 请求记录 pending、返回 / 拒绝、success / error / discarded / late-discarded，并固定原 Runtime / View / 挂载代次；旧请求不能污染新代次。

订阅自动覆盖连接后的事实，连接前已在途状态从选中对象的固定元数据快照读取，不补造启动事实；关闭不等待业务任务。旧 startCapture / stopCapture 与 captureId 已移除。completed 仅表示 Reaction 返回，actionCoverage=all-declared；条件 false、条件错误和中断后的未执行动作逐项标记 not-executed 与原因。新建 Source 与后续失效都保留已知原因，Work 创建携带有界原因集合及完整性，不用时间接近推断因果。Host returned 只表示同步返回，Change 不冒充逐字段 diff。窗口外开始、销毁后无法交付的尾部均保留未知。

`locateEvidence` 当前查询原 Runtime 最近诊断中的完整 evidence 是否仍被保留，返回命名空间下的诊断序号与 available / unavailable；引用映射最多保留 2,000 个序号，定位扫描也有预算，超限返回 budget-exceeded。它不复制输入、不延长原 Trace 保留期、不证明 Host 持久化；完整异常仍经原出口独立交付。Renderer 没有该定位能力时返回 unsupported。默认诊断摘要显式排除 message / evidence，避免命令字符串泄漏业务值。

四视图已消费真实 DTO：共用实体选择、显式事件选择、跨页定位、当前 / 历史分开；关系图区分 Data、Context 与字段校验状态，支持对象 / 数组折叠、有向上下游和完整链，聚合边保留原引用及去重成员集合。执行图保留缺失原因占位、Call 归属和 Work 顺序边，支持步进；图按 120 节点分页，跨页连线明确未绘制，状态按 200 行分页。新增操作范围、潜在依赖 / 已观测实际关系切换、成员选择与受影响数量下界、Work / Call / 实例泳道、SCC 循环分组和缩放。事件 monotonicTime 用于同页面内跨度展示，不作为跨生产者因果推断或墙上时间。Work 顺序边不传播操作归属；显式 Work 消费和生命周期独立表示，Renderer 请求只按 producer / epoch / requestId 关联，业务来源未提供时保留未知。对象 / 成员展开后复用同一选择，元数据更新不销毁正在使用的下拉框，用户主动选择立即更新。36 人真实 MV3 场景已覆盖修改投保人、24 名未成年人两级联动、12 名成人条件跳过及异步校验；原家庭出行仍保留 5 人业务约束。

2026-11-10 展示聚焦：主导航只保留关系 / 执行两个入口，状态与诊断通过节点详情进入，保留四类数据消费能力。发现第一个可用 Runtime 即自动展示，单表单隐藏对象选择器，多表单切换只列 Runtime；Renderer / 物料仍可从相关节点进入。已选对象存活时不因新生产者出现而跳转。执行入口默认定位最近一次操作，已有显式事件选择时保持上下文；仍可选择其他操作或全部历史。刷新、断开及目录版本置于“更多”，原始事件 JSON 按需展开。默认折叠对象 / 数组；等待表单时说明先在页面创建表单，不用空图替代等待状态。该展示调整不改变自动采集覆盖、事件顺序或业务调度。

执行操作以侧边纵向 tab 列表呈现，按已保留事实顺序追加，显示操作类型、事件序号、页面单调计时及已知修改起点。新事实不抢占当前选中操作或焦点，滚动查看旧记录时保持位置；侧边列表与事件窗口共同有界，缺失仍显式提示。节点采用“对象 / 字段 + 动作结果 + 必要上下文”三层信息：Data Change 展示事件发生时的 path、数据版本跨度和稳定成员；Reaction 展示规则及条件 / 结果、绑定；校验展示来源规则、阶段 / Work 和当前目录归属；请求展示名称、状态和物料。完整文本悬停可读，原始 DTO 仍在详情按需展开。当前目录归属不冒充历史字段位置，缺少命令目标或规则目录时标记未知，不根据相邻事件猜测；不自动广播前后业务值。

自动订阅修订前的本地历史回归为 Runtime 210、Renderer 70、DevTools 11、传输联合 10 项通过；全仓 typecheck、相关 lint、依赖边界、包构建与隔离打包消费者检查已通过。此前离线依赖缓存阻断已经通过临时目录补齐既有依赖缓存解除，没有修改工作区依赖或跳过检查。当时真实 Chromium MV3 扩展已跑通四视图、显式录制 / 步进、断开重连与业务继续填写。独立审查修复会话重连、引用串线、选择残留、Call 命名空间、控制重入、旧请求跨 epoch 和诊断定位扫描预算问题；详细命令与最终复验维护在本变更实施记录。

修订前 `tools/engineering/measure-observation.mjs` 曾以 50 成员、10 轮跨对象两级联动与异步校验测量未连接 / 元数据 / 录制。Apple M5、Node v24.22.0 旧模式样本均值分别约 2.79 / 2.31 / 9.23 ms，录制 12,730 条、0 丢失，快照约 74 KB、交付约 4.08 MB。顺序运行受 JIT / GC 影响，采样堆内存不是真实峰值，且不含完整增量和扩展布局；因此不据此关闭成本任务或固定最终性能门槛。

本地功能切片、完整增量和图模型已补齐；全变更 workflow verify 已通过并按项目工作流归档，收据保留在归档目录。具体证据与已完成清单归档在 `openspec/changes/archive/2026-11-09-devtools-observation-graph/`，不替代权威契约。本次为契约内实施与状态更新，无新增 ADR / 公共语义决策。


2026-11-09 自动订阅修订已贯通：版本 2 Hook.subscribe 在真实连接后自动采集全部生产者，Gateway 异步批量交付；页面就绪与目录变化主动通知，Chrome 主 frame 使用页面消息与 content Port，面板不再定时 discover / readUpdates，手动录制协议与按钮均删除。值与诊断查询过期仅重开重试一次；事件驱动选中快照刷新，接收与 16 ms 合并渲染分离，header / picker / 导航稳定，断开使在途及已排队刷新失效。

视觉按原 HTML demo 对齐：浅灰背景、白卡、紫色状态、侧栏四视图、点阵图、视图标题与详情面板；窄面板纵向排列。关系图三列分别紧凑排布，避免按全体节点序号形成大段空白；复杂自动布局、完整泳道和实际成员统计仍属于上文剩余项。

自动订阅阶段实际验证（完整功能补齐前）：Runtime 208、Renderer 70、DevTools 16、根级联合测试 45 项通过；全仓类型检查、相关 lint、边界、包构建及隔离打包检查通过。真实 Chromium MV3 已验证自动接收（无录制按钮）、四视图选择、下拉框稳定、业务继续填写、断开重连及页面导航恢复。独立审查发现并复验关闭孤儿订阅、无界去重索引、查询过期和断开后排队刷新问题；ACK 超时会通知 content 关闭 Port，不能静默保持已连接。

现行测量脚本按独立进程比较无连接 / 自动订阅未选中 / 自动订阅并读取版本增量。36 成员 × 10 轮、Apple M5 / Node v24.22.0 的均值约 3.26 / 7.50 / 15.60 ms；两种订阅均 9,202 条、0 丢失。各模式进程 RSS 高水位约 168 / 176 / 229 MiB（包含 Node / 编译器启动），selected 首次 283 行快照及后续增量共约 376 KB，事件约 3.4 MB；120 节点真实布局算法最大约 0.99 ms。固定本机宽松回归预算：每轮小于 1 秒、布局小于 50 ms、独立进程 RSS 小于 512 MiB、夹具无丢失；不声称跨设备发布保证。heapUsed 仅采样，不伪称峰值；浏览器绘制与 Node 测量分别验收。事件缓存默认 10,000 条 / 8 MB，避免 36 人初始化立即挤出完整操作；超限仍显式累计缺口。查询每会话固定页、基线、待确认目录及增量结果各受 8 MB 预算（最坏合计 32 MB，不计对象开销）及 30 秒租约约束，固定分页 15 秒过期，关闭立即释放。

### 模块、依赖与现有接缝 {#observation-modules}

数据流为 Prepared / Runtime / Renderer → 观测适配与目录 → 页面桥接 → DevTools Store → 四视图投影。当前包结构保留，首期不新增独立协议包；类型放在 `@form-engine/runtime/devtools` 子入口，Runtime 不反向依赖 DevTools。现有 `runtime/src/observation/` 属于业务观察，新工具采集留在 `devtools/`，避免混用。

| 模块 | 职责与位置 | 边界 |
| --- | --- | --- |
| DefinitionAdapter | 从 Prepared 提取定义、依赖模板、可解析读写关系；每个 Prepared 身份建立一次 | 不执行表达式，不修改 Prepared ABI |
| RuntimeObservation | 从 Runtime 实际状态 / 生命周期采集 DTO | 不另建调度和校验逻辑 |
| RendererObservation | 提供已有投影、owners、Scope、绑定、装配及请求事实 | 不为了查询重算投影或启动请求 |
| ObservationRegistry | 开发态发现、版本检查、能力目录、连接订阅 / 查询会话 / 快照租约、预算与交付 | 不暴露业务调用入口 |
| Transport / 页面桥接 | 类型化请求、租约续期、游标确认和错误传递 | 不把 poll 当成整份 Data / Context 读取 |
| DevtoolsStore | 规范化实体、关系、事件、当前状态及完整性，维护派生索引 | 只有展示副本，不持有可调用 Runtime |
| GraphProjection | 聚焦、折叠、聚合边和布局输入 | 不制造新业务依赖 |
| ViewController | 四视图共用选择与查看游标 | 不通过名称或数组下标猜测身份 |

源码核对发现：现有 list / read / subscribe、开发态目录及失败隔离可复用实现经验；ScopeLocation / ScopeBinding 和 Work / Call 可复用身份语义；DiagnosticReporter / Journal 保留异常现场与封存职责。当前 reaction.execute 发生在 when 前，data.change 主要记录命令字符串，桥接轮询会重读选中源快照，新契约不能从这些旧事件反推完整事实。后续在事实发生处补充采集并替换旧传输接口，不建立旧数据翻译层。

### 身份、关系与选择类型 {#observation-identities}

| 身份 | 语义及存续 |
| --- | --- |
| producerId + epoch | 生产者及重建代次；页面重载 / 生产者重建不串联旧引用 |
| definitionId / PreparedRef | 锁定定义及所用 Prepared 身份 |
| entityId | 某次成员、规则、来源、呈现实例生命周期；移除后重新激活不能复活旧实体 |
| queueEntryId | 一次待执行入队；合并原因沿用该编号，执行中再次入队分配新编号 |
| executionId | 一次真正执行，关联原排队项 |
| workId / callId | 复用校验工作 / 完整调用身份，限定在生产者命名空间 |
| EventRef | 生产者 + epoch + 事件序号，标识不可变事实 |
| connection channel / batchId | 传输连接与该连接的一次推送确认；不充当业务身份 |

```typescript
type ProducerRef = { producerId: string; epoch: string };
type EntityRef = ProducerRef & { entityId: string };
type EventRef = ProducerRef & { sequence: number };
type DataLocation = { member?: string; path: string };
type RuleInstance = {
  ref: EntityRef; definitionId: string; binding: ScopeBinding;
  lifecycle: 'active' | 'disposed';
};
type Selection = {
  entity?: EntityRef;
  execution?: ProducerRef & { executionId: string };
  work?: ProducerRef & { workId: number };
  call?: ProducerRef & { callId: number };
  operation?: EventRef;
  time: { mode: 'current' } |
    { mode: 'history'; cursor: EventRef };
};
```

优先复用已有执行 / Work / Call 编号，不平行分配相同含义的编号；opaque entityId 映射内部实例，不要求工具解析内部字符串键。概念稿中的 memberId / relativePath 在技术 DTO 中映射为现有 ScopeLocation 的 member / path，并非两套业务定位。位置引用与当前存在性分别保存；set 现有成员对象保留行身份，整数组替换重建身份。

关系分定义模板和当前绑定实例两层，不默认把所有模板乘以所有成员。Schema 可提供结构，当前对象存在性由拓扑决定；已加载资源中的 $ref 可解析，递归 / 展开受限保留引用节点，条件 Schema 不经执行不得标为命中。

技术关系 DTO 使用 subject / object 表示语义方向，kind、level、provenance、resolution 沿用前文；原概念 from / to 不作为另一个并行接口。图投影显式转换：规则 watches 字段画为字段 → 规则；后置 requires 前置画为前置 → 后置；规则 mayWrite 字段画为规则 → 字段。解析失败保留原因和原引用。

### 查询与会话接口 {#observation-query-contract}

以下方法名界定逻辑操作，实际导出命名可在实施时整理；输入输出和失败行为是契约。传输信封携带协议版本、requestId、会话及生产者引用；只接受当前协议的已声明操作和对应判别参数，不将任意函数 / Runtime 对象带入传输。

| 操作 | 输入 | 成功返回 | 失败与副作用边界 |
| --- | --- | --- | --- |
| discover | 工具支持的当前协议版本 | 实际版本、生产者、能力目录和限制 | 版本不匹配返回 incompatible，不调用旧 read / subscribe；未发现为 waiting |
| openObservation | ProducerRef、需要的元数据类别 | sessionId、固定快照句柄、版本及增量起点 | busy 可重试；unsupported、disposed、budget-exceeded 明确返回；不控制执行订阅；仅创建独立有界查询会话 |
| readSnapshotPage | 会话、快照句柄、集合、分页游标 | 同一版本实体页、下一页游标、完整性 | 过期返回 snapshot-expired；不自动拼入新快照页面 |
| readMetadataChanges | 会话、baseRevision | revision、切点、upserts / removed / order | 重试固定 offer；下一 revision 确认；busy / 过期 / 无效基线恢复快照；仅选中对象按失效信号读取 |
| readUpdates（显式恢复 / 调试） | 会话、已确认交付游标 | 增量批次、覆盖范围、gap、下一交付游标 | 游标无效 / 会话过期明确返回；不附带整份 Data / Context |
| inspectValue | 位置、期望输入版本、大小限制 | 值预览、真实版本和截断说明 | missing、version-mismatch、disposed、unsupported；不读当前值冒充历史值 |
| subscribe | 类型化消息监听器 | 首次目录、后续目录变动与有界事件批；返回取消函数 | 同步阶段只固定 DTO，监听异步执行；无轮询、无手动录制；失败只影响该连接 |
| locateEvidence | 诊断引用 | 可取回性、稳定定位及不可用原因 | 不默认广播完整输入；失效引用不宣称完整现场已取回 |
| closeObservation | sessionId | 释放确认 | 释放该查询会话资源；连接的 subscribe 由自身取消函数释放，不停止其他会话或业务任务 |

引用、分页游标、连接 channel / batchId 与 sessionId 必须校验归属和 epoch；过期引用不能指向另一个新实例。所有错误仅影响工具结果，不回写业务诊断或改变执行资格。元数据完整性、历史值是否采集和具体能力支持与协议版本分别表达；同版的可选能力缺失返回 unsupported，不等于兼容旧版。

```typescript
type InspectResult =
  | { status: 'ok'; version: InputVersion; value: ValuePreview }
  | { status: 'missing'; version: InputVersion }
  | { status: 'version-mismatch'; currentVersion: InputVersion }
  | { status: 'disposed' }
  | { status: 'unsupported' };
```

### 快照切点、分页与增量确认 {#observation-snapshot-protocol}

在生产者内部状态一致的边界建立切点，固定元数据版本及当时观测游标，从切点后保留有界增量。工具分页加载同一快照并暂存后续增量，快照完成后按序应用。分页不得逐页读 live 状态；固定快照使用有界租约，结构共享或复制小型 DTO 由测量选择。

重入时若 Data 已提交但 Scope / Source 尚在协调，不提供混合快照：返回 busy / retryable，或明确标注上一完整切点；不让业务等待工具。快照过期后重新打开，超出预算、生产者销毁分别返回错误。Runtime 与 Renderer 各有切点和版本，跨生产者视图标注滞后，不承诺全局原子快照。

事件序号与交付游标分离：前者是不可变事实身份和本生产者顺序，后者是会话确认位置。过滤、连接前未观测或会话范围可能使事件序号不连续，不能仅由跳号判定丢包。交付批次包含覆盖范围、过滤信息和已知丢失区间。

页面桥接不再读取即清空：同一交付游标重试允许返回同批事件，工具按 EventRef 幂等去重，确认后释放会话保留窗口。超预算仍可回收，必须返回 gap；缺口由独立控制元数据携带，不依赖可能同样丢失的普通事件。缺口控制信息本身也受预算约束，无法精确保留全部区间时降为“该窗口不完整 / 范围未知”，不能把未知写成连续完整。固定快照加无缺口增量才可用于当前状态一致性校验。

### 事实采集、类型化事件与异步状态 {#observation-instrumentation}

业务路径同步固定最小元数据及顺序编号，工具通知与传输延后独立交付。同步阶段不执行消费者回调、不遍历全图、不复制整份成功输入；元数据构造和预算检查也须隔离异常。不可变 / 有界的事实 DTO 防止延后序列化读到变更后的值。采集不得改变业务微任务、通知次序和错误隔离。

| 采集点 | 事件 | 必须保留的事实 |
| --- | --- | --- |
| dispatch / Context 替换 / 完整校验入口 | operation.started / returned | 来源、输入版本，返回不等于后续工作结束 |
| 成员 / 规则协调 | entity.added / moved / disposed | 实际身份、代次和当时路径 |
| 首次入队 / 原项追加原因 | reaction.queued / queue-merged | queueEntryId、实例与原因；合并不新增执行 |
| 真正取出执行 | reaction.started | 原排队项、executionId、执行输入版本 |
| when 求值完成 | reaction.condition | true / false / error 及错误关联 |
| 动作结束 | action.finished | 动作序号、成功 / 错误 / 无变化 / 未执行及原因 |
| Data / Scope 一致提交后、观察通知前 | data.changed | 实际目标、前后版本、结构变化和所属执行 |
| Source 失效 / Work 选择 | source.invalidated、work.created / reused | 来源、代次及实际工作关系；不把失效当启动 |
| Work 实际启动 / 终结 | work.started / finished | 输入、真实阶段和终结原因；网络返回独立表达 |
| 发布结果、可重入业务通知前 | source.result-published | 新来源状态、版本、Issue 归属及 Work |
| 异步资格撤销 / 返回 / 丢弃 | work.eligibility-revoked / returned / discarded | 撤销原因、返回事实和处理决定；cancel 只是尝试 |
| 完整调用关联 / 结束 | call.attached-work / finished | 各自 requiredWorks、消费关系及真实结论 |

实例 R 的 q1 合并原因 c1/c2 后产生 e1；e1 执行期间再次失效产生 q2/e2，与现有执行前移除 pending 键的语义一致。队列删除 / 熔断需要表达未执行原因，有缺失时不能假定跳过。Command 正常返回但无有效修改只产生动作事实；patch 第一阶段记录真实目标与已知结构变化，只有执行层提供精确子路径时才展开，不伪造逐字段 diff。

```typescript
type EventEnvelope<K extends string, P> = {
  ref: EventRef; preparedRef: PreparedRef; kind: K;
  monotonicTime: number;
  causedBy: readonly EventRef[]; causesComplete: boolean;
  payload: P;
};
type ReactionConditionEvent = EventEnvelope<'reaction.condition', {
  instance: EntityRef; executionId: string;
  outcome: 'true' | 'false' | 'error'; diagnosticRef?: EventRef;
}>;
type WorkDiscardedEvent = EventEnvelope<'work.discarded', {
  workId: number; source: EntityRef;
  reason: 'input-invalidated' | 'source-disposed' | 'runtime-disposed';
  returnedEvent: EventRef;
}>;
```

payload 按事件类型形成判别联合，条件 outcome=error 时必须关联诊断或其缺失说明，不能用大量无约束可选字段替代事实。时间戳仅用于展示时长和排序辅助，不作为跨生产者因果证明；跨来源连接使用显式引用。既有诊断编号通过明确关联映射新事件，不从命令字符串推导。

| 异步状态维度 | 独立含义 |
| --- | --- |
| Work 阶段 | queued / running / pending / settling / done / cancelled，保留现有阶段含义 |
| 返回资格 | eligible / revoked |
| 外部请求 | pending / resolved / rejected |
| 结果处理 | published / discarded / not-observed |
| 业务结论 | valid / invalid / blocked / incomplete 等既有来源状态 |
| 观测状态 | complete / partial / unknown |

资格撤销后的 Work 不再承担当前义务，即使外部请求尚未返回也不能让当前校验永久 pending；迟到返回不恢复旧 Source。现有不具资格时直接 return 的分支，在返回前仅采集最小返回 / 丢弃事实，不重新解析旧结果、不新增污染当前状态的业务诊断。保留 settling 阶段、当前发布判断及错误隔离，避免为了观测改变原 Promise 链的异常含义。

多个 Call 共享一个 Work 节点，各自保存 requiredWorks；启动 origin 不变。调用结束解除运行关联，工具保存有界历史关联，不能让 Runtime 因工具持有结束的 Call 或旧 Journal。记录中的 runtime-disposed 仅在采集渠道仍可交付时可见；销毁后没有事件不能推断外部任务尚未返回。

### Store、四视图投影与布局 {#observation-store-projection}

工具 Store 建立 definitionsById、entitiesById、childrenByParent、relationsById、入 / 出边索引、eventsByRef、executionsById、worksById、callsById、因果父 / 子索引、currentStatesByEntity、diagnosticsByEntity 和覆盖索引。接收流程是协议校验 → 去重 → 当前状态或历史更新 → 受影响索引 → 投影失效标记 → 批量刷新。

当前状态携带生产者与输入版本，旧 Work 迟到事件只能更新历史工作，不能由通用 reducer 覆盖当前 Source；只有明确的当前状态更新 / 结果发布事实才能修改当前结果。Selection 沿用同一引用跨视图定位；历史位置与当前状态显式分开，删除实体保留墓碑或缺失提示。同实例多次执行须选择具体执行，不静默切成最新。

工具步进仅折叠已记录事件；可缓存小型执行图检查点，不保存整份历史业务 Data，不构成时间旅行。关系图按对象 / 数组 / 成员容器及依赖层级布局，循环关系独立成组；执行图按操作 / 成员 / Work 泳道、因果顺序和异步跨度布局；状态树与诊断列表共用选择及定位入口。

首期采用纯 TypeScript 图模型、SVG 连线与 DOM 节点，保持独立面板；布局算法封装接口，外部库留真实规模测量后评估，不新增安装前置。直接上下游只查一跳入 / 出边；完整影响链使用 visited 集合的可达遍历并限制深度 / 节点数，超过显示未展开部分。

折叠将原始实体映射到最近可见容器，按“可见起点 + 可见终点 + 关系类型 + 潜在 / 实际模式”聚合，保留原始引用和去重成员集合。内部边隐藏于跨容器图，展示内部活动数，不变成自触发。未加载完整数组时实际触发数按下界显示“至少 N 个”；总数只有完整目录或同快照精确摘要可支持，不能按当前页面项数统计。完成 / invalid / 异常允许重叠，继续区分统计口径。

布局只在拓扑或折叠变化时更新；状态、选中与步进高亮不使全图重排。大型计算分批并取消过期结果，只布局可见子图；不把布局调度引入业务 Flush。

### 订阅生命周期、资源与破坏性升级 {#observation-breaking-upgrade}

订阅由实际连接持有，不是 Runtime 全局开关。面板建立通道后自动监听所有当前与后续注册的生产者，选中对象只决定元数据 / 值读取和展示。多个面板各自拥有独立有界窗口；一个退出不停止其他订阅。连接开始前已有 Work 或排队项从当前目录理解在途状态，缺失起点保留未知；断开立即结束观测，不等待或取消网络任务。

数据路径为业务采集 → 有界不可变 DTO 队列 → 异步批量推送 → 工具 Store → 视图差异更新。接收不能直接重建面板；目录、元数据和执行历史分开消费，维持下拉框、焦点、选择项与展开状态。空闲无消息时不定时 discover / readUpdates / 读快照。元数据状态变化可合并为按需快照刷新，不可用完整快照查询伪装成事件订阅。

当前 Chrome 主 frame 实现使用静态 content script 的 Port 与面板直连，再以 window.postMessage 桥接页面世界；无需后台服务做轮询。扩展只在 HTTP / HTTPS 页面注册桥监听，面板未连接时不订阅业务事实。Hook 就绪事件支持工具先开、Runtime 后加载；页面导航重建通道。来源窗口、连接标识、批次确认与 DTO 校验共同限定消息路由；页面消息仍视为不可信，连接标识不当作权限凭证。传输每连接最多一批在途，其余事件按条数 / 字节限额缓存，回收显式累计 dropped。无 ACK 超时自动释放并显式断开 Port，覆盖面板关闭后迟到注入的竞态。确认仅释放桥缓存，不推进业务执行。

Port 断开 / pagehide / destroy 释放该连接订阅和待交付缓存，不取消业务任务。订阅不依赖快照 30 秒查询租约，无消息的活连接继续有效；查询会话和固定快照仍有独立过期语义，过期按明确请求重新打开，不用定时读取续命。生产者销毁主动推送新目录，已交付 DTO 可有界保留；旧 epoch 不能进入新对象。必要异常现场始终由原出口独立交付，工具预算不能降低其完整性。

| 资源 | 约束与超限行为 |
| --- | --- |
| 事件条数 / 字节 | 有界窗口，溢出报告缺口 |
| 单事件原因引用 | 有界列表，超限 causesComplete=false |
| 快照数量 / 字节 / 租期 | 拒绝或过期，不混版续读 |
| 墓碑与历史索引 | 随保留窗口回收，缺失引用可见 |
| 值预览 | 深度、项数、字符限制，显式截断 |
| 图展开 / 布局 | 分批、取消过期计算、可见子图预算 |

具体容量、租期、脱敏和性能阈值按原治理边界测量固化，本次不虚构默认数字或零成本承诺。未连接不维护完整工具事件历史；连接即启用有界事实采集，选中对象不改变覆盖起点。生产默认关闭发现及异常独立交付不变。

**升级直接破坏兼容。** Runtime、Renderer、页面桥接与 DevTools 面板作为同一批协议迁移，使用新观测协议版本，正式版本值在交付时确定。移除旧接口路径，不保留 V1 入口、双版本共存、自动翻译或旧页降级。握手先精确校验协议版本，不匹配返回 incompatible 并提示升级，不尝试旧 read / subscribe。页面未提供开发发现入口仍为 waiting，不误报版本不匹配。

此决定只改变 DevTools 观测协议，未授权修改 L1 / Prepared 格式或业务公共 API。阶段拆分用于内部开发与验收，不意味着逐阶段发布给不匹配的旧消费者；对外可用的迁移切片必须同步生产者、桥接与面板。Source Map 缺失、Host 未提供因果及同版可选能力未支持仍如实标注，这些信息缺口不是旧协议兼容机制。

### 技术实施清单与测试落点 {#observation-technical-delivery}

下表细化既有 OBS-0 至 OBS-4，不建立平行路线图。各项实际状态以实施记录与 OpenSpec 单一任务清单为准；此表是完整退出条件，不等于全部已经通过。

| 阶段 | 必需接口 / 模块交付 | 退出检查 |
| --- | --- | --- |
| OBS-0 | 新版类型 / 判别联合、精确版本检查、无效消息拒绝、身份命名空间、fixture；列明各端旧接口删除位置与同步迁移范围 | 旧版本明确拒绝；非法游标 / epoch / 会话归属失败；形成意图→契约→生产者 / 消费者→测试入口映射，无 V1 适配层 |
| OBS-1 | DefinitionAdapter、Runtime / Renderer 元数据、openObservation / 分页 / inspectValue、目录 Store 与当前关系 / 状态 | OBS-A02 / A03 / A10 / A12；移动与两类 set 身份正确；重入读取不混版；过期明确刷新；查询无业务副作用 |
| OBS-2 | 排队 / 执行 / 条件 / 动作 / Change 采集、自动订阅 / 推送及批次确认、因果索引与步进 | OBS-A04–A07 / A11；合并与执行中再入队分开；部分失败不丢成功 Change；重试去重；缺口不补造历史 |
| OBS-3 | Source / Work / Call 生命周期、资格 / 返回 / 发布 / 丢弃、Renderer 请求关联、locateEvidence | OBS-A08–A10 / A16；共享 Work 不重复执行；stale 不取消共享任务；晚返回不污染当前结果；异常现场仍独立完整交付 |
| OBS-4 | 共用 Selection、对象聚合图、完整影响链、精确 / 下界统计、多会话租约、同步升级及成本测量 | OBS-A01 / A13–A15 / A17 和下方技术反例；关闭 / 失败 / 溢出无业务影响；旧协议明确拒绝，公开未验收端与性能项 |

补充技术反例与不变量：

- 每次实际执行最多一个开始与一个已知终结；缺终结不得补成成功。排队被删除有明确原因，未记录为未知。
- 每个有效 Change 关联真实前后版本与执行；无变化命令不得伪造 Change。
- 共享 Work 多 Call 只执行 / 统计一次，资格撤销后不得出现当前发布事实。
- 快照 S@c 加无缺口增量 (c,d] 后，应等于生产者在终点 d 的一致元数据；重入读取返回 busy 或明确上一完整切点。
- 同一游标回复丢失后可重试；重复事件不重复计数；缓冲回收返回 gap，不能因读取已清空而静默漏报。
- 两连接同时自动订阅，退出一个仅释放自身；空闲超过查询租期后仍可推送；连接前任务和断开后终态不补造。
- 数组分页未完成仅显示有依据的下界 / 同版本摘要；折叠不丢跨组边，跨容器镜像实例不重复统计。
- 版本不匹配在读取前拒绝；旧协议无自动翻译或回退。默认生产无发现入口不被工具开启。
- 无工具、自动订阅未选择、已选择、异常、断开及溢出下，相同输入对应业务 Data、校验结论、执行顺序和请求资格一致。

性能验收测量采集耗时、消息字节、峰值内存、快照保留与布局延迟，分别比较无连接、自动订阅未选择、自动订阅并读取选中元数据三种模式。测试入口沿 Runtime / Renderer / DevTools 单元测试及现有扩展 E2E 建立，实际文件与命令由 W3 固定基线后补齐；不把上述清单写成已经通过的运行证据。
