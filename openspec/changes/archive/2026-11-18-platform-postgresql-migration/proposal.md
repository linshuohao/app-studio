# 本次变更

## Why

用户于 2026-11-17 确认 pg + node-pg-migrate、显式事务连接与并发锁、停写全量迁移及开放写入后的回退边界，并授权实施。

## What Changes

将 Platform 完整存储从 SQLite 迁移到 PostgreSQL，提供隔离测试、SQLite 导入与完整性校验、部署迁移和切换说明。2026-11-18用户确认无生产并授权全切，本机实际数据已切换并完成备份恢复及Studio验收；Agent 功能另行交付。

## Impact

权威依据为 docs/design/platform-studio.md#platform-postgresql-migration 及 ADR-FE-031。覆盖全部 20 表、所有同步数据库调用、启动与测试工具。保护工作区既有修改。旧配置字节、发布摘要、绑定序号、回执及撤权竞态必须保留。
