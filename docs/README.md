# 文档维护

项目仍在架构设计讨论、规范细化与开发准备阶段。当前已有明确共识，也有候选机制和未闭环契约；不把保存文档或候选验证通过当成设计发布。

## 设计者的主阅读路径

**整体架构 → 纵向与横向能力图谱 → 每层 / 每项能力的独立设计。**

- [整体架构](design/architecture.md)：产品蓝图（待审阅）、系统边界、完整逻辑架构图、双工作流、建设路径、责任与贯穿案例，以及已确认的 TS / React 首期包与目录。
- [工程工具链与初始化](design/engineering.md)：已确认选型、比较、pnpm latest 安装、官方脚手架、Git 与质量门禁；尚未执行工程初始化。
- [能力图谱](design/capability-map.md)：先定位产品能力，再看纵向四层与横向协作，进入对应主题。
- [L1 协议](design/l1/README.md)：模型 → 数据 / 引用 / Scope → 表达式 / 校验 → 命令 / 联动 → 视图 → 生命周期 → 示例与类型。八份主题分别生成 HTML，不再合成长页。
- [L2 预处理](design/l2-preparation.md)、[L3 数据与执行](design/l3-reactive-engine.md)、[L3 校验](design/l3-validation.md)、[L4 呈现](design/l4-renderer.md)：各层完整现行说明与明确的未闭环边界。
- [跨层依赖](design/dependency-reactivity.md)、[物料 / Host](design/extension-integration.md)：横向能力的主要契约。
- [Platform / Studio](design/platform-studio.md)：已有范围与待设计工作；尚未形成整体产品、模块或接口方案。

继续讨论统一进入[设计进展与待讨论事项](design/governance.md)，按层看缺口、选具体问题、按前置推进。取舍背景、旧方案与决策总账在[独立设计演进](design/design-history.md)及 `design/decisions/`；[约束与审查证据](design/design-review.md)、[来源映射](design/source-map.md)按需查阅，不与主阅读顺序混排。

`docs/design/` 是唯一设计正文。结构调整把原整体架构内的分层机制、模型 / 依赖 / 修改 / Host 图示完整迁入对应主题，整体架构保留全局职责与贯穿关系；不因拆分而删减说明。使用场景另见[使用与开发指南](design/usage-guide.md)，词汇见 `CONTEXT.md`，协议样例与现有证据见 `validation/`。

## 项目研发工作流

[项目工作流与使用说明](design/workflows.md)按真实场景说明方案讨论、确认归档、开发交付、问题修复、流程改进五类任务，包含步骤、例子、结束条件与安装候选。可直接用自然语言交代任务；仓库 `.agents/skills/` 提供对应执行入口。工作流复用下方维护程序及已确认工程工具链，不新增第二套设计规范。第三方工具由用户选择后安装，当前五类流程无必装插件。

## 讨论标记不代表发布版本

原始资料中的 V1、V0.4、V0.5、V0.6、V0.7 只是讨论来源标签，不能作为文档、引擎、SDK 或正式协议版本。标签仅在决策追溯和来源中保留，以免失去原件身份。当前阅读标题和导航不显示这些标签。

协议字段、能力制品身份与兼容是另一项已有架构议题；示例中保留的 `protocolVersion` / `version` 等技术字段不代表已经发布。已有共识需要明确决策才能修订，时间较新的局部讨论不会自动覆盖全局约束。

## 维护方式 {#maintenance}

1. 修改相应 Markdown 或样本生成源，保留稳定章节锚点和已收敛 / 待固化状态；不按讨论轮次新增平行规范。
2. 示例变化时同步验证源。保险基线读取 [示例正文](design/l1/07-examples.md#sample)；其余样本来自 `validation/build_cases.py` / `extend_cases.py`。不直接修改生成的 cases、报告和阅读页。
3. 生成阅读页并检查同步；协议样例变更时另复跑验证。出现冲突，以相应主题正文为准，修正受影响的样本和说明。

4. 新增来源或修改设计时，同步相关 ADR、治理事项和来源映射；先审查变更，再运行统一构建更新派生清单与页面。盘点检查保留原技术章节 / 代码 / 图示，不自动判定新结论已确认；需要有意迁移原内容时须先扩展可审计的迁移映射。

### 完整专题确认后的统一归档 {#incremental-maintenance}

按用户最新要求和项目 `AGENTS.md` 执行：完整专题先在对话中讨论，未形成结论时不逐段修改 Markdown / HTML 或保存候选；用户明确确认专题收敛结果后，再一次完成现行主题、必要 ADR / 演进 / 治理与来源的统一归档、构建及检查，无需反复索要归档授权；未确认建议不得写为共识。维护准确、完整、可追溯的知识变化，不重新设计系统或重写全库；没有结论时允许不修改现行设计。

**知识归属：**Current Design 是 `docs/design/` 的现行主题；ADR 是 `design/decisions/`；主题推导与演进在 `design/design-history.md`，原始历史在 `history/`；Governance 的约束依据见 `design/design-review.md`，冲突、Open Decisions、模块状态和 Roadmap 统一在 `design/governance.md`；术语在 `CONTEXT.md`，来源在 `design/source-map.md`。复用现有章节与编号，不另建平行索引或每轮报告页。

1. **加载相关基线。**先读本入口，再按议题读取全局约束、受影响主题、关联 ADR、未决 / 冲突、必要历史、模块状态与来源映射。跨层议题同时核对上下游契约，不仅依据聊天判断现行状态，也不无差别加载全库。
2. **提取变化。**逐项区分新增、修改、废弃、澄清、候选、待决策、冲突、实现细化；记录涉及模块、本轮结论、旧设计定位、影响范围、确认状态、ADR 需求和待改文件。这是本轮工作清单，无需另建重复台账。明确确认的新决策与明确确认的决策变更分开处理；助手建议不能视为用户接受。
3. **先检查一致性。**核对全局原则、层级与职责、上下游接口 / 协议 / 数据、已有决策、术语、执行行为与依赖、设计状态及额外机制的必要性。冲突先确认是否真实，比较双方目标、场景、约束和 ADR 依据；无明确变更授权时保留原有效结论，在现有冲突 / 未决章节记录双方依据、影响、解决方向和需确认的问题，不自行选边。可留给实现的细节说明其边界，不自动升级为架构阻塞。
4. **更新现行主题。**仅将明确确认的设计融入正确章节，同步流程、接口、示例、图示及跨模块引用；保持模块规范完整可独立阅读。澄清优先改原描述；候选保留候选身份，未决写入治理。明确替代的旧行为退出现行有效方案，追溯信息保留在演进 / 历史；搬迁遵守 `relocated_sections` 与内容保留检查。
5. **同步 ADR 与历史。**重要架构决策新增 ADR 或修订关联 ADR；旧决策被替代时保留旧 ADR、标记 `superseded`，用 `supersedes / superseded_by` 双向引用新旧决策，记录实际原因与权衡，同步现行主题。仅澄清或契约内实现细化通常不新增 ADR。历史按既有主题增量记录，不重构原讨论未出现的备选或理由。
6. **同步治理与术语。**检查 Open Decisions、Conflicts、Constraints 和 Glossary：新增 / 解决的问题、前置依赖、长期阻塞、冲突升级与全局约束影响应落在既有位置。已解决事项保留必要解决记录及决策引用，避免重复讨论；新术语或歧义同步 `CONTEXT.md`。
7. **复核状态与 Roadmap。**根据契约完整性及剩余关键问题，判断完成范围、可进入实现的范围、任务关闭、新阻塞及优先级 / 依赖变化。同步治理矩阵和既有任务，不简单追加任务；没有事实依据则保持状态不变，文字增加不等于设计进展。
8. **维护关联与来源。**核对稳定文档 ID、模块、状态、ADR、依赖、原始来源、跨文件链接和导航。优先由构建派生索引，不多处手工维护同一关系；只改受影响文件，避免格式化、重命名和无理由改号。
9. **构建并验证。**执行下方统一构建与 `--check`，协议样例变更另跑验证。检查结构、引用、导航 / 搜索、受影响页面、ADR 跳转、治理与状态 / Roadmap 同步；涉及呈现时检查代码块、表格和 Mermaid 的实际渲染。内容问题回改 Markdown，渲染问题修构建 / 阅读组件。构建无法执行时报告原因；结构校验不能代替浏览器渲染验证，未执行检查须明确列出。
10. **审查增量并报告。**检查 Git Diff；无 Git 时使用修改前快照或等效文件差异。确认无无关改动、技术内容丢失、意外语义变化、稳定 ID 改动、遗漏关联模块或候选提升为定论，确认 Markdown 与派生物同步。

收尾报告简洁列出以下项目，无变化标“无变化”，不强制创建报告文件：

- **讨论结论：**已确认新增、修改 / 替代、仅澄清、候选与待决策。
- **文档变更：**实际更新 / 新增 / 归档文件与原因；ADR 新增、修订、替代或关闭情况。
- **架构一致性：**新发现 / 已解决冲突、潜在影响及受影响模块。
- **设计状态：**完成范围、继续设计项、新阻塞及判断依据。
- **后续工作：**最值得继续讨论的主题、前置依赖和预期交付，建议不视为已确认决策。
- **构建结果：**Markdown、结构 / 链接 / 索引校验、HTML 生成、实际渲染检查及未完成检查与原因。

首次安装依赖与日常生成，在项目根目录执行：

```bash
python3 -m venv --system-site-packages .venv-docs
.venv-docs/bin/python -m pip install -r tools/docs/requirements.txt -r docs/validation/requirements.txt
.venv-docs/bin/python tools/docs/build_docs.py
.venv-docs/bin/python tools/docs/build_docs.py --check
```

协议样例变更后的验证：

```bash
.venv-docs/bin/python docs/validation/run_validation.py
```

阅读页共用 `tools/docs/reader.py`、`tools/docs/templates/document.html` 及 `docs/reading/assets/documentation.css` / `documentation.js`。`examples.css` 只补充样例布局；历史快照保留原有呈现，纯函数术语已统一，原始字节见历史来源包。仅改呈现时重新生成页面即可，无需重建协议数据。旧首页 `reading/index.html` 直接转到整体架构，不另维护一份首页正文。

L1 阅读入口在 `design/l1/README.md` 维护，编号 Markdown 各自生成独立 HTML。页面分组由 `navigation.group / order` 派生，下一步由 `reading_next` 引用文档 ID；顺序不依赖文件扫描。迁移章节在目标 Markdown 声明 `relocated_sections`，构建保留旧书签并检查原锚点、代码与图示能在原文件或声明目标找到。旧 L1 合并页只作按章节路由，不维护第二份正文。

架构图在 Markdown 的 `diagram` 代码块中维护节点、连接和说明数据，由 `tools/docs/diagrams.py` 生成共享风格的图形。这些数据仅用于文档呈现，不是 L1 协议字段；正文和图示中的职责、状态与演进关系需要同步维护。

## HTML 阅读系统与本地运行 {#reader-system}

统一构建命令为 `.venv-docs/bin/python tools/docs/build_docs.py`。它读取现行 Markdown、领域词汇和历史主题索引，校验元数据 / ID / 关联 / 决策替代 / 任务前置，然后生成全文索引、模块及治理记录、来源清单、共享 HTML 与协议样例页。原始 Markdown 不被构建修改。`--check` 不写文件，检查派生物同步、本地文件 / 章节链接、重复锚点和原有内容保留。索引 JSON / JS 都是生成产物，不能手改设计状态。

完成构建后，用一条命令启动本地服务：

```bash
.venv-docs/bin/python tools/docs/serve.py
```

打开 [架构首页](http://127.0.0.1:8765/docs/reading/architecture.html)。默认只监听本机 127.0.0.1；端口被占用可用 `--port 8766`，需要启动前重建可加 `--build`，Ctrl+C 停止。验收使用本地 HTTP；直接 file:// 是否允许本地脚本取决于浏览器策略，不作为已验证的跨浏览器承诺。搜索使用本地经典脚本索引，不依赖 fetch、后端或外部 CDN。

输出继续集中在 `docs/reading/`，验证图鉴在 `docs/validation/index.html`、历史入口在 `docs/history/index.html`。这些明确的既有输出位置复用共享模板；没有第二套 viewer/dist 或重复正文。静态图、Mermaid、代码高亮、宽表格、打印、浅 / 深色与窄屏导航均由共享外壳处理。

顶部搜索支持全文 / 标题 / ID / 关键词，并按文档类型、模块和声明状态过滤；结果包含所属文档、层级、片段和章节链接。搜索覆盖已编目的 Markdown 及其当前章节，包含 ADR、治理、术语和历史推导索引；不声称全文搜索 ZIP 或旧 HTML 的全部原文。搜索默认只检索当前设计，可显式切换到 ADR、历史或全部。Ctrl / ⌘ K 打开搜索。继续设计页末的可选工具按种类、模块、严重程度、前置决策阻塞和状态筛选，并提供两个模块的状态对照；筛选写入 URL，可保存具体问题视图。正文始终完整展示，可选工具位于页末。

独立阅读不要求先看 ADR。普通主题直接进入当前设计，页末给出下一步，右侧为本页目录、关联模块、ADR、文档 / 历史及来源；窄屏从“本页目录与关联”展开。原有 `diagram` 架构图不迁移为新的事实副本，放大只克隆同一渲染结果。Mermaid 支持 flowchart、sequenceDiagram、stateDiagram 等库支持语法；业务架构图沿用结构化 diagram，文档构建链使用 Mermaid，不推导新的业务调用关系。原资料无数学公式，本次没有引入公式引擎。

第三方静态依赖为固定的 Mermaid 11.12.1，来自 npm 官方包，只保留 `mermaid.min.js` 和 MIT 许可证，不执行包内安装脚本。文件位于 `reading/assets/vendor/`，SHA-256 为 `198b19442f86f0b46a17e56d3abf744c3a28a3427e66fa8dada3b589a77babcc`。YAML 使用 SafeLoader，Markdown 输出经 nh3 标签 / 属性 / URL 白名单清理，Mermaid 使用 strict 且禁用文档内配置指令，搜索与筛选用文本节点渲染结果；语法高亮由 Pygments 在构建时完成。实现依据见 [nh3](https://nh3.readthedocs.io/en/stable/)、[Mermaid 配置](https://mermaid.js.org/config/usage)、[Pygments](https://pygments.org/docs/formatters/)。

## 机器元数据与状态语义 {#metadata-contract}

知识文档 Frontmatter 的 `id / title / type / status / layer` 必填；title 与 H1 一致。ID 是稳定身份，文件重命名不改变 ID。`modules` 引用治理矩阵 M01–M19，`related` 分组引用既有 ID，`sources` 引用来源登记 SRC-*；一般阅读互链与自动反向链接允许成环，不当作架构循环。`supersedes / superseded_by` 如果使用，双方须一致；只对明确决策替代和路线图前置进行有向无环校验，不从普通文档链接猜测模块调用关系。

| 声明状态 | 唯一语义 |
| --- | --- |
| active | 当前有效文档；不代表文档所述全部接口或生产实现已完成 |
| accepted | ADR 所限定范围的决策已确认；局部推荐 / 待定内容须在 status_note 和正文保留 |
| proposed | 尚待确认的提议 |
| superseded | 已被明确后续决策替代，须有相应替代关系 |
| deprecated | 明确不再采用，未必有单一后继 |
| archived | 历史记录，不与现行规范并列生效 |

文档类型为 design / guide / protocol / decision / governance / source-map / glossary / history。这些值分类文档，不定义新业务领域。模块的已完成 / 部分完成 / 待设计 / 存在阻塞 / 状态未知来自[治理矩阵](design/governance.md#design-status)的显式“阅读状态”列；完成标准与限定范围仍在该行及说明中。冲突的 high / medium / info、open / explained、blocking 与模块关联在同一治理 Markdown 的 Frontmatter 记录，属于审查判断，不等于用户批准新方案。OD 的 A / B 分类与任务优先级、前置由原有表格派生；交叉验证不自动成为强制前置。

`navigation` 和 `reading_next` 只是阅读关系；`relocated_sections` 只声明内容搬迁，不代表架构决策被替代。修改 Markdown 后重新构建即可更新目录、全文、筛选、对照与关联。新章节必须使用可索引的 ATX 标题；显式锚点不能重复。新模块 / 新状态先在本段及校验规则定义，再更新相应正文，不手改 knowledge-index.json。内容摘要版本用于刷新缓存，不加入构建时间等无意义差异。

## 阅读系统验证 {#reader-verification}

构建会生成[结构校验结果](reading/assets/build-report.json)，列出实际文档 / 记录 / 来源 / 链接数量和检查范围，不写入时间戳。构建工具变更后运行：

```bash
.venv-docs/bin/python -m unittest discover -s tools/docs -p 'test_*.py' -v
node tools/docs/test_search.cjs
.venv-docs/bin/python tools/docs/build_docs.py --check
```

Python 测试覆盖元数据、引用 / 前置、正常互链、重复锚点、源码保留和不安全 HTML / URL / Mermaid 配置；Node 测试使用生成的真实全库索引检查跨文档搜索、组合过滤和阻塞条目。Node 只用于开发校验，日常构建和阅读无需 Node。

浏览器验收使用本地 HTTP：搜索 `Baseline` 并筛选 ADR，结果能进入 ADR-FE-008；治理选择 M11 / 高 / 存在阻塞得到 REV-02，REV-01 / REV-03 可在已说明差异且非阻塞的筛选中找到；模块对照保留“可进入的工作”；代码复制显示反馈；Mermaid 图及其放大视图正常。页面主题、目录与来源链接复用同一外壳。上述验证只涉及文档阅读系统，不能证明表单 Runtime、Prepared ABI 或跨端实现已完成。

设计者路径验收另覆盖：整体架构→能力图谱→L1 独立主题；桌面与窄屏分层导航；搜索默认隔离历史；旧协议 / Trace 书签迁移到当前能力。分层说明中的原模型、代码和图示继续通过来源保留检查。
