---
id: SRC-FE-001
title: 来源映射与知识覆盖
type: source-map
status: active
layer: 跨层
modules: []
tags: []
related:
  decisions: []
sources:
- SRC-REVIEW
navigation:
  group: 09 · 决策与追溯
  order: 102
last_reviewed: '2026-10-21'
status_note: 本地资料范围的来源索引与覆盖记录
---

# 来源映射与知识覆盖



本篇将原始资料、现行完整规范、ADR 和审查问题关联起来。[机器清单](../architecture-source-inventory.json)逐文件记录路径、角色、字节数、SHA-256 与章节，ZIP 内条目使用 `包路径::成员路径` 标识。该表示是检索标识，不伪造可直接点击的 ZIP 内 URL；下载包后按成员路径定位。摘要证明文件身份，不证明设计已实现。

这里的来源映射是文档证据索引；[Prepared Source Map](../CONTEXT.md)是编译产物回查原定义的候选诊断能力，二者不是同一个协议或实现。

## 原始结构、权威关系与覆盖范围 {#source-structure}

实际资料已经按现行主题与历史归档组织，不再另建 architecture/ 平行规范。用户建议体系对应：README→[维护入口](../README.md)及[整体架构](architecture.md)；Current Design→现有 `docs/design/`；Decisions→`docs/design/decisions/`；Design History→既有 `docs/history/`；Governance / Roadmap→[架构治理](governance.md)；Source Map→本篇及机器清单；Glossary→[CONTEXT](../CONTEXT.md)。只新建有实际内容的 ADR 目录。

| 资料层 | 范围与角色 | 本次处理 / 证据边界 |
| --- | --- | --- |
| 现行正文 | 整体架构、使用指南、L1 八主题及分组、L2、依赖、L3 执行、L3 校验、术语 | 保留完整细节、图示、代码和稳定锚点；补充权威阅读路径、ADR 与审查引用；不把未知补成已确认 |
| 历史早期设计 | 2026-10-14 架构 / 草案 / 抽象边界；六组原稿、同步稿、主台账、修订记录；V1 定稿副本 | 按主题核对主要取舍与替代链；原文件保留，所有可识别章节进入清单；旧规划 ADR 不改号 |
| 后续阶段来源 | L2 V0.1、依赖 V0.1、Flush V0.4、协议 V0.5、Scope V0.6、Host 边界摘录、校验 V0.7 | 核对范围、来源决策表、案例与关键转折；按主题 ADR 归因，保留原确认 / 推荐 / 待定状态 |
| 整合前快照 | 上述 ZIP 中 before-* 路径、术语统一前副本 | 原样归档并计算摘要；用于还原当时正文，不重复解释为新的一组现行结论 |
| 验证附件 | 原验证 ZIP、生成源、契约 Manifest、Fixture、报告、覆盖和说明 | 检查现有证据范围与声明；候选结构 / 有界探针不证明 Prepared / Scope / Flush / Validation / L4 实现 |
| 生成阅读视图 | `docs/reading/`、验证页面及历史入口 | 仅为同步检查读取生成结构；不反向提取设计约束，不单独维护规范 |

**覆盖声明：**完成本地现行主题的整理与交叉审查，建立本地历史文件及 ZIP 成员的完整可重复盘点，重要决策按下表定位。历史快照采用主题 / 替代链核对，未对每份重复快照的每句话重新作语义证明；代码 / 样本附件按其证据边界检查。因此不能称为“所有历史讨论逐句全量重写”或“生产设计 / 实现全量验收”。本地不存在的完整原始对话仍为来源缺口；后续新增资料必须增量核对。

## 来源编号与精确定位 {#source-register}

### SRC-COMPILERIOTYPES：编译输入输出协议类型同步授权与实现 {#src-compiler-io-types}

2026-10-21 用户在确认输入输出及默认易用性后，明确要求“先提交一下，然后把协议层相关的一些类型定义也调整一下”。设计提交为 bdec628；实际变更在 packages/protocol 的 definition / prepared 类型、自动派生 schemas、契约测试、公共消费和 README，记录见[工程实施](engineering.md#compiler-io-types)。本轮无 Compiler / Runtime 实现、真实依赖分析结果或精准更新性能证据；不将手写 Prepared 夹具作为编译器产物，也不伪造逐字会话存档。

### SRC-COMPILERIO：编译输入输出、精确表达式观察及默认易用性 {#src-compiler-io}

2026-10-21 当前对话用户重新审阅编译价值，明确保持输入输出领域结构，接受隐式依赖和校验前置准备，修订为完整动态表达式就地 watch、模板共享，并在完整结论后确认不显著区分 Canonical / Authoring、单视图无需额外 Profile / 平台配置。现行 [L2](l2-preparation.md#compiler-io-contract)、[ADR-FE-017](decisions/ADR-FE-017-compiler-io.md)与[演进](design-history.md#compiler-io-confirmed)记录确认与替代范围。对话曾提供 HTML 草案用于审阅，旧草案中的 preparation / 组件合并不代表最终结论；不把下载文件作为权威来源，也不伪造逐字会话存档。本轮仅归档，旧 Prepared 类型 / Schema 待迁移，功能检查与算法为下一专题。


### SRC-EARLY：最初架构与抽象边界 {#src-early}

[2026-10-14 目录](../history/2026-10-14/README.md)保存完整层级、模型、依赖、事务 / Host 交互和详细设计路线。[术语统一前原始来源包](../history/2026-10-17-decision-sources.zip)内 `before-pure-function-terminology/2026-10-14/` 保存原字节。现行[整体架构](architecture.md)及各层主题保留这些完整问题与图示，Resource / 通用执行器等旧候选的替代说明在[架构演进](design-history.md#decisions)。早期标题、原锚点和内容摘要身份见机器清单，不补造段落编号。

### SRC-L1：六组专题、定稿与包装修订 {#src-l1}

- [第一至三组](../history/2026-10-15-round-originals/README.md)：Data / Reference / Scope；Expression / Pure Function / Constraint；Behavior / Command / Reaction。
- [第四至六组](../history/2026-10-16-round-originals/README.md)：View / Profile / Material；Lifecycle / Validation / Submission；统一协议与组合验收。
- [定稿前同步稿](../history/2026-10-16-before-v1-final/README.md)、[10-15 修订](../history/2026-10-16-before-v1-final/changes-2026-10-15.md)、[10-16 集成](../history/2026-10-16-before-v1-final/changes-2026-10-16.md)、[当时一致性审查](../history/2026-10-16-before-v1-final/consistency-review-2026-10-16.md)。这些日志精确保留 B6、F1 / F2、外部义务及先后替代状态。
- [V1 定稿阅读副本](../history/2026-10-16-v1-final-original.html)及[原字节 ZIP](../history/2026-10-17-decision-sources.zip)内 `before-pure-function-terminology/2026-10-16-v1-final-original.html`；现行 L1 八主题承接其 32 节基线和后续修订。历史记录的初始下载摘要不等于站内阅读副本摘要，见[历史台账](../history/README.md#archive-5)。
- [Profile 去 entry 修订](../history/README.md#profile-revision)与[依赖迁移记录](../history/README.md#dependency-integration)承接候选样本的确定迁移。未存在正式已发布版本，不编造迁移版本号。

### SRC-L2：平台与编译发布 V0.1 {#src-l2}

[来源包](../history/2026-10-17-decision-sources.zip)内 `l2-preparation-platform-capability-v0.1.html`，21 个主体章。第 03 章“边界”、04–09 章能力 / Manifest / Host、10–12 章构建 / 版本 / Lock、13–16 章编译 / 依赖 / 环、17–21 章案例 / 失败 / 决策 / 交付。完整现行规范是 [L2](l2-preparation.md)；[原归档说明](../history/README.md#l2-integration)记录术语统一和摘要。

### SRC-DEP：跨层依赖 V0.1 {#src-dependency}

[来源包](../history/2026-10-17-dependency-reactivity-sources.zip)内 `l1-l4-dependency-reactivity-v0.1.html`，23 个主体章及整合前 13 份 Markdown。第 02 / 05 章分离概念及使用位置，07–10 章递归分析 / 计划 / Scope，11–18 章接口 / 时机 / L4 三方案 / 生命周期 / 跨层流程，19–23 章验收 / 决策 / 迁移 / 术语。现行[依赖专题](dependency-reactivity.md)承接；[迁移说明](../history/README.md#dependency-integration)说明 dependsOn→watch。

### SRC-V04：L3 Flush / Trace V0.4 {#src-v04}

[来源包](../history/2026-10-18-l3-flush-sources.zip)内 `l3-reactive-engine-flush-trace-v0.4.html`，20 个主体章及整合前 17 份来源。第 04–09 章不可变数据 / 非原子 Batch / Flush / 最新态，10–15 章保护 / 错误 / Trace / 消费者，18–20 章 R01–R26、C01–C18 和路线。现行[L3 决策表](design-history.md#l3-decisions)保留原编号，并显式标出后续替代，不能将 V0.4 的 Health 候选再当现行基线。

### SRC-V05：原始 / 编译后协议与 Watch V0.5 {#src-v05}

[来源包](../history/2026-10-19-protocol-runtime-v05-sources.zip)内 `l1-l2-l3-definition-prepared-watch-runtime-v0.5.html`，19 个主体章及整合前 20 份来源。原标日期 2026-10-18，整合日期 2026-10-19。第 01–06 章双结构 / Watch / 作者确认 / 编译，07–13 章执行 / 错误 / 缺失 / 整体熔断 / Trace，16–18 章 D01–D22 / 未决 / 12 个案例。当前[总账与案例](design-history.md#dependency-v05-decisions)区分历史状态及后续进展。

### SRC-V06：变化索引与 Scope V0.6 {#src-v06}

[来源包](../history/2026-10-19-data-scope-v06-sources.zip)内 `l3-data-change-dependency-index-scope-v0.6.html`，20 个主体章及整合前 20 份来源。第 04 章当时的 Baseline / Reset，05–14 章逐 Command / 等值 / Trie / 相对 Scope / ReadState / 生命周期，18–19 章 16 场景与 D01–D25。现行[总账](design-history.md#l3-v06-decisions)保留 D07 / D08 当时确认与当前撤回；D16–D20 仍为推荐，不能提升状态。

### SRC-HOST：用户明确的 Runtime / Host 边界修订 {#src-host}

[来源包](../history/2026-10-19-runtime-host-boundary-sources.zip)内 `user-confirmed-runtime-host-boundary.md`，以及 `before-runtime-host-boundary/` 的 22 份源文件。摘录四条原则和 Context 答复，明确声明不是完整逐字消息。现行[四条原则 / B01–B08](l3-reactive-engine.md#l3-runtime-host-boundary)承接，替代 V0.6 自动业务基准 / 主动 Reset 重算。缺完整对话标为来源局限，不伪造会话轮次。

### SRC-V07：Validation V0.7 {#src-v07}

[来源包](../history/2026-10-19-validation-v07-sources.zip)内 `l3-validation-engine-stage-design-v0.7.html`，18 个主体章及整合前 22 份来源。第 03 章候选收缩、05–09 章完整 Schema / Pending / 前置 / 算法、10–14 章 Source / 消息 / 订阅 / 异步 / 完整校验，16–18 章 D01–D19 / V01–V16 / 后续。现行[校验专题](l3-validation.md)完整承接，D06 与 D14 的原始张力保留用于追溯；2026-10-19 已由[用户讨论确认的依赖补全与共同入队](design-history.md#validation-prerequisite-update)替代，见 [REV-01 / 02](design-review.md#rev-01)。

### SRC-VAL：候选验证源及现有结果 {#src-validation}

[原始验证包](../history/l1-protocol-validation-source.zip)内 `l1_protocol_validation/README.md`、baseline、01–05 cases / fixtures / manifests / validator / report；现行源在 `docs/validation/`，新增 06–08 来自 extend_cases.py。01–05 仅按已记录的 Profile 去包装、External watch 等确定迁移，原包不改。精确迁移检查由[验证入口](../validation/README.md#reproduce)执行，结果以[报告](../validation/report.json)和[覆盖](../validation/coverage.json)为准。

### SRC-REVIEW：本次重构前的完整来源快照 {#src-review}

[本次快照](../history/2026-10-19-architecture-review-sources.zip)保存 `before-architecture-review/` 下 22 份文件：原有全部现行设计 Markdown、根 / docs 入口、CONTEXT、历史 / 验证说明和两个阅读生成模块。SHA-256 为 `33ef0fe7198c96f40d5b6b3cd75e62acd9e23685df9a47594fc92b32207cebe5`。它记录本次修改前状态，不冒充早期用户原件。原有技术章节、代码块和 diagram ID 由覆盖脚本对照检查。

### SRC-READER：阅读系统升级前来源快照 {#src-reader}

[阅读系统升级前快照](../history/2026-10-19-reader-system-sources.zip)保存 `before-reader-system/` 下 37 份 Markdown 与共享阅读生成源，SHA-256 为 `edcaf49761a5edf3197bbbb6a9592c852404aea877108919836932a03da5c520`。本次添加 YAML 元数据、自动检索 / 关联 / 筛选、共享界面和构建校验；没有重新决策表单运行语义。归档保留元数据改造前正文，机器清单区分原件、重复快照和生成物。

### SRC-READINGPATH：设计者阅读路径调整前的完整 Markdown {#src-reading-path}

[调整前来源包](../history/2026-10-19-designer-reading-sources.zip)保存 `before-designer-reading/` 下的正文、ADR、维护说明与术语，SHA-256 为 `c328063d9c070e94c57f4033a7e4db8cd618d036dd443099ca4ac7ca819b5737`。本次依据用户明确要求，按整体→能力图谱→各层详细设计组织阅读，设计推导与台账单独迁移，未改变既有执行语义。

### SRC-ENGINEERING：工程工具链确认与官方命令依据 {#src-engineering}

2026-10-20 本次对话中用户指定 Next.js / NestJS，确认 A 定制优先与上一版工程工具组合，限定 Playground 轻量，并授权整理完整文档，要求通过 pnpm latest 安装及官方脚手架初始化。确认与未决范围见[演进记录](design-history.md#engineering-toolchain-confirmed)，有效方案见[工程主题](engineering.md)及 [ADR-FE-014](decisions/ADR-FE-014-engineering-toolchain.md)。命令依据为工程主题各节链接的 pnpm、Next、Nest、tsdown、shadcn、ESLint、Playwright、Husky、Changesets 等官方文档，查阅日期为 2026-10-20；未保存或伪造逐字会话 / 官方网页快照。首次归档时命令未实跑；后续实际初始化、兼容处理及本地验收见[实施记录](engineering.md#engineering-implementation)与[演进](design-history.md#engineering-initialized)，不作为生产引擎语义完成证据。用户随后明确要求开发模式直接消费工作区源码，并授权实施；又明确 Playground 的应用控件统一使用 shadcn/ui；条件 exports、源码监听与生产打包入口隔离的实际配置和验收同步在工程主题，未改变模块职责或提升核心实现状态。

### SRC-PROTOCOL：协议结构源与校验路线确认 {#src-protocol-source}

2026-10-21 本次对话中，用户比较 Schema 优先、原生 TS 优先与 Zod 单源，最终明确确认原生 TS 类型及注释主导、自动生成 JSON Schema、Compiler 使用 Ajv 的路线。现行 [L1 说明](l1/08-decisions-release.md#protocol-structure-source)、[ADR-FE-015](decisions/ADR-FE-015-protocol-source.md)及[演进](design-history.md#protocol-source-confirmed)记录确认范围；未保存或伪造逐字会话快照。工具定位调研参考 [Ajv Schema 管理](https://ajv.js.org/guide/managing-schemas.html)、[独立校验代码](https://ajv.js.org/standalone.html)与 [Zod JSON Schema](https://zod.dev/json-schema)，查阅日期 2026-10-21；官方能力介绍不等于本项目生成器、性能或跨语言验收已通过。

### SRC-CONTRACTS：物料声明与 Host 输入确认 {#src-contracts}

2026-10-21 本次对话中，用户认可三领域与公共入口，逐项修正 Binding 的读写能力、Slot 数量约束，确认 Host 调用快照 + Scope + watch、Binding 数据 Schema、事件 Payload Schema，并授权已确认内容先归档、继续讨论其他缺口。结论与范围见[演进](design-history.md#material-host-contracts-confirmed)、[物料契约](l1/05-view-material-host.md#material-minimum-contract)与[Host 输入](extension-integration.md#host-input-contract)。未保存或伪造逐字会话快照；类型草案尚未实现，其他待决议题不随本轮自动确认。

### SRC-PREREQUISITES：前置引用、实例绑定与同步等待确认 {#src-prerequisites}

2026-10-21 本次对话用户明确字段 / 规则引用是已有讨论方向，确认前置按 Scope ID 唯一实例绑定、本期不增加集合 or / any、仅等待同步校验，多步异步封装在同一 Host 能力。见[演进](design-history.md#prerequisite-scope-confirmed)、[L3 契约](l3-validation.md#prerequisite-scope-contract)与 ADR-FE-010。未保存或伪造逐字会话快照；字段资格集合、正式语法和生产实现未随本次确认完成。

### SRC-PROTOCOLBASELINE：协议包完整草案确认与开发准备 {#src-protocolbaseline}

2026-10-21 本次对话用户明确接受完整剩余草案，要求先实施、实际使用发现问题后迭代，不再继续细节访谈。确认范围见[演进](design-history.md#protocol-baseline-confirmed)及[首批开发基线](l1/08-decisions-release.md#protocol-development-baseline)，详细机制归现有 L1 / L2 / L3 及对应 ADR。未保存或伪造逐字会话快照；本轮无正式协议代码或生产验收证据，不将规范确认扩大成全引擎 API 冻结。

### SRC-PROTOCOLIMPLEMENTATION：Protocol 首批代码与本地验收 {#src-protocolimplementation}

2026-10-21 用户授权先提交设计再开始编码；设计提交 8eeb321，Protocol 代码位于 packages/protocol，公共消费检查位于 tools/engineering/check-packages.mjs 与 tests/integration/protocol.test.ts。现行[工程实施](engineering.md#protocol-implementation)、[L1 实施状态](l1/08-decisions-release.md#protocol-initial-implementation)与[演进](design-history.md#protocol-contracts-implemented)记录真实范围。版本来自 pnpm 实际安装与锁，测试来源是实际 pnpm check 输出；不伪造浏览器、Compiler / Runtime 或 Dart 验收证据。

### SRC-WORKFLOWS：项目工作流确认与调研依据 {#src-workflows}

2026-10-20 本次对话中用户要求兼顾效率、可靠性和持续演进，以真实任务理解流程后，明确要求按五类建设说明文档与工作流；第三方 skill / 工具先说明，由用户决定是否安装。现行说明见 [项目工作流](workflows.md)，执行入口位于仓库 `.agents/skills/`，演进见 [工作流建设记录](design-history.md#workflow-established)。未保存或伪造逐字对话快照。

调研用于选型参考，不将厂商案例或研究直接提升为项目共识：[SDD 层次分析](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)、[SDD 实践研究（2026-10-15 修订）](https://arxiv.org/abs/2608.25202v4)、[长任务 harness](https://www.anthropic.com/engineering/harness-design-long-running-apps)、[DORA](https://dora.dev/research/2025/dora-report/)、[METR 更新](https://metr.org/blog/2026-02-24-uplift-update/)。仓库 skill 发现机制依据 [官方文档](https://learn.chatgpt.com/docs/build-skills)。查阅日期为 2026-10-20；这些资料不证明本项目已提效，候选第三方工具未安装。

## 设计者阅读结构的内容迁移 {#reading-migrations}

| 调整前的位置 | 当前权威位置 | 处理方式 |
| --- | --- | --- |
| 整体架构内 L1 模型与图 | [L1 基础](l1/01-foundation.md#definition) | 完整迁移模型、取舍、例子与交付物 |
| 整体架构内 L2 流水线 | [L2 编译](l2-preparation.md#preparation) | 完整迁移跨层说明，详细编译契约继续保留 |
| 整体架构内 L3 模型 / 依赖 / 修改图 | [L3 运行时](l3-reactive-engine.md#runtime) | 完整迁移机制、接口草图、流程与验收 |
| 整体架构内 Renderer | [L4 呈现](l4-renderer.md#renderer) | 保留已有边界与草图，标明完整模块设计待讨论 |
| 整体架构内 Material / Host | [扩展与集成](extension-integration.md) | 完整迁移物料、Host 图示、竞态与接入说明 |
| 整体架构内 Tooling | [Platform / Studio](platform-studio.md#tooling) | 保留既有建设方向，区分整体产品尚未设计 |
| 正文内修订记录与决策总账 | [设计演进](design-history.md) | 迁移推导、旧方案、替代依据与原编号 |
| L3 中的数据 / Scope 与 Trace 详细说明 | [数据 / Scope](l3-data-scope.md)、[诊断 / Trace](l3-observability.md) | 按能力迁移完整机制、算法、字段、代码与验收 |
| 原治理篇中的约束 / 冲突证据 | [独立审查](design-review.md) | 与日常讨论工作清单分开 |
| L1 的单个 HTML 长页 | 八份主题阅读页与[L1 入口](l1/README.md) | Markdown 不复制，旧 URL 按章节路由到新主题 |

具体原路径与锚点在目标 Markdown 的 `relocated_sections` 声明；构建派生路由，并将原锚点、代码块和图 ID 的保留检查扩展到声明的迁移目标。原始讨论标签仅在来源与追溯中出现，不充当文档或引擎版本。

## 重要结论、来源与处理映射 {#conclusion-map}

K 编号为本次稳定结论索引。来源中的“已确认”只指其相应范围；表中“推荐 / 未决”不能写入正式运行契约。

| ID / 模块 | 可独立检索的结论与现行状态 | 原始依据 | 完整现行位置 / ADR | 重构处理及后续变化 |
| --- | --- | --- | --- | --- |
| K01 全局 | 四层、唯一数据、多视图共享：确认 | SRC-EARLY、SRC-L1 D1 | [层级](architecture.md#architecture)、[001](decisions/ADR-FE-001-boundaries.md) | 保留完整图与责任；归入既有主题 |
| K02 Host | 请求 / 上传 / 业务提交移出核心：确认 | SRC-L1 第三组 ADR-03-00 / EXT-1 / EXT-2 | [三路径](l1/05-view-material-host.md#host)、[001](decisions/ADR-FE-001-boundaries.md) | 旧 Resource Manager / 通用执行器归档；跨层竞态仍保留 |
| K03 Data | 允许无效工作态、Missing ≠ null、Host 值优先补缺：确认原则 | SRC-L1 第一组 D2 / D7 与定稿 | [Data](l1/02-data-reference-scope.md#data)、[002](decisions/ADR-FE-002-static-language.md) | 保留，不扩写默认值实现算法 |
| K04 语言 | 结构化 Reference、根路径固定、局部 Binder、Handle 分责：确认 | SRC-L1 第一 / 六组、定稿 D2 / D3 | [引用 / Scope](l1/02-data-reference-scope.md#reference)、[002](decisions/ADR-FE-002-static-language.md) | 全局词法表候选归档；不与 L3 实例表混同 |
| K05 表达式 | 纯 AST、递归 ValueSpec / Literal、Named 不捕获局部：确认 | SRC-L1 第二组 / 定稿 D4 | [Expression](l1/03-expression-validation.md#expression)、[002](decisions/ADR-FE-002-static-language.md) | 完整类型草图与例子保留，Union 待固化 |
| K06 能力 | 纯同步校验复用 Pure Function、assert boolean：确认 | SRC-L2 第 04–07 章、L2 D04–D06 | [纯函数](l2-preparation.md#l2-pure-functions)、[002](decisions/ADR-FE-002-static-language.md) | 术语统一；op 未迁移，短名规范化待固化 |
| K07 View | 三节点、Profile 直接值、bindings / slots Canonical：确认 | SRC-L1 第四 / 六组 / 定稿 D8–D10、包装修订 | [View](l1/05-view-material-host.md#view)、[003](decisions/ADR-FE-003-view-material.md) | 合并重复入口；entry 等旧语法只留历史 |
| K08 Template | schemaRef + Typed DataReference 静态复用：确认 | SRC-L1 定稿 D11 与修订 08 | [模板](l1/05-view-material-host.md#templates)、[003](decisions/ADR-FE-003-view-material.md) | 泛型 / 动态 ID / Handle 参数候选归档 |
| K09 Material | 容器负责呈现；不建独立 Validation DSL：确认 | SRC-L1 修订 05 / 06 / 09、D12 / D13 | [Interaction](l1/05-view-material-host.md#interaction)、[003](decisions/ADR-FE-003-view-material.md) | Presentation / ValidationMetadata 明确替代 |
| K10 编译 | 唯一 Prepared 执行入口：确认 | SRC-V05 D01 / D02 / D05 | [双结构](dependency-reactivity.md#dependency-compiled-protocol)、[004](decisions/ADR-FE-004-prepared-entry.md) | 原始 / 编译双轨候选被替代；ABI 仍未冻结 |
| K11 依赖 | Reads / Watch / Subscription 分离，作者确认建议：确认 | SRC-DEP D01 / D04 / D05、SRC-V05 D03 / D04 | [Watch](dependency-reactivity.md#dependency-watch-review)、[005](decisions/ADR-FE-005-watch-subscription.md) | 使用位置唯一完整矩阵在 L1；其余主题引用 |
| K12 Constraint | Internal when+assert，External watch+when：确认 | SRC-DEP 第 04–05 章、DEP.D02 / D03 | [Constraint](l1/03-expression-validation.md#constraint)、[005](decisions/ADR-FE-005-watch-subscription.md) | dependsOn→watch 迁移；不新增 External Payload |
| K13 View 订阅 | L2 编译 / L3 匹配 / L4 挂载；规则不随 View：确认 | SRC-DEP 第 15–18 章 | [生命周期](dependency-reactivity.md#dependency-view)、[005](decisions/ADR-FE-005-watch-subscription.md) | 三方案取舍保留；首次读与改绑 API 未决 |
| K14 数据执行 | 即时不可变 Root、默认非原子 batch：确认 | SRC-V04 R01–R03、SRC-V05 D06 | [数据](l3-data-scope.md#l3-data)、[006](decisions/ADR-FE-006-command-flush.md) | 替代旧第三组 B6 / 候选树统一提交 |
| K15 Reaction | pending 合并、最新态、执行后可重入队：确认 | SRC-V04 R04 / R05、SRC-V05 D07 | [合并](l3-reactive-engine.md#l3-reactions)、[006](decisions/ADR-FE-006-command-flush.md) | 不丢显式 Command 次数；排序仍推荐 / 未决 |
| K16 Flush | 延迟启动同步执行，同轮级联，Operation 为来源：确认 | SRC-V04 R06 / R07、SRC-V05 D08 | [Flush](l3-reactive-engine.md#l3-flush)、[006](decisions/ADR-FE-006-command-flush.md) | 分段调度延期；通知重入 / Pending 未决 |
| K17 检测 | 逐 Command 前后 Data / Scope，候选后比较：确认 | SRC-V06 D04 / D05 / D12 | [检测](l3-data-scope.md#l3-change-detection)、[007](decisions/ADR-FE-007-scope-comparison.md) | 旧 Root / ScopeChange 不传播到 pending |
| K18 Scope | 稳定身份、父级相对位置：确认 | SRC-V06 D10 / D11 | [Scope](l3-data-scope.md#l3-scope-index)、[007](decisions/ADR-FE-007-scope-comparison.md) | 完整绝对路径为解析结果，不重写全部后代 |
| K19 候选索引 | Object.is、Trie、局部旧视图：推荐；整数组重建现已确认 | SRC-V06 D16–D20、D23–D25 | [等值 / 索引](l3-data-scope.md#l3-observed-equality)、[007](decisions/ADR-FE-007-scope-comparison.md) | 原状态保留；OD-07，不冻结为 ABI |
| K20 生命周期 | 仅新实例首次激活，业务编辑归 Host：确认 | SRC-HOST，明确替代 SRC-V06 D07 / D08 / D21 / D22 | [四原则](l3-reactive-engine.md#l3-runtime-host-boundary)、[008](decisions/ADR-FE-008-host-editing.md) | 旧自动 Baseline / 主动 Reset 归档，B01–B08 保留 |
| K21 快照 | 稳定 snapshot 不 Flush / 建基准 / 标 Clean：确认 | SRC-HOST | [snapshot](l3-data-scope.md#l3-initialization-baseline)、[008](decisions/ADR-FE-008-host-editing.md) | 与 Command 临时旧值、Host 业务快照分别解释 |
| K22 Context | Host 提供、表达式只读、Data-only Command / Watch：确认 | SRC-HOST 末段 | [Context 边界](l3-reactive-engine.md#l3-runtime-host-boundary)、[008](decisions/ADR-FE-008-host-editing.md) | 不新增 Context 触发链；证明新鲜度 OD-09 |
| K23 错误 | 可隔离错误继续、预算整体熔断、无局部 Health：确认 | SRC-V05 D09 / D10，替代 SRC-V04 第 11 章候选 | [错误](l3-reactive-engine.md#l3-errors)、[009](decisions/ADR-FE-009-errors-trace.md) | Pending / Submit 的空缺公开，REV-03 |
| K24 追踪 | 临时线性事实、Change 来源、首次入队建 Context：确认 | SRC-V04 R08 / R09、SRC-V05 D11 / D12 | [Trace](l3-observability.md#l3-trace)、[009](decisions/ADR-FE-009-errors-trace.md) | 预算 / 截断 / 参数待定；Replay 与历史恢复延期 |
| K25 校验 | 完整根 Schema、独立 Constraint、共用索引：主线收敛 | SRC-V07 D01–D04 | [Schema](l3-validation.md#validation-schema)、[010](decisions/ADR-FE-010-validation.md) | 不拆 Keyword、不跨端传 JS 校验函数 |
| K26 校验前置 | 编译补全依赖、本轮递归补齐前置已确认；资格与引用待固化 | SRC-V07 D05 / D06 / D14–D16；[2026-10-19 用户讨论](design-history.md#validation-prerequisite-update) | [前置](l3-validation.md#validation-round)、[010](decisions/ADR-FE-010-validation.md) | 替代严格缺失倾向；实例绑定、字段资格与异步交接仍待设计 |
| K27 校验结果 | 字段聚合方向收敛，Source / 原子通知 / 模板推荐 | SRC-V07 D08–D13 | [结果](l3-validation.md#validation-results)、[010](decisions/ADR-FE-010-validation.md) | 过期不可提交为必要约束；token / Issue API 待定 |
| K28 完整性 | 无 Issue 不等于通过；完整覆盖 / 新鲜度必要 | SRC-L1 第五组 F4 / F5、SRC-V07 D17 | [完整校验](l3-validation.md#validation-completeness)、[010](decisions/ADR-FE-010-validation.md) | 准确返回、异常交接、输出转换未闭环 |
| K29 L2 / 平台 | 静态编译与平台资产 / 发布分责：确认 | SRC-L2 D01–D03 / D08 / D09 | [平台](l2-preparation.md#l2-platform)、[011](decisions/ADR-FE-011-release-lock.md) | 两条流水线与应用本地能力保留 |
| K30 发布 | 版本+制品锁定、不可变 Release、ABI 独立：确认 | SRC-L2 D10 / D11、第 10–12 章 | [发布](l2-preparation.md#l2-release)、[011](decisions/ADR-FE-011-release-lock.md) | 摘要覆盖 / 兼容矩阵未冻结；不虚构已发布版本 |
| K31 证据 | 静态结构与有界探针不能证明生产执行：事实 | SRC-VAL 及现行报告的 validationScope | [附件边界](../validation/README.md)、[模块矩阵](governance.md#design-status) | 保留原报告，实施验收不计入现有通过统计 |

所有旧结论只有有明确替代来源的才标“被替代”。未定位到完整实现接口的内容继续留在 [OD 清单](governance.md#open-decisions)，不靠 ADR 补造设计。新增 REV-04 / 05 / 07 / 10 和 OD-13 / 14 的反例与建议是本次分析，其来源是相关现行契约之间的接缝，不冒充历史已讨论方案。

## 机器盘点、完整保留与未覆盖语义 {#source-inventory}

当前条目数、角色分布、文件 / ZIP 成员摘要及原有章节 / 代码 / 图示保留结果以[机器清单](../architecture-source-inventory.json)为准。统一构建自动派生该清单，不修改 Markdown；本篇不再保存需要单独更新的数量副本。

机器检查保留原有技术主题的二级章节锚点、所有代码块和原 diagram ID，识别新增来源及重复字节。历史文件 / ZIP 成员的 headings 清单只是可定位性证据；`indexed-preserved` 表示原文已盘点保留，绝不等同于逐句完成语义审查。表中 K01–K31 才是已明确映射的重要结论；相关未决边界在治理篇维护。

现有机器清单不记录不存在的决策人或逐字会话；ZIP 内脚本、全量 JSON 和生成页面的归档完整性不等于生产语义覆盖。原有样本的 Runtime 未覆盖项见 SRC-VAL；本次不把它们升级为已经通过。

## 可重复执行与新增资料处理 {#incremental-coverage}

从项目根运行：

```bash
.venv-docs/bin/python tools/docs/build_docs.py
.venv-docs/bin/python tools/docs/build_docs.py --check
.venv-docs/bin/python tools/docs/serve.py
```

统一构建先解析和校验 Markdown 元数据、ID / 引用 / 替代关系及任务前置，再生成来源清单、全文索引和阅读页。check 只比较与校验，不写入文件；任何来源或页面变化都要求重新生成。构建不会自动确认新结论，也不修改原始 Markdown。独立 `audit_architecture.py --check` 继续检查来源身份、保留情况及本地链接。协议样例发生变更时另运行 `python3 docs/validation/run_validation.py`。

新增资料先分配 SRC 编号、核对摘要 / 原标题 / 锚点，再判断补充、明确替代、候选或冲突，更新 K 条目、所属规范、ADR 和治理事项。新资料若不能归入现有 SRC 类别，工具要求先补充分类映射，不静默算作已审查。历史源只归档；需要改变现行行为时以明确确认及可复现反例为依据，保留修订前源文件和替代关系。

文档构建采用单向链路；以下 Mermaid 只说明阅读系统，不表达表单 Runtime 的调用关系。

```mermaid
flowchart LR
  A[原始资料] --> B[Markdown 知识库]
  B --> C[元数据与引用校验]
  C --> D[全文索引与关联]
  D --> E[共享 HTML 阅读页]
```

### 2026-10-19 用户讨论补充：联动异常与提交

[本轮讨论记录](design-history.md#reaction-failure-submit-update)确认 Reaction 失败不自动阻止提交，熔断暂停自动联动但保留填写、快照与独立完整校验。该结论修订旧来源的联动收敛门槛；现行行为以 [L3 错误](l3-reactive-engine.md#l3-errors)和[校验](l3-validation.md#validation-completeness)为准，恢复与 SDK 仍待固化。

### 2026-10-19 用户讨论补充：Reaction 顺序与 Host

[本轮讨论记录](design-history.md#reaction-order-host-update)确认不增加 Reaction 前后依赖 / 业务优先级；稳定调度用于复现，业务通过数据变化级联。Host 自管报价请求与任务合并，Reaction 去重不等于请求去重。现行说明见 [Reaction](l3-reactive-engine.md#l3-reactions)及 [Host](extension-integration.md#capabilities)。

### 2026-10-19 用户讨论补充：同步回调与 Flush

[本轮确认](design-history.md#flush-callback-update)：同步回调写回归当前 Flush，去重、计数和熔断预算不重置；Pending 的执行前合并不等于新增轮次，不引入通知延迟队列要求。现行时序与 C16 见 [L3](l3-reactive-engine.md#l3-flush)。

### 2026-10-19 用户讨论补充：整数组替换身份

[用户确认记录](design-history.md#array-replacement-identity-update)将整数组替换重建确认为操作语义，即使内容完全相同也不复用成员身份。修订原 D19 推荐与业务 Key 协调候选，现行见 [数组生命周期](l3-data-scope.md#l3-array-lifecycle)与 ADR-FE-007。

### 2026-10-19 用户讨论补充：首次激活默认值

[用户讨论确认](design-history.md#reaction-activation-default-update)：新 Reaction 默认不因实例建立而执行，只有显式开启才首次入队；初始化、新增与整替换新成员一致适用。常规 Watch 触发不变，正式字段和 SDK 待固化，见 ADR-FE-008。

### 2026-10-19 用户讨论补充：交互入口限制

[本轮用户确认](design-history.md#input-validation-boundary-update)：禁用添加等业务限制在交互入口落实，数据层只判断结构可执行性，业务不合法数据由 Validation 报告并阻止提交。L1 array.insert 歧义已消除，REV-04 已解释，位置契约仍待固化。

### 校验专题本组确认补充

[本组用户确认](design-history.md#validation-group-completion-update)：字段资格以前置完成且无字段错误判断，完整校验等待全部适用同步 / 异步规则，尽量收集独立错误。修订 ADR-FE-010 与 L1 / L3，候选 requiredForSubmit 迁移和异步期间输入变化策略仍待固化。

### 校验任务重复调用的用户确认

[任务级处理](design-history.md#validation-task-replacement-update)确认新旧异步调用用版本或替换 / 取消在任务层管理，沿用正常 Flush；不扩展全局追赶，不由引擎锁定编辑。具体任务身份与取消 SDK 待固化。

### 校验取消接入的授权选择

[用户授权选定记录](design-history.md#validator-cancel-handle-update)：任务代次 / 输入资格保护为必要契约，Host 返回可选 cancel 句柄为选定取消接入；取消不保证成功，不改变同步 Reaction 和 Host 网络职责。现行见 L3 校验与 Host 接入，ADR-FE-010 已修订。

### 2026-10-20：Host 接入与输出

[本轮用户确认](design-history.md#host-output-update)与 [ADR-FE-012](decisions/ADR-FE-012-host-output.md)明确规则 / 校验能力独立名称、按用途降级、开发诊断 / 用户无技术错误暴露，以及 Host 独立转换业务输出。原输出职责记录仅作追溯，现行 L1 / L3 / Host / 术语已同步。

### 2026-10-20：对象防御与观察比较

[本轮确认](design-history.md#data-copy-freeze-update)：按观察位置比较，外部输入复制、读取只读约定、开发业务数据递归冻结。REV-07 策略已明确；实际性能与跨端实现尚未验证，见 ADR-FE-007。

### 2026-10-20：数组目的位置

[用户确认](design-history.md#array-position-update)数字与成员锚点都支持，移动数字按最终下标解释，位置失效明确失败；现行见 [Command](l1/04-command-reaction.md#commands)与 [L3 数组生命周期](l3-data-scope.md#l3-array-lifecycle)，ADR-FE-007 同步，正式字段与错误 SDK 待固化。

### 2026-10-20：L1 严格协议固化

[用户确认](design-history.md#l1-strict-update)未知协议字段拒绝、表达式保留标记用 Literal 转义、静态类型连接仅接受可证明兼容的范围。现行 [L1 固化](l1/08-decisions-release.md#strict-contract)、L2 和 ADR-FE-002 同步；正式类型 / Schema 和兼容子集仍待固化。

### 2026-10-20：L2 交付与错误准入

[用户确认](design-history.md#l2-delivery-update)JSON 交付、首阶段 Prepared 格式精确匹配、编辑分析与执行制品分离，Error 不产执行制品，不作为可用入库 / 发布制品进入 C 端。L2、ADR-FE-004 / 011 与治理同步，正式 ABI 字段和实现验收待完成。

### 2026-10-20：L4 组件接入原则

[用户修订](design-history.md#l4-component-adapter-update)确认组件 Adapter 订阅 Runtime、读取 Props、事件转既有指令，组件只持有内部交互状态；不新增字段端口或更新粒度体系。L4、L1 bindings 说明与跨层订阅同步，旧控制器草图保留为追溯，完整职责尚待讨论。

### 2026-10-20：共用 Adapter

[用户确认](design-history.md#shared-adapter-update)Adapter 为共用接入能力，物料差异在组件内部消化，不按物料增加映射适配器。L4 与跨层正文同步，统一 Props / 指令接口继续讨论。

### 2026-10-20：Adapter 共性职责

[本轮用户原则](design-history.md#adapter-common-scope-update)：共用 Adapter 封装绑定、指令和表达式求值接入，物料交互自管，特殊能力按实际需求判断。L2 编译 / L3 求值边界不变，不新增 Adapter 原始 AST 解析器或特殊指令 DSL。

### 2026-10-20：输入交付与展示

[用户确认](design-history.md#input-handoff-update)普通输入含非法值交付 Runtime，确认型选择由组件内部管理至确认，编辑结束展示 Runtime 当前状态。现行 [L4](l4-renderer.md#input-handoff)、L1 / L3 与 ADR-FE-003 同步，不新增临时状态体系。

### 2026-10-20：L4 生命周期与物料错误

[用户确认](design-history.md#l4-lifecycle-error-update)：共用 Adapter 负责组件生命周期、监听 / 回调解绑、Scope 视图关联与迟到调用拒绝；单物料错误局部隔离、降级并上报 / 告警。L4 / ADR-FE-003 与治理同步，实际数组数据修改仍归 Runtime。

### 2026-10-20：Agent 八层能力排查

用户提供 Agent L1 模型基础至 L8 评测迭代的完整关键词，要求在 HTML 呈现。现行 [八层清单](platform-studio.md#agent-eight-layers)逐项覆盖，官方资料与本项目候选建议在该节区分。Agent 与表单层级分开命名；能力规划并非当前建设承诺，未新增 ADR 或自建 Agent 平台决策。

### 2026-10-20：核心主线与蓝图讨论

用户明确选择方向二，并要求先讨论清楚整体蓝图；[确认范围与演进](design-history.md#core-first-blueprint)对应[蓝图讨论稿（现位于整体架构）](architecture.md#product-blueprint)和[当前治理轮次](governance.md#implementation-readiness)。仅路线与工作次序为已确认，具体产品组织、范围和阶段安排仍为候选，不新增生产完成证据。

### 2026-10-20：蓝图图示与阅读定位

用户要求 HTML 图示和层级组织；[呈现调整记录](design-history.md#blueprint-visual-placement)对应[整体架构蓝图](architecture.md#product-blueprint)和[产品能力定位](capability-map.md#product-capability-map)。完整迁移声明与旧书签由统一构建校验，原有责任和候选状态保留。

### 2026-10-20：应用架构、包与工程化准备

用户要求按应用架构 / 服务 / 包与目录 → 技术选型与工程化的顺序推进，见[讨论记录](design-history.md#application-engineering-first)与[架构草案](architecture.md#application-engineering)。仅推进顺序为已确认；仓库、包与服务边界建议待审阅，没有实现或发布证据。

### 2026-10-20：运行保障与 Agent 辅助问题处理

用户明确确认能力进入蓝图、实现可后置；[讨论记录](design-history.md#blueprint-operations-confirmed)对应[蓝图能力与节奏](architecture.md#blueprint-operations)、能力图谱和治理中的实施安排。确认不扩展为自动生产操作授权，具体方案仍待设计，未新增生产实现证据。

### 2026-10-20：最外层目录认可与包边界讨论

用户明确认可最外层目录，但要求继续讨论包边界；[确认范围](design-history.md#outer-directories-confirmed)对应[应用工程架构与候选比较](architecture.md#package-boundary-discussion)。目录子项、独立发布与六个候选包族均未确认，没有生产包或技术选型证据。

### 2026-10-20：Web/TS + React 首期与目录统一归档

用户明确首期 TS / React、packages 直接放 TS 包、packages-flutter 顶层预留，并授权先建立 .gitkeep 后同步文档及检查清理。现行[应用架构](architecture.md#application-engineering)、[ADR-FE-013](decisions/ADR-FE-013-ts-react-packages.md)、[演进及原候选](design-history.md#ts-react-package-layout)、L4 与治理同步。仅目录占位已完成；正式协议、Runtime / Renderer、生成器、跨语言测试及后端均无新增实现证据。归档节奏调整为完整专题确认后统一维护，不再逐段写入候选。


### 2026-10-20：工程方案统一归档

[工程主题](engineering.md)承接已确认包边界，统一安装、脚手架、任务、Git 与质量要求；[架构](architecture.md#application-engineering)、[治理](governance.md#implementation-readiness)、[演进](design-history.md#engineering-toolchain-confirmed)同步当前状态。新增 ADR-FE-014，不替代旧 ADR，不变更协议语义，不提升核心模块完成度；实际仍只有目录占位。


### 2026-10-20：工程初始化实施证据

用户授权按已归档方案执行，并明确允许 peer 冲突项由脚本选择最新兼容稳定版。实际生成清单、根锁、配置、测试和公开产物由本轮命令验证；[工程主题](engineering.md#engineering-implementation)维护版本、命令和结果，[演进](design-history.md#engineering-initialized)记录授权与问题处理。源码 / 锁是工程复现依据，不建立另一套规范或报告页；生产协议与 Runtime 不从工程 smoke 结果推导完成。


### 2026-10-21：物料 Request 完整方案确认

用户明确“我认可这个改动方案”，确认范围为输入输出 Schema、页面到 Host 映射、公共桥接、并发及生命周期、Prepared 交付和移除 services；讨论缘由见 [演进](design-history.md#material-requests-confirmed)，现行见 [L1](l1/05-view-material-host.md#material-requests)及 [ADR-FE-016](decisions/ADR-FE-016-material-requests.md)。该确认不证明 Compiler / Adapter / SDK 已实现。


### 2026-10-21：请求开发接入与遗漏报错目标

用户要求梳理物料到 Host 的输入输出开发流程、明确缺失注册错误，并以“这一块要把它加进来，至少我们在实现的时候，得知道我们的实现目标是什么”确认归档。范围见 [演进](design-history.md#request-integration-confirmed)、[现行验收](l1/05-view-material-host.md#request-development-contract)及 ADR-FE-016 的增量修订；未冻结 SDK 函数名、生成工具或宣称生产实现完成。
