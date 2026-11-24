## 1. 实现
- [x] 1.1 显式发布确认、版本目标关联、URL 与导航竞态保护。
- [x] 1.2 共用 JSON 节点编辑 / 查看，校验、压缩、精度与只读历史。
- [x] 1.3 目录说明、事件 / 请求 / 约束、core 示例与复制反馈。
- [x] 1.4 成员并发 / 自身权限反馈、GitHub 读取 / 解绑反馈。
- [x] 1.5 Host 默认复用、独立实例、编号、URL、草稿反馈。
## 2. 验证
- [x] 2.1 最终源码独立复核与 JSON / API / 浏览器回归。
- [x] 2.2 实际浏览器逐页验证与原数据只读核对。
- [x] 2.3 权威文档构建、同步检查与正式变更归档。

## 3. 追加授权与交付证据
- [x] 3.1 对象 / 数组整块四空格格式化编辑、类型校验与弹窗自适应高度。
- [x] 3.2 可选发布名称、冻结重试、nullable 增量迁移、Studio / Host 显示。
- [x] 3.3 控件防挤压、长 ID 缩写、目录局部滚动和五档视口边界。

最终执行：`STUDIO_DIST_DIR=.next/studio-workbench STUDIO_TEST_PORT=3218 STUDIO_TEST_API_PORT=3318 STUDIO_TEST_BROWSER_CHANNEL=chrome pnpm exec playwright test -c apps/studio/playwright.config.ts`，14/14 通过。覆盖保存/创建/复制未知结果重试、权限变化、历史与受控预览、延迟请求导航、发布目标与名称、匿名 Host、目录、成员与密码、GitHub 模拟提供方。宽高用 1440×900、1024×768、768×600、390×844、844×390 五档，10 个具体页面加载后测量；对象弹窗 bounds 与整页横向溢出检查通过。

`pnpm --filter @form-engine/api test:integration --testTimeout=15000` 6/6 通过，发布名称重试/输入边界包含其中；API lint 通过。JSON format/model 两组执行检查通过（数字精度、重复键、转义、数组删除、对象类型、四空格、尺寸边界）。最终构建/同步证据由 workflow.json 的 verify 收据补齐。

独立 reviewer 分两轮核对导航/异步状态、JSON token、发布名称迁移与冻结；报告的问题已关闭，延迟发布回执后的返回用 workbench 浏览器用例回归。无需新 ADR：本轮是用户明确授权的 Studio 行为和加性发布展示元数据，权威正文与来源已增量更新。

真实 IAB 使用隔离库逐页检查，完成对象整块编辑→保存并命名发布→历史预览→Host 装载；复用/独立实例、恢复草稿、目录中文搜索与就近复制、成员自身更新和未配置 GitHub 反馈均检查。最后命名发布为「家庭出行 · 节点编辑版」，SQLite 只读核对新版本压缩文本及名称。截图在本轮可视化目录 json-object-editor.jpg / named-release.jpg。

`node services/api/test/release-name-migration.check.mjs services/api/.platform-data/manual-mvp/platform.sqlite` 使用只读备份副本迁移 user_version 4→6，原 1 form / 2 versions / 1 release 所有旧字段不变；原库 SHA256 保持 4da722ff08d0c3e00fb6a8cbdf4f5ffd091df6b31346a12812250250f14459ba。预览运行 3219 / 3319；原 3200 服务与原库不变。GitHub 公网 OAuth 未实测，使用本地提供方协议模拟。未提交、推送、合并或部署；混合工作区保留。
