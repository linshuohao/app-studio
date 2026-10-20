---
id: DESIGN-INTEGRATION
title: 物料扩展与 Host 集成
type: design
status: active
layer: 跨层
modules:
- M04
- M15
tags: []
sources:
- SRC-EARLY
- SRC-L1
related: {}
last_reviewed: '2026-10-19'
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

平台组件实现、编辑器属性面板与发布加载信息归注册/工具体系，不因可复用就都加入 FormDefinition。Capability Registry 可以共同治理 Material 与 Pure Function 资产，但二者保留不同契约与执行职责；Host Services 在应用中注入，不强制托管到平台，也不合并成通用 UI Material。

纯函数不承担物料 UI 或校验状态；复杂同步判断可由 Constraint 调用领域 Pure Function，网络与副作用留给 Host。Manifest 只能声明契约，纯净性、端口行为与跨端语义仍需代码审查、契约测试和必要防护。

| 契约 | 需要设计与验证的内容 |
| --- | --- |
| Props | Props Schema、递归 ValueSpec、输入限制与业务校验的区别 |
| Binding Ports | 值类型、单/多端口、只读/编辑能力、复合修改及错误传播 |
| Slots | 槽位名称、基数、节点组合、默认插槽简写及平台兼容 |
| Event Ports | Payload Schema、有效 Event Reference、捕获上下文与受限 Intent |
| Field State 消费 | 沿既有 Binding 展示字段、对象摘要、数组项 Issues，不建立独立校验 DSL |
| Version / Platform | 确定性版本锁定、平台实现匹配、缺失能力诊断与升级规则 |

物料的输入 `maxLength` 是交互限制，真正的姓名长度规则仍在 Schema / Constraint。复杂组件的关键业务值不能长期藏在组件内部。

| 取舍 | 方向 |
| --- | --- |
| 能否访问 Runtime 内部 | 不可以，通过受控接口协作 |
| 是否支持复杂领域组件 | 支持，但要求明确 Props / Binding / Slot / Event 契约 |
| 是否建设完整插件生命周期 | 按真实接入需求设计最小生命周期 |
| 物料内部远程需求 | 注入 Host Services，Host 管请求与授权 |
| 是否默认全动态加载 | 根据发布模式决定，不预设为默认 |
| 是否建设独立物料市场 | 第一阶段不作为前置条件 |

**本层交付物与验收：**Manifest 类型与检查、注册/版本解析、平台实现接入、作者元信息和兼容测试；覆盖日期范围多端口、容器 Slots、上传回写、错误展示及缺失平台实现。

## Host / View Adapter：外部能力与业务集成 {#capabilities}

Reaction 仅承担协议内同步联动，不理解网络请求、取消、重试、超时或业务结果适用性。Host 自主管理报价等异步能力：观察所需数据、合并业务任务、管理请求及乱序返回，再通过普通 Command 写回。Reaction Pending 去重只针对 Reaction 实例；Host 请求是否合并由 Host 决定，不强制共用队列，也不新增异步 Reaction 或通用宿主任务调度协议。既有语义事件与 External Validation 接入职责不因此扩展为 Reaction 请求执行器。

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
| 物料内部服务 | Binding / Props + 外部服务契约 | 远端选项、文件上传等私有需求 |

Host 实现一般在运行时注册。L2 从外部 Constraint、`host.emit` 和 Material Manifest 声明的服务提取 Requirements；HostContract 可选，用于提前检查名称与 Payload。必需外部校验器未就绪时不能绕过提交义务；一般事件缺失的阻断时机和可选性继续固化。物料未声明的内部服务依赖无法由 L2 静态发现，见 [Host 注册与依赖边界](l2-preparation.md#l2-host)。

| 能力 | 典型场景 | 责任交接 |
| --- | --- | --- |
| Query / Resource | 城市列表、报价、搜索候选 | Host 观察依赖并管理结果；用户选择经 Binding / Command 写回 |
| Upload | 证件采集、文件上传 | 外部管理上传，最终业务值受控交付 |
| Business Operation | 保存草稿、提交录单、确认报价 | Host 执行，不能当作核心数据 Command |
| Context Provider | 用户、地区、渠道 | 提供只读上下文，不变成第二个数据写入入口 |
| External Validation | 唯一性、身份、资格 | Host 执行，Runtime 接受当前有效义务事实并汇总 Readiness |

插件不能无约束地拿到可变 Store；通过参数、只读快照、受控回写和显式报告协作。客户端能力注册不替代服务端权限验证。

分步填写、局部弹层与异步查询不需要完整工作流引擎。审批、核保和支付等长流程由 Host 集成外部 Workflow Service，不能为此向 L1 增加通用请求/工作流 DSL。

**本层交付物与验收：**Validator / Event / Host Services 契约、上下文与授权约束、回写和过期结果规则、错误恢复及提交一致性测试；覆盖后发先至、销毁后响应、数组项替换、同值往返和服务失败。

### 外部校验执行器的取消接入

External Constraint 接入选定“Host 返回结果任务及可选 cancel 句柄”。引擎按具体 Constraint 实例管理调用代次 / 任务身份，输入或前置资格失效、同实例新调用替换、Scope 删除及实例销毁时，先撤销旧任务的发布资格，再调用其可选取消句柄。成功与异常返回都必须核对实例存活、任务代次与输入资格；不能只依据全表版本变化取消无关任务，也不能仅比较值相同就接收 A→B→A 的旧请求。

版本与结果有效性是必要正确性契约；取消是尽力而为的资源优化，Host 可以不提供，也不保证网络请求终止。Host 负责实际请求及取消实现，引擎不理解 HTTP / 重试。取消回调要求幂等，任务完成或退出后释放句柄；取消异常只记诊断，不中断其他任务清理或恢复旧任务资格。被主动取消的旧任务不得再发布业务错误或成功，相关诊断与正常网络故障区分。

该能力属于运行时 Host Validator 接口，不将回调写入 L1 或可序列化 Prepared，也不引入异步 Reaction。本次不新增跨端取消信号抽象。完整调用的取消 / 过期返回类型、具体代次编码与 SDK 仍需固化，但不再重新选择取消接入方向。

业务查询等独立 Host 任务仍由 Host 自主管理，不共用 Reaction Pending。

### Host 接入与业务输出的已确认契约

校验规则 ID 标识声明与运行实例，Host Validator 使用独立、语义明确的能力名称，规则显式引用能力名称，不按规则 ID 猜测实现。不同校验语义使用不同能力名称；多条规则需要同一校验语义时可以引用同一能力，各自实例、代次与错误来源仍独立。具体引用字段、参数与签名在正式类型 / Prepared 契约中固化，本轮不伪造候选 Schema 已支持新字段。

Host 能力缺失按用途降级，开发 / 调试端明确报诊断，用户端不暴露未注册能力名、堆栈等技术错误，不因局部能力缺失默认阻止表单填写。可选埋点等可跳过，业务操作的降级由 Host 决定；适用校验器缺失必须记为未完成，不能静默当作通过。用户交互由 Host 以业务语言承接，用户无感知不等于伪造完整通过或放行未校验数据。

引擎完整校验只证明对应 Working Data 满足表单声明的全部适用校验，并向 Host 交付对应数据快照与结果身份；不负责构造或验证另一个业务请求输出。Host 自行转换、组装业务请求及执行所需输出检查，转换失败属于 Host 业务交付错误，不回写或改写引擎已完成的表单校验结论。表单业务本身需要正确的数据应在配置的数据模型、Binding、同步联动和约束中表达，不依赖提交时隐式修正。Normalized Output 如保留该术语，仅表示 Host 构造的业务提交数据，不是 Runtime 的第二份核心状态或新的通用输出 DSL。

确认与取舍见 [ADR-FE-012](decisions/ADR-FE-012-host-output.md)。
