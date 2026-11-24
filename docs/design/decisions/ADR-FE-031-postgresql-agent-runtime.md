---
id: ADR-FE-031
title: ADR-FE-031：PostgreSQL 数据域与 Agent 运行授权
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
  - ADR-FE-030
navigation:
  group: 09 · 决策与追溯
  order: 141
last_reviewed: '2026-11-18'
status_note: 存储、内部凭证与运行路由已确认；Platform PostgreSQL 存储及本机开发数据切换已验证；无生产部署，Agent 开发未执行
---

# ADR-FE-031：PostgreSQL 数据域与 Agent 运行授权
2026-11-19 局部替代：首期范围、会话所有权及同步 / 内存 / 不恢复限制由 [ADR-FE-033](ADR-FE-033-agent-create-conversation.md) 更新；当前仅创建、Platform 持久业务会话、Agent 持久执行状态、异步受理与恢复。其余全局职责、分域与安全原则保留。本页原首期描述作为当时决定追溯，当前以新决定为准。


2026-11-15 用户认可内部凭证、运行记录与多实例方案，并要求使用主流持久化技术；随后确认 PostgreSQL 统一持久化，Platform 与 Agent 分别管理数据域，授权归档且暂不开发。

初期同一 PostgreSQL 实例内分 platform_db 与 agent_db，独立数据库账号。Platform 管业务数据及运行授权 / 检查凭据；Agent 管知识版本及未来会话 / checkpoint / 长期记忆，首期工作记忆仍在进程内。服务通过 API 访问对方业务能力。Python 自有表用 SQLAlchemy / Alembic，官方 LangGraph PostgreSQL 适配表独立管理。Redis、S3 兼容存储、pgvector 按后续需求引入。

双向服务密钥区分调用身份，随机短期运行 Token 绑定任务范围，Platform 仅存摘要并动态复核资格。短事务、条件更新及唯一约束处理检查额度、同候选重试与终态竞争；撤权和提交用一致锁顺序协调。多 Platform 实例共享数据库，首期 Compiler 发布采用排空方式，同步 Agent 运行不自动跨实例恢复。

本决定局部替代 ADR-FE-030 对本地只读知识包的存储表述，以及讨论阶段沿用 SQLite 运行表 / 单机共享文件的建议。ADR-FE-030 的六类职责、Harness、Loop 与首期行为继续有效，因此未将整份 ADR 标记 superseded；双方明确关联局部替代关系。旧方案和演进原因见[历史](../design-history.md#agent-storage-evolution)。

权威细节见[存储与运行](../platform-studio.md#agent-storage-routing)、[知识包](../platform-studio.md#agent-knowledge)、[Platform 迁移范围及顺序](../platform-studio.md#platform-postgresql-migration)。迁移包含所有现行表与调用方、异步事务、旧数据 / 文本 / 制品摘要完整性、回归、备份、切换和回退。2026-11-17 用户确认预检建议并授权 Platform 实施；现采用 pg + node-pg-migrate，PostgreSQL 18 为验证基线，具体导入、锁和回退边界已在权威正文及 API 操作说明补齐。2026-11-18 按用户“全切了，我们没发生产”的确认完成本机业务数据切换、持久化配置及恢复验收；Agent 未开发；其凭证轮换细节、崩溃失效机制等仍按 Agent 范围后续完成。
