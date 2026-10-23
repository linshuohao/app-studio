---
id: ADR-FE-020
title: ADR-FE-020：Reaction 显式状态观察与 Host 行为出口
type: decision
status: accepted
layer: 跨层
modules:
- M03
- M05
- M09
- M11
- M12
- M14
- M15
related:
  decisions:
  - ADR-FE-005
  - ADR-FE-006
  - ADR-FE-010
  - ADR-FE-017
  - ADR-FE-018
sources:
- SRC-REACTIONSTATE
navigation:
  group: 09 · 决策与追溯
  order: 130
last_reviewed: '2026-10-23'
status_note: 观察与响应方向已确认；协议、Schema 和编译检查同步，Runtime 观察 SDK / 调度尚未实现
---

# ADR-FE-020：Reaction 显式状态观察与 Host 行为出口

## 背景与确认范围

用户指出报价等异步业务仍需要由 Runtime 配置触发，不能仅说 Host 自行监听；监听本身也必须说明目标与触发机制。进一步要求补齐 View 更新、校验订阅，并明确询问校验信息如何作为监听对象。最后授权统一更新文档与协议层。

## 已确认选择

1. Reaction 保持同步响应执行，允许复用既有 HostEventIntent 触发 Host 行为；Host 可在内部启动异步任务，Runtime 不等待结果。Command 保持封闭的 Data 修改语言，不开放任意自定义写命令。
2. then 使用 Command | HostEventIntent 的有序数组，兼容旧裸 Command。重复的显式 emit 不合并；规则 Pending 去重与 Host 请求合并分别处理。Host 负责异步请求取消、新鲜度与防覆盖，适用结果以普通 Command 写回。
3. 显式 watch 可观察 Data 或字段 Validation 的 issues / status / state 投影。ValidationReference 供 Reaction 条件与动作只读求值，不能写入，读取不自动补 watch。Data-only Constraint / Binding / Scope / 写目标不扩张，Context / Event 不成为 watch 来源。
4. View 更新、字段校验展示和 Host / Reaction 共用观察注册、分源匹配、通知与释放框架，保留各消费者调度语义。先一致发布来源结果、字段聚合与状态，再通知并重读；每次合格结果分别发布，拒绝过期结果，不等待全部外部任务结束。
5. Compiler 检查新来源、词法 Scope、动作分支与 Host Payload，收集独立于视图的 Reaction Host 需求。Prepared 新语义采用 /2 格式身份，旧 /1 目标拒绝；旧定义可重新编译。Runtime SDK 与精确对外校验返回结构仍待固化。

完整字段及例子见[Reaction](../l1/04-command-reaction.md#reaction-state-host)、[统一观察](../dependency-reactivity.md#state-observation)、[校验发布](../l3-validation.md#validation-state-observation)与[编译衔接](../l2/compiler.md#compiler-reaction-state)。

## 局部替代与延续

局部替代 ADR-FE-005 的“Reaction 只能显式 Data watch”和 ADR-FE-006 的“Host 事件不能作为 Reaction 行为出口”限制；保留 Read / Watch / Subscription 分离、同步 Flush、Pending 按实例去重、顺序行为与受控 Data 写入。因此旧 ADR 整体仍为 accepted，在原文标注局部替代并双向关联，不将未替代部分整体标记 superseded。

ADR-FE-010 的本轮同步 requires 继续有效；新字段观察不成为 Constraint 前置结果总线，也不建立通用异步 DAG。ADR-FE-018 当前轮预算保护继续生效，不能用它保证跨异步轮反馈收敛。ADR-FE-019 的 Context 不直接触发 Reaction 规则继续保留；Context 替换后若产生真实 Validation 状态变化，显式观察该状态的 Reaction 可按本 ADR 响应。

## 收益、代价与状态

收益是配置能统一说明“监听谁、如何触发、触发什么”，并复用已有 Host 事件契约，避免自定义数据命令或独立业务任务 DSL。代价是需要独立 Validation 发布源、投影比较、状态一致性与跨轮反馈验收；业务仍需保证 Host 异步行为的适用性和收敛。

本轮完成静态协议与编译衔接，不意味着 Runtime / Renderer 已执行验收。精确 SDK、Issue 最小字段 / 排序、校验状态枚举与各端订阅实现沿既有模块任务继续，不提高模块完成状态。
