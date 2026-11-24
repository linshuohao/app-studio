# 验收增量

## ADDED Requirements

### Requirement: 持久化迁移保持现有行为

Platform SHALL 按 docs/design/platform-studio.md#platform-postgresql-migration 保留数据字节、关系、授权与幂等行为。

#### Scenario: 旧数据导入

- WHEN 导入只读 SQLite 快照到空 PostgreSQL 数据库
- THEN 原始配置字节、发布制品摘要、回执、绑定序号和关系完全匹配

#### Scenario: 跨实例竞争

- WHEN 独立 API 连接并发保存、发布或撤权
- THEN 幂等唯一性、最后管理员、发布最终授权与原子回执契约成立
