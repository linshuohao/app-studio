---
id: DESIGN-COMPILER
title: Compiler 详细设计与实施
type: design
status: active
layer: L2
modules:
- M05
- M06
sources:
- SRC-REACTIONSTATE
- SRC-COMPILERIMPLEMENTATION
- SRC-COMPILERDESIGN
- SRC-COMPILERIO
- SRC-COMPILERIOTYPES
related:
  documents:
  - DESIGN-L2
  - DESIGN-PLATFORM-STUDIO
  decisions:
  - ADR-FE-020
  - ADR-FE-017
  - ADR-FE-015
navigation:
  group: 03 · L2 预处理
  order: 41
last_reviewed: '2026-10-27'
status_note: 本期设计已确认；I01–I04 编译主链与表达式 watch 已实现，完整基准 / 浏览器消费及 Runtime / Adapter 联验待完成
reading_next: DESIGN-L3-RUNTIME
---

# Compiler 详细设计与实施

**本期方案已确认 · 2026-10-22。** 本文整合整体蓝图、本期范围、需求、架构、模块详细设计、流程、诊断、验收与后续实施步骤。平台可视化与能力自校验按本轮补充纳入；平台报告的具体公共格式仍属后期设计。协议输入与 Prepared 类型已实现；用户确认本期模块方案后授权归档、提交及实施。归档时算法尚未实现，随后完成 I01，并补齐 I02–I04 的表达式依赖、规则与视图准备；稳定性 / 消费验收见实施现状。下方长篇 Prepared 仍是预期契约样本，真实产物证据来自代码测试，二者分开。

## 整体蓝图：从本地编译到平台分析 {#blueprint}

Compiler 是可复用的协议分析与静态准备内核。本期服务 Runtime / Adapter 的接入与运行效率；后期服务平台编辑、错误解释、Reaction / Validation 展示和发布构建。同一语义由同一内核解释，调用环境与展示方式可以不同。

### 能力全景与阶段

| 能力 | 本期交付范围 | 后期平台能力 | 责任边界 |
| --- | --- | --- | --- |
| 协议正确性 | 结构、引用、Scope、Schema 连接、能力使用、确定环等检查 | 编辑诊断、跳转、问题聚合、修改后重新检查 | Compiler 给事实与原因；平台组织交互 |
| 静态准备 | 规范化、表达式级 watch、同步前置、模板 / 资源闭包、能力锁 | 平台以固定输入调用相同编译过程 | 不新增平台专属运行语义 |
| 错误链路 | 可靠源位置、相关契约、必要的失败依据 | 展示“配置 → 引用 → 表达式 → 参数 / Schema → 失败点” | Compiler 解释因果；Studio 高亮与导航 |
| Reaction 排布 | 校验显式 watch 与命令，按需记录分析中的读取事实 | 区分触发、条件读取、计算读取和写入，展示潜在影响 | 静态关系不等于真实触发顺序 |
| Validation 展示 | 推导有效 watch、解析 requires、记录 Issue 归属 | 字段 / Schema / Internal / External / 前置的关系与解释 | 结果、Pending、执行代次来自 Runtime |
| View 依赖解释 | 每个完整响应式表达式独立 watch、模板参数连接 | 定位具体属性为什么更新，查看复用与绑定路径 | Adapter / Runtime 提供实际实例与更新证据 |
| 能力资产质量 | 复用 Manifest 检查，验证本次配置连接 | 能力开发自检、Registry 入库复核、版本兼容报告 | 能力实现测试不归表单 Compiler |
| 分析报告 | 内部分析有来源；不交付完整图协议 | 按需生成独立报告，支持失败配置的可解释部分结果 | 报告不写入 Prepared，不供 Runtime 执行 |
| 增量编辑与风险工具 | 先做确定的完整 compile | 按需求增加局部分析、增量更新、潜在规则环与影响分析 | 重用内核，不另写一套协议解析 |
| 发布追踪 | Prepared 带构建来源、确定能力锁与 Host 需求 | 保存构建输入 / 诊断 / 报告 / 制品关联，支持比较与回滚 | 身份、权限、存储、发布服务归平台 |

### 三类交付，分别服务执行、诊断和解释

```diagram
{
  "id":"compiler-blueprint",
  "title":"共享分析内核，不同交付与消费者",
  "rows":[
    [{"title":"本地调用环境 / 后期 Platform","body":"固定 Definition、Catalog、Schema 资源和目标；平台管理资产与构建记录"}],
    [{"title":"Compiler 共享静态分析","body":"结构 / 契约 / 引用 / 类型 / 读取 / 前置；事实与原始来源关联","major":true}],
    [{"title":"Prepared · 本期","body":"成功时交付；静态执行输入，不带完整展示图"},{"title":"Diagnostics · 本期","body":"成功 / 失败均可返回；位置、原因、关联依据"},{"title":"Analysis Report · 后期","body":"按需投影分析事实；可展示失败位置与未解析关系"}],
    [{"title":"Runtime / Adapter","body":"实例化、真实订阅、执行与更新"},{"title":"开发工具 / Studio","body":"错误高亮、链路、Reaction / Validation 布局与筛选"}],
    [{"title":"后期 Devtools","body":"静态来源关联 Runtime Trace，解释本次真实执行；平台不控制热路径"}]
  ],
  "note":"报告不是 Prepared 的组成部分。展示、布局、折叠、颜色、搜索和交互归平台；Compiler 保持无界面依赖。"
}
```

### Reaction 与 Validation 需要展示什么

| 展示对象 | 可由静态分析提供 | 不能从静态分析推断 |
| --- | --- | --- |
| Reaction | 显式触发源、when 读取、then 值读取、命令写目标、Scope 模式 | 本次一定执行、实际写入有变化、级联实际顺序 |
| Internal Constraint | when / assert 读取、同步前置、有效 watch、Issue 归属 | 本轮是否适用、断言结果、当前 Issue |
| External Constraint | 显式依赖、when 读取、同步资格、Validator 能力需求 | 网络是否发出、返回是否过期、取消是否成功 |
| 根 Schema | 完整资源与字段关联；可证明的前置影响范围 | 当前工作数据是否合法、错误列表和本轮完成情况 |

例如 Reaction 显式 watch amount，计算读取 age 和 amount，写入 premium。图中必须分别标记“触发”“读取”“写入”；age 不得因为被展示而变成自动触发源。Field requires 关联 adult 只是同步资格关系，不能画成等待某个 External 完成。

### 取舍与本期保留的扩展接缝

不让 Studio 重新实现引用、类型和依赖推导；也不要求本期为了画图生成全量读写影响矩阵。局部分析保留来源与关系种类，已经需要的依赖不丢失；后期通过可选收集 / 投影取得更完整事实，额外风险分析按需运行。

本期不冻结 AnalysisReport 的公共字段、图节点 ID、存储格式或平台 API；也不要求保留每次分析的全部中间对象。保留的是模块可复用、证据有来源和错误不只剩一句字符串。平台规划不阻塞核心 Compiler 实现，已取得 Prepared 的 Runtime 不依赖平台在线。

## 需求与使用场景 {#requirements}

Compiler 的目标是把配置错误前移，并提前完成运行时确实需要的静态准备。它输出可复用、可序列化、能直接建立执行实例的 Prepared，不为“看起来更像编译器”全面改写原协议。

### 谁在什么情况下使用

| 使用方 | 场景 | 输入来源 | 需要得到的结果 |
| --- | --- | --- | --- |
| 应用开发者 | 本地编写定义，直接接入 Runtime | 本地定义、SDK / 业务包导出的 Manifest | 开箱即用的编译入口、可定位错误、Prepared |
| 编辑预览 | 作者修改定义后预览 | 编辑器当前定义、确定契约快照 | 与正式编译一致的检查结果；错误不进入 Runtime |
| 发布构建 | 发布某个视图或目标实现 | 已保存定义、锁定 Catalog、明确构建目标 | 确定产物、资源闭包、能力锁与 Host 需求 |
| 测试工具 | 检查正反例与复现 | 固定输入、固定快照和 Compiler 版本 | 稳定诊断、可重复输出、明确失败边界 |

编辑器中的未完成草稿可以得到结构诊断；首期不承诺容错解析、增量符号服务或错误草稿的部分可执行产物。草稿保存属于平台 / Studio。

### 功能需求与验收

| 编号 | 需求 | 验收观察点 |
| --- | --- | --- |
| R01 | 接受规范写法与受支持简写 | 不要求 syntax 选择；冲突字段不能静默覆盖 |
| R02 | 单视图与默认选项可直接使用 | 单一入口自动选择，不强制 default 名或 platform 参数 |
| R03 | 确认协议结构和语义合法 | 非法引用、Scope、表达式位置、模板和前置关系有明确诊断 |
| R04 | 取得并读取能力元信息 | 每个实际使用物料 / 函数都能关联确定 Manifest 与制品身份 |
| R05 | 按契约检查配置连接 | Props、Binding、Slot、Event、Request、函数参数 / 返回位置正确 |
| R06 | 提前生成隐式观察依赖 | 完整动态表达式自带 watch；Runtime 不重新发现依赖 |
| R07 | 保持 Reaction 触发意图 | 输出只保留显式 watch，不因 when / then 的读取补触发 |
| R08 | 准备校验前置 | requires 引用明确，字段前置有相关 Internal 集合，有效 watch 补全 |
| R09 | 保留模板结构共享 | 同一模板多次使用不默认复制；参数环境中的依赖可绑定 |
| R10 | 形成完整交付 | Schema、请求契约、模板、能力锁与 Host 需求闭合 |
| R11 | 错误可解释、可定位 | 错误位置指向原输入，能关联 Manifest / Schema / 前置依据 |
| R12 | 无错误才交付执行产物 | Error 不返回 Prepared；Warning 可伴随成功结果 |
| R13 | 同锁定输入可复现 | 不靠时间、随机数、网络 latest 或实例数据决定结果 |
| R14 | 保护输入与复用边界 | 不修改调用者对象，不向产物写入分析缓存或会话状态 |
| R15 | 预留平台复用 | 分析无 UI / 平台服务依赖，来源与关系种类可用于后续解释 |
| R16 | 分开能力自检与配置使用 | 共享契约规则；不靠构造完整表单验证一个 Manifest |

### 本期范围

**本期：**静态检查、规范化、按位置的读取分析、规则前置准备、模板与资源收集、确定产物生成、统一诊断。本期不包含运行实例、纯函数执行、订阅建立、请求发起、业务数据校验执行、框架渲染或发布管理。

完整分析报告、错误链路可视化、Reaction / Validation 图、完整 read / write 风险图、潜在 Reaction 环可视化、编辑增量分析、表达式常量折叠、模板特化、紧凑编码和代码生成列为后期方向。确定的命名表达式环、模板环和 requires 环仍是本期合法性检查，不能与可选风险分析混为一谈。

## 本期设计与后期建设的分界 {#phase-scope}

本期目标是让 Runtime / Adapter 消费确定、已检查且含必要静态准备的协议。平台面向的能力进入整体蓝图，不把蓝图项目计入本期全部验收，也不以将来使用为由扩大 Prepared。

| 方面 | 本期需要做 | 本期不建设，但需保留的后期方向 |
| --- | --- | --- |
| 对外入口 | 同步 compile、确定内存输入、成功 / 失败结果与统一诊断 | 容错 analyze、增量会话、后台编译服务 |
| 静态分析 | 正确性与运行准备所需的引用、类型、读取、前置与闭包 | 全量影响图、编辑建议、跨修订差异分析 |
| 平台支撑 | 原始源位置、关联位置、可解释根因；无 UI 依赖的模块 | 独立 AnalysisReport、错误链路和规则可视化 |
| 能力元信息 | 读固定快照，调用可复用契约检查，检查本次接入 | 能力开发工具整套命令、Registry 入库 / 发布工作流 |
| 运行层联验 | 实际编译结果与后续 Runtime / Adapter 消费契约对齐 | 跨端代码生成、完整多端平台 |
| 发布治理 | 可复现构建信息、确定资源与能力锁 | 权限、审核、分发、灰度与回滚产品 |

本期模块详见下文四职责组、六阶段和各模块设计；实际已做 / 未做与实施步骤分别见“实施现状”和“实施步骤”，不能把表中的“本期需要做”误读为代码已完成。

## 基线、状态与不变量 {#baseline}

| 状态 | 范围 | 本文处理 |
| --- | --- | --- |
| 已确认且已实现结构 | Definition、能力 Manifest、PreparedForm 类型及派生 Schema | 作为输入；不重新选择协议形状 |
| 已确认行为 | 唯一 Prepared 入口、Reaction 的显式 Data / Validation watch、表达式级观察、模板共享、同步校验前置、Request 通道 | 所有模块遵守 |
| 本轮补充方向 | 后期平台复用、错误链路与 Reaction / Validation 展示、能力自校验分工 | 纳入蓝图与责任边界；本期 / 后期细化随全文审阅 |
| 本期方案已确认 | 四个职责组、六阶段流程、失败累计、检查范围、内部接口、预算、报告扩展安排与实施步骤 | 按本期范围实施；不代表代码已完成 |
| 部分实现 | I01–I04 编译主链 / 契约自检、表达式依赖、规则与模板 / 交互已实现；完整基准、浏览器消费、Runtime / Adapter 待完成 | 仅以真实 compile 和消费测试证明对应范围 |

必须保持：

1. 原始 Definition 不能成为 Runtime 的第二条解释入口。
2. Prepared 保留领域组织、词法别名、JSON Pointer、op / args、use、Command 和 ValueSpec；不生成各端代码。
3. 表达式本身没有全局订阅生命周期；位置决定其读取是否转成 watch。
4. 精确更新单位是持续呈现的完整 $expr，不是内部每个运算子，也不是组件合并后全部重算。
5. 真实 Scope ID、数组成员、组件与请求代次由运行时生成；编译只能处理模式和声明。
6. Working Data 可以暂时违反业务 Schema；静态接入检查不变成 Runtime 写入门禁。
7. HostContract 可选；未提供不代表真实实现不存在，也不能伪造已证明兼容。
8. Source Map、诊断和内部图不控制业务执行；后期分析报告也不成为 Runtime 的输入。
9. 能力自校验、实现契约测试与表单使用匹配分别负责；相同契约检查规则共享，不复制。

## 输入输出与公共入口 {#public-contract}

### 接口草案

以下是本期 Compiler SDK 契约，当前真实入口已接入共享分析和运行准备；具体支持与拒绝边界以实施现状为准。交换类型已在 protocol 的三个领域中实现。

```typescript
interface CompileInput {
  definition: CompilerInputDefinition;
  catalog: CapabilityCatalogSnapshot;
  target?: {
    profile?: string;
    platform?: string;
    preparedFormatVersion?: string;
  };
  schemaResources?: Record<string, JsonSchema>;
}

type CompileResult =
  | { success: true; prepared: PreparedForm; diagnostics: Diagnostic[] }
  | { success: false; diagnostics: Diagnostic[] };

// 确定快照已经在内存中时，核心编译不发生网络 I/O。
declare function compile(input: CompileInput): CompileResult;
```

这是本期执行编译入口；后期 AnalysisReport 是独立可选交付，尚不向此类型静默增加必填字段。以后可由同次分析按需返回独立附件，或由独立 analyze 入口复用内核，具体 API 在平台消费者出现时固化。

默认配置可以在应用中统一组合后传给 compile；不要求首期同时建设多种注册器、Provider、异步 Resolver 和编译入口。是否需要一个复用配置的工厂是 SDK 实现细化，不改变核心输入。

| 选项 | 默认处理 | 歧义处理 |
| --- | --- | --- |
| 语法 | 同一入口接受规范及受支持简写 | 简写与完整字段冲突报错 |
| Profile | views 唯一入口自动选择 | 多入口且未确定选择时报错，不任取首项 |
| 平台 | 无选择需要时直接消费固定制品 | 若必须选择目标实现，由调用环境先固定快照或明确目标 |
| Prepared 格式 | Compiler 自身确定的默认支持格式 | 显式不支持格式报错，不按 latest 猜测 |
| 输入类型 | TS 调用有静态提示，外部 JSON 仍做结构检查 | 不用类型断言跳过可信边界 |

### 输出沿用已实现协议

```text
PreparedForm
├─ preparedFormatVersion
├─ build：compilerVersion / catalogSnapshotId / profile / platform?
├─ definition
│  ├─ protocolVersion / id / version / data / expressions
│  ├─ constraints[]：watch、requires、原断言与义务
│  ├─ reactions[]：原 watch / when / then、runOnActivate
│  ├─ views：当前唯一视图
│  ├─ viewTemplates：共享模板闭包
│  └─ validationMessages / metadata
├─ resources：schemas / requestSchemas
├─ capabilityLock：materials / pureFunctions
└─ hostRequirements：validators / events / requests
```

build.platform 可省略，但各 artifact 的平台和不可变身份仍保留。Compiler 成功结果在同进程传入 Runtime 时不重复全量协议 Schema 检查；外部 JSON 在接收边界检查一次，格式 / 目标 / 能力和动态执行保护仍保留。

成功结果的 prepared 使用 ReadonlyPreparedForm，并在运行时递归冻结；这是 2026-10-27 用户确认的对外行为。输入仍先复制，不能冻结调用者的 Definition / Catalog。需要构造修订时，先 structuredClone(result.prepared)，在 TS 中按可修改的 PreparedForm 表示编辑，再重新检查；结构克隆和 JSON 往返都不携带进程内验证身份。共享接收入口只登记真实检查成功的产物，不导出可伪造验证结果的注册函数，不把格式字符串视为验证凭据。详见 [Prepared 交付边界](../l2-preparation.md#prepared-delivery)。

## 整体架构与职责划分 {#architecture}

能力层面只有静态校验与静态准备，产物生成是交付过程。模块按照知识所有权分为四组；诊断和入口是贯穿支撑，不单独扩张为业务子系统。能力契约自检作为可复用检查能力，Compiler 的契约读取单元调用它；后期报告由分析事实投影，不在平台再建一套解释器。

```diagram
{
  "id":"compiler-architecture",
  "title":"Compiler 内部职责与外部边界",
  "rows":[
    [{"title":"调用环境","body":"本地声明 / SDK / 平台 Registry → 确定快照；能力开发与入库复用契约自检"}],
    [{"title":"输入处理","body":"结构检查、规范化、默认选项、原始位置映射"}],
    [{"title":"共享静态分析","body":"契约读取、声明与词法引用、Schema 连接、表达式与读取分析","major":true}],
    [{"title":"规则编译","body":"Reaction / Constraint / Command / requires"},{"title":"视图编译","body":"Material / Template / Binding / Props / Event / Request"}],
    [{"title":"输出装配","body":"闭包、资源、身份、双摘要锁、需求、输出自检；平台报告独立扩展"}],
    [{"title":"Runtime / Adapter","body":"绑定真实 Scope 和实现，建立订阅，求值与执行；Compiler 不参与实例状态"}]
  ],
  "note":"入口组织阶段；统一诊断贯穿各模块。箭头为处理 / 消费关系，不要求每个模块复制完整协议树。"
}
```

### 合并与拆分依据

| 应合并 | 原因 | 应拆开 | 原因 |
| --- | --- | --- | --- |
| 表达式类型检查与读取分析 | 共用同一 AST、引用环境和函数签名 | 读取事实与触发策略 | Reaction、Constraint、Props、Payload 的语义不同 |
| 物料节点的端口 / 槽 / 事件 / 请求检查 | 共用一个 Manifest 和节点上下文 | 物料检查与纯函数检查 | 一方处理组合端口，一方处理有序调用签名 |
| 输入契约匹配与资源完整性判断 | 都属于静态正确性，统一诊断 | 源配置检查与输出自检 | 前者报告作者问题，后者发现装配遗漏或内部缺陷 |
| 相同 Schema 连接算法 | Binding、模板、函数和请求均需复用 | Schema 检查与实例业务校验 | 编译看模型，Runtime 看当前数据 |

### 内部模型与数据所有权

| 内部对象 | 内容 | 生命周期 / 是否交付 |
| --- | --- | --- |
| NormalizedDefinition | 支持简写展开、默认值明确后的定义 | 本次编译；不修改原输入 |
| CompileContext | 版本 / 选项、确定快照、声明查询、资源、诊断收集器 | 本次编译；不交付 |
| LexicalEnvironment | 按顺序的 Scope Binder、模板形参、当前 Event 契约 | 随遍历派生；不保存真实 Scope ID |
| ExpressionAnalysis | 结果 Schema / 不确定原因、可能读取、所用函数与源位置 | 本次分析；不是另一套公共 AST |
| Prepared 片段 | 保留原结构并增加必要 watch / requires / 请求信息 | 内部组装；最终无 Error 才可交付 |
| Dependency / Use 关系 | 命名引用、同步前置、模板引用、资源引用与来源 | 本期用于检查、传递和闭包；后期可按需投影独立报告，不写入 Prepared |
| 可选分析事实收集（后期） | 读取 / 触发 / 写入的区别、连接证据、未解析位置 | 收集深度可选；不强制保留全部 IR 或构建全图 |
| DiagnosticCollector / OriginMap | 去重诊断与规范位置到原位置对应 | 诊断可返回；详细映射可作独立附件 |

包依赖仍为 compiler → protocol；不导入 runtime、renderer、React 组件或实际业务纯函数。Schema 结构检查沿用已确认 Ajv 路线，算法实现保持当前 TS / 浏览器可消费边界，不以 Node-only 全局状态作为隐式前提。

### 当前实现的物理目录 {#source-layout}

遵循[统一包目录约定](../engineering.md#package-source-layout)，生产代码放在 src，测试放在独立 tests 目录。入口编排位于 pipeline；输入接收和规范化在 input；Catalog 读取、自检与锁收集在 capability；analysis/schema 分开资源模型、连接证明和值校验；analysis/reference 处理词法环境 / 引用 / watch 合并；analysis/expression 同时分析结果模型与读取；analysis/value 递归准备 ValueSpec。rules 负责规则 / 前置 / 命令，view 负责物料、共享模板与交互；output 装配 Prepared，diagnostics、validation、common 提供贯穿支撑。

src/index.ts 维持公共导出，公共 SDK 类型保留在 src/types.ts；内部拆分不新增公共子入口。tests/pipeline、capability、analysis、rules、view 分别覆盖编译、自检、依赖、规则与视图交互，共享夹具单独维护。表达式与规则目录对应真实实现，不以目录存在作为完成依据。完整文件定位见包 README，统一约定与各职责说明以工程主题为准。

## 六阶段主流程与失败路径 {#pipeline}

```diagram
{
  "id":"compiler-pipeline",
  "title":"一条主编译路径，阶段与模块并非一一对应",
  "flow":true,
  "rows":[
    [{"title":"① 接收与规范化","body":"结构、简写、默认目标、来源位置"},{"title":"② 准备能力契约","body":"读取固定 Manifest；核对身份与签名"},{"title":"③ 建立定义上下文","body":"声明、词法基础、Schema 资源、前向引用"}],
    [{"title":"④ 按位置分析","body":"规则 / 视图调用共享分析；类型、读取、局部片段"},{"title":"⑤ 整理跨声明关系","body":"同步前置、依赖传递、模板和资源闭包"},{"title":"⑥ 装配与自检","body":"Prepared、资源引用、能力锁、Host 需求"}]
  ],
  "note":"任一阶段均产生同一诊断结构。结构错误停止不安全下游；语义错误允许检查独立部分；有 Error 不返回 Prepared。"
}
```

| 阶段 | 输入 / 关键动作 | 输出与完成条件 |
| --- | --- | --- |
| ① | 原定义、选项；检查 Authoring 结构、协议格式、简写冲突；规范化并保留来源 | 可安全遍历的定义、已选 Profile 和格式；结构失败不进入语义遍历 |
| ② | 确定 Catalog；读取 Manifest，检查结构、ID / 版本 / 目标关联与签名基本规则 | 只读契约访问；损坏条目不能冒充“不存在” |
| ③ | 规范定义和资源；登记表达式、规则、模板；建立 Schema URI 与 Pointer 查询 | 前向引用可查，重复声明可诊断；Scope 在具体位置派生，不扁平化 |
| ④ | 当前领域节点、词法 / Event 环境、契约；递归分析并进行接入检查 | 局部诊断、原形状准备片段、局部读取和使用记录 |
| ⑤ | 全部有效局部结果；解析 requires、检查确定环、绑定关系、传递依赖并求闭包 | 最终 watch / requires、所需资源和能力；无跨 External 等待 |
| ⑥ | 完整片段和闭包；分配静态节点身份、摘要、需求，组装并自检 | 无 Error 且输出结构 / 引用完整时 success；其他情况无 Prepared |

主流程允许多次遍历，但不为“校验”和“优化”各写一套引用 / 类型 / 表达式解释逻辑。先登记声明再分析正文，避免把后声明的 A 错报成不存在。

首期建议只有完整 compile 主流程。编辑预览复用它；单独 analyze / 增量 API 和部分符号结果暂不作为首批交付。以后确有编辑器需求再复用内部阶段，不现在增加另一套语义路径。

## 输入处理模块 {#module-input}

**责任：**把可信度未知的定义转成安全、确定的规范输入；不做物料参数兼容或业务校验。

| 入口信息 | 输出信息 | 调用的共享能力 |
| --- | --- | --- |
| definition、可选 target、确定默认配置 | NormalizedDefinition、选项、OriginMap、结构诊断 | 协议包的输入 Schema、统一诊断 |

处理顺序：检查顶层与递归结构 → 检查相互排斥的简写 → 展开 bind / children / 明确函数别名 → 明确 mode 与 runOnActivate 默认 → 选择唯一 / 指定 Profile、核对格式 → 固定原始位置对应。

```javascript
// 输入，根数据简写不随当前 Scope 改成相对绑定。
{ material: "text-input", bind: "/name" }

// 规范化片段。
{ material: "text-input", bindings: {
  value: { source: "data", path: "/name" }
} }
```

`bind` 与 `bindings.value` 同时提供、children 与同一 default slot 冲突、未知简写、保留包装混用、非法 Pointer 都必须报告。这里不默认引入裸字符串路径、view / views 双字段或任意新简写。规范化后的诊断仍指向作者填写的 /bind，不让作者寻找不存在的输入字段。

输入不原地修改。复制或构造规范树时共用只读资源需有清楚所有权；首期不为此建设长期增量 IR。Compiler 的格式支持表和内置别名白名单属于确定实现版本，不以在线 latest 更新。

**验收：**规范及简写得到同语义结果；唯一非 default 名视图可编译；冲突失败；输入前后 JSON 内容一致；错误位置可回到原声明。

## 能力契约取得与读取模块 {#module-contracts}

这是共享分析中的明确单元，不能只用“查询 Catalog”替代设计。它回答：在哪里取得元信息、信任什么、取出哪些规则、缺失和损坏如何区分。

### 取得链路与所有者

| 来源 | 谁取得 / 固定 | 交给 Compiler 的内容 | 实现代码的去向 |
| --- | --- | --- | --- |
| 内置 core.* | SDK / 应用装配 | 版本化内置 Manifest、确定实现身份 | Runtime SDK 注册 |
| 本地 Material / Pure Function 包 | 应用开发者或本地构建 | 纯契约导出 / JSON、目标制品身份 | 应用构建与装配 |
| 平台能力 | 发布调用环境从 Registry 获取并锁定 | 已选唯一版本的 Catalog Snapshot | 制品分发与目标 Runtime |
| Host | 应用可选导出静态契约 | validators / events / requests 契约 | Host 运行时注册 |

可以从包的纯契约导出构造快照，但 Compiler 不通过导入 UI 实现、扫描函数源码或执行函数猜参数。平台 Registry 的网络读取、认证、重试、版本协商与下载属于调用环境。首期 compile 消费内存中的确定快照即可，本地用法不需要平台；是否另供纯粹组装 Catalog 的助手留作 SDK 便利层。

### 快照结构节选

```typescript
interface CapabilityCatalogSnapshot {
  id: string;
  materials: Record<string, {
    manifest: MaterialManifest;
    artifact: ArtifactIdentity;
  }>;
  pureFunctions: Record<string, {
    manifest: PureFunctionManifest;
    artifact: ArtifactIdentity;
  }>;
  host?: HostContract;
}
```

一个能力在确定快照内只能对应一个选定契约。组装快照时不静默覆盖冲突 ID，Compiler 再核对键与 manifest.id、版本字段、artifact 和显式平台约束。core.* 只能来自确定内置集合，不能由业务同名覆盖。Manifest 内容摘要与实现制品摘要分别锁定，资源地址不代替身份。

### 读取与检查流程

1. 在接收边界复用能力契约检查，确认快照 / Manifest 的结构与嵌入 Schema 语法，建立只读查找入口；不依赖能力作者自报“已检查”。
2. 用 material、op 或 Host 名称定位条目；分清不存在、非法契约、目标不兼容。
3. 复用契约语义检查确认所用条目可解释，再把签名交给使用点检查；“Manifest 自身错误”和“配置不匹配 Manifest”采用不同诊断来源。
4. 返回只读契约视图给表达式或领域编译，不把实际函数或组件放入分析上下文。
5. 记录本次实际交付使用，供输出生成能力锁、资源和需求；不锁定整个无关 Catalog。

| 内部查询 | 返回的关键内容 | 失败 |
| --- | --- | --- |
| 物料查询 | id/version、Props Schema、Binding Schema、Slot 名、Event Payload、Request 签名与并发 | 未注册、非法声明、目标实现不满足 |
| 纯函数查询 | 固定参数、optional、restParameter、returns、能力身份 | 未注册、非法签名、保留命名冲突 |
| Host 查询 | Validator 接入版本、事件输入、请求输入输出 | 没有静态声明时返回“无法静态核对”，不伪造函数缺失 |

**不能证明的事：**Manifest 不证明实现无副作用、运行时注册已完成或跨端结果等价。这些由实现审查、契约测试及装配核对承担。

**验收：**本地和平台快照经相同内核处理；缺物料 / 函数出错；坏签名定位契约而非误报配置；没有 HostContract 仍提取需求；重复编译不在线漂移。

## 能力元信息自校验与使用匹配 {#capability-validation}

这里的元信息指可序列化的 Manifest / 能力契约。它的校验需要独立可调用，但不需要一个独立部署服务，也不需要为了校验单个函数而构造 FormDefinition。

### 三种检查分别由谁负责

| 检查 | 责任方与触发点 | 输入 / 输出 | Compiler 的关系 |
| --- | --- | --- | --- |
| 契约自身合法 | 能力开发 SDK / CI；后期 Registry 接收边界 | Manifest 与契约资源 → 合法性诊断 | 复用相同规则，确认接收到的契约可消费 |
| 实现兑现契约 | 物料 / 函数作者的测试与发布流程 | 实现、Manifest、测试输入 → 行为证据 | 不导入实现、不执行测试、不据声明证明纯净性 |
| 表单使用匹配 | Compiler 分析每个使用点 | 配置、词法 / 类型环境、Manifest → 接入诊断和准备片段 | 属于 Compiler 核心职责 |

### 可复用契约检查的设计

输入是单个 MaterialManifest / PureFunctionManifest 或确定 Catalog 中的条目，及其声明的 Schema 资源；输出是契约位置上的诊断与可消费判定。资源由调用环境提供，检查过程不隐式联网、不导入实现。

结构规则来自已有 TS / JSDoc 派生 Schema；语义规则由一套纯检查逻辑维护。首期在需要的能力上复用规则，不新增通用 utils / validation 包或插件框架；具体公开子入口、物理目录和开发 CLI 由对应能力交付安排，不要求 Compiler 已完成才能自检。

| 检查层 | 检查内容 | 例子 |
| --- | --- | --- |
| 结构与 Schema 语法 | 必填字段、Union、版本形状、Schema meta 校验 | Request 缺 resultSchema；嵌入 type 关键字形状错误 |
| 契约内部语义 | 参数顺序、可选尾参数、允许的 rest 约定、槽名唯一等 | optional 参数后又声明必选参数 |
| 资源完整性 | 按声明上下文解析 Schema 引用，不忽略外部资源缺失 | 参数 Schema 引用不存在资源 |
| 快照关联 | Catalog 键与 Manifest ID、制品身份、保留 core 命名和目标关联 | 某键指向另一个逻辑 ID |

静态类型生成的 Schema 已能承担部分结构规则；这不等于独立元信息语义检查器已实现。参数类型连接、optional 的具体调用合法性等在使用点继续检查。

### 从开发到编译的完整链路

```text
能力作者编写 Manifest + 实现
  → 本地 / CI 自校验 Manifest
  → 实现契约测试、构建制品
  → 后期 Registry 在入库边界复核，保存不可变身份
  → 调用环境选择确定 Catalog
  → Compiler 接收边界确认契约有效
  → Compiler 检查表单如何使用契约
  → Prepared 锁定实际使用契约与实现身份
  → Runtime / Adapter 核对并装配真实实现
```

没有平台时，本地固定 Catalog 直接进入相同 Compiler。受控不可变快照的检查结果可以在明确可信边界内复用，但不能凭作者传入 `validated:true` 就绕过检查；摘要、检查规则身份和内容关联须有效。首期不建设跨进程签名证明或检查凭证系统。

### 正反例与验收

calculatePremium 声明 `(age:number, amount:number) → number`：Manifest 的参数规则错误由自校验发现；配置传 string 给 age 由 Compiler 发现；真实实现返回 string 由能力契约测试发现。静态 Manifest 不能证明运行时每次返回都正确，也不能证明没有 I/O 或副作用。

验收要求同一坏 Manifest 在自检和 Compiler 边界给出一致根因；后者将错误关联 Catalog 来源，抑制随后的使用类型级联。合法 Manifest 被错误调用时诊断指向表单配置。单个元信息可不依赖完整表单检查；实现测试不被元信息结构通过替代。

## 声明、Scope 与引用模块 {#module-references}

**责任：**把名字和引用解释成可检查的静态事实；交付时保留原词法语法，不替代 Runtime 身份。

先登记 expressions、constraints、viewTemplates，再分析引用，支持前向引用。规则 ID 重复、命名表达式缺失、模板缺失分别给诊断；Symbol 表是内部查询结构，不新增协议上的中央计划。

| 上下文 | 处理规则 |
| --- | --- |
| 根引用 | 无 scope 的 data Pointer 始终相对业务根，不隐式捕获当前成员 |
| Binder 链 | 有序建立 one / each；后项可用前项，不可用未来项；沿用禁止非法遮蔽 |
| each | 静态来源模型必须支持数组绑定，内部环境使用元素 Schema；真实数量未知 |
| one | 绑定指定位置及其模型；默认 one 在 Prepared 中明确化 |
| 模板 | 形参按 schemaRef 建环境；调用处核对 DataReference 实参，不能隐式捕获其他局部 Scope |
| 命名表达式 | 在自身合法定义环境分析，不捕获调用者局部 Scope，也不引入参数化函数语言 |
| Event | 只在对应物料 Event / Request Payload 上下文有效，模型来自该事件或请求输入契约 |
| Context | Host 提供且只读；不新增 Command 写入或自动 Context watch |

JSON Pointer 检查空串、空字符串属性及 ~0 / ~1，字段存在性结合 Schema 的 properties / additionalProperties 等契约判断，不能把“没有列在 properties”在所有 Schema 下都等同于不存在。无法证明引用形状时保留具体原因，并在需要类型连接的位置按既有规则拒绝无法证明的连接。

用于 array.remove / move 的 $scope 必须是当前可见的成员句柄；不能是业务值、固定下标或提前分配的运行时 Scope ID。命令执行时目标实际类型、成员是否仍存在、位置是否越界仍由 Runtime 检查。

**例子：**规则声明 insured each 后，`{ source:'data', scope:'insured', path:'/age' }` 能取得 Insured.age 的模型；相同引用放在没有该 Binder 的全局命名表达式中不能成立。输出仍是该引用，不改成 scopePatternId。

**验收：**前向引用、嵌套 Binder、模板参数、each 元素模型、Event 合法位置、Pointer 转义和句柄位置都有正反例；数组移动不影响编译结果。

## Schema 资源与类型连接模块 {#module-schema}

**责任：**复用一个有限、可解释的结构兼容判断；不建设任意 JSON Schema 包含证明器，不校验实际用户数据。

输入是根业务 Schema、外部资源、Manifest Schema 与当前位置。先按 $id / 基址 / $ref / 声明 Pointer 解析资源，再投影可判定的模型结构；Schema 的合法递归通过资源身份与访问状态处理，不误报为模板或表达式环。

| 首期支持的连接 | 举例 |
| --- | --- |
| 确定同一资源及 Schema 引用 | 模板形参与同一 Insured 模型引用 |
| 基础类型 | integer 可接入 number，string 不能接入 number |
| null、const / enum | 源的所有可能值须被目标接受 |
| 对象 | 必需属性、属性类型、额外属性约束 |
| 同构数组 | 元素形状能接入目标元素契约 |
| 可明确判定的简单联合 | 源每个可能分支均满足目标 |

统一返回 compatible / incompatible / unproven。前者允许连接；后两者在要求静态证明的接入处都是 Error，但原因不同。任意 not、复杂条件或无法解析资源不应被伪装成已兼容。

### 连接方向

| 使用处 | 源 → 目标 |
| --- | --- |
| Binding | 被引用的数据模型 → 物料端口的接入模型 |
| 动态 Props | ValueSpec 的结果形状 → 物料 Props Schema |
| 函数参数 | 实参表达式的结果模型 → 对应形参 Schema |
| 表达式位置 | 函数 / 复用表达式的返回模型 → boolean 等位置要求 |
| 模板调用 | 实参 DataReference 的模型 → 形参 schemaRef |
| Request 输入 | 物料输入经配置映射后的模型 → Host 输入模型（有静态契约时） |
| Request 结果 | Host 返回模型 → 物料期望结果模型（有静态契约时） |

纯静态 Props / Literal 可以按目标 Schema 验证其实际配置值；动态值的连接证明采用上述结构子集。不能把 data.schema 的 minLength、minimum 或当前值是否 Missing 当成 Runtime 写入门禁，也不宣称静态检查保证 Working Data 永远合法。

业务根 Schema 保持完整，不按关键字拆成多个局部校验器。字段前置的 Schema 影响范围若不能精确推导，观察可保守覆盖相关对象 / 根范围，但 Runtime 的 Schema 校验仍按既定完整根域执行。

Context 类型的静态来源是本专题识别的后期接缝：当前 CompileInput 未单独约定 contextSchema。没有证据时必须返回 unproven，而不是猜类型；是否在 Compiler 上下文增加可选 Context Schema 声明见本期确认结论与后期接缝。

**验收：**每类兼容均有正反例；无法证明单独分类；合法 Schema 递归能终止分析；外部资源基址和完整闭包正确；不执行任何业务函数。

## 表达式与 ValueSpec 模块 {#module-expression}

**责任：**在一次语义分析中同时得到表达式结果模型、可能读取及使用到的函数，供不同位置解释；不建立订阅，不执行计算。

| 语法节点 | 类型分析 | 读取分析 |
| --- | --- | --- |
| 常量 | 得到对应常量 / 基础模型 | 无 Data 依赖 |
| ref | 在合法环境解析引用及模型 | 记录对应读取；Event 只用于调用，不生成 Data watch |
| use | 分析被引用的命名表达式，检测引用环 | 复用其合法读取，不能捕获调用者局部 Scope |
| op + args | 查 PureFunctionManifest，逐参数连接，得到 returns | 合并全部参数可能读取；不看函数实现 |
| literal | 原值模型 | 不扫描内部 ref / use / op |
| ValueSpec 对象 / 数组 | 递归分析构造后的形状 | 只在合法 $expr 入口进入表达式 |
| $literal | 原值模型 | 内部完全不作为协议解释 |

参数检查包含固定参数数目、尾部 optional、restParameter、类型连接、结果使用位置。core.and / or / if 的运行时短路不改变静态读取覆盖全部可能分支；注册函数不接收 AST 或求值器。

### 根据位置生成不同结果

```text
分析结果：返回 boolean，读取 insured.age

Constraint.assert → boolean 检查；读取并入整条规则 watch
Reaction.when    → boolean 检查；不追加 Reaction.watch
Props.$expr      → 检查 Props 类型；包装增加自身 watch
请求 Payload     → 检查输入连接；保留按调用求值包装
```

生成 Data watch 时使用完整引用及观察方面去重，保留 scope / path，不对不同词法环境仅按字符串路径去重。不新增 Context / Event 触发来源。函数接收整对象时保守观察对象范围，不通过执行函数猜内部字段。

### 精确到完整表达式的例子

```javascript
props: {
  disabled: {
    $expr: { op: "core.lt", args: [
      { ref: { source: "data", path: "/age" } }, 18
    ] },
    watch: [{ source: "data", path: "/age" }]
  },
  caption: {
    $expr: { ref: { source: "data", path: "/name" } },
    watch: [{ source: "data", path: "/name" }]
  }
}
```

age 变化不要求重算 caption。内部 lt / ref 不分别建立观察。普通 `props.watch` 是物料属性；只有严格 $expr 包装内的 watch 才是依赖元信息。调用时包装不能混入响应式 watch；$literal 内和求值返回对象不再扫描。

本次编译内允许按声明身份与词法 / 模板 / Event 环境缓存分析结果；不能仅按表达式名称跨环境复用。结果缓存属于运行时；Compiler 不把当前结果、回调或真实 Scope 写入 Prepared。

**验收：**递归嵌套、命名复用、合法 Literal、短路所有分支、整对象输入、按位置语义和非法包装均覆盖；相同字段名在不同 Scope 不串依赖。

## 规则与同步前置模块 {#module-rules}

**责任：**把共享分析结果解释成 Reaction / Constraint 行为，并准备跨规则关系；不运行 Flush、校验任务或 Host。

### Reaction 与 Command

Reaction：建立规则词法环境 → 检查显式 Data / Validation watch 与字段 Scope → 检查 when 的 boolean → 按 ReactionAction 分支检查 then → 明确 runOnActivate → 保留原触发集合。命令检查七种既有结构、引用可写性、句柄及位置；命令值按调用求值，不附加持续观察。

set / patch 可以写业务不合法的工作值，不能仅因目标业务 Schema 不接受当前值而升级成写入权限。数组命令的当前目标值类型、实际长度和句柄有效性由 Runtime 保护；Compiler 负责静态模型和配置自身能证明的部分。

### Constraint

| 类型 | 局部检查 | 最终有效 watch |
| --- | --- | --- |
| Internal | ID、Scope、when / assert boolean、issue 目标和消息、requires | when + assert 的可分析 Data 读取，再合并必要前置依赖 |
| External | 独立 validator 名、Scope、when、显式 Data watch、target、requires、可选 Host 版本 | 显式 watch + when 的可分析读取，再合并必要前置依赖 |

Issue target 是归属位置，不因定位自身自动成为输入；External target 不能代替完整依赖。不存在的必需 Pure Function 是 Error；未提供 HostContract 时提取明确 Validator 需求，真实注册留在装配检查，不能判定校验通过。

### requires 的完整处理

1. 对规则前置定位目标 Constraint，拒绝自引用、确定环和 External 目标。
2. 对字段前置定位字段及相关适用 Internal 声明；不包括 External，也不要求作者区分 Issue 来源。
3. 检查当前词法 Scope 下能否唯一绑定目标实例模式；不把“一个规则 ID”误当作整个数组所有实例。
4. 建立同步前置关系，按可终止顺序传递输入依赖。内部关系可用图表示，不作为执行 DAG 交付。
5. 输出原 requires 字段；字段分支增加 constraintIds，规则分支保留 constraintId。
6. 规则 watch 中包含影响前置资格的输入。字段 Schema 影响无法局部证明时保守覆盖；不能只复制 Issue target 漏掉跨字段条件。

```text
A：证件号码与出生日期匹配
B：requires A，显式 watch 证件号码

输出 B.watch：证件号码、出生日期
输出 B.requires：A

出生日期变化 → B 旧结论失效
何时请求、如何补齐本轮 A → Runtime 校验策略
```

若 requires 目标或其分析已错误，报告根因和关联来源，抑制无意义的“后置依赖为空”级联误报。独立规则继续检查；最终无部分执行产物。

**验收：**前向规则引用、字段 / 规则前置、依赖传递、Scope 唯一绑定、环、自包含、跨 External 等待、同名数组成员隔离均有案例。

## 视图、物料与模板模块 {#module-view}

**责任：**把当前视图和共享模板的配置接入确定物料契约，准备表达式与交互边界。它不创建组件、DOM 或真实订阅。

### 一个物料节点的完整处理顺序

1. 从契约单元取得 material 对应 Manifest 与已选制品。
2. 在当前 Scope / 模板参数环境检查 bindings，并取得绑定模型。
3. 递归分析 props 的 ValueSpec，核对整体 Props 结构和动态字段接入；给每个完整响应式 $expr 增加 watch。
4. 检查 slots 的名称，递归编译子节点；不新增通用数量规则。
5. 对 on 中每个物料事件查询 Payload Schema，在仅该事件有效的 Event 环境分析 Command / host.emit。
6. 对 requests 核对所有必需映射，分析输入连接和返回连接，明确并发策略与 Schema 资源引用。
7. 收集所用物料、函数、Host 名称及静态来源；最终为物料节点分配确定 id。

| 检查对象 | 正确例子 | 错误例子 |
| --- | --- | --- |
| Binding | 模型 string → value 端口 string | 未声明端口；integer 接入 string |
| Props | disabled 表达式 → boolean | number 返回值接入 boolean |
| Slot | slots.default 在 Manifest 中 | 未声明的 slots.footer |
| Event | select 的 payloadSchema 允许 /value | 无 Payload 事件却引用 event:/value |
| Request | 所用物料全部声明请求均映射 | 漏掉必需 search 映射 |

Manifest 本身通过结构检查不等于上述配置已匹配；反过来 Catalog 中仅加载而未使用的物料不产生页面请求注册义务。

### Template 与 ScopeNode

ScopeNode 先检查并建立 Binder 环境，再处理 node；each 保存静态模式，不展开真实数组。TemplateUse 先查模板，检查 with 参数名和模型连接，再记录模板引用；模板体在声明的形参环境准备一次。缺参数、错误 schemaRef、类型不兼容、模板引用环均为诊断。

模板内 watch 可引用形参 person；运行时通过调用处 with 再绑定实际 Scope。静态节点 id 标识模板中的声明，实际组件实例还具有调用位置与 Scope 身份；不能把共享模板的静态 id 当成唯一运行时组件 ID。

只输出选定视图的模板传递闭包，但完整共享 expressions / constraints / reactions 保留。保留的命名表达式也必须纳入能力使用与合法性分析，不能因为当前视图没有引用就漏锁其内部函数。

### Request 分析与输出

```text
物料请求 payloadSchema
    ↓ 原样转发或配置 Payload 表达式
映射后输入模型
    ↓ 有 HostContract 时证明连接
Host payloadSchema

Host resultSchema → 物料 resultSchema
```

无 HostContract 时仍携带物料输入 / 结果约束、生成 Host 需求和无法证明项；装配阶段必须核对真实注册。配置没有结果转换 DSL；返回值由物料按约消费。Payload 中 Data / Context / Event 读取不形成自动重发。

输出节点 requests 增加 concurrency、payloadSchemaRef / resultSchemaRef，有 Host 声明时增加 Host 对应引用；资源位于 resources.requestSchemas。latest / parallel、取消与过期交付由 Adapter / Host 运行时落实，不编进 Reaction 或 Validator Pending。

**验收：**端口 / 事件 / 请求链路、参数环境、精确表达式 watch、共享模板只交付一次、静态节点 ID 与实际实例分离、缺请求映射和无 Host 静态契约均覆盖。

## 输出、资源与锁定模块 {#module-output}

**责任：**把已完成的领域结果转成现行 Prepared 形状，收齐交付物并核对引用。不是发布平台，也不再独立解释源 AST。

| 装配对象 | 收集方式 | 完整性检查 |
| --- | --- | --- |
| definition | 规范定义 + 规则 / 表达式准备片段 | 一份所选视图，完整共享规则，原领域组织保留 |
| templates | 从所选视图递归追踪静态 $use | 依赖闭合、无环、参数均已检查 |
| schemas | 根 data.schema 保留原位，必要外部引用进入资源表 | $id / 基址明确，全部必要 $ref 可解析；合法递归保留 |
| requestSchemas | 收集物料及已知 Host 输入输出契约 | 节点 Schema 引用存在，不混入业务校验 |
| capabilityLock | 收集实际交付规则、表达式、视图和模板使用的能力 | ID / 版本 / Manifest 摘要 / artifact 身份齐全 |
| hostRequirements | 聚合 validators / events / requests | 规则和 nodeIds 指向确定声明；没有实际函数对象 |
| build | 本 Compiler 身份、快照、所选 Profile、可选平台 | 不按时间戳、随机 ID 或最新目录决定 |

静态节点身份建议从定义身份与规范源位置确定，并保留原来源对应；不使用时间 / 随机数。内部可以排序表和生成 ID，但不重排有语义顺序的 args、then、batch、slots 子节点或 Binder 链。

Manifest 按确定序列化内容生成 manifestDigest；实现 artifact.digest 采用输入的确定制品摘要，Compiler 不读取实际代码现场计算。锁定多个能力可指向同一包，不重复下载或复制实现。具体确定序列化实现属于实施细化，必须有跨对象键序等测试。

输出自检建议包含 Prepared Schema 结构检查和轻量引用闭合检查。结构失败属于 Compiler 产物缺陷，不伪装成作者填写错误；源资源缺失则定位源引用。最终产物不能含临时符号表、分析图、函数、组件、实例状态或循环 JS 对象。

**验收：**JSON 往返不改变语义，同锁定输入输出可复现；无关 Catalog 不膨胀锁；资源不遗漏；同一 Prepared 可供多个实例复用；不能回退解释 L1。

## 诊断、来源与检查策略 {#diagnostics}

诊断是各模块共同产生的结果，首期不另建一个与编译分离的规则诊断系统。物料 / 函数自检复用诊断基本语义，但主来源是其 Manifest；Compiler 的使用错误以表单位置为主，契约位置作关联。

```typescript
interface Diagnostic {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  sourcePointer: string;
  relatedLocations?: Array<{
    sourceId: string; // 定义、Catalog 或 Schema 资源身份
    pointer: string;
    message?: string;
  }>;
}
```

这是本期诊断 SDK 的目标结构。输入本身是 JSON 对象时，JSON Pointer 是可靠位置；不承诺不存在的文件行列映射。Manifest 相关问题可用 relatedLocations 关联 Catalog 路径，未指定 sourceId 时 sourcePointer 默认相对本次源定义。

### 诊断例子

```text
code: CALL_ARGUMENT_INCOMPATIBLE
位置: /reactions/0/then/0/value/$expr/args/0
原因: calculatePremium 的第 1 个参数要求 number，模型为 string
关联: 当前 Catalog 中该函数 Manifest 的 /parameters/0/schema
处理: 不生成可执行 Prepared
```

| 情况 | 建议策略 |
| --- | --- |
| 输入结构非法 | 汇总结构错误后停止不安全语义遍历 |
| 独立语义错误 | 尽可能累计，例如未知 Slot 与另一规则的非法引用一次返回 |
| 根因派生错误 | 缺函数不再叠加猜测的返回类型错误；其他合法参数仍可检查 |
| 静态连接 incompatible / unproven | 都阻止连接，但代码与原因区分 |
| 无 Host 静态契约 | 返回需求与无法证明项，不等同于实际注册缺失 |
| 确定符号 / 模板 / requires 环 | Error；报告环链和关联位置 |
| 潜在 Reaction 运行环 | 后期风险工具，不以静态潜在环证明必然死循环 |
| 输出自检失败 | 明确内部装配错误；不归咎作者，不返回产物 |
| 超预算 | 明确失败和已完成诊断，不静默截掉节点生成部分表单 |

本期保证可解释的位置与依据，内部保留必要根因的来源关系；不为平台提前冻结完整因果图。下节说明后期如何从这些事实扩展报告。

诊断按稳定源位置和代码排序 / 去重，不把并行或 Map 遍历顺序变成不稳定结果。不同调用各持有收集器，不跨编译泄漏旧问题。

### 本期检查范围（已确认）

整份定义做结构检查；完整共享 Schema、命名表达式、Constraint、Reaction 做语义检查；当前选中视图和可达模板做目标能力与局部语义检查。未选视图另一平台的物料实现不应阻塞当前目标编译。未使用模板保留结构检查，不要求其目标物料可用；进入交付闭包后必须完整检查。

Catalog 建议整体检查结构，实际交付使用条目做目标 / 签名语义与锁定检查；无关未使用条目不产生 Host 注册义务。该范围由本期详细设计确认；不扩张先前输入输出协议的字段。

## 后期分析报告与可视化接入 {#analysis-report}

这是整体蓝图下的后期设计方向，描述必要信息与复用方式，不是本期已导出的 AnalysisReport SDK。Prepared 结构与本期 compile 主入口保持前文定义。

### 报告需要的事实种类

| 事实 | 关键内容 | 平台用途 |
| --- | --- | --- |
| 声明与位置 | 原始源位置、声明身份、所属 Scope / Template、能力身份 | 配置跳转、节点定位、分组 |
| 引用与展开链 | use / 参数 / 模板绑定指向哪里，经过哪些声明 | 错误链路与复用解释 |
| 类型连接 | 源模型、目标契约、兼容判定、失败原因及来源 | 解释参数 / Props / Binding 不匹配 |
| 读取 | 具体表达式或规则的可能 Data / Context / Event 读取及使用位置 | 展示计算依赖，不能直接转成触发 |
| 触发与失效 | Reaction 显式 watch、Props watch、Constraint 有效 watch 及来源 | 响应式 / 校验依赖展示 |
| 写入 | Command 声明的目标、命令所属规则与位置 | Reaction 静态影响排布 |
| 前置与结果归属 | requires 指向、字段相关 Internal、Schema 关联、Issue target | Validation 资格与错误归属展示 |
| 未解析与覆盖范围 | 已完成分析区域、缺契约 / 结构错误处、无法证明的位置 | 避免把“没画出来”误认为“不存在依赖” |

不同关系类型必须明确区分。例如读取关系不授权触发，Issue target 不自动成为输入，requires 不代表异步等待；运行时真实 Scope ID 不混入静态节点身份。

### 错误链路例子

```text
props.disabled
  → use isMinor
  → isMinor 调用 core.lt
  → 第 1 个实参读取根字段 /age
  → 源模型 string
  → core.lt 参数要求 number
  → 连接失败
```

报告应能把这几步关联到原始表单、Schema 与 Manifest，而不只是列出数个无关系的位置。平台决定画成路径、树还是图；点击哪一层、如何布局、颜色与折叠都不进入 Compiler 协议。该例为全局命名表达式读取根字段，不允许隐式捕获调用处局部 Scope。

### 成功、失败与不完整分析

报告与确定输入修订 / 内容身份、Catalog、目标和分析规则版本关联，不能将旧报告贴到新配置。成功可以返回完整范围内的报告；失败只能交付已可靠分析的事实、诊断与未解析位置，并明确覆盖范围。结构错误使某段不可遍历时该段是 unavailable，不能伪造空依赖。

错误配置的分析报告是工具数据，不是部分 Prepared；Runtime 永不接收它。首期不必向用户导出部分符号表，但内部组织不能把“无法形成执行产物”等同于“所有诊断与可靠事实一并丢弃”。

### 静态图与 Runtime Trace 的联合展示

静态图回答“配置声明的可能关系是什么”；Trace 回答“这个会话这轮实际发生什么”。例如静态图上 Reaction 读取 age，并不证明 age 触发过执行；Validator 可能因 when=false 未启动，也可能结果因输入变化已失效。

后期 Devtools 通过静态来源与实例 / 轮次标识关联两者。Compiler 不保留用户会话；Runtime 不为展示实时维护全量因果图；平台不把编辑图的节点顺序变成调度顺序。Trace 的保存、脱敏、截断和访问控制归相应调试 / 平台设计。

### 实现方式与取舍

建议复用共享分析得到的类型、读取、引用、前置和来源，并在请求报告时收集额外解释信息；由报告装配步骤投影为工具数据。不要公开整个 CompileContext 或所有内部 Map，避免平台绑定内部算法。全量 read / write 风险分析可以是额外可选步骤，不成为默认成功编译的成本。

本期实现来源映射、诊断证据和无 UI 的分析模块；平台阶段再固化报告字段、独立格式版本、收集开关、增量模式及预算。是否随 compile 返回附件或提供 analyze API，届时按真实编辑消费者决定，不首期开放两条语义各异的分析路径。

## 贯穿案例与输入输出对照 {#worked-example}

案例：一个被保险人列表，每行有年龄、保额和保费；共享模板显示保费并按年龄禁用；同步年龄校验为外部资格校验提供字段前置；保额变化触发纯函数计算。下方只突出差异，完整源定义和预期产物嵌入本页的“完整契约样本”。

| 分析环节 | 本例要完成的工作 | 明确不做 |
| --- | --- | --- |
| 元信息 | 取得 premium-card 的 Props / Binding 与 calculatePremium 的参数 / returns；取得 core 签名 | 不导入卡片组件或执行业务计算 |
| Scope | insured each、模板形参 person、两者模型连接 | 不生成被保险人 A/B 的真实 Scope ID |
| 表达式 | 参数 number / 结果 number；disabled 返回 boolean | 不把树编成 JS 或字节码 |
| Props 依赖 | quote 观察 person.premium；disabled 观察 person.age | 不组件合并后全部重算 |
| 校验 | adult 的 watch 为 insured.age；资格规则补前置年龄依赖 | 不发 Host 请求，不复用历史通过结果 |
| Reaction | 保留显式 insured.amount watch | 不因为计算读 age 自动追加触发 |
| 交付 | 一份 premiumCard 模板、所需能力锁和 Validator 需求 | 不复制模板为实际成员数份 |

### 依赖变化与运行消费

| 修改 | Prepared 提供的关系 | 运行时行为 |
| --- | --- | --- |
| 某成员 age | disabled 的 watch、adult 和资格规则的 watch | 对应表达式 / 校验失效，其他成员不串项 |
| 某成员 amount | Reaction 显式 watch、资格规则的 watch | 联动按规则执行；校验失效不等于立即外部请求 |
| 联动写 premium | quote 的 watch | 仅对应 quote 表达式失效 |
| 数组成员移动 | Scope / each 关系保留 | Runtime 跟随稳定身份，不重编 Definition |

这个例子刻意保留 Reaction 只 watch amount 的作者意图；age 变化不自动重算 premium。是否修改作者配置是业务选择，不是 Compiler 偷补。

### 字段级对照

| 输入 | 输出 | 类别 |
| --- | --- | --- |
| assert / when / then / props 中原表达式 | 原表达式保留 | 保留 |
| Internal 没有 watch | 增加有效 watch | 必要准备 |
| 外部显式 amount watch + 字段前置 age | amount + age 有效 watch | 必要准备 |
| requires 字段前置 | 增加 constraintIds: [adult] | 必要准备 |
| props.quote.$expr | 同包装增加 watch: person.premium | 精确呈现准备 |
| 共享 $use / with | 保留，同一模板仅一份 | 保留 / 闭包 |
| material 节点没有静态 id | 增加确定 id | 请求与诊断定位 |
| 无全局平台选项 | build.platform 可省略，artifact.platform 仍确定 | 默认易用性 |

### 完整契约样本

以下三份 JSON 可展开查看和复制。`example-*` 版本、制品摘要和快照身份是演示值；不是已发布版本或真实实现身份。示例 Manifest 摘要仅按本附件固定的键序与紧凑 JSON 计算，用于展示两个摘要的区别，不将该序列化策略提升为已确认算法。

输入只有一个名为 default 的视图，所以调用只需 `compile({ definition, catalog })`；default 名称本身不是要求。该例没有外部 Schema 或 Request，因此对应资源表为空。字段年龄的 Schema 为局部类型约束，没有跨字段条件；本例资格前置的新增读取可定位为 age。


<details class="reference-details">
<summary>A · 完整输入 Definition</summary>

```json
{
  "protocolVersion": "example-protocol",
  "id": "insurance-quote",
  "version": "example-draft",
  "data": {
    "schema": {
      "type": "object",
      "properties": {
        "insureds": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Insured"
          }
        }
      },
      "required": [
        "insureds"
      ],
      "additionalProperties": false,
      "$defs": {
        "Insured": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string"
            },
            "age": {
              "type": "integer"
            },
            "amount": {
              "type": "number"
            },
            "premium": {
              "type": "number"
            }
          },
          "required": [
            "name",
            "age",
            "amount",
            "premium"
          ],
          "additionalProperties": false
        }
      }
    }
  },
  "constraints": [
    {
      "id": "adult",
      "kind": "internal",
      "scope": {
        "from": {
          "source": "data",
          "path": "/insureds"
        },
        "as": "insured",
        "mode": "each"
      },
      "assert": {
        "op": "core.gte",
        "args": [
          {
            "ref": {
              "source": "data",
              "scope": "insured",
              "path": "/age"
            }
          },
          18
        ]
      },
      "issue": {
        "target": {
          "source": "data",
          "scope": "insured",
          "path": "/age"
        },
        "code": "AGE_TOO_YOUNG"
      }
    },
    {
      "id": "eligibility",
      "kind": "external",
      "validator": "insurance.eligibility",
      "scope": {
        "from": {
          "source": "data",
          "path": "/insureds"
        },
        "as": "insured",
        "mode": "each"
      },
      "watch": [
        {
          "source": "data",
          "scope": "insured",
          "path": "/amount"
        }
      ],
      "requires": [
        {
          "kind": "field",
          "target": {
            "source": "data",
            "scope": "insured",
            "path": "/age"
          },
          "phase": "sync"
        }
      ],
      "target": {
        "source": "data",
        "scope": "insured",
        "path": "/age"
      }
    }
  ],
  "reactions": [
    {
      "id": "recalculate",
      "scope": {
        "from": {
          "source": "data",
          "path": "/insureds"
        },
        "as": "insured",
        "mode": "each"
      },
      "watch": [
        {
          "source": "data",
          "scope": "insured",
          "path": "/amount"
        }
      ],
      "then": [
        {
          "op": "set",
          "target": {
            "source": "data",
            "scope": "insured",
            "path": "/premium"
          },
          "value": {
            "$expr": {
              "op": "insurance.calculatePremium",
              "args": [
                {
                  "ref": {
                    "source": "data",
                    "scope": "insured",
                    "path": "/age"
                  }
                },
                {
                  "ref": {
                    "source": "data",
                    "scope": "insured",
                    "path": "/amount"
                  }
                }
              ]
            }
          }
        }
      ]
    }
  ],
  "views": {
    "default": {
      "scope": {
        "from": {
          "source": "data",
          "path": "/insureds"
        },
        "as": "insured",
        "mode": "each"
      },
      "node": {
        "$use": "premiumCard",
        "with": {
          "person": {
            "source": "data",
            "scope": "insured",
            "path": ""
          }
        }
      }
    }
  },
  "viewTemplates": {
    "premiumCard": {
      "params": {
        "person": {
          "schemaRef": "#/$defs/Insured"
        }
      },
      "node": {
        "material": "premium-card",
        "bindings": {
          "name": {
            "source": "data",
            "scope": "person",
            "path": "/name"
          }
        },
        "props": {
          "quote": {
            "$expr": {
              "ref": {
                "source": "data",
                "scope": "person",
                "path": "/premium"
              }
            }
          },
          "disabled": {
            "$expr": {
              "op": "core.lt",
              "args": [
                {
                  "ref": {
                    "source": "data",
                    "scope": "person",
                    "path": "/age"
                  }
                },
                18
              ]
            }
          }
        }
      }
    }
  }
}
```

</details>



<details class="reference-details">
<summary>B · 完整能力契约 Catalog</summary>

```json
{
  "id": "example-catalog-snapshot",
  "materials": {
    "premium-card": {
      "manifest": {
        "id": "premium-card",
        "version": "example-capability",
        "propsSchema": {
          "type": "object",
          "properties": {
            "quote": {
              "type": "number"
            },
            "disabled": {
              "type": "boolean"
            }
          },
          "required": [
            "quote",
            "disabled"
          ],
          "additionalProperties": false
        },
        "bindings": {
          "name": {
            "schema": {
              "type": "string"
            }
          }
        }
      },
      "artifact": {
        "id": "example-premium-card-build",
        "platform": "web",
        "digest": "sha256:2222222222222222222222222222222222222222222222222222222222222222"
      }
    }
  },
  "pureFunctions": {
    "core.gte": {
      "manifest": {
        "id": "core.gte",
        "version": "example-capability",
        "parameters": [
          {
            "name": "left",
            "schema": {
              "type": "number"
            }
          },
          {
            "name": "right",
            "schema": {
              "type": "number"
            }
          }
        ],
        "returns": {
          "type": "boolean"
        }
      },
      "artifact": {
        "id": "example-core-build",
        "platform": "web",
        "digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111"
      }
    },
    "core.lt": {
      "manifest": {
        "id": "core.lt",
        "version": "example-capability",
        "parameters": [
          {
            "name": "left",
            "schema": {
              "type": "number"
            }
          },
          {
            "name": "right",
            "schema": {
              "type": "number"
            }
          }
        ],
        "returns": {
          "type": "boolean"
        }
      },
      "artifact": {
        "id": "example-core-build",
        "platform": "web",
        "digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111"
      }
    },
    "insurance.calculatePremium": {
      "manifest": {
        "id": "insurance.calculatePremium",
        "version": "example-capability",
        "parameters": [
          {
            "name": "age",
            "schema": {
              "type": "number"
            }
          },
          {
            "name": "amount",
            "schema": {
              "type": "number"
            }
          }
        ],
        "returns": {
          "type": "number"
        }
      },
      "artifact": {
        "id": "example-insurance-build",
        "platform": "web",
        "digest": "sha256:3333333333333333333333333333333333333333333333333333333333333333"
      }
    }
  },
  "host": {
    "validators": {
      "insurance.eligibility": {
        "contractVersion": "example-validator-contract"
      }
    }
  }
}
```

</details>



<details class="reference-details">
<summary>C · 完整预期 Prepared（人工契约样本）</summary>

```json
{
  "preparedFormatVersion": "example-prepared-format",
  "build": {
    "compilerVersion": "example-compiler",
    "catalogSnapshotId": "example-catalog-snapshot",
    "profile": "default"
  },
  "definition": {
    "protocolVersion": "example-protocol",
    "id": "insurance-quote",
    "version": "example-draft",
    "data": {
      "schema": {
        "type": "object",
        "properties": {
          "insureds": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/Insured"
            }
          }
        },
        "required": [
          "insureds"
        ],
        "additionalProperties": false,
        "$defs": {
          "Insured": {
            "type": "object",
            "properties": {
              "name": {
                "type": "string"
              },
              "age": {
                "type": "integer"
              },
              "amount": {
                "type": "number"
              },
              "premium": {
                "type": "number"
              }
            },
            "required": [
              "name",
              "age",
              "amount",
              "premium"
            ],
            "additionalProperties": false
          }
        }
      }
    },
    "constraints": [
      {
        "id": "adult",
        "kind": "internal",
        "scope": {
          "from": {
            "source": "data",
            "path": "/insureds"
          },
          "as": "insured",
          "mode": "each"
        },
        "assert": {
          "op": "core.gte",
          "args": [
            {
              "ref": {
                "source": "data",
                "scope": "insured",
                "path": "/age"
              }
            },
            18
          ]
        },
        "issue": {
          "target": {
            "source": "data",
            "scope": "insured",
            "path": "/age"
          },
          "code": "AGE_TOO_YOUNG"
        },
        "watch": [
          {
            "source": "data",
            "scope": "insured",
            "path": "/age"
          }
        ]
      },
      {
        "id": "eligibility",
        "kind": "external",
        "validator": "insurance.eligibility",
        "scope": {
          "from": {
            "source": "data",
            "path": "/insureds"
          },
          "as": "insured",
          "mode": "each"
        },
        "watch": [
          {
            "source": "data",
            "scope": "insured",
            "path": "/amount"
          },
          {
            "source": "data",
            "scope": "insured",
            "path": "/age"
          }
        ],
        "requires": [
          {
            "kind": "field",
            "target": {
              "source": "data",
              "scope": "insured",
              "path": "/age"
            },
            "phase": "sync",
            "constraintIds": [
              "adult"
            ]
          }
        ],
        "target": {
          "source": "data",
          "scope": "insured",
          "path": "/age"
        }
      }
    ],
    "reactions": [
      {
        "id": "recalculate",
        "scope": {
          "from": {
            "source": "data",
            "path": "/insureds"
          },
          "as": "insured",
          "mode": "each"
        },
        "watch": [
          {
            "source": "data",
            "scope": "insured",
            "path": "/amount"
          }
        ],
        "then": [
          {
            "op": "set",
            "target": {
              "source": "data",
              "scope": "insured",
              "path": "/premium"
            },
            "value": {
              "$expr": {
                "op": "insurance.calculatePremium",
                "args": [
                  {
                    "ref": {
                      "source": "data",
                      "scope": "insured",
                      "path": "/age"
                    }
                  },
                  {
                    "ref": {
                      "source": "data",
                      "scope": "insured",
                      "path": "/amount"
                    }
                  }
                ]
              }
            }
          }
        ],
        "runOnActivate": false
      }
    ],
    "views": {
      "default": {
        "scope": {
          "from": {
            "source": "data",
            "path": "/insureds"
          },
          "as": "insured",
          "mode": "each"
        },
        "node": {
          "$use": "premiumCard",
          "with": {
            "person": {
              "source": "data",
              "scope": "insured",
              "path": ""
            }
          }
        }
      }
    },
    "viewTemplates": {
      "premiumCard": {
        "params": {
          "person": {
            "schemaRef": "#/$defs/Insured"
          }
        },
        "node": {
          "material": "premium-card",
          "bindings": {
            "name": {
              "source": "data",
              "scope": "person",
              "path": "/name"
            }
          },
          "props": {
            "quote": {
              "$expr": {
                "ref": {
                  "source": "data",
                  "scope": "person",
                  "path": "/premium"
                }
              },
              "watch": [
                {
                  "source": "data",
                  "scope": "person",
                  "path": "/premium"
                }
              ]
            },
            "disabled": {
              "$expr": {
                "op": "core.lt",
                "args": [
                  {
                    "ref": {
                      "source": "data",
                      "scope": "person",
                      "path": "/age"
                    }
                  },
                  18
                ]
              },
              "watch": [
                {
                  "source": "data",
                  "scope": "person",
                  "path": "/age"
                }
              ]
            }
          },
          "id": "template-premium-card"
        }
      }
    }
  },
  "resources": {
    "schemas": {},
    "requestSchemas": {}
  },
  "capabilityLock": {
    "materials": {
      "premium-card": {
        "id": "premium-card",
        "version": "example-capability",
        "manifestDigest": "sha256:e6efc32d5d72acc49bddec17ca1f8c0777a7843c80b6926595f9868264901d14",
        "artifact": {
          "id": "example-premium-card-build",
          "platform": "web",
          "digest": "sha256:2222222222222222222222222222222222222222222222222222222222222222"
        }
      }
    },
    "pureFunctions": {
      "core.gte": {
        "id": "core.gte",
        "version": "example-capability",
        "manifestDigest": "sha256:0b13ff7a39d581a0d55b0088bcb6cdd4c5360a5e0f248fcc8647306307ea0069",
        "artifact": {
          "id": "example-core-build",
          "platform": "web",
          "digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111"
        }
      },
      "core.lt": {
        "id": "core.lt",
        "version": "example-capability",
        "manifestDigest": "sha256:aadcd49ad4f2b1e2473f85fc21147a0ce259d7898a1158b6c4e78dc5c7fb2e49",
        "artifact": {
          "id": "example-core-build",
          "platform": "web",
          "digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111"
        }
      },
      "insurance.calculatePremium": {
        "id": "insurance.calculatePremium",
        "version": "example-capability",
        "manifestDigest": "sha256:acbf8350c46fb5e81111eae39825e1b4107a05193be68691d8d90f44f6fab392",
        "artifact": {
          "id": "example-insurance-build",
          "platform": "web",
          "digest": "sha256:3333333333333333333333333333333333333333333333333333333333333333"
        }
      }
    }
  },
  "hostRequirements": {
    "validators": [
      {
        "name": "insurance.eligibility",
        "constraintIds": [
          "eligibility"
        ],
        "contractVersion": "example-validator-contract"
      }
    ],
    "events": [],
    "requests": []
  }
}
```

</details>


### 四个关键差异（高亮为新增内容）

保留表达式和引用，仅增加运行时消费需要的信息。下面是局部片段，完整合法结构以上方 C 为准。

<p><strong>① Props 表达式</strong>：quote 与 disabled 各自获得独立依赖。</p>

<pre><code>quote: { $expr: 原表达式, <mark>watch: [person.premium]</mark> }
disabled: { $expr: 原表达式, <mark>watch: [person.age]</mark> }</code></pre>

<p><strong>② Internal / External</strong>：自动读取与前置依赖进入统一 watch 结构。</p>

<pre><code>adult: { assert: 原断言, <mark>watch: [insured.age]</mark> }
eligibility: { watch: [insured.amount, <mark>insured.age</mark>] }</code></pre>

<p><strong>③ 字段前置</strong>：保留原声明，补充适用 Internal 声明集合。</p>

<pre><code>{ kind: "field", target: insured.age, phase: "sync",
  <mark>constraintIds: ["adult"]</mark> }</code></pre>

<p><strong>④ Reaction</strong>：watch 仍然只有 amount；输出只明确默认激活行为。</p>

<pre><code>{ watch: [insured.amount], then: 原命令, <mark>runOnActivate: false</mark> }</code></pre>

### 同一案例的失败分支

把根 Schema 的 `Insured.age.type` 从 integer 改成 string：core.gte / core.lt 与 calculatePremium 的年龄实参不能接入 number 参数。诊断指向每个使用处，并关联根 Schema 与函数参数声明；按稳定位置返回独立错误，结果为 success:false，不附带 Prepared。

删除 premium-card Manifest：报告能力缺失，关联模板节点；抑制由此派生的 Props / Binding 契约错误。没有提供 HostContract 则不同：仍提取 insurance.eligibility 的需求，不声称已完成静态匹配或真实注册。

这些 JSON 仅用于审阅和结构校验；预期输出由人工契约构造，不能作为 Compiler 已运行、watch 推导已实现或性能已通过的证据。

## 性能、缓存与执行边界 {#nonfunctional}

### 本期收益与测量

| 准备项 | 预期收益 | 必须测量 / 保持的限制 |
| --- | --- | --- |
| 表达式级 watch | 运行时不用再发现依赖；无关表达式结果可复用 | 产物增加 watch；真实更新收益要有 Runtime 基准 |
| requires 解析与传递 | 各端不重复推导相关规则和失效集合 | Runtime 仍需实例绑定与本轮任务整理 |
| 共享模板 | 减少结构复制与体积 | Runtime 仍需参数绑定和实例化 |
| 资源闭包 / 能力锁 | 装载不再选择版本或联网补资源 | 保留实际装配 / 格式 / 能力检查 |
| 输入规范化 | Runtime 只处理规范写法 | 不把一次字符串拆分夸大成显著热路径提升 |

每次编译可建立引用 / Schema / 命名表达式的局部缓存；缓存键包含词法环境、模板参数和 Event / 契约上下文。首期不建设跨调用增量缓存、编译集群或全表长期分析图。调用方若缓存完整结果，身份必须覆盖定义内容、实际快照、目标、格式和 Compiler / 内置规则身份，不能只信一个可复用的 snapshot.id 字符串。

复杂度目标是有界遍历与可解释关系整理，不先承诺毫秒数。关注大列表定义、大量模板引用、深 ValueSpec、长前置链和复杂 Schema 的编译时间、峰值内存、产物体积。图关系只服务实际检查 / 依赖传递，不默认创建规则两两比较的影响矩阵。

### 资源与错误保护

建议对输入节点 / 嵌套深度、引用访问次数、Schema / 模板 / 前置关系数、诊断数量设置确定预算。具体阈值用基准选择，首期不在设计中编造性能数。预算失败必须返回诊断且无产物；合法 Schema 递归用身份去重和访问状态处理，不靠无限展开。

核心无网络、无任意脚本执行，不加载动态函数来推断依赖。不得修改原输入或共享 Catalog。日志避免复制完整业务配置；详细证据按诊断和来源最小必要返回，不自动上传数据。

## 验收、交付顺序与质量门禁 {#acceptance}

| 测试层 | 必须覆盖 | 不能代替的证据 |
| --- | --- | --- |
| 输入正反例 | 简写、默认值、冲突、严格包装、来源定位、输入不变 | 不是运行时业务校验 |
| 契约正反例 | 物料 / 函数 / 请求参数与返回、坏签名、未注册、目标身份 | 不能证明实现纯净或真实注册 |
| 静态分析 | Schema 子集三态、Scope / Event、递归 Expression、Literal、命名环 | 不执行用户纯函数验证静态结果 |
| 领域编译 | Reaction 保留、Constraint 依赖、requires 传递、模板共享、Props watch | 不把手写 watch 夹具当推导算法通过 |
| 产物联验 | 实际 compile 结果通过 Prepared Schema、引用闭合、JSON 往返、确定输出 | 本文和 protocol 测试的手写夹具不计为实际 compile 产物 |
| 公共消费 | 生产 / development exports、Node 与浏览器可用依赖、无 UI 反向引用 | 不自动声称 Dart / Flutter 实现通过 |
| 后续端到端 | Runtime / Adapter 精确失效、Scope 移动、Host 请求预检 | 必须真实消费者实现后补证据 |

交付建议按可验收纵切推进：

1. 输入、诊断、Catalog 访问与最小 Schema / 引用模型；简单静态物料能够完成真实编译。
2. 表达式检查与逐表达式 watch；用不同输入推导真实依赖，不只比较类型。
3. Reaction / Constraint / requires；覆盖跨规则传递、Scope 和失败路径。
4. 模板、完整物料端口与 Event / Request；补齐资源、锁、需求和产物自检。
5. 全量回归、确定性与复杂度基准，再交给 Runtime / Adapter 消费联验。

这些是同一已确认协议的实现批次，不为每批定义不兼容临时协议或正式发布版本。未知字段或尚不支持语义明确报错，不静默忽略。

沿用项目 pnpm check、protocol schema:check、模块测试、边界和打包消费。Compiler 新增实际语义测试，不能保留 passWithNoTests 作为生产完成证据；文档确认后按现有归档流程更新，实现范围遵守用户本期授权。

## 实施现状与证据边界 {#implementation-status}

**核对日期：2026-10-22。** 本期设计提交 6a0d97b 后先实施 I01，现已接入同一期 I02–I04 的共享分析和运行准备。拆批不改变本期范围，表达式依赖和 watch 生成不是后期平台功能。下表是实际状态，不把代码主链实现等同性能 / 运行端已验收。

| 项目 | 当前实际情况 | 可核对依据 / 限制 |
| --- | --- | --- |
| 归档与基线 | 本期完整设计已确认，先归档并提交 6a0d97b，再实现 | 输入输出继承 ADR-FE-017；无新增 ADR 或 ABI 决策替代 |
| 协议与 Schema | 三领域类型、10 个 2020-12 根 Schema、48 个协议测试已有 | 协议结构测试不等于依赖推导实现 |
| Compiler SDK | 真实 compile、CompileInput / CompileResult / Diagnostic 已导出 | 同步纯内存输入，Error 不返回 Prepared；仍 private / 0.0.0 |
| I01 静态视图 | 简写 / 默认目标、原位置、静态 Props / Literal、根 Binding、Slot、资源、锁与输出自检 | 初次 41 个用例保留并更新已支持语义的预期，纳入当前回归 |
| 能力自校验 | 可独立调用 Material / Pure Function 结构与参数顺序检查 | 不执行实现；独立自检尚不处理外部资源闭包；Registry / CLI 未建设 |
| Schema 模型 | 基础 / 简单对象 / 数组 / 简单联合连接、局部 / 外部引用、资源基址与闭包 | 复杂组合、联合对象路径投影、Tuple、命名锚点 / 动态引用不放行；Context 缺少类型证据按 unproven 处理 |
| 共享表达式分析 | 命名引用 / 环、参数数 / optional / rest / 返回形状、全部可能读取、Literal 边界 | ReferenceAnalyzer / ExpressionAnalyzer / ValueCompiler 共用，无纯函数执行或结果缓存 |
| 规则与 watch | 逐完整 Props $expr 独立 watch；Constraint 合并及 requires 传递；Reaction 仅保留显式触发 | 前置唯一 Scope 绑定、field.constraintIds、环 / External 拒绝、根 Schema 保守失效与命令检查已有用例 |
| 视图与交互 | Scope / 模板参数 / 共享闭包、Event / Request Payload、双向契约、并发默认、资源 / Host 需求与消息定位 | 调用时值不生成 watch；模板不展开；请求 Schema 根基址显式化；Runtime 实例 / 并发不在编译时运行 |
| 生产消费 | Node 生产编译入口已实际导入；隔离打包 JS / 类型消费纳入统一检查 | 不代表浏览器视觉、Runtime / Adapter 或更新性能已验收 |
| Runtime / Adapter | 生产入口仍为工程占位 | I06 需要真实消费者实现后联验 |
| 平台 | 独立分析报告、可视化与 Trace 联动仍为后期蓝图 | 不计入 I01 完成，不冻结其公共格式 |

实现入口见 packages/compiler/src/index.ts；用法与当前限制见 packages/compiler/README.md。新增 Ajv 8.20.0 与跨环境 SHA-256 库 @noble/hashes 1.8.0，复用仓库已有确定版本；Manifest 内容按递归键排序的紧凑 JSON 计算摘要，实现制品摘要原样锁定。当前格式身份 form-engine.prepared/2 为未发布交换格式，不代表 Runtime 已支持。

初次 I01 的全仓检查及资源 / 来源回归记录见[基础工程实施](../engineering.md#compiler-i01)。当前共享分析与运行准备的用例、打包消费和门禁证据见[工程实施](../engineering.md#compiler-static-analysis)。复杂度 / 体积基准、浏览器消费、精确失效和实际性能仍须后续证据，不因产物已有 watch 就宣称运行收益已通过。

文档 / 附件的示例、锚点、资源和脚本检查不能代替浏览器视觉检查；此前本地文件导航被安全策略拒绝，未取得浏览器视觉证据。

## 取舍与后期扩展 {#tradeoffs}

| 议题 | 本方案建议 | 取舍依据 |
| --- | --- | --- |
| 一个包还是多个包 | 一个 compiler 包，内部四职责组 | 规模可控、共享语义，避免过早物理拆分 |
| 分离 Validator / Optimizer | 领域编译复用同次类型 / 读取分析 | 避免两套遍历和语义漂移 |
| 读取 Registry 还是固定快照 | 调用环境取得固定快照，核心只读 | 可离线、可复现，本地不依赖平台 |
| 模板全展开 | 保留共享与已检查参数 | 控制体积，不为微小查找节省复制结构 |
| 组件合并观察 | 完整表达式 watch | 保留精确失效，框架自主处理渲染 |
| 平台重新解析协议 | 复用 Compiler 分析事实，独立报告 | 避免平台与执行语义漂移，保持 Prepared 轻量 |
| 由表单 Compiler 承担全部能力测试 | 自校验与实现测试归能力开发，共享契约规则 | 单能力可独立开发；Compiler 检查配置使用 |
| 新编译 Pass 插件框架 | 首期不用 | 当前没有第三方扩展编译语义的需求 |
| 代码生成 / VM | 后期按实测评估 | 当前产物是跨端静态结构 |
| 常量折叠 | 后期可研究确定内置语义 | 不执行任意注册函数，不改变错误 / 短路语义 |
| 增量分析 | 编辑器需求出现后复用内部阶段 | 先确保全量基线与产物一致 |
| 风险可视化 | 工具按需分析 | 不让完整影响图成为运行产物必经要求 |

## 实施步骤、依赖与完成条件 {#implementation-plan}

用户已授权按本期方案开始编码。实施按下列批次推进，具体已完成范围以实现记录和测试为准。每批按同一正式协议逐步补全；未支持能力明确失败，不产出看似成功却丢语义的 Prepared。以下批次不对应新的引擎版本，也不凭目录 / 测试数量计算完成率。

| 批次 | 需要实现 | 依赖与实际验收 | 当前状态 |
| --- | --- | --- | --- |
| I01 基础闭环 | 输入结构 / 规范化、默认目标、诊断 / OriginMap、Catalog 读取、必要 Manifest 自检、静态物料输出 | 真实 compile 对简单静态定义产出合法 Prepared；错误位置可定位；输入不变 | 已完成首批静态纵切，见实施现状 |
| I02 共享分析 | 声明、Scope、引用、Schema 资源与连接、Expression / ValueSpec 分析、Props watch | 同一内核完成类型 / 读取；递归、Literal、命名环、模板参数环境正反例；保留必要来源 | 主链已实现；有限 Schema 证明边界保留 |
| I03 规则 | Reaction / Command、Internal / External、requires、依赖传递 | Reaction 不补触发；约束失效覆盖前置输入；Scope 唯一绑定；环与缺契约失败 | 主链已实现；持续纳入全量回归 |
| I04 完整视图与交付 | 模板共享闭包、Binding / Slot / Event / Request、资源 / 双摘要锁 / Host 需求、输出自检 | 实际编译贯穿样例，与手写预期独立比较；无关能力不进入锁；请求契约与闭包完整 | 主链已实现；消费者实测仍由 I06 提供 |
| I05 稳定性与消费准备 | 正反例回归、确定性、复杂度 / 体积基准、exports 与浏览器消费 | 生产 SDK 类型导出、语义测试、标准门禁通过；性能给出实际测量而非估计 | 已有语义回归与产物消费；完整基准 / 浏览器消费待完成 |
| I06 消费联验 | 将真实 Prepared 接入 Runtime / Adapter | 依赖后续消费者实现；表达式精确失效、模板复用、Scope 生命周期与请求边界真实验证 | 未开始；受消费者实现进度约束 |

Compiler 包自身可在 I05 完成其契约内交付；跨层收益与端到端完成须等 I06 证据，不能因为消费者未完成就假装已证明运行性能，也不能要求先建设平台才实现 Compiler。

### 后期平台路线

| 触发场景 | 后续建设 | 验收重点 |
| --- | --- | --- |
| 能力作者需要开发 / 发布工具 | 将共享契约检查接入 SDK / CI / Registry | 单 Manifest 自检、来源定位、实现契约测试各自有效 |
| 平台需要解释配置与失败链路 | 独立 AnalysisReport、可靠关系与覆盖范围 | 与同输入 compile 语义一致；失败无 Prepared 但解释信息可用 |
| Studio 需要关系展示 | 错误高亮 / 链路、Reaction 排布、Validation 图与字段导航 | 读取 / 触发 / 写入 / 前置 / 归属不混淆，跳转回原配置 |
| 编辑规模要求更低延迟 | 容错 / 增量分析与编辑会话 | 与全量分析一致；不完整区域明确；预算与失效正确 |
| Devtools 需要真实因果 | 静态报告与 Runtime Trace 联动 | 来源 / 实例 / 输入修订正确，不把潜在关系当真实执行 |

后期顺序按真实消费者需求推进，不作为本期固定日历或完整 Platform 项目计划。风险可视化和进一步优化仍需以明确用途和实际收益决定实现。

### 本轮审阅与后续归档

本期蓝图边界、详细设计、元信息分工与检查策略已确认；本主题是完整模块设计的现行正文，L2 总览保留跨层机制与入口。用户同时授权归档、Git 提交并开始实现，平台完整报告 / 可视化不自动进入本期。

## 本期确认结论与后期接缝 {#review-decisions}

输入输出主体、watch 形式、模板共享和默认易用性已经确认，不重开。下列本期安排已于 2026-10-22 整体确认；Context Schema 的新增输入与完整分析报告格式保留为后期接缝：

| 编号 | 确认范围 / 后期接缝 | 采用安排 | 原因 / 影响 |
| --- | --- | --- | --- |
| D01 | 检查范围 | 全输入结构 + 完整共享业务语义 + 所选视图 / 可达模板的目标检查 | 避免未选平台实现缺失阻塞当前编译，输出内容仍全检 |
| D02 | 失败累计 | 独立错误累计，根因级联抑制；结构失败停止不安全下游 | 编辑和构建可一次修多处，不产生部分执行产物 |
| D03 | Context 类型证据 | 后续 Compiler 上下文可选增加只读 Context Schema；缺失时在需证明连接处报告 unproven | 当前输入未单独约定来源；不新增 Context watch 或改 Prepared |
| D04 | 首批公共调用 | 确定内存输入的完整 compile，编辑预览复用；不首期开放增量 / 容错 analyze SDK | 小而完整，保留后期复用能力 |
| D05 | 内部架构与交付 | 四职责组、六阶段、I01–I06 按验收纵切实现 | 模块按知识划分，阶段按依赖排序，不逐检查拆模块 |
| D06 | 平台复用与元信息分工的细化 | 本期保留来源 / 契约复用；后期独立报告与可视化；自校验和实现测试在能力开发链路 | 对齐本轮补充；不把平台展示、完整报告或实现测试塞进 Prepared / 编译热路径 |

具体函数名、文件名、错误码拼写、内部 Map / DFS 实现、预算阈值标定不逐项交用户决策；实现中按确定行为整理，只有真实反例或跨层冲突再讨论。D03 是本草案新增接缝，不擅自改已确认 CompileInput 或协议类型。

## 依据与当前代码状态 {#sources}

| 依据 | 项目内位置 | 限定范围 |
| --- | --- | --- |
| 编译输入输出确认 | docs/design/l2-preparation.md 的 compiler-io-contract / compiler-expression-watch | 输入默认、保留结构、watch 与交付边界 |
| 重要决策 | docs/design/decisions/ADR-FE-017-compiler-io.md | 模板共享、表达式粒度、旧方案局部替代 |
| 静态类型连接 | docs/design/l1/08-decisions-release.md 的 schema-connection-subset | 结构兼容子集、无法证明拒绝连接 |
| 请求契约 | docs/design/l1/05-view-material-host.md 的 material-requests / request-development-contract | 输入输出、必需映射、装配预检与局部隔离 |
| 校验 | docs/design/l3-validation.md | 同步前置、Schema 根域、依赖传递和运行时归属 |
| 实际交换类型 | packages/protocol/src/definition、capability、prepared | 已迁移类型和派生 Schema，不等于 Compiler |
| Compiler 现状 | packages/compiler/src/index.ts；packages/compiler/README.md | I01–I04 主链与逐表达式 watch 已接入，完整基准 / 浏览器消费及各端联验未完成 |
| 平台与静态 / 动态展示边界 | docs/design/platform-studio.md；docs/design/l3-observability.md | 平台专题未闭环，Trace 与静态事实分别解释 |
| 本轮补充与确认 | 用户 2026-10-22 对平台可视化、元信息校验及阶段 / 实施情况的要求与本期确认 | 本期归档；后期完整报告格式 / 平台产品不冻结 |
| 已有提交 | bdec628 / e036bb4 | 设计归档、协议类型迁移；未包含本文新模块方案 |

本期确认来源为当前对话，见 SRC-COMPILERDESIGN。原独立 HTML 仅为评审附件；现行内容在本主题维护，由统一构建生成阅读页。归档同步 L2、ADR-FE-017 的后续实施范围、演进与治理；不因归档提升 Runtime / Platform 实现状态。

## Reaction 状态与 Host 出口的编译衔接 {#compiler-reaction-state}

ReactionAction 保留裸 Command 或既有 HostEventIntent，Compiler 复用物料事件的 Host 名称 / Payload 契约检查；Reaction 不提供 Event Reference。ValidationWatch 检查 field 的模型位置与词法 Scope，输出保留来源和 observe，不能混入 Constraint 的 DataWatch。when / then / Payload 读取不反推显式 watch，Payload 不输出持续 $expr.watch。

ValidationReference 在 Reaction 的条件与动作中按调用读取；当前静态投影为 issues 数组、status 字符串、state 对象（含 issues / status），不推断尚未冻结的 Issue 内部字段或状态枚举。Constraint、全局命名表达式和持续 View 表达式使用该引用时明确诊断 VALIDATION_NOT_AVAILABLE，不静默生成缺少通知依赖的产物。视图校验展示沿用字段订阅。

Reaction 的 Host 需求与所选视图的需求汇总去重，即使没有任何物料事件也必须进入 hostRequirements.events；共享业务规则不随 Profile 裁剪。纯函数能力仍通过表达式分析收集，Host 事件名不混入纯函数注册表。

本轮同步协议类型、派生 Schema 及 Compiler 检查；Prepared 格式身份提升为 form-engine.prepared/2，旧 /1 目标明确拒绝。旧裸 Command / Data watch 定义仍能重新编译；旧运行端不能以忽略新分支的方式消费 /2。不增加 Runtime 自动回退，也不表示 Runtime 已实现观察 / 调度。
