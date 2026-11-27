---
id: DESIGN-L4
title: L4 呈现与交互适配
type: design
status: active
layer: L4
modules:
- M14
tags: []
sources:
- SRC-OBSERVABILITY
- SRC-ASSETDESIGN
- SRC-DEVTOOLS
- SRC-L4IMPLEMENTATION
- SRC-REACTIONSTATE
- SRC-L3BASELINE
- SRC-COMPILERIO
- SRC-EARLY
- SRC-DEP
related:
  decisions:
  - ADR-FE-025
  - ADR-FE-024
  - ADR-FE-023
  - ADR-FE-022
  - ADR-FE-020
  - ADR-FE-018
  - ADR-FE-019
last_reviewed: '2026-11-08'
navigation:
  group: 05 · L4 呈现
  order: 60
reading_next: DESIGN-INTEGRATION
relocated_sections:
- source: docs/design/architecture.md
  anchor: renderer
  target: renderer
---

# L4 呈现与交互适配

L4 完整方案与四批实施已于 2026-10-26 经用户确认，已确认以组件 Adapter 订阅 Runtime、组装 Props、将事件转换为指令；共用接入、输入交付、组件生命周期和物料错误隔离已确认，行为专题已收敛；TS / React SDK、必要 Runtime 接缝及四批实现已有本地验证，该 SDK 批次本身不覆盖正式资产、真实 Host 应用、Flutter 与生产性能。下文旧接口草图仅为来源追溯，不是现行 SDK 要求。完整模块方案对应 [T11](governance.md#T11)，本专题已收敛并有 React 主端纵切证据；当前待讨论的问题统一维护在[设计进展](governance.md#layer-progress)。

2026-10-27 后续[正式物料 / 业务函数方案](extension-integration.md#first-assets)已确认，模板 / 版本工具先行；2026-10-28 工具第 0 批与首个函数已有[本地实施证据](engineering.md#asset-tooling-implementation)，首批全部 14 个正式 UI 物料亦有[本地证据](engineering.md#interaction-materials-implementation)，第 4 批全部 7 个同步函数及完整可控表单亦有[本地证据](engineering.md#business-travel-implementation)，真实 Host 待交付。现行 SDK、状态所有权、非原子交付和独立 DevTools 保持，具体交互及 Host 验收回到该资产专题，不再写作整套方案尚待讨论。

## L4 · Renderer：呈现与交互适配层 {#renderer}

Renderer 应当轻量，但不能薄到只有 `componentMap[name]`。真实接入还包括值适配、输入事件、校验展示、订阅、焦点、平台与组件生命周期。

### 呈现与输入交付 {#renderer-assembly-flow}

```diagram
{
  "id": "figure-renderer-assembly-flow",
  "title": "React Renderer 如何连接已编译视图、Runtime 和物料",
  "rows": [
    [{"title": "Prepared 的目标视图", "body": "提供 MaterialNode、ScopeNode、TemplateUse 和已准备的依赖"}, {"title": "Host 提供实例与注册表", "body": "提供 Runtime、物料实现与请求处理器"}],
    [{"title": "FormRenderer 装配视图树", "body": "按目标视图展开节点与插槽，关联 Scope、解析物料身份并建立错误隔离"}],
    [{"title": "共享 Adapter 与物料", "body": "Adapter 订阅读取当前值、动态属性与校验；物料处理输入、焦点与本地交互", "major": true}],
    [{"title": "数据交付", "body": "可写绑定通过 Command 回到 Runtime，再经订阅读回最新数据"}, {"title": "外部请求", "body": "声明的请求交给 Host，已卸载或改绑的接入不消费迟到结果"}]
  ],
  "arrows": ["装配输入", "按当前 Scope 连接", "用户操作"],
  "note": "挂载时建立订阅，改绑时替换旧订阅，卸载时释放。以确认型日期范围为例，浮层中的临时日期在确认后才交付。"
}
```

实现入口见 [FormRenderer](../../packages/renderer-react/src/renderer/form-renderer.tsx)与 [共用 Adapter](../../packages/renderer-react/src/adapter/use-material-adapter.ts)。日期范围的完整契约与验证见[开发者指南](usage-guide.md#usage-material-example)。

### 已确认的组件接入原则

本节表达式粒度按 [ADR-FE-017](decisions/ADR-FE-017-compiler-io.md)修订，组件仍是生命周期接入单位；旧“不新增属性级准备”限制不再阻止完整 $expr 的独立 watch。其余状态归属、物料 / Adapter 分责、事件和错误隔离原则继续有效。

L4 以物料组件和共用 Adapter 为接入单位。Adapter 按 Prepared 配置与当前 Scope 订阅 Runtime 提供的相关状态变化通知，读取当前值、校验结果及动态配置并组装组件 Props；动态 Props 按完整表达式保存 watch，各自失效和复用有效结果，不能因一个输入变化全部重算组件表达式；组件渲染与内部差异比较仍交平台框架，不新增字段 Controller 或承诺固定 DOM 更新粒度。通知用于重新读取权威状态，不是要求 L4 重放事件以维护第二份业务数据。

组件接收的表单业务数据与校验状态以 Runtime 为唯一权威来源；事件经 Adapter 转成既有 Command 调用 Runtime，数据更新再经订阅反馈到 Props。局部框架缓存只是当前 Props 的呈现，不是独立业务 Store。组件可持有焦点、输入法组合态、展开 / 收起等内部交互状态，其交付边界按下方输入交付原则：确认时写入，编辑结束以 Runtime 为准。Host 业务操作仍由既有 host.emit 路径交给 Host，不将所有事件一律变成数据 Command。

保留既有 bindings 作为“组件使用哪些数据”的具名映射，不新增所谓字段端口、端口级 Controller 或独立匹配引擎。单字段或多字段控件都由 Adapter 将相关数据组织成实际组件 Props，并将组件事件映射为受控指令。Renderer 负责物料树的装配，组件 Scope 关联、监听 / 回调释放及数组视图生命周期统一归共用 Adapter，不强制拆出 View Controller / Binding Controller 类或固定包层次。

### 职责整理（具体拆分待讨论）

| 模块 | 职责 |
| --- | --- |
| Form Renderer | 消费当前 Profile 的 ViewNode，组织整体物料树 |
| 共用 Adapter | 按统一约定订阅 / 读取 Runtime 状态，传入 Props、提供指令能力及管理订阅生命周期 |
| 物料注册与实现查找 | 将确定的物料契约与版本映射到平台物料组件，不注册物料专属 Adapter |
| Container / Slot Composition | 组合布局、分组、步骤、弹层及复合物料 |
| Scope 关联 | 共用 Adapter 将组件实例关联当前 Scope，处理移动保留、删除 / 替换失效 |
| 平台框架适配 | 承接组件挂载、订阅释放与原生交互差异，不控制框架内部差异比较 |

ViewNode 只有 MaterialNode、ScopeNode 和 TemplateUse。具名 Profile 直接对应 ViewNode，不使用 `entry` 包装。Template 静态 `$use`，参数传 Typed DataReference；共享结构不共享组件实例、UI State 或额外业务 Store。

### View 订阅的激活与释放

采用 L2 编译 + L4 挂载订阅：L4 通过 L3 的统一 API 使用 Prepared View 计划，不自行解析 AST；L3 不在初始化时预注册所有 View。全部预注册会增加隐藏和虚拟节点成本，各 Renderer 自行分析则重复编译并造成跨端语义差异，完整比较见 [跨层视图方案](dependency-reactivity.md#dependency-view)。

Mount 绑定 Scope、建立订阅并取得最新状态；Update 重读或在计划 / Scope 改绑时替换旧订阅；Unmount 释放 View 观察与局部状态。父级可见性观察者必须存活才能创建尚未挂载的子树；虚拟列表只订阅可见行，L3 业务规则始终按实例生命周期生效。Profile 切换不重建共享校验义务。

动态 Props 经统一 Prepared 求值能力或共享契约读取；每个响应式 $expr 包装携带 watch，递归运算子不单独订阅。共用 Adapter 为每个表达式关联当前 Scope、结果和可释放观察，输入无关时不重算；Binding 沿用本身引用，真实业务数据与校验状态仍只来自 Runtime。框架 Store Adapter 保证订阅、首次读取和改绑交接不漏更新，首期读取 API、缓存与比较实现见本篇 React SDK 与实施证据，其他目标端按相同行为继续验收。不新增 FieldController；事件 / 请求 Payload 与 Command 值不自动订阅。

### 原字段控制器接口草图（不作为现行接口要求）

以下原始草图保留追溯；本轮已改为组件 Adapter 接入，不采用它作为强制字段抽象或新增层。不能据此要求每个输入再包装一个控制器：

```typescript
interface FieldController<T> {
  readonly id: string;
  getSnapshot(): FieldSnapshot<T>;
  subscribe(listener: () => void): () => void;
  change(value: T): void;
  blur(): void;
}
```

实际需要定义的是 Adapter 如何取得组件所需 Props、处理事件、关联 Scope、释放订阅与呈现错误；具体交互回调由物料内部适配第三方组件，接入共用指令约定，不能由上述草图反推新的运行时元状态。组件不能直接写内部 Store。

普通输入事件由 Adapter 根据 bindings 转成受控修改，不另设“字段端口”执行体系，也不额外重复要求 `on.change → form.command` 写入。业务按钮使用受限 `form.command` / `host.emit`；容器 Material 自主管理开闭、Portal、焦点和动画，不引入核心 `view.present/dismiss`。

### 关键取舍与跨端一致性

| 问题 | 方向 | 原因 |
| --- | --- | --- |
| 通用视图与分端呈现 | 共享业务定义，按 Profile 选择物料树 | 语义一致，同时允许平台体验不同 |
| 组件直连 Runtime | 经受控 Binding / Adapter 接入 | 不暴露依赖图和可变 Store |
| Renderer 保存字段值 | 不保存第二份权威数据 | 防止状态分裂 |
| 组件局部状态 | 允许输入法组合态、焦点、未确认选择和开闭 | 确认后写 Runtime；编辑结束以 Runtime 为准，不建立引擎临时数据层 |
| 组件与数据关系 | 一个组件可使用一个或多个数据位置 | Adapter 组织组件 Props 和事件，不新增字段端口概念 |
| 更新方式 | 组件 Adapter 订阅相关 Runtime 通知并读取 Props | 框架负责组件渲染和内部比对，不新增更新粒度协议 |
| 首版多端 | 先验证主目标端，再做同语义契约测试 | 控制交付成本，避免只统一外观 |

| 必须一致 | 允许不同 |
| --- | --- |
| 值类型、Reference、序列化与提交结构 | 组件视觉、布局与动画 |
| 共享 Constraint / Reaction 的业务结果 | 错误和 Loading 的展示方式 |
| 数组身份与数据操作语义 | 框架的组件实例实现 |
| 当前适用规则与 Field State 的消费含义 | 平台原生控件和局部交互 |

跨端首先要求同一数据、上下文与共享规则产生一致业务结果。Web 与 Flutter 不必复用同一源码，也不追求像素相同；执行实现差异用契约测试约束。

**本层交付物与验收：**Renderer / Binding / Platform Adapter Contract、Profile 与模板实例化、组件身份与卸载规范、跨端 Golden Tests。验证隐藏不删数据、Profile 切换不重放初始化、输入不重复写入及多字段组件的数据 / Props 一致性。

### 共用 Adapter 与物料内部行为

Adapter 是共用的引擎接入能力，不为每个物料编写独立数据 / 事件映射适配器。物料遵守统一的组件接入约定：共用 Adapter 按 Prepared 配置与当前 Scope 订阅 Runtime、读取相关状态传入 Props、提供既有指令调用能力，并管理订阅生命周期。姓名、日期范围等物料的输入事件、第三方组件库 Props 差异和临时交互在物料组件内部实现，不把这些差异注入共用 Adapter，也不另建可配置事件转换语言。统一 Props、绑定值和指令 API 已由本篇 React SDK 固化，不将前轮“物料专属 Adapter 映射”当作现行方案。

### Adapter 的共性封装范围

共用 Adapter 封装常规绑定读取 / 订阅、受控修改与其他已有指令入口，以及表达式值的取得。物料只实现自己的 Props 消费、呈现和交互，不要求逐个设计引擎接入映射，也不把普通 Props 的平铺 / 分组形式升级为需要用户决策的架构问题。具体调用签名由统一 SDK 固化。

表达式职责沿用 L2 静态编译、L3 统一求值的既有分工：Adapter 按 Prepared 配置调用求值能力并提供结果，不新增原始 L1 AST 解析器、依赖分析器或一套物料表达式语义。只有出现独特指令或特殊值读取的真实需求时，才明确它应复用现有受控接口、归 Host 业务能力还是需要另行确认扩展；不预先引入任意脚本、直接可变 Store 访问或新的通用指令 DSL。

此前未单独选择 Props 平铺 / 分组与普通写入形式；2026-10-26 用户整体确认下方 Hook SDK，不再作为架构分支反复提问。实际输入、卸载与改绑已有本地主端轨迹，覆盖范围见实施证据。

## 输入交付与编辑结束后的唯一展示来源 {#input-handoff}

普通字段编辑统一采用当前输入交付 Runtime 的方式，不能只因输入暂时不符合 Schema 就保留旧合法值。物料能解析为目标值时写入相应 JSON 值，尚不能解析为合法目标值时可写入当前输入文本作为业务不合法工作值；例如数字字段由 12 编辑成 -，Working Data 可为字符串 "-"，由 Schema / Constraint 报错，不使用 NaN / undefined 表示该输入，也不新增独立 Incomplete 状态。具体解析与显示格式由物料内部实现，共用 Adapter 只封装绑定、指令与 Prepared 求值。

带明确确认动作的交互（例如日期弹层选择后点击确定）可在组件内部暂存未确认选择，确认时才通过既有指令写入 Runtime；取消不提交该选择。这是组件交付时机的选择，不构成第二套引擎临时数据或表单级草稿机制。输入法组合等内部状态同样按组件交互管理，不把每一段内部编辑过程强制解释为已交付业务值。

编辑完成后，展示值必须以 Runtime 当前状态为准，可按组件格式化呈现但不得继续展示另一份独立业务值。运行时写入结果、校验状态与后续修改通过既有订阅反馈给组件；非法输入可继续展示并报错，不能自动回退上一次合法值或让组件显示新值而引擎无声校验旧值。不增加提交前收集全部组件临时值、通用 Codec 生命周期或独立临时状态管理层。

| 验收场景 | 预期 |
| --- | --- |
| 数字 12 改为 - 并结束编辑 | Runtime 保存非法输入文本，组件按 Runtime 展示，校验不通过，不显示旧 12 |
| 非法文本随后改成合法数字 | 物料解析并写入数字，组件从 Runtime 得到最新状态 |
| 日期弹层选择后取消 | 不修改 Runtime，关闭后展示 Runtime 已有值 |
| 日期弹层选择后确认 | 在确认时写入；结束交互后展示 Runtime 值 |
| 编辑结束后 Host 通过 Command 改值 | 组件订阅读取并展示 Runtime 最新值，不保留独立旧展示数据 |

以上为行为验收契约；TS / React 的测试夹具覆盖见本篇实施证据，不能外推其他平台或正式物料库。

## Adapter 生命周期与迟到调用 {#adapter-lifecycle}

共用 Adapter 统一管理组件侧生命周期、当前 Scope 关联、订阅 / 监听与回调释放，以及 Runtime 数组成员移动、删除、整体替换在视图侧的对应处理。实际数组 Command、Data 与 Scope Identity 的一致修改仍归 Runtime；不把数据操作实现搬到 L4。成员移动保持原 Scope 关联，删除 / 整替换使旧关联失效，Profile 切换只替换视图接入。

卸载或改绑时，Adapter 释放旧监听、订阅与可解绑回调，不要求每个物料重复处理共性生命周期。正确清理后旧回调通常不再触发；已经被排入外部队列或不能物理撤回的调用仍可能迟到，必须按旧组件 / Scope / 关联身份拒绝，不得使用新的绑定上下文写入其他成员。该检查属于 Adapter 实现保护，不建立新的运行时任务队列或要求用户配置。首次订阅读取与改绑交接应不漏更新，具体平台实现由契约测试验证。

## 物料错误隔离、降级与报告 {#material-errors}

单个物料的运行错误在对应物料边界隔离，保留其他可用物料及 Runtime 数据，不因一个物料报错默认停止整表。失败位置须有降级展示，同时提供错误上报与告警接入，报告关联物料 / 配置位置 / Scope 等必要定位信息，用户端不暴露堆栈等技术错误。降级不能静默继续显示旧数据并伪装正常交互；失败物料的不可用交互停止，其他物料继续。错误边界、展示与上报的共性机制由 L4 平台实现 / 共用接入落实，不要求物料自行捕获所有错误；具体展示样式与监控服务由平台 / Host 接入。

| 验收场景 | 预期 |
| --- | --- |
| 组件卸载后 Runtime 再变化 | 旧监听已释放，不再更新旧组件 |
| 同一展示位置由 A 改绑 B | 释放 A 的监听 / 回调，读取 B；A 迟到调用不能写入 B |
| 数组移动 / 删除 / 整替换 | Adapter 跟随真实 Scope 身份，移动保留；旧成员删除后接入失效 |
| 清理后外部队列仍回调 | 旧调用被拒绝，不重建订阅或产生写入 |
| 单个物料抛错 | 隔离该物料并展示降级，其他组件可用，错误上报 / 告警可定位 |

这些契约已有 TS / React 本地实现与针对性验证；跨框架错误捕获及具体监控服务仍未完成。

## L4 完整模块草案与编码契约 {#implementation-contract}

本节保留模块整合过程，2026-10-26 用户已整体确认下方 React SDK 与四批实施方案。状态归属、共用 Adapter、输入、生命周期和错误隔离继续有效；具体名称与文件拆分在契约内细化，不要求逐项批准。旧 FieldController 片段仅是来源追溯。

### 1. 目标与系统边界

L4 将兼容 Prepared View 与 Runtime 当前状态呈现为目标平台组件树，连接用户操作与既有指令，保证业务数据、校验与身份来自 Runtime。L4 不解析原始 L1、不建立业务 Store、依赖匹配器、校验引擎或异步任务调度器。表达式由 Adapter 调用 Runtime 统一 Prepared 求值能力；网络、业务 Loading、输出转换和真实提交归 Host。

### 2. 输入、输出与持有状态（接入草案）

| 项目 | 信息需求 |
| --- | --- |
| 输入 | 兼容 Prepared 的当前 Profile 视图 / 依赖 / 求值计划、已有 Runtime 实例、确定物料实现注册、平台挂载环境、Host 业务事件及错误报告接入 |
| 输出 | 平台组件树、用户事件产生的既有指令 / Host 事件、错误定位与降级展示 |
| L4 可持有 | 挂载组件关联、Scope 关联、取消订阅函数、有效调用身份、框架呈现缓存、必要的组件内部交互状态 |
| L4 不持有 | 权威业务值副本、独立 Issue 存储、Reaction / Constraint 调度状态、业务请求缓存或提交结果证明副本 |

首期已确认 Web/TS + React，分别由 packages/renderer-react 和 packages/materials-react 承担呈现与基础物料；Renderer 已有正式入口与四批实现，首批 14 个正式物料已本地交付；包保持 private / 0.0.0。类型和安装 / 释放接口见实际 SDK；未来 Flutter 按同一行为契约单独实现，不要求跨框架共用 Adapter 源码。

### 3. 模块职责（组织草案）

| 部分 | 完整责任 |
| --- | --- |
| Renderer | 消费 Prepared Profile，组织 MaterialNode / ScopeNode / TemplateUse 对应的组件与 Slots，查找已锁定物料实现；不解释原始 AST |
| 共用 Adapter | 按当前准备计划和 Scope 建立接入；封装绑定读取 / 订阅、Prepared 求值和既有指令；负责组件侧关联、挂载 / 改绑 / 释放与迟到调用拒绝 |
| 物料组件 | 消费 Props、渲染、处理平台事件、解析 / 格式化 / 确认交互；第三方组件差异在内部消化，不注册专属 Adapter |
| 平台 / Host 接入 | 用框架生命周期落实订阅交接与错误边界；提供业务事件和错误报告 / 告警目标；不将网络任务搬入 Adapter |

是职责分工，不强制独立包、基类或固定数量的对象；Scope / Slots / 物料查找不再各自建设一个新引擎。

### 4. 组件装配与身份（流程草案）

1. 校验要消费的 Prepared、Profile 与 Runtime 的对应关系，取得目标平台的确定物料实现；配置错误不继续解释执行。
2. MaterialNode 创建物料组件，经共用 Adapter 提供当前 Props 与受控操作能力。
3. ScopeNode 使用 Runtime 提供的真实成员身份创建重复区块；不由 L4 根据业务 ID、内容或下标推测成员是谁。
4. TemplateUse 使用 L2 已解析的结构和引用参数；每处使用有自己的组件实例和局部状态，不复制业务数据。
5. Slots 的结构由 Renderer 组织并交给容器物料，排版、Portal、动画和开闭交互归容器组件。
6. 实现中可用准备节点身份、结构出现位置与 Scope 组合确定组件身份；精确字段待 Prepared 联验，禁止仅用数组下标导致移位串项。

### 5. 首次读取、订阅与 Props 更新

1. Adapter 取得当前准备计划与 Scope，建立可释放的组件接入关联。
2. 首次读取与建立订阅必须安全交接；可复用平台成熟外部 Store 能力或订阅后复读等方式验证，不要求新建通知队列。
3. 读取绑定值、相关校验状态与表达式求值结果作为组件 Props；通知到来后按当前关联读取最新状态。
4. 按完整动态表达式 watch 精确失效 / 复用结果，不合并为组件全部重算；框架负责后续渲染、差异比较与批处理。表达式结果缓存只是呈现投影，不重放通知拼成第二份业务数据，也不承诺各端同一 DOM 更新次数。
5. 只读数据遵守已确认的输入复制 / 内部不可变 / 开发冻结契约；组件不直接修改接收对象。
6. 动态 Props 求值失败作为对应物料的接入失败处理，不用旧结果冒充当前状态；具体错误形状归统一诊断 SDK。

Host 显式替换 Context 是 Data watch 之外的管理失效入口：保守失效全部已挂载动态表达式，由 Adapter 重新取得 Runtime 求值结果；不自行监听 Host 对象原地修改，也不因 watch: [] 就永久缓存 Context 读取。普通 Data 更新继续按完整表达式的精确 watch 处理。见 [Context 交接](extension-integration.md#host-context-update)。

### 6. 输入、指令与确认交互

- 普通编辑经物料解析并调用共用指令入口；符合目标类型时写相应值，非法中间文本可写 Working Data，由 Schema / Constraint 检查，不回退上一次合法值。
- 共用 Adapter 依据现有配置与 Scope 连接受控指令，不要求用户同时配置一次额外 on.change 写入而导致重复修改。
- 日期弹层等明确确认型交互可在组件内部暂存，确认才写入、取消不交付；不建立表单级未提交草稿系统。
- 编辑结束的展示业务值来自 Runtime，可格式化但不能保持另一份独立业务值。
- 多字段组件可以使用现有多条 Command / batch 表达交付，仍遵守逐条即时生效、非原子规则，不默认获得新事务能力。
- 数据修改失败时以真实 Runtime 状态和诊断为准；Host 按钮走既有 host.emit，业务操作不是核心数据 Command。

### 7. 数组、改绑、可见性与 Profile

| 情况 | Adapter / 视图行为 | Runtime 业务行为 |
| --- | --- | --- |
| 成员移动 | 保持同一成员关联，更新位置相关呈现，不把 A 改成 B | Scope 身份保留，按真实变化触发规则 |
| 成员删除 | 旧接入失效并释放，旧事件拒绝 | 删除 Scope 与相关业务实例 |
| 整数组替换 | 释放旧成员组件关联，为新 Scope 创建接入 | 即使数据相同也创建新成员身份 |
| 同一组件位置改绑 | 使旧关联失效、清理、读取新关联当前值 | 普通 View 改绑不重建业务实例 |
| 条件子树 / 虚拟挂载 | 未挂载子树无组件订阅；控制创建的父观察保持存活；重挂读取最新值 | 不因未展示删数据或取消共享业务规则 |
| Profile 切换 | 释放旧视图接入，按新 Profile 装配组件 | 复用同一 Runtime，不重放 Reaction 激活 |

隐藏是否销毁实际 DOM 由容器与框架实现，业务状态规则不随该选择变化。组件未确认交互在卸载时结束，不因此发明自动保存未确认值的行为。

### 8. 清理与迟到调用

卸载 / 改绑先使旧接入失效，再释放订阅、监听和可解绑回调；具体调用身份机制为实现细节。正确解绑后通常不再触发，已经排队或不能撤回的回调仍必须拒绝，不能借用新 Scope 写入。释放应可安全重复执行，单项失败不能阻断其他清理；不增加独立执行轮次或熔断系统。

### 9. 物料异常、降级与监控

单物料渲染 / 求值 / 接入错误在对应物料边界隔离，提供降级展示，停止不可用交互，保留其他可用物料与 Runtime 数据。容器自身失败时，其不能继续呈现的子树随错误边界降级，不保证脱离失败容器仍能独立显示。

开发端记录可定位错误，生产展示业务友好的降级内容；上报关联表单 / Prepared 身份、物料身份、准备节点及 Scope 等定位信息，默认不附带敏感字段值。具体报告字段与限频属于统一观测契约草案，不新建 L4 监控后台；报告通道异常不能拖垮表单或清理。

L4 不将物料错误伪造为业务 Constraint Issue，也不自动宣告整表可提交。Host 使用 Runtime 完整校验及其对应数据决定提交，输出转换与外部服务仍由 Host 管理。

### 10. 与相邻层的最小消费契约（信息清单，非正式字段）

| 相邻层 | L4 需要消费什么 | L4 反馈什么 |
| --- | --- | --- |
| L2 / Prepared | 节点结构与来源身份、确定物料 / Slots / 模板引用、绑定与求值 / 观察计划、Scope 模式 | 编译期不依赖实际组件状态 |
| L3 Runtime | 只读读取 / 快照、Prepared 求值、相关状态订阅、Scope 身份 / 集合、既有指令及失败结果、相关校验状态 | 受控 Command 与读取 / 订阅 / 释放请求 |
| 物料注册 | 确定的组件实现、已确认的输入与 Slot / 事件契约 | 不注册逐物料 Adapter，不要求组件操作内部 Store |
| Host | 业务事件处理、错误报告 / 告警接入、外部服务 | 业务意图与真实错误，非另一份业务状态 |

具体 TS / JSON 字段由统一契约草案一次固化，不能把信息清单当成已发布 SDK。尤其 Runtime 首次读取 / 订阅交接、Prepared 节点身份与 Scope 读取必须在首个纵切中联验。

### 11. 完整验收与实现边界

用同一被保人表单贯穿：姓名、非法数字、确认型日期、数组插入 / 移动 / 删除 / 替换、条件子树、同步 / 异步校验、Profile 切换、单物料故障和 Host 提交。

验收必须证明：首次读取不漏变化；一项输入不重复写；编辑结束显示 Runtime；数组身份与 Issue 不串项；旧回调不能写新成员；隐藏与 Profile 切换不重建业务规则；错误局部降级并上报；卸载后无残留订阅。实现可先在主端完成，再用相同语义场景验收另一端，不要求共用框架源码或像素一致。

本方案覆盖完整模块流程，TS / React SDK 有本地消费联验；不代表已有发布版本、跨端或生产性能验收。

## 设计收尾与卸载流程 {#l4-design-closure}

L4 行为专题已收敛，不再按已确认原则或常规框架实现逐项重开讨论。共用 Adapter 的流程明确包含挂载、更新 / 改绑和卸载；卸载先使旧接入失效，解绑订阅 / 监听 / 回调，释放组件侧资源，拒绝不能撤回的迟到调用。不删除 Runtime 数据、Scope 或共享业务规则；实际成员删除仍由 Runtime 数据命令执行。单物料错误继续按局部隔离、降级、上报 / 告警处理。

统一 SDK 类型、Prepared / Runtime 联验、React 生命周期、错误捕获与测试夹具端到端已有本地证据；剩余为正式物料 / Host 应用及其他目标端、生产验收，不增加新的原则性问题。设计确认与实际验收仍分别记录。


### 物料请求接入 {#renderer-requests}

共用 Adapter 根据 PreparedMaterialNode.requests 处理物料请求，不要求逐物料工厂，亦不解析原始 Definition。桥接管理实际挂载实例 + 请求名的 latest / parallel、success / error / discarded、卸载 / 改绑及数组身份有效性，并按 PreparedForm.resources.requestSchemas 检查输入输出。Host 只接收业务输入并返回 JSON 结果，结果不自动写入表单。完整语义及验收见 [L1 请求契约](l1/05-view-material-host.md#material-requests)；React 运行时桥接及测试已有实现，证据见 react-implementation，不由协议结构测试替代。


### 请求接入预检与页面错误

按所选 Prepared 的请求需求在页面装配时检查实际 Host 注册，不能推迟到用户点击或条件子树首次挂载；缺失项关联物料显示局部配置错误并停止相应交互。开发页面明确标出物料、请求名、Host 名及来源位置；生产以业务提示呈现局部不可用，其他可用物料继续。调用层仍保留 error 兜底。物料请求类型、Host 处理函数和静态注册约束共同构成开发接入验收，见 [完整目标](l1/05-view-material-host.md#request-development-contract)；本期已实现 React SDK 与页面错误展示，覆盖范围见 react-implementation，不外推正式应用完成。

## 状态订阅的统一交接 {#renderer-state-subscription}

挂载时 Adapter 绑定实际 Scope，注册 Binding 与 Prepared 完整表达式的观察，并用一致初读交接获取当前值。Runtime 在有效变化发布后通知命中消费者，Adapter 重读权威 Data / Validation，并只重新求值失效表达式，再交框架更新 Props；不要求每次通知立即完成绘制。

校验展示订阅 ValidationWatch（source / field / observe），数据展示仍使用 DataWatch。两者共用注册 / 通知 / 释放方式，但发布源和比较投影不同：Issues 相同而状态改变，只通知相应 status / state 观察。发布须先完成字段聚合与状态的一致更新，再同步通知；订阅不重放历史事件。字段 Issues 不放进组件自己的业务 Store。

卸载或 Scope 改绑释放原观察并安全取得新快照；父条件观察不能随隐藏子树一并移除。View 的校验展示无需在 L1 新增 errorBind，也不因 Reaction 新增 ValidationReference 就允许任意持续 Props 读取校验状态；当前编译边界见[Compiler](l2/compiler.md#compiler-reaction-state)。TS / React 的 Runtime / Adapter API、缓存与框架接入已有实现，见 react-implementation；其他端仍按相同契约推进。


## React SDK 与四批实施确认 {#react-sdk-delivery}

2026-10-26 用户整体确认本专题并要求按实施批次执行、遵守项目工作流。决策见 [ADR-FE-022](decisions/ADR-FE-022-react-renderer-sdk.md)，来源见 [SRC-L4IMPLEMENTATION](source-map.md#src-l4-implementation)。下述为现行实施契约；确认不代表运行或生产验收已完成。

### 公共入口与消费方式

- `FormRenderer` 接收当前唯一 Profile 的 Prepared、Host 创建的 Runtime、确定物料注册、Host Request 注册、诊断和降级展示。挂载前检查格式、执行兼容、物料锁和所有请求需求（包括隐藏节点）。整体执行不兼容停止该 Renderer；可定位的物料 / 请求缺失只降级关联物料。
- `useMaterialAdapter(contract)` 供物料内部使用，返回 `props / values / validation / slots / set / command / emit / request`。Contract 关联 Manifest 和开发类型，不允许由物料传入任意节点替换当前 Prepared。
- `defineMaterial` 关联 Manifest、确定制品身份与 React 组件；`createMaterialRegistry` 组织固定实现集合，检查重复 ID。不建立物料专属 Adapter，不默认加载基础物料或样式。
- `set(name, value)` 将原样 JSON 值包装为 Literal 后通过既有 set Command 交付，允许 Schema 不合法工作值；`command` 保持 batch 逐条即时、非原子语义。`emit` 执行物料声明事件的页面映射，不自动重复 Binding 写入。失效操作返回 inactive，不借用新 Scope。
- Binding 读取保留 value / missing / error，类型提示不能把非法工作态断言为合法 Schema 类型；校验来自 Runtime，既有 Binding 名不扩张为新的端口协议。

### 装配、投影与生命周期

同进程 Compiler 交付的深度只读产物复用已确认的结构接收结果；外部 JSON 仍接管并检查，不按冻结标记猜测有效性。物料契约使用同一声明对象时直接匹配，defineMaterialContract 创建的不可变契约可复用摘要；外部可变的结构化声明不缓存旧摘要。业务输入由 Adapter 先固定并维持原错误边界，随后 Runtime 复用已接管值；数据写入、Scope 失效及通知语义保持。

MaterialNode 建立可撤销挂载关联；ScopeNode 通过 Runtime bind 展开 one / each，each 观察稳定成员结构，one 观察位置存在；TemplateUse 将已编译形参关联实参 DataReference，保留稳定成员相对定位，不隐式捕获调用方其他别名，不分析原始 L1 或重新推导依赖。Slots 交容器决定何时呈现；未挂载子树不建立自身订阅，父条件观察保持。

身份由结构出现位置、模板调用位置与 Runtime Scope 共同确定，不能只用数组下标或静态节点 ID。移动保持实例，删除 / 整替换使旧关联失效。先撤销操作资格，再释放订阅、监听和请求；清理幂等。操作及请求交付时重新核对 Scope / Runtime 存活，覆盖数据已删除而 React 尚未卸载的窗口。Renderer 卸载不 dispose Host 持有的 Runtime。

React 使用外部 Store 接入与稳定呈现快照；渲染阶段只读，不登记持久观察 / 发请求 / 写业务数据。提交阶段建立观察并复读，补齐首次读取至订阅的变化。按每个完整 `$expr` 的 Prepared watch 分别缓存和失效，Binding / Validation 分源订阅；Context 替换保守失效全部动态表达式，包括 watch 空数组。Strict Mode 重复建立 / 释放不产生重复副作用。

普通编辑、确认型交互、非法数字与输入法沿 input-handoff；局部临时选择留在物料，编辑结束显示 Runtime 当前值。Renderer 默认不生成原生 form 或业务提交按钮。首期客户端交互呈现，服务端首屏占位由 Host 组织，不承诺 SSR 表单水合。

### Request 与错误

Request 返回带 `result / cancel` 的本地调用对象，result 为 success / error / discarded。桥接检查物料输入、可选映射后的 Host 输入、Host 输出和物料结果；检查器按闭合资源预编译复用。latest 按实际挂载 + 请求名撤销旧调用并立即结算，parallel 独立交付；卸载 / 改绑 / 成员删除撤销资格，移动保留；取消仅优化底层资源，不能依赖网络结束才结算。候选结果不自动写入 Runtime。Host 处理业务 JSON，可忽略 Web 取消信号；不增加跨语言取消协议。

React 错误边界覆盖渲染；共同操作入口处理指令 / 事件和异步错误。配置 / 求值 / 渲染错误局部降级；单次请求 error 由物料展示重试。报告关联表单、Prepared、节点、模板出现位置、物料、Scope、阶段和错误码；生产端不暴露内部技术详情，报告失败不能阻断清理。不伪造业务 Constraint Issue。

### Runtime 最小消费接口

在已有 read / evaluate / evaluateValue / observe / bind / dispatch / getValidation 上补充：统一 Interaction 执行（复用 Host 输入快照、事件注册与诊断）、只读 Scope / Runtime 存活检查及失效订阅、Prepared 视图兼容检查。跨包只使用公共 exports。

当前 Prepared 只包含选定 Profile；切换由 Host 取得目标 Prepared，检查业务执行部分（Schema、规则、具名表达式等）及业务根 / 函数签名实际引用的外部 Schema 资源闭包一致且所需纯函数已经按锁装载后复用 Runtime，不重放激活。不能热装载新函数或仅按表单 ID / version 接受另一套规则。视图函数需求可为已装载函数的子集；请求资源与物料锁可随视图更换。

### 模块、目录与实施计划

`packages/renderer-react/src` 按 renderer（入口 / 分发 / 挂载 / 上下文 / 预检）、material（契约 / 定义 / 注册 / 锁）、adapter（Hook / 投影 / Binding / 表达式 / 校验 / 操作 / 生命周期）、composition（Scope / 模板 / Slots / 身份）、requests（类型 / 桥接 / 检查 / 调用资格）、diagnostics（类型 / 上报 / 边界 / 降级）组织。公共入口集中 index.ts，测试在 tests 对应职责目录，独立测试类型检查；内容较少可合并，不建空目录。不新增 host-sdk / shared / testkit 包。

依赖方向为 Renderer → Protocol / Runtime / React；Materials → Renderer / Protocol；应用装配 Compiler / Runtime / Renderer / Materials。Renderer 生产代码不依赖 Compiler 或默认物料；测试使用真实 Compiler 生成 Prepared，跨包通过公共入口。

| 批次 | 接口 / 文件落点 | 反例与验证入口 |
| --- | --- | --- |
| 1 | renderer/FormRenderer、material 注册、adapter Hook / Binding；Runtime 兼容 / 存活接口 | 真实 Compiler + Runtime：首读、输入一次写入、Host 改值、Literal 原样值、缺物料；renderer tests、runtime lifecycle tests |
| 2 | adapter 表达式 / Validation、composition Scope / 模板 / Slots | 独立表达式计数、状态改变且 Issues 同值、移动身份、删除 / 整替换、模板两次使用、隐藏重挂；React tests |
| 3 | Runtime Interaction、adapter 关联、requests 桥接 | Event Payload、同位置改绑、删除至卸载窗口、latest / parallel、取消失败 / 迟到拒绝、静态注册类型与动态装配检查 |
| 4 | diagnostics 局部错误、Profile 交接、跨包及浏览器联验 | 首读订阅竞态、Strict Mode、Context 空 watch、确认取消 / 非法数字、局部抛错与报告异常、卸载清理、真实 UI 到 Runtime / 校验 / Host |

每批先反例 RED，再实现 GREEN；最终运行包与全仓适用测试、类型、lint、构建、边界 / 打包消费者、文档 build / check。独立上下文审查依据契约与源码取证；不凭测试数量或文档归档认定全部生产能力完成。正式物料库、业务纯函数、真实 Host 服务与完整应用验收仍为后续阶段。


### TS / React 四批实现与证据 {#react-implementation}

实现入口为 [Renderer README](../../packages/renderer-react/README.md)与 `packages/renderer-react/src/index.ts`，正式物料库已提供首批 14 个物料；Playground 首页导航到 `/demos/basic`、`/demos/members`、`/demos/interactions`、`/demos/travel`。旧 `/l4` 专用物料夹具已移除，当前 Demo 使用正式物料协议与可控本地 Host。公共 SDK 包保持 private / 0.0.0，不视为已发布版本。

| 契约 | 实现与行为证据 |
| --- | --- |
| 装配、确定锁与 Binding | renderer/create-render-environment.ts、nodes/view-node.tsx、material/registry.ts；renderer.test.tsx 覆盖真实首读 / 单次写入 / Host 改值 / 缺物料 / Missing |
| 精确表达式、校验、组合 | adapter/expressions.ts、projection.ts、composition/scope-projection.ts；composition.test.tsx 覆盖独立求值计数、空 watch 的 Context 更新、数组 / 模板身份、Object.is |
| 交互与请求 | Runtime interact / isScopeAlive / observeScope / checkView、requests/bridge.ts / contracts.ts；请求并发、取消 / 乱序、异常、缺失注册、成员 / 实例失效立即 discarded；静态类型负例在 type-contracts.ts |
| 清理、Profile、局部错误与完整路径 | lifecycle.test.tsx 覆盖首读交接、Strict Mode、隐藏重挂、改绑 / 确认 / 非法工作值、Host 通知、Profile 及故障恢复；tests/e2e/renderer.spec.ts 通过真实页面操作贯穿校验与 Host 数据交付 |

按 [ADR-FE-023](decisions/ADR-FE-023-independent-devtools.md) 移出首批内嵌技术诊断，移除 diagnosticMode；业务树只显示业务友好降级。装配遗漏（包括隐藏节点）经结构化出口交付，开发扩展独立展示。onDiagnostic 保留 Host 报告用途，自身失败被隔离，回调身份变化不再重建装配环境。开发构建条件决定是否提供发现能力，扩展标记仅用于连接，不自行授权生产采集。

[首期平台诊断映射](platform-studio.md#platform-diagnostic-mapping)只接收 `render` 阶段的物料错误。Host 的 Renderer 现场按现有 `onDiagnostic` 字段保存，配置定位使用已发布制品可核验的节点 ID。

独立上下文只读审查发现并复验两项反例：模板仅接收全局形参时不能丢掉外层成员的存活资格；请求专用外部 Schema 不能阻止合法 Profile 切换。修复分别将挂载 ownership 链与词法 Scope 分开、按 Schema 位置计算执行资源闭包。模板仍只看显式形参，未增加隐式别名捕获；闭包跳过 const / default / examples 普通数据，并拒绝真实执行资源变更。写入和请求均有回归。维护者另以同步首轮修改复现快照 canonical 比较压平 -0 / 0，改用 Binding 的 Object.is 和稳定 Props 容器，执行兼容比较也保留标量语义。

验证命令及本地限制详见包 README 和 [工程实施证据](engineering.md#renderer-implementation)。独立审查提供了原缺陷反例；修复后由实现者执行红绿回归及最终门禁，未虚称第二轮独立审查。测试结果仅覆盖本期 Web / React 与可控 Host，不替代正式物料库、真实业务服务、跨端和生产性能验收。


### 实现目录与状态注释整理 {#react-code-organization}

按用户的组件单文件与状态说明要求，React 入口拆为 FormRenderer / RendererContent；递归节点位于 renderer/nodes，物料边界 / 挂载、Scope、所属资格、模板各自单文件，固定递归能力由入口传入，避免循环依赖。错误边界与已知错误降级分别单文件；技术详情已随后移往独立 DevTools，Context 归 adapter。普通类型与同职责辅助函数就近维护，不新增公共 API、业务状态层或插件框架。

组件与 Hook 注释明确输入、返回、状态来源、更新和释放；实现阅读路径、Hook 返回项与状态表统一在 [Renderer README](../../packages/renderer-react/README.md)。结构整理本身未改变行为。随后用户确认独立 DevTools 并授权实现，技术 UI 外置与诊断回调生命周期分离按 [独立工具契约](l3-observability.md#independent-devtools) 落地；工具包不成为业务运行依赖。

独立 DevTools 首期与技术 UI 迁出已按用户授权实现，独立审查与本地检查入口见 [工程证据](engineering.md#devtools-implementation)，不提升正式物料库 / Host 应用及其他端状态。


入口 Review 的修复与实现命名沿用本节组织：每个根 Provider 提供 RendererContextValue，局部变量为 contextValue / compiledForm / environment；createRenderEnvironment 只装配已校验输入，validateRenderInput 将静态兼容检查与注册变更分开。公开 prepared 属性、PreparedForm 类型、状态所有权及生命周期契约不变，不因内部名词整理创建新公共层。

2026-10-27 用户授权统一修复本阶段 Review 问题及 Runtime 内部命名。根入口对缺失 definition / build、非 JSON 和访问器配置使用安全身份与边界内校验；配置接管缓存不随注册表变化重做，运行实例销毁仍即时拒绝。DiagnosticEmitter 只负责通用发布与首次完整交接，开发历史放到观测目录，并按根身份弱关联保留模拟重连所需证据。行为与反例入口统一见 Renderer README 与工程实施证据，无新增 ADR。

后续边界 Review 的反例修复沿用既有局部隔离与 Strict Mode 幂等原则：MaterialBoundary 只保存失败标志，任意抛出值均进入降级，异常值自身无法转成字符串也不使报告逃逸。RendererContent 按本次装配结果交付一次静态诊断；MaterialFallback 只保存本挂载上次交付内容及发布关联，避免渲染 / 回调更新导致旧错误重报。新装配关联、不同 Scope、新增成员、错误恢复后再出现及真实重挂仍正常交付；静态声明记录和实际挂载记录不互相吞并。回归入口为 Renderer boundaries 测试，未改变 Request 错误分类或新增公共诊断 API。

挂载与快照 Review 的修复收敛既有职责：MaterialMount 统一激活 / 释放物料关联，Hook 退订只移除监听者，不因内部子组件切换撤销请求。表达式缓存读取核对 Runtime 的只读 Data / Context 输入身份，输入变化时按 Prepared watch 比较投影并复用未变结果，不依赖观察回调先执行；结构 watch 按成员身份和顺序比较。Context 显式替换仍保守刷新全部动态项，同值标量通过空 Data watch 的管理通知保留失效信号；不改变 Runtime 公共接口、通知顺序或业务状态所有权。求值失败保留 Runtime 返回的具体原因供报告定位，生产降级提示不附带技术细节。正式反例位于 Renderer snapshots / requests 测试，无新增 ADR。

## Renderer 的通用观测接缝 {#renderer-observation-handoff}

2026-11-08 已确认：Renderer 仅提供已有投影缓存、Scope / owners / Binding、装配及请求事实；工具查询不重新求值或启动请求。物料请求与 Runtime Validator 分别标识；请求因果仅沿明确来源关联，不从时间相邻猜测。Renderer 与 Runtime 分别携带版本，不承诺全局原子快照。四视图共用选择、分页和历史缺失语义见[通用观测契约](l3-observability.md#observation-contract)，本次确认不代表新上报接缝已实现。

观测接入的详细接口、采集时点及版本要求统一见[技术契约](l3-observability.md#observation-technical)：Runtime、Renderer、页面桥接与工具面板同步进行破坏性协议升级，不保留旧接口兼容；本层既有业务契约不变，本次仅设计归档。
