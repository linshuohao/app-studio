---
id: ADR-FE-022
title: ADR-FE-022：React Renderer 与共用物料 Hook
type: decision
status: accepted
layer: L4
modules:
- M14
- M15
related:
  decisions:
  - ADR-FE-023
  - ADR-FE-017
  - ADR-FE-019
  - ADR-FE-020
sources:
- SRC-L4IMPLEMENTATION
navigation:
  group: 09 · 决策与追溯
  order: 132
last_reviewed: '2026-10-26'
status_note: 用户确认完整 L4 方案及四批实施；运行证据随各批补齐
---

# ADR-FE-022：React Renderer 与共用物料 Hook

## 背景与选择 {#adr-022-context}

L1–L3 已有核心实现，React Renderer 与物料入口仍为空。用户提出以 Renderer 组件与共用 Adapter Hook 完成呈现与连接，并在完整草案后明确要求按四批执行、遵守工作流。

采用 FormRenderer 装配树、物料内部 useMaterialAdapter 读取共同能力，配套确定物料定义 / 注册辅助函数。相比向组件注入全部引擎属性，Hook 让物料继续承担组件库事件与解析差异，共用层承担订阅、指令、请求与释放；不同时维护两套主要接入模型，不引入逐物料 Adapter 或 FieldController。

## 决策与约束 {#adr-022-decision}

详细契约、公共接口、目录与实施顺序统一维护在 [L4 React SDK](../l4-renderer.md#react-sdk-delivery)，不在 ADR 复制第二套规范。

Runtime 保持唯一业务状态源；Host 创建 / 销毁 Runtime，Renderer 只持有呈现接入。确认补齐 Interaction、存活性及视图兼容公共接口：执行部分一致、所需函数已装载时可切换 Profile，不重建业务规则，不热替换能力。Prepared 当前只有一个选定视图。

Request latest / parallel、立即 discarded、可选取消、契约检查与局部错误沿已有请求协议；React 首读交接、表达式独立失效与生命周期由共同 Hook 实现。首期客户端呈现，不承诺 SSR 表单水合；正式物料库及真实 Host 应用随后设计。

## 实施与证据 {#adr-022-evidence}

四批依次贯通基本渲染 / Binding、表达式 / 校验 / 组合、Interaction / 请求 / 生命周期、错误 / Profile / 完整联验。每批按 W3 预检、反例测试、实现及复验，复杂路径进行深度审查。归档确认本身不证明实现或生产验收完成。

后续技术诊断呈现按 [ADR-FE-023](ADR-FE-023-independent-devtools.md) 外置：移除内嵌面板和 diagnosticMode，业务错误隔离和本决策的其余契约保持有效。
