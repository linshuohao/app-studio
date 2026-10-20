---
id: PROTOCOL-L1
title: L1 协议设计
type: protocol
status: active
layer: L1
modules:
- M02
- M03
- M04
tags: []
related:
  decisions:
  - ADR-FE-002
  - ADR-FE-003
  - ADR-FE-005
  - ADR-FE-006
sources:
- SRC-L1
navigation:
  group: 02 · L1 协议
  order: 30
last_reviewed: '2026-10-19'
reading_next: L1-FOUNDATION
---

# L1 协议设计

L1 描述表单的稳定业务语义。本层先确定模型与边界，再看各能力的完整协议；每个主题单独阅读，不再把所有内容合并到一张长页面。

## 模型、目标与顶层结构 {#learn-basic}

从基础模型开始，先解释一份 Definition 包含什么，以及哪些执行细节不属于 L1。

- [协议基础、目标与结构](01-foundation.md#summary)
- [L1 模型与设计边界](01-foundation.md#definition)
- [核心规则速查](01-foundation.md#decisions)

## 数据位置与规则语言 {#learn-rules}

先理解数据与引用，再理解表达式、约束、命令和联动。

- [数据、引用与作用域](02-data-reference-scope.md#data)
- [表达式、约束与校验](03-expression-validation.md#expression)
- [命令与同步联动](04-command-reaction.md#commands)

## 重复数据、视图与宿主 {#learn-repeated-data}

Scope 的词法绑定与运行身份不同；视图按这些语义连接物料与宿主。

- [ScopeBinder 与实例身份](02-data-reference-scope.md#scope)
- [视图、物料与宿主集成](05-view-material-host.md#view)

## 组合与生命周期 {#learn-view-composition}

模板复用结构，Profile 选择视图；实例生命周期仍由 Runtime 与 Host 分责。

- [模板与具名端口](05-view-material-host.md#templates)
- [生命周期与多视图交付](06-lifecycle-profiles.md#lifecycle)

## 接入边界 {#learn-integration}

- [Host 三条集成路径](05-view-material-host.md#host)
- [跨层物料与 Host 设计](../extension-integration.md)

## 示例与完整类型查阅 {#reference-protocol}

- [完整示例与业务组合](07-examples.md#sample)
- [类型概念稿与规范固化](08-decisions-release.md#types)

## 本层未闭环的内容 {#reference-release}

主体语义已有共识；严格类型、位置命令、兼容与验收仍需完成。项目尚在设计阶段，没有按历史讨论标签发布的协议或引擎版本。

- [待固化事项与验收](08-decisions-release.md#boundaries)
- [按层维护的待讨论事项](../governance.md#layer-progress)
- [取舍原因与讨论演进（按需）](../design-history.md#history)
