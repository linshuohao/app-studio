# 实施设计

## 权威依据与确认

引用 docs/design/platform-studio.md#platform-postgresql-migration 和当前会话确认，不另建主规格。

## 内部方案与影响

pg 连接池、显式 QueryExecutor 与单连接事务；node-pg-migrate 部署步骤独立于应用启动。运行账号不执行 DDL。SQLite 导入只读快照，PostgreSQL 新库导入，先验证目标精确版本和全部表为空，校验文本/字节/关系后，以事务性 ALTER SEQUENCE RESTART 恢复序列。事务外执行密码计算、OAuth 网络与编译，提交时重验资格。首版数据库级事务 advisory lock `(17017, 1)` 串行化写入，保持旧 SQLite 写串行语义并协调不存在键/身份水位，代价是写吞吐串行。后续资源锁优化不能弱化现有反例。锁规则和 SQL 差异已由独立 reviewer 核对。

## 变更与恢复

停写切换，开放写入前可回旧库；开放后保留 PostgreSQL 新写入，修复或回退兼容应用，禁止直接切旧 SQLite 丢数据。本机开发环境已于2026-11-18按用户追加授权完成切换，无生产环境。

2026-11-18 用户确认无生产并授权完整本机切换：专属持久Compose实例、独立账号、本地env加载与真实恢复/Studio验收已执行，原目标环境待定限制在本机范围内关闭。Agent和生产部署不在本轮。
