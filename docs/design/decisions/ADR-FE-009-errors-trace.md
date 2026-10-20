---
id: ADR-FE-009
title: ADR-FE-009：可隔离错误继续、整轮保护与临时 Trace
type: decision
status: accepted
layer: 跨层
modules:
- M09
- M16
tags: []
related:
  decisions: []
sources:
- SRC-V04
- SRC-V05
navigation:
  group: 09 · 决策与追溯
  order: 119
last_reviewed: '2026-10-19'
status_note: 基线已确认；Pending、通知、Trace 接口仍待固化
evolution:
- source: SRC-V04
  status: superseded
  label: 局部 Health 与失败影响链候选
- source: SRC-V05
  status: accepted
  label: 独立错误继续；整体 Flush 预算停止
---

# ADR-FE-009：可隔离错误继续、整轮保护与临时 Trace



## 背景与演进 {#adr-009-context}

状态规则可以成环但最终收敛；静态图有环不能证明死循环，运行时也无法通用证明任意函数终止。V0.4 保留普通错误隔离与整体 / 局部停止的选择，并提出跨轮局部不可信范围和 Health 恢复候选。V0.5 明确缩减其执行控制复杂度。

## 已确认选择与代价 {#adr-009-decision}

可隔离单 Command 错误记录后，后续独立命令和规则继续，已写 Data 不回滚。Reaction 不检查上游健康，只按自身 Watch / Scope / when 响应。执行预算超限停止整个当前 Flush，不维护父子规则控制、失败下游禁用、局部熔断或链级 Health。

保护采用同值过滤、pending 去重和本轮总数 / 单实例计数，阈值待标定。L2 的潜在环诊断不替代运行保护；SCC 具体算法为推荐。默认逐步全表 Hash / 热路径因果图被排除，局部指纹和高级图分析延期。取舍是以有限执行和可定位异常替代形式化终止证明和复杂影响链状态机。

Trace 是有序执行事实、实际 Change 与 triggeredBy 来源；首次 Reaction 入队建立临时 Context，正常轮结束释放，异常先提取受限报告，Devtools 自行持久保存。执行预算与记录预算独立，Trace 截断不能停止保护；同一规则多次执行有不同 executionId。

## 未决边界与影响 {#adr-009-open}

2026-10-19 已确认：Reaction 错误只表示相应联动未完成，不自动阻止提交；独立规则继续，已写 Data 不回滚。代码异常报告交 Host，用于正确用户提示与监控告警；网络失败由 Host 提示 / 重试。业务校验不通过与校验执行异常分别表达，必要校验无法完成不能放行。非关键辅助操作失败不阻断主流程。

整体预算熔断停止整个当前 Reaction Flush，并暂停该实例后续 Reaction 自动执行；剩余任务不得自动跨轮续跑，后续输入也不自动重启联动，须显式恢复或重建。恢复入口、剩余队列物理清理与重建规则仍待固化。保留当前 Data、填写 / Command、读取 / 快照与独立完整校验能力，Host 提示自动联动已暂停。这里“整体停止”针对联动执行，不表示数据和校验能力全部失效，不建立局部 Health 或失败下游传播。

Host 主动对当前数据发起完整校验，不为提交额外触发一轮 Reaction，也不要求历史 Reaction 成功。Schema 与全部适用同步 / 异步 Constraint 通过后，可提交该次证明对应的数据快照。必须成立的业务关系应表达为校验约束，不能只依靠联动成功维护。联动 Outcome 与完整校验结论分别报告；校验通过不把熔断改记为正常收敛。若数据已无法可靠读取或校验机制不可用，则无法证明合规，不允许据此提交。

Pending 清理、恢复 API、错误编码与准确 Outcome 类型仍待固化。

头尾或仅尾截断、参数摘要 / 脱敏、副本、事件 API、限频与阈值尚未冻结。Trace 解释调度原因，不证明所有输入为业务计算必要条件，也不承诺历史值恢复或确定性 Replay；Trace 不参与调度许可。

## 来源、替代与关联 {#adr-009-sources}

- 现行：[保护](../l3-reactive-engine.md#l3-protection)、[错误](../l3-reactive-engine.md#l3-errors)、[Trace / 预算](../l3-observability.md#l3-trace)。
- 来源：[V0.4 第 10–15 章 / R08–R24](../source-map.md#src-v04)；[V0.5 第 08 / 10–13 章与 D09–D12](../source-map.md#src-v05)明确替代局部 Health 候选，现行 R12 / R14 / R15 / R16 保留修订说明。
- 关联：[ADR-FE-006](ADR-FE-006-command-flush.md)、[REV-03](../design-review.md#rev-03)、[OD-03 / 04 / 12 与 T02](../governance.md#open-decisions)。

### 2026-10-19：同步回调写回确认

同步订阅回调在 Flush 执行期间再次通过 Command 写入数据，写入立即生效，由此产生的联动直接归当前 Flush 处理，沿用本轮去重、执行计数与熔断预算；不另开一轮、不重置预算、不再次延迟启动。Flush 尚未开始时，Pending 用于汇集同步修改和快速交互的重复触发，再统一启动；当前轮真正结束后的新修改进入后续轮次。执行器内部的待执行集合只是当前轮的工作集合，不等于下一轮或一个新的调度阶段。

不新增独立的“通知先入队、回调返回后再交付”机制要求，也不新增第二套通知熔断协议。实现验收须证明同步回调写回不绕过现有整轮保护、不因嵌套调用失控；具体内部容器和调用栈处理属于实现细节，不能把它重新列为未决业务行为。

讨论记录见 [同轮写回](../design-history.md#flush-callback-update)。
