---
id: HISTORY-FE-001
title: 历史归档与收敛记录
type: history
status: archived
layer: 跨层
modules: []
tags: []
related:
  decisions: []
sources: []
navigation:
  group: 09 · 决策与追溯
  order: 160
last_reviewed: '2026-10-19'
---

# 历史归档与收敛记录

历史文件保留当时的结论与候选方案，不与当前定稿并列生效。当前 L1 唯一依据是 [V1.0 架构与语义定稿](../reading/l1-definition-protocol-v1.html)。

## 按主题追溯设计演进与本次知识重构 {#architecture-knowledge-review}

2026-10-19 的架构知识重构沿用现行主题，保留原有技术正文、代码、完整架构图和稳定锚点，新增独立 ADR、跨主题审查与设计路线、来源清单。没有采用新的运行机制、没有替用户解决未决方案，也没有把候选工具改称生产实现。审查判断见[治理篇](../design/governance.md)，逐结论来源见[K01–K31](../design/source-map.md#conclusion-map)。下表把本页的日期归档转为按问题检索的演进链，不替代原件。

| 主题 | 可追溯演进：背景 → 转折 → 现行结论 | 决策记录与来源 |
| --- | --- | --- |
| 核心与外部能力 | 早期 Resource / 通用 Capability → 第三组移交外部请求与业务流程 → 四层表单核心 + Host 三路径 | [ADR-001](../design/decisions/ADR-FE-001-boundaries.md)、SRC-EARLY / SRC-L1 |
| 可分析的语言 | 多种可执行配置与 Scope 表候选 → 纯 AST / ValueSpec / 局部 Binder → 结构化引用与受控命令；机器 Union / 签名继续固化 | [ADR-002](../design/decisions/ADR-FE-002-static-language.md)、SRC-L1 / SRC-L2 |
| 视图与呈现 | Root / Fragment / Presentation / ValidationMetadata 重叠 → 三节点 / 静态模板 / 容器物料 → Profile 直接 ViewNode，bindings / slots 唯一 Canonical | [ADR-003](../design/decisions/ADR-FE-003-view-material.md)、SRC-L1 |
| 编译入口与触发 | 原始 / Prepared 双轨候选、读取易被误作触发 → V0.1 区分依赖 → V0.5 唯一 Prepared、作者确认 Watch 建议 | [ADR-004](../design/decisions/ADR-FE-004-prepared-entry.md)、[005](../design/decisions/ADR-FE-005-watch-subscription.md)、SRC-DEP / SRC-V05 |
| 数据修改与收敛 | 早期候选树 / 整体原子 Batch、每次触发独立执行 → V0.4 即时非原子修改、最新态合并 → V0.6 逐 Command Data / Scope 比较 | [ADR-006](../design/decisions/ADR-FE-006-command-flush.md)、[007](../design/decisions/ADR-FE-007-scope-comparison.md)、SRC-V04 / SRC-V06 |
| 编辑与恢复 | 早期 Reset 候选 → V0.6 Runtime 自动基准及当前环境重算 → 用户明确撤回，业务 Baseline / Dirty / Reset 归 Host | [ADR-008](../design/decisions/ADR-FE-008-host-editing.md)、SRC-V06 / SRC-HOST；修订摘录不冒充完整逐字会话 |
| 错误与追踪 | V0.4 隔离 / 局部 Health 待选 → V0.5 可隔离命令继续、整体 Flush 熔断、临时线性 Trace → Pending / 异常提交仍未闭环 | [ADR-009](../design/decisions/ADR-FE-009-errors-trace.md)、SRC-V04 / SRC-V05 |
| 校验与完备性 | 被动 Issues-only 候选 → 第五组义务 / 有效性 → V0.7 完整 Schema / 本轮链 / 字段聚合；严格前置与增量兼容仍待验证 | [ADR-010](../design/decisions/ADR-FE-010-validation.md)、SRC-L1 / SRC-V07 |
| 能力与发布 | 通用能力分类 → Material / Pure Function / Host 分责 → 双构建链、不可变 Release 与独立 ABI；锁字段与兼容未冻结 | [ADR-011](../design/decisions/ADR-FE-011-release-lock.md)、SRC-L2 / SRC-V05 |

[本次修改前来源包](2026-10-19-architecture-review-sources.zip)保存 22 份源文件，路径以 `before-architecture-review/` 开头，SHA-256 为 `33ef0fe7198c96f40d5b6b3cd75e62acd9e23685df9a47594fc92b32207cebe5`。原有来源包与历史副本未改写；此 ZIP 是本次整理前快照，不冒充用户原件。可重复盘点与内容保留检查见[来源维护](../design/source-map.md#incremental-coverage)。下文各轮统计仍只代表当时检查点。

## Validation 校验引擎 · V0.7 整合 · 2026.10.19 {#validation-v07-integration}

用户提供的《L3 Validation · 校验引擎阶段设计归档 V0.7》共 18 章，形成 [L3 校验执行、结果与字段订阅](../design/l3-validation.md) 主题正文，与原 L3 数据 / Scope / Flush 主题互相引用，统一放入既有侧栏。两份指南、整体交互图、L1 校验与生命周期、L2 校验准备、跨层依赖、词汇和验证边界已同步。本次是设计归档，不是生产实现或新的 L1 Protocol Version。

[19 项决策总账](../design/design-history.md#validation-decisions) 保留来源编号、标题、说明和状态：8 项已收敛、5 项推荐实现、6 项待验证；[V01–V16](../design/l3-validation.md#validation-acceptance) 保留原 16 个案例作为后续验收。来源“已收敛”不表示接口冻结。D06 记录严格本轮缺失前置时诊断并跳过的倾向，D14 仍要求验证仅后置入 Pending、前置已有旧有效结果的增量行为；二者同时保留，不自动补齐、不借归档替用户决定。

| 来源章节 | 现行位置与保留内容 |
| --- | --- |
| 01 核心结论 | 校验目标 / 状态；两份指南；完整 Schema + 本轮 Constraint + 字段聚合主线 |
| 02 能力边界 | 校验不写 Data、不回滚输入、不接管 Dirty / Touched / 真实提交 |
| 03 收敛或废弃 | 跨层交付与取舍；完整 Schema、本轮整理替代局部 Keyword 引擎 / 结果 PubSub / 通用 DAG |
| 04 业务故事 | 联系人导入 → C1 证件规则 / C2 身份核验 / C3 独立年龄规则 → 字段结果 |
| 05 Schema 与 Adapter | 完整资源、编译函数复用、不改 Data、Web / Dart 契约与性能验证 |
| 06 增量触发 | 复用现有索引；根 Schema 待校验标记、Constraint Pending 去重；不二次扫描全部规则 |
| 07 本轮链 | 前置存在性、重排序、实际通过检查与独立任务继续 |
| 08 四种推演 | 正常、乱序、缺前置、前置失败；统一正文表格保留四种输入与结论 |
| 09 最小算法 | 仅本轮集合的缺失剔除与稳定选择；临时入度优化方向；不暗含异步 DAG |
| 10 Result Store | 按 Source 替换、字段派生；Scope 映射、容器 / root Issue |
| 11 消息一致性 | 覆盖 → 平台模板 → 回退；required 目标归一化；候选 validationMessages 未发布 |
| 12 字段订阅 | 聚合内容比较、同步原子替换、异步撤销、移动 / 删除与交互归属 |
| 13 异步与前置 | 实例代次、输入与 Scope 保护；成功 / 异常均核对；复杂业务封装同一 External |
| 14 增量 / 完整校验 | 全部适用规则、必要外部义务、valid / invalid / incomplete / stale 语义与当前输入证明 |
| 15 跨层职责 | L1 / L2 / L3 / L4-Host 对象关系；正式 requires / PreparedValidation / Issue 仍待固化 |
| 16 决策总账 | 19 项来源状态逐条保留，增加现行处理，编号不与其他来源混合 |
| 17 验收案例 | V01–V16；严格缺失的业务结果不预填通过 |
| 18 后续议题 | 优先验证增量前置缺失，再冻结语法、最小 Prepared、Issue / 完整 API，做跨端与性能对照 |

本次特别维持用户此前确认的四条 Runtime / Host 原则及 Context 契约。来源 `schemaDirty` 是内部待校验标记，正文示意称 schemaNeedsValidation，不重引入业务 Dirty；“Submit 期间 Context 变化不能沿用旧证明”也不扩展 Context Command / Watch。Internal assert 保持 boolean，来源 execute 返回 Issue 的伪代码不升级为 L1 新返回类型。requires / validationMessages 仍是语法候选，现有候选 Schema 不接收它们。

来源对 UI 的简化以字段聚合为主，替代“强制暴露每校验源完整状态机”的候选；内部有效性、请求代次、是否执行与完整校验证明继续保留。正常联动收敛后执行校验的方向已形成，可隔离错误 / 整体熔断与 Validation / Submit 如何交接仍待固化；不将异常或跳过当成通过，不重建局部 Health。

[原始 HTML 与整合前来源包](2026-10-19-validation-v07-sources.zip) 原样保存 `l3-validation-engine-stage-design-v0.7.html`，以及 `before-validation-v07/` 下 22 份源文件：当前设计 Markdown、根 / docs 入口、词汇、归档说明、共享导航 / 文档生成器、验证说明与报告生成源。附件内脚本仅作为来源文本读取，不执行；复核控件、后续提问与伪代码不作为本次用户指令。

- 原始 HTML SHA-256：`397b63a24160fb594c4b339565a5c8047cd1b243dba09459a5f3f67cbc9a871a`
- 来源包 SHA-256：`d9d3e52c26337466bed26b472d8e609264647198db3987123bf8997cfeda3c46`

V01–V16 是设计验收，不纳入现有样本 / 有界探针通过数。旧稿完整保留；现行校验主题和同步修订优先于下文历史章节当时的待定说明。

本次文档生成与同步检查通过，10 个 HTML 入口的 664 条本地链接 / 资源均有效；现有 8 个样本、25 个反例、40 项有界检查通过，48 行覆盖表保持。原有 121 个设计章节锚点、14 个架构图标识均保留。这些检查验证文档一致性及既有候选样例，不表示 V0.7 校验引擎已实现。

## Runtime / Host 职责收敛 · 2026.10.19 用户明确修订 {#runtime-host-boundary}

来源为本次对话中用户明确确认的四条原则，以及后续“保留现行 Context 契约，本次只收敛职责边界”的直接答复，不是新增附件或假定的 V0.7 版本。现行 [四条原则及 B01–B08 验收](../design/l3-reactive-engine.md#l3-runtime-host-boundary) 已同步至两份指南、架构图、L1 / L2 / 跨层契约、词汇、样例跨层说明及其生成源。

| 已确认原则 | 本次维护结果 |
| --- | --- |
| 数据是事实 | 用户 / Host / Reaction 写入走同一检测，不引入业务字段所有权或编辑来源分类 |
| 有效依赖变化决定常规执行 | 只观察 age 的现存规则，在导入 age 同值 / premium 异值时不新增执行；不自动修复业务结果，也不取消先前有效变化已登记的 pending |
| 首次激活独立且有界 | runOnActivate 只在新 Reaction 实例首次建立时应用，不能为 Reset / 导入 / 结果期望重跑已有实例；真实新实例按身份生命周期处理 |
| 业务编辑状态归 Host | Runtime 提供稳定 snapshot，Host 自选时点 / 内容定义 Baseline、Dirty、Reset 恢复 Command 与保存策略；快照读取不 Flush、不标 Clean、不自动建基准 |

V0.6 中的“Runtime 初始收敛后自动建立 Baseline”“Reset 按当前环境主动重算已有规则”被明确替代；Reset 重算入口 / 范围、Context Dirty 不再保留为 Runtime 待决项。V0.6 D07 / D08 / D21 / D22 仍保存来源标题、说明和当时状态，增加现行处理说明；场景 15 / 16 按当前职责修订，原断言在来源包保留。R26 和 L1 修订记录同步演进，原整体图、章节锚点与跨层说明继续保留。

Context 在本次没有扩展：L1 Command 只写 Data，Reaction.watch 仍为 DataReference[]，Context 由 Host 提供并对表达式只读。受控状态订阅草图也不自动扩展为新的 Context Command / Watch。稳定 snapshot、完成观察、激活默认值、真实实例建立 / 替换、错误和 ABI 继续按工程契约固化，不等于业务基准重回 Runtime。

[决策摘录与整合前来源包](2026-10-19-runtime-host-boundary-sources.zip) 保存 `user-confirmed-runtime-host-boundary.md`（明确标为对话决策摘录，不冒充完整逐字原始消息），以及 `before-runtime-host-boundary/` 下的 22 份来源：全部现行设计 Markdown、根 / docs 入口、词汇、归档说明、验证说明、手工 walkthroughs 源、覆盖与展示生成器。来源包 SHA-256：`3747dd6efe29190e3954877b67f82820120241ac9c7c70523ba684d61ab98222`。

本次不实现生产 Runtime 或 Host 编辑框架。B01–B08 是设计验收，不纳入现有候选探针通过数。下文 V0.6 / V0.5 等章节记录当时整合结论；本次明确修订优先，旧文件与来源包不改写。

## 数据变更、依赖索引与 Scope · V0.6 整合 · 2026.10.19 {#data-scope-v06-integration}

用户提供的《L3 Runtime · 变化检测、依赖 Trie 与 Scope Index · 决策归档 V0.6》共 20 节，已归入现有 [L3 数据变更与 Scope 正文](../design/l3-data-scope.md#l3-change-detection)，并同步两份指南、L1 激活 / 生命周期 / Scope、L2 路径模板与计划、跨层观察、词汇及验证边界。继续使用既有阅读外壳与侧栏，没有另建轮次规范、摘要或索引页。

[25 项决策](../design/design-history.md#l3-v06-decisions) 完整保留来源 D01–D25 的编号、标题、说明和已确认 / 推荐 / 待讨论 / 实现验证状态；[16 个端到端场景](../design/l3-data-scope.md#l3-v06-acceptance) 保留为设计验收。来源正文虽把 Object.is 等列在“已收敛具体结论”中，本次依据决策表保留其推荐状态，不提升为冻结公共契约。交互演示中的 Move 三类观察及一 Operation 三 Command 轨迹已转入现行统一阅读正文；本地复核控件和后续议题建议不构成额外用户指令或确认。

本轮确认每条 Command 临时保留前后不可变 Root，一致提交 Data / Scope 后定位候选并比较逻辑观察值；Scope Index 存父级相对位置，绝对路径按需解析，旧 ScopeChange 不进入 pending 或沿链传播。首次激活策略可配置、初始 Reaction 正常收敛后建立 Baseline、Reset 按当前环境重算已确认，推进 V0.5 的相关生命周期未决事项；精确字段默认值、initialize API、Reset 主动重算范围 / 入口和 Context 改变后的 Dirty 仍待固化。

Trie / 模板组合、Object.is / 存在性比较、临时前后 ScopeReadView、整数组替换默认重建和位置型匹配仍为推荐；局部保存形式、共享对象输入防御和索引真实性能为实现验证。新增 Scope Registry 是 L3 实例登记，不恢复 L1 全局 Binder 注册表。候选 `runOnActivate`、Prepared activation 示意、通配路径与 length 节点不冒充已经冻结的 ABI 或新的 L1 Pointer；首次执行策略与观察生命周期归属分别说明。

| 来源章节 | 现行承接位置 |
| --- | --- |
| 01–03 总结、业务故事与四层责任 | L3 基线、四种业务情景；整体架构、使用指南；L1 / L2 职责 |
| 04 初始化、首次激活与 Baseline | L3 初始化 / Reset；L1 生命周期与激活策略；L2 编译；旧 R26 标明进展 |
| 05–07 单 Command、观察相等与旧值 | L3 变化链路 / 观察粒度 / 前后 Root；架构修改图与状态所有权 |
| 08 Trie 候选与路径模板 | L3 Dependency Index；L2 Prepared 模板；跨层候选后比较，不固化实例 Trie ABI |
| 09–11 相对 Scope、移动语义与 ReadState | L3 Scope Index / 临时旧位置；L1 Scope；View / Host 共同解析 |
| 12 数组生命周期 | L3 操作表；现有成员替换与整数组重建推荐的区别；新实例激活 |
| 13 数据观察与执行事件 | L3 消费者表；跨层订阅与共同匹配，执行事件不进入 Data Trie |
| 14–16 多 Command、Flush 衔接与骨架 | L3 三条命令轨迹、检测伪代码、Trace / 熔断继承边界 |
| 17–20 精度性能、验收、总账与下一步 | L3 25 项来源状态 / 16 场景 / 实现边界；指南、L1 待固化与本归档 |

“打开异步历史单、联系人对象导入、移动嵌套被保人、费率更新后 Reset”四个来源情景均保留。Baseline、当前 Command 的短暂旧 Root、Flush Trace 分别解释；不按用户 / Host / Reaction 来源改变匹配，也不引入派生字段所有权、局部熔断或父子规则控制。旧候选继续保存在既有来源包，不因本次归档抹掉设计理由。

[原始附件与整合前来源包](2026-10-19-data-scope-v06-sources.zip) 包含未修改的 `l3-data-change-dependency-index-scope-v0.6.html` 和 `before-v06-integration/` 下的 20 份来源（全部现行设计 Markdown、根 / docs 入口、词汇、归档说明与验证说明 / 展示生成源）。原始附件 SHA-256：`b05d302a2a834fc047e81aaffbdabc30477b5d1de7411f1cf23601b800ba179b`；来源包 SHA-256：`06b0cd4c01980bb4b26a172b8818a462084a252ed6d892d31ccf379c00b1339c`。

本次只整合设计和生成阅读视图，没有实现 Trie、Scope Registry、变化检测、激活策略、Baseline / Reset 或执行事件 API。现有候选探针统计不包含这些 16 个新场景；下文旧归档状态只表示当时结论，当前主题与本次明确进展优先。

## 原始 / 编译后协议与 Watch / Runtime · V0.5 整合 · 2026.10.19 {#protocol-runtime-v05-integration}

用户提供的《L1–L2–L3 原始协议与编译协议 · Watch / Runtime 阶段归档 V0.5》原标日期为 2026.10.18，本次于 2026.10.19 整合。19 节内容分归现有 [跨层协议与依赖专题](../design/dependency-reactivity.md#dependency-compiled-protocol)、[L2 编辑 / 编译 / 发布](../design/l2-preparation.md#l2-authoring-diagnostics) 与 [L3 执行契约](../design/l3-reactive-engine.md)，同步两份指南、L1、架构图、词汇与验证说明，不新增平行阶段规范或阅读样式。

V0.5 的 [D01–D22 决策](../design/design-history.md#dependency-v05-decisions) 保留全部来源编号、标题、说明及已确认 / 推荐 / 待确认 / 实现阶段状态；[01–12 跨层场景](../design/dependency-reactivity.md#dependency-v05-acceptance) 保留为未来设计验收，不计作现有探针通过。来源中的浏览器复核勾选仅表示本地阅读进度，后续路线是建议，均不构成额外用户指令或状态确认。

这次明确的替代关系：L3 只消费兼容 PreparedForm；显式 Reaction.watch 由作者最终确认，编译建议经修改 L1 后重编生效；可隔离单 Command 错误继续后续独立行为，实际 Data Change 决定其他规则响应；预算超限统一中止整个 Flush。V0.4 的局部不可信范围、跨轮 Health、失败下游禁用与链级恢复被替代，当前文档不继续要求这些机制；原正文完整保留。L3 的 R12 / R14 / R15 等标明演进，C17 从局部 Health 断言改为整体熔断后 Pending / 再触发验收，不把旧要求与新决策并列。

缺失、null、空字符串、0、false 分别处理，业务 when / Pure Function 表达跳过或清空派生值，不建立通用 Reaction Ready 状态机。初始化 / 新 Scope / Reset 首次执行、通知重入、准确排序、整体熔断后 Pending 与 Validation / Submit 完成边界仍待固化；Source Map 与编辑增量是推荐，ABI / 预算 / Devtools API 为实现阶段工作。

| 来源章节 | 现行承接位置 |
| --- | --- |
| 01–02 双结构与唯一执行路径 | 跨层原始 / 编译后协议；L1 表示形式；架构总图与 L2 边界 |
| 03–05 Reaction 编译例、显式 Watch、编辑闭环 | 跨层 Canonical 片段与计划 / 诊断对照；L2 作者确认与发布检查；使用指南 |
| 06 静态编译边界与兼容 | L2 编译输入输出；静态 Scope 计划 / L3 实例；ABI 失败不回退 |
| 07–08 即时更新、合并与独立执行 | L3 Flush / Reaction / Command 错误；L1 Command；架构修改流程图 |
| 09 初始化、缺失与清空 | L1 Data / 生命周期；L3 缺失值；使用指南 |
| 10 整体熔断 | L3 异常与轮次结果；旧 Health 替代说明；L1 / Readiness 衔接 |
| 11–13 Trace / 生命周期 / 判环 | L3 线性记录、Command 结果、首次入队建 Context、报告 / Devtools 与保护；L2 Source Map |
| 14–15 取舍与修订 | 架构决策、L3 跨层修订表、L1 修订记录与本归档 |
| 16–19 总账、待确认、验收与后续 | 跨层 22 项决策 / 12 场景；各层未决状态与生命周期验证路线 |

来源中字符串 Reference 是 Authoring 示意，现行展示改用 Canonical `{source, path}`；Prepared 与诊断草图只表达信息需求，不当作正式 ABI。阶段版本 V0.5 不冒充新的 L1 Protocol Version。平台继续管理能力资产与不可变 Release，L2 在产物关联锁定能力，不因附件简写而接管平台治理。

[原始附件与整合前来源包](2026-10-19-protocol-runtime-v05-sources.zip) 保存未修改的 `l1-l2-l3-definition-prepared-watch-runtime-v0.5.html` 和 `before-v05-integration/` 中的 20 份来源（全部现行设计 Markdown、两级维护入口、词汇、归档说明及验证说明 / 展示生成源）。原始附件 SHA-256：`d72b36733378de21023232ce287f501120ed892b534a44e2d0aec69db3e4b78a`；来源包 SHA-256：`5c226e760b168a431420593b4bbd60ea95b31b06123f6ce0c6268150b32c6858`。

本次只整合设计与阅读视图，未实现编译器、Prepared ABI、Runtime、错误执行器、Flush 或适配器。下文旧归档记录当时状态，现行正文及本次明确修订优先。

## L3 Flush / Trace 决策整合与两份指南 · 2026.10.18 {#l3-integration}

用户提供的《L3 Reactive Engine · Flush / Trace / Diagnostics 完整决策归档 V0.4》20 节，已整合为 [L3 现行专题](../design/l3-reactive-engine.md)，完整保留 R01–R26 的来源状态与 C01–C18 的设计验收，以及四种执行轨迹、跨层修订、取舍和未决路线。来源中的个人复核 UI 和会议建议不视为新的用户指令或已确认结论。

本次同步整体架构、L1 Command / Reaction / Readiness / 生命周期、L2 风险分析、依赖订阅与词汇。现行设计选择即时不可变数据更新、batch 默认非原子、Reaction 最新状态合并、延迟启动同步 Flush 与临时事实追踪，取代相关旧候选；错误隔离与恢复、通知重入、排序、Trace 细节及 Submit 异常范围保持未决。

整体阅读分为 [使用与开发指南](../design/usage-guide.md) 与 [设计者指南](../design/architecture.md)。后者延续原整体架构文件与稳定锚点，保留完整分层、模型、依赖、修改流程及 Host 图示和各层设计说明；前者从实际场景渐进解释。L1 / L2 / 跨层依赖 / L3 / 样例继续作为详细契约和证据，共用既有外壳与侧栏，不复制两套正式规范。

| 来源章节 | 现行承接位置 |
| --- | --- |
| 01–03 总览、术语与状态归属 | L3 基线 / 所有权；词汇嵌入设计者指南 |
| 04–05 数据不变量与 batch 修订 | L3 数据；架构 State Store / Command；L1 Command |
| 06–09 Flush、归属、合并与轨迹 | L3 Flush / Reaction / 四种轨迹；依赖订阅时序 |
| 10–11 保护、异常与恢复 | L3 保护 / 错误；L2 Watch / Write 风险；Readiness |
| 12–14 Trace、预算、参数和事后分析 | L3 Trace / 预算 / Devtools；架构 Tooling |
| 15 消费者与 Submit | L3 消费者；L1 校验和生命周期；指南接入 |
| 16–17 跨层影响与取舍 | L3 修订表；架构图文、决策与路线 |
| 18–20 总账、验收与后续路线 | L3 R01–R26、C01–C18 与下一步；状态未升级 |

[原始附件与整合前来源包](2026-10-18-l3-flush-sources.zip) 保存未修改的 `l3-reactive-engine-flush-trace-v0.4.html` 和 `before-l3-integration/` 下的 17 份来源文件（既有设计 Markdown、维护入口、词汇、归档说明和阅读生成器）。附件原始 SHA-256：`623d0e5c8fcf327fe6cc3054d6ba484fbc4b2f2f641b3643969a73d869110d2c`；来源包 SHA-256：`2c1ce7a76ef1b89ae33be214901e57f00079b0184a53ec408451a9e78dee20ba`。

本次为设计与阅读组织整理，没有实现生产 Runtime、Flush、Health、Trace 或框架适配。以下历史中的调度未决及候选机制，只记录当时状态；现行主题正文优先。

## 跨层依赖与响应式订阅模型整合 · 2026.10.17 {#dependency-integration}

用户提供的《L1–L4 跨层依赖编译与响应式订阅模型 · 架构设计 V0.1》共 23 节，按概念、L1 使用位置、L2 编译 / Scope、L3 观察、L4 生命周期、时序、验收与决策整合至 [现行跨层专题](../design/dependency-reactivity.md)，并同步整体架构、L1 / L2、词汇与验证样本。专题复用共享侧栏与文档外壳，术语并入架构，不保留第二套现行索引或独立样式。

本次采纳 External `dependsOn` → `watch`，保留 Reaction 显式触发边界；L2 统一计划、L3 统一匹配、L4 按挂载激活。来源中的 flush、计划字段、状态编码、View 粒度与调度选项保留候选状态。External Payload 目前不是 L1 字段，运行时 Validation / Field Meta 观察不扩展 L1 Reference。旧事务图同步说明匹配与交付的边界，保留完整层级、模型、事务与 Host 设计。

[原始附件与整合前正文包](2026-10-17-dependency-reactivity-sources.zip) 包含未修改的 `l1-l4-dependency-reactivity-v0.1.html`，以及 `before-dependency-reactivity/` 中的 13 份 Markdown 来源。原始附件 SHA-256：`c6a5c94bbe6306adce553baac231cd30f39017cb422b676deccc39ffdfa65e23`；来源包 SHA-256：`19810c3779f1e42c4444177764e7dcf64e04cebe6ccee44e8741b4a3af53051b`。

本次仅固化设计与候选样本形态，不代表 Dependency Plan 编译器、生产订阅、调度或框架适配已实现。以下旧统计和结论仍是当时的历史检查点，现行设计与实际验证报告优先。

## L2 决策整合与 Pure Function 术语统一 · 2026.10.17 {#l2-integration}

用户提供的《L2 Preparation · 平台能力治理与编译发布架构 · 决策归档 V0.1》共 21 节，已整合为 [L2 现行设计](../design/l2-preparation.md)。整体架构同步补充平台 / 编译器 / Runtime 分工、Manifest、Host 注册、能力构建与 Definition 编译、版本锁定、依赖边类型和验收路线；L1 同步纯函数能力边界与修订记录。

本次架构决策将能力类别统一命名为 **Pure Function（纯函数）**。现行 Markdown、图示、协议说明、样例生成源与可阅读历史副本均同步术语，相关历史文件名、链接及测试 Manifest 改用 `pure-function` / `pure-functions`。L1 的 `op + args` 字段保留，字段与内置短 ID 迁移不混入本次改名。

为保留证据，[原始来源包](2026-10-17-decision-sources.zip) 保存以下内容的原始字节；下载附件未修改：

- `l2-preparation-platform-capability-v0.1.html`：本次 L2 用户来源原件。
- `before-pure-function-terminology/`：术语统一前各历史目录的 Markdown / HTML 与既有 V1.0 来源阅读文件；阅读副本保留当时布局和设计状态，仅同步术语与链接。

L2 原件 SHA-256：`10a5c35ce07fdaa981c43a2f1829b46688455cce018bd3be813bea51252acbc0`。

来源包 SHA-256：`8b49c9ed942f2f34162adb373323bacf6adaeb4c5128dea27c3ae9a7a8a4ee55`。

下文的“原样”与旧统计描述当时的归档检查点；若需逐字复核，读取来源包。原始验证 ZIP 继续保持不变并由验证入口核对摘要，不是现行术语文档。

## 2026.10.16 · 定稿归档与文档收敛 {#consolidation}

根目录 HTML 从 11 份收敛为 3 份：首页、整体架构、L1 定稿。移除重复维护的主台账、能力清单、设计草稿和六轮专题入口，保存最后同步版供追溯。

最终决策覆盖旧结论：Canonical 为 bindings / slots；模板采用 schemaRef + DataReference；取消独立 ValidationMetadata DSL 的倾向；生命周期基线语义确认。下一步改为 Type / Schema / 正反例验收，不再将 Material Validation Metadata 单列为 L1 前置设计。

定稿的 32 节正文与来源一致，保留完整保险示例、简单示例、修订史与发布清单。架构冻结与正式规范发布的状态分开记录。

归档检查：32 节定稿正文与用户来源逐节一致；659 个 HTML 链接/资源路径与锚点、50 个 Markdown 文件链接检查通过，未发现重复 ID；19 个 JSON 值解析通过。当前 HTML 为 3 份，其余均位于历史目录。此为静态文档检查；浏览器工具限制 file:// 页面，未完成视觉预览。

## 验证包归档与图鉴补充 {#archive-2}

原始 l1_protocol_validation 完整保留为 [来源 ZIP](l1-protocol-validation-source.zip)；01–05 Definition 与 Fixture 原样，新增 06–08 演示多级联动、日期/地区规则与命令/事件边界。

[样本图鉴](../validation/index.html) 集中图示与 48 项能力覆盖，不按讨论轮次新增主体文档。原包绝对路径改为相对定位，并复用现行定稿的保险基线；原始来源摘要和可复现检查见 [机器报告](../validation/report.json)。8/8 样本、22/22 反例、6+34 项抽测通过；未完成项继续明确标识，不改变 L1 架构定稿状态。

## 样例阅读形式调整 {#archive-3}

根据阅读反馈，验证附件改为协议定义优先，每个事例按顶层模块横向排列卡片，完整展示 FormDefinition，不再以局部片段代替。移除仿真表单、输入框及组件预览；用词法结构树和具体触发/计算/修改流程说明关系。数据前后对照折叠为举证，保留原协议、覆盖表与验证结果。

[阅读协议样例](../validation/index.html)

## Profile 与定义信息修订 · 2026.10.16 {#profile-revision}

现行所有规范、示例、类型关系、候选 Schema、校验器、覆盖 Pointer 与结构图统一采用 views: Record&lt;string, ViewNode&gt;。移除无独立语义的 entry 包装，保留具名 Profile 选择与 slots.default 插槽。metadata 与协议标识、版本合并在“定义信息”卡片，不新增 basicInfo 域。

原始归档、ZIP 和上文统计是历史检查点。现行 01–05 Definition 仅做确定的包装迁移，Fixture 不变；8/8 样本、23/23 反例和 40 项有界检查通过。旧 entry 包装新增为反例，不再被 Canonical 校验接受。

## 来源与过程记录 {#archive-5}

- [V1.0 用户来源阅读副本](2026-10-16-v1-final-original.html)（纯函数术语已统一；术语统一前字节见上方来源包）
- [定稿前完整快照说明](2026-10-16-before-v1-final/README.md)
- [历轮集成日志](2026-10-16-before-v1-final/changes-2026-10-16.md)
- [历轮一致性检查记录](2026-10-16-before-v1-final/consistency-review-2026-10-16.md)
- [第一至三组来源原稿](2026-10-15-round-originals/README.md)
- [第四至六组来源原稿](2026-10-16-round-originals/README.md)
- [最初架构历史快照](2026-10-14/README.md)

### 定稿前 11 份 HTML 快照

- [l1-definition-decisions-and-roadmap.html](2026-10-16-before-v1-final/l1-definition-decisions-and-roadmap.html)
- [index.html](2026-10-16-before-v1-final/index.html)
- [l1-round05-form-lifecycle-validation-submission.html](2026-10-16-before-v1-final/l1-round05-form-lifecycle-validation-submission.html)
- [l1-definition-design-draft.html](2026-10-16-before-v1-final/l1-definition-design-draft.html)
- [l1-round03-behavior-reaction-command.html](2026-10-16-before-v1-final/l1-round03-behavior-reaction-command.html)
- [l1-round02-expression-pure-function-constraint.html](2026-10-16-before-v1-final/l1-round02-expression-pure-function-constraint.html)
- [l1-round01-data-value-reference-scope-binding.html](2026-10-16-before-v1-final/l1-round01-data-value-reference-scope-binding.html)
- [complex-dynamic-form-architecture-v1.html](2026-10-16-before-v1-final/complex-dynamic-form-architecture-v1.html)
- [l1-capabilities-and-abstraction-boundaries.html](2026-10-16-before-v1-final/l1-capabilities-and-abstraction-boundaries.html)
- [l1-round06-definition-protocol-convergence.html](2026-10-16-before-v1-final/l1-round06-definition-protocol-convergence.html)
- [l1-round04-view-profile-material-interaction.html](2026-10-16-before-v1-final/l1-round04-view-profile-material-interaction.html)

历史台账记录的 V1.0 初始用户来源 SHA-256：`de1dce61f695e45d7a2a4355448b08a0fbc8f8c59fb0e0040c45abe28bd63593`。该记录不等同于既有站内阅读副本摘要；本次来源包保存的术语统一前副本 SHA-256 为 `bb93e9e90e5f251c20f9d3bf1a1f1a7023cde2f1d25d723a8233bdeacde0a510`。
