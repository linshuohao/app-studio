---
id: DESIGN-INTEGRATION
title: 物料扩展与 Host 集成
type: design
status: active
layer: 跨层
modules:
- M04
- M03
- M06
- M14
- M15
tags: []
sources:
- SRC-ASSETDESIGN
- SRC-REACTIONSTATE
- SRC-L3BASELINE
- SRC-CONTRACTS
- SRC-EARLY
- SRC-L1
related:
  decisions:
  - ADR-FE-024
  - ADR-FE-020
  - ADR-FE-018
  - ADR-FE-019
last_reviewed: '2026-10-28'
navigation:
  group: 06 · 横向能力
  order: 71
reading_next: DESIGN-PLATFORM-STUDIO
relocated_sections:
- source: docs/design/architecture.md
  anchor: materials
  target: materials
- source: docs/design/architecture.md
  anchor: capabilities
  target: capabilities
---

# 物料扩展与 Host 集成

本篇说明核心四层如何与 UI 物料、纯函数及业务宿主协作。物料与 Host 是横向协作边界，不增加新的执行层。

2026-10-27 首批正式物料、业务纯函数、单资产目录与版本工具方案已由用户整体确认并授权归档，完整方案见[首批资产与整体验收](#first-assets)。设计于 fd96b3c 提交后，2026-10-28 按用户继续指令交付工具第 0 批及首个函数 text.isNonBlank，见[本地实施证据](engineering.md#asset-tooling-implementation)。首批全部 14 个正式 UI 物料已有[本地证据](engineering.md#interaction-materials-implementation)，第 4 批全部 7 个业务函数与完整可控目标表单也有[本地证据](engineering.md#business-travel-implementation)，真实 Host 后续推进；现有 React SDK / 独立 DevTools 的完成范围不扩张为真实业务验收。

## Material：物料体系与 UI 扩展 {#materials}

物料不是执行链中的单一层。设计器需要元信息，L2 检查 Manifest，Renderer 加载平台实现。基础物料、容器和领域组件共享同一套受控契约。

### 物料范围

| 类别 | 示例 | 主要价值 |
| --- | --- | --- |
| 基础字段与展示 | Input、Select、DatePicker、摘要 | 数据绑定与反馈 |
| 结构与容器 | Section、Tabs、Steps、Modal、Drawer、BottomSheet | 通过 Slots 组织视图，自管局部 UI State |
| 领域业务物料 | 证件上传、被保人卡片、地区选择、日期范围 | 封装交互，明确业务值交付与多端口绑定 |

### Manifest 与平台实现分开

以下是现行 L1 的契约方向，端口子类型与版本解析仍需正式规范固化：

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

平台组件实现、编辑器属性面板与发布加载信息归注册/工具体系，不因可复用就都加入 FormDefinition。Capability Registry 可以共同治理 Material 与 Pure Function 资产，但二者保留不同契约与执行职责；Host 内部服务在应用中组织，不进入物料协议，不强制托管到平台，也不合并成通用 UI Material。

纯函数不承担物料 UI 或校验状态；复杂同步判断可由 Constraint 调用领域 Pure Function，网络与副作用留给 Host。Manifest 只能声明契约，纯净性、端口行为与跨端语义仍需代码审查、契约测试和必要防护。

| 契约 | 需要设计与验证的内容 |
| --- | --- |
| Props | Props Schema、递归 ValueSpec、输入限制与业务校验的区别 |
| Binding Ports | 已确认名称与数据 Schema、单 / 多字段映射；不声明读写权限，不依据端口 Schema 拦截非法工作值；受控修改与错误传播仍由接入契约固化 |
| Slots | 已确认首期只声明可接受名称，不加通用数量限制；节点组合、默认插槽简写及平台兼容 |
| Event Ports | 名称；有数据事件声明 Payload Schema，无数据通知只需名称；检查 Event Reference 与类型连接，通知无返回；有返回交互使用独立 Request，不增加异步编排 |
| Field State 消费 | 沿既有 Binding 展示字段、对象摘要、数组项 Issues，不建立独立校验 DSL |
| Version / Platform | 确定性版本锁定、平台实现匹配、缺失能力诊断与升级规则 |

物料的输入 `maxLength` 是交互限制，真正的姓名长度规则仍在 Schema / Constraint。复杂组件的关键业务值不能长期藏在组件内部。

| 取舍 | 方向 |
| --- | --- |
| 能否访问 Runtime 内部 | 不可以，通过受控接口协作 |
| 是否支持复杂领域组件 | 支持，但要求明确 Props / Binding / Slot / Event 契约 |
| 是否建设完整插件生命周期 | 按真实接入需求设计最小生命周期 |
| 物料远程请求 | requests 映射到 Host 输入输出函数，公共 Adapter 交付结果，Host 管网络与授权 |
| 是否默认全动态加载 | 根据发布模式决定，不预设为默认 |
| 是否建设独立物料市场 | 第一阶段不作为前置条件 |

**本层交付物与验收：**Manifest 类型与检查、注册/版本解析、平台实现接入、作者元信息和兼容测试；覆盖日期范围多端口、容器 Slots、上传回写、错误展示及缺失平台实现。

## Host / View Adapter：外部能力与业务集成 {#capabilities}

Reaction 同步执行协议响应项，可通过已有 host.emit 发起 Host 行为；不等待网络，不管理取消、重试、超时或业务结果适用性。Host 按 HostContract.events 注册处理函数，由 Runtime 根据显式 watch 与 when 触发；Host 自主管理报价请求、合并与乱序返回，再通过普通 Command 写回。Reaction Pending 去重只针对规则实例，相同两项 host.emit 仍交付两次；Host 请求是否合并另由 Host 决定。该修订复用语义事件出口，不将 External Validator 或物料 host.request 当作 Reaction 异步执行器，见[完整契约](l1/04-command-reaction.md#reaction-state-host)。

本节保留最初 Capability 章节的接入问题与锚点，按当前职责更新：请求、取消、Loading / Error / Retry / Cache、上传和提交属于 Host。Runtime 管理内部状态及外部校验结论的有效性，不执行网络流程。

```diagram
{
  "id":"figure-host",
  "title":"图 6 · Host Integration：业务请求与受控回写",
  "rows":[
    [{"title":"Host 观察稳定数据 / 接收语义事件","body":"订阅当前数据，或接收 host.emit；决定是否发起业务操作"}],
    [{"title":"Host Adapter / 注入服务","body":"参数映射、鉴权、请求、取消、缓存、重试与超时"}],
    [{"title":"Business Service / Backend","body":"业务计算、权限、权威校验与持久化"}],
    [{"title":"Host 检查结果适用性","body":"核对实例、依赖与请求上下文，处理乱序和过期结果","major":true}],
    [{"title":"仅展示的外部结果","body":"选项、报价、Loading 等由 View / Material 消费"},{"title":"修改数据或报告校验","body":"显式 Command 写回；外部义务报告另经 Runtime 有效性检查"}]
  ],
  "arrows":["↓","↓","↓ Result","↓"],
  "note":"替代最初稿 Runtime → Capability → Resource Manager 的调度建议。Host 业务操作不是核心 Command；Command 只修改 Form Data。"
}
```

### 三条集成路径

| 路径 | Definition / 核心表达 | 外部负责 |
| --- | --- | --- |
| 外部 Constraint | 声明义务、依赖、目标与提交必需性 | 注册校验器、请求、上报结果与状态 |
| 用户触发业务 | Material Event → `host.emit` | 业务流程、权限、持久化与提交 |
| 物料请求 | Material requests + 页面映射 + Host 请求签名 | JSON 候选项、详情；文件传输归平台实现 |

Host 实现一般在运行时注册。L2 从外部 Constraint、`host.emit` 和页面 `host.request` 映射提取 Requirements；HostContract 可选，用于提前检查名称与 Payload。必需外部校验器未就绪时不能绕过提交义务；一般事件缺失的阻断时机和可选性继续固化。Host 内部服务实现不由 L2 推断，见 [Host 注册与依赖边界](l2-preparation.md#l2-host)。

| 能力 | 典型场景 | 责任交接 |
| --- | --- | --- |
| Query / Resource | 城市列表、报价、搜索候选 | Host 观察依赖并管理结果；用户选择经 Binding / Command 写回 |
| Upload | 证件采集、文件上传 | 外部管理上传，最终业务值受控交付 |
| Business Operation | 保存草稿、提交录单、确认报价 | Host 执行，不能当作核心数据 Command |
| Context Provider | 用户、地区、渠道 | 提供只读上下文，不变成第二个数据写入入口 |
| External Validation | 唯一性、身份、资格 | Host 执行，Runtime 接受当前有效义务事实并汇总 Readiness |

插件不能无约束地拿到可变 Store；通过参数、只读快照、受控回写和显式报告协作。客户端能力注册不替代服务端权限验证。

分步填写、局部弹层与异步查询不需要完整工作流引擎。审批、核保和支付等长流程由 Host 集成外部 Workflow Service，不能为此向 L1 增加通用请求/工作流 DSL。

**本层交付物与验收：**Validator / Event / Request 契约、上下文与授权约束、回写和过期结果规则、错误恢复及提交一致性测试；覆盖后发先至、销毁后响应、数组项替换、同值往返和服务失败。

### 外部校验执行器的取消接入

External Constraint 接入选定“Host 返回结果任务及可选 cancel 句柄”。引擎按具体 Constraint 实例管理调用代次 / 任务身份，输入或前置资格失效、同实例新调用替换、Scope 删除及实例销毁时，先撤销旧任务的发布资格，再调用其可选取消句柄。成功与异常返回都必须核对实例存活、任务代次与输入资格；不能只依据全表版本变化取消无关任务，也不能仅比较值相同就接收 A→B→A 的旧请求。

版本与结果有效性是必要正确性契约；取消是尽力而为的资源优化，Host 可以不提供，也不保证网络请求终止。Host 负责实际请求及取消实现，引擎不理解 HTTP / 重试。取消回调要求幂等，任务完成或退出后释放句柄；取消异常只记诊断，不中断其他任务清理或恢复旧任务资格。被主动取消的旧任务不得再发布业务错误或成功，相关诊断与正常网络故障区分。

该能力属于运行时 Host Validator 接口，不将回调写入 L1 或可序列化 Prepared，也不引入异步 Reaction。本次不新增跨端取消信号抽象。完整调用的取消 / 过期返回类型、具体代次编码与 SDK 仍需固化，但不再重新选择取消接入方向。

业务查询等独立 Host 任务仍由 Host 自主管理，不共用 Reaction Pending。

### Host 调用输入的已确认边界 {#host-input-contract}

2026-10-21 用户确认：Host Validator 采用本次调用的数据读取快照 + 当前 Scope + 显式 watch，不新增命名参数映射或 External Payload DSL。影响校验结论的表单数据须从本次调用输入读取，并由 watch 及已有可推导依赖覆盖；不能在异步过程中改读不断变化的 Runtime 当前值，再把结果作为旧输入的结论。具体快照持有 / 读取签名归 Runtime SDK，实例、输入资格、任务代次及可选取消仍沿用现行规则。

这属于 Host 实现契约，不是权限隔离：同进程宿主可以通过闭包持有 Runtime，显式参数也不能阻止越界读取。引擎不能从 Host 任意代码自动发现所有遗漏依赖，也不能为违反调用输入 / watch 约定的实现保证结果新鲜度。业务复用确实需要字段映射时再讨论参数能力，不预先建设。

### Host 显式替换 Context {#host-context-update}

Context 对表单表达式只读，Host 可以显式提供新的环境快照。replaceContext 是说明性接口名，具体 TS 签名由 Runtime 契约整理；这不是 Data Command，也不新增 Context watch。决定与取舍见 [ADR-FE-019](decisions/ADR-FE-019-host-context-replacement.md)。

| 交接环节 | 已确认行为 |
| --- | --- |
| 接管新输入 | 解除与 Host 原对象的可变别名，建立只读快照与新 Context 身份；不依赖原地修改对象 |
| 既有调用 | 继续读取调用时的稳定 Data / Scope / Context 视图，不混读新环境并伪装为旧输入结论 |
| 呈现 | 保守失效全部已挂载动态表达式的缓存，由 Adapter 调用 Runtime 统一求值并重读；watch: [] 只表示没有 Data 观察项 |
| 校验 | 撤销旧完整证明与旧外部任务发布资格，再尽力取消；保守失效全部来源并登记重新校验，不能因撤销 Issue 就报告通过 |
| 时序 | 有正在执行的 Flush 时在其结束后启动新校验，否则独立启动；沿用先 Schema、再按同步前置执行内外任务的正常路径 |
| Reaction | 不因 Context 替换直接入队；Context 不成为 Watch 来源。校验重新发布的真实状态变化可命中显式 ValidationWatch；External.watch 与 L1 Command 不扩张 |

首期不推导 Host 任意代码中的 Context 读取，也不增加 Context 路径级观察。保守整体失效会重算无关表达式、可能撤销无关请求，因此面向相对低频环境更新；不能将此策略推广为任意 Data 变化都取消所有任务。

宿主流程状态或只读操作资格可以放入 Context；用户所选地区 / 币种 / 方案等业务输入放入 Working Data，才能自然驱动联动。语言与显示环境优先由 Host / L4 处理，只有表达式确需读取时进入 Context；搜索候选、加载状态及请求缓存继续走物料 Request / Host 资源管理。更换单据或根业务身份通常由 Host 明确替换 Runtime。Context 运行快照不提供 Compiler 的静态类型证据，后者仍是现行单独接缝。

### Host 接入与业务输出的已确认契约

校验规则 ID 标识声明与运行实例，Host Validator 使用独立、语义明确的能力名称，规则显式引用能力名称，不按规则 ID 猜测实现。不同校验语义使用不同能力名称；多条规则需要同一校验语义时可以引用同一能力，各自实例、代次与错误来源仍独立。具体引用字段、参数与签名在正式类型 / Prepared 契约中固化，本轮不伪造候选 Schema 已支持新字段。

Host 能力缺失按用途降级，开发 / 调试端明确报诊断，用户端不暴露未注册能力名、堆栈等技术错误，不因局部能力缺失默认阻止表单填写。可选埋点等可跳过，业务操作的降级由 Host 决定；适用校验器缺失必须记为未完成，不能静默当作通过。用户交互由 Host 以业务语言承接，用户无感知不等于伪造完整通过或放行未校验数据。

引擎完整校验只证明对应 Working Data 满足表单声明的全部适用校验，并向 Host 交付对应数据快照与结果身份；不负责构造或验证另一个业务请求输出。Host 自行转换、组装业务请求及执行所需输出检查，转换失败属于 Host 业务交付错误，不回写或改写引擎已完成的表单校验结论。表单业务本身需要正确的数据应在配置的数据模型、Binding、同步联动和约束中表达，不依赖提交时隐式修正。Normalized Output 如保留该术语，仅表示 Host 构造的业务提交数据，不是 Runtime 的第二份核心状态或新的通用输出 DSL。

确认与取舍见 [ADR-FE-012](decisions/ADR-FE-012-host-output.md)。


### 已确认的物料请求桥接 {#material-request-bridge}

物料请求是 [L1 请求契约](l1/05-view-material-host.md#material-requests) 的一次输入输出交互，由共用 Adapter 连接 Host；不要求逐物料工厂。Host 业务函数返回 JSON 结果，候选项等由物料消费，选中值仍通过 Binding / Command 写入。共用桥接管理挂载身份、latest / parallel、discarded、可选取消与输入输出检查；具体网络及授权留给 Host。它只承担本通道交付有效性，不接管 Host 观察数据后主动执行的其他业务任务，也不进入校验 Pending。

上方 Host 业务请求图仍描述 Host 自主管理的业务操作；物料 Request 另走“物料 → 已准备映射 → 共用 Adapter → Host 函数 → 有效性检查 → 物料”。旧 Material.services / Host.services 静态需求被该通道替代，Host 内部实现可继续使用 service，不再暴露为协议要求。


### 请求类型贯通与接入完整性

物料请求需公开可复用输入输出类型及契约，Host 实现关联后得到参数 / 返回值检查；静态已知注册集合检查必需请求，动态配置由 Compiler / 装配兜底。实际页面物料的请求映射全部必需，漏映射编译失败；缺 Host 实现装配即显示对应物料错误，不等首次调用。加载未使用物料不要求注册。此规则收紧此前允许省略映射的边界，完整实现与验收见 [L1 请求开发接入](l1/05-view-material-host.md#request-development-contract)。


### React 首期实际接入 {#react-integration-sdk}

L4 已落实 [React SDK](l4-renderer.md#react-implementation)：物料内部共用 Hook 提供 values / validation / props / slots 与 set / command / emit / request；Host 事件及校验仍注册在 Runtime，物料 Request 通过 Renderer 注册桥接。observeScope 的失效通知与即时资格查询覆盖成员删除及实例销毁；模板形参不携带调用方别名，所属挂载资格另外保留。按 [独立工具契约](l3-observability.md#independent-devtools)，开发扩展自动发现并展示装配遗漏，业务应用不再传 diagnosticMode；业务页面保留友好降级和 Host 结构化错误上报。以上为本地实现范围，正式物料库 / 真实服务 / Host 应用仍未因此完成。

## 首批正式资产与整体验收 {#first-assets}

本节是 2026-10-27 用户确认的本期设计，源码基线 `d2b1598`，决策见 [ADR-FE-024](decisions/ADR-FE-024-first-assets-tooling.md)，来源见 [SRC-ASSETDESIGN](source-map.md#src-asset-design)。职责、契约和交付顺序已确认；业务假设只限定验收样例，不作为真实保险产品规则。当次授权仅为归档；用户随后明确要求提交并继续，工具第 0 批与首个函数的实施证据另见[工程记录](engineering.md#asset-tooling-implementation)，不构成外部发布授权。

### 目标表单、业务假设与范围 {#first-assets-scenario}

以“家庭短期出行投保录入单”串起现有多被保人、监护人条件、目的地查询、动态试算及外部资格校验场景。

| 分区 | 数据 / 交互 | 验收用途 |
| --- | --- | --- |
| 投保人 | 姓名、联系电话 | 文本、字段标签与非空错误 |
| 出行信息 | 国家、城市、开始 / 结束日期、方案 | 固定选项、远程搜索、父条件变化、双端口确认 |
| 被保人列表 | 姓名、出行时年龄、证件号码、监护人姓名；新增、移至首位、删除 | each Scope、非法数字、条件字段、成员身份 |
| 摘要 | 成员试算、出行天数、总试算 | 动态 Props、对象子树 Issues、显式联动 |
| 确认与操作 | 信息确认、保存草稿、提交申请 | 勾选、Host 事件、完整校验与对应快照 |

验收假设：被保人 1–5 人；手工申报出行开始日的周岁年龄，整数 0–80；未满 18 岁须填监护人姓名；公历日期含首尾，最长 30 天；方案为 basic / plus；国家为固定选项，城市由 Host 查询。证件先录号码并接外部资格校验，不实现真实证件识别或完整证件规则。草稿允许保存未通过完整校验的数据，提交必须使用当前有效的完整通过结果。

数据位置为 `/applicant/name`、`/applicant/phone`、`/travel/countryCode`、`/travel/city`、`/travel/startDate`、`/travel/endDate`、`/plan`、`/insureds`、`/acknowledged`、`/estimatedTotalMinor`。成员包含 name / age / idNumber / guardianName。输入可以是非法工作值，由业务 Schema / Constraint 判断，不因目标类型拦截受控写入。

桌面 Profile 平铺成员字段，窄屏用摘要和编辑弹层呈现同一成员，共享业务执行部分、数据和规则；切换不重放初始化。保费为固定合成费率的“试算金额”。真实产品规则、查询服务、核保、报价、持久化、输出和提交由后续 Host 承接。

本期覆盖 React 物料 / Manifest、同步业务函数、契约测试、可控 Host 验收页及资产工具。上传、支付、真实承保定价、审批、Studio 属性面板、远程市场和其他框架留后续。DevTools 不进入业务装配和运行前置。

### 物料职责与五类契约 {#first-assets-materials}

基础控件处理输入，field 统一字段呈现，布局容器组织 Slots，复合物料封装明确交付边界的交互。分类用于说明，不作为目录层级。重复列表用 ScopeNode，字段组用 Typed Template，不增加 Repeat、子表单 Store 或物料专属 Adapter。

表中 `?` 为可选 Props，JSON 为 `schema:true`，Option 为 `{id:string,label:string}`，MinorAmount 为整数分。Binding Schema 仅描述静态预期，不能把当前工作值断言为合法类型。未列出的 Events / Requests / Slots 不声明。

| 物料 | Props（默认值） | Bindings | Events / Requests / Slots |
| --- | --- | --- | --- |
| text-input | placeholder?:string；disabled?:boolean=false；readOnly?:boolean=false；maxLength?:integer；inputMode?:text/tel | value:string/null | 均无 |
| number-input | placeholder?:string；disabled?=false；readOnly?=false；inputMode?:numeric/decimal | value:number/null | 均无 |
| checkbox | label:string；disabled?=false | value:boolean | 均无 |
| select | options:Option[]；placeholder?:string；disabled?=false；clearable?=true | value:string/null | 均无 |
| button | label:string；disabled?=false；variant?:primary/secondary/danger | 无 | Event activate，无 Payload；无 Request / Slot |
| field | label:string；help?:string；requiredMark?=false | value:JSON | Slots: default；无 Event / Request |
| value-display | value:JSON；format?:text/integer/moneyMinor；emptyText?:string="—" | 无 | 均无 |
| section | title?:string；description?:string；collapsible?=false；defaultExpanded?=true | 无 | Slots: default / actions；无 Event / Request |
| grid | columns?:1/2/3=2；gap?:small/medium/large | 无 | Slots: default；无 Event / Request |
| condition | visible:boolean | 无 | Slots: default；无 Event / Request |
| dialog-editor | title:string；triggerLabel?:string="编辑"；disabled?=false | 无 | Slots: summary / content；无 Event / Request |
| remote-select | placeholder?:string；disabled?=false；clearable?=true；filterKey?:string/null | value:Option/null | Request search，latest；无 Event / Slot |
| date-picker | placeholder?:string；min?:date；max?:date；disabled?=false；readOnly?=false | value:string/null | 均无 |
| textarea | placeholder?:string；rows?:integer=3；maxLength?:integer；disabled?=false；readOnly?=false | value:string/null | 均无 |
| radio-group | options:Option[]；disabled?=false | value:string/null | 均无 |
| checkbox-group | options:Option[]；disabled?=false | value:string[] | 均无 |
| date-range | label:string；startLabel?:string；endLabel?:string；startMin?:date；startMax?:date；disabled?=false | start:string/null；end:string/null | 均无；内部呈现两端标签与校验 |
| insured-summary | premiumMinor:MinorAmount/null；emptyName?:string="未填写姓名" | insured:object | 均无 |

disabled / readOnly / clearable / collapsible / defaultExpanded / requiredMark 均为 boolean。value-display 默认 text；grid 窄屏收为单列。section.defaultExpanded 只初始化该次挂载的 UI 状态，物料默认值不自动写 Data。其余视觉缺省在契约内实现，不新增业务语义。value-display.moneyMinor 首期固定 CNY，整数分显示为元和两位小数；不适合所选格式的值用明确占位，不默认输出对象技术 JSON。输入限制和 requiredMark 不替代 Schema / Constraint。

field 与子控件分别显式绑定同一位置，不隐式继承。私有 FieldFrame / React Context 只连接 DOM ID、标签和错误描述，不保存业务值或独立校验状态。日期范围分别关联标签并分组。基础控件可消费 validation 设置无障碍属性，不重复渲染错误列表。

复合物料只调用自身 useMaterialAdapter。不能直接嵌入另一注册物料并让其在同一挂载上下文调用另一份契约的 Hook；共享无 Hook 的内部组件，或由 Renderer 构造 Slots。insured-summary 读取成员及子树 Issues，不计算保费、不修改成员或核验资格。insured-fields 是带 insured 类型参数的视图模板。

remote-select 的 `query` 来自物料内部搜索框输入，不是选中值，无需配置同名 Props 或 Binding；`filterKey` 来自 Props，可由表达式读取外部筛选条件（如国家代码）。点击搜索或 Enter 时把两者组成请求对象。输入关键词与搜索成功均不写入 `bindings.value`。

remote-select.search 输入为 `{query:string,filterKey:string|null}`，成功业务结果为 `{items:Option[]}`，不含桥接状态包装。首期无分页、自动选中或回填。选择后整体写 `{id,label}`：id 为业务标识，label 为选中时展示快照，不能视为服务端权威名称。

#### 基于 Shadcn 的常用表单控件

单日期、日期范围、多行文本、单选组和多选组采用 Shadcn 的控件组合，基础交互沿用 Base UI 及 Shadcn Calendar。封装与样式归属运行时物料包，由 Studio、Playground 和独立 Host 使用同一物料实现。编译和资产目录从静态入口读取 Manifest。

- 单日期可键入或打开日历。键入按 Enter 或失焦提交，日历选中即提交。写入严格公历 `YYYY-MM-DD`，清空写 `null`。无效草稿和格式提示停留在控件内，Host 外部改值覆盖草稿。`min` / `max` 包含边界。
- 日期范围两端都支持键入或从日历选择，选择只改变本地草稿，确认时沿用双端写入流程。取消和 Escape 丢弃草稿。只有开始端使用 `startMin` / `startMax`。
- 多行文本沿用文本输入的提交与输入法规则，保留换行，清空写空字符串。
- 单选组写一个选项 ID，空态为 `null`。多选组写选项 ID 数组，清空写 `[]`。配置中的 Option ID 唯一。

### 配置示例与 Scope 组合 {#first-assets-examples}

| 物料 | 使用示例 |
| --- | --- |
| text-input | value → `/applicant/name`，或模板内 insured 的 `/idNumber` |
| number-input | value → insured 的 `/age` |
| checkbox | value → `/acknowledged`，label 为信息确认文案 |
| select | value → `/plan`，options 为 basic / plus；国家另绑 `/travel/countryCode` |
| button | activate → 数组 Command，或保存 / 提交 host.emit |
| field | value 与姓名输入同位置，default Slot 放输入 |
| value-display | value 为天数表达式，或读取总试算按 moneyMinor 展示 |
| section | title 为投保人 / 出行信息 / 被保人，default 放字段，actions 放操作 |
| grid | columns=2，default 放姓名和电话 |
| condition | visible 为 requiresGuardian 表达式，default 放监护人字段 |
| dialog-editor | summary 放 insured-summary，content 放 insured-fields Template |
| remote-select | value → `/travel/city`，filterKey 读国家；search 映射 travel.searchCities |
| date-range | start / end → `/travel/startDate`、`/travel/endDate` |
| insured-summary | insured → 当前成员根；premiumMinor 为当前成员试算表达式 |

普通字段不配置 on.change 二次写入：

```json
{
  "material": "field",
  "props": { "label": "姓名", "requiredMark": true },
  "bindings": { "value": { "source": "data", "path": "/applicant/name" } },
  "slots": { "default": [{
    "material": "text-input",
    "props": { "placeholder": "请输入姓名" },
    "bindings": { "value": { "source": "data", "path": "/applicant/name" } }
  }] }
}
```

日期及远程搜索使用既有多端口和请求映射：

```json
{
  "material": "section",
  "props": { "title": "出行信息" },
  "slots": { "default": [
    {
      "material": "date-range",
      "props": { "label": "出行日期" },
      "bindings": {
        "start": { "source": "data", "path": "/travel/startDate" },
        "end": { "source": "data", "path": "/travel/endDate" }
      }
    },
    {
      "material": "remote-select",
      "props": {
        "placeholder": "搜索目的地城市",
        "filterKey": { "$expr": { "ref": { "source": "data", "path": "/travel/countryCode" } } }
      },
      "bindings": { "value": { "source": "data", "path": "/travel/city" } },
      "requests": { "search": { "type": "host.request", "request": "travel.searchCities" } }
    }
  ] }
}
```

模板形参 insured 已声明时，监护人条件如下。Missing 显式经固定短路转 null，不交给注册函数：

```json
{
  "material": "condition",
  "props": { "visible": { "$expr": {
    "op": "travel.requiresGuardian",
    "args": [
      { "op": "core.if", "args": [
        { "op": "core.exists", "args": [{ "ref": { "source": "data", "scope": "insured", "path": "/age" } }] },
        { "ref": { "source": "data", "scope": "insured", "path": "/age" } },
        null
      ] },
      { "literal": { "minAge": 0, "maxAge": 80, "adultAge": 18 } }
    ]
  } } },
  "slots": { "default": [{
    "material": "text-input",
    "bindings": { "value": { "source": "data", "scope": "insured", "path": "/guardianName" } }
  }] }
}
```

成员保费表达式直接放模板词法作用域，不用全局具名表达式隐式捕获 insured。dialog-editor.content 使用 `$use: insured-fields` 并显式传当前成员 Reference。数组操作用 button.activate → form.command，ScopeHandle 定位成员；新增次数不依赖 Reaction 执行次数。

```json
{
  "material": "button",
  "props": { "label": "提交申请", "variant": "primary" },
  "on": { "activate": { "type": "host.emit", "event": "travel.submitRequested" } }
}
```

片段不是可直接发布的完整 Definition；实施时补齐 Schema、规则、模板、确定 Catalog / 锁及 Host 契约后真实编译。当前 Compiler 只检查已配置 Binding 的名称和兼容性，不检查消费端口全部映射；Adapter 对漏映射和目标数据缺失都可能给 missing。不新增 requiredBindings，不虚称漏 Binding 已能编译失败；正式用例检查映射完整，写入失败沿既有返回和诊断。Request 漏映射仍由 Compiler 报 Error。

### 输入、确认、请求及校验呈现 {#first-assets-input}

物料消费 props / values / validation / slots，使用 set / command / emit / request。表达式由 Runtime 求值，不解析原始 AST、不读内部 Store、不保存第二份权威业务值。

| 交互 | 交付规则 | 编辑结束 |
| --- | --- | --- |
| 文本 | 普通输入交付字符串；清空为 `""`；不默认 trim | Runtime 当前文本 |
| 数字 | 完整十进制转有限数；空输入为 null；`-` / `1.` 等保留文本 | 合法数可规范显示；非法文本继续显示和报错 |
| 勾选 | 用户切换交付 boolean；missing / 非法值不自动写 false | 按 Runtime 展示，非法态可辨识 |
| 固定选项 | 选择交付 ID，清空为 null | 未知 ID 显示选项不可用，不静默换值 |
| 远程选项 | 搜索不写；选择后交付 Option，清空为 null | Runtime 选中值 |
| 日期范围 | 暂存未确认选择，确认交付，取消不写 | Runtime 当前两端 |

数字使用文本输入配合键盘提示；首期不接受指数、分组逗号或隐式空白转换。不安全解析时保留文本，不静默舍入。输入法组合态局部管理，结束交付最终文本。编辑缓存只服务当前交互；Host 改值时接受新值，不在后续失焦覆盖回旧缓存。

date-range 单个日期确认为严格 YYYY-MM-DD 或 null；无法解析的草稿留在弹层提示修正。两端合法但倒序可交付，由 Constraint 报错。打开期间 Host 改任一端，整组草稿重置到最新 Runtime 并提示再确认。

双端口连续两次 set，沿用即时、非原子语义，都检查 kind 及 executed.result.ok。第一端成功、第二端失败不能显示整体成功，应重读并报告局部失败。Adapter 不公开 Binding DataReference，不承诺物料自行拼通用批量端口 API。dialog-editor 内普通 Slot 输入实时写 Runtime；完成 / 关闭 / Escape 只关视图，没有整组回滚，不提供含糊的取消编辑承诺。

query / filterKey 改变时 cancel 旧调用、清空旧候选、拒绝排队的旧 UI 更新。桥接只管理请求交付资格，不管已展示列表。网络、防抖、鉴权、缓存、重试归 Host；error 不改选中值，discarded 不冒充网络故障。国家变化清城市由 Definition 显式 Reaction 写 city=null，导入数据的城市 / 国家一致性仍由约束或 Host 校验覆盖。

field 直接消费已发布 Issues，不新增 touched / dirty / submitted 系统。unverified 尚未校验，pending 进行中且可同时有 Issues，invalid 展示错误，incomplete 提示未完成，blocked 提示前置未满足，valid 仅为当前字段聚合有效。对象子树 Issues 可用于摘要，但根 Schema 来源也可能影响 status，不能作为成员完整证明。消息沿现有规则，技术异常不伪造 Constraint Issue。

### 复用 core 与新增同步函数 {#first-assets-functions}

已有 core.eq / ne 用于标量比较，gt / gte / lt / lte 用于确定数值，add / sub / mul / div 用于普通计算，and / or / not / if 用于固定逻辑 / 短路，exists 显式处理 Missing，length 用于长度 / 人数。不重复增加这些能力；金额和领域费率封装边界语义。

| 新函数及有序参数 | 输出 | 边界 |
| --- | --- | --- |
| text.isNonBlank(value:JSON) | boolean | 去除约定空白后非空字符串才为 true，不改原文本 |
| travel.isEligibleAge(age:JSON, agePolicy) | boolean | 范围内整数才为 true；0 合法，字符串 `"18"` 不转换 |
| travel.requiresGuardian(age:JSON, agePolicy) | boolean | 有效年龄低于成年阈值为 true；非法年龄 false，由年龄约束报错 |
| date.inclusiveDays(start:JSON, end:JSON) | integer/null | 含首尾；同日 1；非法、空值、倒序 null |
| travel.isTripRangeAllowed(start:JSON, end:JSON, maxDays:integer) | boolean | 两端合法且天数在 1–maxDays 内为 true |
| travel.personPremium(age:JSON, plan:JSON, days:JSON, ratePolicy) | MinorAmount/null | 尚不能试算为 null；合法输入按合成费率计算 |
| travel.totalPremium(insureds:JSON, plan:JSON, days:JSON, ratePolicy) | MinorAmount/null | 人数及所有年龄可试算才汇总，否则 null，不返回部分金额 |

接受 JSON 的参数真实声明 schema:true，不能先声明 number 再指望函数处理字符串。目录说明须区分声明允许的输入与业务期望类型：例如 age 期望非负安全整数，字符串、null、小数及超出承保范围的年龄按各函数约定返回 false / null；日期、计划、天数、成员数组同样写明期望值与无效值处理，并提供有效 / 无效输入对照示例。签名中的 `Parameters["参数名"]` 只是下方完整参数结构的类型引用，不是额外参数。agePolicy 为 `{minAge,maxAge,adultAge}`；ratePolicy 含 agePolicy、最大天数、人数上限和 basic / plus 的成人 / 未成年人日费率。政策 / 费率是受约束配置；结构与自洽性要验证，错误配置抛求值错误。maxDays 为正整数，金额 / 计数检查安全整数。

用户普通非法工作值按上述 false / null 退化；错误政策、非法费率、溢出抛求值错误。Missing 由 core.exists / core.if 显式处理。不读时钟、时区、网络、可变 Runtime 或隐含配置，不返回 Promise、NaN、Infinity 或 BigInt。

日期采用公历 0001–9999 年，严格 YYYY-MM-DD，检查真实月份 / 闰年，不宽松进位、不按经过毫秒数算天数。金额为 CNY 整数分，不隐式转字符串；单人及总价共用内部算法。试算只依赖年龄、方案、天数和政策；姓名 / 证件 / 监护人合法性与外部资格独立校验。

| 合成测试费率 | 未成年人每天 | 成年人每天 |
| --- | --- | --- |
| basic | 150 分 | 100 分 |
| plus | 250 分 | 180 分 |

basic、2 天、1 成人 + 1 未成年人为 500 分，不代表真实价格。非空、年龄、日期范围用于 Internal Constraint；监护人显示和必填分别使用相同判断；天数可用根级具名表达式，成员保费在模板局部 Props 计算。

总试算 Reaction 显式 watch 起止日期、方案、整个 insureds 数组，runOnActivate=true，写 estimatedTotalMinor。不能试算写 null 清旧价，不只跳过。固定政策用 Definition 显式 Literal，不藏 Context 后期待 Context 替换触发 Reaction。另以 Internal Constraint 检查保存总价与当前计算一致：同值导入不自动重跑 Reaction，导入旧价或外部覆盖不能伪装正确。真实报价和适用性由 Host 管理。

### 资产目录、包入口及版本 {#first-assets-organization}

```contract
id: ASSET-PACKAGING-001
status: active
applies_to: 新增、修改或移除物料和纯函数，以及调整聚合导出或包制品
requires:
  - 在独立资产目录维护 Manifest、实现和说明。更新行为与签名时同步版本声明、生成的聚合出口和受影响示例。
  - 静态 Manifest 与运行实现分别导出。只载入静态入口的消费者无需 UI 或 Runtime；物料和纯函数的实际制品应和源登记一致。
  - 用单资产 Manifest 取得预期 ID 和公开入口，在隔离安装的打包消费者中验证制品。继续核对代表性签名、静态入口隔离与真实运行。
checks:
  - assets.packages
```

公开资产在各包内平铺，每个物料 / 函数独立目录，含实现、manifest.ts、必要类型及 README。不按基础 / 展示 / 布局 / 复合强制分层；分类交叉，新增位置不依赖主观归类。函数目录带语义前缀，如 date-inclusive-days → date.inclusiveDays，逻辑身份由 Manifest 决定。目录移动不改 ID。

查找现有物料和纯函数时，以 Studio 的资产目录及同一目录生成器为入口。仓库中运行 `node tools/engineering/catalog-docs.mjs --lookup <id>`，按稳定 ID 读取当前 Manifest、实现入口、资产 README 和配置示例。内置函数从实际注册的绑定读取签名。签名改 Manifest，用途和边界案例改资产 README，目录展示和说明指针改包内 `catalog-docs.json`，表单配置例子改真实 Playground 场景。目录构建与 `--check` 沿用既有流程。

源码 `src/<asset>/`，测试按现有约定放 `tests/<asset>/`，不混入 src。简单资产不预建空 types / utils / index。内部共享放 _internal，不注册成公开资产；跨包测试仍在根 tests。每目录不等于 npm 包，不按目录数量预设拆包阈值。

```text
packages/materials-react/
  src/
    date-range/
      manifest.ts
      date-range.tsx
      README.md
    remote-select/
      manifest.ts
      types.ts
      remote-select.tsx
      README.md
    _internal/
    manifests.ts
    contracts.ts
    index.ts
    styles.css
  tests/
    date-range/date-range.test.tsx
    remote-select/remote-select.test.tsx

packages/pure-functions/
  src/
    date-inclusive-days/
      manifest.ts
      inclusive-days.ts
      README.md
    travel-person-premium/
      manifest.ts
      person-premium.ts
      README.md
    _internal/
    manifests.ts
    index.ts
  tests/
    date-inclusive-days/inclusive-days.test.ts
    travel-person-premium/person-premium.test.ts
```

manifest.ts 是机器契约唯一源，JSON 按需导出，不手工维护同内容 TS / JSON。人类可读说明维护在资产包的 `catalog-docs.json`，按资产 ID 组织，并由生成器关联 Manifest 的确定版本；它是目录展示元数据，不进入运行契约或执行制品摘要。

目录数据结构包含 `title / summary / category / implementation / annotations`；可选 `requestExamples` 按本地请求名保存按顺序排列的 `{title, description, value}` 示例步骤，用于解释参数来源、返回结构与后续选中写入。示例为说明数据，不替代 Manifest，也不自动执行请求。物料 Props、绑定值、事件及纯函数统一使用同一接口参考组件，完整展开枚举、对象、数组及可空分支，字段表递归关联说明；未限制内部字段的对象如实展示为开放对象，不编造字段约束。纯函数签名保留有序参数，参数结构图不代表改成对象传参；可变参数和同步返回单独说明。`valueExamples` 保存物料求值后的属性与绑定值示例，`callExamples` 保存纯函数的 args / result / description；配置引用示例继续来自工程 Definition。生成器检查嵌套字段、插槽、事件及示例覆盖，另对普通函数示例执行求值比对，对物料值示例做 Schema 校验。

Host 请求说明先展示完整函数签名，再将请求对象与返回对象的完整类型结构和字段表分别放在相邻区域；宽屏并排、窄屏上下排列，实际数据示例按需展开。表格用“对象，包含以下字段”说明根结构，不把 `$` 或“完整数据”伪装成业务字段。目录元数据中，`annotations` 为 `Record<JSONPointer, string>`，路径相对于该资产 Manifest，例如 `/parameters/0` 解释第一个参数，`/parameters/3/schema/properties/maxDays` 解释对象内字段，`/requests/search/payloadSchema/properties/query` 解释 Host 入参。每条说明应说明业务含义、单位或空值语义；类型、必填、枚举和边界从对应 Schema 读取，避免人工维护第二份校验契约。生成器检查路径存在、说明非空，并检查顶层属性、绑定、函数参数 / 返回值及 Host 请求字段说明覆盖；Studio 将说明与真实结构组合成表格。目录 API 仅在说明版本与查询的 Manifest 版本一致时附带说明。

已发布 Manifest 与制品不可原地补字段或重写摘要；给既有资产补目录说明不会改变旧发布的锁或 Prepared。将来若要把说明直接纳入运行 Manifest，需要按能力版本演进规则另行交付新版本，不能用同版本修改替代。README 说明交互和边界，工具图标 / 分类按需另加，不塞进严格 Manifest 未知字段。materials-react/manifests 为无 React 静态入口，根入口组织 React 实现 / 开发契约 / 显式注册，styles.css 由 Host 加载。纯函数有签名入口与显式实现注册，createCoreFunctions 不自动混业务函数。

Materials 只依赖 Protocol / Renderer 公共接入，不从 apps 反向导入，不增 host-sdk / shared / renderer-core。UI 日期解析与领域算法分别拥有内部实现，用相同向量对齐，不为少量复用突破依赖。样式与组件基础沿用[现有工程 UI 路线](engineering.md)，不另建公开 UI 包。

资产能力版本、包版本、实际制品身份分开；多个资产可共用包制品，不要求一起升能力版本。新增正式资产采用三段号：修复既定行为 PATCH，兼容可选扩展 MINOR，不兼容端口 / 必需输入 / 默认交付时机 / 计算口径 MAJOR。新增当前必须映射的 Request 通常不兼容，不能只按字段新增算 MINOR。版本不证明兼容，仍要测试和 review。

已发布 id + version 固定契约；交付代码变化产生新制品身份 / 摘要。目录维护当前源码，Git 追溯，旧 Manifest / 制品 / 锁保留不可变交付，不建 v1 / v2 / v3 源码副本。既有 core 版本不在本次重编号，工具不能追溯改变现有锁。

新 Catalog 经重检 / 重编进入新会话；旧表单不自动换实现，回滚必须取得旧制品，不只靠 Git 重编猜旧字节。同一表单及目标的装载注册表对同 ID 选一个确定版本。Platform Capability Registry 可以保留多个版本并供不同表单选择，见 [Platform 资产版本管理](platform-studio.md#platform-asset-versions)。生成器及资产 / 包编排见[工程工具方案](engineering.md#asset-tooling)。

### 批次、验收与 Host 路线 {#first-assets-delivery}

| 批次 | 交付 | 验收 |
| --- | --- | --- |
| 0 工程能力 | 模板、单一变更声明、资产检查、版本计划 / 应用；本地已交付 | text.isNonBlank 试点及临时工作区版本演练已有[证据](engineering.md#asset-tooling-implementation)，未在真实仓库应用或发布 |
| 1 输入呈现 | 文本 / 数字 / 勾选 / 固定选项、field / value-display / button；本地已交付 | 30 个物料测试、实际页面装配及三浏览器回归已有[证据](engineering.md#first-materials-implementation)：真实输入、非法态、错误、Host 改值、不重复写 |
| 2 组合成员 | section / grid / condition / dialog-editor / insured-summary、模板与数组操作；本地已交付 | [实施证据](engineering.md#member-materials-implementation)：多成员、移动删除、整替换、条件、摘要编辑、同实例 Profile、标签 / 弹层焦点与窄屏布局 |
| 3 复合交互 | date-range / remote-select、类型贯通的可控 Host；本地已交付 | [实施证据](engineering.md#interaction-materials-implementation)：确认取消、部分失败、乱序、父条件及卸载 |
| 4 业务纵切 | 七函数、规则联动、目标表单、可控外部校验；本地已交付 | [实施证据](engineering.md#business-travel-implementation)：试算一致、清旧价、完整结果与快照交付 |
| 后续 Host | 真实查询 / 核保 / 报价 / 草稿 / 提交 | 服务契约、权限、适用性、恢复和真实业务验收 |

验收页统一位于 Playground 的 `/demos/basic`、`/demos/members`、`/demos/interactions`、`/demos/travel`；旧 `/l4` 专用夹具已移除，Renderer 边界 / 生命周期继续由包内测试覆盖，正式场景承担浏览器回归。测试材料含成人单人、成人 + 未成年人、五人上限、空白草稿、非法值、缺失字段、未知选项、错误导入总价、双 Profile、可控成功 / 拒绝 / 技术失败 / 乱序 / 取消 Host，以及固定日期费率 Golden 数据。故障物料只作隔离测试。

| 正反例 | 预期 |
| --- | --- |
| 年龄 12 → `-` → 18；0 岁 | 数字 / 字符串 / 数字；非法报错；0 不当空且需监护人 |
| 姓名仅空白 | 保留原文本，非空 Constraint 失败 |
| 2028-02-28 至 2028-03-01；2027-02-29 | 3 天；无效日期 |
| 同日 / 倒序 / 超 30 天 | 1 天 / 非法 / 超限 |
| 日期取消 / 第二端失败 / 打开时 Host 改值 | 无写 / 不宣称整体成功 / 重置草稿重新确认 |
| 弹层关闭 / 隐藏监护人 | 已写值保留 / 不自动删值或取消规则 |
| 搜索 A 后 B，A 晚到 / 国家变化 | 不恢复旧列表 / 撤销旧搜索，业务清空由规则做 |
| B 移首再删 / 删除后旧返回 | 不误删 A / 不更新新成员或重建旧组件 |
| 试算失效 / 导入旧总价 | 写 null / 一致性约束发现错误 |
| 无 Issue 但必要外部校验未完成 / 等待时数据变 | 不视作提交就绪 / 完整结果 stale |
| 物料抛错 / DevTools 未连接 | 局部降级其他可用 / 业务结果不变 |

验证含函数 Golden、React 真实交互、真实 Compiler / Runtime 集成、浏览器端到端、无 React 契约消费者和隔离打包消费者。不能用直接 Command 代替输入验收。每批运行适用类型、测试、lint、构建、边界、打包与浏览器检查，复杂路径按 W3 深度审查；实际结果在交付时记录，本节不证明测试已通过。

Host 路线：固定 Catalog 编译 / 注册匹配能力 → 创建 Runtime → Renderer 挂载 → Request 候选 / External Constraint 核验 → host.emit 保存报价提交意图 → 必要同步收敛后完整 validate → 只用有效通过证明 snapshot 构造输出 → Host 检查报价适用性、权限和条件后提交。转换失败不改写引擎校验结论；外部任务新鲜度及取消归 Host，DevTools 保持独立只读。

本期无须重开 L1–L4；未来若要求双端口原子交付或整弹层取消回滚，另议对应行为，不能作为内部细化加入。真实产品 / 服务契约是后续业务验收前置，不阻塞已确认基础资产和可控场景交付。
