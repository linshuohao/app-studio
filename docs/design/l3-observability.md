---
id: DESIGN-L3-DIAGNOSTICS
title: L3 诊断与 Trace
type: design
status: active
layer: L3
modules:
- M16
sources:
- SRC-V04
- SRC-V05
- SRC-V06
- SRC-HOST
related:
  decisions:
  - ADR-FE-006
  - ADR-FE-007
  - ADR-FE-008
  - ADR-FE-009
navigation:
  group: 04 · L3 运行时
  order: 54
reading_next: DESIGN-L4
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

执行预算与记录预算独立：前者停止无限联动，后者限制事件条数及字节数。Trace 满了可停止详细采集或截断，但计数与循环保护必须继续。合并来源、参数副本等附属记录也需计入容量，不能通过大 `triggeredBy` 绕过记录预算。

推荐在正常容量内保留完整本轮，溢出时保留初始来源与最近一段，并标记 `truncated`；仅保留尾部是替代方案，最终策略仍待决策。截断造成的缺失引用必须如实表达，不能伪造完整因果链。

| 对象 | 生产临时 Trace 方向 | Devtools 可选扩展 |
| --- | --- | --- |
| Reaction / Scope、实际 Command 与目标 | 记录身份和事实 | 同一来源进一步展示 |
| when 结果 / Pure Function ID | 必要的少量元数据 | 更细的求值过程 |
| 标量业务参数 | 脱敏值、受限摘要或不留原值，策略待定 | 在明确授权范围扩展 |
| 大对象 / 数组参数 | 类型、大小、摘要，避免逐步深拷贝 | 受限稳定副本或检查点 |
| Working Data 全量 Snapshot | 不逐步复制 | 历史恢复属于延期能力 |

保存可变 Context / 外部对象引用不能证明历史参数；需要审计时必须明确受限副本或摘要形成的时点。正常结束释放生产完整记录，异常先提取报告；Devtools 可自行长期保留。异常报告至少应定位 Definition / 发布身份、Reaction / Scope / Path、轮次结果、保护原因及截断信息，具体字段、脱敏映射和限频待固化。注册能力、Runtime 和平台的版本信息也影响可解释范围。

报告交给 Host / 配置平台去重、限频，不能成为正常 Data 写入的等待或许可条件；Devtools 的历史保存与事件消费 API 在实现阶段确定。临时记录从首次入队建立到本轮结束释放，不以异常为由给生产 Runtime 增加所有正常轮次的长期历史。

## Devtools 因果分析与复现的三种层次 {#l3-devtools}

事后先扫描 changes 建立 `changeId → executionId` 索引，再扫描 triggeredBy 连边。记录完整时，成本随执行数、变化数和引用数线性增长；Runtime 无需实时维护父子树或运行 Tarjan。以执行实例为节点按时间向前连边，以 Reaction Instance 折叠展示时才可能出现 A ↔ B。

| 能力 | 边界 | 额外条件 |
| --- | --- | --- |
| 复原执行顺序和触发链 | 推荐支持；受截断范围限制 | 有序记录与 Change 关联 |
| 复原历史 Data 值 | 暂不承诺 | 初始 Data + 可重放的实际修改日志 + 数组 / Scope 恢复信息 |
| 确定性重新执行 | 暂不承诺 | Definition / Prepared / Function 版本、初始 Data / Context、外部输入、非确定性来源与环境约束 |

异常可定位不等于时间旅行。Devtools 关闭也必须得到同样的 Reaction 输出与调度结果。

