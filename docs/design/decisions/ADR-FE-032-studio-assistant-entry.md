---
id: ADR-FE-032
title: ADR-FE-032：统一 Studio 助手入口与首批诊断修复
type: decision
status: superseded
layer: 平台
modules:
- M18
- M19
sources:
- SRC-AGENTBLUEPRINT
related:
  decisions:
  - ADR-FE-030
  - ADR-FE-031
superseded_by: ADR-FE-033
navigation:
  group: 09 · 决策与追溯
  order: 142
last_reviewed: '2026-11-18'
status_note: 已由 ADR-FE-033 替代首期范围与运行安排；保留统一入口的历史决策，未授权编码
---

# ADR-FE-032：统一 Studio 助手入口与首批诊断修复

用户指出AI新建向导和配置修复都需要交互入口，确认统一Studio聊天助手，以复用界面、上下文、状态和结果审阅；要求先归档，再讨论清楚第一批。

采用统一助手侧边面板，支持放大与窄屏全屏。全局助手按钮、表单编辑页及诊断条目打开同一面板；后续表单列表“通过AI新建”同样进入该助手，不独立建设重复的聊天向导。对话表达意图，候选、引用、检查结果与差异采用结构化呈现。

第一批交付统一助手与诊断修复的真实闭环；第二批接需求澄清、配置创作与确认创建；第三批按专题扩展历史会话、跨刷新恢复、一般修改和场景验证。统一外壳不替代各能力独立的输入输出、工具权限、工作流、业务提交动作与评测。

上下文不能随页面切换静默改变，每次运行重新冻结输入并验权。第一批只开放已实现能力；统一聊天不承诺通用任务执行。修复仍经Platform检查、用户审阅应用到编辑区，不自动保存/发布；统一入口不自动引入SSE、服务端聊天持久化或崩溃恢复。

本决定局部替代[ADR-FE-030](ADR-FE-030-agent-harness.md)及旧蓝图中统一聊天入口后置的安排。六类Agent、共享Harness、三层Loop、同步有界修复和人工审阅继续有效，因此ADR-FE-030保持accepted并记录反向关联；[ADR-FE-031](ADR-FE-031-postgresql-agent-runtime.md)的数据域与授权方向不变。

权威详细范围见[统一助手](../platform-studio.md#agent-assistant-entry)。具体会话生命周期、消息与运行映射、路由和错误契约仍在第一批讨论；本次不将未确认建议冻结为实现要求，不启动开发。

2026-11-19：本决定由 [ADR-FE-033](ADR-FE-033-agent-create-conversation.md) 替代，统一面板方向保留；首期改为仅创建、持久会话与异步受理。本页保留原决定追溯。
