---
id: ADR-FE-008
title: ADR-FE-008：业务 Baseline、Dirty 与 Reset 归 Host
type: decision
status: accepted
layer: 跨层
modules:
- M15
tags: []
related:
  decisions: []
sources:
- SRC-V06
- SRC-HOST
navigation:
  group: 09 · 决策与追溯
  order: 118
last_reviewed: '2026-10-19'
status_note: 已确认，明确替代 V0.6 D07 / D08 的核心职责
evolution:
- source: SRC-V06
  status: superseded
  label: Runtime 自动业务 Baseline / Reset 主动重算
- source: SRC-HOST
  status: accepted
  label: 业务编辑归 Host；已有实例只响应有效 Watch 变化
---

# ADR-FE-008：业务 Baseline、Dirty 与 Reset 归 Host



## 背景与原有结论 {#adr-008-context}

V0.6 曾确认 Runtime 在初始 Reaction 正常收敛后建立业务 Baseline，并要求 Reset 按当前环境重算，具体入口范围和 Context 对 Dirty 的影响待讨论。这会使 Runtime 判断业务编辑语义，并可能在 Watch 未变时重跑已有规则。

后续用户明确修订四条原则，见来源决策摘录；它是已保存的结论证据，不是完整逐字会话。不能只按时间较晚推定替代，替代关系在来源中有直接说明。

## 现行选择与取舍 {#adr-008-decision}

数据是事实，不划分用户 / Host / Reaction 字段所有权。常规 Reaction 仅响应显式 Watch 的有效观察值变化。runOnActivate 只适用于新 Reaction 实例首次建立；导入、恢复、读取 snapshot 或重挂 View 不再次激活已有实例。

Runtime 提供稳定只读 snapshot，读取不隐式 Flush、不建 Baseline、不标 Clean、不等待所有异步校验。Host 自选业务快照和时点，定义 Dirty、保存与 Reset 意图；恢复生成普通 Command，遵守相同变化检测。

这保留不同应用的编辑定义，避免核心编辑状态与强制重算机制，代价是 Host 需明确完成观察、业务基准及防止迟到输入覆盖编辑。Runtime 保证按协议执行和维护校验，不自动修复作者未正确声明触发的业务结果。

## 关键反例与影响 {#adr-008-consequences}

现存规则只 watch age，没有先前 pending；age25 / premium150 被导入 age25 / premium80，age 未变，结果保持 premium80。先前 age25→26→25 已登记的 pending 仍可合并执行，不被同值导入取消。不能伪造实例重建来强制重算；真正新建 Scope 按身份契约处理。

V0.6 D07 / D08 被替代，D21 Reset 重算入口、D22 Context Dirty 移出 Runtime 未决项。保留逐 Command 旧值视图、Trace 和相对 Scope 原则。Context 另经用户确认维持 Host 提供 / 表达式只读 / Data-only Command 与 Watch，不因本决策扩展。

首次激活默认不执行已确认；正式字段、实例替换、snapshot 与完成 SDK 尚待固化，不能把业务编辑策略重新列为核心阻塞。

## 来源与关联 {#adr-008-sources}

- 当前完整规则及 B01–B08：[四条原则](../l3-reactive-engine.md#l3-runtime-host-boundary)、[初始化 / 快照](../l3-data-scope.md#l3-initialization-baseline)、[L1 生命周期](../l1/06-lifecycle-profiles.md#lifecycle)。
- 被替代依据：[V0.6 来源](../source-map.md#src-v06)第 04 章、D07 / D08 / D21 / D22；现行[来源状态与处理](../design-history.md#l3-v06-decisions)逐项保留。
- 明确修订：[Runtime / Host 来源包](../source-map.md#src-host)中的 `user-confirmed-runtime-host-boundary.md`；[归档说明](../../history/README.md#runtime-host-boundary)记录摘录的证据边界。
- 关联：[ADR-FE-005](ADR-FE-005-watch-subscription.md)、[ADR-FE-007](ADR-FE-007-scope-comparison.md)、[OD-06 / 09](../governance.md#open-decisions)。

### 2026-10-19：首次激活默认不执行

新 Reaction 实例默认不因建立而执行；只有显式开启首次激活执行时才在建立时入队。该默认值同时适用于引擎初始化、数组插入及整体替换后建立的新成员。初始化已有输入不伪造为新实例的一次 Watch 变化；建立之后的有效 Watch 变化仍正常触发。首次校验与首次视图读取有各自入口，不受此默认值控制。

理由是装载输入不等于用户切换，默认运行清空 / 重置类规则可能破坏草稿；需要初始化计算的规则显式开启。正式字段与兼容仍待固化。讨论记录见 [首次激活默认值](../design-history.md#reaction-activation-default-update)。
