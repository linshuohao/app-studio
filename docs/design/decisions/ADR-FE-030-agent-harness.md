---
id: ADR-FE-030
title: ADR-FE-030：独立 Agent 服务与共享 Harness
type: decision
status: accepted
layer: 平台
modules:
- M18
- M19
sources:
- SRC-AGENTBLUEPRINT
related:
  decisions:
  - ADR-FE-027
  - ADR-FE-032
navigation:
  group: 09 · 决策与追溯
  order: 140
last_reviewed: '2026-11-15'
status_note: 蓝图与首期行为已确认，仅归档，未授权开发；后续能力与实施细节继续按专题固化
---

# ADR-FE-030：独立 Agent 服务与共享 Harness
2026-11-19 局部替代：首期范围、会话所有权及同步 / 内存 / 不恢复限制由 [ADR-FE-033](ADR-FE-033-agent-create-conversation.md) 更新；当前仅创建、Platform 持久业务会话、Agent 持久执行状态、异步受理与恢复。其余全局职责、分域与安全原则保留。本页原首期描述作为当时决定追溯，当前以新决定为准。


2026-11-15 用户确认 Python + FastAPI + LangChain + LangGraph + LangSmith 独立 Agent 微服务，统一共享 Harness，按能力配置工作流。六类职责为需求分析、配置创作、诊断修复、验证评估、填写辅助、运行诊断。协调器使用显式任务状态图，组织任务工作流、Agent 内部循环及跨 Agent 反馈三层 Loop，统一管理授权、输入快照、总预算及产物。

首期选择 Studio 表单编辑页的诊断修复，通过 Studio → Platform → Agent 接入；Platform 拥有权限、表单与 Compiler 检查上下文，Agent 产生候选，用户审阅后应用编辑区。首期同步请求、最多两轮生成和两次候选检查；业务歧义结束当前运行，补充后重新冻结输入。知识采用版本化只读集，存储由 ADR-FE-031 确认为 PostgreSQL，首期记忆限于运行工作状态及 Studio 当前编辑会话。完整契约与取舍见[现行主题](../platform-studio.md#agent-confirmed-blueprint)。

选择独立服务用于承载用户指定 Python 技术栈及 Agent 生命周期，多个能力通过共享 Harness 复用工具授权、上下文、预算、观测与验证。按职责使用不同子图，避免给每种业务独立复制执行底座。固定修复流程先提供可检查结果，后续按真实场景增加自主工具循环和长任务恢复。

本决策扩展 ADR-FE-027 中预留的 Agent Executor 运行边界，Platform 业务模块继续采用模块化单体，因此无整份 ADR 替代关系。旧“Agent 暂不选型 / 当前不建设”阶段判断由本轮确认更新，历史保留。后续 Host 后端直接授权填写辅助的接入方向已纳入蓝图，具体身份交换和写入契约仍待专题细化。

本轮授权仅归档。接口是实施草案，模型供应方、真实配置传输范围、凭证、运行状态和多实例方向已确认，具体机制与后续会话持久化仍须细化。未声称代码、服务、业务测试或真实模型链路完成。

2026-11-15 存储增补：本地 SQLite 知识包由 [ADR-FE-031](ADR-FE-031-postgresql-agent-runtime.md)局部替代为 PostgreSQL 知识版本，Platform 同步规划持久化迁移。本 ADR 的六类职责、Harness 和首期行为继续有效，保持 accepted。

2026-11-18 入口增补：[ADR-FE-032](ADR-FE-032-studio-assistant-entry.md)局部更新为首批统一Studio聊天助手并接诊断修复，编辑页/诊断是同一面板的上下文快捷入口；统一聊天不再整体后置。六类职责、共享Harness、人工审阅及首期有界修复仍有效，本ADR保持accepted。
