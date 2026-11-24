## 交付与证据

- [x] 1. 归档确认的 Graph、节点状态和跨轮恢复边界。通过文档生成及同步检查。
- [x] 2. 接入统一 Agent Turn，覆盖问答、查询、创建、修复、工作稿只检查与状态复用。隔离 PostgreSQL 下 Python 全套 43 项通过；Python 类型检查通过。
- [x] 3. 接入 Platform 和 Studio，覆盖聊天会话与草稿区分、跨轮恢复、预览及幂等重放。PostgreSQL 集成 4 项通过，API 与 Studio 类型检查通过。
- [x] 4. 独立复审后复核环境指纹、修改授权、手改工作稿、并发与轮次重放。Chrome 通过真实模型和 Compiler 执行 apps/studio/tests/verify-agent-turn.mjs，确认同一会话四轮交付。修复路径另由受控模型与回执回归覆盖。
