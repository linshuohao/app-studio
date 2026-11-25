---
id: ADR-FE-038
title: ADR-FE-038：Agent 消息引用固定的表单版本
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
  - ADR-FE-037
navigation:
  group: 09 · 决策与追溯
  order: 148
last_reviewed: '2026-11-25'
status_note: 随消息、固定版本、只读已确认
---

# ADR-FE-038：Agent 消息引用固定的表单版本

从已有配置创建新表单时，用户需要明确指定可参考的版本，并能在历史中回到同一配置。用会话绑定表达参考关系会把来源与编辑目标耦合，用最新版本动态解析会使同一条消息在晚些时候产生不同输入。

2026-11-25 用户确认显式引用随消息发送、固定已保存版本、只读。Platform 核对来源权限与版本归属。Agent 按既有轮次归属持久化已解析的输入，公开消息展示引用元数据。首批入口、失败行为与验收见 [Studio Agent 表单引用](../platform-studio.md#agent-form-references)。
