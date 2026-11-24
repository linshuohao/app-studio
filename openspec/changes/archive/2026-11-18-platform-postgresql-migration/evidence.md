# 实施与验收证据

前半记录2026-11-17代码交付基线；本次最终状态以末尾2026-11-18实际切换记录为准。

## 范围与基线

2026-11-17，用户在只读预检后确认实施。基线 HEAD 为 `fd96b3c`；开始时工作区已有大量暂存/未暂存/未跟踪的其他主题工作，不以 HEAD diff 冒充本任务完整差异。实施前 API platform/test/package 快照在本机 `/tmp/pg-implementation-before/`，据此核对本轮增量。没有提交、推送、业务数据库切换或 Agent 实现。

前后行为：API 从启动时同步 SQLite 建表/读写，改为部署阶段迁移 PostgreSQL、启动精确版本检查、异步 PoolClient 事务。HTTP 业务接口保持，配置 BYTEA 保留原文；申请说明/拒绝原因的 NUL 明确返回 400。首版全局事务 advisory lock 保持写串行一致性，多个 API 连接池共享数据库锁；未宣称提高并发写吞吐。

## 实现和契约对应

| 契约/路径                        | 实现                                                                                                                             | 执行证据                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 20 表与类型/约束                 | migrations/1780000000000-platform.cjs                                                                                            | 历史 v1 升级导入 + 全部20表非空导入                                                                                |
| 显式单连接事务、启动只检查       | src/platform/database.ts、bootstrap.ts                                                                                           | 版本拒绝、最小运行角色、断连与回滚测试                                                                             |
| 账号/会话/绑定/准入              | access.ts、github-access.ts、github.controller.ts、join-requests.controller.ts、local-login.controller.ts、members.controller.ts | 既有账号/密码/注册/审批集成和浏览器反例                                                                            |
| 版本/保存/幂等                   | forms.ts、platform.controller.ts                                                                                                 | 首次并发相同key只写一次，原文含NUL保存，跨实例撤销                                                                 |
| 发布捕获→事务外构建→最终复核提交 | releases.ts                                                                                                                      | 编译中撤权/归档、重试、故障审计回滚；浏览器发布与匿名Host                                                          |
| 只读来源与原子导入               | tools/import-sqlite.mjs、legacy-sqlite-migrations.json                                                                           | 源文件SHA不变、BYTEA逐字节、制品/摘要、绑定序列、release rowid、重复导入拒绝、NUL失败整体回滚、源/目标未知版本拒绝 |
| 开发/CI/浏览器隔离               | test/postgres.setup.ts、tools/test-database.mjs、tools/start-test-api.mjs、Studio start-api、quality.yml、playwright.config.ts   | 随机独立库，测试结束删除自己的数据库；Studio全链路                                                                 |

API 源码本轮变化限于上述 12 个 Platform 文件。原有业务集成测试改为异步 PostgreSQL，保留原有断言并迁移故障注入；新增 postgres-migration/concurrency/recovery/permissions 测试。包清单仅增加 pg/@types/pg/node-pg-migrate 与 db 命令；其他既有包/开发脚本变化来自原工作区。

## 实际检查

环境：本机隔离 PostgreSQL 18 容器，非业务库；API 集成每例新建独立库。Studio 使用本机已安装 Chrome，独立测试端口 3327/3328；GitHub 使用既有测试替身，不是真实 OAuth。测试 URL 的密码仅为隔离容器临时值，未存入本文件。

| 命令                                                                                                                                                                                  | 结果与适用范围                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @form-engine/api build`                                                                                                                                                | 通过，含 catalog 检查                                                                                                         |
| `pnpm --filter @form-engine/api typecheck` / `lint`                                                                                                                                   | 通过                                                                                                                          |
| `PLATFORM_TEST_DATABASE_URL=… pnpm --filter @form-engine/api test:integration`                                                                                                        | 最终 14 文件、16 测试通过；包含旧业务、两个独立 API 实例、20表迁移、真实连接中断、受限运行角色                                |
| `pnpm --filter @form-engine/api test`                                                                                                                                                 | 1 测试通过                                                                                                                    |
| `PLATFORM_API_URL=http://127.0.0.1:3328 pnpm --filter @form-engine/studio build`                                                                                                      | 通过；测试地址须在构建时注入，Next rewrite 会固化它                                                                           |
| `PLATFORM_TEST_DATABASE_URL=… STUDIO_TEST_PORT=3327 STUDIO_TEST_API_PORT=3328 STUDIO_TEST_BROWSER_CHANNEL=chrome pnpm exec playwright test --config apps/studio/playwright.config.ts` | 31 测试通过                                                                                                                   |
| `pnpm lint` / `pnpm boundaries` / `pnpm typecheck`                                                                                                                                    | 全仓通过；边界337模块，类型10任务                                                                                             |
| `pnpm test`                                                                                                                                                                           | 全仓9任务通过，共629测试                                                                                                      |
| `pnpm exec vitest run`                                                                                                                                                                | 与全仓单测并行时一个资产模板类型检查超过原5秒时限；独立重跑未改代码，最终11文件45测试通过                                     |
| 本轮源文件、工具、测试及OpenSpec的 `prettier --check`                                                                                                                                 | 通过                                                                                                                          |
| `pnpm check` / `pnpm format:check`                                                                                                                                                    | 全仓门禁停在45个本轮范围外文件的格式问题，主要为既有归档、Studio tsconfig和手工样例；未批量格式化他人工作，不能报告总门禁通过 |
| `.venv-docs/bin/python tools/docs/build_docs.py` / `--check`                                                                                                                          | 通过：61 Markdown ID、107记录、63 HTML / 9360本地链接；系统python缺pygments，已用项目venv成功执行                             |
| `git diff --check`                                                                                                                                                                    | 通过；未跟踪文件另按本轮快照及定向格式检查核对                                                                                |

首次浏览器运行因本机未安装该版本Playwright Chromium未启动，随后改用已安装Chrome；第二次发现测试构建仍指向本地开发代理端口，按测试API地址重新构建后31项通过。未为此改动产品代理行为。Next 构建曾报告当前框架版本的安全更新提示，重试构建通过；未在数据库迁移中升级框架，应独立处理该实际构建提示。

## 独立审查与修复

独立只读 reviewer 对契约、显式事务传递、异步等待、最终授权、OAuth 网络/编译边界、全局锁、数据导入和序列独立取证。提出并已修复：申请文本NUL错误、连接池error事件、ROLLBACK覆盖原异常、导入目标版本/全表先判空、setval非事务性。实现方故障注入又发现借出连接的晚到error事件，已加脱敏处理并复验。

最终 reviewer 复核未发现未关闭P0/P1及新的阻断问题。reviewer未独立运行测试；表中运行结果来自实现方。没有将源码审查等同生产验收。

## 未执行与交接边界

- 实际业务库、目标主机/云库、停写窗口和业务快照恢复演练尚未执行；操作顺序及回退分界见 services/api/README.md。COMMIT断连须核查未知结果。
- 最小运行账号的业务读写及DDL/迁移历史拒绝已在隔离库验证，实际环境角色与TLS配置仍须部署时落实。
- 未做跨主机网络故障、持续负载/吞吐、生产备份恢复；两实例测试为同进程内独立Nest应用与独立连接池，既有进程测试覆盖重启后会话/数据保留。
- 未执行新的Agent功能、Agent运行/额度/检查表、内部服务凭证或多实例任务路由。
- 全仓格式门禁未通过，当前不声明可直接合并；没有自动提交、推送、发布。

技术核对依据：[PostgreSQL 18 ALTER SEQUENCE](https://www.postgresql.org/docs/18/sql-altersequence.html)确认RESTART可回滚；[node-postgres pooling](https://node-postgres.com/features/pooling)用于连接归还与空闲连接错误处理核对。

## 2026-11-18：完整本机切换与剩余门禁关闭

用户明确“全切了，我们没发生产”。只读核对无本项目API/Studio运行进程，持久源库仅有`manual-mvp/platform.sqlite`（schema4，1用户、1表单、2版本、1发布）；旧临时恢复库已不存在。迁移前一致备份，创建专属Compose PostgreSQL18持久卷，绑定回环55439，独立platform_migrator和platform_app，运行/API、迁移、管理和测试凭证分文件、0600、Git忽略。未复用或改动其他项目数据库。

- 20表导入全部校验通过，SQLite原文件SHA不变；包括2个既有会话和3个回执。源库及快照均保留。
- pg_dump恢复至独立临时库后，逐表对比21表（含迁移表）内容摘要及8个序列续号，恢复库app读取和禁止DDL权限通过。恢复验证库已删除，业务库及备份保留。
- 真实API3319与Studio3200以app角色运行。本地开发登录、旧原文读取、浏览器新建/保存、验收表单归档通过；旧发布匿名HTTP交付的preparedText/digest完全一致。明确标记的验收表单已归档，原业务表单未改；开发快捷登录按原机制新增专用账号。
- 本机数据/导入/恢复/验收报告在`services/api/.platform-data/backups/2026-11-18-postgresql-cutover/`，均留本机，不入Git、不记录凭证正文。实际新写入已开放，不再允许直接切回旧SQLite。
- 标准API启动命令自动读取仅有app凭证的`.env.local`；db命令仅读`.env.migration.local`。测试helper仅为测试读取独立`.env.test.local`，显式测试变量优先，不向应用注入管理凭证。Compose管理配置独立保存在`.env.postgres.local`。

门禁修复：Prettier排除历史归档、机器生成`.workflow-evidence.json`、本地持久数据及独立Next测试构建，不排除现行业务源码/测试。只格式化活跃Studio tsconfig，不改写历史收据、原库或原配置JSON。Next/配套ESLint升至16.4.5；Nest platform-express升至同主版本12.5.1以使用multer2.5.0；body-parser与fast-uri在原约束内更新。无主版本升级或业务接口改动。

最终实际验证：`pnpm check`完整通过（629单测、45根集成、16数据库集成、build/typecheck/lint/boundaries/packages/docs）；`pnpm audit --prod --json`报告各级别均0。安全升级后独立`.next-pg-verification`构建、Chrome浏览器31测试通过，不覆盖真实本地服务的构建。第一次通过Node --run注入测试环境未传至集成进程，已补测试helper本地配置回落，最终普通`pnpm check`直接通过。原总门禁45文件格式问题和Next构建安全提示已关闭。

独立reviewer最终核对Compose卷/回环、凭证隔离、显式测试配置优先及格式边界，未发现P0/P1；提示标准start与README直接node路径未加载env，已统一修复。四env权限和Git忽略独立核验，未读取密码；实际运行证据由主实现方执行。未做生产部署、跨主机容量/故障演练，也未开始Agent开发；这些不属于此次本机切换的完成声明。

安全修复依据：[Next官方公告](https://github.com/vercel/next.js/security/advisories/GHSA-mfr8-8qww-v76h)、[嵌套缓存公告](https://github.com/vercel/next.js/security/advisories/GHSA-vc7v-qv4w-wrv8)及修复前后pnpm生产依赖审计。

浏览器回归使用的独立Next构建已在验证后清理；正式归档收据运行全仓门禁与安全审计，浏览器运行证据如上单列。标准`pnpm --filter @form-engine/api start`另以临时3333端口实测成功加载本地运行配置、返回HTTP200，验证后已停止该临时进程。
