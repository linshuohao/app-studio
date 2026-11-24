# 实施设计

依据 docs/design/platform-studio.md#agent-turn-graph 与 ADR-FE-035，复用既有创建和预览保存契约。保留直接请求边界；执行循环状态只在本轮有效。通过轮次 CAS 和候选摘要约束迟到结果。

集成验收使用独立的本机 Studio、API、Agent 与临时 Platform 数据库。Chrome 的四轮结果依次为 answer、clarification、answer、proposal，最后回执摘要与候选全文相符。首轮路由曾将“创建并先澄清冲突”误判为普通问答，现已约束创建意图下的结构化澄清并复验。复审发现的旧回执复用、扩大修复范围、手改工作稿只检查、迟到重放回复均已修复并回归。多 API 进程并行接收相同请求时模型调用可能重复，数据库限制结果只登记一次。
