---
id: DESIGN-L3-DIAGNOSTICS
title: L3 诊断与 Trace
type: design
status: active
layer: L3
modules:
- M16
sources:
- SRC-RUNTIMEIMPLEMENTATION
- SRC-L3BASELINE
- SRC-V04
- SRC-V05
- SRC-V06
- SRC-HOST
related:
  decisions:
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
last_reviewed: '2026-10-26'
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

概念级结构如下；字段、ID 空间、操作与变化粒度、失败 / 无变化的编码继续固化，不直接发布成正式 TS 包：

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

来源草图同时给变化记录放入 `changed` 标志；本篇将有效变化与无变化 Command 事实分开说明，保留其信息需求，不冻结两套并行变化模型。首个失效之前的 Operation / Change 必须能在建立 Context 时被关联，具体采集方式待定。

继续要求记录预算内的 Operation、Reaction 与 Command 结果。可隔离错误后仍可能有成功修改，因此记录应能区分失败命令、无变化尝试与后续实际 Change，不能只用整条 Reaction 的 success / error 推断每条命令的结果。具体事件粒度与字段仍待固化；这些状态只用于诊断，不用来禁用其他规则。推荐 Prepared Source Map 关联原始 L1 的身份、版本和位置，便于由报告回查配置，详见 [编译来源](l2-preparation.md#l2-authoring-diagnostics)。

## 记录预算、参数与异常上报 {#l3-trace-budget}

执行预算与记录预算独立：前者停止无限联动，后者限制辅助 Trace 的事件条数及字节数。Trace 满了可停止辅助详细采集或截断，但计数与循环保护必须继续。合并来源、参数副本等附属记录也需计入容量，不能通过大 `triggeredBy` 绕过记录预算。下方异常现场的必需信息不得按辅助 Trace 截断策略静默省略；完整性、采集载体和资源成本须分别处理。

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

2026-10-25 本批 Runtime 已交付 `Diagnostic.evidence` 的触发 / 调用输入、执行对象、Prepared 身份、阶段与错误堆栈；错误独立交付，不受辅助 Trace 容量抑制。异步任务捕获启动现场，完整校验按调用身份收集诊断，结束释放收集器。字段和实际用例见 [Runtime Review 入口](../../packages/runtime/README.md)及包内 diagnostics 测试；持久化、完整 Devtools 路径和生产容量仍未实现，不据此宣称本章全部验收通过。

最初归档仅固化信息要求；上述 TS Runtime 实施已补齐对应调用边界的完整现场，仍不冻结跨端 SDK、采集后端或提高 M16 整体完成度。2026-10-26 任务合并进一步区分启动身份与消费关联：`execution.callId` / `origin` 保留真实执行来源，`relatedCalls` 关联正在等待共享任务的完整调用，确保新调用能够收集复用任务的异常。调用结束解除关联、封存收集器，任务只保留必要输入与编号，不持有已结束的调用 / Flush 上下文。规则见 [调用合并](l3-validation.md#validation-work-coalescing)。来源见 [SRC-RUNTIMEIMPLEMENTATION](source-map.md#src-runtime-implementation)。

报告交给 Host / 配置平台去重、限频，不能成为正常 Data 写入的等待或许可条件；Devtools 的历史保存与事件消费 API 在实现阶段确定。首次入队前后的触发信息需采集并接入本轮；执行上下文与 Journal 在实际调度开始时建立，结束后先封存并交付记录再释放。信息可由外部采集设施承接，不以异常为由给生产 Runtime 增加所有正常轮次的长期历史。

2026-10-24 用户确认并授权落实该生命周期拆分。当前代码中，FlushContext 持有本轮预算计数、停止标志和临时 Journal；DiagnosticReporter 是实例诊断出口及有限最近事件查询，异步交付封存轮次报告和独立事件。异步 Host / Validator 仅持有启动来源编号，迟到回报不会追加到旧 Journal 或冒充其他同步轮次事件。代码入口及局部图见 `packages/runtime/README.md`。本批实现条数截断与来源关联，但完整 Command / Change 因果事件、字节预算、脱敏和生产报告阈值仍待交付，不因生命周期回归通过而整体标记 Trace 完成。

## Devtools 因果分析与复现的三种层次 {#l3-devtools}

事后先扫描 changes 建立 `changeId → executionId` 索引，再扫描 triggeredBy 连边。记录完整时，成本随执行数、变化数和引用数线性增长；Runtime 无需实时维护父子树或运行 Tarjan。以执行实例为节点按时间向前连边，以 Reaction Instance 折叠展示时才可能出现 A ↔ B。

| 能力 | 边界 | 额外条件 |
| --- | --- | --- |
| 复原执行顺序和触发链 | 推荐支持；受截断范围限制 | 有序记录与 Change 关联 |
| 复原历史 Data 值 | 暂不承诺 | 初始 Data + 可重放的实际修改日志 + 数组 / Scope 恢复信息 |
| 确定性重新执行 | 暂不承诺 | Definition / Prepared / Function 版本、初始 Data / Context、外部输入、非确定性来源与环境约束 |

上述历史恢复 / Replay 边界不减免[执行异常完整现场](#l3-error-evidence)的必需采集与交付。Devtools 完整路径是扩展采集和呈现目标，不以当前有界事件尾部已存在而声称完成。

异常可定位不等于时间旅行。Devtools 关闭也必须得到同样的 Reaction 输出与调度结果。

