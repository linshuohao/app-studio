---
id: ADR-FE-003
title: ADR-FE-003：静态视图复用与容器物料呈现
type: decision
status: accepted
layer: 跨层
modules:
- M04
- M14
tags: []
related:
  decisions: []
sources:
- SRC-CONTRACTS
- SRC-L1
navigation:
  group: 09 · 决策与追溯
  order: 113
last_reviewed: '2026-10-19'
status_note: 已确认，端口子类型与适配 API 待固化
---

# ADR-FE-003：静态视图复用与容器物料呈现



## 背景与约束 {#adr-003-context}

同一数据需要 PC 平铺、移动卡片或底部弹层等交互。早期 View Root / Target / Fragment 与 Presentation 契约存在重叠，也曾考虑独立 Validation Binding 和更泛化的模板参数。需要保留复用，同时控制协议概念数量与状态所有权。

## 已确认选择与取舍 {#adr-003-decision}

ViewNode 统一为 MaterialNode / ScopeNode / TemplateUse；具名 Profile 直接是 ViewNode，`default` 不是固定入口。Canonical 使用具名 bindings 和数组 slots；bind / children 仅是 Authoring 简写。Template 采用静态 `$use`、schemaRef 与 Typed DataReference，不共享 UI 实例或业务数据副本。

撤回 `view.present / view.dismiss` 及核心 Presenter，采用 Modal / Drawer / BottomSheet 容器物料和 Slots 自管开闭、焦点与动画。字段 / 校验状态由 Runtime 经已有 Binding 接入，不新增 validationBind / errorBind。Protocol 管统一机制，Manifest 管具体端口 / Props / Slots / Events，业务合法性仍由 Schema / Constraint 管。

这减少重复的展示控制器和参数类型系统，代价是容器物料承担平台交互与组合契约，模板不支持任意配置参数、动态模板 ID 或泛型证明。交互限制如 maxLength 不替代业务约束。

### 2026-10-21：最小物料声明契约

Binding 声明名称和预期数据 Schema，不增加读写权限；实际行为由物料经共用接入能力执行，支持单 / 多字段。静态类型检查不拦截业务不合法 Working Data。Slot 首期只声明名称，不加入通用数量限制，收敛正文原单 / 多节点限制候选。Event 无数据只声明名称，有数据供配置读取时声明 Payload Schema，以检查 Event Reference 和后续类型连接；不增加返回值或异步调用编排。数组 Command 等内部能力调用不重复登记成事件能力目录。

完整类型与运行验收仍待落地，见 [现行最小契约](../l1/05-view-material-host.md#material-minimum-contract)及[用户确认记录](../design-history.md#material-host-contracts-confirmed)。

## 影响与状态 {#adr-003-consequences}

Profile 切换只替换视图订阅与局部状态，共享规则不能因不可见被裁剪。L4 使用 Prepared View，不再解析 AST。挂载 / 改绑 / 首次读取的一致性、端口类型和解析失败接口仍待设计；“Typed Params 可落地”不代表其正式类型包已经交付。

## 来源、替代与关联 {#adr-003-sources}

- 现行：[View / Binding / Slots / Template / Material](../l1/05-view-material-host.md#view)、[Renderer](../l4-renderer.md#renderer)。
- 历史：[L1 修订 04–09 / 11](../design-history.md#history)、[第四至六组与最终稿](../source-map.md#src-l1)、[Profile 去包装修订](../../history/README.md#profile-revision)。独立 fragments、entry 包装、Presentation 和 ValidationMetadata 候选已被明确替代。
- 关联：[ADR-FE-001](ADR-FE-001-boundaries.md)、[ADR-FE-005](ADR-FE-005-watch-subscription.md)；[OD-10 / 11 / 13](../governance.md#open-decisions)继续固化跨端接入。

### 2026-10-20：输入交付与唯一展示来源

普通字段编辑统一采用当前输入交付 Runtime 的方式，不能只因输入暂时不符合 Schema 就保留旧合法值。物料能解析为目标值时写入相应 JSON 值，尚不能解析为合法目标值时可写入当前输入文本作为业务不合法工作值；例如数字字段由 12 编辑成 -，Working Data 可为字符串 "-"，由 Schema / Constraint 报错，不使用 NaN / undefined 表示该输入，也不新增独立 Incomplete 状态。具体解析与显示格式由物料内部实现，共用 Adapter 只封装绑定、指令与 Prepared 求值。

带明确确认动作的交互（例如日期弹层选择后点击确定）可在组件内部暂存未确认选择，确认时才通过既有指令写入 Runtime；取消不提交该选择。这是组件交付时机的选择，不构成第二套引擎临时数据或表单级草稿机制。输入法组合等内部状态同样按组件交互管理，不把每一段内部编辑过程强制解释为已交付业务值。

编辑完成后，展示值必须以 Runtime 当前状态为准，可按组件格式化呈现但不得继续展示另一份独立业务值。运行时写入结果、校验状态与后续修改通过既有订阅反馈给组件；非法输入可继续展示并报错，不能自动回退上一次合法值或让组件显示新值而引擎无声校验旧值。不增加提交前收集全部组件临时值、通用 Codec 生命周期或独立临时状态管理层。

普通输入采用当前值交付方案，确认型交互由物料内部决定写入时机；不采用表单级未交付输入收集机制。记录见 [本轮用户确认](../design-history.md#input-handoff-update)，生命周期与 SDK 仍待固化。

### 2026-10-20：Adapter 生命周期与物料错误隔离

共用 Adapter 统一管理组件侧生命周期、当前 Scope 关联、订阅 / 监听与回调释放，以及 Runtime 数组成员移动、删除、整体替换在视图侧的对应处理。实际数组 Command、Data 与 Scope Identity 的一致修改仍归 Runtime；不把数据操作实现搬到 L4。成员移动保持原 Scope 关联，删除 / 整替换使旧关联失效，Profile 切换只替换视图接入。

卸载或改绑时，Adapter 释放旧监听、订阅与可解绑回调，不要求每个物料重复处理共性生命周期。正确清理后旧回调通常不再触发；已经被排入外部队列或不能物理撤回的调用仍可能迟到，必须按旧组件 / Scope / 关联身份拒绝，不得使用新的绑定上下文写入其他成员。该检查属于 Adapter 实现保护，不建立新的运行时任务队列或要求用户配置。首次订阅读取与改绑交接应不漏更新，具体平台实现由契约测试验证。

单个物料的运行错误在对应物料边界隔离，保留其他可用物料及 Runtime 数据，不因一个物料报错默认停止整表。失败位置须有降级展示，同时提供错误上报与告警接入，报告关联物料 / 配置位置 / Scope 等必要定位信息，用户端不暴露堆栈等技术错误。降级不能静默继续显示旧数据并伪装正常交互；失败物料的不可用交互停止，其他物料继续。错误边界、展示与上报的共性机制由 L4 平台实现 / 共用接入落实，不要求物料自行捕获所有错误；具体展示样式与监控服务由平台 / Host 接入。

用户明确由共用 Adapter 负责，选择过期调用拒绝、对应物料隔离 / 降级 / 上报 / 告警，不采用整表默认失败或旧 Props 静默回退。记录见 [生命周期确认](../design-history.md#l4-lifecycle-error-update)。
