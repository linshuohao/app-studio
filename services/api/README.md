# API

Generated with Nest CLI. Run `pnpm dev:api` from the repository root. Default loopback port: 3001. `API_PORT` and `HOST` can override it. Platform authoring persists data in PostgreSQL.

## 当前本机开发环境

2026-11-18 已按用户确认完整切换本机开发数据：Studio `http://127.0.0.1:3200` → API `127.0.0.1:3319` → 专属 PostgreSQL `127.0.0.1:55439/platform_db`。Docker Compose 服务 `form-platform-postgres-1`，数据在命名卷 `form-platform_platform-postgres-data`。没有生产环境切换。

日常从仓库根运行：

```sh
pnpm --filter @form-engine/api db:up
pnpm dev:all
```

需要只启动 API 时用 `pnpm dev:api`；已有构建可用 `pnpm --filter @form-engine/api start:prod`。`start`、`dev`、`start:debug` 和 `start:prod` 自动加载 API 工作目录的 `.env.local`。本地文件明确开启回环开发快捷登录，Studio 可点“以本地开发账号登录”；不能复制该开关到共享环境。

本地凭证文件均为0600并被Git忽略：`.env.local`仅有运行账号和本机服务配置；`.env.migration.local`仅由迁移/导入命令加载；`.env.postgres.local`给Compose初始化管理员使用；`.env.test.local`仅由测试helper读取。显式测试环境变量优先，CI继续使用CI提供的URL；API不加载测试/迁移管理员凭证。

`pnpm check`可直接使用本地测试配置，测试创建随机独立库，禁止把业务库作为清空对象。停止数据库用 `pnpm --filter @form-engine/api db:stop`；不要执行`docker compose down -v`删除业务卷。另一个新环境先按下节创建角色和配置，再启动，切勿重新导入当前非空库。

原库 `services/api/.platform-data/manual-mvp/platform.sqlite` 保留且字节未变。一致快照、导入报告、切换前pg_dump、恢复报告和实际浏览器验收报告位于 `services/api/.platform-data/backups/2026-11-18-postgresql-cutover/`，这些包含业务/身份数据，仅留本机且不入Git。已用独立恢复库核对全部业务表、迁移表和8个序列，并验证运行角色权限；恢复验证库已删除。切换后新增了开发登录账号及一个明确标记且已归档的验收表单，原表单与发布未修改。已有新写入后不能直接回退旧SQLite。

## PostgreSQL 首用、迁移与测试

运行服务使用 `PLATFORM_DATABASE_URL`，必填且只放服务端环境；不再读取 `PLATFORM_DB_PATH`。当前验证基线为 PostgreSQL 18。API 使用 `pg` 连接池（每实例最多 10 连接），启动只检查迁移版本，不执行 DDL；没有结构或出现未知版本时拒绝启动。部署先执行 `node-pg-migrate`，再启动服务。迁移工具和 SQLite 导入器使用 `PLATFORM_MIGRATION_DATABASE_URL`，未设置时回落到 `PLATFORM_DATABASE_URL`；部署应明确提供独立迁移账号。

本地可使用独立 PostgreSQL 实例；不要把测试 URL 指向业务库。测试账号需要建库/删库权限，运行账号不需要。以下仅创建本地开发数据库：

```sh
docker run -d --name form-platform-postgres \
  -e POSTGRES_PASSWORD=local-development-only -e POSTGRES_DB=platform_db \
  -p 127.0.0.1:55432:5432 postgres:18
export PLATFORM_DATABASE_URL='postgresql://postgres:local-development-only@127.0.0.1:55432/platform_db'
pnpm --filter @form-engine/api db:migrate
pnpm --filter @form-engine/api build
```

部署时由管理员预建 `platform_db`、迁移角色和运行角色；Platform 与未来 Agent 使用不同数据库和账号。迁移角色拥有表/序列；运行角色只授予 CONNECT、public schema 的 USAGE、业务表的 SELECT/INSERT/UPDATE/DELETE 以及序列的 USAGE/SELECT。运行角色不得拥有 CREATE、表所有权或 Agent 数据库权限。迁移完成后由迁移角色执行下列授权（将 `platform_app` 替换成实际运行角色）：

```sql
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO platform_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO platform_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO platform_app;
REVOKE INSERT, UPDATE, DELETE ON platform_schema_migrations FROM platform_app;
```

新版本新增表/序列后重复授权步骤，使用运行角色验证启动和业务请求。服务账号凭证由部署密钥注入，日志不得输出连接 URL。远程连接配置可信 CA/TLS；本地回环样例不是生产部署配置。

**新空库：**完成结构迁移后，将初始密码从受控输入管道传入初始化 CLI，不通过命令行参数传递。已导入旧数据的库不要执行初始化。

```sh
(
  stty -echo
  trap 'stty echo' EXIT
  IFS= read -r initial_password
  printf '%s\n' "$initial_password" | pnpm --filter @form-engine/api exec node --env-file-if-exists=.env.local dist/platform/bootstrap.js admin
)
pnpm --filter @form-engine/api start:prod
```

**已有 SQLite 数据：**先停全部旧 API/写入工具，再用 SQLite backup API / `.backup` 创建一致快照（不可在 WAL 活动时只复制主文件）。保存旧应用版本、数据库及 WAL/SHM 的受控备份、环境配置和校验摘要；在全新 PostgreSQL 数据库执行结构迁移，然后导入：

```sh
pnpm --filter @form-engine/api db:import-sqlite /absolute/path/to/frozen-snapshot.sqlite
```

导入器以只读方式打开来源，在临时副本升级旧 SQLite schema。它检查目标版本、全部 20 表为空、外键/完整性，保留 ID、版本 BYTEA 原始字节、文本/制品/摘要、OAuth 绑定序列及发布 rowid 顺序；逐表核对行数与规范化内容摘要，全部成功才提交。序列使用事务内 `ALTER SEQUENCE RESTART` 恢复；失败回滚，不修改源文件。旧 TEXT 含 NUL、整数超出 JavaScript 安全范围或未知 schema 均明确失败，禁止静默截断/清洗。BYTEA 配置原文允许 NUL/非法 JSON，照原字节保留。若在 COMMIT 时连接中断，提交结果可能未知；先检查目标数据与报告摘要，再决定重建空目标或继续验收，不能直接假设已回滚。导入报告含计数和摘要，不含正文、会话/密码摘要或凭证；报告仍按敏感运维资料保存。

导入完成后先保持维护入口，仅开放只读核验：核对报告、账号/成员、历史版本和发布制品、原有会话的只读认证。保留最终快照和导入报告，确认恢复点后才开放业务写入。启用新写入前可关闭新 API 并恢复旧应用/SQLite；启用新写入后**不可直接切回旧 SQLite**，应保留 PostgreSQL，修复向前或回退到兼容该 schema 的应用。确需反向迁移须另行停写、完整导出新增数据并验证恢复；本工具不提供自动反向同步或双写。测试演练不等于实际切换完成。

事务通过同一 PoolClient 显式传递，首版使用数据库级事务 advisory lock 串行协调 Platform 写入，维持旧 SQLite 写串行的授权与幂等语义。OAuth 网络、密码计算和编译在事务外，提交时重新核对资格。可横向部署多个 API 实例，但写吞吐仍串行；锁粒度优化须保留现有竞态验收。没有引入 Agent 表、凭证或路由。

浏览器访问 [Studio](../../apps/studio/README.md)。API 写入检查 `PLATFORM_STUDIO_ORIGIN`，默认 `http://127.0.0.1:3200`；HTTPS 源签发 Secure Cookie。现有会话保持八小时有效期，迁移不重新生成账号/凭证/会话。

集成与浏览器测试会从管理员 URL 创建随机独立数据库，完成后只删除所建测试库：

```sh
export PLATFORM_TEST_DATABASE_URL='postgresql://postgres:local-development-only@127.0.0.1:55432/postgres'
pnpm --filter @form-engine/api test:integration
pnpm --filter @form-engine/studio build
pnpm exec playwright test --config apps/studio/playwright.config.ts
```

CI 以 PostgreSQL 18 服务运行同一测试。生产服务无需 CREATE DATABASE 权限。迁移、导入、目标环境快照恢复演练和实际停写窗口是独立运维步骤；当前代码与合成数据测试不替代业务库验收。

### GitHub 登录配置

通过服务端环境设置 `PLATFORM_GITHUB_CLIENT_ID`、`PLATFORM_GITHUB_CLIENT_SECRET` 和
`PLATFORM_GITHUB_CALLBACK_URL`。回调使用 `PLATFORM_STUDIO_ORIGIN` 下的
`/api/platform/github/callback`，并与现有 GitHub OAuth 应用登记一致。部署使用 HTTPS，
本地可使用回环地址。部署代理和访问日志须省略回调查询串。缺少或无法验证配置时，
内置登录和本地解绑仍可用。测试替身只由测试进程加载。

### 能力目录与成员维护

Studio 提供真实安装的物料 / 纯函数目录与成员管理。目录机器契约来自 ReleaseBuild 使用的资产；说明与片段从资产 README 和 Playground Definition 生成。更新来源后执行 `pnpm --filter @form-engine/api catalog:generate`，构建会检查派生数据同步；不编辑生成的 `src/platform/catalog-documentation.ts`。

管理员可核实身份后创建内置账号、设置初始密码并线下交付，也可关联已有账号。成员本人可在账号设置修改密码：当前会话保留，其他会话撤销。角色及启停有修订冲突校验、事务内最后有效管理员保护；成员停用保留历史，恢复仍可使用未过期、未撤销会话。

### Web 资产保留与切换

表单修订资产版本选择默认暂停。仅在隔离验收中设置 `PLATFORM_WEB_ASSET_VERSION_SELECTION=true` 启用选择及推荐策略。默认模式使用当前构建的资产目录创建新的预览和发布；历史发布仍可使用下述留存制品装载。数据库保留原有绑定和已应用的迁移。

发布目标使用构建时本地装配。留存已发布物料、纯函数和 Runtime 的包目录与发布时实际摘要。归档 Runtime 使用可解析的构建依赖，归档物料与 Studio 使用同一套 React、React DOM、Renderer 适配层及相同物料样式。用 `node tools/engineering/prepare-retained-web-assets.mjs <deployment.json>` 校验并生成同一组登记输入。

部署配置中的 `archives` 是归档数组，每条包含 `materialsRoot`、`functionsRoot`、`runtimeRoot` 与相应的 `materialsDigest`、`functionsDigest`、`runtimeDigest`。其余字段为 `currentMaterialsRoot`、位于 Studio 构建工作区的 `moduleFile` 与输出 `catalogsFile`。路径使用绝对路径。API 设置 `PLATFORM_RETAINED_WEB_CATALOGS_FILE` 指向生成目录文件，Studio 构建设置 `STUDIO_RETAINED_WEB_CAPABILITIES_MODULE` 指向生成模块相对于 Studio 工作区的路径。切换时同批使用生成的目录、注册模块和 Runtime 构建产物。

Web 推荐默认来自当前构建。可选的 `PLATFORM_WEB_ASSET_POLICIES_FILE` 提供部署策略数组，每项包含 `kind`、`id`、`version`、`artifactDigest` 和 `policy`。 `recommend` 指定推荐制品，`retain-only` 停止该精确制品的新选择并继续提供既有绑定。API 启动前应用版本 11 迁移，并将新增表 `platform_agent_asset_environments` 的读取和写入权限授予 Platform 运行角色。

真实包验收在可丢弃检出、临时 PostgreSQL 和独立浏览器中执行。构建工作区依赖后，设置 `WEB_ASSET_UPGRADE_ISOLATED=1`、`PLATFORM_TEST_DATABASE_URL`，运行 `node apps/studio/tests/verify-packed-web-asset-upgrade.mjs`。脚本构建并区分真实代码的旧、新测试包，经过实际保存与发布，升级后访问 Host，并在 Studio 保存显式升级的配置修订。

### 本地开发快捷登录

仅显式设置 `NODE_ENV=development PLATFORM_LOCAL_LOGIN=true` 且 API/Studio 监听回环地址时启用。Studio 登录页显示专用账号 `local-development-only` 和角色；首次点击创建该专用账号及默认空间管理员成员（不创建密码），后续不会恢复停用状态或覆盖角色。登录仍使用正常 HttpOnly 会话和 RBAC。禁止在共享/生产数据库开启；关闭开关或切到生产后已有开发会话也拒绝认证。

例如在 services/api 目录启动：

```sh
NODE_ENV=development PLATFORM_LOCAL_LOGIN=true HOST=127.0.0.1 API_PORT=3319 PLATFORM_STUDIO_ORIGIN=http://127.0.0.1:3200 node --env-file-if-exists=.env.local dist/main.js
```

Studio 的本地 `.env.local` 设置 `PLATFORM_API_URL=http://127.0.0.1:3319`，再运行 `pnpm dev`。不需要在浏览器保存密码。接口拒绝非本机连接、外部Host/转发来源及不匹配的Origin；生产环境默认隐藏且禁止接口。此功能不等同 GitHub 注册或团队申请。

安全前提：Studio 的 `pnpm dev` 固定 `--hostname 127.0.0.1`；不得将快捷登录通过公网、局域网监听或公开反向代理暴露。转发头检查仅为纵深防护，不能证明任意外部代理链的真实客户端来源。

### Studio 助手与独立草稿

Studio 通过 `/api/platform/agent-conversations` 访问本人在当前空间的 Agent 会话。Platform 校验成员权限，将服务端确认的身份、工作稿与编译环境传给 Agent。Agent 服务在 agent_db 保存会话、消息、轮次与恢复证据。Platform 使用独立的 `/api/platform/form-drafts` 资源持久化表单草稿。各自删除互不影响，已经交付的草稿可独立修改、预览并保存为首版。重试同一交付时复用已有草稿，丢弃后重放也不会重建它。

升级已有数据库时先导入 Agent 会话并逐行验证。迁移 `1780000000005-independent-form-drafts` 在一个事务中核对导入证明、提取并验证已交付草稿，然后移除旧会话表。空库直接执行 `db:migrate`。依照前文的角色分离配置，为 Platform 运行角色授予 `platform_form_drafts`、`platform_draft_deliveries` 的读写权限。

迁移 `1780000000006-remove-retired-studio-storage` 退役 Studio 的场景存储和三列写入后未读取的草稿交付元数据。应用前按上述 PostgreSQL 升级流程保存可恢复的备份。草稿文本、修订与交付指纹仍用于编辑和幂等交付。迁移 `1780000000008-draft-editing` 新增草稿编辑权和占用冲突通知。新版本启动前应用迁移，并按前文角色分离配置确认 Platform 运行角色可以读写 `platform_draft_editing` 和 `platform_draft_edit_notices`。

已有混合会话表的升级命令从仓库根执行。先在 Agent 数据库应用 Alembic，再由离线命令通过管道将源行交给 Agent 的导入器。迁移凭据分别通过 `AGENT_DATABASE_URL` 和 `PLATFORM_MIGRATION_DATABASE_URL` 提供。

```bash
(cd services/agent && .venv/bin/alembic upgrade head)
node tools/engineering/migrations/split-agent-conversations.mjs
```

该命令持有 Agent 会话迁移锁及 Platform 源表事务锁，逐行读回 Agent 数据，逐笔核对草稿和交付标识后切换结构。发生差异会停止；源表仍存在时，解决差异后可重跑。部署前可用 `node tools/engineering/migrations/test-split-agent-conversations.mjs` 在两个临时 PostgreSQL 库演练。离线切分完成后运行 `pnpm --filter @form-engine/api db:migrate` 应用后续迁移。再按运行角色检查草稿读写权限，并核对工作稿、预览及正式版本关联。

## 表单错误上报

部署 API 前运行 `pnpm --filter @form-engine/api db:migrate`，应用
`1780000000009-form-diagnostics`。数据库迁移角色和 API 角色分离时，API 角色需要访问错误索引、证据和读取审计三张表及审计序列。

受信 Host 在 API 配置 `PLATFORM_DIAGNOSTICS_HOST_ID`、`PLATFORM_DIAGNOSTICS_HOST_FORM_ID` 和
`PLATFORM_DIAGNOSTICS_HOST_TOKEN` 后，可用 Bearer 凭证向 `POST /api/platform/diagnostics/events` 上报获准表单的发布事件。
在 Studio 和 API 同时设置 `PLATFORM_DIAGNOSTICS_STUDIO_PILOT=1` 可开启示例 Host 试点。上报要求管理员会话及受信 Origin。Host 首次获取有效会话身份后才暂存现场；试点身份查询最长等待一秒，失败时可继续使用示例。浏览器按上报会话隔离 IndexedDB 队列，在线后重试最多 24 小时。

版本 1 的上报包括事件 ID、Release ID、发生时间、来源、阶段、错误码和证据状态。有可靠定位时须同时提供
`targetKind` 和 `targetId`，定位必须存在于该发布的配置中。错误列表与单次证据均要求诊断读取权限，
读取有原始证据的详情会写入访问审计。详见[表单错误采集与定位](../../docs/design/platform-studio.md#platform-diagnostic-mapping)。

### 诊断调查与资产修复

部署此版本前继续应用 `1780000000010-asset-repair-tasks`。数据库角色分离时，确保 API 运行角色可读写资产任务、关联发生记录和操作历史三张表。

开发者可先创建和认领资产修复任务。提交审查前，在 API 进程设置 `PLATFORM_ASSET_REPAIR_REPOSITORY`（`owner/repo`）。认领人登记该仓库的 PR 地址、40 位提交 SHA 和拟发布的资产版本，再由另一位具有表单管理权限的维护者记录审查结果。

为 API 配置可读取该仓库 Pull Requests 的 `PLATFORM_ASSET_REPAIR_GITHUB_TOKEN` 后，审查列表和任务详情会显示 PR 的草稿、开启、关闭或合并状态。缺少令牌或 GitHub 查询失败时，状态显示为不可用。Studio 单独保存人工审查记录，GitHub 合并和资产发布仍由各自的工程流程完成。
