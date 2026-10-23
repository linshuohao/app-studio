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
  decisions:
  - ADR-FE-020
  - ADR-FE-017
sources:
- SRC-REACTIONSTATE
- SRC-COMPILERIO
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

Read 表示可能输入，Watch 表示触发意图，Subscription 表示当前活跃消费者。Reaction 原先只按显式 Data watch（此来源限制已由 [ADR-FE-020](ADR-FE-020-reaction-state-host.md) 局部替代，可显式观察 Validation），when / then 读取仍不自动追加。L2 可以提示差异，由作者确认修改 L1 再编译；不能在 Prepared 或 Runtime 偷改触发条件。

Internal Constraint 自动合并 when + assert；External 合并显式 watch 与 when 可见读取，失效不等于发请求；View Binding / 动态 Props 自动形成计划；事件 Payload 只在事件发生时求值；Issue target 不是唯一输入。

L2 统一分析，L3 统一匹配，业务规则随 Form / Scope 激活，L4 只为挂载 View 订阅。来源比较过 L3 初始化预注册全部 View、L4 自行分析与“L2 编译 + L4 挂载订阅”，采用最后一种。它降低无效订阅与跨端重复分析，代价是要求稳定的读 / 订阅 / 生命周期接口。

## 影响与剩余边界 {#adr-005-consequences}

订阅不隐含首次执行；父可见性观察者需存活以创建子树；虚拟列表和 Profile 切换不删除共享业务规则。统一匹配不统一通知时机或各消费者完成条件。状态引用、计划节点粒度、首次读与改绑一致性、同步重入仍待固化，不能用草图中的 SubscribeOptions.flush 覆盖 Reaction Flush。

## 来源与关联 {#adr-005-sources}

- 现行：[使用位置矩阵](../l1/03-expression-validation.md#expression)、[作者确认](../dependency-reactivity.md#dependency-watch-review)、[L4 三方案及生命周期](../dependency-reactivity.md#dependency-view)。
- 演进：[依赖 V0.1 原件](../source-map.md#src-dependency)与 V0.5 D03 / D04 / D05 的[明确确认](../source-map.md#src-v05)。External dependsOn→watch 是确定字段迁移，正式版本工具仍未发布。
- 关联：[ADR-FE-004](ADR-FE-004-prepared-entry.md)、[ADR-FE-006](ADR-FE-006-command-flush.md)、[OD-04 / OD-10](../governance.md#open-decisions)。


### 2026-10-21：输入输出与精确表达式观察的局部修订

[ADR-FE-017](ADR-FE-017-compiler-io.md)已确认保留 Definition 领域结构、词法引用和表达式语法，规则及完整响应式 $expr 使用就地 watch；模板保留共享，默认入口接受规范及简写，单视图无需额外 Profile / 平台参数。此前关于三类 Plan、模板全展开、集中计划 ID 以及不保留表达式级观察信息的局部选择退出现行方案；原段落留作追溯，不能再作为有效限制。

本 ADR 的核心原则仍有效，未整体废止：唯一 Prepared 入口、静态模板 / 物料与 Runtime 分责、Read / Watch / Subscription 分离继续遵守。现行字段和默认规则以 [L2 确认协议](../l2-preparation.md#compiler-io-contract)为准；尚未同步生产类型与运行实现。

## 2026-10-23 的局部修订

[ADR-FE-020](ADR-FE-020-reaction-state-host.md) 局部替代本文中 Reaction 仅观察 Data、不能复用 Host 行为出口的限制：显式 watch 可含 ValidationWatch，then 可含既有 HostEventIntent。其余 Read / Watch / Subscription 分离、同步 Flush、Command 受控写入与去重原则继续有效。历史选择保留用于追溯，现行字段见[Reaction](../l1/04-command-reaction.md#reaction-state-host)。
