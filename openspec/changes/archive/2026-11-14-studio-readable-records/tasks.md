## 1. Delivery
- [x] 1.1 可读配置名称、冻结保存和迁移；记录标题与完整标识。
- [x] 1.2 物料紧凑卡片、Studio 统一下拉及弹窗 Portal。
- [x] 1.3 37 个资产说明元数据、Host 输入输出表格及对象参数字段说明。
- [x] 1.4 数据结构文档、来源及独立复核。
## 2. Evidence
- [x] 2.1 API 6/6 集成、Studio 16/16 浏览器流程通过。
- [x] 2.2 原数据库副本 4→7 迁移，原 1 表单 / 2 配置 / 1 发布所有旧字段不变；原库 SHA256 4da722ff08d0c3e00fb6a8cbdf4f5ffd091df6b31346a12812250250f14459ba 未变。
- [x] 2.3 IAB 检查桌面/窄屏卡片、筛选菜单、Host 入出参表格、纯函数嵌套参数和旧发布装载。
- [x] 2.4 JSON 精度与节点检查、API lint/typecheck、Studio build 和文档构建同步检查。

浏览器命令：`STUDIO_DIST_DIR=.next/studio-workbench STUDIO_TEST_PORT=3218 STUDIO_TEST_API_PORT=3318 STUDIO_TEST_BROWSER_CHANNEL=chrome pnpm exec playwright test -c apps/studio/playwright.config.ts`。16/16，覆盖 JSON 节点/整对象编辑、保存校验压缩、配置命名、发布确认及自定义下拉、历史/路由、成员、匿名 Host；5 档视口下 10 个页面无整页横向溢出。初轮测试因断言仍引用原生 option、原始 ID 文本和新增记录前的计数失败，已更新为新可观察行为并复跑通过。

API：`pnpm --filter @form-engine/api test:integration`，6/6。原库检查：`node services/api/test/release-name-migration.check.mjs services/api/.platform-data/manual-mvp/platform.sqlite`。IAB 确认既有发布 175cba61-4e4d-4a9b-99da-21772f5dc33f 可加载。1280px 实测卡片高度 214–309px、预览 112–207px，页面 scrollWidth=1280。

运行预览 3219/3319，使用 /tmp 的隔离数据库；原3200服务、原库及执行制品未修改。截图 host-contract-tables.png / material-cards-compact.png 在本轮可视化目录。无新 ADR；本轮为用户授权的加性展示与保存元数据。未提交、推送、合并或部署。公网 GitHub OAuth 未重新实测，浏览器套件使用模拟提供方。
