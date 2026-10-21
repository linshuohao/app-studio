---
id: L1-VIEW
title: 视图、物料与宿主契约
type: protocol
status: active
layer: L1
modules:
- M04
- M14
- M15
tags: []
related:
  decisions:
  - ADR-FE-017
  - ADR-FE-003
  - ADR-FE-005
sources:
- SRC-COMPILERIO
- SRC-CONTRACTS
- SRC-L1
navigation:
  group: 02 · L1 协议
  order: 35
last_reviewed: '2026-10-19'
reading_next: L1-LIFECYCLE
---

# 视图、物料与宿主契约

> L1 架构与语义决策正文；正式类型、Schema 与发布验收状态见各节。

## View：Profile 与三种结构节点 {#view}

> 状态：已收敛

**结构形态**

```typescript
type ViewNode = MaterialNode | ScopeNode | TemplateUse;

interface MaterialNode {
  material: string;
  props?: Record<string, ValueSpec>;
  bindings?: Record<string, DataReference>;
  slots?: Record<string, ViewNode[]>;
  on?: Record<string, InteractionIntent>;
}

interface ScopeNode {
  scope: ScopeBinder;
  node: ViewNode;
}

interface TemplateUse {
  $use: string;
  with?: Record<string, DataReference>;
}
```

**2026.10.16 修订：**`views: Record<string, ViewNode>`。具名 Profile 的值直接是 MaterialNode、ScopeNode 或 TemplateUse，不再包裹 `entry`。`default` 只是示例 Profile 名称，可替换为 desktop、mobile 等名称；它与物料的 `slots.default` 是不同概念。

View Profile 是不同场景的**入口选择**，不是不同业务数据源。PC 可以平铺编辑；移动端可以使用卡片和底部弹层。是否渲染列表，由 ScopeNode `mode: each` 决定，不额外声明 Repeat。

2026-10-21 确认默认易用性：单视图沿用 views 字典且可用任意唯一名称，无需调用方再传 Profile 或平台参数。default 是便捷名称，不是强制根；只有多入口且上下文未确定选择时才须显式选择，不任取字典首项。Profile 与平台分开，平台仅在目标实现选择需要时指定；默认不绕过实际能力的目标限制。

`$use` 是对命名视图结构的**静态复用**，不是 DOM 替换命令，不共享 UI 组件实例，更不是子表单。是否 Portal / Teleport、何时展开、动画如何实现均由容器 Material 自行决定。

## Binding：唯一 Canonical 是具名端口映射 {#binding}

> 状态：已收敛

**Material Port → Data Reference**

```json
{
  "material": "date-range",
  "bindings": {
    "start": { "source": "data", "path": "/travel/startDate" },
    "end": { "source": "data", "path": "/travel/endDate" }
  }
}
```

Canonical 永远使用 `bindings: Record<PortName, DataReference>`。`bind: "/name"` 仅是 Authoring 简写；没有 `read`/`write` 独立 DSL，也不承载字段状态、校验元数据或 Codec 的生命周期设计。

具体端口名称和端口数量由物料注册的 Manifest 决定；统一 Binding 语义属于 Protocol，不允许各物料自行把 `bindings` 重新定义为初始化值或网络事件。

Binding 与动态 Props 的依赖由 L2 静态编译；L4 以 Prepared View 计划和当前 Scope 通过 L3 subscribe 接入，挂载时订阅、改绑时更新、卸载时释放，不另做 AST 解析或变化匹配。Field State 与 Validation State 仍由 L3 提供，运行时状态观察不扩展 L1 Binding 的 DataReference 类型。动态表达式求值通过统一能力或共享适配契约完成；每个完整 $expr 在 Prepared 中携带自己的 watch，Adapter 按表达式精确失效并复用其他有效结果，不合并为组件全部重算。

条件渲染必须保留决定子树是否出现的父级观察者；未挂载子视图没有自身订阅，业务 Constraint 仍生效。虚拟列表可只订阅可见行。订阅与首次读取及 Scope 改绑之间不能漏变化；接口、快照一致性与节点 / 属性粒度见 [L4 生命周期](../dependency-reactivity.md#dependency-view)。

## Slots：容器组合与 children 简写 {#slots}

> 状态：已收敛

**一个规范的 Slots 模型**

```json
{
  "material": "bottom-sheet-editor",
  "slots": {
    "trigger": [{ "material": "insured-summary" }],
    "content": [
      {
        "$use": "insured-fields",
        "with": {
          "insured": { "source": "data", "scope": "insured", "path": "" }
        }
      }
    ]
  }
}
```

所有 Slot 在 Canonical 都使用数组；`children` 可作为 `slots.default` 的 Authoring 简写。Manifest 声明物料接受哪些 Slot 名称及其交互含义；首期不设置通用 minItems / maxItems 或单 / 多节点数量限制。默认插槽使用 default，具名插槽使用声明名称；数组是统一组合表示，不意味着协议要求新增数量管理。

Slot 是视图节点组合位置，不能与普通 Props JSON 混淆，也不是一个“把组件插入任意 DOM 节点”的操作指令。

## Typed View Template Params：可直接落地的方案 {#templates}

> 状态：已收敛

> 保留 Typed Data Params，但**只复用已有 Data Schema 的类型**。无需额外泛型系统、参数表达式语言或全局 Scope Registry。

**最小 Typed Template Params**

```typescript
interface TemplateDataParam {
  schemaRef: string;   // 相对于 data.schema 根的 JSON Schema Pointer
}
interface ViewTemplate {
  params?: Record<string, TemplateDataParam>;
  node: ViewNode;
}
interface TemplateUse {
  $use: string;
  with?: Record<string, DataReference>;
}
```

**模板定义只注解类型，不复制业务 Schema**

```json
{
  "viewTemplates": {
    "insured-fields": {
      "params": {
        "insured": { "schemaRef": "#/$defs/Insured" }
      },
      "node": {
        "material": "text-input",
        "bindings": {
          "value": { "source": "data", "scope": "insured", "path": "/name" }
        }
      }
    }
  }
}
```

**调用方局部别名 item ≠ 模板参数 insured**

```json
{
  "scope": {
    "from": { "source": "data", "path": "/insureds" },
    "as": "item",
    "mode": "each"
  },
  "node": {
    "$use": "insured-fields",
    "with": {
      "insured": { "source": "data", "scope": "item", "path": "" }
    }
  }
}
```

参数只承担将一个可定位的数据位置引入模板词法环境的职责。L2 检查必需参数、引用可见性、Data Schema 来源、字段路径与 Material Port 类型。相同 `$defs` 定义引用优先视为兼容；复杂组合 Schema 若不能静态证明兼容，应明确诊断，而不是伪造保证。

> **定稿边界**
> 
> Template Params 只支持 Typed Data Reference。普通 title、theme、variant 等配置值尽量通过 Material Props 或复合物料解决；不加入模板泛型、动态模板选择和隐式捕获调用方 Scope。

## Material Manifest：协议机制与物料限制分层 {#materials}

> 状态：已收敛

**外部注册契约 · 不内嵌到 FormDefinition**

```typescript
interface MaterialManifest {
  id: string;
  version: string;
  propsSchema?: JsonSchema;
  bindings?: Record<string, BindingPortContract>;
  slots?: Record<string, SlotContract>;
  events?: Record<string, EventContract>;
}
```

| 限制归属 | 示例 | 谁负责 |
| --- | --- | --- |
| L1 Protocol | bindings 必须是端口到 Data Reference；ScopeNode 合法位置 | 所有物料统一遵守 |
| Material Manifest | text-input 的 placeholder、value 类型、confirm 事件；Modal 的 trigger/content Slot | 物料注册时声明 |
| Form Definition | 18–65 周岁、证件必填、被保人最多 5 个 | Data Schema / Constraint |

**视觉/输入限制不等于业务数据校验。**例如 `maxLength` 是 TextInput 的输入体验；真正的“姓名不能超过 20 字符”仍必须由 Data Schema 或 Constraint 保证。

Web 与 Flutter 可以实现不同交互形态，但同一物料契约下的 Binding Port、Event Payload、Slot 和 Props 语义必须兼容。Form Definition 需要通过可确定的版本解析规则绑定 Material Manifest；不能依赖不受控的“latest”。

### Binding / Slot / Event 的已确认最小契约 {#material-minimum-contract}

2026-10-21 用户确认：Manifest 的 Binding 声明名称及预期数据 Schema，不声明 read / write / read-write 权限。Binding 表达物料使用哪些数据位置；实际读取、受控写入或只读展示由物料行为决定，单字段与多字段沿用同一具名映射和共用 Adapter，不增加独立字段端口层。

Binding 的 Schema 用于 Compiler 检查数据模型与物料的静态类型兼容性，不在每次修改时拦截业务不合法 Working Data，也不替代业务 data.schema / Constraint。概念子类型可写为下例；包装和正式命名随完整类型固化，不把语义确认解释为已发布类型。

```typescript
interface BindingContract {
  schema: JsonSchema;
}
interface EventContract {
  payloadSchema?: JsonSchema;
}
```

Slot 首期仅声明接受的名称，不引入通用数量限制；原“Manifest 约定单个 / 多个节点”的候选收敛为名称检查。MaterialNode 的 slots 继续是具名 ViewNode 数组，Manifest 的名称容器及 SlotContract 占位随正式类型整理，不继续增加基数字段。

Event 声明事件名称；无业务数据的通知事件只需名称，有业务数据供配置读取的事件声明 Payload Schema。Event Reference 相对该次事件的 Payload 根解析，Compiler 检查引用路径和后续可证明的类型连接；缺少 Payload 契约不能静默当作任意可读事件数据。事件只在事件发生时求值，不隐式建立数据观察或触发规则。

物料内部通过现有受控接口执行数组 Command 或取得已有能力，无须重复登记为一份“数组 / 纯函数能力事件目录”；组件内部实现与对配置暴露事件分开。普通 Binding 修改不要求额外发事件重复写入。Event 保持无返回通知；需要返回值时使用独立 Request 通道，见[物料请求](#material-requests)。不增加异步业务编排协议；Payload 是物料发出的数据，也是配置处理逻辑收到的输入。

## Interaction：通知命令、宿主事件与独立请求 {#interaction}

> 状态：已收敛

**受限 Event → Intent**

```typescript
type InteractionIntent =
  | { type: 'form.command'; command: Command }
  | { type: 'host.emit'; event: string; payload?: ValueSpec };
```

**按钮语义事件与宿主能力连接**

```json
{
  "material": "button",
  "props": { "label": "提交" },
  "on": {
    "activate": {
      "type": "host.emit",
      "event": "insurance.submitRequested"
    }
  }
}
```

普通输入更新首先通过 Binding Port，不应同时要求 `on.change → form.command` 再写一次。Material 的打开、关闭、滑动、焦点、动画等属于其内部行为。

事件映射中的 Command / Host Payload 仅在事件发生时求值。L2 可提取读取信息用于校验和准备，但不将这些读取自动转成事件触发依赖；年龄被 Payload 读取，不意味着年龄变化会自动发出该事件。

历史方案 · 不采用`view.present → mode: modal / drawer`

增加 View Controller、实例管理和 Presentation 契约，与容器物料职责重叠。

最终方案 · 采用`modal / drawer / bottom-sheet Material`

容器物料通过 Slots 组合已有 View Template，自行管理局部交互。

## Host Integration：明确三条路径 {#host}

> 状态：已收敛

| 场景 | Definition 表达 | 外部负责 |
| --- | --- | --- |
| 外部 Constraint | `kind: external` + watch + requiredForSubmit | 注册校验器、请求、上报状态与当前结果 |
| 用户触发外部业务 | `on → host.emit` | 根据事件契约执行业务流程 |
| 物料 Request | Material 请求声明、页面映射与 Host 输入输出签名 | JSON 候选项、详情；具体文件传输归平台实现 |

Host 异步响应后如果需要改变表单数据，应该调用 Runtime 的受控 Command API；Definition 不需要表达异步 Promise 链、请求重试或服务编排。授权与最终数据安全仍由 Host/服务端负责，不能因为表单本身有前端校验就直接信任提交结果。

### 静态连接的可证明边界

Template 参数 / Binding Port 的连接必须在已支持的可判定子集中证明兼容；不兼容及无法证明均在配置 / 编译时拒绝，诊断区分原因。不提供强制断言或运行时兜底绕过该连接检查。Props 字典按 Manifest 检查，协议节点严格性不等于禁止所有业务自定义键。详见 [L1 固化契约](08-decisions-release.md#strict-contract)。

### bindings 与组件 Adapter 的关系

bindings 是组件使用数据位置的具名配置映射，不是一个新增运行时“字段端口”层。Adapter 订阅 Runtime、读取相关状态组装组件 Props，并按配置将组件事件转换为既有指令；框架负责组件更新与内部比对。现行具名映射形状保持不变，后续如有协议变更需另行确认，不因术语澄清删除既有字段。


## 物料请求与 Host 输入输出 {#material-requests}

2026-10-21 用户确认：物料发起需要结果的交互，经页面映射到 Host，由公共 Adapter 桥接结果；不要求逐物料工厂或包装。Event / on 仍是无返回通知，可执行已有 Command 或 host.emit；Request / requests 是一次调用、一次结果的独立通道。请求不进入 Reaction 或 Validator Pending，不增加网络 Command、异步 Pure Function、自动回填或通用 Workflow。

### 声明与页面映射

MaterialManifest.requests 是物料请求名到 RequestContract 的字典，每项包含 payloadSchema、resultSchema 和可选 concurrency（latest / parallel，默认 latest）。输入输出都是 JSON；没有输入可声明 null。Schema 只描述业务值，不包含调用状态包装。物料名称与 Host 名称独立；页面实际使用物料时，其声明的所有请求必须配置映射，首期不设 optional。仅向 Registry 注册或加载物料包不触发请求接入要求。

MaterialNode.requests 把物料请求名映射为 `{ type: 'host.request', request: string, payload?: ValueSpec }`。省略 payload 时原样转发物料输入；显式配置时仅在调用发生时求值，复用 event 引用读取本次物料输入，也可组合当前 data / context。不自动建立观察，不因引用数据变化重发请求。首期不增加响应转换表达式，Host 返回物料要求的结构。

```json
{
  "material": "address-picker",
  "bindings": { "value": { "source": "data", "path": "/address" } },
  "requests": { "search": { "type": "host.request", "request": "searchAddress" } }
}
```

HostContract.requests 声明 Host 请求名及 payloadSchema / resultSchema；实际函数在 Host SDK 注册，接收输入并返回值 / Promise。Host 只处理业务调用与结果转换，不必了解物料实例、Binding 或表单写入。网络鉴权、缓存、重试、防抖仍归具体实现。File、DOM 对象等不直接作为跨平台 JSON 参数，文件传输留给平台实现。

### 结果与写入职责

公共桥接返回 success（value 为业务结果）、error（error.code 与可选 message）或 discarded。未绑定 / 未注册须提前在编译或装配阶段报错；若仍发生调用，返回明确局部 error。输入输出不满足契约、业务调用失败同样为局部 error；被替代或实例失效为 discarded。Host 同步异常 / Promise 拒绝统一进入错误处理，用户端不暴露堆栈等技术细节。函数、Promise、取消句柄及桥接调用状态是运行时 SDK 对象，不进入可序列化协议。

搜索候选项保留在物料局部 UI 状态，用户选中后经既有 Binding / Command 写入 Runtime。返回值不会自动写表单；需要写入时由物料消费结果并使用已有受控写入能力。不得绕过 Store 权威入口，也不增加“请求完成执行 Command 列表”的编排。

### 并发、有效性与生命周期

latest 以实际物料挂载实例 + 请求名称为范围，旧调用立即失去交付资格并结算 discarded；parallel 各调用独立交付。不同物料实例互不取消。卸载、改绑、数组成员删除或实例替换使旧调用失效；数组移动且身份保持时保留归属。桥接交付成功或失败前核对有效性；可选取消仅为资源优化，取消异常不恢复旧调用资格。底层无法取消也不能交付迟到结果，失效调用不得悬挂等待网络。

桥接不推断 props 或请求参数背后的隐式依赖。国家变化后城市查询失效等行为，由物料通过公共取消接口或重新请求处理。具体取消句柄和调用签名在所属 Adapter / SDK 落实，不新增跨语言取消信号协议。该通道不纳入完整校验等待，不改变 Host Validator 的任务有效性规则。

### 编译、Prepared 与边界校验

Compiler 检查请求名、引用和有限结构类型连接；方向是物料输入经映射后满足 Host 输入，Host 结果满足物料结果。无法证明时给诊断，不声称已实现任意 Schema 包含证明。无 HostContract 时仍提取 Requirements 并报告无法证明的兼容性，不认定实现必然缺失。页面所用物料缺少声明请求的映射时，Compiler 报 Error 并定位节点 / 请求名，不生成可执行 Prepared。Host 实现注册完整性在装配阶段核对，缺失时对应物料进入明确错误状态，不能等第一次调用才发现，也不默认停止其他物料。

PreparedMaterialNode.requests 保存已解析映射及显式并发策略；PreparedForm.resources.requestSchemas 是独立闭合 Schema 资源表，协议类型与派生 Schema 已从旧 PreparedViewPlan 位置迁移。映射中的 payloadSchemaRef / resultSchemaRef 指向物料输入及结果契约，hostPayloadSchemaRef / hostResultSchemaRef 仅在有 Host 静态契约时存在；引用是资源 ID，不是数据 Pointer。HostRequirements.requests 按 Host 名称聚合 nodeIds，节点关联具体签名。Compiler 必须验证资源和节点引用闭包，结构 Schema 本身不证明引用存在。

运行时只使用 Prepared。对物料输入、映射后的 Host 输入（有静态契约时）、Host 输出（有静态契约时）和物料期望结果进行小范围检查；校验器按契约预编译复用，不在每次调用重新编译，更不重复全量协议校验。这不禁止 Working Data 暂时无效，输入错误只影响本次请求。

MaterialManifest.services、HostContract.services 及 Prepared HostRequirements.services 退出正式协议；Host 内部服务组织不受约束。已有通知不变；旧 services 配置须显式迁移到页面 requests 映射，不能按名称自动猜测。Prepared 新增必填空字典 / 数组须同步生产者消费者及格式兼容判断，不虚构已发布版本。

实现验收覆盖名称解耦、显式与直通参数、Schema 错误、未绑定 / 未注册、同步异常、异步拒绝、latest 后发先至、parallel、卸载 / 改绑 / 数组移动删除及取消失败。当前协议类型与结构测试不证明桥接运行时已实现。


### 请求开发接入与缺失诊断验收 {#request-development-contract}

2026-10-21 用户进一步确认：交付目标必须贯通“物料公开请求类型 → Host 实现 → 注册 → 页面映射 → 编译 / 装配核对”。仅提供 Manifest Schema 或各端各自声明类型不足以证明完整接入。以下为实现目标，尚未实现对应 SDK 或 Compiler。

物料公开每个请求的输入输出类型及可关联的契约；物料侧桥接以该契约约束请求名、输入和成功结果。Host 编写处理函数时可直接引用物料请求契约，自动得到参数提示与返回类型检查，不要求重抄签名或逐物料包装。直接转发时复用物料契约；页面转换输入时 Host 使用自己的明确输入契约，Compiler 检查映射结果到 Host 输入、Host 输出到物料结果的有限结构连接。首期没有结果转换 DSL。TS 类型与 Schema 保持同源；自动推导或公开显式类型的工具方式留给实现选择，公共辅助函数名称尚未冻结。

静态已知页面与注册集合的装配接口应提供必需请求名的类型约束，缺少处理函数、输入或返回类型不匹配时给 TS 编译错误。动态加载 JSON 无法由 TS 提前推导全部请求，因此必须提供编译 / 装配检查，不用泛型断言伪造保证。HostContract 可选并不使实际实现注册变成可选。

| 检查点 | 实现目标与验收 |
| --- | --- |
| 开发类型 | 可发现请求名及输入输出；错误参数、错误返回值，以及静态可知的缺失注册产生类型错误 |
| 页面编译 | 实际使用物料时，声明请求全部必须映射；漏项产生 Compiler Error，包含节点 / 请求名 / 来源位置，不生成执行制品 |
| 页面装配 | 按所选 Prepared 的 HostRequirements.requests 在交互可用前核对实际处理函数；缺失时对应物料不可交互并展示错误，开发环境指出物料、请求名、Host 注册名及配置位置 |
| 调用兜底 | 绕过预检或运行期间实现失效仍返回 error，不回传空结果或假成功；不拖到调用时才做首次完整性检查 |
| 隔离范围 | 仅加载 / 注册但页面未使用的物料不要求 Host 接入；已进入 Prepared 的物料请求不因暂时隐藏、未挂载或未点击而免检 |
| 错误展示 | 开发者在页面与诊断中明确发现遗漏；生产端展示局部不可用的业务提示，不暴露内部名称 / 堆栈；其他可用物料继续工作 |

以上替代此前“声明不强制页面映射、未绑定等到调用时报错”的规则。MaterialNode.requests 仍为可选字段，因为无请求物料可省略，通用 JSON Schema 也不能独立获知外部物料声明；完整性由拥有 Catalog 的 Compiler 检查，不以结构校验通过代表接入完成。
