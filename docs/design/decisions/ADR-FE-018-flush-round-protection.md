---
id: ADR-FE-018
title: ADR-FE-018：可隔离错误继续、当前轮熔断与新触发恢复
type: decision
status: accepted
layer: 跨层
modules:
- M09
- M13
- M15
- M16
related:
  decisions:
  - ADR-FE-006
  - ADR-FE-010
  - ADR-FE-019
sources:
- SRC-L3BASELINE
- SRC-V04
- SRC-V05
supersedes:
- ADR-FE-009
navigation:
  group: 09 · 决策与追溯
  order: 128
last_reviewed: '2026-10-22'
status_note: 保护和后续新触发语义已确认；继承错误隔离与临时 Trace，SDK / 阈值 / Runtime 验收未完成
---

# ADR-FE-018：可隔离错误继续、当前轮熔断与新触发恢复

## 背景与替代范围

用户在 L3 整体领域方案讨论中明确：开发环境熔断报告问题供开发修正，生产环境同样交给监控告警；当前 Flush 停止并清空剩余 Reaction，等待下一次交互或新任务正常触发。此选择替代 ADR-FE-009 后续修订中的持续暂停、必须显式恢复或重建的行为。

本 ADR 完整承接 ADR-FE-009 的可隔离错误、整体预算、同轮重入及临时 Trace 原则，因此旧 ADR 标记 superseded 并保留原文；不恢复局部 Health、失败下游禁用或链级恢复。

## 已确认决定

1. Command 即时修改 Data；可隔离单条错误记录后，后续独立命令和规则继续，已写数据不回滚。Reaction 只按自身 Watch / Scope / when 执行，不检查上游成功状态。
2. 同值过滤、Pending 去重、本轮总执行数与单实例计数共同保护执行。超限停止整个当前 Flush，不局部熔断；无法抢占正在执行的同步函数，耗时只能在执行边界检查。
3. 中止时清空剩余待执行 Reaction，保留 Data；旧 Pending 不转移到下一轮，不据其安排自动重试。本轮 Outcome 如实标记中止，清理前提取诊断与受限 Trace。
4. 下一次外部交互或 Host 新操作产生有效 Watch 失效时，按正常流程建立新 Flush 和新预算。未产生有效失效不伪造入队，不重放旧队列，也不再次应用已有实例的 runOnActivate。正常恢复不需要 resumeReactions 类入口。
5. Flush 内同步回调写回仍归当前轮，沿用同一去重与预算；不能借重入重置计数。只有当前轮真正结束后的新触发，才属于后续轮次；上报回调不因中止事实自动安排联动重试。
6. 保留填写、Command、读取、快照与独立完整校验。Reaction 错误或熔断不直接阻止提交；必要校验无法完成仍不能通过。被丢弃的联动可能留下未完成的计算，必须成立的业务关系由 Constraint 检查，不能承诺业务结果完全不受影响。
7. Trace 记录 Operation / Change / Reaction / Scope、执行顺序、结果和合并触发来源；首次 Reaction 入队建立轮次上下文，正常结束释放，异常先交付受限报告。Devtools 可自行保存；Trace 不参与执行许可，也不证明确定性重放。
8. 执行预算与记录预算独立，记录截断后保护计数继续。开发端提供可定位诊断；生产由 Host 监控告警及业务承接，不把技术错误直接暴露给终端用户。报告通道不能成为数据写入或清理的等待条件。

## 取舍与未完成工作

收益为故障限制在当前轮、后续新交互仍可驱动正常联动，并省去持续暂停 / 手动恢复状态。代价是错误配置在下一次相关交互中仍可能再次触发熔断；依靠本轮预算限制、可定位报告和开发修正，不用旧任务无限自重启。

L2 潜在环诊断不替代运行保护；具体 SCC 算法、稳定队列、Trace 头尾截断、参数脱敏 / 摘要、报告限频和阈值仍按实现及基准固化。全表 Hash、热路径完整因果图、局部指纹与历史重放不因本轮归档进入首期。

本轮确认行为，不宣称 Runtime、错误码、Outcome SDK、监控平台或性能验收已实现。完整规则见 [L3 执行](../l3-reactive-engine.md#l3-errors)，设计验收以 C16 / C17 及新触发、旧队列清理和同轮预算案例为准。

## 来源

[SRC-L3BASELINE](../source-map.md#src-l3-baseline)记录本轮用户确认与替代范围；[演进](../design-history.md#l3-domain-baseline-confirmed)保留旧方案和新选择的关系。
