---
id: ADR-FE-023
title: ADR-FE-023：独立 DevTools 与开发态观测接缝
type: decision
status: accepted
layer: 跨层
modules:
- M14
- M16
related:
  decisions:
  - ADR-FE-025
  - ADR-FE-022
sources:
- SRC-OBSERVABILITY
- SRC-DEVTOOLS
navigation:
  group: 09 · 决策与追溯
  order: 133
last_reviewed: '2026-11-08'
status_note: 用户确认独立包、浏览器扩展及只读首期方案并授权落地；不代表全端发布验收
---

# ADR-FE-023：独立 DevTools 与开发态观测接缝

## 背景与决定 {#adr-023-context}

L4 首批实现使用 diagnosticMode 在业务组件树中展示技术详情。用户指出开发工具应独立为包，优先类似 React / Vue DevTools 的浏览器扩展，通过环境标记发现和采集，对业务开发无感知，并明确要求按完整边界方案落地。

选择独立 packages/devtools，浏览器扩展作为工具宿主；Runtime / Renderer 仅保留必要事实出口、错误隔离和很薄的开发态观测接缝。环境构建条件决定是否提供发现能力，页面标记只负责连接，不授权生产采集。相比业务页面内嵌面板，业务无需导入工具、添加组件或传展示开关；相比只靠 DOM 或 React 私有结构推断，明确观测接口能准确关联 Runtime、Scope、物料和请求。

## 约束与取舍 {#adr-023-decision}

详细契约统一维护在 [独立 DevTools](../l3-observability.md#independent-devtools)。工具首期只读；不依赖其安装、连接或正常工作才能执行业务。查询不触发纯函数重算、指令、校验或额外业务观察。业务错误提示和必要诊断 / 异常完整现场仍留在引擎及 Host 原出口。

替代 L4 首批的内嵌技术详情和 diagnosticMode 实现选择；ADR-FE-022 的 Renderer / 共用 Hook、状态所有权、请求与生命周期决定继续有效，不整体废弃该 ADR。移除展示 API 和修复诊断回调改动造成重建属于本次确认范围。

开发发现具有额外小量目录和通知成本；完整 UI / 桥接 / 缓存归工具包，默认生产产物不注册发现入口。连接、断开、重连及工具抛错不应改变业务调度、数据结果或请求资格。工具展示限额与 Trace 缺失须明确，不降低已有必要异常现场要求。编辑、时间旅行、重放、跨 frame 及其他浏览器宿主适配留后续。

## 后续观测能力扩展 {#adr-023-observation-extension}

2026-11-08 [ADR-FE-025](ADR-FE-025-observation-contract.md)确认通用观测数据、结构化上报与四视图；本决定的独立工具、只读、环境和所有权边界继续有效。首期实现与后续目标分开记录，详见[通用观测契约](../l3-observability.md#observation-contract)。
