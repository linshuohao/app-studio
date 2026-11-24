# Studio MVP A–E 最终验收记录（2026-11-14）

## 基线与范围

HEAD `fd96b3c14f0ec668d5174762ff84c55255a8fc6c`，在此提交之上的未提交工作区验收。98 个文件内容 SHA-256 见 [最终基线](final-baseline.json)，聚合摘要 `72f9fc1668bd521748ebd36d4a3e86885d8a0f6a57efab539d36434b16e69d44`。该清单覆盖 Studio/API 源码、配置、测试、目录 sidecar 和生成器；不包含构建输出、临时数据库与其他团队工作区改动。归档正文及派生阅读页在代码基线之后更新，不改变可执行行为。未提交、推送、部署。

权威契约为 docs/design/platform-studio.md 的创作、保存、历史、发布、RBAC、GitHub 登录及 MVP 补齐章节，目录契约见 docs/design/extension-integration.md。本轮收尾保持 API/资产运行契约，修正目录说明、示例和展示；JsonValue 表示机器允许的输入，字段说明另交代业务期望类型及非法值 false/null 语义。未重建或改写已发布物料/函数制品。

## 最终执行证据

| 命令 | 结果 / 适用范围 |
| --- | --- |
| `pnpm --filter @form-engine/api build` | 通过；含 catalog:check；最终导航修复仅 Studio，无 API 变更，复用本轮构建 |
| `pnpm --filter @form-engine/api test` | 1 文件 / 1 测试通过 |
| `pnpm --filter @form-engine/api test:integration` | 6 文件 / 6 集成场景通过；含发布事务故障注入，日志中的预期 SQLite 失败不表示测试失败 |
| `pnpm --filter @form-engine/api typecheck`、`lint` | 通过 |
| `STUDIO_DIST_DIR=.next/studio-workbench PLATFORM_API_URL=http://127.0.0.1:3318 pnpm --filter @form-engine/studio build` | 最终导航修复后通过 |
| `STUDIO_DIST_DIR=.next/studio-workbench pnpm --filter @form-engine/studio typecheck` | 通过 |
| `STUDIO_DIST_DIR=.next/studio-workbench STUDIO_TEST_PORT=3218 STUDIO_TEST_API_PORT=3318 STUDIO_TEST_BROWSER_CHANNEL=chrome pnpm exec playwright test -c apps/studio/playwright.config.ts` | 最终 19/19 通过，38.6 秒；包含两个新增创建导航竞争反例；临时 SQLite 与本地模拟 OAuth provider |
| `node tools/engineering/check-catalog-examples.mjs` | 37 目录条目同步；26 普通函数示例实际求值一致；14 物料示例、23 函数及远程搜索出入参示例 Schema 通过 |
| `node apps/studio/tests/json-model.check.mjs`、`json-format.check.mjs` | 节点编辑、重复属性、精确数字/转义、压缩/格式化、非法文本及大对象通过 |
| `node services/api/test/release-name-migration.check.mjs services/api/.platform-data/manual-mvp/platform.sqlite` | 原库只读备份到临时副本；schema 4→7；1 表单、2 配置、1 发布保持；原库 SHA-256 未变 |
| `pnpm boundaries` | 334 modules / 1010 dependencies，无越界 |
| `pnpm exec eslint apps/studio tools/engineering/catalog-docs.mjs tools/engineering/check-catalog-examples.mjs --max-warnings 0` | 最终修复后通过 |
| `pnpm exec prettier --check apps/studio services/api/src services/api/test packages/materials-react/catalog-docs.json packages/pure-functions/catalog-docs.json tools/engineering/catalog-docs.mjs tools/engineering/check-catalog-examples.mjs` | 通过；确定性生成的 catalog-documentation.ts 由 catalog:check 维护，加入 prettierignore，避免双生成器互改 |
| `.venv-docs/bin/python tools/docs/build_docs.py` 与 `--check` | 归档后通过；59 阅读页、61 HTML 文件 / 8971 本地链接及资源一致 |

未运行全仓 `pnpm check`、frozen install、远端 CI 或部署门禁；这是 Studio/API 范围交付证据，不等于整个混合工作区可合并。4 个 Runtime 控制形式的示例由 Schema 与源码核对，目录校验脚本没有执行真实表达式上下文。

## 独立审查

独立上下文 reviewer `/root/final_review` 只读审查原始契约与源码，独立运行目录示例校验；API/Chrome 结果属于主执行者，不冒称 reviewer 重跑。

发现 P2：createForm 的创建 POST 或随后打开 GET 晚到时会覆盖用户 Back 后较新的目录导航。修复在 page.tsx:createForm 捕获 routeSequence，POST 后和 GET 成功/失败后均检查；保留服务端已创建事实和列表回执，仅当前路由自动进入编辑。first-save.spec.ts 分别延迟 POST/GET，Back 后释放响应，等待 busy 结束并确认目录和新表单列表。reviewer 复核源码和反例有效性，最终两个反例及全套 19 项通过，P2 关闭。未发现其他新增 P0/P1；本次范围无未关闭发现。

| 审查单元 | 独立源码取证范围 |
| --- | --- |
| 身份/权限/成员 | access、credentials、session-http、members.controller、database：事务内资格、最后管理员、revision、改密复核及其他会话撤销 |
| 保存/发布 | forms、releases、platform.controller、release-build：归属、追加版本、幂等指纹/冻结输入、发布提交资格与归档 |
| 导航/编辑 | page、form-editor、form-management、config-inspection、release-history、studio-location、platform-api：晚到结果、重试、发布选择与反馈 |
| JSON | format、model、json-editor：token 保真、对象编辑、重复属性改名和过期节点保护 |
| Host | load-release、release-host：制品摘要/锁、缺少能力、实例隔离、取消与 dispose |
| 目录 | asset-catalog、contract-reference、catalog.controller、sidecar及生成校验：版本、宽输入与业务含义、示例 |
| OAuth | github-access、github.controller、callback route、next.config：state消费、绑定变化与回调白名单；未真实往返 |
| UI基础/测试 | modal、select、record-labels；新增竞态反例及JSON/导航测试 |
| 未逐行独立复审 | 其余配置、包装组件、生成正文、CSS和测试夹具由本轮门禁及此前批次证据承接；不声称98文件所有行为独立覆盖 |

真实 OAuth、逐页人工视觉与辅助技术、未修改 Runtime/Compiler 内部的全局正确性仍不在此审查结论内。

## MVP 状态与人工验收

A 表单工作台、B 物料目录、C 纯函数目录、D 成员账号、E 本地集成：自动验收通过，独立审查完成且发现已关闭；用户人工验收待进行。M18/M19 仍部分完成，不把首期本地验收等同于平台全部完成。真实 GitHub OAuth 单独未验证。

预览 Studio： http://127.0.0.1:3219 ，Host： http://127.0.0.1:3219/host ，API： http://127.0.0.1:3319 。最终连通性检查均返回 HTTP 200；均为本机进程，机器重启后需重启。使用临时副本 `/tmp/studio-workbench-preview.DQXGMd/platform.sqlite`；现有 `studio-preview` 测试账号，初始测试凭证由本会话交付，不写入归档。不要将这些凭证用于任何外部环境。原手工库保持 SHA-256 `4da722ff08d0c3e00fb6a8cbdf4f5ffd091df6b31346a12812250250f14459ba`。

按顺序人工验收（只使用隔离预览数据）：

1. 登录并看表单列表：最近保存与最近发布独立显示；长名称在宽/窄窗口不撑破按钮。
2. 新建表单、进入全屏编辑、返回；编辑未保存时取消返回仍保留修改。网络慢时创建/打开期间 Back 不被晚到结果拉回。
3. JSON 节点增加/修改/删除；对象值展开为4空格格式文本；非法JSON拒绝保存；大整数/转义保真；有效保存原文紧凑，重读展开。
4. 保存命名配置；浏览历史、检查错误、预览、恢复编辑；重试保存不生成重复配置。长配置名/标识可读。
5. 发布确认核对具体配置、设置名称；取消确认不发布；成功后记录名称/源配置正确，旧发布仍能打开。
6. 未登录 Host 按精确 releaseId 装载：编辑与交互、验证反馈、切换实例；旧发布和新发布互不覆盖。
7. 物料卡片搜索分类/技术；逐个详情预览（14项），复杂内容不裁切；远程搜索先输入/搜索不改选中值，点击候选才写入；核对请求对象、items数组与选中对象。
8. 函数目录（23项）：参数顺序、完整对象、字段含义与示例对应；requiresGuardian 的数字12为true、字符串12为false；JsonValue与结构引用说明可理解；复杂费率路径不无故截断。
9. 管理员添加测试账号，核对成功与失败反馈；以新账号登录改密；管理员变更角色、停用/恢复；最后有效管理员不能被停用/降级。初始密码线下交付流程另由用户确认。
10. 浏览器前进/返回、刷新/深链接、键盘操作、窄屏与长内容；逐页确认Linear风格、留白和可读性符合实际体验。
11. 真实 GitHub OAuth 为独立后续验收：提供匹配部署域名/回调的OAuth配置后验证绑定、退出后登录、解绑及迟到回调；当前本地模拟provider通过不关闭此项。


## 2026-11-14 人工操作反馈后的体验修复追加

本节为后续基线，前述98文件基线保留历史适用性。新增改动逐文件摘要见 [体验修复基线](experience-fix-baseline.json)。不实现尚待完整方案确认的 GitHub 自助注册/入队申请，不显示注册按钮。

- remote-select：区分加载、成功候选数量、空结果、失败、已选择、待搜索与禁用提示；clearable=false 不建议清空。请求、绑定、取消及执行语义不变。资产工具已生成 remote-select/materials-react patch 声明，未应用版本计划或发布包。
- 成员弹窗：正文独立滚动，标题和提交操作区保持可见，权限与表单提交逻辑不变。
- GitHub：状态常显；提前解释绑定/解绑及会话影响；未配置时登录页明确暂不可用。保持按钮名称及密码验证、重复提交禁用。改密前显示12字符/256字节要求，准确说明其他会话失效。

独立 reviewer 复核了上述源码、服务端解绑/改密会话行为及资产声明；发现 clearable=false 文案不准确和“其他设备”措辞不准确，均修正。独立运行 remote-select 定向测试11项通过；未执行真实OAuth或独立浏览器视觉。主执行者物料全套70项通过，material typecheck及定向ESLint通过，assets:check通过。新隔离构建通过；完整Chrome 20项通过，含新增缺GitHub配置提示、账号状态/密码要求、1160×826和390×700成员提交按钮完整可见、可滚动正文，以及旧有发布Host与模拟OAuth链路。

验证命令：`pnpm --filter @form-engine/materials-react test`、`typecheck`；`pnpm assets:check`；定向 `pnpm exec eslint packages/materials-react/src/remote-select/implementation.tsx packages/materials-react/tests/remote-select/implementation.test.tsx --max-warnings 0`。隔离副本使用原环境已安装的 tsdown、nest、next、playwright 可执行文件，cwd 指向副本；Next 使用 `build --webpack`（Turbopack不编译工作区外依赖链接）。Chrome 环境为 `STUDIO_DIST_DIR=.next/studio-workbench STUDIO_TEST_PORT=3228 STUDIO_TEST_API_PORT=3328 STUDIO_TEST_BROWSER_CHANNEL=chrome`，运行完整 `playwright test -c apps/studio/playwright.config.ts`。

门禁说明修正：根 ESLint 配置没有匹配 Studio TSX，直接对 Studio 指定文件运行返回 ignored 警告，不能视为Studio lint通过；本轮Studio由Next构建/TypeScript及Chrome覆盖。此前目录传入eslint未报错不证明Studio文件受lint检查。未扩展新lint体系，也不声称全仓门禁通过。

隔离方式：新目录 `/tmp/studio-experience-final`，工作区包依赖指向复制包，第三方依赖复用已安装工具；新数据库 `/tmp/studio-experience-preview/platform.sqlite`。仅在隔离副本重建materials/API/Studio，原 packages/materials-react/dist 与原服务不覆盖。一次隔离pnpm运行尝试自动校验依赖，因路径/网络失败，已停止并改用本地可执行文件；未将该尝试记为成功构建。

新预览 `http://127.0.0.1:3228`，API `http://127.0.0.1:3328`。本地测试账号studio-preview，密码由会话提供。新表单 `6edaca99-fee0-4f53-8f80-0cb970d31500`，配置 `77b24cf0-4521-45c6-90d0-58c96227b62c`，新发布 `f2c30732-cf4c-4290-9fe8-184d8e173ba2`（远程搜索反馈修复版）。旧3219/3319未重启，原手工库不变。新物料摘要不得覆盖旧发布或伪造为旧摘要；原工作区源码修改尚未构建到旧预览。后续重建必须保留此隔离前提。

### 总协调 CUA 操作证据（代理实测，非用户验收）

来自总协调本轮报告：在旧3219创建“浏览器体验验收1114”，验证非法JSON拒绝、离开取消保留、保存命名v1/备注、检查、预览清空姓名模拟提交拒绝及修复通过；取消发布再命名发布，历史只读、历史编辑保存发布v2、复制独立表单、修改说明、归档停止编辑及恢复和搜索。v1 `3a7f8d34-33e8-4f89-9f84-bd360434730b`，v2 `728afff5-2ac5-4fa9-a611-71a3addf905f`。

退出平台后Host重载v1、v1/v2同时装载通过；同v1两个实例姓名分别为“实例一测试”和“投保人示例”，相互独立。14物料和23函数逐项打开；remote-select输入/搜索不选中、点击才写入、重置正常；发现状态文案问题后交本批修复。条件隐藏/恢复、日期取消不写回/确认更新正常。最后管理员停用被服务端拒绝。390×844列表/目录scrollWidth为390，空搜索有指引。账号创建/改密最终提交受CUA凭据操作接管限制，未手工完成；自动API/Chrome证据另列，不冒称代理手工通过。新三项UI已由总协调在3228完成后续CUA复验，详见下节；用户正式验收尚未完成。


### 修复后 CUA 复验与最终证据核对

2026-11-14，总协调报告在新3228完成以下代理浏览器实测（非用户正式验收）：

- 登录页明确提示 GitHub 未配置、暂不可用。
- remote-select 搜索杭州后显示“找到1个选项，请选择”，点击后显示“已选择，可重新搜索或清空选择”。见 [搜索反馈截图](search-feedback-fixed.jpg)。
- 390×844 添加成员弹窗的保存按钮 top=764.93、bottom=797.52，小于视口高度844，操作区可见，键盘Tab可到达。见 [成员弹窗截图](member-dialog-fixed.jpg)。
- 账号页提前说明密码要求及其他登录会话失效影响。
- 实际打开新发布 `f2c30732-cf4c-4290-9fe8-184d8e173ba2` 的 Host 成功，已选城市状态提示正确。新预览与Host保留供用户。

主执行者再次比对 experience-fix-baseline.json，9个文件内容摘要均无变化；因此复用同一最终代码上的70项物料测试、20项完整Chrome、类型检查、资产检查、格式及独立review证据，不因补写记录重复执行无变化的业务测试。截图从总协调提供的本地文件复制入本批归档，原路径为 `/private/tmp/studio-browser-acceptance-1114/`。归档后执行文档同步检查。

结论：本批自动回归、独立源码审查及代理浏览器复验闭环；用户正式验收、真实GitHub OAuth仍未完成。账号创建/改密的CUA最终提交限制保持不变。Studio ESLint 后续补齐见下节。新身份自助注册/入队申请仍为后续方案，不在实现范围。无提交、推送或部署。

### Studio ESLint 后续补齐（2026-11-14）

根配置新增 Studio 的 Next / React / TypeScript 规则及包私有源码导入限制，Studio 增加 lint 脚本；Next rootDir 从配置文件解析为绝对路径，兼容根目录与 workspace 运行入口。实际检查发现18项诊断，修复发布 Effect 的 text 声明顺序与依赖、JSX引号、Host内部导航及未使用解构变量。11处路由或外部加载状态同步保留逐行 set-state-in-effect 例外；1处卸载递增请求序号保留 exhaustive-deps 例外，原因均在代码旁说明，未全局关闭规则。

实际通过：`pnpm exec eslint apps/studio --max-warnings 0`、`pnpm --filter @form-engine/studio lint`、`pnpm --filter @form-engine/studio typecheck`、`pnpm exec eslint . --max-warnings 0`。ESLint Node API 检查30个 Studio 源码文件均未忽略且加载 TypeScript 规则；内存 TSX explicit-any 反例和私有包导入反例均被捕获。首次 no-undef 探针未命中，因为 TypeScript 预设将该检查交给类型检查；改用实际启用的 TypeScript 规则后通过，未修改规则迎合探针。本次9个修改文件的 Prettier 检查通过。

本次仅自审，未重跑 Chrome 或独立 review，不将前一轮20项 Chrome 结果视为本次代码的回归证据。未重启预览、未重建物料或修改数据库，无提交或推送。账号自助注册与入队审批仍为方案设计，未写为已确认契约。本节替代此前 Studio ESLint 未覆盖的限制，其他验收限制保留。

## 2026-11-15 本地开发快捷登录

用户确认后新增 GET/POST local-login 与登录页按钮。仅 NODE_ENV=development、PLATFORM_LOCAL_LOGIN=true、回环监听/来源及精确Studio Origin允许签发；固定local-development-only专用账号，无password，初次原子创建默认管理员成员，后续不恢复停用或提升角色。正常HttpOnly session/RBAC，关闭开关或生产模式也拒绝已有开发会话。不能通过公开代理暴露；Studio/API均必须只监听回环地址。

独立review提出代理来源和旧会话生产有效两处边界，已修复并定向复核；独立local-login集成1项通过。主执行者API全量10组集成、typecheck、lint通过；Chrome独立会话实际点击快捷入口→表单列表→刷新仍登录通过。文档构建/同步60页通过。Turbopack生产验证遇沙箱创建进程绑定端口EPERM，另用隔离Webpack构建验证，不能将该Turbopack失败写为代码编译通过。

当前3200开发服务配3319 API，使用 `/tmp/studio-dev-recovery-1115.sqlite` 预览副本，已显式开启快捷入口。原手工数据库未修改。后续启动命令及边界见 services/api/README.md；关闭入口只需不设置开关，生产强制拒绝。真实OAuth、公开代理、用户正式验收不在本次结论内。

### 2026-11-15 登录方式页面调整

按用户反馈，将本地快捷登录从密码表单附属按钮改为独立登录方式首页，同宽入口保持Linear黑白灰风格；选择账号密码后切换完整表单，提供返回其他方式。认证实现不变。参考官方 Vercel 登录入口 https://vercel.com/login 与 Linear 登录方式说明 https://linear.app/docs/login-methods ，不引入这些服务额外认证语义。

新增 login-screen.tsx 和 login-screen.spec.ts；既有浏览器登录步骤适配方式选择，并在退出后等待页面就绪，修复首轮测试过早寻找输入框的问题。最终完整Chrome31项通过（48.1秒），Webpack生产构建、格式和文档同步通过。独立Chrome另验证3200快捷登录、返回切换及390px无横向溢出。此轮为展示调整，未新增独立安全review；沿用既有认证边界。用户视觉验收仍待进行。
