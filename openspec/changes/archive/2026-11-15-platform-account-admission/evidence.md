# 账号准入执行证据

## 基线与边界

2026-11-15 开始；HEAD fd96b3c14f0ec668d5174762ff84c55255a8fc6c，工作区已有大量修改与未跟踪代码。initial-baseline.json 是实施启动期间的文件库存，不等同干净提交或完整的修改前快照；最终各片以实际内容摘要固定审查范围。原手工数据库、旧3219/3319与3228/3328预览不修改。测试API使用start-api.mjs创建的临时库，Studio隔离输出 .next/admission-test，端口3235/3335。

## 只读预检

契约：docs/design/platform-studio.md#platform-account-admission、#platform-github-login、#rbac-members。现有insertSession与密码证明依赖成员context，Studio使用/access恢复且403清除登录；需要拆分账号认证与团队权限校验。团队资源仍调用authenticate(permission)，Host匿名releaseId路径不变。角色与发布协议不修改。

实现1：GET/account返回本人登录方式及membership none/active/suspended；GET/github/registration展示同浏览器待确认身份，POST/github/register消费证明建立账号/绑定/会话。取消、过期、重放、并发及解绑迟到回调不产生重复身份或越权。无成员/停用账号可管理本人登录方式但不能访问团队数据。Studio先恢复账号再加载团队数据，401与403分别处理。

## 真实 GitHub OAuth 单独跟踪

本轮自动验收仅使用受控提供方，实际GitHub往返未验证。独立环境验收需配置服务端OAuth应用与匹配Studio callback URL，验证授权/取消、未知身份注册、已有身份登录、绑定冲突、首次设密重新验证、解绑撤销、上游授权撤销后的行为。不得把模拟身份、PKCE参数断言或本地绿测记为真实GitHub验收。凭据不得写入仓库或报告。

## 切片执行

切片1API和Studio按目录隔离写入，2026-11-15集成验收通过，独立review进行中。后续切片尚未开始。

实际通过：API `test:e2e --testTimeout 20000 --no-file-parallelism` 7/7，随后补充无成员内置账号改密审计反例定向1/1；API和Studio类型检查；`pnpm exec eslint services/api/src/platform services/api/test apps/studio --max-warnings 0`；API build及Studio `STUDIO_DIST_DIR=.next/admission-test PLATFORM_API_URL=http://127.0.0.1:3335 pnpm --filter @form-engine/studio exec next build --webpack`。

Chrome最终命令：`STUDIO_DIST_DIR=.next/admission-test STUDIO_TEST_PORT=3235 STUDIO_TEST_API_PORT=3335 STUDIO_TEST_BROWSER_CHANNEL=chrome pnpm --dir apps/studio exec playwright test`，23/23通过（1.1分钟），临时数据库与受控OAuth提供方。首次运行因沙箱loopback EPERM，获工具提升后执行；第一次完整回归22/23，旧first-save仍拦截/access而新恢复调用/account，更新到membership.permissions并保留撤权不可编辑/原文保留/恢复可编辑断言后，重新构建并全套通过。API默认并行曾使既有release测试5秒超时，串行20秒窗口复验通过，没有删减断言。

新增浏览器场景覆盖注册确认/取消、无成员深链不请求团队资源、受保护API403、唯一登录方式保护提示、退出再登录同一账号，以及列表晚到响应不能恢复已退出界面。账号方式审计独立于成员；登录发起限流为单进程每IP5分钟30次，使用未信任代理头的Request.ip、清理过期计数且限制Map容量；重启归零，水平部署前须共享限流。

切片1审查固定范围为slice1-baseline.json。此处自动验收不代表真实OAuth或用户人工验收通过。

独立review发现P2：Studio callback代理未包含registration-required白名单，成功注册确认旁误报OAuth失败。已加入白名单，两条注册用例新增成功提示可见且失败提示不存在断言。重新build后定向Chrome `playwright test account-admission github-login` 4/4通过。reviewer独立Node fetch探针核对callback正确透传/no-store，独立API admission+github 2/2通过，修复已复核。最终hash更新到slice1-baseline.json。风险单独保留：API request.ip在Studio反向代理下可能成为团队共享限流桶，真实部署须核对可信代理与限流策略，不能直接信任客户端XFF。

切片1独立review最终通过：73文件摘要全部匹配，未关闭P0/P1/P2为0。覆盖账号/成员鉴权、OAuth入口至回调与注册事务、团队消费者、Studio状态与晚到响应及测试反例。仅独立API和callback探针由reviewer执行，浏览器为主协调证据。按顺序门禁启动切片2。

切片2接口细化：JoinRequest记录requestId/userId/spaceId、显示身份、explanation、status、revision、createdAt/decidedAt/decidedBy、reason及roles。GET mine返回最新申请；列表返回items/total/offset/limit（默认pending、每页20）；初始revision0，终态1。说明及拒绝原因trim后1..1000字符，新申请每用户每小时最多10条，重复pending返回原申请且不计新建。批准必须显式角色。旧POST/members暂保留供既有调用方兼容，普通Studio入口改为审批，不声称旧API已退役。

切片2集成通过：API全套 `test:e2e --testTimeout 20000 --no-file-parallelism` 8/8；API/Studio typecheck、定向ESLint、API与隔离Studio build通过；同上3235/3335环境完整Chrome24/24（1.1分钟）。新增申请撤回、陈旧审批409、拒绝重申、组合角色批准、响应丢失精确恢复、同会话进入工作台、停用禁止申请；API另含审计写入失败触发器回滚、双管理员竞争、审批前撤权与账号停用、说明/分页验证和持久频率限制。新增GET /join-requests/:id仅member:manage可读，用于审批响应丢失后查询，不依赖分页位置。保留旧内置账号改密/启停兼容测试和390/1160宽度审批弹窗可见性测试。

切片2固定slice2-baseline.json的79个文件全匹配；相对切片1共15个源/测试文件变化，独立review进行中。切片3未开始。

切片2独立review发现两项P2，待修复复验关闭：管理员申请列表失败后成功重试未清旧错误；本人申请异步401在退出并登录其他账号后可能执行旧onSessionLost清掉新账号界面。修复须分别隔离列表/面板错误和保护组件生命周期/身份代次，并补浏览器反例。reviewer独立运行join+catalog-members两组API 2/2通过，审计写入故障注入日志为预期，回滚断言通过。

两P2最终修复：列表listError与审批error独立；JoinApplication以mounted/operation保护catch/finally及提交、撤回、刷新异步续段；父页面以sessionGeneration保护回调，登录/退出推进代次，不以userId代替会话身份。修复前构建实际复现不同账号登录后旧401清界面；同账号GitHub全页跳转销毁旧JS，旧构建本已通过该额外回归。列表反例首次受Next路由announcer也含alert角色影响，精确匹配业务错误文本后通过。最终重build、Studio lint/typecheck及完整Chrome27/27通过。slice2-baseline已更新，等待reviewer最终复核。

切片2最终独立review通过：79文件摘要全匹配，无未关闭P0/P1/P2；reviewer另独立运行修复相关ESLint通过，确认列表错误与审批错误隔离以及异步操作/父会话双重代次保护。按顺序启动切片3。

切片3 API细化：POST /github/password-setup返回url，回调成功状态password-setup-verified；GET /account/password/setup返回enabled/hasPassword/githubLogin/verified/expiresAt，POST同路径接收username/password并返回Account。专用proof五分钟有效，绑定session/user/githubId/绑定序号；异步密码派生后事务重新验证，消费proof、创建凭证、撤销其他会话并审计。成功重复提交409，UI查询/account恢复；proof缺失/过期403，用户名冲突409保留proof以便修改重试。尚在实施，不能据本段视为通过。

切片3实施与集成验收完成：API全套9/9（同前串行20秒窗口）、API/Studio typecheck与ESLint、API和隔离Studio构建通过；完整Chrome29/29（1.2分钟）通过。API新增错误GitHub身份、跨会话证明、用途隔离、过期、并发仅一次、用户名冲突保留proof、异步派生期间退出/账号失效/绑定变化、审计失败整体回滚反例。迁移将旧user_id非空OAuth流程回填bind，其余login，不生成setup证明。

新浏览器验收覆盖无团队首次设密、错误身份重新验证拒绝、用户名冲突重试、其他会话401与本次保留、GitHub会话解绑退出、内置同账号登录、绑定占用身份不合并、内置会话解绑保留，以及已批准成员的首次设密入口。callback代理与结果文案同步password-setup-verified，账号设置的异步流程沿用挂载/操作/父会话代次防护。固定slice3-baseline.json，第三切片独立review进行中；真实OAuth和用户人工验收仍未完成。

第三切片独立review最终通过，无未关闭P0/P1/P2。reviewer独立运行setup+github+admission API 3/3和定向ESLint通过，审查OAuth用途、证明/绑定/会话、事务、旧流程迁移和前端账号管理执行链。其指出的两个非阻断浏览器测试缺口已补齐：真实setup提交200后丢弃响应，通过/account恢复；真实setup提交200后持有响应，退出并登录其他账号后释放，验证新身份/界面不变且没有旧成功通知。定向login-methods Chrome3/3通过。reviewer复核两测试及最终82个文件摘要全部匹配，业务源码未因补证改变，测试缺口关闭。

## 最终收口

三个切片均已完成API与Studio、本地自动验收和独立review，用户最终人工确认与真实OAuth未完成。最终门禁由workflow.json执行并生成验证收据（含全套9组API及扩展后的30条Chrome），收据成功后按适配器归档，不运行spec sync。现行主题、治理、演进、来源、ADR-FE-029和文档入口已同步；并行Agent设计文档保持原内容，不纳入本任务实现结论。未改引擎协议样例，不需要协议示例重验；未做文档浏览器视觉复验。原预览服务和原手工数据库未重启或修改，本轮没有部署、推送或提交；混合工作区无法形成只含本任务且完整的提交，保留明确源码与摘要证据。

后续人工验收重点：首次GitHub注册确认不授予权限；申请撤回/拒绝/重申及管理员选角色批准；批准后同会话进入工作台；无成员账号首次设密；其他会话撤销；占用身份绑定冲突不合并；GitHub/内置会话分别解绑；停用后保留本人账号管理但拒绝团队资源。真实提供方需单独配置与走查，不能用测试提供方充当生产登录。
