---
id: ADR-FE-036
title: ADR-FE-036：Agent 会话与平台草稿分别持久化
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
  - ADR-FE-035
supersedes:
- ADR-FE-035
navigation:
  group: 09 · 决策与追溯
  order: 146
last_reviewed: '2026-11-23'
status_note: 已确认全量清洗、独立所有权和删除语义
---

# ADR-FE-036：Agent 会话与平台草稿分别持久化

原实现将消息、待答问题、失败诊断和平台工作稿保存在同一行。API 需要解释 Agent 的历史才能恢复任务，草稿编辑还依赖消息序号。用户明确删除会话时保留草稿，并要求数据与代码全量转向新架构。

Agent 维护会话、消息、任务状态及其存储。API 维护独立草稿、业务交付、预览和正式版本。deliver 分开产生用户可见消息与可选的草稿交付；API 只持久化自己的业务结果。独立身份使删除对话后仍能直接操作草稿。

本决定局部替代 [ADR-FE-035](ADR-FE-035-agent-turn-graph.md) 的状态归属。统一路由、observe 循环、显式修复与人工保存延续。迁移及交接契约见[现行专题](../platform-studio.md#agent-conversation-draft-ownership)。
