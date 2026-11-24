## 1. 交付
- [x] 1.1 Linear 公共外壳与表单/工作台样式。
- [x] 1.2 真实物料与函数目录 API、搜索和详情。
- [x] 1.3 资产说明与可复制工程示例。
- [x] 1.4 浏览器、API、构建与独立审查，归档确认结果。

## 验证证据
2026-11-14：API typecheck/build/lint 与 6 组集成测试通过；Studio build/typecheck 与真实 Chrome 11 条流程通过（含目录、最后管理员、账号创建→本人改密→停用→恢复、完整发布→公开 Host）。首次 UI 回归发现改密审计无意增加角色revision，已限定revision仅成员变更，最终全套复验通过。目录文档28条派生同步通过，390px目录/成员布局无整页横溢出，浏览器无pageerror。
独立 reviewer 只读复核目录/权限/事务/凭证并发及UI修复，无剩余阻塞项；真实 GitHub OAuth 提供方未验证。原手工 SQLite SHA-256 保持4da722ff08d0c3e00fb6a8cbdf4f5ffd091df6b31346a12812250250f14459ba。

## 最终收口补充
2026-11-14：目录已扩为37项，宽输入说明与示例统一；最终19条Chrome及6组API集成通过，独立审查发现的创建导航竞争已修复并复验。详见 [最终验收记录](final-verification.md) 与 [代码基线](final-baseline.json)。人工体验与真实GitHub OAuth仍待验收；旧批次数字为历史时点，不代表当前覆盖。
