---
id: ADR-FE-035
title: ADR-FE-035：统一助手轮次与按状态续办
type: decision
status: superseded
superseded_by: ADR-FE-036
layer: 平台
modules:
- M18
- M19
sources:
- SRC-AGENTBLUEPRINT
related:
  decisions:
  - ADR-FE-033
supersedes:
- ADR-FE-033
navigation:
  group: 09 · 决策与追溯
  order: 145
last_reviewed: '2026-11-23'
status_note: 局部替代创建专用入口，沿用直接调用与人工保存；状态所有权由 ADR-FE-036 局部替代
---

# ADR-FE-035：统一助手轮次与按状态续办

用户要求在 Studio 创建流程外支持普通问答，在创建中插问并从现有状态继续。固定从需求理解开始无法区分解释已有问题和授权修改，也会重复处理已有产物。

统一会话采用前置 route，动作执行后经 observe 返回 route。创建按有效需求、工作候选与检查证据选择下一步；repair 独立执行。共享状态记录节点产物、依赖与失效条件；Platform 保存跨轮业务事实，Agent 持有本轮工作状态与预算。纯问答可以直接结束本轮。

本决定局部替代 [ADR-FE-033](ADR-FE-033-agent-create-conversation.md) 的首期仅创建与固定入口。沿用直接调用、版本归属、权限、真实 Compiler 回执与人工审阅保存。节点与验收见[现行主题](../platform-studio.md#agent-turn-graph)。

[ADR-FE-036](ADR-FE-036-conversation-draft-ownership.md) 替代跨轮状态的所有权，保留本决定的路由和节点循环。
