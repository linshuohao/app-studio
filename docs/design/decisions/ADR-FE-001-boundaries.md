---
id: ADR-FE-001
title: ADR-FE-001：唯一业务数据与四层责任边界
type: decision
status: accepted
layer: 跨层
modules:
- M01
- M15
tags: []
related:
  decisions: []
sources:
- SRC-EARLY
- SRC-L1
navigation:
  group: 09 · 决策与追溯
  order: 111
last_reviewed: '2026-10-19'
status_note: 已确认
---

# ADR-FE-001：唯一业务数据与四层责任边界



## 背景、问题与全局约束 {#adr-001-context}

多视图、跨端、异步请求与复杂物料容易使表单协议承担整个应用的责任。来源早期架构包含 Resource Manager、通用能力执行器和外部 Action Pipeline 的候选。需要确定哪些语义进入核心、谁拥有数据，避免相同业务在多个平台重复执行。

## 已确认选择与原有备选 {#adr-001-decision}

采用 Definition → Preparation → Runtime → Renderer 四层；单个实例只有一份权威 Working Data。View / Profile 共享业务数据与规则，Renderer / Material 管 UI 交互，Host 管网络、缓存、重试、上传、保存和真实业务提交。Working Data 允许业务不合法，由校验报告。

原候选将外部资源与能力请求纳入 Runtime；第三组明确将其移交 Host / View Adapter。其代价是 Host 需自行管理请求生命周期、适用性和业务恢复，优点是核心保持可分析的表单语义，避免扩成应用工作流。比较维度为职责重叠、跨端复用、协议复杂度和业务差异，并无来源性能数字。

## 影响与限制 {#adr-001-consequences}

L1 不增加 services / resources / submissionWorkflow 等顶层领域；业务回写走 Command，外部校验报告另核对有效性。物料不得直接写 Store，服务端权限不会被客户端校验替代。物理包边界与部署形态并未由四层逻辑图决定。

本项不冻结 Host 注册和结果 SDK；相关缺口见 [OD-08 / 09](../governance.md#open-decisions)。

## 来源、演进与关联 {#adr-001-sources}

- 现行完整规则：[产品边界与层级](../architecture.md#boundary)、[L1 硬约束](../l1/01-foundation.md#principles)、[Host 三路径](../l1/05-view-material-host.md#host)。
- 可追溯演进：[第三组 ADR-03-00 / EXT-1 / EXT-2 集成记录](../../history/2026-10-16-before-v1-final/changes-2026-10-16.md)、[最初架构来源](../source-map.md#src-early)。原候选仅保留历史效力，不能从更早完整图恢复 Resource Manager。
- 与 [ADR-FE-003](ADR-FE-003-view-material.md)、[ADR-FE-008](ADR-FE-008-host-editing.md)、[ADR-FE-011](ADR-FE-011-release-lock.md)共同约束扩展与状态归属。本 ADR 是既有决策的提取，不是本次重新选型。
