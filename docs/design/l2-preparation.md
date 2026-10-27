---
id: DESIGN-L2
title: L2 预处理与编译
type: design
status: active
layer: L2
modules:
- M05
- M06
tags: []
related:
  decisions:
  - ADR-FE-020
  - ADR-FE-017
  - ADR-FE-004
  - ADR-FE-011
  - ADR-FE-015
sources:
- SRC-REACTIONSTATE
- SRC-COMPILERDESIGN
- SRC-COMPILERIOTYPES
- SRC-COMPILERIO
- SRC-PROTOCOLBASELINE
- SRC-PREREQUISITES
- SRC-CONTRACTS
- SRC-L2
- SRC-V05
- SRC-PROTOCOL
navigation:
  group: 03 · L2 预处理
  order: 40
last_reviewed: '2026-10-27'
reading_next: DESIGN-L3-RUNTIME
relocated_sections:
- source: docs/design/architecture.md
  anchor: preparation
  target: preparation
---

# L2 预处理与编译

L2 把声明式 Definition 与确定能力契约准备为可序列化 PreparedForm，供运行时消费。2026-10-21 已确认以运行时收益限定转换：保留 Definition 领域结构、词法引用和表达式语法，补充规则 / 表达式 watch、已解析 requires、资源闭包与锁定信息。单视图与默认输入无需额外区分语法、Profile 或平台。现行输入输出见[已确认协议](#compiler-io-contract)和 [ADR-FE-017](decisions/ADR-FE-017-compiler-io.md)；本页旧接口草图仅追溯，不作为另一套有效 ABI。协议类型及派生 Schema 已按后续授权迁移，见[实施记录](engineering.md#compiler-io-types)。2026-10-22 用户确认本期完整 Compiler 方案并授权实施，四职责组、六阶段、模块详细设计、检查范围与失败策略见 [Compiler 详细设计](l2/compiler.md)。平台分析报告与可视化保留后期方向。

## L2 · Preparation：定义预处理层 {#preparation}

Preparation 将易编辑的定义安全、稳定地转成 Runtime 可消费的 Prepared Form。它服务 Runtime、设计器、发布流程和测试工具；配置者主要消费它输出的诊断信息。

**当前已确认：**L2 是静态协议编译能力；平台另行管理 Form Registry、Capability Registry、代码构建与 Release Management。内置与注册纯计算能力统一称为 Pure Function，Host 在应用运行时注册实现。完整职责、契约草图、发布例子、决策及待固化项见 [L2 平台能力治理与编译发布](l2-preparation.md)。

L2 可以在发布期 AOT、服务端按需或客户端加载时调用，不读取实例 Working Data，也不执行业务纯函数、Command 或 Reaction。调用上下文提供确定的 Material / Pure Function 契约快照，平台 / Profile / 格式按需显式选择或采用确定默认；Host 静态契约可选，缺失时提取需求并说明无法证明的兼容性，不能据此认定运行时实现不存在。

### 预处理流水线

图中 Form / View / Dependency Plan 表示逻辑职责；现行存储位置是保留领域结构的 definition 和就地 watch，不要求三类顶层 Plan。本期模块与流程按 [Compiler 详细设计](l2/compiler.md#pipeline)实施。

```diagram
{
  "id":"figure-preparation",
  "title":"图 3 · Preparation Pipeline：从定义到准备产物",
  "flow":true,
  "rows":[
    [{"title":"Definition + Catalog Snapshot + Target","body":"Authoring / Canonical 与确定的能力契约"},{"title":"Normalize / Validate","body":"规范化并检查结构、类型与端口契约"},{"title":"Resolve","body":"Reference、Scope、Template、Material / Pure Function 与可选 Host 契约"}],
    [{"title":"Analyze","body":"递归读取 → 使用位置解释；read / watch / write / use / scope、静态环"},{"title":"Diagnostics","body":"定位错误与风险；Reads / Watch 差异给作者建议，确认修改 L1 后重编"},{"title":"Transform / Package","body":"确定 Form / View / Dependency Plan、Scope 模式、Profile 与共享规则"}],
    [{"title":"PreparedForm / Profile Bundle","body":"可序列化准备结构 + Capability Lock + Host Requirements；交由 Release 管理不可变发布","major":true}]
  ],
  "arrows":["↓","↓"],
  "note":"Validate / Analyze / Transform / Package 是逻辑职责，不强制四个服务或四次遍历。结构方向已收敛，具体字段、增量与缓存契约仍待固化。"
}
```

### 需要设计的内容

1. **规范化与诊断。**Authoring 简写如何转为唯一 Canonical；错误怎样关联文件、节点和引用位置；错误与警告如何分类。
2. **词法与模板解析。**Scope 链顺序、别名可见性、模板参数 `schemaRef` 兼容性、静态 `$use` 及 Profile 依赖闭包。
3. **表达式发现与依赖。**只在规定的 Expression / ValueSpec 位置识别表达式，递归识别显式 `$expr`；不扫描执行 Working Data、Schema default、结构字段或外部原始 JSON。Named Expression 不无限展开，也不捕获调用者的局部 Scope。
4. **契约与成本检查。**Material 的 Props / Binding / Slot / Event 端口、Pure Function 签名与版本、表达式环、可达图和复杂度上限；有 HostContract 时增加静态签名检查。
5. **交付与缓存。**按 Definition 内容、Compiler / Format 版本、目标与锁定依赖确定缓存；交付当前 Profile 的视图闭包，完整保留共享 Schema / Constraint / Reaction，并携带能力锁与 Host Requirements。精确字段和摘要覆盖范围继续固化。

读取分析覆盖嵌套 ValueSpec、Named use 和全部可能分支，Literal 不参与。随后按 L1 使用位置解释：Internal Constraint 合并 when + assert；External 合并显式 watch 与 when；Reaction 不追加 when / then 读取；View Binding / 动态 Props 自动观察，事件 Payload 只在事件时求值。L2 不执行纯函数发现依赖；整对象输入与无法精确推导的 Schema 条件按子树保守覆盖。

Dependency Plan 表示规则 / 完整动态表达式的静态 watch 与 Scope 关系，现行就地交付，不保存真实数组成员、回调或组件。L2 知道 each 模式，L3 知道实例，L4 知道挂载的表达式消费者；集中计划 ID 是已被修订的旧选择。

配置编辑复用同一 L2 分析能力。Reads 不在 Watch 中时提供风险与补全建议，不静默改写配置或 Prepared 计划；作者可确认保持现有触发意图。产品变化清空选项，即使计算不读取产品也应保留显式 Watch。首期编辑预览复用完整 compile，后期按需求增加增量检查，并用 Source Map 关联 L1 来源，详见 [编辑与编译闭环](l2-preparation.md#l2-authoring-diagnostics)。

### 复杂度取舍

| 问题 | 设计方向 | 暂不默认引入 |
| --- | --- | --- |
| 解释 vs 预处理 | 加载或发布时准备，运行时消费索引 | 每次字段变化重读整份配置 |
| 编译深度 | Validate / Analyze / Transform / Package，复用规范化、解析与索引 | 完整代码生成与重型优化器 |
| 依赖关系 | 区分 read / watch / write / use / scope；实例化时关联 Scope | 将所有读取自动变成 Reaction watch |
| 物料检查 | 检查 Manifest、版本、端口和类型 | 执行物料内部代码来推断契约 |
| 循环与成本 | 表达式 / 模板静态环 Error，潜在 Reaction 环分析后置为可选风险工具；L3 另有保护 | 将合法 Schema 递归或全部潜在环判为非法 |
| 产物缓存 | 版本、目标、内容 Hash 与锁定依赖关联 | 先建设复杂编译集群 |

例如 500 个字段、200 条表达式的表单，应能根据索引定位受影响节点；实际收益需要基准验证，不能把目标直接写成性能结论。

**Prepared Form 不是第二套 Runtime。**它可以包含规范化定义、已解析引用、准备后的表达式与规则、依赖索引和契约版本；不包含用户输入、焦点、当前 Issues、请求状态或会话。一个准备产物应允许多个实例安全复用。

**代码构建与 Definition 编译分开。**CI 将能力源码构建为各平台 Package + Manifest；L2 将 Definition + 契约快照编译为 Prepared Artifact。Release Manager 汇聚制品并锁定能力版本与摘要，升级能力不自动改变旧发布，回滚读取旧 Release Artifact。共同能力 ID / 版本保证语义一致，不要求 Web 与 Flutter 共用二进制。

**本层交付物与验收：**Prepared 结构、诊断格式、依赖/规则索引、Profile Bundle、Capability Lock、Host Requirements 和缓存键；验证非法引用、Scope 越界、模板类型、端口不兼容、版本缺失、锁定输入可复现、多实例复用隔离、Host 缺失及目标格式 / 跨端制品兼容。完整 [待固化接口与工程交付](l2-preparation.md#l2-decisions) 尚未实现。

## 设计基线、范围与状态 {#l2-status}

| 状态 | 内容 | 使用方式 |
| --- | --- | --- |
| 已收敛 | Material / Pure Function / Host 三类职责；复杂同步校验复用纯函数；L2 静态编译；能力 Manifest 与发布锁定 | 后续设计基线 |
| 已收敛 | 内置与注册纯函数共用调用协议，`core.*` 为保留命名空间；Host 运行时注册，静态契约可选 | 不再另建校验函数 DSL 或通用业务执行器 |
| 已确认输入输出 | PreparedForm 保留 Definition 领域结构，规则 / 动态表达式 watch、requires、资源和能力锁；默认输入与单视图选择 | 正式类型迁移、Compiler 本期模块方案已确认；算法与各端消费待实现 |
| 跨层设计基线 | Read / Watch / Subscription 分离；按使用位置编译 Dependency Plan；L3 统一匹配，L4 按挂载激活视图 | 计划是静态描述，不是已建立的观察者；完整接口与调度未冻结 |
| 已确认 | L1 / PreparedForm 双结构；L3 不直接解释 L1；显式 watch 保留，编译提供建议，作者确认后回写再编译 | Prepared 执行依赖编译时确定，兼容失败不静默回退解释 L1 |
| 推荐 | 编译 Source Map；编辑期增量分析、发布期全量检查 | 具体字段、增量算法与编辑交互仍待固化 |
| 本期设计已确认 / 待实施 | 协议类型已同步；四职责组、六阶段、检查范围、静态准备与诊断 SDK 见 [详细设计](l2/compiler.md)；后期完整分析报告独立交付 | 不把输出确认等同于模块完成或生产性能通过 |

Pure Function 表示同步、确定性的受限纯计算；表达式调用节点仍采用 `op + args`，名称与协议字段不混为一项设计。

本篇保留全局与跨层契约，[Compiler 详细设计](l2/compiler.md)维护完整模块与实施。旧内部接口草图中集中计划 / 模板展开等机制按 ADR-FE-017 替代；本期不建设潜在 Reaction 环全图分析或增量 SDK。

本篇覆盖 L2 与平台的交界、能力分类、编译输入输出、注册、版本化、依赖分析及发布验收。Working Data、Reaction / Flush 属于 L3，Material DOM 和组件生命周期属于 L4。[本层总览](#preparation)说明模块位置和跨层关系；L1 语义以 [定义协议](l1/README.md) 为准。

当前规范从职责到失败 / 验收展开；讨论记录单独在[设计演进](design-history.md)追溯。重要取舍分别见 [Prepared 唯一入口 ADR](decisions/ADR-FE-004-prepared-entry.md)和[能力 / 发布 ADR](decisions/ADR-FE-011-release-lock.md)。Host Validator 已确认以独立能力名称被规则显式引用，REV-05 策略缺口已解释；引用字段 / 签名与注册 SDK 仍待固化，见 [ADR-FE-012](decisions/ADR-FE-012-host-output.md)。

[跨层依赖编译与订阅模型](dependency-reactivity.md) 补齐本层到 L3/L4 的消费契约；本篇继续维护编译与发布职责，不因统一观察机制接管真实订阅、实例状态或 UI 调度。

## 平台、编译器和运行时的职责 {#l2-platform}

```diagram
{
  "id":"figure-l2-platform-requests",
  "title":"平台治理、静态编译与运行时绑定",
  "rows":[
    [{"title":"Form Registry","body":"Definition、草稿、版本、发布审批"},{"title":"Capability Registry","body":"Material / Pure Function 的 Manifest、制品索引与版本"}],
    [{"title":"Release 构建上下文","body":"Definition + 确定 Catalog Snapshot + Build Target + 目标格式要求"}],
    [{"title":"L2 Protocol Compiler","body":"Validate / Analyze / Transform / Package","major":true}],
    [{"title":"Release Management / Artifact Distribution","body":"登记 PreparedForm、Capability Lock、Host Requirements；摘要、审核、发布、回滚与分发"}],
    [{"title":"L3 Runtime + L4 Renderer","body":"只加载兼容 PreparedForm；能力预检查、实例数据与规则、物料；不回退直接解释 L1"},{"title":"Host Runtime","body":"validators / events / requests 在应用运行时注册"}]
  ],
  "arrows":["↓","↓","↓","↓"],
  "note":"Form Registry 管表单资产，Capability Registry 管能力资产，Compiler 管静态转换，Release Management 管不可变发布。执行代码在运行时绑定，Host 代码不强制进入平台注册。"
}
```

L2 消费确定的契约快照，不负责代码托管、CI 构建、权限审批、制品下载分发或发布环境管理。平台注册提升复用、治理与追踪能力，但不是 L2 能工作的前提：应用本地导出的确定 Material / Pure Function 契约同样可以作为输入。

## L2 的边界与调用时机 {#l2-boundary}

| L2 负责 | 交由其他职责负责 |
| --- | --- |
| 结构和 Canonical 语法检查、Authoring 简写规范化 | L3 修改 Working Data、初始化、恢复草稿 |
| Reference、ScopeBinder、Template 参数静态解析 | L3 管理真实数组项身份与实例状态 |
| Material、Pure Function、已知 Host 契约兼容检查 | L3 求值纯函数，Host 执行业务请求 |
| Expression / Constraint / Reaction 依赖与潜在环分析 | L3 Flush、重入、实际级联与防环 |
| Form / View Plan、索引、Diagnostics | L4 组件实例、弹窗、焦点、动画 |
| 平台 / Profile 产物和运行时需求声明 | 平台代码构建、注册、分发与部署治理 |

L2 不读取某个实例的具体 Working Data，不执行业务纯函数，不实例化真实数组项，也不请求外部服务。这里的编译可以在发布期 AOT、服务端按需或客户端加载时发生；生产优先预编译与缓存，编辑器、预览和离线场景可以按需调用同一编译能力。

同一 Definition、目标环境、已锁定契约和 Compiler 版本应产生语义等价、可复现的产物。目标或契约变化后必须重检 / 重编，不能无条件复用旧缓存。

调用位置不改变执行边界：即使在客户端加载时编译，L3 也只接收兼容的 PreparedForm，不同时实现原始 L1 解释器。格式或能力不兼容时报告失败，由编译 / 发布契约处理重编或兼容选择；不能绕过诊断、能力锁和确定依赖计划。两份结构的职责对照见 [跨层协议边界](dependency-reactivity.md#dependency-compiled-protocol)。

## 配置编辑与发布共用编译诊断 {#l2-authoring-diagnostics}

编辑器复用 L2 的解析、依赖分析与契约检查，形成一条闭环：修改 L1 → 运行可获得的编译检查 → 展示 Reads / Writes / Watch 差异与修复建议 → 作者确认 → 回写 L1 并重编 → 发布前完成确定输入的完整编译。编译器提供建议是已确认职责，增量分析和编辑期部分诊断的具体实现属于推荐方案，不建立第二个规则诊断系统。

| 发现 | 诊断原则 | 编辑 / 发布边界 |
| --- | --- | --- |
| 无效引用、非法 Scope、能力缺失 | 明确错误 | 编辑时可报告不完整处；发布必须解决或按既有能力契约处理 |
| when / then / Named Expression 的 Reads 未列入 watch | 建议 / 风险提示，不自动断言业务写错 | 作者可补充或明确保持；不静默改 L1 或 Prepared watch |
| Watch 字段未被计算读取 | 不据此自动删除触发意图 | 产品变化清空选项，即使 then 不读产品也有效 |
| 自环 / 多规则潜在环 | 风险提示，允许可收敛规则 | SCC 不证明死循环，L3 仍需执行预算 |
| 多个 Reaction 可能写同一字段 | 冲突提示供业务审查 | 不自动增加父子执行顺序、失败下游禁用或冲突 DSL |

编辑分析允许读取暂时不完整的配置并返回具体诊断，但存在 Error 不产生可执行 Prepared；入库 / 发布前对确定输入完整检查，错误协议不能作为可用制品进入 C 端执行。保留建议、驳回建议与来源定位的编辑数据如何保存，具体增量缓存与 API 均待固化；本次不新增 L1 的“确认建议”协议字段。

推荐用 Prepared 规则 / 节点与 L1 定义身份、位置及版本的 Source Map 关联异常报告。Diagnostic 的源位置是现有信息要求，跨产物 Source Map 的字段和打包方案仍属推荐，不据此宣称已具备逐行映射。Source Map 不参与触发或执行控制。

## 能力分类与复杂同步校验 {#l2-pure-functions}

| 能力 | 类别 | 边界 |
| --- | --- | --- |
| Input、Select、Modal、Drawer、业务卡片、复合编辑器 | Material | UI 展示与交互，通过 Binding / Slot 组合 |
| 算术、日期差、年龄判断、证件校验、纯保费计算 | Pure Function | 同步、确定性输入输出，无 I/O 和写入副作用 |
| 用户名唯一性、远程承保资格 | Host Validator | 依赖外部系统，按外部义务报告结果 |
| 远程价格重算、订单提交、埋点 | Host Event Handler | 业务流程与副作用 |
| 地址检索、远程选项查询 | Host Request | Material 经页面映射请求，公共 Adapter 交付 JSON 结果；文件传输归平台实现 |

Host 可以分为 validators / events / requests，但不因此新增通用 Action、Workflow 或异步计算扩展类别。纯计算价格属于 Pure Function；远程重算价格属于 Host。依赖网络、当前时间或外部可变状态的实现不满足纯函数要求；所需日期、地区与策略应作为显式输入。

复杂同步逻辑可以封装在版本化纯函数代码中，由 AST 表达一次调用，无需将算法展开成庞大 AST，也无需建立第二套同步 Validator 注册体系。

```json
{
  "id": "validate-identity",
  "kind": "internal",
  "assert": {
    "op": "insurance.validateIdentity",
    "args": [
      { "ref": { "source": "data", "path": "/applicant/idNumber" } },
      { "ref": { "source": "data", "path": "/applicant/birthDate" } }
    ]
  },
  "issue": {
    "target": { "source": "data", "path": "/applicant/idNumber" },
    "code": "INVALID_IDENTITY"
  }
}
```

```typescript
export function validateIdentity(idNumber: string, birthDate: string): boolean {
  return checkIdentity(idNumber) && matchesBirthDate(idNumber, birthDate);
}
```

以上是结构示意，假设字段与能力契约已注册。Pure Function 只处理传入值，不捕获调用方 Scope，不管理校验状态；Constraint 决定适用条件、Issue 目标与错误码。L1 内部 `assert` 返回 boolean。一次动态返回多条 Issue 需要另行评估 Constraint 返回契约；联网属于 Host Validator，修改数据属于 Command。

## 纯函数 ID、内置能力与调用协议 {#l2-function-identity}

| Pure Function ID | 来源 | 管理形式 |
| --- | --- | --- |
| `core.eq`、`core.gte`、`core.mul` | Core Built-in | SDK 内置 Pure Function Set 与稳定 Catalog |
| `insurance.validateIdentity` | Registered | 版本化 Manifest 与制品 |
| `insurance.calculatePremium` | Registered | 同上，并需跨端契约测试 |
| `travel.checkDateRange` | Registered | 同上 |

内置与注册纯函数共用同一 Expression AST 和调用协议，来源只是 Catalog 属性。`core.*` 保留给内置能力，业务能力使用稳定命名空间；任一 ID 在确定编译上下文中只能解析为一个契约，禁止覆盖、自动搜索或静默回退。

```json
{
  "op": "core.gte",
  "args": [{ "ref": { "source": "data", "path": "/age" } }, 18]
}
```

`eq`、`and` 等短 ID 仅能作为明确列出的内置 Authoring 别名，目标 Canonical 解析为完整 ID。现有 L1 草案和验证样本仍保留短 ID；别名白名单、规范化映射及样本迁移需随正式内置契约固化，不把候选验证器当成已实现的解析器。此次术语统一不顺带迁移这些 ID，也不改变 `op` 字段。

L2 解析 PureFunctionManifest、签名和依赖版本；L3 按已锁定依赖绑定实现。不因此引入参数化 Named Expression 语言或任意脚本。

## Manifest、能力来源与代码治理 {#l2-manifests}

Manifest 是可供静态检查的契约，不是可执行实现。三类能力均需要约定接口，但不要求三类代码都进入同一个平台仓库。以下名称与字段是候选接口草图：

```typescript
type CapabilityCatalog = {
  materials: Record<string, MaterialManifest>;
  pureFunctions: Record<string, PureFunctionManifest>;
  host?: HostContract;
};

type PureFunctionManifest = {
  id: string;
  version: string;
  parameters: TypeSignature[];
  returns: TypeSignature;
  // 同步、确定性、无副作用是类别的强制契约。
};
```

MaterialManifest 沿用 `propsSchema / bindings / slots / events`。同一语义版本的不同端实现保持端口契约一致。HostContract 可以由宿主维护或构建时导出，用于增强静态检查；不强制把 Host 代码发布到平台。

| 来源 | 源码 | 契约获取 | 执行代码获取 |
| --- | --- | --- | --- |
| Core Built-in | Runtime SDK | 内置 Pure Function Set Manifest / Catalog | 随 SDK 安装 |
| 应用本地注册 | 宿主 / 业务仓库 | 类型化声明或 JSON 导出 | 随应用包构建 |
| 平台发布能力 | Git 仓库 | Registry 中的版本化 Manifest | 包仓库 / 对象存储中的不可变制品 |

源码由 Git 管理，CI 构建和测试，制品仓库存构建产物，平台数据库记录元数据、Manifest、制品地址、摘要、发布状态与权限。不默认在数据库中保存任意 JavaScript 字符串并在客户端 eval。

Manifest 可检查签名与目标端可用性，不能自动证明实现没有副作用，也不能证明物料遵守事件语义；仍需代码审查、契约测试、执行环境限制与必要的运行时防护。不可信第三方扩展另需可信来源、完整性校验、签名 / 审核及隔离 / 权限策略。

### 首期签名结构与 Host 请求声明

2026-10-21 完整草案确认：PureFunctionManifest 的参数 / 返回结构复用 JSON Schema，原 TypeSignature 是概念占位；固定参数有 name / schema / optional，末尾可选与独立 restParameter，业务函数不接管 AST，有限内置短路见 [L1](l1/03-expression-validation.md#function-evaluation-contract)。

物料请求声明 payloadSchema / resultSchema 及并发策略，页面 requests 映射到 Host 名称，Host 静态契约声明输入输出。移除物料服务需求，不展开服务方法系统；详见 [完整请求契约](l1/05-view-material-host.md#material-requests)。Host 静态契约可选、局部缺失不默认停止整表且 Validator 不得绕过完整校验的边界保持。

## Host 运行时注册与依赖要求 {#l2-host}

宿主在应用运行时提供实现；L2 提取静态需求，获得 HostContract 时再检查名称与签名。缺少静态声明不能被当成实现必然不存在。2026-10-21 已确认 Host Validator 接收本次调用的数据读取快照及 Scope，以显式 watch 声明 Host 内部不透明依赖；首期不增加命名参数映射 / External Payload。Compiler 仍只补全已有静态可见依赖，不执行 Host 代码推测读取。快照与依赖正确性边界见 [Host 调用输入](extension-integration.md#host-input-contract)。

```typescript
interface FormHost {
  validators?: Record<string, HostValidator>;
  events?: Record<string, HostEventHandler>;
  requests?: Record<string, HostRequestHandler>;
}

createFormRuntime({
  preparedForm,
  host: {
    validators: { 'insurance.eligibility': checkEligibility },
    events: {
      'quote.recalculate': recalculateQuote,
      'insurance.submit': submitInsurance
    }
  }
});
```

L2 从 External Constraint、`host.emit` 与页面 `host.request` 映射提取 Host Requirements。以下为交付摘要示意，不是 L1 新顶层字段，也不冻结 Host 注册 API：

```json
{
  "hostRequirements": {
    "validators": [{ "id": "insurance.eligibility", "requiredForSubmit": true }],
    "events": [{ "id": "quote.recalculate" }]
  }
}
```

| 场景 | 编译期 | 运行时 |
| --- | --- | --- |
| 有 HostContract | 检查名称、参数与事件 Payload | 核对已注册、兼容且按约执行 |
| 无 HostContract | 生成明确 Requirements，报告不能证明的兼容性 | 按 Host API 检查存在性及请求 / 响应形态 |
| 必需外部 Validator 未就绪 | 记录提交阻塞要求 | 不得绕过义务直接 Ready / Submit |
| 可选埋点缺失 | 记录可选依赖，可选性规则待固化 | 依声明策略跳过并记录诊断 |

完整校验不以候选 requiredForSubmit 字段豁免适用规则。Host 能力缺失按用途降级，开发端诊断、用户端不暴露技术错误；缺校验器记未完成，不绕过校验。具体诊断码、事件可选性和 SDK 继续固化。

L2 不推断 Host 内部服务。请求需解析本次输入映射、生成独立 View 请求 Schema 闭包并收集 Host 名称 / nodeIds；输入输出的有限连接与运行时小范围校验见 [请求契约](l1/05-view-material-host.md#material-requests)。

## 两条构建链与发布锁定 {#l2-release}

```diagram
{
  "id":"figure-l2-release",
  "title":"代码构建与 Definition 编译分别进行，Form Release 汇聚结果",
  "rows":[
    [{"title":"能力代码流水线","body":"TS / React / Vue / Dart → Build + Test → 平台 Package + Manifest"},{"title":"Definition 流水线","body":"L1 JSON + 确定 Catalog Snapshot → L2 Compile → PreparedForm"}],
    [{"title":"Form Release","body":"Definition、Prepared Artifact、Material / Pure Function Lock、Host Requirements、目标平台 / Profile","major":true}],
    [{"title":"运行时交付","body":"按锁定制品加载与预检查；保留版本和摘要追踪；回滚到旧 Release Artifact"}]
  ],
  "arrows":["↓","↓"],
  "note":"同一能力 ID / 版本保证语义和契约一致，不要求 Web Bundle 与 Flutter 二进制形式一致；纯函数尤其需要共同的输入输出测试向量。"
}
```

L1 可以声明不带版本的逻辑能力 ID，不要求每个 ViewNode 手写依赖版本。Release 构建在指定 Catalog Snapshot、目标平台 / Profile 下选择唯一版本与制品，L2 接收确定快照并保留解析结果；版本选择和锁定应在正式编译前确定，Release Manager 负责不可变登记与分发。

```json
{
  "form": { "id": "insurance-application", "version": "3.2.0" },
  "target": { "platform": "web", "profile": "mobile" },
  "protocolVersion": "1.0",
  "preparedFormatVersion": "1.0",
  "compilerVersion": "0.6.3",
  "capabilityLock": {
    "corePureFunctionSet": "1.0.0",
    "materials": {
      "text-input": { "version": "2.1.0", "digest": "sha256:<artifact-digest>" },
      "insurance-card": { "version": "3.0.2", "digest": "sha256:<artifact-digest>" }
    },
    "pureFunctions": {
      "insurance.validateIdentity": {
        "version": "1.2.0", "digest": "sha256:<artifact-digest>"
      }
    }
  }
}
```

以上字段、版本及摘要均为示意。后续已确认分别锁定 Manifest 与实际实现制品，具体见[双摘要契约](#capability-digest-contract)；内置函数集也需关联可核对的不可变 SDK / 制品身份。

能力升级不能自动改变已发布表单；回滚读取旧 Release Artifact，不能根据当前最新 Catalog 重新组装。静态可发现的 Port 移除、参数类型变化触发重新检查 / 编译；运行时代码语义兼容性还依赖版本策略、契约测试和灰度验证。`latest` 或 `^1.2.0` 单独不足以复现旧发布。

### 首期双摘要锁定 {#capability-digest-contract}

2026-10-21 用户确认能力同时锁 Manifest 与实现制品：id / version / manifestDigest，以及 artifact 的 id / platform / digest。多个能力可引用同一包制品；内置函数集同样绑定确定实现身份。Manifest 对确定性序列化内容计算摘要，交付制品对实际字节计算；资源地址是获取位置而非身份。应用内置实现绑定不可变构建身份，不假定运行时现场读取自身代码计算摘要。

L2 只消费确定 Catalog Snapshot，不在线查询 latest。分别锁定增加一个身份关联，换取编译依据与实际实现都可追溯；不会仅凭版本或地址自动替换旧发布。摘要算法 / 规范化与装配核对的具体代码在实现中统一选择并验收，不继续逐字段讨论。

## 制品身份与兼容性约束 {#l2-versions}

这里区分协议、编译器与制品的兼容维度。表中数值是说明契约的示意，不表示已有这些发布版本；历史讨论标签与本表无对应关系。

| 版本 | 含义 | 例子 | 独立原因 |
| --- | --- | --- | --- |
| protocolVersion | L1 Definition 语法与语义 | 1.0 | 表单声明格式演进 |
| definitionVersion | 某张业务表单配置版本 | 3.2.0 | 内容独立修订 |
| compilerVersion | L2 实现版本 | 0.6.3 | 构建追踪、缓存失效 |
| preparedFormatVersion | Prepared Artifact 读取契约 / ABI | 1.0 | L3 / L4 可独立升级 |
| capabilityVersion | Material / Pure Function 语义与代码契约 | 2.3.0 | 能力单独发布与回滚 |
| Host Integration API Version | 宿主接入 SDK 契约 | 待固化 | 不强制每个业务 Handler 进入平台注册 |

版本号之外还需不可变制品摘要；Runtime 初始化时核对目标格式、所需能力及锁定实现，拒绝不兼容产物。首阶段已确认 JSON 与 Prepared 格式版本精确匹配，不默认跨版本范围或 feature 协商；具体字段和后续格式迁移策略仍待固化。

## 编译输入、输出与四项核心工作 {#l2-compile}

### 已确认输入输出与默认使用方式 {#compiler-io-contract}

2026-10-21 用户确认本节完整方案，并补充开箱即用要求。Canonical / Authoring 是同一协议的规范表示与简写，不要求使用者选择两种模式。公共入口默认接受支持的简写以及规范写法，再统一规范化；不要求 `source.syntax` 判别包装。内部可以保留两种 TS 类型用于检查 / 文档，不能因此要求调用者分流。简写与完整字段冲突仍须报错，不用默认优先级掩盖冲突。

```typescript
interface CompileInput {
  definition: AuthoringFormDefinition; // 包含规范写法；无需 syntax 选择
  catalog: CapabilityCatalogSnapshot;
  target?: {
    profile?: string;
    platform?: string;
    preparedFormatVersion?: string;
  };
  schemaResources?: Record<string, JsonSchema>;
}

interface PreparedForm {
  preparedFormatVersion: string;
  build: {
    compilerVersion: string;
    catalogSnapshotId: string;
    profile: string;
    platform?: string;
  };
  definition: PreparedDefinition;
  resources: {
    schemas: Record<string, JsonSchema>;
    requestSchemas: Record<string, JsonSchema>;
  };
  capabilityLock: CapabilityLock;
  hostRequirements: HostRequirements;
}

type CompileResult =
  | { success: true; prepared: PreparedForm; diagnostics: Diagnostic[] }
  | { success: false; diagnostics: Diagnostic[] };
```

这些是已确认设计的结构描述；packages/protocol 已实现 PreparedForm / PreparedDefinition 等交换类型及位置约束。CompileInput / CompileResult / Diagnostic SDK 仍由后续 Compiler 提供，不因协议类型迁移新增空实现。Catalog 可由调用方或预先配置的编译上下文提供；不强制每次调用重复填写，也不凭空补出业务能力。默认格式由 Compiler 的确定支持配置提供；显式目标只作覆盖和匹配要求，不按时间变化的 latest 决定格式。

| 选项 | 默认行为 | 需要显式选择的情况 |
| --- | --- | --- |
| 语法 | 同一入口接受规范及受支持简写，输出统一规范结构 | 不要求使用者判断 canonical / authoring；结构冲突给诊断 |
| Profile | views 只有一个入口时自动选中，无需额外参数，也不强制入口名为 default | 多入口且调用上下文没有确定默认选择时显式指定；不得随字典顺序任取 |
| 平台 | 无需为单一视图手写平台；消费已经确定的能力快照，能唯一确定交付时直接锁定 | 需要在多个目标实现中选择时由配置 / 显式目标消除歧义，不猜测 Web，也不删除实际制品的平台身份 |
| Prepared 格式 | 当前 Compiler 的确定默认支持格式 | 调用方需要指定另一支持格式时；Runtime 仍精确匹配 |

保留 `views: Record<string, ViewNode>` 扩展能力，单视图可写 `views: { default: node }`，其他唯一名称同样可用；不新增一份 view / views 双字段。Profile 表达场景选择，不等于平台。未明确指定全局平台时 build.platform 可以省略；每项已锁定 artifact 的实际平台、身份和摘要仍保留并在装载时核对。默认入口减少重复配置，不免除所需物料 / Pure Function 契约与运行时实现的提供。

### Definition 保留范围与输出差异 {#compiler-io-differences}

PreparedDefinition 保留 protocolVersion / id / version、data、expressions、constraints 数组、reactions 数组、views 字典、viewTemplates 字典、validationMessages 与 metadata。不全面改成 Form / View / Dependency Plan，不增加 preparation 包装，不强制名字编号化、路径拆段或表达式指令化。原始语义和分层不因准备而改变；L3 唯一消费 Prepared 的边界继续有效。

| 位置 | 输出相对输入的必要变化 | 运行时直接使用的结果 |
| --- | --- | --- |
| Authoring 简写 | bind → bindings.value、children → slots.default、明确短函数别名 → Canonical ID；语义默认值归一 | 只处理规范写法，不建设双解释入口 |
| Reference / Scope / Expression / Command | 保留 source / scope / JSON Pointer、Binder、op + args、use、ValueSpec 与命令语义 | Runtime 绑定真实 Scope、装配能力并求值；不生成正式代码 |
| Reaction | 保留显式 watch / when / then；runOnActivate 默认 false | 不追加 when / then 读取，不另存重复依赖集合 |
| Internal Constraint | 新增完整有效 watch，合并 when / assert 与必要前置读取 | 直接绑定观察，不重新发现依赖 |
| External Constraint | 输出 watch 为显式输入、when 可见读取及前置传递依赖的有效集合 | 失效与请求时机分开；不保留第二份原始 watch 供执行端选择 |
| requires | 沿用字段名；字段前置补充已解析的 constraintIds，规则前置保留确定 constraintId | Runtime 绑定实例、补齐并执行本轮前置，不重新推导相关规则集合 |
| View 动态表达式 | 每个完整 $expr 包装增加自己的 watch，包含所有可能分支的静态读取 | 按表达式失效和复用结果，不按组件合并后全部重算 |
| Binding | 保留明确引用，不重复复制 watch | 分别接入绑定值及既有校验状态观察 |
| Template | 保留模板共享及参数绑定，模板体同样准备表达式 watch | 只做调用参数 / 实际 Scope 绑定与实例化，不重新分析模板表达式 |
| Profile 与资源 | 选中一个视图入口、其模板传递闭包和所需能力；完整共享 Schema / Constraint / Reaction 保留 | 减少交付内容，不因不可见裁剪业务义务 |
| Request | 原映射增加确定 concurrency 和物料 / 已知 Host 输入输出 Schema 资源引用 | 复用 requests 通道既有接入契约，Payload 仅调用时求值 |

普通 Data watch 统一沿用 DataReference，可增加 `aspect?: 'value' | 'structure'`，缺省为 value；结构是 Data 的观察方面，不是另一份状态源。统一条目 / 字段命名不统一各消费者的激活、完成或调度行为。DataWatch 仍仅表示数据观察；Reaction.watch 使用 DataWatch | ValidationWatch，显式区分校验状态来源。Context / Event 不成为触发来源，Constraint 的 Data-only watch 不扩张；ValidationReference 仅在允许的位置只读求值。

### 表达式包装、递归与精确更新 {#compiler-expression-watch}

```javascript
// 输入：动态 Props
props: {
  disabled: { $expr: /* 读取 status、age 的完整表达式 */ },
  label: { $expr: /* 读取 age 的完整表达式 */ }
}

// 输出：Prepared 专用表达式包装；表达式本体不改写
props: {
  disabled: {
    $expr: /* 原表达式 */,
    watch: [
      { source: "data", path: "/status" },
      { source: "data", path: "/age" }
    ]
  },
  label: {
    $expr: /* 原表达式 */,
    watch: [{ source: "data", path: "/age" }]
  }
}
```

status 变化仅使 disabled 失效；age 变化使两者失效。Adapter 统一管理生命周期，但保留各完整表达式的依赖与结果关联，无关表达式的有效结果可复用。递归遍历完整表达式的 args / use 和合法嵌套 ValueSpec；不为内部每个运算子节点另建观察者。props.badge.visible.$expr 与 props.badge.text.$expr 是独立入口。静态依赖覆盖全部可能分支、Literal 不遍历、整对象参数保守覆盖，精确到表达式不等于运行时动态裁剪分支。表达式结果如何缓存、比较与接入各端框架在功能专题落实，协议不承诺某种 DOM 更新次数。

`watch` 不是业务对象保留键。只有已识别为表达式包装的对象，其 watch 才是生成依赖；`props.watch` 可正常作为物料属性，甚至可写成 `{ $expr: expression, watch: dependencies }`。真实对象含 $expr 时沿用 $literal 转义；$literal / literal 内及表达式返回数据不再扫描为协议。输入 $expr 包装保持严格单字段，输出响应式包装允许且要求 $expr + watch，其他字段仍受严格结构约束。

事件 / Request Payload、Command 值中的 $expr 按调用求值，不因出现 $expr 自动持续订阅；这些位置保留按需包装。全局 expressions.* 仅共享计算定义，本身不拥有订阅，读取归并到实际消费者。Constraint 的 when / assert 保留直接 AST，整条规则的有效观察放在规则 watch；本轮不建立通用表达式结果 DAG。

### 交付资源、诊断和后续边界 {#compiler-io-delivery}

根业务 Schema 保留在 definition.data.schema；resources.schemas 闭合必要外部引用并保留资源身份 / 引用基址。resources.requestSchemas 单独闭合请求契约；节点 requests 保存 payloadSchemaRef / resultSchemaRef，有 Host 静态契约时保存对应 Host 资源引用，沿用 ADR-FE-016，不靠能力摘要重建输入输出形状。静态节点身份可作为生成字段用于请求需求和来源关联，不取代真实 Scope ID。

capabilityLock 保留能力 id / version / manifestDigest 和 artifact 的 id / platform / digest；HostRequirements 只沿用 validators / events / requests。能力代码在运行时装配，不把能力表编号误当成代码生成或既成性能收益。旧 services 候选不恢复。

Diagnostic 包含 code、severity、message、sourcePointer 及可选 relatedLocations；位置相对本次源定义，成功可带 Warning，存在 Error 不产执行制品。详细来源映射可作独立调试附件，不交付完整分析图。Prepared 不包含实例数据、真实 Scope ID、函数、组件、当前 Issues、请求状态或已激活订阅。

本期确认输入输出，不等于 Compiler 功能清单、检查分类、依赖 / 类型连接算法、首次读取交接、缓存和 SDK 已设计或实现。下一专题讨论这些功能；风险可视化 / 完整 read-write 影响图可按需工具化，不强制进入执行产物生成链。增量分析、模板特化、常量折叠、编号 / 紧凑编码和代码生成仍属后期可评估方向，需要具体收益证据。

### 早期接口草图的追溯边界

以下原有 TypeScript 与四项工作表保留原结构方向供追溯，已经由上方确认协议及 ADR-FE-017 修订。特别是必填 platform / profile、三类 Plan、独立准备树及集中依赖 ID 不再是现行输出要求；不能直接复制为新 SDK。Validate / Analyze / Transform / Package 仍是逻辑职责，具体本期功能下一专题确定。


以下 TypeScript 是工程契约方向，引用的类型仍待正式定义，字段名不作为最终对外 API：

```typescript
interface CompileInput {
  definition: FormDefinition;
  target: { platform: 'web' | 'flutter' | string; profile: string };
  contracts: {
    materials: MaterialCatalogSnapshot;
    pureFunctions: PureFunctionCatalogSnapshot;
    host?: HostContract;
  };
  preparedTarget: RuntimeFormatRequirement;
}

interface CompileResult {
  preparedForm?: PreparedForm;
  diagnostics: Diagnostic[];
}

interface PreparedForm {
  formatVersion: string;
  identity: {
    definitionId: string;
    definitionVersion: string;
    profile: string;
    platform: string;
  };
  formPlan: PreparedFormPlan;
  viewPlan: PreparedViewPlan;
  dependencyPlan: PreparedDependencyPlan; // 概念关联；打包位置与字段仍待 ABI 固化
  capabilityLock: CapabilityLock;
  hostRequirements: HostRequirements;
}
```

| 工作 | 内容 | 产物 |
| --- | --- | --- |
| Validate | L1 结构、Reference / Scope、Expression 签名、Material / Pure Function Contract、可选 HostContract | Diagnostics 与类型检查结论 |
| Analyze | 递归读取分析、按使用位置解释 watch、write / use / scope 关系、静态循环 | Typed Dependency Graph、风险告警 |
| Transform | 消除 Authoring 简写、解析符号、保留 Scope 模式、形成静态观察关系 | Form Plan、View Plan、Dependency Plan、已解析引用 |
| Package | 选择 Profile 与必要 Template 依赖，保留共享业务规则，携带能力锁和 Host 需求 | Prepared Artifact |

四项是逻辑职责，不要求四个服务或多套中间 AST；解析、检查与依赖构建可以共享遍历。Prepared Artifact 应可序列化，不将 JS 闭包、实例数据、当前 Issues 或请求状态放入交付格式。L2 准备纯函数引用与索引，不执行 Expression / Command / Reaction。

Diagnostic 至少包含源位置、代码、严重程度与可读原因；静态类型连接中“无法证明兼容”与“明确不兼容”均为阻止编译的错误，但诊断原因须区分。内容、编译器、目标和锁定依赖共同决定缓存身份；准备产物可被多个实例安全复用。

PreparedForm 的实际执行观察计划必须在编译时确定；可同时携带分析 Reads / Writes、建议与来源信息，但这些元数据不能在 Runtime 再次补齐 watch。静态可决定的引用解析、能力索引与锁定信息前置；when / ValueSpec 的具体求值、动态数组身份、实际 Change 匹配留给 L3，视图挂载与平台渲染留给 L4。平台仍管理 Release 与不可变发布，编译产物关联锁定能力不代表 Compiler 接管发布治理。

### 校验准备与完整 Schema 资源

选择完整 JSON Schema 根级校验域，不在 L2 自动拆分 Keyword / 局部 Schema。Prepared 交付可序列化 Schema 资源、引用与 Adapter 约定；Web 可缓存 Ajv 编译函数，Dart 由对应 Adapter 执行，不跨端传输生成的 JS 函数。业务 Constraint 仍复用 Pure Function / Host，不转换为 Ajv 自定义 Keyword ABI。

PreparedValidation 是校验准备信息的概念名称；当前归属 definition.constraints 的规则 watch / requires 和完整业务 Schema，旧 Form Plan 位置不继续作为有效接口。方向为：规则 / 执行器引用、读取依赖与 Scope 模式、前置引用及消息计划；实际实例、Pending、代次和 Source Issues 归 L3。前置的字段 / 规则两种引用、Scope 实例唯一绑定及首期仅等待同步校验已明确；编译计划不得建立跨 External 的异步等待或集合 or / any。后续已确认字段前置明确为 Schema + 相关适用 Internal 的同步资格，不包含 External，也不当作完整通过证明。现行 requires 沿用字段名，字段前置补充已解析 constraintIds；新 Prepared 仍需同步正式类型 / Schema，候选验证器不作为实现证据。

前置引用与静态非法配置应尽可能在 L2 诊断。L2 自动推导 Validation 可分析读取，并沿前置关系补全后置有效触发依赖；不可见的 Host 业务依赖由作者显式提供，不要求重复声明可推导依赖。L3 从命中任务递归补齐已解析的前置实例、去重并重排序，按本轮结果放行，不复用历史通过结论。这不修改 Reaction 显式 Watch，也不建立前置结果 PubSub；计划需保留补全依据，补全不意味着立即发起外部请求。字段有效性的范围、跨 Scope 解析、Issue 规范化与 Web / Dart 兼容矩阵见 [校验专题](l3-validation.md#validation-layers)。

### 首期 Prepared 机器结构基线 {#prepared-machine-baseline}

现行基线已由[本轮确认输入输出](#compiler-io-contract)修订：保留 Definition 的领域树、词法名称、Pointer 和 op + args；Prepared 以 definition 加必要资源和锁定包装交付。Template 共享保留，动态 Props 按完整 $expr 携带 watch；规则 watch 和 requires 放在规则本身，不新增 preparation 包装或集中依赖 ID。

此前 2026-10-21 首批方案采用有类型准备树、模板完全展开、Form / View / Dependency Plan 和不新增属性级准备信息；这些局部结构选择已被 [ADR-FE-017](decisions/ADR-FE-017-compiler-io.md)明确修订，原理由与比较见[演进](design-history.md#compiler-io-confirmed)。两份结构、唯一 Prepared 执行入口、JSON、精确格式匹配和 Error 无执行制品继续有效。

静态观察不保存真实 Scope ID、成员数据、组件、回调、请求状态或 Issue；Runtime 才绑定实例并管理活跃订阅。完整业务 Schema 及必要引用闭包随制品交付，不联网补 $ref，不拆 Keyword 局部引擎，不携带 Ajv 生成 JS。表达式精确失效不要求各端具有相同的 DOM 更新机制，也不新增字段 Controller。

后续授权已将 packages/protocol 的 Prepared 类型、派生 Schema、契约夹具和包消费迁移到本基线；输入默认定义类型为 CompilerInputDefinition，规范写法同样可赋值。Scope Binder 保留原语法，仅把默认 one 在输出中显式化。Compiler / Runtime / Renderer 尚未实现，结构验收不证明依赖分析、精确更新或默认选择已运行。

## 有类型的依赖关系与环检测 {#l2-dependencies}

| 关系 | 示例 | 含义 |
| --- | --- | --- |
| read | Expression 读取 `/price` | 读取依赖，不自动成为 Reaction 触发依赖 |
| watch | Reaction.watch 监听 `/quantity` | 按 L1 匹配语义筛选触发候选 |
| write | Command.set 可能修改 `/total` | 修改可能影响观察者 |
| use | Expression 引用命名表达式，View 引用 Template | 符号复用，不直接修改数据 |
| scope | `insureds[*]` 局部绑定与内部路径模式 | 引用归属与实例化依据 |

例如 Reaction 只 watch `/quantity`，when 读取 `/price`，then 写 `/discount`：不能把 `/price` 自动追加到 watch，否则改变业务语义。内部 `/insureds/*/age` 只是 IR 路径模式，`*` 不是 L1 JSON Pointer 语法；父级更新、数组插入、删除和重排需保守分析影响范围。

仅凭 `host.emit('quote.recalculate')` 无法推断 Handler 最终写哪些字段。Host 显式通过 Command 写回后，由 L3 按实际变化处理。

| 场景 | 静态结论 | 处理 |
| --- | --- | --- |
| Named Expression A → B → A | 确定符号引用环 | Error |
| 静态 View Template A → B → A | 无递归终止协议 | Error |
| JSON Schema 合法递归 `$ref` | 不属于上述引用环 | 不误判为表达式 / 模板错误 |
| Reaction A 写 B，B 的观察者又写 A | 潜在触发环，无法证明必然无限执行 | 默认 Warning，报告环链及源位置 |
| when、同值写入、Scope 实例影响终止 | 静态不能保证实际执行结果 | L3 负责执行、防环、预算与诊断 |

可使用 DFS / 强连通分量检查，但不因出现潜在 Reaction 环就默认拒绝 Definition；部署策略可按风险提升诊断等级。L2 将风险前移，不能替代 L3 运行时保护。

2026.10.18 的 L3 决策推荐进一步从显式 watch 与 Command 可能写入位置构建 Watch / Write 影响图，以 Tarjan / Kosaraju SCC 给出风险链。具体构图和动态 Scope 的精度仍需固化，推荐算法不等于已实现检查器。Write 分析不扩展 watch；实际终止还取决于 when、同值短路、最新状态合并和实例数据。L3 通过单实例 / 总执行次数限制兜底，Trace 记录实际链条，由 Devtools 事后分析，见 [运行时保护](l3-reactive-engine.md#l3-protection)。

### 类型引导的递归分析与使用位置解释

读取集不是订阅集。L2 先从合法 Expression / ValueSpec 递归收集可能读取，再按 [L1 使用位置矩阵](l1/03-expression-validation.md#expression) 编译触发关系：

| 分析对象 | 必须完成 |
| --- | --- |
| ref / use / op + args | 解析来源与词法引用；递归 Named Expression 及全部参数；命名引用环报错 |
| 嵌套 ValueSpec | 遍历合法对象、数组与 `$expr`；Literal / 普通 JsonValue 不识别为表达式 |
| 条件 / 短路计算 | 合并所有可能输入，不能按某个实例当前分支裁剪 |
| Pure Function | 只分析参数，不执行代码或窥探实现；整对象参数按子树观察 |
| 缓存 | 包含词法 Scope、Template 参数和编译上下文；全局 Named Expression 不捕获局部 Scope |
| Schema / 动态路径 | 局部规则尽量精确；条件无法证明时退到对象 / 子树；未来动态路径须明确依赖契约或拒绝 |

Reaction 只使用显式 watch；when / then 的读取保留作求值与诊断，不自动追加。Internal Constraint 合并 when 与 assert；External Constraint 合并显式 watch 与 when 的读取，以决定旧结论失效，不决定请求时机。Issue / external target 只是定位。当前 External 没有 Payload 字段；不能根据来源稿的建议自行扩展协议。

View Binding 与动态 Props 自动形成视图计划；Command Value 和事件 Payload 只在执行 / 事件时求值，不因其读取变化触发事件。ScopeBinder.from 保留结构性关系；Template 参数按已绑定 DataReference 解析，不形成独立可变状态域。

### 静态 Dependency Plan 与 Scope 模式

PreparedForm 在 Reaction / Constraint 和每个响应式 $expr 就地保存 watch，所属位置表达消费者身份，词法 Scope 关系保留；业务规则由 Runtime、呈现表达式由 Adapter 随挂载激活。当前不另设中央计划 ID；完整表达式级观察已确认，见[现行输出](#compiler-expression-watch)。

计划只保存静态关系与求值入口，不保存回调、组件、当前数组长度、实例 ID 或已执行纯函数结果。Validation / Field Meta 等运行时状态观察由 L3 接入契约描述，不扩展 L1 Reference.source；数组结构观察的编码方式尚未冻结。

确认 L2 编译绝对 / Scope 相对引用与结构观察的规范化路径模板，由 L3 结合实际 Scope / 挂载订阅建立运行索引。Trie + Scope Slot 是推荐实现，不冻结为 Prepared ABI，更不能让编译器预先写死所有真实成员的实例 Trie。来源的通配路径、`./age`、`length` 索引节点均为示意，不新增 L1 Pointer 语法。候选定位与前后观察值比较分工见 [依赖索引](l3-data-scope.md#l3-dependency-index)。

首次执行策略显式可配置是已确认的 L1 / L2 契约：L2 校验策略并编译，L3 在实例激活时按计划入队。来源曾用 `runOnActivate` / `activation: run-on-activate` 示意；首批基线已采用 runOnActivate 可选布尔、默认 false；它与本篇 `activation: runtime / view-mounted` 表示的“谁管理观察生命周期”分别解释，不能混用一个候选字段偷换含义。编译时不执行初始 Reaction，不创建 Baseline，不自动重写 watch。

当前约束：runOnActivate 仅新 Reaction 实例首次建立，不编译成已有规则的 Reset / 修复 / 重算入口。业务 Baseline / Dirty / Reset 策略归 Host，不是 L2 或 L3 自动维护的核心状态。编译器可以提示缺失 Watch，建议仍须作者确认；已有规则没有有效 Watch 变化时不因“结果可能不正确”新增执行计划。Context 继续只读，L1 Command / Reaction.watch 不在本次扩展到 Context。

L2 知道 `insured(each).age → 该项 Constraint` 的模式；L3 将其绑定为 A.age → Constraint A、B.age → Constraint B；L4 仅激活真实挂载 View 的计划。插入创建业务实例、删除释放无效关系、移动跟随稳定身份、整组替换按身份契约处理，不在编译期推断当前成员。静态统一不意味着 L3 初始化预注册全部 View。

## 投保发布的端到端例子 {#l2-example}

假设 `insurance-application@3.2.0` 使用 `insurance-card`、`core.gte` 和 `insurance.validateIdentity`，声明必需外部 Validator `insurance.eligibility` 与 Host Event `quote.recalculate`。

1. 业务团队提交仅声明逻辑能力 ID 的 L1 FormDefinition。
2. Capability Registry 提供指定平台兼容的 Manifest 与候选不可变能力 Release；Release 构建选择并固定 Catalog Snapshot、版本与制品身份。
3. L2 检查引用、Constraint 的 boolean 返回、Binding Port、Profile、依赖及环，输出 Prepared Artifact、Diagnostics 和依赖信息。
4. Release Manager 登记能力锁、Prepared Artifact 与 Host Requirements；多平台 / Profile 分别形成确定制品。
5. 宿主部署对应 SDK、Material、Pure Function 实现，并在初始化时注册 Host Handler。
6. Runtime 做兼容与能力预检查；必需 Validator 缺失不能被当作通过。Host 执行请求，需改业务数据时经受控 Command 写回，外部义务报告还需有效性检查。

```json
{
  "materials": ["insurance-card"],
  "pureFunctions": ["core.gte", "insurance.validateIdentity"],
  "hostRequirements": {
    "validators": ["insurance.eligibility"],
    "events": ["quote.recalculate"]
  }
}
```

这是概念发布摘要，不是新增 L1 字段。实际 PreparedForm 按现行输入输出保留 definition、就地 watch / requires、资源、锁定与 Host 要求；旧 Form / View Plan 分层仅保留为历史逻辑分工，Runtime 的初始化 API 仍待固化。

## 失败路径、治理与验收 {#l2-acceptance}

| 故障 | L2 / 平台 | Runtime |
| --- | --- | --- |
| 未注册 `insurance.validateIdentity` | 编译错误，不猜测映射 | 不装载缺少必需纯函数的产物 |
| 同 ID 存在不兼容能力 Release | 构建时选择唯一锁定版本 | 匹配已锁定实现 |
| Flutter 缺少 Material 实现 | 针对目标平台 / Profile 报不可用 | 不静默使用 Web Bundle |
| 纯函数签名变化 | 重检 / 重编受影响 Definition | 版本 / ABI 不匹配拒绝加载 |
| 必需 Host Validator 未注册 | Requirements 记录阻塞义务 | 不得绕过义务进入提交 Ready |
| Host Event 无静态契约 | 提取名称与有限信息，说明不可证明项 | 执行前 / 调用时检查，明确诊断 |
| 纯函数代码有副作用或语义漂移 | 契约测试、审核、发布控制 | 必要隔离与故障处理 |
| Reaction 潜在环 | 定位环链并告警 | 按实际变化调度，防环与诊断 |
| Prepared Format 不兼容 | 选择匹配目标格式 | 启动时拒绝不兼容制品 |
| 旧发布依赖 latest | 发布流水线拒绝不确定依赖 | 不静默热替换 |

保留 Definition → Compiler Version → Catalog Snapshot → Capability Lock → Prepared Artifact → Runtime Version 的追踪链，才能解释同一表单在不同客户端的差异。

成功标准：锁定输入可复现；已知静态错误具有精确 Diagnostic；未预先注册的 Host 依赖明确表达并在运行时可靠检查；不把 L3 / L4 或平台发布职责移入编译器。现有 L1 五组基线与补充样本可作为后续验收输入，候选验证器尚未验收本篇的 L2 / Release / ABI 契约。

## 待固化接口与验收标准 {#l2-decisions}

| 待固化项 | 当前方向 | 判定标准 |
| --- | --- | --- |
| Expression `op` vs `call` | 本次保留 `op + args` | 若迁移，作为独立 L1 版本变更统一处理 |
| 内置别名与 Canonical ID | 短名只作明确别名，完整 `core.*` 为规范化方向 | 白名单、映射、内置签名及现有样本迁移 |
| Host 缺失处理 | 必需 Validator 不得绕过；可选遥测按声明跳过；一般事件必须可诊断 | 可选性、阻断时机、重试和错误等级 |
| PureFunctionManifest 最小签名 | Schema 参数 / 结果、固定 / 变长及内置有限短路已确认 | 输出正式类型、签名表及边界反例，不另建 TypeSignature 语言 |
| Capability Release Lock | 分别锁 Manifest 内容摘要和实现制品字节摘要；按平台 / Profile 解析 | 固化实现及构建身份核对，不重开摘要对象选择 |
| PreparedValidation | 完整 Schema 资源、规则引用 / 依赖 / 前置 / 消息计划 | 落实依赖推导 / 传递与前置共同入队，冻结引用语法及 Adapter 行为；不携带实例结果或跨端 JS 校验函数 |
| Prepared ABI | JSON、独立格式版本、首阶段精确匹配已确认 | 完整字段、摘要、格式迁移与 SDK |
| Dependency Plan | 现行为规则 / 完整动态表达式上的统一 watch；词法 Scope 保留，按需激活 | 输入输出已确认；后续实现分析、绑定、精确失效与格式迁移，不恢复集中计划 ID |
| 首次执行策略 | runOnActivate 可选且默认 false，L2 编译，L3 仅新实例首次安排 | 与观察生命周期归属分开；正式类型 / Schema 与候选样例迁移 |
| Material 的 Host Request | 沿用 ADR-FE-016 的 requests 映射、确定契约及装配预检；services 已退出 | 后续实现资源闭包、签名连接及缺失时局部错误，不恢复旧服务需求 |

这些是规范落地时的接口决策，不重新开放已经收敛的职责分工。

## 后续交付与来源 {#l2-delivery}

下一阶段优先固化以下四类交付；当前任务只整合设计，不创建概念性的生产发布包：

1. `capability-contracts.ts`：Material / Pure Function / Host Contract 的 ID、签名、平台与版本规则。
2. `prepare.ts` 与 `prepared-form.types.ts`：编译输入、Diagnostics、Prepared 输出与 Format 兼容约束。
3. `release-manifest.schema.json`：能力锁、Prepared Artifact 身份、目标平台 / Profile 与不可变性。
4. 验收用例：未注册纯函数、端口不兼容、Template 环、Reaction 潜在环、版本不匹配、Host 缺失及跨端制品兼容；用现有 L1 基线反向验证。

### Host 名称与缺失策略确认

校验规则 ID 标识声明与运行实例，Host Validator 使用独立、语义明确的能力名称，规则显式引用能力名称，不按规则 ID 猜测实现。不同校验语义使用不同能力名称；多条规则需要同一校验语义时可以引用同一能力，各自实例、代次与错误来源仍独立。具体引用字段、参数与签名在正式类型 / Prepared 契约中固化，本轮不伪造候选 Schema 已支持新字段。

Host 能力缺失按用途降级，开发 / 调试端明确报诊断，用户端不暴露未注册能力名、堆栈等技术错误，不因局部能力缺失默认阻止表单填写。可选埋点等可跳过，业务操作的降级由 Host 决定；适用校验器缺失必须记为未完成，不能静默当作通过。用户交互由 Host 以业务语言承接，用户无感知不等于伪造完整通过或放行未校验数据。

### L1 严格结构与连接检查

协议结构采用严格检查：未知字段、混用多个 Union 分支及不符合当前分支的字段在配置 / 编译阶段拒绝，不静默忽略或仅警告后继续产出可执行制品。严格范围是协议节点；Working Data、metadata、Schema 和物料 Props 等各按所属数据 / Manifest 契约检查，不能把业务字典的任意键一律当未知协议字段。

ValueSpec 位置的 $expr / $literal 为保留标记键。出现标记键必须按对应包装校验，包装结构不合法直接诊断，不退回普通对象；需要原样保留含这些键的数据时用 $literal 显式转义，其内部不再递归解释。只在类型规定的 AST / ValueSpec 位置解析，不扫描 Working Data、业务 Schema 或 Literal 原文。Expression 的 literal 与 ValueSpec 的 $literal 属于各自语法位置，不混用。

跨 Template 参数、Binding Port、函数参数等类型连接，仅接受明确可判定且能证明兼容的结构；已知不兼容与无法证明兼容均拒绝编译，但诊断码 / 原因应区分。不用运行时兜底、作者强制断言或静默降级绕过连接检查。受限的是静态连接兼容检查能力，不将业务数据根 Schema 改成局部 Schema，也不声称任意 JSON Schema 包含关系均可判定。可判定子集、Union 完整形状、签名与正反例仍需正式固化。

该拒绝策略针对协议形状与静态类型连接，不将 Reaction 潜在环 Warning 改成必然无限循环错误，也不撤销 HostContract 可选：没有 Host 静态声明仍可提取 Requirements，运行时按已确认缺失策略检查；不得把这一不同接缝混成已证明兼容的 Template / Port 连接。

## Prepared 交付与编译错误边界 {#prepared-delivery}

协议结构校验链路已确认采用原生 TS 类型 → 自动生成 JSON Schema → Ajv；Compiler 在输入边界执行结构校验，再做引用、Scope、能力连接等语义分析。具体生成器和诊断映射随实施固化，见 [L1 结构源](l1/08-decisions-release.md#protocol-structure-source)。Runtime 不在交互高频路径重复静态检查；本节规定的制品装载兼容与有效性检查继续保留。

2026-10-21 用户确认：同进程 Compiler 刚成功生成的结果不重复整份结构校验；外部文件 / 接口 / 缓存载入的 Prepared JSON 在接收边界做一次结构检查，再核对格式、目标与能力。检查结果可随受控不可变产物复用，不在交互或成员实例化时重验整份协议；可信验证与缓存须有明确边界，不能仅凭格式版本断言结构有效。

2026-10-27 用户进一步确认：Compiler 成功交付的 Prepared 深度只读，需要编辑时先克隆为可修改的 JSON；变更后的对象重新进入检查，不能继承旧验证结果。TS 成功结果使用 ReadonlyPreparedForm，PreparedForm 继续表示可构造的 JSON 形状。结构接收入口在纯 JSON 接管与 Schema 检查成功后，以进程内弱身份识别不可变产物，供 Compiler、Runtime 和 Renderer 复用；该身份不序列化，不接受调用者自报的 trusted 标记或单独 Object.isFrozen 判断。内部接收入口复用 Protocol 的生成 Schema，不承担引用 / 类型连接等 Compiler 语义分析；格式、能力锁、实际注册及不同视图的执行兼容仍由消费者检查。同一份受控执行对象可直接复用兼容结果，不同对象仍按契约核对。

首阶段 Prepared Artifact 采用 JSON 交付，Form / View / Dependency Plan 保持逻辑分工，不要求拆为多个文件。传输压缩不构成另一套协议；不同时建设二进制格式，只有性能证据出现后才另行评估。具体字段、确定性序列化及摘要覆盖对象继续固化，JSON 方向确认不等于完整 ABI 已冻结。

首阶段 Runtime 只接收与其声明支持格式精确匹配的 preparedFormatVersion；不按 Compiler 版本号推断兼容，也不默认接受版本范围或增加 feature 组合协商。目标平台、Profile、能力锁及 Host 接入检查分别执行，格式匹配不代表所有能力必然可用。不兼容或无效制品拒绝进入执行，不回退解释 L1。

编辑、协议入库校验与发布使用同一 L2 分析能力，尽早返回具体源位置、错误码、严重程度和可读原因。编辑器可取得不完整配置的诊断 / 符号等分析信息，但存在 Error 时不得生成可执行 Prepared，不将错误协议作为可用入库 / 发布制品，也不跳过错误节点拼成部分可执行表单。Warning 可伴随成功制品，不能把已规定拒绝的静态错误降为 Warning。错误草稿能否临时保存属于后续 Studio / Platform 范围，不在本轮另定策略。

C 端只消费检查通过且兼容的 Prepared，错误分析结果不能传给 Runtime 继续执行。运行时仍核对格式、目标与能力，保留输入校验、任务有效性和熔断等保护；静态编译不保证网络、Host 实现或业务输入永不出错，Host 能力缺失仍按 ADR-FE-012 的用途降级，不能伪造校验通过。

验收覆盖：Error 时无执行制品但有可定位诊断；Warning 可生成合法制品；格式不匹配拒绝装载；能力缺失按用途处理；相同锁定输入生成结果可复现。均为待实现验收，不是现有候选探针通过证据。


### 旧 Host 服务候选的追溯保留

以下图与注册草图仅保留原讨论来源，已经由 ADR-FE-016 的 requests 通道替代，不是现行注册接口。当前 validators / events / requests 及输入输出规则以上文和 L1 请求契约为准。

```diagram
{
  "id":"figure-l2-platform",
  "title":"平台治理、静态编译与运行时绑定",
  "rows":[
    [{"title":"Form Registry","body":"Definition、草稿、版本、发布审批"},{"title":"Capability Registry","body":"Material / Pure Function 的 Manifest、制品索引与版本"}],
    [{"title":"Release 构建上下文","body":"Definition + 确定 Catalog Snapshot + Build Target + 目标格式要求"}],
    [{"title":"L2 Protocol Compiler","body":"Validate / Analyze / Transform / Package","major":true}],
    [{"title":"Release Management / Artifact Distribution","body":"登记 PreparedForm、Capability Lock、Host Requirements；摘要、审核、发布、回滚与分发"}],
    [{"title":"L3 Runtime + L4 Renderer","body":"只加载兼容 PreparedForm；能力预检查、实例数据与规则、物料；不回退直接解释 L1"},{"title":"Host Runtime","body":"validators / events / services 在应用运行时注册"}]
  ],
  "arrows":["↓","↓","↓","↓"],
  "note":"Form Registry 管表单资产，Capability Registry 管能力资产，Compiler 管静态转换，Release Management 管不可变发布。执行代码在运行时绑定，Host 代码不强制进入平台注册。"
}
```

```typescript
interface FormHost {
  validators?: Record<string, HostValidator>;
  events?: Record<string, HostEventHandler>;
  services?: Record<string, HostService>;
}

createFormRuntime({
  preparedForm,
  host: {
    validators: { 'insurance.eligibility': checkEligibility },
    events: {
      'quote.recalculate': recalculateQuote,
      'insurance.submit': submitInsurance
    }
  }
});
```


### 请求映射完整性与实际注册边界

页面实际使用的物料声明的 requests 首期全部必需，Compiler 按确定 Catalog 检查是否逐项映射；漏项产生 Error 并定位物料节点 / 请求名 / 配置位置，不生成可执行 Prepared。MaterialNode.requests 在结构上可省略不意味着语义可漏项；无请求物料允许省略。仅 Registry 中未使用物料不产生此义务。

HostContract 可选只影响静态兼容证明，不豁免运行时注册。所选 Prepared 的 HostRequirements.requests 在页面装配、交互可用前核对实际函数，条件隐藏或尚未挂载不豁免；缺失项对应物料进入明确错误状态，其他可用物料继续。开发类型约束及详细验收见 [请求开发接入](l1/05-view-material-host.md#request-development-contract)。

### 状态观察与响应项的兼容增量 {#prepared-state-actions}

Reaction.watch 从仅 DataWatch 扩为 PreparedReactionWatch（DataWatch | ValidationWatch），then 保留 ReactionAction 的显式顺序；Command、Constraint.watch 和持续 View 表达式的 DataWatch 不扩张。只读 ValidationReference 保留静态字段与投影，不序列化当前 Issues 或任务。

HostEventIntent 由物料事件和 Reaction 共同使用，需求来自完整共享 Reaction 与所选视图，按名称合并。名称 / Payload 检查、Event 环境限制与版本边界见[Compiler 衔接](l2/compiler.md#compiler-reaction-state)。新产物使用 form-engine.prepared/2，/1 目标拒绝，旧定义可重新编译；不能通过结构 Schema 接受就宣称旧消费者理解新语义。
