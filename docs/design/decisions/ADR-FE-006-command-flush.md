---
id: ADR-FE-006
title: ADR-FE-006：即时非原子 Command 与最新状态 Flush
type: decision
status: accepted
layer: 跨层
modules:
- M07
- M09
tags: []
related:
  decisions: []
sources:
- SRC-V04
- SRC-V05
- SRC-V06
navigation:
  group: 09 · 决策与追溯
  order: 116
last_reviewed: '2026-10-19'
status_note: 已确认跨 Reaction 不声明业务顺序；同步回调归当前轮已确认，队列细节待实现验收
evolution:
- source: SRC-L1
  status: superseded
  label: 早期候选树 / 整体原子 Batch
- source: SRC-V04
  status: accepted
  label: 有序即时 Command；默认非原子
---

# ADR-FE-006：即时非原子 Command 与最新状态 Flush



## 背景与原有候选 {#adr-006-context}

早期曾要求在候选树中执行整个 batch，全部成功后统一提交，执行失败不部分成功；也曾要求每次 Reaction 触发保留独立执行。V0.4 明确指出这些方向与即时输入和状态收敛目标不符。比较重点是输入可见性、动作次数、状态一致性和事务复杂度。

## 已确认选择 {#adr-006-decision}

采用不可变 Working Data Root 与结构共享，有效 Command 同步可见、旧 snapshot 稳定。batch / then[] 按序实时写入，默认非原子，不回滚已成功修改；单次结构操作仍须保持 Data / Scope 一致。

每条 Command 单独检测前后变化。Reaction pending 按实例去重，执行读取最新 Data，执行后再次失效可重新入队。显式 Command 保留顺序与次数，两次 insert 不合并；Reaction 不用于逐次事件记账。

V1 延迟一次启动同步 Flush，内部级联继续当前轮，多个外部 Operation 可共用一轮；Operation 是来源，不是独占业务事务。前轮结束后的异步回写形成新轮次。

### 2026-10-19：规则顺序与宿主任务边界

2026-10-19 已确认：Reaction 不声明彼此前后依赖、业务优先级或拓扑调度关系。一个完整业务计算优先在同一 Reaction 内表达；跨 Reaction 通过真实 Data Change 与自身 Watch 自然级联。业务不应依赖无关规则谁先执行，稳定调度顺序用于复现与排查，不是业务排序手段。多条规则竞争覆盖同一字段、结果依赖最后写入者时，先检查规则拆分与数据模型，不新增优先级或冲突仲裁协议。

Pending 按具体 Reaction 实例去重，执行时读取最新输入；取出执行后再次被有效变化命中仍可重新入队。不承诺任意冲突配置都与顺序无关，也不改变同一 then[] 内显式 Command 的有序语义。同步回调写回归当前轮已确认，具体容器与调用栈处理留给实现验收。

Reaction 仅承担协议内同步联动，不理解网络请求、取消、重试、超时或业务结果适用性。Host 自主管理报价等异步能力：观察所需数据、合并业务任务、管理请求及乱序返回，再通过普通 Command 写回。Reaction Pending 去重只针对 Reaction 实例；Host 请求是否合并由 Host 决定，不强制共用队列，也不新增异步 Reaction 或通用宿主任务调度协议。既有语义事件与 External Validation 接入职责不因此扩展为 Reaction 请求执行器。

## 代价与影响 {#adr-006-consequences}

可存在数据已更新而联动未完成的工作态；Flush 不提交或回滚整轮 Data，也不保证 UI 已绘制或异步校验结束。微任务不保证先画一帧，同步纯函数无法强制抢占。时间切片 / 优先级延期；同步回调写回沿用当前轮与预算已确认；准确启动点和队列细节仍待固化。

可隔离错误继续与整体熔断见 [ADR-FE-009](ADR-FE-009-errors-trace.md)；完整校验 / Submit 不能把 dispatch 返回或队列空当成全部完成，见 [REV-03](../design-review.md#rev-03)。

## 来源与替代关系 {#adr-006-sources}

- 现行：[数据五不变量](../l3-data-scope.md#l3-data)、[Flush 归属](../l3-reactive-engine.md#l3-flush)、[Reaction 合并](../l3-reactive-engine.md#l3-reactions)。
- 历史候选：[第三组 B6 集成记录](../../history/2026-10-16-before-v1-final/changes-2026-10-16.md)；明确替代：[V0.4 第 04–09 章 / R01–R07](../source-map.md#src-v04)，V0.5 D06–D10 继续确认；V0.6 D05 确认逐 Command 检测。
- 旧“失败不部分成功”保留为历史，不与当前非原子契约并列生效。正式接口由 [OD-03 / 04 / 05](../governance.md#open-decisions)继续固化。

### 2026-10-19：同步回调写回确认

同步订阅回调在 Flush 执行期间再次通过 Command 写入数据，写入立即生效，由此产生的联动直接归当前 Flush 处理，沿用本轮去重、执行计数与熔断预算；不另开一轮、不重置预算、不再次延迟启动。Flush 尚未开始时，Pending 用于汇集同步修改和快速交互的重复触发，再统一启动；当前轮真正结束后的新修改进入后续轮次。执行器内部的待执行集合只是当前轮的工作集合，不等于下一轮或一个新的调度阶段。

不新增独立的“通知先入队、回调返回后再交付”机制要求，也不新增第二套通知熔断协议。实现验收须证明同步回调写回不绕过现有整轮保护、不因嵌套调用失控；具体内部容器和调用栈处理属于实现细节，不能把它重新列为未决业务行为。

讨论记录见 [同轮写回](../design-history.md#flush-callback-update)。

### 2026-10-19：交互入口限制，数据层不做业务拦截

业务输入限制在交互入口落实；例如 maxItems=5 时界面禁用添加按钮，不发出插入 Command。数据层不依据业务 Schema 拦截写入：若 Host 导入或程序写入第六项，只要操作结构可执行，就写入 Working Data，再由 Validation 报告超限并阻止提交。目标不是数组、位置非法等结构性错误仍须拒绝，不能与业务校验失败混为一类。该边界统一适用于插入、修改和导入，保留暂时业务不合法的工作态，不增加逐 Command 业务预校验或事务机制。

这澄清既有即时非原子 Command 原则，不新增 ADR 或协议字段；原 array.insert“受目标 Schema 约束”的模糊表述已修正。记录见 [本轮讨论](../design-history.md#input-validation-boundary-update)。
