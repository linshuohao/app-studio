---
id: ADR-FE-005
title: ADR-FE-005：读取、触发与活跃订阅分离
type: decision
status: accepted
layer: 跨层
modules:
- M05
- M08
- M14
tags: []
related:
  decisions: []
sources:
- SRC-DEP
- SRC-V05
navigation:
  group: 09 · 决策与追溯
  order: 115
last_reviewed: '2026-10-19'
status_note: 已确认，通知与计划 ABI 待固化
---

# ADR-FE-005：读取、触发与活跃订阅分离



## 背景与问题 {#adr-005-context}

读取某个值不意味着它变化时就应触发业务。保费可读取 age / rate 而作者只希望 age 变化时执行；清空选项可以 watch 产品却完全不读取产品。View 未挂载也不应承担所有静态视图观察成本。

## 已确认选择与备选 {#adr-005-decision}

Read 表示可能输入，Watch 表示触发意图，Subscription 表示当前活跃消费者。Reaction 只按显式 Data watch，when / then 读取不自动追加。L2 可以提示差异，由作者确认修改 L1 再编译；不能在 Prepared 或 Runtime 偷改触发条件。

Internal Constraint 自动合并 when + assert；External 合并显式 watch 与 when 可见读取，失效不等于发请求；View Binding / 动态 Props 自动形成计划；事件 Payload 只在事件发生时求值；Issue target 不是唯一输入。

L2 统一分析，L3 统一匹配，业务规则随 Form / Scope 激活，L4 只为挂载 View 订阅。来源比较过 L3 初始化预注册全部 View、L4 自行分析与“L2 编译 + L4 挂载订阅”，采用最后一种。它降低无效订阅与跨端重复分析，代价是要求稳定的读 / 订阅 / 生命周期接口。

## 影响与剩余边界 {#adr-005-consequences}

订阅不隐含首次执行；父可见性观察者需存活以创建子树；虚拟列表和 Profile 切换不删除共享业务规则。统一匹配不统一通知时机或各消费者完成条件。状态引用、计划节点粒度、首次读与改绑一致性、同步重入仍待固化，不能用草图中的 SubscribeOptions.flush 覆盖 Reaction Flush。

## 来源与关联 {#adr-005-sources}

- 现行：[使用位置矩阵](../l1/03-expression-validation.md#expression)、[作者确认](../dependency-reactivity.md#dependency-watch-review)、[L4 三方案及生命周期](../dependency-reactivity.md#dependency-view)。
- 演进：[依赖 V0.1 原件](../source-map.md#src-dependency)与 V0.5 D03 / D04 / D05 的[明确确认](../source-map.md#src-v05)。External dependsOn→watch 是确定字段迁移，正式版本工具仍未发布。
- 关联：[ADR-FE-004](ADR-FE-004-prepared-entry.md)、[ADR-FE-006](ADR-FE-006-command-flush.md)、[OD-04 / OD-10](../governance.md#open-decisions)。
