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
  - ADR-FE-003
  - ADR-FE-005
sources:
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

Binding 与动态 Props 的依赖由 L2 静态编译；L4 以 Prepared View 计划和当前 Scope 通过 L3 subscribe 接入，挂载时订阅、改绑时更新、卸载时释放，不另做 AST 解析或变化匹配。Field State 与 Validation State 仍由 L3 提供，运行时状态观察不扩展 L1 Binding 的 DataReference 类型。动态表达式求值通过统一能力或共享适配契约完成。

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

所有 Slot 在 Canonical 都使用数组；`children` 可作为 `slots.default` 的 Authoring 简写。Manifest 声明哪些 Slot 合法、各自允许一个或多个 ViewNode，以及 Material 对这些 Slot 的具体交互含义。

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

## Interaction：只保留数据命令和宿主事件 {#interaction}

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
| 自定义物料服务 | Material Binding/Props 和外部注入服务契约 | 远端选项、文件上传等私有物料服务 |

Host 异步响应后如果需要改变表单数据，应该调用 Runtime 的受控 Command API；Definition 不需要表达异步 Promise 链、请求重试或服务编排。授权与最终数据安全仍由 Host/服务端负责，不能因为表单本身有前端校验就直接信任提交结果。

### 静态连接的可证明边界

Template 参数 / Binding Port 的连接必须在已支持的可判定子集中证明兼容；不兼容及无法证明均在配置 / 编译时拒绝，诊断区分原因。不提供强制断言或运行时兜底绕过该连接检查。Props 字典按 Manifest 检查，协议节点严格性不等于禁止所有业务自定义键。详见 [L1 固化契约](08-decisions-release.md#strict-contract)。

### bindings 与组件 Adapter 的关系

bindings 是组件使用数据位置的具名配置映射，不是一个新增运行时“字段端口”层。Adapter 订阅 Runtime、读取相关状态组装组件 Props，并按配置将组件事件转换为既有指令；框架负责组件更新与内部比对。现行具名映射形状保持不变，后续如有协议变更需另行确认，不因术语澄清删除既有字段。
