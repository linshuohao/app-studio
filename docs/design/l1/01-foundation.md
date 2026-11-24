---
id: L1-FOUNDATION
title: L1 模型、边界与顶层结构
type: protocol
status: active
layer: L1
modules:
- M01
- M02
tags: []
related:
  decisions:
  - ADR-FE-020
  - ADR-FE-001
  - ADR-FE-004
sources:
- SRC-REACTIONSTATE
- SRC-L1
navigation:
  group: 02 · L1 协议
  order: 31
last_reviewed: '2026-10-19'
reading_next: L1-DATA-SCOPE
relocated_sections:
- source: docs/design/architecture.md
  anchor: definition
  target: definition
---

# L1 模型、边界与顶层结构

L1 定义表单的声明式业务模型。本篇先给出本层的目标、概念关系与顶层结构；数据、规则、视图等详细契约由后续主题分别说明。

## L1 · Definition：领域模型与协议层 {#definition}

L1 决定配置者需要理解多少概念，以及新业务需求是否会不断迫使协议膨胀。优先追求语义清晰、可组合、可静态检查和简单场景低成本。完整定义、类型关系、例子与决策理由集中在 [L1 Definition Protocol ](README.md)，本节展开它在整体架构中的作用。

### 服务对象与核心目标

| 服务对象 | 需要的能力 |
| --- | --- |
| 业务配置者 | 简单地表达字段、展示条件、同步联动与合法性 |
| 可视化设计器 | 创建、定位、组合、编辑和检查配置节点 |
| Preparation | 将声明规范化并解析为可检查、可准备的结构 |
| Runtime / Renderer | 在一致语义下执行数据规则并消费视图定义 |

### 领域概念如何组合

```diagram
{
  "id":"figure-definition",
  "title":"图 2 · Form Definition Domain Model：当前语义概念的组合",
  "rows":[
    [{"title":"FormDefinition","body":"一份共享业务定义，可通过具名 Profile 选择不同视图","major":true}],
    [{"title":"Data / JSON Schema","body":"数据形状、静态约束、默认值与输出契约"},{"title":"Reference / Scope","body":"统一寻址、局部词法绑定；稳定实例身份归 L3"}],
    [{"title":"Expression / ValueSpec","body":"纯 AST、命名表达式与递归显式 $expr"},{"title":"Constraint","body":"内部断言、外部校验义务与 Issue 归属"}],
    [{"title":"Command / Reaction","body":"受控数据修改与 watch / when / then 同步联动"},{"title":"View / Template","body":"MaterialNode、ScopeNode、TemplateUse；Props、Bindings、Slots、Events"}]
  ],
  "arrows":["↓","↕","↕"],
  "note":"这是概念关系图，不增加 FormDefinition 顶层字段。最初图中的独立 Resource 已由后续决策移出核心，外部能力通过 Host 集成。"
}
```

Data 与 View 在语义上分离，在设计器中可以统一编辑。用户添加一个“年龄输入框”时，工具可以同时创建数据字段和物料节点；两者仍有不同身份。这支持一个字段被输入框和摘要同时消费，也支持日期范围、地址等一个物料绑定多个数据位置。

- JSON Schema 定义数据结构与基础约束；Working Data 可暂时不合法；业务输出转换与检查归 Host。
- Reference 统一寻址；ScopeBinder 建立词法名称。ScopeHandle 用于实例命令，模板参数传 Typed DataReference，不能把 Handle 当作业务 ID 发送给服务端。
- Expression 为纯 AST，ValueSpec 通过显式 `$expr` 递归嵌入计算。Constraint 不写数据，Reaction 的变化传播消费显式 Data / Validation 观察目标；显式首次激活是独立入队原因，不是外部异步业务 Reaction。
- View 由 MaterialNode / ScopeNode / TemplateUse 构成；具名 Profile 的值直接为 ViewNode，共享业务规则不因隐藏或 Profile 切换而裁剪。
- Canonical 使用具名 `bindings` 和数组 `slots`；`bind`、`children` 只属于 Authoring 简写。

`protocolVersion`、`id`、`version` 与 `metadata` 合并展示为“定义信息”仅是阅读分组，字段仍在顶层。Profile 名 `default` 与物料 `slots.default` 分属不同层次。

### 配置友好与语义严谨的取舍

| 设计问题 | 当前方向 | 取舍理由 |
| --- | --- | --- |
| 数据与 UI | 语义分离，设计器可合并编辑体验 | 数据不受控件树限制，支持多视图与复合端口 |
| 表达式 | 纯 AST + 受控 Pure Function | 可静态分析并约束跨端求值，避免任意脚本 |
| 展示派生与数据修改 | Expression 计算；Command / Reaction 显式修改 | 避免为了显示信息复制一份业务状态 |
| 业务合法性 | Schema + Internal / External Constraint | 不把合法性藏在组件 Props 中 |
| 结构复用 | 静态 Template + `schemaRef` / DataReference 参数 | 复用视图而不共享 UI 实例或复制业务数据 |
| 外部业务 | Host 三条集成路径 | 不把请求、重试、上传和提交扩展成核心 DSL |
| 数据标准 | 复用 JSON Schema，独立表达交互 | 数据约束标准化，表单交互保留必要语义 |

配置者可以表达“未满 18 岁时显示监护人姓名，并要求填写”，但底层必须区分展示和合法性：

```text
纯表达式：isMinor = age < 18
View Props：guardianName 的显示条件读取 isMinor
Constraint：isMinor 为 true 时，guardianName 必须非空

显示/隐藏不会自动删除数据，也不会取消共享 Constraint。
如需清空某个业务字段，应由明确的 Reaction / Command 表达。
```

字段缺失、null、空字符串、空数组和无法解析的输入需要明确的数据语义；不能交给不同组件各自决定。Definition 不描述内部队列、Dirty Set、网络调度器或 UI 订阅机制。

**本层详细设计交付物：**Canonical Type、JSON Schema、Reference / Union / Literal 消歧、Pure Function 与 Material 版本契约、正反例及兼容规则。架构收敛不等于这些发布产物已经完成；具体清单见 [待固化事项](08-decisions-release.md#boundaries) 与 [发布验收](08-decisions-release.md#release)。

## 当前共识与设计状态 {#summary}

> 状态：主体方向已有共识，具体契约仍需固化

L1 面向复杂表单的声明式 Definition Protocol，不建设通用应用 DSL。Data、Reference、Scope、Expression、Constraint、Command、Reaction、View、Material 与 Host 的责任边界已有共识。

当前并行开展设计与实现：TS 协议 / Schema、Compiler、Runtime、React Renderer 与首批资产已有本地实现证据；尚无正式对外发布和完整生产验收。已有共识是后续设计前提；需要改变时应提出具体冲突、记录决定并同步相关契约，不能因局部讨论更晚就自动覆盖。

**已确认**表示有明确讨论依据；**待固化**表示方向明确但类型、语法或接口尚未闭环；**推荐**与**候选**表示仍需评估。示例和类型概念稿不代表机器契约已验收。未决问题统一见[设计进展](../governance.md#layer-progress)，取舍过程见[讨论演进](../design-history.md)。

## 设计目标、边界与硬约束 {#principles}

> 状态：已收敛

- **唯一业务数据源：**一个 Form Instance 只有一份权威 Working Data；视图复用不复制业务数据。
- **跨端共享业务语义：**Data / Rules 不依赖 Web、Flutter、Modal 或 Drawer。
- **协议只承载稳定语义：**复杂视觉与内部交互交由 Material，外部请求与业务流程交由 Host。
- **可静态分析：**引用、表达式和指令受到约束；不接受任意 JS 函数、动态路径拼接和通用工作流。
- **默认使用成本低：**简单表单只应需要 Schema + Material View + Binding；复杂场景按需引入 Scope、Reaction、Template。

| L1 应表达 | 不属于 L1 Definition |
| --- | --- |
| 数据形状、字段引用、作用域 | 数据存储结构、字段状态机具体实现 |
| 纯表达式、约束、同步联动、受控指令 | 求值调度、事务与通知算法 |
| 物料结构、端口绑定与语义事件映射 | DOM、Portal、焦点、滚动、局部 UI State |
| 外部校验义务 | 实际 API、网络请求、重试、提交流程 |

## 四层架构与外部契约 {#architecture}

> 状态：已收敛

| 层级 / 外部契约 | 职责 |
| --- | --- |
| L1 · **Definition** | Schema · Reference · Scope · Expression · Constraint · Reaction · View |
| L2 · **Preparation** | 规范化 · 静态检查 · 递归读取 / 触发分析 · Dependency Plan · Profile 准备 |
| L3 · **Form Runtime** | 唯一 Working Data · 统一变化匹配 / 订阅 · Command · Reaction · Validation · Field State |
| L4 · **Renderer & Material Adapter** | UI 树 · Material 实例 · Binding 连接 · 挂载 / 改绑 / 释放订阅 · 局部交互状态 |
| **Material Registry** | Props / Bindings / Slots / Events 契约与实现 |
| **Host** | 初始化 / 外部校验 / 业务事件 / 提交 |

Material Registry 和 Host 是外部能力边界，不是要往 `FormDefinition` 顶层增加 `services` 或 `resources`。L1 可以声明需要哪些能力，但不需要把实现细节写进业务配置。

## 核心规则速查 {#decisions}

> 状态：已收敛

| 编号 | 模块 | 最终决定 | 说明 |
| --- | --- | --- | --- |
| D1 | Data | **JSON Schema + 唯一 Working Data** | 允许临时不合法值；业务输出转换与检查归 Host |
| D2 | Reference | **结构化 Reference** | 根路径字符串是 Authoring 简写 |
| D3 | Scope | **局部 ScopeBinder · one / each** | 无全局 Scope Registry；数组项身份统一管理 |
| D4 | Expression | **纯 AST + 递归 $expr** | 动态 JSON 值由显式包装识别 |
| D5 | Constraint | **Internal / External** | 内部 when + assert 推导；外部 watch 合并 when，声明失效义务，不编排请求 |
| D6 | Command | **有限数据修改集合** | 有效修改即时生效，batch 默认有序非原子；不等于任意 Action 脚本 |
| D7 | Reaction | **watch / when / then，最新状态收敛** | 同实例 pending 可合并，显式首次激活可配置；变化传播按显式 Data / Validation 观察，不按触发次数记账 |
| D8 | View | **Material / Scope / TemplateUse** | 每个 Profile 直接对应 ViewNode |
| D9 | Binding | **Canonical: bindings 端口映射** | 不增加 read/write/validationBind |
| D10 | Slots | **Canonical: slots** | children 是默认 Slot 简写 |
| D11 | Template | **Typed Data Params** | schemaRef 复用 Data Schema；with 传 Data Reference |
| D12 | Interaction | **form.command / host.emit** | view.present/dismiss 不进入核心 |
| D13 | Material | **物料自有能力限制由 Manifest 定义** | 协议统一机制，Manifest 定义具体端口和类型 |
| D14 | Host | **外部业务能力不内嵌** | 网络、上传、提交都在 Host / 自定义物料服务中 |
| D15 | 实例与业务生命周期 | **L3 管实例创建 / 替换 / 销毁，Host 管编辑 / 基准 / 恢复意图** | Reset 生成普通 Command，不自动建 Baseline 或标 Dirty，不定义生命周期脚本 |
| D16 | 跨层依赖 | **Read / Watch / Subscription 分离** | L2 编译，L3 匹配，L4 按挂载订阅；调度 / ABI 仍待固化 |
| D17 | 编译执行边界 | **L1 原始定义 / PreparedForm 分工，L3 只消费 Prepared** | 编译建议经作者确认回写；不静默替换 watch 或不兼容时回退解释 L1 |

## 唯一 FormDefinition 顶层结构 {#top-level}

> 状态：已收敛

**架构定稿 · 顶层字段**

```typescript
interface FormDefinition {
  protocolVersion: string;
  id: string;
  version: string;

  data: { schema: JsonSchema };
  expressions?: Record<string, Expression>;
  constraints?: Constraint[];
  reactions?: Reaction[];
  views: Record<string, ViewNode>;
  viewTemplates?: Record<string, ViewTemplate>;
  metadata?: Record<string, JsonValue>;
}
```

文档展示将 `protocolVersion`、`id`、`version` 与 `metadata` 合并为“定义信息”。这只是阅读分组，不新增 basicInfo 字段；这些字段仍处于 FormDefinition 顶层，metadata 仍只承载非执行性元数据。

业务规则处于 Form Definition 级别，不能因为切换 View Profile 或某字段暂时隐藏就失效。`metadata` 只用于非执行性元数据，不能通过它绕过已确定的协议语义。

> **明确不增加的顶层域**
> 
> `actions`、`behaviors`、`resources`、`services`、`submissionWorkflow`、`presentation`、`validationState`、`scopes` 不进入 核心。

## Canonical、Authoring、Prepared 的分离 {#representations}

> 状态：已收敛

| 形式 | 定位 | 示例 |
| --- | --- | --- |
| Canonical Protocol | 唯一正式结构：机器验收与交换 | `bindings.value = {source:"data",path:"/name"}` |
| Authoring Syntax | 可选的书写简化，不扩展语义 | `bind: "/name"`；`children: [...]` |
| Prepared Representation | L2 编译后协议，可独立交付 / 缓存，非 L1 定义的一部分 | 确定观察与执行计划、能力绑定、索引及 Profile 选择 |

遵循“一种语义，一种 Canonical 形式”。有简写也不能把简写当成第二套协议。跨端传递、规范校验和文档样例均应优先使用 Canonical。

明确业务原始定义与编译后 PreparedForm 两份结构、Runtime 唯一消费 PreparedForm 的执行路径。Canonical / Authoring 不因此各自成为一份业务协议；Prepared ABI 与 L1 Protocol 分别版本化。不兼容时不静默回退直接解释 L1，编译建议也不在运行时改写 watch，见 [跨层双结构契约](../dependency-reactivity.md#dependency-compiled-protocol)。
