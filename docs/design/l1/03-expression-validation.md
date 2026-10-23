---
id: L1-EXPRESSION
title: 表达式、约束与校验
type: protocol
status: active
layer: L1
modules:
- M03
- M11
- M13
tags: []
related:
  decisions:
  - ADR-FE-020
  - ADR-FE-019
  - ADR-FE-018
  - ADR-FE-017
  - ADR-FE-002
  - ADR-FE-005
  - ADR-FE-010
sources:
- SRC-REACTIONSTATE
- SRC-L3BASELINE
- SRC-COMPILERIO
- SRC-PROTOCOLBASELINE
- SRC-PREREQUISITES
- SRC-CONTRACTS
- SRC-L1
- SRC-DEP
- SRC-V07
navigation:
  group: 02 · L1 协议
  order: 33
last_reviewed: '2026-10-23'
reading_next: L1-COMMAND
---

# 表达式、约束与校验

> L1 架构与语义决策正文；正式类型、Schema 与发布验收状态见各节。

## Expression AST 与 ValueSpec {#expression}

> 状态：已收敛

**概念类型 · 正式 Union 仍需消歧校验**

```typescript
type Expression =
  | JsonPrimitive
  | { ref: Reference }
  | { use: string }
  | { op: string; args: Expression[] }
  | { literal: JsonValue };

type ValueSpec =
  | JsonPrimitive
  | { $expr: Expression }
  | { $literal: JsonValue }
  | ValueSpec[]
  | { [key: string]: ValueSpec };
```

Expression 是纯计算 AST，采用严格类型、有限内置 Pure Function 与版本化领域纯函数。Named Expression 可复用，但全局命名表达式不得隐式捕获调用方的局部 Scope；不引入参数化函数语言。

**Pure Function 命名与能力边界 · 2026.10.17 架构决策**

内置与注册的同步纯计算统一称为 Pure Function（纯函数），使用同一调用协议；复杂同步校验直接复用领域纯函数，不新增平行的同步 Validator DSL。纯函数不执行 I/O、不读外部可变状态、不修改数据，也不管理 Scope 或校验状态；Constraint 负责适用条件、Issue 目标和错误码，内部 `assert` 必须返回 boolean。

本次保留 Expression 的 `op + args` 字段。`core.*` 为内置能力保留命名空间，业务 ID 不得覆盖；短 ID 的明确别名与规范化映射随正式契约固化，现有草案示例暂保留短名。L2 按确定 Catalog 解析签名与依赖，L3 绑定锁定实现；版本和制品锁不新增为 L1 顶层字段。详见 [L2 纯函数命名](../l2-preparation.md#l2-function-identity) 与 [能力契约](../l2-preparation.md#l2-manifests)。

**动态 Expression 可以出现在任意嵌套 ValueSpec 内**

```json
{
  "material": "summary-card",
  "props": {
    "title": "投保摘要",
    "badge": {
      "visible": {
        "$expr": {
          "op": "eq",
          "args": [
            { "ref": { "source": "data", "path": "/plan" } },
            "premium"
          ]
        }
      }
    }
  }
}
```

| 协议位置 | 表达式形态 |
| --- | --- |
| `constraint.assert` / `reaction.when` / `expressions.*` | 直接使用 Expression AST |
| `props.*` / `command.value` / `host.emit.payload` | 递归 ValueSpec，通过完整的 `$expr` 包装进入表达式 |
| 需要原样保留标记对象 | 通过显式 Literal 转义表达，不能按普通对象形状误判表达式 |

**读取、触发与订阅 · 2026.10.17 跨层依赖模型**

Expression 描述可能读取什么，本身没有订阅生命周期。L2 按类型递归分析 AST、Named Expression 与嵌套 ValueSpec，再按使用位置决定哪些读取形成触发依赖；L3 匹配活跃订阅，L4 管理 View 订阅的挂载与释放。不能扫描整份 JSON，把恰好包含 `ref` / `$expr` 的普通数据认成表达式。

| 合法使用位置 | 求值入口 | 变化是否自动形成观察依赖 |
| --- | --- | --- |
| `expressions.*` | 被引用时纯求值 | 仅提供读取集，由使用方决定触发；不捕获调用方局部 Scope |
| `reaction.watch` | 变化匹配 | 显式触发来源，保持 DataReference[] |
| `reaction.when` | watch 命中或显式首次激活入队后判断 | 否，不自动追加到 Reaction.watch |
| Reaction 动作 / Command 值 / Host Payload 中的 ValueSpec | 动作执行时 | 否，按执行时当前数据求值 |
| Internal Constraint `when` / `assert` | 初始化、主动校验或依赖变化后的校验入口 | 是，合并二者所有可能读取 |
| External Constraint `watch` / `when` | 失效匹配 / 适用性判断 | watch 显式补充 Host 输入，when 可见读取自动合并 |
| View `bindings` | 首次读取与后续投影更新 | 是，端口所读数据；Field State 经 L3 接入契约消费 |
| View `props` 中的动态 ValueSpec | 首次求值与后续更新 | 是，含物料定义的禁用、可见性等动态 Props |
| Material 事件映射与 `host.emit.payload` 中的 ValueSpec | 事件实际发生时 | 否，不因读取字段变化而发出事件 |
| `ScopeBinder.from` | 绑定及实例化 | 结构性关系，用于创建、删除、重排和改绑 |
| Constraint `issue.target` / external `target` | Issue / 义务定位 | 目标本身不自动成为读取或触发依赖 |

L2 保守覆盖短路计算的全部可能输入，Literal 内部不做表达式分析。

2026-10-21 已确认[输出表达式观察包装](../l2-preparation.md#compiler-expression-watch)：L1 输入语法不变；Prepared 在持续呈现的每个完整 $expr 旁加入统一 watch，按表达式精确失效 / 复用结果。内部递归节点不单独观察，按调用求值的位置不因此建立订阅。watch 不是业务对象保留键，$literal / literal 和返回值内不重新解释。对象作为纯函数参数时按对象子树观察；校验设计将完整 JSON Schema 保留为根级校验域，首版不自动拆分条件 / Keyword 局部单元。纯函数依赖只来自显式参数，不通过执行它推断输入。完整编译、Scope 与激活契约见 [跨层依赖与订阅](../dependency-reactivity.md)。

> **求值失败的语义**
> 
> 解析失败或类型不匹配不等于 Expression 返回 `false`，也不等于自动使用最近一次合法值。同步业务 Constraint 不通过、外部校验 Pending 也不应自动阻断全部 Reaction。

### 首期函数签名与求值契约 {#function-evaluation-contract}

2026-10-21 用户确认签名复用 JSON Schema，不另建 TypeSignature 语言。parameters 为有序固定参数，带说明名称 / schema / 可选标记；可选项只在末尾，restParameter 单独描述变长参数，returns 为结果 Schema。op + args 不变，参数名称不引入命名实参。实际类型见 [L2 能力](../l2-preparation.md#l2-manifests)。

Missing 是内部缺失语义，不自动转为 null / 0 / 空字符串，也不写入 JSON 数据或制品。普通函数收到不符合签名的输入报告求值错误；exists 等明确内置可处理 Missing。不隐式转换字符串 / 数字，数值结果必须可表示为合法 JSON 数值，除零等报错；eq 不隐含通用对象 / 数组深比较。

固定内置 and / or / if 支持短路（if 只求值选中分支），其他注册函数严格求值并只接收参数值，不接受 AST / 求值器，不开放插件自定义惰性解释。L2 的读取分析仍覆盖全部可能分支。完整 core.* ID 是 Canonical，短名仅为明确 Authoring 别名。

首期范围为 eq / ne / gt / gte / lt / lte，add / sub / mul / div，and / or / not / if，exists / length。精确参数数量、类型与边界正反例随正式函数表一次固化，不把具体算法当成已实现。

## Constraint：内部断言与外部校验义务 {#constraint}

> 状态：已收敛

**Internal · 可同步求值的业务约束**

```json
{
  "id": "age-eligible",
  "kind": "internal",
  "scope": {
    "from": { "source": "data", "path": "/insureds" },
    "as": "insured",
    "mode": "each"
  },
  "assert": {
    "op": "gte",
    "args": [
      { "ref": { "source": "data", "scope": "insured", "path": "/age" } },
      18
    ]
  },
  "issue": {
    "target": { "source": "data", "scope": "insured", "path": "/age" },
    "code": "AGE_BELOW_MINIMUM"
  }
}
```

**External · 声明义务，不声明 URL 或请求策略**

```json
{
  "id": "insured-eligibility",
  "kind": "external",
  "scope": {
    "from": { "source": "data", "path": "/insureds" },
    "as": "insured",
    "mode": "each"
  },
  "watch": [
    { "source": "data", "scope": "insured", "path": "/age" },
    { "source": "data", "scope": "insured", "path": "/idNumber" }
  ],
  "target": { "source": "data", "scope": "insured", "path": "/idNumber" },
  "requiredForSubmit": true
}
```

内部约束使用可选 `when` 和必需的 `assert`；外部约束声明依赖、归属位置及是否阻断提交。**Constraint 不执行 Command，不设计 onFail 动作链。**

Internal Constraint 的触发依赖来自 `when + assert` 的读取并集，无需再填 watch。例如 `when` 读取年龄、`assert` 读取监护人姓名，两者任一变化都可能改变结果；条件不再适用时移除该规则实例的旧 Issue。`issue.target` 只管错误归属，不代表唯一输入。

External Constraint 的 `watch: DataReference[]` 显式声明 Host 内部不透明的 Data 输入，与可选 `when` 的静态可见读取合并为失效依赖。当前协议没有 External Payload 字段，不据来源稿中的候选描述新增字段。2026-10-21 已确认采用本次调用的数据读取快照及 Scope，不新增命名参数映射；Host 必须从本次输入读取影响结果的表单数据并完整声明不透明依赖，不能绕过输入视图读取其他时刻数据后仍要求引擎证明结果有效，见 [Host 调用输入](../extension-integration.md#host-input-contract)。依赖变化立即使旧结论失效并可登记本轮校验任务；请求在 Flush 结束后的统一校验批次按适用性和同步前置发起，独立规则不串行等待网络；没有 Reaction 时有独立校验入口。普通增量覆盖命中任务及前置，完整校验覆盖全部适用规则；watch 不描述 URL 或网络重试。

**字段迁移：**现行草案将原 `dependsOn` 改为 `watch`，引用值保持不变；旧字段仅保留在历史来源中。现行 Canonical 不接收旧字段或双字段混用。正式协议版本号、旧版识别与迁移工具尚待发布规范固化，本次不虚构版本号或宣称兼容已发布数据。Reaction.watch 的语义保持不变。

**有限前置与消息覆盖 · 设计方向**

校验前置在本轮 Constraint 链中检查、必要重排序，前置执行不依赖结果反向 PubSub 或通用异步 DAG；显式 ValidationWatch 只消费已发布的对外状态，不替代 requires。来源的 `requires` 只是语法占位：字段有效性已确认按前置完成后该字段无错误判断；字段 / 规则两种引用能力已明确；2026-10-21 确认按具体 Scope ID 唯一实例绑定，本期不增加 or / any 等集合能力，仅允许等待同步前置，多步异步封装在同一个 Host Validator。后续完整草案确认字段前置是 Schema + 相关适用 Internal 的同步资格，明确不包括 External，不代表完整有效性；正式语法与 Prepared 字段按已确认原则实施整合，见 [首期前置范围](../l3-validation.md#prerequisite-scope-contract)。2026-10-19 已确认：可推导的 Validation 依赖由 L2 自动补全，前置输入依赖传递纳入后置有效依赖；无法推导的业务依赖才需作者显式提供。后置入队时递归补齐前置 Constraint，按具体实例去重并使用本轮结果，不复用旧通过结论；这不改变 Reaction 的显式 Watch，也不等于立即发起外部请求。默认消息 + 局部覆盖为推荐，来源 `validationMessages` 也不是本次新增的正式顶层字段。完整规则与取舍见 [校验专题](../l3-validation.md#validation-round)。

## 校验状态与提交 Readiness 的协议边界 {#validation}

> 状态：已收敛

L1 声明完整标准 Schema 和业务 Constraint，不在 Form Definition 中保存 `validationState`。L3 复用数据依赖匹配，登记去重的校验任务，在正常 Reaction 收敛后执行根 Schema 和本轮 Constraint 链；没有 Reaction 时也有校验入口。外部能力由 Host 执行，返回由 Runtime 核对适用性。

以下概念继续表达内部正确性与完整校验所需事实，不要求每个来源都对 View 暴露五态状态机：

| 概念 | 语义 |
| --- | --- |
| unverified | 尚未对当前有效输入取得结论 |
| pending | 对应校验正在进行 |
| valid | 当前有效输入验证通过 |
| invalid | 当前有效输入验证未通过，产生业务 Issue |
| error | 校验执行错误，以诊断区分，不能被当成通过 |

推荐按 Source 保存 Issue、以 ScopeId + 相对路径形成字段聚合，View / Host 消费聚合结果，内容实际变化时才通知。同步结果原子替换以避免闪烁；异步输入失效撤销本来源过期 Issue，不清除其他来源。不暴露复杂状态不等于“没有 Issue 就通过”；内部仍要判断是否已执行、请求代次、输入有效性和 Scope 存活。Issue 最小结构、排序、去重与 SDK 仍待固化，详见 [结果与字段订阅](../l3-validation.md#validation-results)。

一个外部 Constraint 在数组 Scope 下派生多个实例义务，独立输入 / 请求代次避免无关字段变化误伤请求。返回成功与异常都须核对当前实例、Scope 和代次；失效、删除或替换后旧结果不得覆盖当前状态。多步异步业务优先封装在同一 Host External 实现，不由本轮排序推导跨规则异步等待能力。

普通增量只覆盖本轮命中规则，显式完整校验需覆盖全部适用 Constraint。Submit Readiness 不要求历史 Reaction 成功，依赖当前数据的 Schema / 内部约束和全部当前适用的异步校验。完整结果需区分当前通过、业务失败、未完成 / 配置或执行异常、输入已过期，不能以“队列空 / 未知 / 请求失败 / 无 Issue”冒充通过；具体 valid / invalid / incomplete / stale 编码与等待 API 未冻结。完整证明须与所验证输入关联，不同于单个外部请求的局部有效性。

正常校验在同步联动收敛后执行，异步不纳入 Reaction Flush 等待。已退出局部 Health / 受损范围传播；Reaction 错误不自动阻止提交；整体熔断仅终止当前轮、清空剩余 Reaction，后续新有效触发正常建轮；保留填写和独立完整校验，通过后可由 Host 提交对应快照。Outcome 与完整结果接口仍待 [完成契约](../l3-validation.md#validation-completeness) 固化，不建立失败下游禁用。真实保存、权限与提交归 Host。

Constraint 随 FormRuntime / Scope 激活，不随 View 挂载或隐藏建立、注销。初始化与主动校验有明确入口，不依赖先发生数据变化，subscribe 不隐含首次执行。Context 保留现行 Host 提供 / 表达式只读 / Data-only Command 与普通数据观察契约（Reaction 的显式 ValidationWatch 另见命令与联动主题），Host 可显式替换 Context，并保守失效呈现及校验；该实例管理入口不自动触发 Reaction，见 [Context 交接](../extension-integration.md#host-context-update)。

> **与 View 的关系已经定稿**
>
> View 的 `bindings` 只写数据位置。无需 `validationBind`、`errorBind` 或物料校验管理字段；Runtime 提供字段 Issue 聚合，Material 决定交互呈现。字段资格按前置完成且无字段错误判断；查询 / 订阅接口与引用绑定契约仍见 [L3 校验设计](../l3-validation.md)。

### 完整校验的等待范围修订

完整校验必须等待全部当前适用的同步 / 异步校验完成且通过，独立错误尽量收集。上方候选示例的 requiredForSubmit 不构成绕过完整校验的例外，其字段去留与样例迁移待正式类型 / Schema 一起固化；本轮不直接修改候选协议包。

### Host Validator 的独立能力引用

校验规则 ID 标识声明与运行实例，Host Validator 使用独立、语义明确的能力名称，规则显式引用能力名称，不按规则 ID 猜测实现。不同校验语义使用不同能力名称；多条规则需要同一校验语义时可以引用同一能力，各自实例、代次与错误来源仍独立。具体引用字段、参数与签名在正式类型 / Prepared 契约中固化，本轮不伪造候选 Schema 已支持新字段。

引擎交付已校验数据与结果身份，业务请求转换由 Host 负责，不属于表单 Readiness 的引擎内置输出阶段。

### 标记消歧与严格分支检查

ValueSpec 中 $expr / $literal 是保留键，包装非法必须报配置错误，不回退普通对象；原样标记数据必须用 $literal 转义，Literal 内不递归解析。协议对象的 Union 分支与未知字段严格校验，规则见 [严格协议契约](08-decisions-release.md#strict-contract)。不在 Working Data / Schema 中识别表达式标记。


### 递归 ValueSpec 的机器消歧

首批基线确认使用标准 JSON Schema 递归引用，并在普通对象分支以 propertyNames 等标准约束禁止 $expr / $literal 保留键；包装分支严格拒绝额外字段，Literal 内递归 JsonValue 而非 ValueSpec。由类型附近约束或固定生成规则派生，不手改输出，也不建设自定义 Ajv 关键字。Schema 处理结构消歧，Compiler 按已知 Expression / ValueSpec 位置遍历，不扫描业务数据或 Schema。
