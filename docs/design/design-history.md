---
id: HISTORY-DESIGN
title: 设计决策与讨论演进
type: history
status: active
layer: 追溯
modules: []
tags: []
sources:
- SRC-EARLY
- SRC-L1
- SRC-L2
- SRC-DEP
- SRC-V04
- SRC-V05
- SRC-V06
- SRC-HOST
- SRC-V07
related: {}
last_reviewed: '2026-10-20'
navigation:
  group: 09 · 决策与追溯
  order: 100
relocated_sections:
- source: docs/design/architecture.md
  anchor: decisions
  target: decisions
- source: docs/design/architecture.md
  anchor: roadmap
  target: roadmap
- source: docs/design/l1/08-decisions-release.md
  anchor: history
  target: history
- source: docs/design/l1/08-decisions-release.md
  anchor: tradeoffs
  target: tradeoffs
- source: docs/design/dependency-reactivity.md
  anchor: dependency-decisions
  target: dependency-decisions
- source: docs/design/dependency-reactivity.md
  anchor: dependency-v05-decisions
  target: dependency-v05-decisions
- source: docs/design/l3-reactive-engine.md
  anchor: l3-impact
  target: l3-impact
- source: docs/design/l3-reactive-engine.md
  anchor: l3-decisions
  target: l3-decisions
- source: docs/design/l3-reactive-engine.md
  anchor: l3-v06-decisions
  target: l3-v06-decisions
- source: docs/design/l3-validation.md
  anchor: validation-decisions
  target: validation-decisions
---

# 设计决策与讨论演进

本篇专门回答“为什么这样设计、曾考虑什么、后来改变了什么”。直接理解当前方案不需要先读本篇；完整行为在各层设计维护，独立 ADR 记录重要取舍。

## 讨论标记的含义 {#discussion-markers}

原始来源中的 V1、V0.4、V0.5、V0.6、V0.7 等仅是讨论材料的原始标签，用于精确追溯；不是本文档、引擎、SDK 或已发布协议的版本。本项目仍在设计讨论与开发准备中，不据这些标签推导发布或兼容关系。这里保留原标签和来源编号以免失去证据。

真实制品的兼容、锁定和迁移是另一项架构议题，当前仅有部分原则，不能据讨论标签认定已经存在生产发布。方案状态变化必须有明确依据；新讨论也不会自动覆盖已有共识。

## 架构决策与原稿演进 {#decisions}

四层边界、L1 主体语义、L2 静态编译与发布治理、跨层依赖职责已收敛。2026.10.18 进一步确认不可变 Working Data、逐 Command 即时生效、Reaction 最新状态收敛、延迟启动同步 Flush 和临时 Trace。V0.5 进一步确认 L1 / PreparedForm 两份结构、L3 唯一 Prepared 执行入口、作者确认 Watch 建议、可隔离 Command 错误继续与整体 Flush 熔断，替代局部 Health 传播。V0.6 收敛逐 Command 检测、相对 Scope 与首次激活；后续用户修订已确认常规 Reaction 只响应有效 Watch 变化、runOnActivate 仅新实例首次激活，Dirty / 业务 Baseline / Reset 策略归 Host，替代 Runtime 自动基准和主动重算。稳定快照 SDK、激活默认值、通知、排序、Pending、Validation / Submit、ABI 与 L4 适配继续固化，索引候选仍保留推荐状态。图中的流程不代表生产实现已经完成。

以下独立 ADR 提取已有背景、真实备选、取舍、替代关系与原始依据。编号采用 ADR-FE 命名空间，旧来源的 D / R / ADR 编号原样保留；ADR 的记录不等于本次重新批准架构。完整运行规则仍在上表的所属主题。

| ADR | 重要取舍 | 关联全局约束 / 后续问题 |
| --- | --- | --- |
| [ADR-FE-001](decisions/ADR-FE-001-boundaries.md) | 唯一数据、四层及 Host 责任 | G01 / G02；外部能力与核心分责 |
| [ADR-FE-002](decisions/ADR-FE-002-static-language.md) | 纯表达式、静态引用与局部词法 Scope | G03；正式语言类型 / 签名 |
| [ADR-FE-003](decisions/ADR-FE-003-view-material.md) | 静态模板、端口 / Slots、容器物料 | View 复用与交互边界 |
| [ADR-FE-004](decisions/ADR-FE-004-prepared-entry.md) | 唯一 Prepared 执行入口 | G04；Prepared ABI 待固化 |
| [ADR-FE-005](decisions/ADR-FE-005-watch-subscription.md) | 读取 / 触发 / 订阅分别解释 | G05；通知与生命周期交接 |
| [ADR-FE-006](decisions/ADR-FE-006-command-flush.md) | 即时非原子修改与最新态 Flush | G06 / G07；排序 / 完成边界 |
| [ADR-FE-007](decisions/ADR-FE-007-scope-comparison.md) | 逐 Command 比较和相对身份位置 | G08；等值 / 数组 / 索引仍有推荐项 |
| [ADR-FE-008](decisions/ADR-FE-008-host-editing.md) | 用户明确修订业务基准 / Dirty / Reset | G09；新实例激活与快照 SDK |
| [ADR-FE-009](decisions/ADR-FE-009-errors-trace.md) | 独立错误、整体保护与临时追踪 | G10；异常 Pending / Submit 未闭环 |
| [ADR-FE-010](decisions/ADR-FE-010-validation.md) | 完整 Schema / 增量 Constraint / 字段错误 | G11；前置增量与完整证明仍待决策 |
| [ADR-FE-011](decisions/ADR-FE-011-release-lock.md) | 能力分责、双构建链与不可变发布 | G12；版本、摘要与兼容契约 |

来源覆盖见 [K01–K31 映射](source-map.md#conclusion-map)。以下保留原有演进说明与完整取舍，不能用 ADR 提要删减跨层设计。

产品范围、四层架构、唯一 Working Data、数据/视图分离和受控修改是现行边界；完整 L1 决策见 [核心决策表](l1/01-foundation.md#decisions)。2026.10.17 收敛 L2 / 平台分工、Pure Function 分类与发布锁定，见 [L2 决策](l2-preparation.md#l2-decisions)。2026.10.18 修订数据、batch、Reaction 与 Flush，并形成 Trace / 异常方向，见 [L3 决策 R01–R26](design-history.md#l3-decisions)。V0.5 进一步确认唯一 Prepared 执行路径、作者确认编译建议、可隔离错误继续与整体熔断，见 [跨层 D01–D22](design-history.md#dependency-v05-decisions)。V0.6 明确变化索引与相对 Scope，见 [25 项来源记录及现行处理](design-history.md#l3-v06-decisions)。后续用户撤回 Runtime 业务基准和 Reset 重算，确认 [四条职责原则](l3-reactive-engine.md#l3-runtime-host-boundary)；激活默认值、稳定快照、通知 / Pending 等 SDK 仍待固化，业务编辑策略不再作为核心未决项。

本篇恢复了 [10 月 14 日完整架构稿](../history/2026-10-14/complex-dynamic-form-architecture-v1.html) 的 14 个主体议题、分层描述、图示和详细设计路线，并参考 [后续同步稿](../history/2026-10-16-before-v1-final/complex-dynamic-form-architecture-v1.html) 与现行 L1 更新职责。以下变化必须明确，不能直接把最初图中的候选机制恢复成当前规范：

| 早期稿中的表示 / 建议 | 现行处理 | 保留的设计问题 |
| --- | --- | --- |
| 独立 Resource 概念与 Runtime Resource Manager | 不进入 L1 / L3 核心；请求归 Host | 取消、竞态、失效、缓存和错误恢复仍要设计与验证 |
| 通用能力执行器 / 业务 Command | Material、Pure Function、Host 保留三类职责；平台可统一治理前两类资产 | 扩展、鉴权、版本与受控回写，不把 Registry 当 Runtime 执行器 |
| 通用 Structure / Field Controller 草图 | ViewNode 三类节点，Binding / Adapter 具体 API 待定 | 数据/UI 分离、复合端口、订阅与组件身份 |
| Profile entry、ScopeHandle 模板参数 | Profile 直接对应 ViewNode，模板传 Typed DataReference | 静态复用、词法边界、平台实例隔离 |
| 独立 Material Validation Metadata | Field State 经既有 Binding 消费，不新增 DSL | 字段、对象、数组项的状态与 Issue 展示 |
| 默认拒绝同目标写入与既定事务流水线 | 显式有序即时 Command，batch 默认非原子；同轮 Flush 收敛 | 覆盖、循环、预算、可隔离错误继续与整体熔断后的再触发 |
| 可变 JSON、每次触发独立执行、整轮候选树 | 不可变 Root 与结构共享、Reaction 最新状态合并、独立 Flush | 稳定 Snapshot、准确排序和异常影响范围 |
| 热路径因果图 / 长期正常历史 | 临时有序 Trace + Change 来源，异常上报，Devtools 派生分析 | 记录预算、参数策略和截断契约；精确 Replay 延期 |
| 将读取等同于触发、各规则 / View 自建观察系统 | L2 按位置编译，L3 统一匹配，L4 按挂载订阅 | 消费者各自的业务策略、首次执行与调度契约 |
| External Constraint.dependsOn | 现行草案统一为 watch，并合并 when 的读取 | 失效与 Host 请求分离，正式协议版本迁移待固化 |
| 原始配置与 Prepared 双轨执行、分析结果替代 watch | L3 唯一 Prepared 入口；显式 watch 由作者确认，建议回写后重编 | ABI、编辑增量与来源映射继续固化 |
| 局部 Health / 失败下游禁用 / 局部熔断 | 可隔离 Command 错误继续独立行为，预算超限停止整个 Flush | 不维护父子控制和局部影响链；Pending / 再触发待确认 |
| 每个观察者保存历史参数 / 持久绝对 Scope 路径 | Command 内前后 Root / 旧位置比较，相对 Scope Index 按需解析 | 不沿链传 ScopeChange；局部视图与索引真实性能需验收 |
| Runtime 自动建 Baseline、为 Reset 主动重算已有规则 | Host 自选稳定快照定义基准 / Dirty / Reset；恢复走普通 Command | 无有效 Watch 变化不重跑；runOnActivate 仅新实例；旧方案与理由保留归档 |

后续决策应记录目标、前提、替代方案、代价与重新评估条件；区分已收敛职责、待固化规范与待验证实现。历史阅读页同步统一纯函数术语，原始字节保存在 [来源归档](../history/README.md#l2-integration) 供追溯；现行架构通过正文和图示同时反映演进。

## 逐层讨论与详细设计路线 {#roadmap}

每个阶段都需要输出“设计什么、交付什么、怎样验收”，不能只列层名。逻辑执行顺序是 L1 → L2 → L3 → L4；详细设计需要反向验证，Prepared 结构和 Runtime 执行契约会迭代配合。

```diagram
{
  "id":"figure-roadmap",
  "title":"详细设计路线 · 六组工作及其交付物",
  "rows":[
    [{"title":"01 · Definition 规范固化","body":"将已收敛语义转为可验收规范，补齐位置命令、Union、类型兼容与版本规则","items":["Canonical Type / JSON Schema","Pure Function / Material Contract","正反例与兼容规则"]}],
    [{"title":"02 · Runtime 数据模型与状态管理","body":"按不可变 Root / 结构共享基线设计 Field State、Scope / Identity、快照、初始化与生命周期","items":["数据结构与不变量","状态 / 订阅 / 快照 API","生命周期与身份验收"]}],
    [{"title":"03 · Runtime 计算、Command 与 Flush","body":"按即时更新 / 最新状态收敛基线固化错误类型、通知重入、排序与整体停止后 Pending","items":["独立命令 / 规则与轮次结果","预算 / 停止 / Trace 契约","C01–C18 与复杂联动验收"]}],
    [{"title":"04 · Preparation 静态分析与执行准备","body":"按已收敛的平台分工，结合 Runtime 需要固化可序列化产物、静态分析与 Profile 交付","items":["PreparedForm / Form Plan / View Plan","类型化依赖 / Diagnostics / Host Requirements","Capability Lock / Format / 缓存契约"]}],
    [{"title":"05 · Renderer / Material / Host","body":"设计跨端输入绑定、组件实例、物料组合与外部业务接入","items":["Adapter Contract / Manifest","Validator / Event / Host Services","跨端与集成测试"]}],
    [{"title":"06 · 版本、工具与工程治理","body":"用真实业务贯穿迁移、编辑、预览、调试、性能和发布","items":["版本与迁移模型","测试矩阵 / Trace / 基准","发布规范和实施路线"]}]
  ],
  "arrows":["↓","↓","↕ 与 Runtime 反复验证","↓","↓"],
  "note":"这是设计工作分组，不要求先实现完整 Runtime 再讨论 L2。先形成 L2 最小消费契约，随 Runtime 状态与执行需求细化 Prepared；治理从第一阶段并行纳入。"
}
```

最初稿把 Preparation 详细设计放在 Runtime 之后，是为了避免先建设无用的重型编译器。当前仍保留这个取舍理由：先确认执行需要的事实，再固化索引和准备结构；同时让 L1、L2 与 L3 用代表性用例相互验证。

### 每个专题的统一讨论模板

| 维度 | 必须回答的问题 |
| --- | --- |
| 目标与对象 | 解决什么问题？为谁服务？有哪些非目标？ |
| 模型与职责 | 实体、状态、不变量是什么？谁拥有、谁消费？ |
| 接口与数据流 | 输入、输出、生命周期、版本和错误契约是什么？ |
| 核心机制 | 典型业务流程、时序、算法与伪代码如何表达？ |
| 方案取舍 | 选择什么，为什么，替代方案的成本是什么？ |
| 验收与演进 | 边界、失败路径、性能、测试和后续变化怎样验证？ |

下一步推进 [L1 正式发布前的固化与验收](l1/08-decisions-release.md#release) 及 [L2 能力 / 编译 / 发布契约交付](l2-preparation.md#l2-delivery)，用 Runtime 状态 / 执行需求验证 Prepared 最小结构。具体问题分别保留在 [L1 边界清单](l1/08-decisions-release.md#boundaries) 与 [L2 待固化接口](l2-preparation.md#l2-decisions)，不将设计路线误记为已经完成的实现。

依赖与订阅按 [跨层验收集](dependency-reactivity.md#dependency-acceptance) 确认位置矩阵、最小计划与 L4 挂载；L3 下一步可用 [V0.6 的 16 个场景](l3-data-scope.md#l3-v06-acceptance) 验证候选索引 → 前后 Data / Scope → 失效的闭环，再做性能基准，并验证 Host 恢复 Command 无有效依赖变化不重跑、稳定快照与新实例激活，再补通知、排序、Pending 与异常轮次的 Validation / Submit 衔接；校验的正常路径、字段聚合与异步有效性已进入 [L3 校验专题](l3-validation.md)，落实已确认的编译依赖补全和前置共同入队，再固化资格撤销与异步接口；[验收与未决项](l3-reactive-engine.md#l3-acceptance) 不重开局部 Health 传播。跨层来源见 [2026.10.17 归档](../history/README.md#dependency-integration)，本轮原件与整合前完整正文见 [2026.10.18 归档](../history/README.md#l3-integration)。完整层级、模型、依赖、修改流程和 Host 设计继续保留，图文同步反映替代关系。

V0.5 附件原标日期为 2026.10.18，于 2026.10.19 整合，原始字节与本次修改前正文见 [V0.5 归档](../history/README.md#protocol-runtime-v05-integration)。
## 从早期方案到当前决策：修订记录 {#history}

> 状态：已收敛

本节为追溯附录，保留每次修订当时的结论及后续替代，不能把第 16 条的自动 Baseline / Reset 重算与第 17 条现行规则并列执行。当前完整规则在所属主题；独立的背景 / 备选 / 取舍见[架构 ADR 入口](design-history.md#decisions)，来源与章节映射见[来源覆盖](source-map.md#conclusion-map)。

01

**数据与业务边界**

确定 JSON Schema + 唯一 Working Data；Data、View、Validation 与外部业务执行分离。

02

**表达式与内部规则**

由多种可执行配置收敛为纯 Expression、Constraint 与受控 Command/Reaction。

03

**Scope 的权柄争论**

从可能的跨层 Scope 注册表，收敛为 Data 提供位置、局部 Binder 提供词法别名、L3 提供实例身份。

04

**View Root / Target / Fragment 重复**

统一为 具名 Profile → ViewNode + Named View Template + 静态 $use；不再各自维护定义体系。

05

**view.present 的撤回**

发现与容器/复合 Material 重叠，取消核心 Presentation DSL 和 view.present/view.dismiss。

06

**Binding/Validation 的纠偏**

取消 ValidationMetadata 作为独立 L1 DSL 的倾向；Binding 仅映射端口，字段与校验状态由 Runtime 管理。

07

**Canonical 结构统一**

bindings、slots 使用唯一规范形态；bind、children 可以作为 Authoring 简写。

08

**Typed Template Params 收敛**

采用 schemaRef + DataReference 传参；不创建泛型系统，也不暴露额外的 Template ScopeHandle。

09

**物料约束职责冻结**

Protocol 管机制、Material Manifest 管能力限制、Form Definition 管业务合法性。

10

**L1 架构定稿**

顶层结构及主要领域边界冻结，转入 TS 类型、机器 Schema 和一致性验收。

11

**Profile 去掉单字段包装 · 2026.10.16**

views 的每个具名 Profile 直接对应 ViewNode；原 entry 没有独立语义，予以移除。Profile 名可自由选择，default 不是固定关键字；slots.default 保持插槽语义。基础标识、版本与 metadata 在文档中合并展示为定义信息，协议顶层字段不变。

12

**Pure Function 命名与平台能力边界 · 2026.10.17**

统一采用 Pure Function（纯函数）作为内置和注册纯计算的能力分类，复杂同步校验复用纯函数；Material、Pure Function 与 Host 保留不同职责。Expression 继续使用 `op + args`，调用字段迁移另行决策。L2 消费确定的能力契约，Form Release 锁定版本与不可变制品身份；Host 运行时注册，静态契约可选。具体 [L2 决策与待固化接口](l2-preparation.md#l2-decisions) 不等于生产协议实现已经完成。

13

**跨层依赖与订阅模型 · 2026.10.17**

区分 Read Dependency、Watch Dependency 与活跃 Subscription。Internal Constraint 自动观察 when + assert，External Constraint 的 dependsOn 统一为 watch 并合并 when 的可见读取；Reaction 保持显式 watch，不追加 when / then 读取。L2 编译 Dependency Plan，L3 统一匹配并激活业务规则，L4 按实际挂载订阅与释放。运行时状态来源不扩展 L1 Reference；通知时机、合并及正式 API / ABI 保留待固化。整合前正文和用户原件见 [来源归档](../history/README.md#dependency-integration)，现行契约见 [跨层专题](dependency-reactivity.md)。

14

**L3 执行与诊断修订 · 2026.10.18**

选择不可变 Working Data + 结构共享；有效 Command 同步生效，batch 与 then[] 默认有序、不整体回滚。Reaction 明确为最新状态收敛，待执行实例可以合并，执行后可重新入队；V1 延迟启动、同步 Flush，内部级联归当前轮。Operation 仅表示外部来源。临时有序 Trace 保存实际变化与触发来源，正常释放、异常提取报告；Devtools 自行保存历史。替代早期事务 / 每次触发独立执行候选，保留错误隔离、恢复、通知重入、排序及 Submit 受损范围的未决状态。完整决策见 [L3 专题](design-history.md#l3-decisions)，原件与整合前正文见 [来源归档](../history/README.md#l3-integration)。

15

**原始 / 编译后协议与 Watch / Runtime · V0.5（来源 2026.10.18，整合 2026.10.19）**

FormDefinition 与 PreparedForm 严格分工，L3 唯一消费兼容 PreparedForm，不能在 ABI 失败时静默回退解释原始 L1。显式 Reaction.watch 保留，L2 用 Reads / Writes / Watch 分析给建议，作者确认后回写 L1 再编译；不能自动增删触发依赖。可隔离的单 Command 错误记录后继续独立命令与规则，预算超限整体熔断，不做父子执行控制、失败下游禁用或局部 Health / 影响链恢复；这替代第 14 条在 V0.4 中保留的相应候选。缺失与清空由业务 when / Pure Function 明确，不建通用 Reaction Ready 状态机。

初始化 / 新 Scope / Reset 首次执行、通知重入、熔断后 Pending、Validation / Submit 完成契约继续未决；Source Map 与编辑期增量方案为推荐。原始 22 项状态与 12 个跨层场景见 [V0.5 总账及验收](design-history.md#dependency-v05-decisions)，原始字节与整合前正文见 [来源归档](../history/README.md#protocol-runtime-v05-integration)。阶段归档版本不等于发布新的 L1 Protocol Version，现行 Canonical Reference 与顶层字段保持。

16

**数据变更、依赖索引与 Scope · V0.6 · 2026.10.19**

每条 Command 取得前后不可变 Root 与可稳定读取旧位置的 Scope 视图，一致提交 Data / Scope，定位候选观察者后比较逻辑观察值，临时材料不进入 pending，不传播 ScopeChange。Scope Index 存父级相对位置，完整绝对路径按需解析；Scope 相对观察跟随同一实例，固定路径观察同一位置。用户、Host、Reaction 修改同一字段都走同一检测，不建立派生字段所有权。数据订阅共用匹配，执行事件另走事件观察 / Trace。

首次激活执行策略显式可配置、初始 Reaction 正常收敛后建立 Baseline、Reset 按当前环境重算目标已确认，推进第 15 条当时的初始化未决状态。`runOnActivate` 名称、字段默认值与 API 未冻结；Object.is、Trie / 模板索引、临时 ScopeReadView、整数组替换默认重建及位置型匹配仍为推荐。Reset 主动重算范围 / 入口、Context 改变后的 Dirty 继续待讨论；候选 Schema 尚未因此覆盖新策略字段。原始 [25 项状态与 16 个场景](design-history.md#l3-v06-decisions) 保留，原件和本次整合前正文见 [来源归档](../history/README.md#data-scope-v06-integration)。

17

**Runtime / Host 职责再次收敛 · 2026.10.19 用户明确修订**

确认四条原则：数据是事实，不区分字段所有权或编辑来源；常规 Reaction 只由显式 Watch 有效观察值变化驱动；runOnActivate 仅新规则实例首次激活；Dirty、业务 Baseline、Reset 策略归 Host。Runtime 提供稳定 snapshot 与协议执行 / 校验能力，不判断业务结果应否被修复，不提供 isDirty、markClean、resetToBaseline 或绕过依赖的 Reset 重算模式。

第 16 条记录的“Runtime 初始收敛后自动建立基准”和“Reset 按当前环境主动重新计算”已被替代，不继续作为核心确认或待决项。Host 可以在所选完成时点读取 snapshot，自行保存业务基准，再按业务恢复意图生成普通 Command；没有有效 Watch 变化就不重跑已有规则。数据 / Scope 临时前后视图和 Trace 继续服务检测与诊断。真正新建实例可按激活策略处理，不得伪造重建来强制重算现存实例。

用户另已确认 Context 维持现行只读 / Data-only Command 与 Watch 契约，不在本次扩展。例子与 B01–B08 边界验收见 [四条现行原则](l3-reactive-engine.md#l3-runtime-host-boundary)；来源决策摘录与整合前正文见 [归档](../history/README.md#runtime-host-boundary)。这是当前对话的明确修订，不新造 V0.7 或正式 Protocol Version。

18

**Validation 校验引擎 · V0.7 · 2026.10.19**

保留完整 JSON Schema 作为根校验域，业务 Constraint 独立执行；Data Change 复用现有索引登记 Pending，正常 Reaction 收敛后执行本轮校验。前置在本轮检查并必要重排，不建立结果反向订阅、通用异步 DAG 或 Validation 触发 Reaction 链。按字段聚合错误方向已收敛，按 Source 保存 / 字段索引派生、消息模板和原子通知是推荐实现；内部仍需异步有效性与完整校验事实，不强制向 UI 暴露每源复杂状态。

来源的“缺失前置则诊断并跳过”保留为当前倾向，A 旧结果有效但仅 B 入 Pending 的增量场景继续待验证；不自动补齐，不静默扩展 Watch。requires、validationMessages、PreparedValidation、Issue 与完整返回 API 未冻结，现行候选 Schema / 正式版本不因此扩展。Context 与第 17 条的 Runtime / Host 职责保持。完整 [19 项来源状态与 16 个验收案例](design-history.md#validation-decisions) 已整合；原始字节和整合前正文见 [来源归档](../history/README.md#validation-v07-integration)。

## 被排除或延期的能力 {#tradeoffs}

> 状态：已收敛

| 方案 | 不进入核心的原因 | 替代方案 |
| --- | --- | --- |
| 全局 scopes 注册表 | 与 Data Schema 引用重复，提升解析间接性 | 局部 ScopeBinder + 统一实例身份 |
| 通用 Action / Workflow DSL | 把 Form 协议变为应用编排语言 | Command + Host |
| view.present / view.dismiss | 重复容器 Material 的展示职责 | Modal/Drawer/BottomSheet Material |
| 独立 Validation Binding | 同一数据位置重复绑定，增加 L1 语义 | Runtime Field State → 现有 Binding |
| 动态 Template ID | 引入动态 View 选择与状态替换问题 | 静态 $use + 物料内部组合 |
| 通用 Typed Params 泛型 | 类型证明器成本远超当前需要 | schemaRef 的 Typed Data Params |
| Expression 生成写入路径 | 降低引用静态可分析性 | 结构化 DataReference 作为 Command Target |
| 自动双向派生字段镜像 | 制造重复业务状态 | 需要展示用 Expression，需要保存时显式 Command |
| 生命周期脚本与请求 URL | 引入通用外部流程执行机制 | Host API 与 External Constraint |
| 原始 L1 与 Prepared 双轨运行 | 容易绕过同一编译诊断、依赖和锁定语义 | Runtime 只消费兼容 PreparedForm |
| 父子 Reaction / 局部 Health / 局部熔断 | 为独立状态规则引入影响链与恢复状态机 | 可隔离 Command 错误继续；超限整体 Flush 熔断 |
| 通用 Reaction Ready 状态 | 混淆初始化、业务空值与清空后的结果 | 业务 when / Pure Function 明确；首轮激活策略单独验收 |
| 派生字段所有权与规则链传播 ScopeChange | 改变显式触发意图，并把局部位置比较复杂度传到消费者 | 同一 Command 检测、相对 Scope Index、只投递失效标识 |
| 校验结果 PubSub / 通用异步 DAG / Schema Keyword 自动拆分 | 重建响应式与调度系统，增加跨端等价性成本 | 完整 Schema、本轮前置检查与字段聚合；多步外部业务封装同一 Host 能力 |
| 核心 Dirty / 业务 Baseline / Reset 主动重算 | 不同应用对编辑、保存和恢复的定义不同，且可能绕过 Watch | Host 自选稳定 snapshot、定义编辑状态并生成普通 Command |

## 影响、决策与后续交付 {#dependency-decisions}

本节 D01–D13 沿用前期依赖模型的编号，并同步后续明确修订；V0.5 的来源 D01–D22 在后节独立列示，不能按相同数字混为一项。

| 编号 | 议题 | 本轮结论与状态 |
| --- | --- | --- |
| D01 | Read / Watch / Subscription | 三者分离；设计基线 |
| D02 | dependsOn → watch | 本次采纳到现行 L1 草案与样本；正式协议版本 / 迁移规则待固化 |
| D03 | Internal Constraint | when + assert 自动推导；设计基线 |
| D04 | Reaction.watch | 显式触发不扩展；保持原语义 |
| D05 | L2 分析 | 类型引导递归、保守覆盖；设计基线 |
| D06 | Prepared Dependency Plan | 本次采用的结构方向；存储与 ABI 未冻结 |
| D07 | Runtime 统一观察 | 规则与 View 共用匹配；设计基线 |
| D08 | View 激活 | L4 通过 L3 API 挂载 / 释放；设计基线 |
| D09 | 消费者通知 sync / deferred | 候选字段仍未冻结；Reaction 已确认延迟启动、同步 Flush |
| D10 | View 粒度 | Node 合并或属性拆分未决 |
| D11 | 底层变化结构 | 内部表示未决 |
| D12 | 每次触发 / 最新状态 | 2026.10.18 已确认 Reaction 最新状态收敛与 pending 合并；显式 Command 次数保留 |
| D13 | 对外求值入口 | Prepared Expression 与快照契约待固化 |

本次改动集中在 L1 使用位置与命名、L2 递归分析和静态计划、L3 统一匹配与激活、L4 挂载生命周期。无需重写 Expression DSL / Command，也不让 L2 执行纯函数、实例化数组或建立真实订阅。

旧 `dependsOn` 的确定迁移为 External Constraint 同位置的 `watch`，引用值保持不变；不自动扩展 Reaction.watch。历史原件保留旧字段；现行草案和候选样本只接受新字段，不静默兼容双字段。若已有正式发布数据，迁移必须识别旧 Protocol Version，校验后输出新版本并记录来源，不能在原版本下悄悄换名。项目当前尚无已发布正式协议版本，本次不虚构新版本号。新增计划改变 Prepared 交付时，也必须更新格式版本和兼容检查。

后续按 L1 位置矩阵检查语义，用跨字段 Constraint、嵌套 Expression 与 scoped View 验证最小计划，并打通 L4 挂载、父条件与卸载。L3 按即时更新 / 合并 / 可隔离错误继续 / 整体 Flush 熔断基线，补错误类型、Pending 再触发、通知重入与准确排序；不重新将是否合并或局部影响链列为开放选择。实际类型、Schema、编译器和运行时实现按任务另行落地。

原始附件的 23 节按概念、各层职责、时序、验收与决策整合至本篇和对应主题；术语并入整体架构的词汇表。原始字节和整合前正文见 [来源归档](../history/README.md#dependency-integration)。本篇是跨层契约，L1 语法和 L3 完整执行规范仍分别维护，不以草图替代正式发布包。

## V0.5 决策总账 {#dependency-v05-decisions}

下表保留来源的 D01–D22 编号与状态，属于 V0.5 命名空间，与前期跨层 D01–D13 及 L2 / L3 专题内的编号分别识别。“实现阶段”表示尚需设计和验证具体契约，不表示功能已实现；推荐项不提升为已确认。

本表是来源状态记录；D16 后续明确为 runOnActivate 仅新规则实例首次建立，字段默认值 / SDK 尚待固化；业务 Baseline / Dirty / Reset 已归 Host，不再保留 Runtime Reset 重算范围待决项。当前进展见 [V0.6 决策](design-history.md#l3-v06-decisions)，不能把旧待确认状态重新当作尚无原则。

| 来源编号 | 决策 | 来源状态 | 说明 |
| --- | --- | --- | --- |
| D01 | L1 与 PreparedForm 双结构 | 已确认 | 原始协议用于业务表达；编译后产物用于 Runtime 执行。 |
| D02 | L3 不直接解释原始 L1 | 已确认 | Prepared ABI 的解析与兼容属于 L2 / 发布契约。 |
| D03 | Reaction 显式 watch 保留 | 已确认 | Watch 的触发语义由业务配置最终确认。 |
| D04 | L2 提供配置编译诊断与修改建议 | 已确认 | Read / Write / Watch 差异不能静默改写配置。 |
| D05 | 编译阶段生成确定依赖计划 | 已确认 | 运行时只按 Prepared Observation 匹配实际 Change。 |
| D06 | 不可变 Working Data 与同步 Command 更新 | 已确认 | 结构共享；不以 Batch 事务等待用户数据可见。 |
| D07 | Reaction 以最新状态收敛为目标 | 已确认 | 待执行去重，执行过后再失效可重新入队。 |
| D08 | Flush 延迟启动并连贯执行至结束 | 已确认 | 不做 Fiber 式分段调度，保留后续替换扩展。 |
| D09 | 整个 Flush 是统一熔断边界 | 已确认 | 不构建局部熔断与 Reaction 影响链状态。 |
| D10 | Command 可隔离错误不阻断其他独立行为 | 已确认 | 有效 Data Change 决定后续触发，不查父级健康。 |
| D11 | Trace 为临时线性记录 + Change 来源 | 已确认 | 事后分析重建图，生产正常 Flush 不持久化。 |
| D12 | 不以全量 Hash 作为默认判环 | 已确认 | 静态 SCC 风险 + 运行时同值过滤 + 执行预算。 |
| D13 | 缺失值由业务规则处理 | 已确认 | 不新增通用 Reaction 初始化 Ready 状态；保留 null / missing 区分。 |
| D14 | 编译期 source map 与 Prepared 规则来源关联 | 推荐 | 便于异常报告定位 L1 配置行、版本和 Scope。 |
| D15 | 编辑期增量分析、发布期全量校验 | 推荐 | 兼顾可交互编写与完整产物发布质量。 |
| D16 | 首次激活 / 新 Scope 建立时的 Reaction 执行策略 | 待确认 | 结合初始化缺失、watch、when、reset 验证。 |
| D17 | 同步通知与业务同步重入的具体交付时序 | 待确认 | 允许业务联动，防止接口实现无意产生失控递归。 |
| D18 | 整体熔断后的 Pending 处理与再触发 | 待确认 | 已写数据保留，不得自动无限重启同一问题。 |
| D19 | Validation 与 Submit 的完成边界 | 待确认 | 同步联动与异步 Host 校验分别处理。 |
| D20 | 执行预算与 Trace 字节上限 | 实现阶段 | 待真实大数组、规则链压力测试后配置。 |
| D21 | Prepared ABI 具体字段与兼容策略 | 实现阶段 | 运行时输入契约确定后细化。 |
| D22 | Devtools 历史保留与事件消费 API | 实现阶段 | 独立于生产 Runtime 的持久状态。 |

## 跨层修订、替代方案与取舍 {#l3-impact}

| 层 / 早期候选 | 现行处理 | 保留理由与影响 |
| --- | --- | --- |
| L3 可变 JSON + 按需 Snapshot | 不可变 Working Data + 结构共享 | 稳定旧快照；更新算法保留优化空间 |
| batch 候选树统一提交 / 回滚 | 逐 Command 有序即时生效，不默认整体回滚 | 输入反馈与状态语义；通知合并独立处理 |
| Reaction 每次失效均独立执行 | 最新状态收敛、pending 去重 | 状态联动与事件记账分离；L1 同步说明 |
| Operation 包含完整联动事务 | 仅记录外部来源，多个 Operation 可共用 Flush | 调度轮次独立于修改来源 |
| 同步 / 全延迟 / 混合 / 分段调度候选 | V1 延迟启动、同步消费到结束 | 保持简单，可替换入口，暂不做 Fiber 式优先级 |
| 每步 Hash / 热路径完整因果图 | 同值短路、次数预算、轻量有序 Trace | 降低热路径成本；静态风险和离线解释分工 |
| 最近 N 条或长期生产历史 | 临时轮次记录；预算与截断待定；异常提取报告 | 保留起点有助定位，同时控制内存与复制成本 |
| L2 Read / Watch 分离 | 保持；推荐 Watch / Write SCC 风险诊断 | Write 不改变 Reaction 触发逻辑 |
| L1 then 中数组操作 | 保留，但需符合收敛意图并提示非幂等风险 | 显式 Command 次数不合并，Reaction 不承诺每次触发次数 |
| 原始 L1 与 Prepared 可双轨执行 | Runtime 只消费兼容 PreparedForm | 统一诊断、依赖计划与能力绑定，避免静默解释回退 |
| 普通错误一律停后续 / 局部 Health 传播 | 单 Command 可隔离错误继续独立行为；超限整体熔断 | 不检查上游成功，不做局部影响链与恢复状态 |
| 缺失输入靠通用 Reaction Ready | 业务 when / Pure Function 明确空值语义 | 区分初始缺失与清空；V0.6 已确认首次激活显式可配置，默认值待固化 |
| Scope / Validation / L4 | 保持稳定身份、校验所有权与新鲜度、按挂载订阅 | Trace 也按稳定 Scope 定位；Runtime 不控制 UI 帧与 Loading |

不默认整体回滚、逐步全表快照、运行时因果图或复杂调度，是具体成本与表单状态语义之间的选择。V0.5 进一步用单 Command 可隔离错误与整轮预算边界替代父子执行控制、局部熔断和不可信影响范围传播；Trace 仅诊断，不作为调度或权限门控。旧候选与整合前全文见 [V0.4 来源](../history/README.md#l3-integration) 及 [V0.5 整合归档](../history/README.md#protocol-runtime-v05-integration)。

## 决策总账 {#l3-decisions}

以下沿用 V0.4 的 R01–R26 稳定编号，受 V0.5 影响的行标明当前修订及原状态；未受影响项保留。“推荐”不是已经冻结，“待实现标定”也不是实现完成。完整 V0.4 原始状态在来源包中保留，V0.5 的独立 D01–D22 见 [跨层总账](design-history.md#dependency-v05-decisions)。

| 编号 | 决策 | 状态 | 说明 / 所属层 |
| --- | --- | --- | --- |
| R01 | Working Data 不可变 + 结构共享 | 已确认 | 旧 Snapshot 稳定；每条有效 Command 可发布新 Root；L3 Data |
| R02 | 单个有效 Command 同步生效 | 已确认 | 业务合法性由 Validation 判断；结构操作保持内部一致性；L3 Data |
| R03 | 默认 Batch 非原子事务 | 已确认 | 子 Command 有序实时写入，不默认回滚前序成功修改；L1 / L3 |
| R04 | Reaction 是最新状态收敛行为 | 已确认 | 不依赖触发次数；同一待执行实例可以合并；L1 / L3 |
| R05 | 内部 Reaction 写入属于当前 Flush | 已确认 | 不为每条联动创建新 Flush；执行后可重新入队；L3 Reactive Engine |
| R06 | V1 延迟启动、同步执行到结束 | 已确认 | 不做分段调度/时间切片；L3 Scheduler |
| R07 | Operation 是来源，不是隔离事务 | 已确认 | 多个 Operation 可影响同一个 Flush；L3 |
| R08 | Trace 为顺序行为记录 + Change 来源 | 已确认 | 不构建运行时因果图；Devtools 事后分析；Diagnostics |
| R09 | 正常 Flush 不持久上报 | 已确认 | 执行结束后释放临时 Context；异常才提取报告；Diagnostics |
| R10 | Devtools 可观察完整执行 | 已确认方向 | 启用时由 Devtools 自行保存历史，不能改变执行语义；Devtools |
| R11 | L2 做 Watch/Write 图与潜在环诊断 | 推荐 | 静态 SCC 可辅助定位，但不禁止所有成环规则；L2 |
| R12 | Flush Context 自首次入队建立 | 已确认 · V0.5 | 原为推荐；当前确认保留 scheduled 初始来源与合并原因；L3 |
| R13 | 执行时使用稳定顺序与去重队列 | 推荐 | 稳定规则排序 + 首次入队顺序，具体语义需再确认；L3 |
| R14 | 超限熔断整个本轮 Flush | 已确认 · V0.5 | 原为推荐；统一整轮预算，不做局部熔断影响链；L3 |
| R15 | 可隔离 Command / Function 错误继续独立行为 | 已确认 · V0.5 | 原为待决策；记录错误，后续独立命令与规则继续；精确类型和接口待固化；L3 |
| R16 | 整体熔断后的 Pending 与再触发 | 待确认 · V0.5 | 不回滚、不无限自动重启；原局部影响范围 / 链级恢复被替代，具体队列处理待定；L3 |
| R17 | 同步订阅重入时的递归通知保护 | 待决策 | Data 同步写入不变；通知交付需要有界处理；L3 / L4 |
| R18 | 单次 Flush 的启动与执行排序细节 | 待决策 | 运行中被再次失效、同层/跨层写入冲突如何排序？；L3 |
| R19 | Trace 预算溢出策略 | 待决策 | 完整到上限后保留头尾并标注截断，还是仅尾部？；Diagnostics |
| R20 | 详细参数记录的边界 | 待决策 | 实际值/摘要/大小/类型、敏感数据与稳定拷贝；Diagnostics |
| R21 | 异常检测阈值与重复上报限频 | 待实现标定 | 单实例和总次数硬限制、耗时统计、告警聚合；L3 / Host |
| R22 | Validation / Submit 完成边界 | V0.7 正常路径方向收敛；异常交接待定 | 正常联动后本轮校验 / 完整校验分开；无 Issue 不等于通过。缺失前置、准确返回及异常 / 熔断如何交接继续待定；不恢复局部 Health |
| R23 | 确定性 Replay、历史 Snapshot | 延期 | 先保证执行链说明；需要时再引入检查点与重放数据；Devtools |
| R24 | 全量 Hash、局部 Hash、完整因果图 | 延期 | 仅高级诊断/开发分析有明确需求时再实现；L2 / Devtools |
| R25 | 复杂分段调度 / 优先级 | 延期 | 先做可替换调度入口，V1 不实现 Fiber；L3 |
| R26 | 新实例首次激活与 Host 业务状态边界 | 已确认 · 后续用户修订 | 新实例按 runOnActivate；业务 Baseline / Dirty / Reset 归 Host；不因恢复意图重跑已有实例。取代 V0.6 自动基准与主动重算，字段默认值 / SDK 待固化 |

## V0.6 数据变更与 Scope 决策总账 {#l3-v06-decisions}

以下保留来源 D01–D25 的编号、标题、说明与状态，属于 V0.6 命名空间，与 V0.5 的 D01–D22 及本篇 R 编号分别识别。来源正文的“已收敛具体结论”不提升决策表中的推荐项；当时 Object.is、Trie 组合、临时 ScopeReadView、整数组重建与位置型匹配为推荐；整数组重建已由下方 2026-10-19 用户讨论确认。 **来源状态是当时记录，现行处理以最后一列和本次用户修订为准**；D07 / D08 的核心职责已撤回，D21 / D22 不再是 Runtime 待决项。

| 来源编号 | 决策 | 来源状态 | 来源说明 | 现行处理 |
| --- | --- | --- | --- | --- |
| D01 | 数据字段不需要所有权语义 | 已确认 | 用户、Host、Reaction 修改同一字段，Reactive Engine 对来源一视同仁。 | 沿用原有确认 / 推荐 / 验证状态 |
| D02 | 显式 Watch 由 L1 规定、L2 编译 | 已确认 | 运行时不自动补全业务触发意图；L2 可给配置诊断建议。 | 沿用原有确认 / 推荐 / 验证状态 |
| D03 | Command 实时更新 Working Data | 已确认 | 每条独立 Command 立即写入，后续 Command 读当前最新值。 | 沿用原有确认 / 推荐 / 验证状态 |
| D04 | 不可变结构共享的前后 Root | 已确认 | 当前 Command 比较之前/之后 Root，不需要完整周期快照。 | 沿用原有确认 / 推荐 / 验证状态 |
| D05 | 多 Command 逐条变化检测 | 已确认 | 不等待 Operation 或 Flush 结束才推导 Data Change。 | 沿用原有确认 / 推荐 / 验证状态 |
| D06 | Reaction Pending 去重并读最新态 | 已确认 | 多个变化同一待执行规则实例合并，执行后再次失效可以再入队。 | 沿用原有确认 / 推荐 / 验证状态 |
| D07 | Baseline 在初始 Reaction 正常收敛后建立 | 已确认 | 首次自动联动不直接制造 Dirty。 | 被替代：Runtime 不自动建业务 Baseline；Host 自选快照和时点 |
| D08 | Reset 按当前环境重新计算 | 已确认 | 目标确定，具体选择重算规则的入口另议。 | 被替代：Host 生成普通恢复 Command，无有效 Watch 变化不重跑已有实例 |
| D09 | 首次执行策略显式可配置 | 已确认 | 实例激活与实际第一次执行业务计算分离。 | 沿用并限定：仅新 Reaction 实例首次激活，不重跑已有实例 |
| D10 | ScopeId 与数组下标分离 | 已确认 | Move 时存活成员身份稳定，位置映射随数组操作变化。 | 沿用原有确认 / 推荐 / 验证状态 |
| D11 | Scope Index 存相对父级位置 | 已确认 | 完整绝对 Data Path 是按需解析结果，不是事实来源。 | 沿用原有确认 / 推荐 / 验证状态 |
| D12 | ScopeChange 不沿链路传播 | 已确认 | 局部变更比较后，只下发观察者失效或执行事件。 | 沿用原有确认 / 推荐 / 验证状态 |
| D13 | 不同消费者共用数据依赖匹配 | 已确认 | Reaction / Validation / View / Host 复用索引基础能力。 | 沿用原有确认 / 推荐 / 验证状态 |
| D14 | 执行事件与数据 Watch 分离 | 已确认 | Host 监听 Reaction execution / errors 不走 Data Trie。 | 沿用原有确认 / 推荐 / 验证状态 |
| D15 | 整体 Flush 是熔断边界 | 已确认 | 无局部链路熔断 / 失败传播 / 上游子任务健康模型。 | 沿用原有确认 / 推荐 / 验证状态 |
| D16 | 默认 Object.is 比较观察值 | 推荐 | 对象/数组按引用；必要时显式考虑路径存在性。 | 沿用原有确认 / 推荐 / 验证状态 |
| D17 | Trie 与编译期依赖模板结合 | 推荐 | L2 规范化，L3 按动态 Scope 绑定实例，避免全量扫描。 | 沿用原有确认 / 推荐 / 验证状态 |
| D18 | 临时前后 ScopeReadView | 推荐 | 结构变更前保留受影响局部旧位置，比较后释放。 | 沿用原有确认 / 推荐 / 验证状态 |
| D19 | 数组整替换默认重建成员 Scope | 推荐（来源当时状态） | 不依据姓名或对象内容推断身份；稳定业务 Key 为当时扩展候选。 | 2026-10-19 已确认整替换必建新成员，不按业务 ID / 内容复用身份 |
| D20 | 位置型 Watch 与 Scope 相对 Watch 分别匹配 | 推荐 | 确保移动仅影响确实观察位置或集合的消费者。 | 沿用原有确认 / 推荐 / 验证状态 |
| D21 | Reset 的显式重算范围与调度入口 | 待讨论 | 在旧 Watch 不变化的场景下仍要达到当前环境收敛目标。 | 移出核心：无 Runtime Reset 重算入口，业务配置和恢复意图归 Host |
| D22 | Context 变化后的 Dirty 业务语义 | 待讨论 | Baseline 已确认，但是否只考虑用户业务输入尚未定。 | 移出核心：Dirty 由 Host 定义，不增加 Runtime 字段分类或编辑状态 |
| D23 | BeforeScopeView 的局部保存形式 | 实现验证 | 选择集合顺序切片或轻量版本化，不全量复制。 | 沿用原有确认 / 推荐 / 验证状态 |
| D24 | 对象引用约束与防御策略 | 实现验证 | Host 原地修改共享对象须受到约束或输入层隔离。 | 沿用原有确认 / 推荐 / 验证状态 |
| D25 | Trie 模板实例化的真实性能 | 实现验证 | 分别测试深层数组、集合 Move、大对象少量 Watch。 | 沿用原有确认 / 推荐 / 验证状态 |


## V0.7 来源决策与现行处理 {#validation-decisions}

以下编号属于 V0.7 自身命名空间，不与 L3 R01–R26、V0.5 / V0.6 的 D 编号混合。保留来源标题、说明与状态；“已收敛”表示设计意图，不等于 API 冻结。D06 的倾向须与 D14 的增量待验证状态一起阅读。

| 来源编号 | 来源决策 | 来源状态 | 来源说明 | 现行处理 |
| --- | --- | --- | --- | --- |
| D01 | 完整 JSON Schema 首版不自动拆分 | 已收敛 | Ajv / Dart 接收完整标准 Schema，编译执行交给平台 Adapter。 | 沿用来源状态；完整约束见本专题对应章节 |
| D02 | 自定义 Constraint 独立于 Ajv 扩展 | 已收敛 | 表达式 / Function / External 在 L3 统一校验容器内执行，不做自定义 Ajv Keyword 的跨端 ABI。 | 沿用来源状态；完整约束见本专题对应章节 |
| D03 | Reaction 先收敛，Validation 后执行 | 已收敛 | 校验不改 Working Data，也不默认让 Reaction 监听校验结果。 | 沿用来源状态；完整约束见本专题对应章节 |
| D04 | Constraint 增量触发依赖现有 Index | 已收敛 | Data Change 时登记 Pending；到校验阶段不遍历全部 Constraint。 | 沿用来源状态；完整约束见本专题对应章节 |
| D05 | 前置关系采用本轮有序链 | 已收敛 | 按数组配置顺序，执行前检查 requires、必要时重排序；不建立前置结果 PubSub。 | 本轮排序方向沿用；requires 引用和异步等待语法未冻结 |
| D06 | 缺失前置按用户最新意见作为本轮错误处理 | 已收敛 | 缺失时报告诊断并跳过受影响任务；如何与增量 Pending 兼容待验证。 | 保留严格缺失倾向；须结合 D14，未提升为最终增量契约 |
| D07 | 跨异步前置优先封装同一 External Constraint | 已收敛 | 避免 Runtime 负担复杂跨异步链路。 | 沿用来源状态；完整约束见本专题对应章节 |
| D08 | 校验错误按字段聚合供 L4 订阅 | 已收敛 | 一个字段可同时来自 JSON Schema、业务 Constraint 与 External。 | 沿用来源状态；完整约束见本专题对应章节 |
| D09 | 按 Source 保存、字段索引派生 | 推荐实现 | 保证各校验来源原子替换和撤销旧 Issue。 | 来源存储和字段派生为推荐；不是两份独立真相 |
| D10 | 同步错误原子更新，避免闪烁 | 推荐实现 | 仅在聚合内容真正变化时通知字段订阅者。 | 沿用来源状态；完整约束见本专题对应章节 |
| D11 | 错误消息默认模板加局部覆盖 | 推荐实现 | 不要求作者维护大规模 JSON Pointer 错误文案表。 | 沿用来源状态；完整约束见本专题对应章节 |
| D12 | 前置不通过只跳过当前后置任务 | 推荐实现 | 其他独立任务继续，跳过不等于通过。 | 沿用来源状态；完整约束见本专题对应章节 |
| D13 | 异步结果代次隔离 | 推荐实现 | 输入变化、前置不再满足或 Scope 销毁时旧返回不能提交。 | 过期不能提交是必须满足的正确性；代次 / token 是推荐实现 |
| D14 | 仅增量触发 B 而前置 A 未入 Pending | 待验证 | 严格缺失跳过可能导致合法的增量请求不执行；保留最新偏好，需业务验证。 | 沿用来源状态；完整约束见本专题对应章节 |
| D15 | 字段有效性前置的精确范围 | 待验证 | 是仅 JSON Schema 同步错误、还是包括明确的同步 Constraint；根级组合错误如何归属。 | 根级错误不得据此默认阻断全部规则；精确范围待验证 |
| D16 | Constraint 配置 API 语法 | 待验证 | requires 的字段 / 规则引用格式、L1 和 PreparedValidation 的公共类型尚未冻结。 | requires / validationMessages 不新增为现行候选 Canonical 字段 |
| D17 | 完整校验对配置错误的处理 | 待验证 | 缺失前置、环路及外部异常需返回 incomplete，不能当作业务 valid。 | 不把配置异常当作 valid；完整返回类型与优先级仍待固化 |
| D18 | 同步 Schema 全量校验性能基准 | 待验证 | 先测目标设备真实表单，再决定是否增加局部优化。 | 沿用来源状态；完整约束见本专题对应章节 |
| D19 | 校验通知与高频输入的时序 | 待验证 | 默认合并同步轮次；是否加延迟/节流取决于实际性能与体验。 | 沿用来源状态；完整约束见本专题对应章节 |

## 编译与能力治理的决策记录 {#l2-ledger}

| 编号 | 决策 | 状态 |
| --- | --- | --- |
| D01 | L2 是平台静态协议编译能力，平台管理能力另有归属 | 已收敛 |
| D02 | AOT、服务端按需、客户端加载可共用编译语义，独立于实例业务数据 | 已收敛 |
| D03 | Form Registry、Capability Registry、Compiler、Release Management 分工 | 已收敛 |
| D04 | 能力分为 Material / Pure Function / Host | 已收敛 |
| D05 | Pure Function 为同步纯计算；复杂同步自定义校验直接复用 | 已收敛 |
| D06 | 内置 `core.*` 与注册纯函数共用 Expression 调用协议，禁止覆盖 | 已收敛，具体别名映射待固化 |
| D07 | Material / Pure Function 有静态 Manifest，Host 静态契约可选 | 已收敛 |
| D08 | Host 运行时注册；L2 提取 Requirements，不强制托管 Host 代码 | 已收敛 |
| D09 | 能力代码构建与 Definition 编译为两条链路 | 已收敛 |
| D10 | Form Release 锁定能力版本和不可变制品身份 | 已收敛 |
| D11 | L1 Protocol 与 Prepared Runtime Format 分开版本化 | 已收敛 |
| D12 | 按关系类型分析依赖；符号引用环 Error，潜在 Reaction 环默认 Warning | 已收敛 |
| D13 | 输出 PreparedForm、Diagnostics、能力依赖与 Host Requirements | 结构方向已收敛，字段待固化 |
| D14 | 所有现行及历史阅读文档统一使用 Pure Function / 纯函数术语；原始来源保留追溯 | 本次架构决策，2026.10.17 |
| D15 | 类型引导递归收集读取，再按使用位置编译触发关系；不执行纯函数发现依赖 | 跨层设计基线，2026.10.17 |
| D16 | Prepared 交付 Dependency Plan 与 Scope Pattern；Runtime 规则和 View 采用不同激活归属 | 结构方向已收敛，正式字段 / ABI 待固化 |
| D17 | Watch / Write SCC 风险诊断与运行时保护分工 | 2026.10.18 推荐分析方向；不改变显式触发，不把潜在环当作必然死循环 |
| D18 | L1 原始定义与 PreparedForm 严格分离，Runtime 只消费 Prepared | V0.5 已确认；ABI 具体字段与兼容策略在实现阶段固化 |
| D19 | Reads / Writes / Watch 差异给作者建议，确认后回写 L1 再编译 | V0.5 已确认；增量编辑与 Source Map 为推荐方向 |
| D20 | 规范化路径 / Scope 模板与显式首次激活策略交付，L3 再实例化索引 | V0.6 原则已确认；Trie 具体实现、策略字段 / 默认值与 ABI 待固化 |

## 编译设计的原始来源与整合记录 {#l2-source-history}

原始依据为用户提供的《L2 Preparation · 平台能力治理与编译发布架构 · 决策归档 V0.1》，21 节讨论内容已按职责整合到本篇；类型 / JSON 草图保留候选状态，并对齐现行类型化 Reference。原始附件与术语统一前的历史阅读文件见 [来源归档](../history/README.md#l2-integration)。现行内容发生冲突时，以本篇和相应 L1 主题为准。

后续跨层模型补充的读取 / 触发区分、递归分析、Dependency Plan 和 Scope 分工已整合至本篇；原件与整合前正文见 [跨层模型来源](../history/README.md#dependency-integration)。先用跨字段 Constraint、嵌套 Expression 和 scoped View 检验最小消费契约，再深入变化调度，不将候选验证器包装成编译器实现。

V0.5 的 19 节、22 项决策与 12 个跨层业务验收分别归入本篇、[跨层协议 / Watch 专题](design-history.md#dependency-v05-decisions) 和 [L3 执行契约](l3-reactive-engine.md)。附件中的路径简写不改变现行 Canonical；原始字节、日期及整合前正文见 [V0.5 来源归档](../history/README.md#protocol-runtime-v05-integration)。

## 从现行说明移出的修订背景 {#revision-notes}

以下段落保留整理前的来源时点与替代说明，只用于追溯；现行规则在对应能力文档维护。

### l3-reactive-engine.md 的修订说明

2026.10.19 用户进一步收敛职责：Runtime 不自动建立业务 Baseline，不维护 Dirty，也不把 Reset 变成 Reactive Engine 的特殊执行模式。这替代 “Runtime 初始收敛后建立基准”和“Reset 后按当前环境主动重算”结论；旧设计与修订理由保存在 [本次来源归档](../history/README.md#runtime-host-boundary)。

### l3-reactive-engine.md 的修订说明

当前已确认以下原则，优先于 中自动 Baseline 与 Reset 重算的旧结论。

### l3-reactive-engine.md 的修订说明

可隔离错误继续与超限整体熔断已经确认，不再列为两种可自由选择的候选。显式激活原则沿用，自动业务基准和 Reset 主动重算被本次边界修订替代；后续优先验收字段 / 默认值、稳定快照、Data / Scope 比较、通知和 Pending；记录容量、参数与阈值在实现中固化。来源中的后续会议建议和个人复核控件不改变决策状态。跨层 22 项来源决策见 [总账](design-history.md#dependency-v05-decisions)。

### l3-reactive-engine.md 的修订说明

以下对应来源 01–16。它们是同一套 PreparedForm / Data / Scope / Dependency Index 的未来验收，包含推荐方案需证明的预期行为，不是现有候选验证通过结果。整数组重建现已确认，首次激活字段默认值仍待固化；15 / 16 场景已按后续用户修订更新，撤回 Runtime 业务基准 / Reset 重算要求。

### dependency-reactivity.md 的修订说明

这些概念的背景与原有三种视图订阅方案见 [ADR-FE-005](decisions/ADR-FE-005-watch-subscription.md)。本篇后部的 表保留来源时点，当前进展以各行说明及所属规范为准；跨模块未决和设计状态见[治理矩阵](governance.md#design-status)，不以旧待定状态重新开放已确认原则。

### dependency-reactivity.md 的修订说明

来源标注为 2026.10.18，本次于 2026.10.19 整合；原件及整合前正文见 [归档](../history/README.md#protocol-runtime-v05-integration)。

### dependency-reactivity.md 的修订说明

整体架构图同步逐 Command 检测、独立 Flush、可隔离错误继续与整体预算停止。runOnActivate 仅新实例；Runtime 自动业务基准和 Reset 重算已被用户修订替代。稳定快照、激活默认值、遗留 Pending、通知、排序与销毁后回调继续固化；不恢复整组回滚或局部 Health。完整说明、Trace 与验收见 [L3 专题](l3-reactive-engine.md#l3-acceptance)。

### l2-preparation.md 的修订说明

后续用户修订进一步限定：

### l2-preparation.md 的修订说明

此次统一术语为 **Pure Function（纯函数）**，候选契约相应使用 `PureFunctionManifest` 等名称。L1 表达式调用节点目前保留 `op + args`；名称统一不自动构成协议字段迁移。原来源中较宽泛的 Function 分类在现行正文中均明确为 Pure Function。


## 2026-10-19：校验依赖补全与前置共同入队 {#validation-prerequisite-update}

本轮用户讨论确认：后置 Constraint 进入初始 Pending 时，递归补齐其前置 Constraint，按具体实例去重并使用本轮结果判断执行资格；不复用历史通过结果。这替代上文来源 D06 / D14 保留的严格缺失跳过倾向，原来源状态仅用于追溯。

影响后置结果的数据应成为其触发依赖，但可从表达式与前置关系推导的部分由 L2 自动补全，作者无需重复声明，也不因此阻止编译。只有 Host 内部等不可推导的业务依赖才需显式提供；编译器不能保证发现未知遗漏。前置输入依赖传递纳入后置有效依赖，因此无需前置结果 PubSub；Reaction 显式 Watch 不变。依赖失效 / Pending 与立即外部请求仍分开，具体请求策略待固化。

完整根 Schema 已全量执行，不按 Constraint 方式补任务；字段资格范围、前置引用 / 跨 Scope 绑定、异步等待与撤销接口仍未冻结。讨论没有确认 Flush 异常后的校验与提交方案。现行规范见 [校验前置](l3-validation.md#validation-round)，决策总账见 [ADR-FE-010](decisions/ADR-FE-010-validation.md)。

## 2026-10-19：联动异常、熔断与提交解耦 {#reaction-failure-submit-update}

2026-10-19 已确认：Reaction 错误只表示相应联动未完成，不自动阻止提交；独立规则继续，已写 Data 不回滚。代码异常报告交 Host，用于正确用户提示与监控告警；网络失败由 Host 提示 / 重试。业务校验不通过与校验执行异常分别表达，必要校验无法完成不能放行。非关键辅助操作失败不阻断主流程。

整体预算熔断停止整个当前 Reaction Flush，并暂停该实例后续 Reaction 自动执行；剩余任务不得自动跨轮续跑，后续输入也不自动重启联动，须显式恢复或重建。恢复入口、剩余队列物理清理与重建规则仍待固化。保留当前 Data、填写 / Command、读取 / 快照与独立完整校验能力，Host 提示自动联动已暂停。这里“整体停止”针对联动执行，不表示数据和校验能力全部失效，不建立局部 Health 或失败下游传播。

Host 主动对当前数据发起完整校验，不为提交额外触发一轮 Reaction，也不要求历史 Reaction 成功。Schema、全部适用 Constraint、必要外部义务及输出要求通过后，可提交该次证明对应的数据快照。必须成立的业务关系应表达为校验约束，不能只依靠联动成功维护。联动 Outcome 与完整校验结论分别报告；校验通过不把熔断改记为正常收敛。若数据已无法可靠读取或校验机制不可用，则无法证明合规，不允许据此提交。

这是同日后续用户讨论确认，替代先前“Readiness 要求相关 Reaction 可信收敛”及“熔断后提交交接待决策”的方向；旧来源保留追溯。用户明确 Reaction 与提交分离，随后确认熔断收窄为联动暂停、保留业务交付通道。错误码、恢复 API、通知重入、结果 SDK 与真实性能未因此完成。详见 [联动错误](l3-reactive-engine.md#l3-errors)、[完整校验](l3-validation.md#validation-completeness)、ADR-FE-009 / 010。

### 原贯穿案例的提交门槛（已被替代）

以下保留原流程代码用于内容追溯，其中“核对相关联动可信收敛”已被本节结论替代，不再作为提交条件；现行全局流程仍见整体架构。

```text
Preparation → Prepared Form / Profile Bundle
Host        → Initialize(initialData)
Runtime     → Working Data / Scope / 注册规则 / 显式首次激活
Runtime     → 执行已入队初始规则 / 提供稳定 snapshot 与执行观察
Host        → 按需选择快照和时点 → 自行保存业务 Baseline / Dirty / Reset 策略
Renderer    ← 当前数据、Props 与 Field State

User        → Change insured.age
Renderer    → Binding Adapter → 受控 Command
Runtime     → 即时 Data Change / pending 合并 / Constraint 失效
Runtime     → 延迟启动同步 Flush / 最新状态 Reaction / 内部同轮写回
Runtime     → 正常收敛后根 Schema + 本轮 Constraint 链 → Source / 字段 Issue 聚合
Renderer    ← 按框架订阅读取最新 Data、Props、Field State 与诊断

Host        → 观察报价依赖 → Business Service
Business    → Quote Response
Host        → 适用性检查 → 外部展示，或显式 Command 回写

Host        → 执行已声明外部校验 → 上报结果
Runtime     → 检查义务与依赖有效性 → Report / Readiness / Output
Host        → 核对相关联动可信收敛、当前输出、校验与业务条件 → 实际提交
```

## 2026-10-19：Reaction 顺序与宿主任务边界 {#reaction-order-host-update}

本轮用户指出，年龄与活动条件共同影响保费时，应作为一个业务计算；接口报价由 Host 自主管理，不应由 Reaction 理解不断扩大的宿主能力。多条规则争写保费的例子不足以证明需要规则前后依赖。

2026-10-19 已确认：Reaction 不声明彼此前后依赖、业务优先级或拓扑调度关系。一个完整业务计算优先在同一 Reaction 内表达；跨 Reaction 通过真实 Data Change 与自身 Watch 自然级联。业务不应依赖无关规则谁先执行，稳定调度顺序用于复现与排查，不是业务排序手段。多条规则竞争覆盖同一字段、结果依赖最后写入者时，先检查规则拆分与数据模型，不新增优先级或冲突仲裁协议。

Pending 按具体 Reaction 实例去重，执行时读取最新输入；取出执行后再次被有效变化命中仍可重新入队。不承诺任意冲突配置都与顺序无关，也不改变同一 then[] 内显式 Command 的有序语义。具体队列实现和同步通知重入保护仍待固化。

Reaction 仅承担协议内同步联动，不理解网络请求、取消、重试、超时或业务结果适用性。Host 自主管理报价等异步能力：观察所需数据、合并业务任务、管理请求及乱序返回，再通过普通 Command 写回。Reaction Pending 去重只针对 Reaction 实例；Host 请求是否合并由 Host 决定，不强制共用队列，也不新增异步 Reaction 或通用宿主任务调度协议。既有语义事件与 External Validation 接入职责不因此扩展为 Reaction 请求执行器。

本结论没有确认稳定队列的具体算法，也没有解决同步订阅回调重入。现行设计见 [Reaction](l3-reactive-engine.md#l3-reactions)，总账见 [ADR-FE-006](decisions/ADR-FE-006-command-flush.md)。

## 2026-10-19：同步回调写回归当前 Flush {#flush-callback-update}

用户澄清 Pending 与 Flush 的关系：Pending 用于执行前合并任务，不能将当前轮新增工作误解为下一轮。

同步订阅回调在 Flush 执行期间再次通过 Command 写入数据，写入立即生效，由此产生的联动直接归当前 Flush 处理，沿用本轮去重、执行计数与熔断预算；不另开一轮、不重置预算、不再次延迟启动。Flush 尚未开始时，Pending 用于汇集同步修改和快速交互的重复触发，再统一启动；当前轮真正结束后的新修改进入后续轮次。执行器内部的待执行集合只是当前轮的工作集合，不等于下一轮或一个新的调度阶段。

不新增独立的“通知先入队、回调返回后再交付”机制要求，也不新增第二套通知熔断协议。实现验收须证明同步回调写回不绕过现有整轮保护、不因嵌套调用失控；具体内部容器和调用栈处理属于实现细节，不能把它重新列为未决业务行为。

本结论替代先前“同步外部重入推荐归当前轮、策略待确认”的表述，并撤回讨论中新增通知队列的建议。数组整体替换身份问题尚未讨论，不在本次结论范围内。现行设计见 [Flush 时序](l3-reactive-engine.md#l3-flush)，决策总账见 [ADR-FE-006](decisions/ADR-FE-006-command-flush.md)。

### 原流程图的待定标记（已被本轮确认替代）

下列原图保留追溯；其中通知重入待定标记已失效，现行图已同步确认同轮处理。

```diagram
{
  "id":"figure-transaction",
  "title":"图 5 · Command / Flush：即时数据更新与联动收敛",
  "flow":true,
  "rows":[
    [{"title":"Operation → Command","body":"保留来源与显式动作次数；batch / then 按序执行"},{"title":"即时更新 Data + Scope","body":"不可变 Root、结构共享；单次结构操作内部一致"},{"title":"索引候选 → 观察值比较","body":"临时前后 Data / Scope；只投递失效标识与必要 ChangeId"}],
    [{"title":"延迟启动同步 Flush","body":"逐 Command 检测与 pending 去重；执行时读最新 Data / Scope，内部写回留在本轮"},{"title":"收敛或保护停止","body":"同值短路、次数预算；可隔离错误继续独立行为；超限整体停止，保留已写数据"},{"title":"追踪 / 通知 / 释放","body":"临时有序事实与 Change 来源；异常提取报告；通知重入待定","major":true}]
  ],
  "arrows":["↓"],
  "note":"取代早期候选树 / 整组原子提交议题图，保留原图 ID。Flush 不提交或回滚整轮数据；默认 batch 非原子。单命令可隔离错误继续、整体熔断已确认；精确排序、通知重入和 Pending 再触发仍待固化。"
}
```

```diagram
{
  "id":"figure-l3-flush",
  "title":"即时写入与一轮联动收敛",
  "rows":[
    [{"title":"Operation → Command","body":"同步更新不可变 Root 与 Scope；按有效变化匹配依赖"}],
    [{"title":"idle → scheduled","body":"首次出现 pending 后安排一次启动，并建立 Context 保存起点"}],
    [{"title":"flushing · 取出实例","body":"从 pending 移除，读取最新 Data，求值 when，按序执行 then","major":true}],
    [{"title":"当前轮继续","body":"内部有效修改追加失效；同实例执行后可再次入队"},{"title":"本轮结束 / 停止","body":"队列空或整轮预算停止；可隔离错误继续，真实结果与异常报告分别记录"}],
    [{"title":"释放本轮 Context","body":"正常不留生产完整历史；异常先向 Host 提取报告；Devtools 自行保存"}]
  ],
  "arrows":["↓","↓","↕","↓"],
  "note":"Flush 是联动调度边界，数据在每条 Command 时已经生效。可隔离错误继续，超限整体中止；精确排序、通知重入和中止后 Pending 仍待固化。"
}
```

## 2026-10-19：整数组替换即创建新成员 {#array-replacement-identity-update}

整体替换数组即销毁旧成员实例并创建新成员实例，这是操作语义，不是按成本选择的默认优化。即使新旧成员数据完全相同，也不继承实例身份；不通过业务 ID、姓名、内容或深度比较识别旧成员。旧成员 Scope、规则与订阅释放，旧异步结果失去适用资格，UI 局部状态不自动继承；新成员按新实例激活策略处理。需要保留身份时使用字段修改、move 等明确保留原成员的操作。对深度匹配与重建的成本判断不构成实测结论，身份语义不依赖性能比较。

本结论将原 D19 推荐提升为已确认操作语义，替代按稳定业务 Key 自动复用整替换成员身份的候选方向。首次激活默认值和具体生命周期 SDK 仍待固化；没有新增协议字段或生产实现。现行规范见 [数组生命周期](l3-data-scope.md#l3-array-lifecycle)，总账见 [ADR-FE-007](decisions/ADR-FE-007-scope-comparison.md)。同轮协作规则确认：问题经用户明确确认后，自动完成现行主题、相关 ADR / 演进 / 治理与来源的增量归档、构建及检查，再继续下一个问题，无需用户另行要求归档；未确认建议不得写为共识。

## 2026-10-19：新 Reaction 默认不首次执行 {#reaction-activation-default-update}

新 Reaction 实例默认不因建立而执行；只有显式开启首次激活执行时才在建立时入队。该默认值同时适用于引擎初始化、数组插入及整体替换后建立的新成员。初始化已有输入不伪造为新实例的一次 Watch 变化；建立之后的有效 Watch 变化仍正常触发。首次校验与首次视图读取有各自入口，不受此默认值控制。

用户指出默认执行的计算例子不足以代表实际常见需求；金额通常由数量 / 单价有效变化触发，出生日期派生年龄并非普遍需要。默认保留装载数据，清空 / 重置规则不把装载误当输入切换；少数初始化计算显式开启。本结论确认此前待定的首次激活默认值，不新增生命周期脚本，正式字段 / Schema / SDK 尚未冻结。现行见 [生命周期](l1/06-lifecycle-profiles.md#lifecycle)与 [Reaction](l1/04-command-reaction.md#reactions)，ADR-FE-008 同步修订。

## 2026-10-19：交互限制与数据校验分责 {#input-validation-boundary-update}

业务输入限制在交互入口落实；例如 maxItems=5 时界面禁用添加按钮，不发出插入 Command。数据层不依据业务 Schema 拦截写入：若 Host 导入或程序写入第六项，只要操作结构可执行，就写入 Working Data，再由 Validation 报告超限并阻止提交。目标不是数组、位置非法等结构性错误仍须拒绝，不能与业务校验失败混为一类。该边界统一适用于插入、修改和导入，保留暂时业务不合法的工作态，不增加逐 Command 业务预校验或事务机制。

用户先提出超限应拒绝且禁用按钮，随后明确认可在交互入口限制，数据层继续允许业务不合法输入。这是既有设计原则的澄清，修正 L1“受目标 Schema 约束”的歧义；不新增拦截流程。现行见 [Command](l1/04-command-reaction.md#commands)、[数据不变量](l3-data-scope.md#l3-data)，ADR-FE-006 与 REV-04 同步更新；位置语法与错误 SDK 仍待固化。

## 2026-10-19：校验专题的字段资格、完整等待与错误收集 {#validation-group-completion-update}

本组已确认：字段有效指其前置校验已经结束且该字段没有错误，不要求作者区分错误来自 Schema 还是业务 Constraint。有前置条件的任务后置执行，执行前核对实际前置已完成且通过；不能仅凭排在后面就当作前置通过。前置未完成或执行异常也不能按“无字段错误”放行。循环、自依赖和字段聚合导致的自包含仍须静态诊断，准确引用 / 实例绑定契约待固化，不据此扩展通用异步 DAG。

完整校验覆盖全部当前适用的同步和异步校验，只有全部完成且通过才能报告成功；不能把仍未完成或失败的异步校验当作可忽略的外部服务。无关报价、埋点等 Host 业务服务不属于校验等待范围。业务错误或执行异常不能报告完整通过，错误与未完成的具体组合编码仍待固化。

尽量收集独立规则的错误；失败只阻止以它为前置的后置任务，不终止其他独立校验。后置跳过不伪造业务失败；保留前置错误与真实执行诊断。此原则同时适用于同步与异步任务，不采用首错停止，也不因其他独立字段有错就一律停止全部远程校验。

用户明确完整校验应等待同步 / 异步全部结束，不认可把适用校验视作可选外部服务；此前助手的“只等待必要部分”建议不采纳。候选 requiredForSubmit 字段的迁移留待正式类型 / Schema 固化，样例本轮未变。用户关于“校验期间不会再输入”的判断对同步调用栈成立，对网络等待阶段不成立；后续处理策略尚未确认，不归档为已决策。现行见 [校验专题](l3-validation.md#validation-completeness)及 ADR-FE-010。

## 2026-10-19：异步校验重复调用在任务层处理 {#validation-task-replacement-update}

用户提出用版本管理或下一次调用取消上一次调用来处理重复异步校验，不需要扩展 Flush。

异步校验的重复调用在校验任务执行层处理，不扩展 Flush 或建立自动追赶的全局调度。同步校验完成后，异步任务可以继续在途；新输入按正常 Command → 下一轮 Flush → 受影响校验路径处理。同一规则实例再次发起校验时，可用版本 / 请求身份识别新旧任务，或撤销旧任务的适用资格并由 Host 尝试取消旧请求；不强制固定某一种实现。独立规则和其他 Scope 实例不因无关请求被替换而整体取消。

正确性要求是旧任务不能覆盖当前有效结果：输入 / 前置资格变化、实例销毁或新调用替换旧调用后，旧成功与旧异常均不得重新发布为当前结果。取消网络请求未必成功，调用替换时撤销结果发布资格与实际请求取消应分开；具体版本号、任务句柄与取消 API 属于后续实现 / SDK 固化。引擎不禁用编辑、不添加全局 Loading，相关交互由 Host 管理。完整校验仍等待全部适用同步 / 异步校验；被替换的调用不能冒充当前表单完整通过，准确取消 / 过期返回编码仍待固化。

本轮确认的是任务级处理边界，不强行选择版本字段或取消接口，也不把曾提出的全表自动追赶 / 编辑锁定写为共识。现行见 [异步有效性](l3-validation.md#validation-async)，总账见 ADR-FE-010。

## 2026-10-19：校验代次与可选取消句柄 {#validator-cancel-handle-update}

用户明确版本有效性比取消重要，取消不保证成功，并授权助手选定接入方案。选定 Host 返回结果任务及可选 cancel 句柄，替代上一轮保留多种接入形式未选定的状态；版本 / 任务身份的具体物理表示仍为实现选择。

External Constraint 接入选定“Host 返回结果任务及可选 cancel 句柄”。引擎按具体 Constraint 实例管理调用代次 / 任务身份，输入或前置资格失效、同实例新调用替换、Scope 删除及实例销毁时，先撤销旧任务的发布资格，再调用其可选取消句柄。成功与异常返回都必须核对实例存活、任务代次与输入资格；不能只依据全表版本变化取消无关任务，也不能仅比较值相同就接收 A→B→A 的旧请求。

版本与结果有效性是必要正确性契约；取消是尽力而为的资源优化，Host 可以不提供，也不保证网络请求终止。Host 负责实际请求及取消实现，引擎不理解 HTTP / 重试。取消回调要求幂等，任务完成或退出后释放句柄；取消异常只记诊断，不中断其他任务清理或恢复旧任务资格。被主动取消的旧任务不得再发布业务错误或成功，相关诊断与正常网络故障区分。

该能力属于运行时 Host Validator 接口，不将回调写入 L1 或可序列化 Prepared，也不引入异步 Reaction。本次不新增跨端取消信号抽象。完整调用的取消 / 过期返回类型、具体代次编码与 SDK 仍需固化，但不再重新选择取消接入方向。

比较过 Host 全权取消、Host 返回句柄、引擎传取消信号。选择句柄使引擎复用已知任务生命周期，又保留 Host 对具体请求的控制；目前无需新建跨端信号抽象。同步现行校验、Host 接入及 ADR-FE-010，不修改候选 Schema 或生产实现。

## 2026-10-20：Host 能力名称、降级与业务输出 {#host-output-update}

校验规则 ID 标识声明与运行实例，Host Validator 使用独立、语义明确的能力名称，规则显式引用能力名称，不按规则 ID 猜测实现。不同校验语义使用不同能力名称；多条规则需要同一校验语义时可以引用同一能力，各自实例、代次与错误来源仍独立。具体引用字段、参数与签名在正式类型 / Prepared 契约中固化，本轮不伪造候选 Schema 已支持新字段。

Host 能力缺失按用途降级，开发 / 调试端明确报诊断，用户端不暴露未注册能力名、堆栈等技术错误，不因局部能力缺失默认阻止表单填写。可选埋点等可跳过，业务操作的降级由 Host 决定；适用校验器缺失必须记为未完成，不能静默当作通过。用户交互由 Host 以业务语言承接，用户无感知不等于伪造完整通过或放行未校验数据。

引擎完整校验只证明对应 Working Data 满足表单声明的全部适用校验，并向 Host 交付对应数据快照与结果身份；不负责构造或验证另一个业务请求输出。Host 自行转换、组装业务请求及执行所需输出检查，转换失败属于 Host 业务交付错误，不回写或改写引擎已完成的表单校验结论。表单业务本身需要正确的数据应在配置的数据模型、Binding、同步联动和约束中表达，不依赖提交时隐式修正。Normalized Output 如保留该术语，仅表示 Host 构造的业务提交数据，不是 Runtime 的第二份核心状态或新的通用输出 DSL。

用户拒绝按规则 ID 查找校验器，认可按用途降级并区分开发与用户体验，明确业务转换归 Host，表单业务自身的数据应在配置中正确表达。比较与决策见 ADR-FE-012；修订旧“Runtime 规范化输出 / 输出有效性”职责，旧来源保留追溯。引用字段、注册签名、错误码、结果 SDK 尚未冻结。

### 旧全局流程呈现（输出职责已被替代）

以下原图 / 流程用于保留检查与追溯，现行以整体架构和 ADR-FE-012 为准。

```diagram
{
  "id":"figure-interaction",
  "title":"图 7 · Interaction Timeline：投保录入的端到端路径",
  "rows":[
    [{"title":"01 · 准备定义并初始化","body":"Host 明确初始数据，L3 用 Prepared 建身份与规则，新实例按 runOnActivate；Host 按需读取 snapshot 自选业务基准"}],
    [{"title":"02 · 建立可观察状态","body":"明确入口处理初始校验；L4 挂载年龄字段与父条件观察者，读取数据、Props 和 Field State"}],
    [{"title":"03 · 用户修改被保人年龄","body":"Binding Adapter 提交 Command，即时发布新 Root 与一致身份；有效变化匹配观察者"}],
    [{"title":"04 · 联动收敛与消费者响应","body":"Reaction pending 合并并同步收敛；随后根 Schema / 本轮 Constraint 校验，字段 Issue 聚合；父条件按订阅响应"}],
    [{"title":"05 · Host 决定是否重新报价","body":"Host 自主管理请求，检查返回结果仍适用于当前实例和依赖"}],
    [{"title":"06 · 展示报价 / 受控回写 / 提交","body":"结果按适用性展示或 Command 回写；相关联动可信、校验有效后构建输出，再由 Host 核对许可提交"}]
  ],
  "arrows":["↓","↓","↓","↓","↓"],
  "note":"图示反映即时写入与独立 Flush；可隔离错误继续，预算超限整轮停止；通知重入与 SDK 方法名待固化。父条件成立后 L4 挂载监护人子节点并订阅；正常联动后校验方向已确认；外部请求时机、通知重入和 SDK 仍待固化。"
}
```

```text
Preparation → Prepared Form / Profile Bundle
Host        → Initialize(initialData)
Runtime     → Working Data / Scope / 注册规则 / 显式首次激活
Runtime     → 执行已入队初始规则 / 提供稳定 snapshot 与执行观察
Host        → 按需选择快照和时点 → 自行保存业务 Baseline / Dirty / Reset 策略
Renderer    ← 当前数据、Props 与 Field State

User        → Change insured.age
Renderer    → Binding Adapter → 受控 Command
Runtime     → 即时 Data Change / pending 合并 / Constraint 失效
Runtime     → 延迟启动同步 Flush / 最新状态 Reaction / 内部同轮写回
Runtime     → 正常收敛后根 Schema + 本轮 Constraint 链 → Source / 字段 Issue 聚合
Renderer    ← 按框架订阅读取最新 Data、Props、Field State 与诊断

Host        → 观察报价依赖 → Business Service
Business    → Quote Response
Host        → 适用性检查 → 外部展示，或显式 Command 回写

Host        → 执行已声明外部校验 → 上报结果
Runtime     → 检查义务与依赖有效性 → Report / Readiness / Output
Host        → 核对当前输出、完整校验与业务条件（不以 Reaction 成功为提交门槛） → 实际提交
```

## 2026-10-20：输入复制、只读契约与开发冻结 {#data-copy-freeze-update}

用户认可按观察位置比较，并接受输入复制、读取只读约定、开发环境冻结；本轮追问冻结对内部操作的影响与复制成本。

外部输入的对象 / 数组值进入引擎时复制，解除 Host 原对象与内部数据的可变别名；内部以不可变 Root 和结构共享更新。read / snapshot 返回只读契约，不在生产环境为每次读取深拷贝或默认增加代理。开发环境递归冻结引擎持有的业务数据，捕获误写，不冻结 Host 原对象、Scope Index、Pending 或其他内部可变管理结构。Command 必须先构造修改路径上的新容器再写入，不能原地修改冻结的旧对象或数组；新数据发布前冻结，未变化且已保护的共享子树可复用。生产环境违反只读契约属于错误使用，不保证绕过 Command 修改后的状态正确。

对 JSON 树形输入，复制耗时与新增内存均为 O(n)，n 是本次传入值的规模：初始化整表按整表规模，替换大数组按该数组规模，标量写入没有深拷贝子树。不是每条 Command 深拷贝全表。路径容器复制另受路径深度及各容器宽度影响，不能宣称固定 O(depth) 或常量成本。开发冻结遍历所保护数据，首次全量通常 O(n)，后续应跳过已冻结共享子树；Object.freeze 仅浅冻结，嵌套保护需遍历。实际延迟与峰值内存须由目标设备基准测量，未做生产实现或性能测试。

选择折中防御，避免只靠输入对象所有权约定，也不为所有读取付深拷贝成本。现行 L3 与 ADR-FE-007 已同步；数组双定位仍为建议，未将倾向当作正式确认。

## 2026-10-20：数组数字与锚点位置 {#array-position-update}

用户明确确认目的位置两种都支持、移动选择最终下标、位置失效明确失败。

数组插入 / 移动的目的位置同时支持数字下标与稳定成员锚点（成员之前 / 之后）。移动对象按稳定成员身份指定，数字只描述目的位置；位置在 Command 实际执行时按当时数组解析。移动的数字目的位置指移动后的最终下标，例如 [A,B,C] 中将 A 移到 2，结果为 [B,C,A]。长度为 n 的数组插入位置为整数 0…n，n 表示追加；已有成员在同一数组内移动的最终下标为整数 0…n−1。

位置越界、非整数、目标锚点已删除或不属于目标数组等位置失效必须明确返回结构性失败，不自动夹到首尾，不回退追加或猜测其他成员。单次操作在解析 / 校验位置后再一致更新 Data 与 Scope，失败不留下半完成的移除状态；失败不回滚 batch 中先前已成功的其他 Command。锚点与数字位置共用同一结构执行机制，正式字段 / Union、错误编码及精确返回结构继续固化，不新增命令种类。

候选比较见本轮讨论：单一下标、单一锚点、双定位；移除前间隙与最终下标；失败与自动纠正。采用双定位降低接入转换成本，采用最终下标消除偏移歧义，拒绝失效位置避免静默修改意图。移动到自身 / 原位置的精确无变化处理未在本轮单独确认，留待正式边界用例固化，不扩大已确认范围。L1 / L3、ADR-FE-007 与治理已同步，样例及生产实现未变。

## 2026-10-20：L1 严格固化策略 {#l1-strict-update}

协议结构采用严格检查：未知字段、混用多个 Union 分支及不符合当前分支的字段在配置 / 编译阶段拒绝，不静默忽略或仅警告后继续产出可执行制品。严格范围是协议节点；Working Data、metadata、Schema 和物料 Props 等各按所属数据 / Manifest 契约检查，不能把业务字典的任意键一律当未知协议字段。

ValueSpec 位置的 $expr / $literal 为保留标记键。出现标记键必须按对应包装校验，包装结构不合法直接诊断，不退回普通对象；需要原样保留含这些键的数据时用 $literal 显式转义，其内部不再递归解释。只在类型规定的 AST / ValueSpec 位置解析，不扫描 Working Data、业务 Schema 或 Literal 原文。Expression 的 literal 与 ValueSpec 的 $literal 属于各自语法位置，不混用。

跨 Template 参数、Binding Port、函数参数等类型连接，仅接受明确可判定且能证明兼容的结构；已知不兼容与无法证明兼容均拒绝编译，但诊断码 / 原因应区分。不用运行时兜底、作者强制断言或静默降级绕过连接检查。受限的是静态连接兼容检查能力，不将业务数据根 Schema 改成局部 Schema，也不声称任意 JSON Schema 包含关系均可判定。可判定子集、Union 完整形状、签名与正反例仍需正式固化。

比较未知字段忽略 / 警告 / 拒绝、标记完整匹配回退 / 保留键 / 全包装、兼容无法证明时拒绝 / 运行时检查 / 作者断言，用户确认 C / B / A，以业务稳定和正确性为优先。相关正文及 ADR-FE-002 增量修订，正式类型和样例尚未落地。

## 2026-10-20：L2 JSON 交付与编译错误准入 {#l2-delivery-update}

首阶段 Prepared Artifact 采用 JSON 交付，Form / View / Dependency Plan 保持逻辑分工，不要求拆为多个文件。传输压缩不构成另一套协议；不同时建设二进制格式，只有性能证据出现后才另行评估。具体字段、确定性序列化及摘要覆盖对象继续固化，JSON 方向确认不等于完整 ABI 已冻结。

首阶段 Runtime 只接收与其声明支持格式精确匹配的 preparedFormatVersion；不按 Compiler 版本号推断兼容，也不默认接受版本范围或增加 feature 组合协商。目标平台、Profile、能力锁及 Host 接入检查分别执行，格式匹配不代表所有能力必然可用。不兼容或无效制品拒绝进入执行，不回退解释 L1。

编辑、协议入库校验与发布使用同一 L2 分析能力，尽早返回具体源位置、错误码、严重程度和可读原因。编辑器可取得不完整配置的诊断 / 符号等分析信息，但存在 Error 时不得生成可执行 Prepared，不将错误协议作为可用入库 / 发布制品，也不跳过错误节点拼成部分可执行表单。Warning 可伴随成功制品，不能把已规定拒绝的静态错误降为 Warning。错误草稿能否临时保存属于后续 Studio / Platform 范围，不在本轮另定策略。

C 端只消费检查通过且兼容的 Prepared，错误分析结果不能传给 Runtime 继续执行。运行时仍核对格式、目标与能力，保留输入校验、任务有效性和熔断等保护；静态编译不保证网络、Host 实现或业务输入永不出错，Host 能力缺失仍按 ADR-FE-012 的用途降级，不能伪造校验通过。

用户认可三项建议，并强调编辑 / 协议入库时发现错误、提供具体修复信息，C 端不带静态错误继续执行。L2 与 ADR-FE-004 / 011、治理同步；不创建正式制品类型或二进制格式，具体 ABI 与实现验收仍未完成。

## 2026-10-20：L4 以组件与 Adapter 重整 {#l4-component-adapter-update}

用户认可分层适配但未接受候选模块职责，要求以组件开发原则重整：订阅 Runtime 的状态输入 Props，事件通过指令写回，内部交互状态可自持。

L4 以物料组件及其 Adapter 为接入单位。Adapter 按 Prepared 配置与当前 Scope 订阅 Runtime 提供的相关状态变化通知，读取当前值、校验结果及动态配置并组装组件 Props；组件渲染与内部差异比较由平台框架处理，不在协议中另建整表 / 节点 / 属性 / 字段端口的更新分级。通知用于重新读取权威状态，不是要求 L4 重放事件以维护第二份业务数据。

组件接收的表单业务数据与校验状态以 Runtime 为唯一权威来源；事件经 Adapter 转成既有 Command 调用 Runtime，数据更新再经订阅反馈到 Props。局部框架缓存只是当前 Props 的呈现，不是独立业务 Store。组件可持有焦点、输入法组合态、展开 / 收起等内部交互状态，其交付边界后续明确。Host 业务操作仍由既有 host.emit 路径交给 Host，不将所有事件一律变成数据 Command。

保留既有 bindings 作为“组件使用哪些数据”的具名映射，不新增所谓字段端口、端口级 Controller 或独立匹配引擎。单字段或多字段控件都由 Adapter 将相关数据组织成实际组件 Props，并将组件事件映射为受控指令。Renderer 负责物料树的装配，Scope 关联与订阅释放等职责需要继续讨论，不强制拆出 View Controller / Binding Controller 类或固定包层次。

助手此前提出的 View / Binding Controller、节点 / 属性 / 端口更新分级、局部一致投影均未被采纳为新体系；旧 FieldController 草图只保留追溯，不作为现行接口。已有 L1 bindings 映射保持，不借术语纠正静默删除协议字段。模块完整方案、输入解析、生命周期与失败契约仍待设计，未标记 L4 完成。现行见 [L4](l4-renderer.md#renderer)。

## 2026-10-20：共用 Adapter，不设置物料专属映射 {#shared-adapter-update}

Adapter 是共用的引擎接入能力，不为每个物料编写独立数据 / 事件映射适配器。物料遵守统一的组件接入约定：共用 Adapter 按 Prepared 配置与当前 Scope 订阅 Runtime、读取相关状态传入 Props、提供既有指令调用能力，并管理订阅生命周期。姓名、日期范围等物料的输入事件、第三方组件库 Props 差异和临时交互在物料组件内部实现，不把这些差异注入共用 Adapter，也不另建可配置事件转换语言。具体统一 Props、绑定值和指令 API 尚待讨论，不将前轮“物料专属 Adapter 映射”当作已确认方案。

用户否定按物料补充 Adapter 映射，明确物料差异由组件内部处理；助手撤回该候选，用户确认后继续讨论。Renderer 统一展开配置树的候选本轮未单独确认，不据此固化全部职责。现行见 [L4](l4-renderer.md#renderer)。

## 2026-10-20：Adapter 封装共性绑定、指令与求值 {#adapter-common-scope-update}

共用 Adapter 封装常规绑定读取 / 订阅、受控修改与其他已有指令入口，以及表达式值的取得。物料只实现自己的 Props 消费、呈现和交互，不要求逐个设计引擎接入映射，也不把普通 Props 的平铺 / 分组形式升级为需要用户决策的架构问题。具体调用签名由统一 SDK 固化。

表达式职责沿用 L2 静态编译、L3 统一求值的既有分工：Adapter 按 Prepared 配置调用求值能力并提供结果，不新增原始 L1 AST 解析器、依赖分析器或一套物料表达式语义。只有出现独特指令或特殊值读取的真实需求时，才明确它应复用现有受控接口、归 Host 业务能力还是需要另行确认扩展；不预先引入任意脚本、直接可变 Store 访问或新的通用指令 DSL。

用户指出上一轮两个方案比较不够具体，要求以共性封装为原则，物料特有实现通常不属于引擎设计问题。未确认 Props 分组或具体回调字段，未新增特殊指令体系。现行 L4 与跨层求值边界同步；具体 SDK 与真实交互轨迹继续设计。

## 2026-10-20：输入交付与编辑完成的唯一状态源 {#input-handoff-update}

普通字段编辑统一采用当前输入交付 Runtime 的方式，不能只因输入暂时不符合 Schema 就保留旧合法值。物料能解析为目标值时写入相应 JSON 值，尚不能解析为合法目标值时可写入当前输入文本作为业务不合法工作值；例如数字字段由 12 编辑成 -，Working Data 可为字符串 "-"，由 Schema / Constraint 报错，不使用 NaN / undefined 表示该输入，也不新增独立 Incomplete 状态。具体解析与显示格式由物料内部实现，共用 Adapter 只封装绑定、指令与 Prepared 求值。

带明确确认动作的交互（例如日期弹层选择后点击确定）可在组件内部暂存未确认选择，确认时才通过既有指令写入 Runtime；取消不提交该选择。这是组件交付时机的选择，不构成第二套引擎临时数据或表单级草稿机制。输入法组合等内部状态同样按组件交互管理，不把每一段内部编辑过程强制解释为已交付业务值。

编辑完成后，展示值必须以 Runtime 当前状态为准，可按组件格式化呈现但不得继续展示另一份独立业务值。运行时写入结果、校验状态与后续修改通过既有订阅反馈给组件；非法输入可继续展示并报错，不能自动回退上一次合法值或让组件显示新值而引擎无声校验旧值。不增加提交前收集全部组件临时值、通用 Codec 生命周期或独立临时状态管理层。

用户确认统一采用方案 B；日期选择后确定属于组件内部交互，只改变写入时机；强调编辑结束展示 Runtime 状态。L4、L1 数据、L3 校验、ADR-FE-003 与治理同步。L4 状态调整为部分完成仅表示专题已有已确认部分，首次订阅读取 / 改绑、卸载和失败契约尚未闭环，不宣称可直接实现的完整 SDK。

## 2026-10-20：Adapter 生命周期与单物料异常 {#l4-lifecycle-error-update}

共用 Adapter 统一管理组件侧生命周期、当前 Scope 关联、订阅 / 监听与回调释放，以及 Runtime 数组成员移动、删除、整体替换在视图侧的对应处理。实际数组 Command、Data 与 Scope Identity 的一致修改仍归 Runtime；不把数据操作实现搬到 L4。成员移动保持原 Scope 关联，删除 / 整替换使旧关联失效，Profile 切换只替换视图接入。

卸载或改绑时，Adapter 释放旧监听、订阅与可解绑回调，不要求每个物料重复处理共性生命周期。正确清理后旧回调通常不再触发；已经被排入外部队列或不能物理撤回的调用仍可能迟到，必须按旧组件 / Scope / 关联身份拒绝，不得使用新的绑定上下文写入其他成员。该检查属于 Adapter 实现保护，不建立新的运行时任务队列或要求用户配置。首次订阅读取与改绑交接应不漏更新，具体平台实现由契约测试验证。

单个物料的运行错误在对应物料边界隔离，保留其他可用物料及 Runtime 数据，不因一个物料报错默认停止整表。失败位置须有降级展示，同时提供错误上报与告警接入，报告关联物料 / 配置位置 / Scope 等必要定位信息，用户端不暴露堆栈等技术错误。降级不能静默继续显示旧数据并伪装正常交互；失败物料的不可用交互停止，其他物料继续。错误边界、展示与上报的共性机制由 L4 平台实现 / 共用接入落实，不要求物料自行捕获所有错误；具体展示样式与监控服务由平台 / Host 接入。

用户强调正确解绑后不应再触发旧回调，同时明确过期调用必须拒绝；不将低概率迟到事件夸大为新调度机制。单物料隔离、降级展示、错误上报 / 告警为明确共识。L4、跨层依赖、ADR-FE-003 与治理同步，平台代码、错误捕获覆盖和监控服务均未实现验收。

## 2026-10-20：停止碎片追问，整合方案准备编码 {#design-consolidation-update}

用户要求合并同类问题、保持已确认原则并加快完成设计。将 L4 既有职责、输入、生命周期和异常原则整合为[完整流程](l4-renderer.md#implementation-contract)，治理增加[契约与编码准备清单](governance.md#implementation-readiness)。没有新增业务机制或选定主端技术栈，没有创建正式协议包或将 Platform / Studio 标成完成。后续由维护者交付成组契约草案与正反例，只对真实新行为 / 冲突请用户取舍。

## 2026-10-20：先提供 L4 完整草案统一审阅 {#l4-full-draft-review}

用户要求先完整呈现 L4 草案，再集中讨论疑问和决策；不继续碎片式提问。将既有完整流程整合为 [11 项模块草案](l4-renderer.md#implementation-contract)，区分已确认原则与模块组织 / 接入信息等草案。无新增确认决策，不把草案归为已发布 SDK；既有字段控制器片段仅供追溯。

## 2026-10-20：L4 行为专题收尾 {#l4-behavior-closure}

用户指出 Adapter 还应包含独立卸载流程，整体草案与已有讨论基本一致，要求无新增问题则继续下一轮。现行 [收尾说明](l4-renderer.md#l4-design-closure)明确挂载、更新 / 改绑、卸载，卸载清理及过期调用保护沿用已确认原则，无新增行为决策。L4 行为专题收敛，SDK / 接缝 / 平台实现与端到端验收继续保持未完成；下一轮可进入 Platform / Studio 完整范围设计，不将其作为核心编码统一前置。

## 2026-10-20：Platform 先草案、后集中确认 {#platform-draft-review}

用户确认后续每一部分先完整输出草案、标注需确认内容，再集中给观点与确认，无问题则归档。该流程写入 AGENTS。提供 [Platform 完整草案](platform-studio.md#platform-draft)，P1 范围、P2 错误编辑草稿、P3 发布控制、P4 获取入口均为候选；没有新增 accepted ADR 或将 Platform / Studio 标成完成。既有 L4 已归档，本轮不重开编译、发布锁与 Host 边界。

## 2026-10-20：先完整规划，评估 Agent 能力 {#agent-capability-planning}

用户要求完整能力先于首期划分，并认可能力域框架；后续提出评估 RAG、记忆、知识库、A2A、多 Agent、A2UI 与流式体验。添加[候选能力规划](platform-studio.md#agent-capability-plan)，核对官方协议语义并提出平台治理 / 独立执行 / Host 接入建议。未将用户的评估问题提升为同意改变四层边界或自建 Agent 平台；不选框架，不创建执行代码。下一步先审阅总体边界与能力覆盖，再细化完整业务流程，最后裁首期。

## 2026-10-20：Agent 退回后续方向 {#agent-deferred}

用户澄清 Agent 可放后续，不需要先完整规划和建设；先做好动态表单业务，再看 Agent 能赋能什么。前轮助手的全面能力展开超出当前推进需要，未成为已确认架构，现已从现行平台方案移除，仅保留未来方向。没有改变既有四层边界，没有新建 Agent 执行器或待实现前置。

### 前轮未采纳的完整 Agent 候选（仅追溯）

以下保留当时分析，不是当前建设范围，也不要求后续逐项确认。

### 当时的 Agent 候选规划

状态：用户提出评估 RAG、记忆、知识库、A2A、多 Agent、A2UI 和流式交互的纳入范围，以下为完整规划建议，未确认新增架构层、框架或首期范围。应先规划完整能力与职责，再划最小闭环；前文 P1–P4 的首期选择暂不作为当前确认议题。现有 L1–L4 边界继续有效，不因候选规划直接新增异步 Reaction 或通用请求 DSL。

#### 1. 候选组织与取舍

| 方案 | 组织方式 | 代价 |
| --- | --- | --- |
| A 外部接入 | Agent、知识与编排均由外部平台管理，本平台只集成 | 核心最轻，但资产、发布、运行记录与权限治理分散 |
| B 平台治理 + 独立执行服务（建议） | Platform 管 AI 资产 / 版本 / 权限 / 观测，独立 Agent 服务执行，经 Host 对接 L1–L4 | 需要明确会话 / 任务与表单的边界，能复用已有 Agent / 检索服务而非全自研 |
| C 四层核心内建 Agent 执行 | 将模型、检索、编排直接放入 Reaction / Runtime | 改变同步确定性与职责，扩大解释 / 调度系统，不建议采用 |

独立 Agent 服务为横向执行系统，不直接命名为表单 L5，也不与 Form Runtime / Flush 共用状态机。产品能力可全部进入规划，但每项须区分本平台自有能力、外部集成与未来待设计，而非“全部加入核心”。

#### 2. 各层接入边界

| 层 / 范围 | 可规划能力 | 保持的边界 |
| --- | --- | --- |
| L1 | 表达表单数据 / UI / 约束；AI 结果通过既有数据、组件、Host 事件接入 | 不把模型输出当 Expression / Pure Function，不加入 RAG / Agent 循环 DSL |
| L2 | 校验 AI 生成 / 修改的 Definition、检查物料与引用、编译为 Prepared、回传可定位诊断供修正 | AI 生成内容无特权，错误或无法证明兼容仍拒绝；不能边收半截 JSON 边当成功制品运行 |
| L3 | 只读快照供授权读取，Agent 建议经既有 Command 写入、已有校验检查 | 表单数据仍唯一权威源；AI 写入须处理输入版本 / Scope 与用户并发，不能覆盖已变输入而不判断 |
| L4 | 对话、流式文本、任务进度、引用、建议确认及结构化 UI 物料；共用 Adapter 接入现有 Runtime | 流式显示是物料交互，不扩展 Flush；Agent 任务和网络仍归 Host / 服务 |
| Host / Agent 服务 | 模型调用、工具、检索、记忆读写、会话任务、A2A、编排、流式传输、取消 / 重试 | 不直接修改引擎 Store，不因网络任务引入异步 Reaction |
| Platform | 管理 Agent、模型 / Prompt / 工具 / 知识连接、版本发布、权限、评测、Trace / 成本、协议接入 | 资产身份与运行会话分开，知识源权限 / 更新与记忆生命周期需独立设计 |
| Studio | 自然语言生成 / 修改表单、知识辅助、诊断修正、配置差异审阅、Agent 配置与测试、运行调试 | 生成 / 预览不是发布；是否发布或执行业务动作仍走明确权限和既有流程 |

#### 3. 完整 AI 能力域

| 能力域 | 完整规划内容 |
| --- | --- |
| 模型与生成配置 | 模型接入、Prompt / 工具契约版本、结构化输出、限额 / 成本、可复现关联；框架 / 厂商暂不选型 |
| 知识库 | 文档 / 数据源接入、解析与更新、索引版本、权限过滤、来源与删除；可以集成外部知识系统 |
| RAG | 查询与检索、混合检索 / 重排、上下文构造、证据引用、效果评测；不是只建向量库 |
| 记忆 | 会话上下文、用户 / 任务长期记忆、读写时机、范围隔离、过期 / 删除；不混同知识库或表单 Working Data |
| 工具与外部连接 | 类型化业务工具、MCP 接入候选、凭证与操作权限、执行记录、业务确认；不与 L1 Command 任意合并 |
| Agent 执行 | 会话 / Run、步骤、工具调用、暂停 / 恢复、超时 / 取消 / 重试、人工交接与执行结果 |
| 多 Agent 编排 | 角色、顺序 / 并行 / 委派、结果汇聚、失败与预算控制；具体编排由 Agent 执行系统而非 Flush 承担 |
| A2A | 远端 Agent 发现 / 能力描述、消息 / 任务 / 产物、状态及流式更新、认证与任务适用性 |
| A2UI / 结构化 UI | Catalog 与版本、声明校验、Surface 生命周期、组件白名单、事件回传、数据映射与断流处理 |
| 流式体验 | 文本、引用、任务 / 工具状态、结构化内容渐进显示；事件序号 / 断流恢复 / 取消和版本适用性按执行协议设计 |
| 质量与治理 | 数据源和工具访问控制、资产版本、评测 / 回归、运行 Trace、引用追溯、告警 / 成本与可回滚发布 |

#### 4. A2A、编排与 A2UI 不互相替代

A2A 定义独立 Agent 系统的通信互操作与任务 / 消息 / 产物等信息，不替平台完成角色分工、调度和结果汇聚。多 Agent 可在单一执行服务内部工作，不强制每个子 Agent 暴露成 A2A 服务。

A2UI 定义声明式 UI 消息、Catalog 与渐进更新，不能直接视作本项目 L1。对话 UI 可作为独立 Surface / 物料消费；若希望生成本项目持久表单，则经明确转换生成 L1，再走严格 L2、Prepared 与 L4。不能假设 A2UI Catalog 与 Material Manifest 或两种协议的数据模型自动等价。

#### 5. 流式内容的三条路径

1. 文本 / 任务进度流：Host / Agent 服务管理流，组件显示，不逐 token 写入表单业务数据。
2. 表单数据建议：收集为完整、可解释的写入后，经授权和输入适用性检查走 Command；置信度 / 引用是建议元信息，不自动成为真实业务字段。
3. 表单结构生成：生成区维护未完成内容，完整候选通过 L2 后才形成可预览 / 发布 Prepared；可以未来按合法完整子块实现隔离渐进展示，但这是新增能力，不能绕过编译门槛或偷偷热改当前会话。

运行中的表单会话固定 Release 的既有约束保持；Agent 生成新结构不等于授权它原地修改已发布表单。A2UI 独立动态 Surface 如采用，需要自己的协议接入及生命周期设计，不借用 L1 错误包容模式。

#### 6. 贯穿示例（候选）

用户描述业务需求 → Studio Agent 检索物料 / 规则知识 → 生成 L1 候选 → L2 诊断 → Agent 修正 → 用户预览 / 审阅 → 既有发布流程。

用户填写时咨询资格 → Host 调用 Agent → RAG 返回带来源的解释 → 建议补全表单 → 根据当前输入版本决定是否交付 Command → Runtime 正常 Flush / 校验 → Host 决定真实业务操作。Agent 的解释不替代正式资格 Constraint 或服务端权威校验。

#### 7. 待确认的整体方向

- 是否采用 B：平台统一治理，独立 Agent 执行系统通过 Host 接入，保持表单四层内核边界？
- 是否将上述能力全部纳入完整规划，同时逐项区分自建、集成与延期，而暂不决定首期？
- A2UI 先作为独立 UI 协议接入，L1 表单生成仍通过编译；若需要动态修改当前表单结构，作为明确的新专题另议。

本节不代表已确认自建 Agent 平台，不创建生产代码、AI 执行器或新协议字段。

#### 官方协议与概念参考（2026-10-20 核对）

- [A2A 官方规范](https://a2a-protocol.org/latest/specification/)：Agent 间消息 / 任务 / 产物及流式交互。
- [A2UI Catalog](https://a2ui.org/concepts/catalogs/)与[协议说明](https://a2ui.org/specification/v0.9-a2ui/)：声明式 UI、组件契约与消息更新；这里只核对语义，不冻结接入版本。
- [Memory overview](https://docs.langchain.com/oss/python/concepts/memory)：短期 / 长期记忆概念参考，不据此选择框架。
- [MCP 官方架构](https://modelcontextprotocol.io/docs/learn/architecture)：外部工具 / 资源接入参考，不与 A2A 通信或内部编排混同。

## 2026-10-20：Agent 保留完整赋能规划，暂不建设 {#agent-planning-clarification}

用户指出不易找到前轮归档，并澄清后续能力仍可先讨论赋能与完整接入。助手将“后续建设”理解成“退出规划讨论”过度收缩，现恢复 [平台正文中的赋能 / 接入规划](platform-studio.md#agent-capability-plan)，不新增重复文档。前轮移入本历史的候选保留原样，撤回其已退出当前讨论议程的解释；当前不建设、先做好表单业务的优先级继续有效。没有将候选分层或任何 Agent 框架标为已确认。

## 2026-10-20：Agent 八层逐项排查与 HTML 展示 {#agent-eight-layer-review}

用户要求按模型基础、模型交互、知识增强、工具与 Skills、记忆与状态、Agent 编排、生产工程、评测与迭代八层补齐能力，明确 HTML 应可见。将完整清单归入 [现行平台主题](platform-studio.md#agent-eight-layers)，使用 Agent L1–L8 消歧表单四层；逐层列出表单场景、候选接入、产物验收与参考来源。知识 / 工具 / 状态 / UI / 评测训练为候选能力覆盖，不选 NestJS / LangGraph 或训练框架，不改变 Agent 后续建设与动态表单优先原则。

## 2026-10-20：核心建设主线与整体蓝图先行 {#core-first-blueprint}

用户在比较完整平台先行与核心引擎先行后明确选择方向二，并要求先把整体蓝图讲清楚、讨论清楚，不深入具体技术。本次确认建设主线与讨论顺序，不等于接受所有平台 / Studio / Agent 产品方案或开始编码。蓝图讨论稿最初复用平台主题，随后[完整迁入整体架构](architecture.md#product-blueprint)；六部分组织、工作流与阶段安排等待整体审阅。原 Platform P1–P4 和 Agent 组织候选继续待定；未修改四层边界，未新增 ADR，未选择技术栈。

## 2026-10-20：蓝图图示与阅读定位 {#blueprint-visual-placement}

用户要求将蓝图和能力以图的形式呈现在 HTML，并安排文档层级。将蓝图完整迁入整体架构，声明 relocated_sections 保留平台页旧书签；补双工作流与建设路径共享图示，能力图谱增加产品能力定位和专题入口。主线保持整体架构 → 能力图谱 → 独立专题，不另建摘要页。仅调整呈现和阅读组织，蓝图建议仍待确认；不新增 ADR 或改变架构状态。

## 2026-10-20：应用与工程架构先行 {#application-engineering-first}

用户明确先确定整个应用架构、预留服务、包和目录结构，再定技术栈 / 技术选型与工程化建设。[实现准备草案](architecture.md#application-engineering)集中覆盖应用、库、服务与数据所有权、仓库目录和工程交付要求；具体单仓、包名及服务组织均待审阅。工作顺序已确认，未创建生产目录或选择框架；不改变四层与 Host 责任。工程化规则先作为选型输入，具体工具随后决定，未新增 ADR 或提升模块完成状态。

## 2026-10-20：运行保障纳入蓝图，实现可后置 {#blueprint-operations-confirmed}

用户指出蓝图缺少可观测性、监控、问题处理与 Agent 辅助处理错误。随后明确确认纳入蓝图，并允许实现后置。将能力范围、贯穿职责、处理闭环与后续建设节奏归入[整体蓝图](architecture.md#blueprint-operations)，能力图谱和平台专题关联该入口。具体监控产品、接口、自动处置权限与部署仍待设计；不改变已有错误隔离、Host 上报与 Trace 预算原则，不将助手提出的全部实现细节视为已确认。此次为蓝图范围与节奏补充，未新增 ADR，模块完成状态不变。

## 2026-10-20：最外层目录认可，包边界继续讨论 {#outer-directories-confirmed}

用户明确认可最外层目录划分，要求进一步讨论包边界。现行[目录草案](architecture.md#application-engineering)标明仅 apps / packages / services / tools / tests / docs 职责已确认，子目录、单仓工具与物理包仍为候选。[包边界讨论](architecture.md#package-boundary-discussion)对初稿进行候选比较：共享格式范围收窄、Host 接入归属、物料与纯函数分发、测试支持及运行保障落点。具体调整没有获得确认，不提升为有效包规范，不创建代码包，不新增 ADR，既有分层责任与运行保障范围保持。

## 2026-10-20：TS / React 包边界与目录落地 {#ts-react-package-layout}

用户在认可包划分方向后明确本期先做 Web/TS、采用 React，将 Flutter 包置于顶层 packages-flutter，Web/TS 包直接放 packages；随后授权建立 .gitkeep 占位并统一同步文档。本次确认六个包目录与职责范围：protocol、compiler、runtime、renderer-react、materials-react、pure-functions；Host SDK、公开 testkit 和通用 renderer-core 暂不独立。当前只有目录占位，没有正式协议、SDK、构建配置或执行实现。后端、Flutter 和微服务拆分保留后续位置；Platform P1–P4 等产品行为未因此确认。

跨语言准备只保留统一协议来源、可交换 JSON、公开行为契约与可复用测试用例的方向；具体生成器、JSON Schema 子集、断言格式和跨端驱动仍待选型与实现。不为未来扩展提前建设通用生成 / 测试平台。重要边界记录在 [ADR-FE-013](decisions/ADR-FE-013-ts-react-packages.md)。用户另要求完整专题讨论收敛后统一归档，撤回此前逐段保存候选的维护节奏。

### 原七项候选与后续包族比较（历史，不再作为当前目录）

以下保留先前草案的职责、约束与目录，便于追溯 contracts 收窄、Host 接入归属、UI 与纯函数分别交付、测试支持不立即公开等理由。它们从未成为已确认的生产包方案；现行结构见[项目架构](architecture.md#application-engineering)。

#### 原七项候选

| 包 / 逻辑单元 | 内容与边界 |
| --- | --- |
| contracts | Definition、Prepared、能力 Manifest 及诊断等跨模块契约，按子域组织；无 Runtime 实例、框架或网络实现。Prepared 属于编译消费契约，不因同包而归入 L1 |
| compiler | L2 解析、静态分析、依赖准备与产物生成；依赖契约及静态能力描述，不依赖 Runtime 执行实例 |
| runtime | L3 数据 / Scope、求值、Command / Flush、校验与运行事实；无 UI、网络及平台持久化 |
| renderer | L4 共用 Adapter 与主端呈现，消费 Runtime 公开接口；框架确定后决定平台子包，避免预建多端空包 |
| host-sdk | 生命周期装配、Host 能力注册及业务应用接入便利接口；实际请求和业务流程由宿主实现，不提供通用异步调度器 |
| capabilities | 基础物料和纯函数按能力类型分区，Manifest 与实现分开；按真实分发需求再拆包，不能打包成浏览器 UI 与服务端互相拖带的单一制品 |
| testkit | 共享语义向量、契约断言和接入测试工具，只作为开发依赖；业务样例不是生产协议规范 |

依赖方向：contracts 为共同基础；compiler / runtime 不互相依赖生产实现；renderer 与 host-sdk 只通过 runtime 的公开契约消费能力；应用在顶层装配。物料通过 Adapter / Host 提供的接口协作，纯函数保持同步确定性。L2 只读取能力契约，不导入 UI 组件实现。若出现跨包共享算法，先明确唯一所有者与必要性，再决定内部共享模块，不预建万能 shared / utils 包。

所有包只能通过声明的公共入口消费，不跨包深层导入，不从核心库反向导入 apps / services。库使用与包分发的目标环境按实际消费者定义；核心无 UI，不代表所有包都必须运行于所有环境。

#### 当时提出的六个包族调整候选

用户认可最外层目录，要求继续讨论包边界；上表七项只是初稿，不代表七个独立发布包均已接受。以下为本轮完整候选调整，不与初稿同时生效，不据此创建代码目录。

**划分依据（建议）：**先识别谁消费、负责什么及运行环境，再判断公共入口与独立构建 / 发布的必要性。包内部模块、独立导入入口和独立发布包不是一回事；责任独立不要求每项能力独立成包。分包应解决消费者或依赖隔离的问题，不能仅依据 L1–L4 的编号或内部模块数量。

| 候选包族 | 对外责任与消费者 | 明确排除 / 内部边界 |
| --- | --- | --- |
| protocol | 作者、编译器、Runtime、创作工具共同使用的可交换格式：L1 声明、Prepared 格式与 Material / Pure Function Manifest 结构 | 按 definition / prepared / capability 入口隔离；Prepared 格式兼容与 L1 协议版本独立。不得收纳所有内部类型、Runtime 会话 API、平台数据库 / HTTP DTO、Agent 协议或组件实现 |
| compiler | 提供分析 / 诊断及编译产物，供 CLI、编辑预览和平台构建调用 | 解析、规范化、检查、依赖准备先作为内部模块；不依赖 Runtime 执行，不导入物料 UI 实现 |
| runtime | 创建和管理表单实例，公开读写、订阅、校验、Host 能力注册与运行诊断接口 | Data / Scope、表达式、Flush、校验先作为内部模块；不为每项机制建独立包。注册网络执行能力不等于 Runtime 执行网络请求 |
| renderer（按目标实现） | 主端呈现、共用 Adapter 和物料接入契约，供业务应用与预览使用 | 平台 / 框架依赖留在本包；共用 Adapter 与具体目标实现先按模块组织，出现第二个真实消费者时再判断共享包。不得包含第二份业务规则或权威状态 |
| materials（按目标 / 物料集发布） | 基础字段、容器与领域 UI 实现，供运行应用选择；具体 Manifest 供编译侧读取 | 不强制 Renderer 自带某套组件库；Manifest 与 UI 实现分入口，编译器只消费确定契约；不同目标或组件体系按需要独立构建 |
| pure-functions（按函数集发布） | 同步确定性内置 / 领域算法，供运行端注册；签名供编译侧检查 | 不依赖 UI、Host 网络或 Runtime 可变内部。具体签名与实现属于函数集，Manifest 通用结构属于 protocol；Compiler 不执行函数 |

六项是候选包族，不是已选定的六个包名。Renderer / Material 的实际后缀与产物目标随主端技术选择确定；自带基础纯函数是否随 Runtime 便利入口交付，可在不破坏独立契约和确定锁定的前提下细化。Prepared 采用独立子入口不意味着它归属 L1，也不要求首期就独立发布 prepared 包；契约升级时不得把包版本视为所有格式版本的替代。

**相对初稿的调整建议：**

- contracts 收窄为 protocol 的可交换格式范围。各模块自行导出其公共 API 类型；平台服务 DTO 在相应服务边界维护，不集中建万能类型包。
- host-sdk 暂不独立：创建 / 销毁、受控读写、校验注册等基础接口归 Runtime，呈现装配归 Renderer，具体请求与业务流程归 Host 应用。只有出现跨应用重复且稳定的接入组合，才抽取独立 SDK；不能拆出空壳转发包。
- capabilities 保留能力总称，但 UI 物料与纯函数分别组织构建 / 发布，防止服务端纯计算牵入 UI 依赖。Material Manifest 与纯函数签名可独立读取，不等于每份 Manifest 都独立发布为一个包。
- testkit 先按内部开发支持判断，跨包共用工具放测试支持位置；出现稳定的物料 / Host 开发者消费需求后再决定公开发布。已有 docs/validation 不直接提升为生产 testkit。
- 运行保障保持已确认范围：诊断 / Trace 的采集入口由对应 Compiler、Runtime、Renderer 提供，业务上报由 Host 接入；监控后台、问题处理与 Agent 分析在平台 / 后续服务边界，不为“可观测性”预建核心全局依赖包。

**依赖与使用场景验证（候选）：**protocol 无产品实现依赖；compiler 和 runtime 分别消费其契约入口，不互相依赖生产实现。Renderer 消费 Runtime 公共接口并提供物料接入契约，具体物料不访问内部 Store。应用在顶层选择并装配 Renderer、物料集、纯函数集与 Host 实现。

- 服务端编译：只需要 Compiler、Protocol 与确定能力 Manifest；不安装 Renderer、UI 组件库或 Runtime 执行实例。
- 已发布表单填写：使用 Runtime、主端 Renderer、指定物料 / 纯函数实现；不要求携带 Compiler、Studio 或平台服务。
- 创作预览：创作入口同时调用 Compiler 和运行 / 呈现能力，复用同一套生产语义。
- 无界面规则验收：运行侧使用 Runtime 与所需纯函数 / 校验执行器，不引入 Renderer。

本轮重点是候选包族的职责与消费者是否成立，以及 Host 接入 / 测试支持是否有必要独立发布；普通内部文件名无需逐项决策。以上全部待用户审阅，不替代各层正式契约，也不代表已选技术栈。

#### 原目录草案

最外层 apps / packages / services / tools / tests / docs 的职责划分已获用户认可。下方保留初稿子目录用于追溯本轮讨论，其中 packages 的 contracts / host-sdk / capabilities / testkit 尚未确定；本节包边界讨论提出了调整候选，不能把该树当成已确认包清单。实际骨架在相关架构与技术栈确认后按首批任务创建。

```text
项目根目录/
├── apps/
│   ├── host-playground/     # 首个真实业务纵切 / 参考 Host
│   └── platform-web/        # 规划：平台管理 + Studio；先最小编辑与预览
├── packages/
│   ├── contracts/           # 声明、Prepared、能力等分域契约
│   ├── compiler/            # L2 编译库
│   ├── runtime/             # L3 核心执行
│   ├── renderer/            # L4；平台 / 框架确定后细分
│   ├── host-sdk/            # 公共接入装配，不含业务流程
│   ├── capabilities/        # 物料 / 纯函数，按目标独立构建
│   └── testkit/             # 开发期测试支持
├── services/               # 后续服务位置，不立即创建空实现
│   ├── platform-api/        # 领域模块化平台后端
│   └── agent-executor/      # 后续自建或外部接入方案位置
├── tools/
│   ├── docs/               # 既有文档构建保留
│   └── ...                 # 后续 CLI、构建与发布工具按职责建立
├── tests/
│   ├── contracts/          # 跨包 / 跨端语义验证
│   ├── integration/        # 编译到 Runtime / Host 的接缝
│   └── e2e/                # 完整业务与发布路径
└── docs/                   # 既有设计、验证与阅读系统保留
```

单元测试随模块维护，tests 放跨模块验收。现有 docs/validation 是候选验证证据，不能直接作为生产 testkit 发布；未来复用需逐项核对正式契约。CLI 初期可作为 tools 入口，只有独立分发必要时再提升为包。CI 平台、包管理器、锁文件和部署目录随技术选型确定，不在此预设工具。


### 当前落地与剩余工作

六个 TS 包及 apps / packages-flutter / services / tests 的空目录已放置 .gitkeep，既有 tools / docs 保留；无生产实现，模块完成状态不提升。后续集中确定 React / TS 版本、工作区 / 构建 / 测试工具与首批公共契约，再按真实纵切创建配置与代码。此时不重新要求选择 React 或提前拆微服务。
