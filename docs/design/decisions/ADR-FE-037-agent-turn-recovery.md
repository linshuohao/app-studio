---
id: ADR-FE-037
title: ADR-FE-037：保存 Agent 轮内消息和步骤结果
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
  - ADR-FE-036
navigation:
  group: 09 · 决策与追溯
  order: 147
last_reviewed: '2026-11-24'
status_note: 已确认消息、调用与阶段结果的持久化及同轮续办语义
---

# ADR-FE-037：保存 Agent 轮内消息和步骤结果

用户曾发送旅险需求并看到需求理解进度，重新打开时历史为空。此前公开历史只读取已完成轮次，Studio 收到的临时进度无法支持刷新后的阅读和续办。

2026-11-24 用户确认每条用户消息、LLM 请求与返回、各步骤结果都要持久化，流式回复可以分批记录。恢复同一轮时读取已完成结果，优先续接活动执行，只重试未完成且无法续接的步骤。该决定细化 [ADR-FE-036](ADR-FE-036-conversation-draft-ownership.md) 所确认的 Agent 数据归属。步骤恢复、可见范围及验收见[现行主题](../platform-studio.md#agent-turn-recovery)。
