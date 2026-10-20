---
id: DESIGN-DEPENDENCY
title: 跨层依赖与订阅
type: design
status: active
layer: 跨层
modules:
- M05
- M08
- M14
tags: []
related:
  decisions:
  - ADR-FE-004
  - ADR-FE-005
sources:
- SRC-DEP
- SRC-V05
- SRC-V06
navigation:
  group: 06 · 横向能力
  order: 70
last_reviewed: '2026-10-19'
reading_next: DESIGN-INTEGRATION
---

# 跨层依赖与订阅

本篇定义贯穿 L1 声明、L2 编译、L3 变化匹配与 L4 挂载的依赖契约。先区分读取、触发和活跃订阅，再看计划、身份、投递与生命周期。

## 范围、状态与三个概念 {#dependency-baseline}

本专题连接 [L1 表达式与约束](l1/03-expression-validation.md#expression)、[L2 静态编译](l2-preparation.md#l2-dependencies) 和 [Runtime](l3-reactive-engine.md#runtime) / [Renderer](l4-renderer.md)，解决各类消费者重复发现依赖的问题。各层完整职责、能力治理和发布机制仍在原主题维护。

| 概念 | 回答的问题 | 例子 | 所属阶段 |
| --- | --- | --- | --- |
| Read Dependency | 计算可能读取什么？ | 保费表达式读取年龄与产品 | L1 声明，L2 分析 |
| Watch Dependency | 哪些变化需要让行为响应？ | 年龄变化触发保费联动 | 按 L1 使用位置显式声明或静态推导 |
| Subscription | 哪个消费者现在正在观察？ | 已挂载输入框观察当前数组项 | L3 登记，消费者管理生命周期 |

读取不必然构成触发：按钮 Payload 读取年龄，年龄变化不应自动发出按钮事件。静态计划不等于活跃订阅：编译了一百个 View 节点，此刻可能只挂载十个。Expression 只描述计算，不独立拥有订阅生命周期。

完整的跨模块未决问题见[设计进展](governance.md#layer-progress)。

| 状态 | 本轮处理 |
| --- | --- |
| 设计基线 | 三类概念分离；按类型递归分析；统一变化匹配；业务规则与 View 激活分离 |
| 本次草案修订 | External Constraint 的 `dependsOn` 统一为 `watch`；合并其 `when` 的可见读取依赖 |
| 结构方向 | PreparedForm 携带 Dependency Plan；按计划或明确引用建立订阅 |
| L3 执行基线 | Command 即时不可变更新；Reaction 同实例 pending 合并、读最新状态，内部级联归当前 Flush |
| 已确认 | L1 / PreparedForm 双结构，L3 唯一执行入口；显式 watch 不被建议静默改写；可隔离错误继续独立行为；整体 Flush 熔断 |
| 现行已确认 | 逐 Command 前后 Root / Scope；候选后比较观察值；新实例按 runOnActivate，已有规则常规执行只因有效 Watch 变化；稳定 snapshot，业务 Baseline / Dirty / Reset 归 Host；执行事件与数据订阅分开 |
| 推荐 | Object.is 观察值比较、Trie / 路径模板、临时旧 ScopeReadView 与位置型匹配 |
| 校验方向 | 匹配时去重登记 Constraint Pending，正常联动后执行根 Schema / 本轮前置链；字段 Issue 聚合，完整校验另覆盖全部适用约束；编译补全依赖与前置共同入队已确认 |
| 待固化 | ABI、稳定快照与完成观察、状态引用 / 求值、激活字段形状、队列实现、熔断恢复接口、Validation / Submit 与 View 粒度；不设计核心 Dirty / Reset 重算入口 |

## 原始协议与编译后协议：一条执行路径 {#dependency-compiled-protocol}

“两份协议”表示职责不同的两种结构，不是复制同一份 JSON，也不要求业务作者手工编辑 PreparedForm。Authoring / Canonical 仍属于同一 L1 语义的表示形式；本次不改 L1 顶层结构，不以阶段归档版本充当正式 Protocol Version。

| 维度 | FormDefinition · 原始定义 | PreparedForm · 编译后协议 |
| --- | --- | --- |
| 消费者 | 作者、配置编辑器、版本审查、L2 | L3 Runtime / L4 Adapter |
| 目标 | 业务意图清晰、可编辑审查 | 确定执行计划与较低运行解析成本 |
| Reaction | 显式 watch / when / then | 已解析观察计划与 Command 执行计划 |
| Expression | AST 与命名 use | 解析、验证、预处理后的求值描述 |
| Scope | 词法 Binder 与逐项关系 | 静态绑定计划；真实实例仍由 L3 建立 |
| 能力 | Material / Pure Function 引用与要求 | 确定能力绑定、锁定信息、Host Requirements |
| 诊断 / 来源 | 作者接受或驳回修改建议 | 可关联 Diagnostic / 源位置；具体 Source Map 是推荐方向 |
| 版本 | 业务 Definition / L1 Protocol | Compiler / Prepared ABI / Capability 兼容要求 |

唯一执行路径是 **L1 → L2 → PreparedForm → L3 → L4**。L2 可在编辑期、发布期、服务端或客户端加载时调用；客户端入口若接收原始定义，也必须先调用 L2，再把结果交给 L3，不能形成“解释原始 L1”和“消费 PreparedForm”的双轨运行语义。ABI 或能力兼容失败需要明确诊断，不静默退回原始配置解释器。

L3 根据编译时已确定的 Dependency Plan 匹配实际 Change，不再次分析原始 AST 来补齐 Reaction.watch。它仍负责实际 Scope 实例、最新数据求值、Command 修改与运行保护；PreparedForm 可带 L1 身份及来源信息，但不持有用户数据或已激活观察者。正式 JSON / 二进制封装、字段与兼容矩阵由 [L2 ABI 契约](l2-preparation.md#l2-compile) 固化。

## 显式 Watch 与作者确认的编译建议 {#dependency-watch-review}

Reads 是计算可能使用的输入，Writes 是 Command 可能修改的目标，Watch 是作者确定的触发意图。状态计算的 Reads 与 Watch 常常相近，清空选项等变化驱动操作却可能完全不读取触发字段。自动分析能提示风险，不能代替作者决定何时执行。

下面保费规则读取 age 和 rate，但只在 age 变化时重算。片段使用现行 Canonical Reference；来源附件的字符串路径是 Authoring 示意，不新增第二套规范结构。

```json
{
  "id": "calculate-premium",
  "watch": [{ "source": "data", "path": "/age" }],
  "then": [{
    "op": "set",
    "target": { "source": "data", "path": "/premium" },
    "value": { "$expr": {
      "op": "insurance.calculatePremium",
      "args": [
        { "ref": { "source": "data", "path": "/age" } },
        { "ref": { "source": "data", "path": "/product/rate" } }
      ]
    } }
  }]
}
```

```text
编译后观察计划：watch = [data:/age]，activation = runtime
编译后执行计划：解析 set 目标、ValueSpec 与已锁定纯函数绑定
静态分析结果：reads = [data:/age, data:/product/rate]
              writes = [data:/premium]
编译诊断：读取 rate 但未列入 watch；建议补充，autoApply = false
```

作者可以补充 rate，也可以确认只希望年龄变化时重算；接受修改后回写 L1、重新编译，再预览 / 发布。L3 只使用当前确认定义对应的观察计划，不读取“建议 watch”替换执行依赖。Reads 缺 Watch 是建议 / 风险提示，不能单凭差异判为非法；Watch 中不被计算读取的字段也不能自动删除。

编辑器复用同一 L2 能力完成“编辑 → 分析 → 诊断 / 建议 → 作者确认 → 重编 → 发布完整校验”，不另建平行规则检查器。编辑期增量、容忍不完整配置与发布期全量检查的具体方案是推荐方向，详见 [L2 编辑闭环](l2-preparation.md#l2-authoring-diagnostics)。这项决策只约束 Reaction；Constraint / View 继续按各自使用位置自动推导观察关系。

## 四层分工与激活归属 {#dependency-layers}

```diagram
{
  "id":"figure-reactivity-layers",
  "title":"静态依赖统一编译，活跃订阅分别管理生命周期",
  "rows":[
    [{"title":"L1 · Definition","body":"Expression / Constraint / Reaction / View / Scope；使用位置决定触发语义"}],
    [{"title":"L2 · Preparation","body":"递归读取分析 → 使用位置解释 → Scope 解析 → Dependency Plan"}],
    [{"title":"L3 · Runtime","body":"Data / Runtime State + Reactive Engine；按来源、引用、实例匹配活跃订阅","major":true}],
    [{"title":"Runtime 消费者","body":"L3 随 Form / Scope 激活 Reaction 与 Constraint"},{"title":"View 消费者","body":"L4 随挂载、更新、卸载订阅 / 释放"},{"title":"Host 消费者","body":"Host 随业务对象生命周期观察，受控写回"}]
  ],
  "arrows":["↓","↓","↕ read / dispatch / subscribe"],
  "note":"统一的是依赖计划与观察入口；业务策略、首次执行、生命周期和调度时机仍由各消费者契约决定。L4 不重写依赖分析或匹配引擎。"
}
```

| 消费者 | 激活方与生命周期 | 变化命中后的行为 |
| --- | --- | --- |
| Reaction | L3；FormRuntime / Scope 实例 | 合并 pending，Flush 中读取最新状态，判断 when 并按序执行 then |
| Internal Constraint | L3；FormRuntime / Scope 实例 | 重新求值适用条件和断言，维护 Issue |
| External Constraint | L3；FormRuntime / Scope 实例 | 使旧结论失效；是否请求 Host 由校验策略决定 |
| View Binding / 动态 Props | L4；实际挂载的 View 实例 | 使当前投影失效，读取最新状态并交给 UI 框架 |
| Host Observer | Host；调用方业务对象 | 执行宿主逻辑；需改数据时提交受控 Command |

L3 的基础协作角色可概括为 Data + Reactive Engine；Reaction、Validation 是具有不同语义的消费者。这个概括保留 Scope、求值、生命周期和有效性职责，不要求新增多个平级业务引擎。L4 无需代替 Runtime 手工注册业务 Constraint。

## L1 使用位置：从读取到触发 {#dependency-usage}

L1 的权威规则见 [表达式使用位置矩阵](l1/03-expression-validation.md#expression)。本专题以以下区别解释整条处理链：

| 位置 | 读取是否形成自动观察 | 语义 |
| --- | --- | --- |
| Reaction.watch | 显式触发 | 保持原有 watch，不追加 when / then 的读取 |
| Reaction.when / then ValueSpec | 否 | 命中 watch 后门控 / 执行命令时求值 |
| Internal Constraint.when + assert | 是 | 二者所有可能读取的输入均影响结果 |
| External Constraint.watch + when | 显式声明与自动读取合并 | Host 不透明输入由 watch 补充；只表示旧结果何时失效 |
| View Binding / 动态 Props | 是 | 当前值、动态禁用及物料声明的可见性投影随变化更新 |
| Material / Host 事件 Payload | 否 | 事件实际发生时求值，不因输入变化发出事件 |
| ScopeBinder.from | 结构性关系 | 维持绑定及数组实例创建、销毁、重排 |

Constraint 的 `issue.target` / external `target` 是归属位置，不能充当唯一读取依赖，也不因作为目标而自动加入 watch。External Constraint 当前没有 Payload 字段；来源稿关于“可见 Payload 输入”的合并原则只适用于将来正式引入的合法输入位置，本次不扩展协议。

命名统一不等于对象结构统一：Reaction 仍是 watch / when / then，Constraint 仍是适用条件与断言 / 外部义务，View 仍是 Binding 与 Props。`watch` 说明何种变化需要响应，不规定何时执行回调。

### 跨字段条件校验与联动示例

以下是协议片段，假设 Schema 与相应 Pure Function / Material 契约存在。沿用现有样本的内置短 ID；`core.*` Canonical 映射见 [L2 命名规则](l2-preparation.md#l2-function-identity)。

```json
{
  "expressions": {
    "isMinor": {
      "op": "lt",
      "args": [{ "ref": { "source": "data", "path": "/applicant/age" } }, 18]
    }
  },
  "reactions": [{
    "id": "recompute-premium",
    "watch": [
      { "source": "data", "path": "/applicant/age" },
      { "source": "data", "path": "/product/id" }
    ],
    "then": [{
      "op": "set",
      "target": { "source": "data", "path": "/premium" },
      "value": { "$expr": {
        "op": "insurance.calculatePremium",
        "args": [
          { "ref": { "source": "data", "path": "/applicant/age" } },
          { "ref": { "source": "data", "path": "/product/id" } }
        ]
      } }
    }]
  }],
  "constraints": [{
    "id": "guardian-required",
    "kind": "internal",
    "when": { "use": "isMinor" },
    "assert": {
      "op": "notEmpty",
      "args": [{ "ref": { "source": "data", "path": "/guardian/name" } }]
    },
    "issue": {
      "target": { "source": "data", "path": "/guardian/name" },
      "code": "GUARDIAN_REQUIRED"
    }
  }]
}
```

保费 Reaction 观察显式年龄和产品；监护人 Constraint 自动观察年龄与姓名。只修改年龄也必须重评估 Constraint：条件 false → true 时可能新增 Issue，true → false 时移除该规则实例的旧 Issue。不能因 `issue.target` 只指向姓名，就漏掉年龄的影响。

## L2 递归分析与使用位置编译 {#dependency-analysis}

输入为 Definition、确定的能力契约与目标；输出为 Prepared Expression / ValueSpec、Dependency Plan 和 Diagnostics。逻辑步骤是类型引导的读取分析、使用位置解释、Scope / 模板绑定解析、检查及打包，可共享遍历，不强制分成多个服务。

| 结构 | 分析要求 |
| --- | --- |
| Expression.ref | 校验来源、词法可见性与路径，记录读取引用 |
| Expression.use | 递归分析命名表达式；A → B → A 为编译错误；不允许捕获调用方局部 Scope |
| Expression.op + args | 递归分析全部参数；不执行 Pure Function，不分析其外部源码 |
| ValueSpec | 递归对象、数组与合法 `$expr`；`$literal` 内容是普通数据 |
| 条件 / 短路计算 | 保守合并所有可能分支的读取，不依赖当前运行值裁剪 |
| Binding / Scope / Template | 解析数据端口、结构依赖和 Typed DataReference 参数；保留 each 模式 |
| 普通 JsonValue / Schema / 原始 Payload | 不按恰好出现的 ref / $expr 属性扫描成表达式 |

例如 `and(use(isMinor), notEmpty(ref(/guardian/name)))` 读取年龄和姓名，即使运行时短路，静态读取集也覆盖二者。内部分析器可以分类为 literal / ref / use / call；这不改变 L1 的 `op + args` 语法，也不新增 conditional 节点。

分析缓存须考虑词法 Scope、模板参数绑定和编译上下文，不能仅以表达式名称跨环境复用。Pure Function 接收整个对象时，保守视为该对象子树依赖；它不应通过隐藏可变状态增加输入。Schema 能精确推导时使用局部依赖，不能精确证明的条件约束退化为对应对象 / 子树观察。

将来若支持动态路径，必须给出明确依赖契约或编译报错；不能静默遗漏。循环检测仍区分符号引用环、合法 Schema 递归和潜在 Reaction 触发环，见 [L2 环检测](l2-preparation.md#l2-dependencies)。

## 最小 Dependency Plan 与交付边界 {#dependency-plan}

Dependency Plan 是 PreparedForm 的静态产物，Observation Plan 是来源稿中的同义表述。本篇统一使用前者；计划条目可称 PreparedObservation。以下只表达信息需求，不冻结 TS 字段或 ABI：

```typescript
interface PreparedObservation {
  id: string;
  owner: { kind: 'reaction' | 'constraint' | 'view'; id: string };
  watch: PreparedDependency[];
  scope?: PreparedScopePattern;
  activation: 'runtime' | 'view-mounted';
}

interface PreparedDependency {
  source: 'data' | 'context' | 'validation' | 'field-meta';
  reference: PreparedReferencePattern;
  aspect?: 'value' | 'structure';
}
```

`source` 是运行时可观察状态类别的候选表示，**不扩展 L1 Reference.source**。数组结构是 Data 的观察方面；来源稿把 structure 列为独立来源的表示仍是候选，正式 ABI 再决定编码，不能同时把它当成第二个权威状态源。Validation / Field Meta 引用也需要 L3 契约，不能直接写进 L1 Binding。

概念上，guardian-required 的计划关联年龄和姓名、owner 为 constraint、activation 为 runtime；guardian 输入框的 disabled 计划关联年龄、owner 为 view、activation 为 view-mounted。`activation` 只说明由谁激活，不表示通知优先级，也不规定订阅后首次执行。

首次执行策略在 已确认可配置，需要 L1 表达、L2 编译；它与本段 activation 表示的“生命周期归属”分别设计。来源 `runOnActivate` 与 Prepared `run-on-activate` 的具体字段 / 默认值未冻结，不能把两种 activation 含义混写为同一正式 ABI。

| 静态产物保存 | 留给运行时 |
| --- | --- |
| 引用模式、状态类别、结构观察、词法 Scope 关系 | 数组成员、实例身份、当前数据与校验结果 |
| 行为身份、Prepared 求值引用、激活归属 | 回调、组件、DOM、宿主对象 |
| View 与计划的关联 | 挂载状态、通知队列、框架优先级 |

Prepared View 可引用计划 ID，也可内嵌紧凑依赖集合；节点合并或按属性拆分是可比较的粒度方案，不建立两套语义。该信息归入既有 Form / View Plan 交付，具体打包位置和 `formatVersion` 兼容校验需随正式 Prepared 格式确定。

## Scope：静态模式、真实实例与视图实例 {#dependency-scope}

L2 知道关系模式，L3 知道真实数据实例，L4 知道实际挂载的视图实例。对 `from: /insureds, as: insured, mode: each` 的逐项约束，L2 记录 insured.age → 该项 Constraint 的模式，不展开当前数组：

```text
静态：insured(each).age → insured(each) 的 Constraint
实例：A.age → Constraint A；B.age → Constraint B；C.age → Constraint C
视图：只有挂载的 A / C 行创建自己的 View Subscription
```

| 数组操作 | 必须保持的关系 |
| --- | --- |
| 插入 | L3 新建 Scope 实例并激活业务规则；L4 若挂载新行再建立 View 订阅 |
| 删除 | L3 释放实例规则、无效订阅、校验与请求适用性关联；L4 卸载相应视图 |
| 移动 | 保留数据实例身份；订阅、Issue 和组件不能改绑为原下标的另一项 |
| 现有成员对象替换 | 保留该行身份，子观察值逐项比较，嵌套结构另行处理 |
| 整组替换 | 已确认销毁旧成员并创建新 Scope，即使数据完全相同也不复用身份；按新实例激活策略处理，不按业务 ID / 内容匹配 |

父子路径、整对象替换、数组成员值和结构变化都应正确匹配。已确认 Scope Index 保存父 Scope、相对集合位置和本层位置，绝对路径按需解析；父项移动不重写全部后代。相对观察在前后状态沿同一 ScopeId，固定绝对路径沿同一物理位置。具体比较和位置型匹配按推荐方案验收，详见 [L3 Scope Index](l3-data-scope.md#l3-scope-index)。词法与 Handle 仍见 [L1 Scope](l1/02-data-reference-scope.md#scope)。

## L3 读取、修改与订阅入口 {#dependency-runtime-api}

```typescript
// 职责草图；引用、Scope、返回值及快照一致性契约仍待正式定义。
interface FormRuntime {
  read(ref: RuntimeReference, scope?: RuntimeScope): unknown;
  snapshot(): FormData; // 稳定只读数据快照；无自动 Flush / Baseline / Clean
  dispatch(command: Command, scope?: RuntimeScope): MutationResult;
  subscribe(target: SubscriptionTarget, callback: () => void,
    options?: SubscribeOptions): Unsubscribe;
}
type SubscriptionTarget =
  | { planId: string; scope?: RuntimeScope }
  | { refs: RuntimeReference[]; scope?: RuntimeScope };
interface SubscribeOptions {
  flush?: 'sync' | 'deferred'; // 旧通知选项候选；不表示 Reaction Flush 的调度方式
}
```

计划入口供 Runtime 规则与 L4 复用 L2 产物；明确引用入口供 Host、动态 UI 适配和调试器临时观察。两者共用匹配能力，不要求 Host 先新增 L1 View。返回的释放函数由消费者管理，实例销毁后不再保留无效回调。

这里展示数据 / 状态订阅，不把 Reaction executed、Flush aborted、Error 等执行事件塞进 Data Trie。Host / Devtools 通过独立执行事件观察或 Trace 消费，具体 API 待固化；业务 `host.emit` 也与这些执行诊断事件分别解释。View / Host 可共同使用 Scope Resolver，L4 不自行维护移动后的物理路径改绑。

上面的 `SubscribeOptions.flush` 仅保留早期消费者通知选项的候选位置，命名和语义均未冻结，不能用它覆盖已确认的 Reaction 调度基线。正式接口需要避免与“一轮 Flush”混淆。

`read(ref)` 只示意读取状态引用，不能据此宣称已解决 Prepared Expression 求值。动态 Props 必须经统一求值能力或共享适配契约获取，L4 不独立实现业务表达式。正式求值与快照 API 是后续交付。

## L3 变化匹配与不同消费语义 {#dependency-delivery}

```diagram
{
  "id":"figure-reactivity-delivery",
  "title":"变化统一匹配，消费者分别响应",
  "rows":[
    [{"title":"Command / 受控状态入口","body":"数据只能经受控命令写入；Context 与校验报告各走相应状态入口"}],
    [{"title":"Data / Scope 与其他 Runtime State","body":"单条 Command 内一致提交 Data + Scope，临时保留旧新读取视图；校验报告另走状态入口"}],
    [{"title":"Reactive Engine","body":"按来源 / 路径 / Scope 定位候选，再比较逻辑观察值或处理生命周期","major":true}],
    [{"title":"Reaction / Constraint","body":"联动可再次 dispatch；校验维护状态并使旧结论失效"},{"title":"View / Host","body":"接收失效信号，重新读取最新状态；UI 更新交给 L4"}]
  ],
  "arrows":["↓","↓","↓"],
  "note":"候选命中不等于观察值改变；相对 Scope 与绝对位置分别读取。不同状态来源隔离，执行事件不进 Data Trie；回调交付时机另行固化。"
}
```

只更新 Validation Issue 不应触发仅观察 Data 的 Reaction。Reaction 产生的新 Command 仍走统一数据入口，不能旁路写 Store。外部观察者收到的可以是“当前投影可能失效”信号，随后读取最新状态；Reaction 自身也已明确为状态收敛语义，同一 pending 实例多次失效可以合并，执行时读取最新值。显式 Command / Host 事件的次数不因此合并。

External Constraint 要分开三件事：依赖变化立即使旧结论不再可信并可登记校验 Pending；blur、显式 validate、submit 或待固化的自动策略决定是否请求 Host；返回成功 / 异常都核对有效输入、请求代次与 Scope 实例，过期结果不得覆盖当前状态。请求、重试和取消仍归 Host。

明确匹配完成后只消费本轮校验 Pending，不在 Runner 扫描全部 Constraint 再查读依赖；根 Schema 保守登记整份数据待校验。Reaction 正常收敛后执行根 Schema 与本轮有序 Constraint，前置检查不新增结果反向 PubSub。字段 Issue 聚合属于结果消费，不能重新触发 Data-only Reaction；完整校验显式覆盖全部适用规则。Validation 由 L2 补全可推导读取与前置传递依赖，L3 从命中任务递归补齐前置实例，使用本轮结果；不要求作者重复声明可推导依赖，未知 Host 依赖仍须显式提供。该规则不改变 Reaction 显式 Watch，也不代表立即发送外部请求。具体 [校验链、结果与新鲜度](l3-validation.md) 不在本篇复制。来源的 requires / validationMessages / PreparedValidation 仍是待固化方向。

初始化校验、主动校验、首次 View 读取和 Reaction 是否初始化执行都有独立入口。`subscribe` 本身不隐含“注册时必然执行一次”；初始数据已违反 Constraint 也必须能被初始化 / 主动校验发现。

常规 Reaction 的新增失效严格来自有效 Watch 变化；业务结果不符预期、Host Reset 意图或读取 snapshot 均不构成触发。runOnActivate 只在新实例首次建立时独立应用，既有实例不借它主动修复结果。Host 自选业务快照 / Dirty / 恢复 Command；snapshot 不隐式 Flush 或标 Clean，是否等待已有任务完成由 Host 所需场景及完成观察契约决定。详见 [四条职责原则](l3-reactive-engine.md#l3-runtime-host-boundary)。

用户已明确本次 Context 保持原有契约：L1 Command 只写 Data、Reaction.watch 只接受 DataReference，Context 对表达式只读。运行时订阅草图中的 Context / Field Meta 等候选状态类别不等于新增 L1 Watch；Field Meta 也不因此承诺核心 Dirty 或编辑来源分类。

单条 Command 内取得稳定 before / after ReadState，索引只定位可能受影响的观察者，再按观察粒度比较。推荐 Object.is / 存在性判断：整对象新引用可保守失效，内部 age 相同的观察可跳过；不能深比较全表或缓存上次 Reaction 参数替代逐 Command 检测。结构变更的旧 Scope 位置只在本次比较保留，不放进 pending，不沿规则链传播 ScopeChange；新旧实例的销毁 / 激活分别处理。完整机制与伪代码见 [L3 变化检测](l3-data-scope.md#l3-change-detection)。

内部可采用路径列表、结构化变化记录或 Store 事件；有效 Data Change、Flush、临时 Context 与异常报告职责见 [L3 所有权](l3-reactive-engine.md#l3-ownership)。不再引入局部长期 Health 传播；底层版本、ID 和事件编码仍待固化，不向 L1 加入执行字段。

## L4 方案选择与挂载生命周期 {#dependency-view}

| 方案 | 收益 | 代价与结论 |
| --- | --- | --- |
| L3 初始化时预注册全部 View | 表面上统一激活 | 隐藏和虚拟列表节点承担无效成本；不作默认方案 |
| L4 自行解析 AST 并监听 Data | 框架可自主组织 | 重复 L2 分析，跨端语义容易漂移；不采用 |
| L2 编译 + L4 挂载订阅 | 静态语义统一，按需激活 | 要求稳定 L3 订阅 / 读取契约；本次采用的方向 |

例：insured 项的 Input Binding 读取 guardianName，动态 disabled 读取 age。L2 为其准备两条关系；L4 挂载时用当前 Scope 激活计划，随后经共享求值入口刷新。按节点合并或按 Binding / Props 拆分仍待测量。

```json
{
  "scope": {
    "from": { "source": "data", "path": "/insureds" },
    "as": "insured",
    "mode": "each"
  },
  "node": {
    "material": "text-input",
    "bindings": {
      "value": { "source": "data", "scope": "insured", "path": "/guardianName" }
    },
    "props": {
      "disabled": { "$expr": {
        "op": "gte",
        "args": [{ "ref": { "source": "data", "scope": "insured", "path": "/age" } }, 18]
      } }
    }
  }
}
```

片段假设数组项字段及 text-input 的 disabled 契约已声明；它只展示 Scope / Binding / Props，业务 Constraint 仍在 Form 层独立声明。

```typescript
// 生命周期示意，不是可直接替代框架 Store Adapter 的实现。
function mountPreparedView(runtime, node, scope) {
  const unsubscribe = runtime.subscribe(
    { planId: node.observationPlanId, scope },
    () => invalidateNode(node.id)
  );
  refreshNodeFromRuntime(node, scope);
  return () => unsubscribe();
}
```

| 阶段 | 责任 |
| --- | --- |
| Mount | 绑定真实 Scope，订阅当前计划，取得最新快照 / 求值结果 |
| Update | 普通变化按框架协议重读；节点、计划或 Scope 改绑时释放旧订阅并建立新关系 |
| Unmount | 释放 View 订阅与局部 UI 资源；不删除数据或共享业务规则 |

正式 React / Vue / Flutter 适配器需满足各自的一致性要求，防止订阅与首次读取之间、改绑交接期间发生变化而漏更新。示意代码的调用顺序不构成框架快照一致性保证。

条件渲染时，决定子树是否出现的父级条件观察者必须存活；子组件尚未挂载时由父级 / 容器持有它，否则条件变 true 也无人创建子视图。这里的可见性使用合法动态 Props 或容器契约，不新增通用 `visibility` 协议字段。

虚拟列表只为可见行建立 View 订阅，未挂载行的业务 Reaction / Constraint 仍由 L3 激活。切换 Profile 只更换 View 订阅和局部状态；PC / Mobile 若共享同一 FormRuntime，就共享业务数据与规则，不能随 View 切换反复创建或销毁校验义务。Focus、Hover、展开、动画、布局和局部缓存归 L4，业务值与 Issues 归 L3。

## 执行时机：已确认基线与未决边界 {#dependency-scheduling}

| 维度 | 当前方向 | 状态 / 边界 |
| --- | --- | --- |
| 数据写入 | 有效 Command 同步生效，不可变 Root + 结构共享 | 已确认；单次结构操作保持身份一致 |
| Reaction 调度 | 延迟一次启动，随后同步执行到结束或保护停止 | 已确认；具体启动点、精确排序待固化 |
| Reaction 交付 | 同实例 pending 合并，执行时读最新状态，执行后可重新入队 | 已确认；内部级联进入当前 Flush |
| batch / then | 按序实时写入，不默认整组原子回滚 | 可隔离单 Command 错误继续独立行为已确认；准确错误类型 / 接口待固化 |
| 超限边界 | 整个 Flush 统一预算与熔断 | 已确认；暂停后续自动联动，保留填写和独立完整校验，恢复接口待固化，不做局部影响链 |
| 消费者通知 | 数据写入、失效登记与回调交付分别设计 | 同步写回归当前轮并沿用整体保护已确认；跨消费者交付细节留给实现 |
| View 粒度 | 按 Node / Binding / 属性拆分 | 共享静态语义，性能测量后决定 |
| 变化记录 | 有效 Change 与有序 Trace 保留来源 | 底层路径 / 事件编码、记录预算和截断待固化 |
| 求值接口 | Prepared Expression 的值与快照如何读取 | 统一能力；正式 API 待设计 |
| 外部校验 | 失效后立即请求 / 按策略请求 | 本轮只确定失效与请求分离 |

Reaction 的 Command 同步、受控、有序，外部 dispatch 后可以立即读到已写 Data；这不表示所有联动、校验与 UI 绘制都已完成。两条显式 array.insert 保留两次动作；两次 watch 失效命中同一 pending Reaction 可以合并。需要逐次记账的动作由明确 Command / Host 事件表达，取代旧稿“Reaction 必须保留每次中间触发”的假设。

多个 Operation 可共用 scheduled 轮次；Flush 内新 Command 的失效继续本轮，结束后的异步 Host 写入进入下一轮。同步回调写回归当前轮，沿用去重与执行预算，不另开轮次或重置计数；不新增通知延迟队列要求，具体调用栈安全由实现验收。微任务不保证先绘制，耗时同步函数不可强制抢占。

完整 Flush、错误、身份与生命周期约束见[L3 数据与执行](l3-reactive-engine.md)。

## 贯穿四层的交互与验收 {#dependency-acceptance}

场景：年龄从 20 改成 16，监护人姓名为空，监护人子视图尚未显示，年龄同时参与保费联动。

| 逻辑事件 | 层级与结果 |
| --- | --- |
| 定义与编译 | L1 声明 isMinor、保费 Reaction、姓名 Constraint 与动态 View；L2 编译相关计划 |
| 实例初始化 | L3 建立 Working Data、Scope 与业务规则观察，并通过明确入口处理初始校验 |
| 初始挂载 | L4 挂载年龄 Input 与父条件观察者；监护人子节点尚无订阅 |
| 修改年龄 | L4 经 Binding 提交 set；L3 更新 Data，匹配活跃观察者 |
| 业务响应 | Reaction 按契约重算保费并可产生新 Command；Constraint 发现姓名为空，维护 Issue |
| 条件与子视图 | 父观察者重读条件、挂载监护人区域；子 Input 绑定 Scope 并建立自己的订阅 |
| 校验展示 | 已挂载视图观察对应 Validation State，显示当前错误 |

表格表达必须发生的逻辑事件，不冻结 Reaction、Constraint 与 UI 通知之间的精确同步先后。原稿的逐步演示归并为这张时序表，沿用项目统一阅读样式。

| 验收场景 | 必须证明 | 层级 |
| --- | --- | --- |
| 深层 ValueSpec / 嵌套 Expression / Named use | 收集全部合法的可能读取；Literal 不被误识别 | L1 / L2 |
| Named Expression A → B → A | 编译错误，不进入运行时 | L2 |
| Reaction.when 读 watch 外字段 | 单独修改它不触发 Reaction | L1 / L2 / L3 |
| Constraint.when 读 age，assert 读 name | 任一变化均可重评估；条件不适用时旧 Issue 清除 | L1 / L2 / L3 |
| Issue 目标与读取字段不同 | 目标只管定位，不漏掉真正输入 | L1 / L2 |
| External 隐藏 Host 输入 | 显式 watch 补充；变化失效但不隐含请求 | L1 / L3 |
| Event Payload 读 age | age 变化不发出事件 | L1 / L2 / L3 |
| View 未挂载 / 虚拟列表 / Profile 切换 | 没有多余 View 订阅，业务规则仍有效 | L3 / L4 |
| 父级条件变化 | 能创建此前未挂载的子视图 | L2 / L4 |
| 数组插入、删除、移动、替换 | 实例订阅不串项；删除后报告失效；替换遵守身份契约 | L2 / L3 / L4 |
| 父子路径与整对象替换 | 精确字段、父引用与数组结构都正确受影响 | L3 |
| 只改变 Validation Issue | 只观察 Data 的 Reaction 不重跑，错误展示更新 | L3 / L4 |
| 初始数据已违反 Constraint | 初始化 / 主动校验可发现，不依赖首次修改 | L3 |
| 高速输入与显式多次 insert | pending Reaction 合并读最新值；显式 Command 保留动作次数 | L3 |
| 挂载 / 改绑期间发生变化 | 当前视图读取最新状态且不残留旧订阅 | L3 / L4 |
| Unmount / Form 销毁 | 后续变化不调用已释放视图；共享规则按自身生命周期清理 | L3 / L4 |

以上是设计验收集。现有候选结构验证与有界抽测不实现 Dependency Plan、真实订阅或框架适配，不能将其通过计数当作这些跨层行为已验收。

## 跨层业务验收与后续衔接 {#dependency-v05-acceptance}

以下对应来源 01–12，是 L1 → L2 → PreparedForm → L3 的设计验收，不是现有候选验证器通过统计。初始化场景约束实际执行遇缺失 / 清空输入的行为；已确认首次激活可配置，具体默认值仍不由这些场景提前决定。

| 来源场景 | 输入 / 过程 | 必须证明 |
| --- | --- | --- |
| 01 保费计算 | Reads 含 age / rate，watch 只声明 age | 编辑器提供建议，作者可拒绝；Runtime 只按确认后的 watch 触发 |
| 02 产品切换清空选项 | watch 产品，then 清空选项而不读取产品 | 显式业务触发被保留，不因无 Reads 自动删除 |
| 03 初始化缺失年龄 | 首次实际执行时缺少年龄 | 通过业务 when 跳过或纯函数空值契约返回 null，不误调要求有效年龄的计算 |
| 04 清空年龄 | 已有 age / premium 后清空 age | 按业务定义显式写 premium=null 并联动，不默认保留旧值 |
| 05 多 Operation 合并 | Flush 启动前两次命中同一实例 | 只保留一份 pending，读最新值 |
| 06 正常级联 | A 写 premium 触发 B | 同一 Flush 消费到结束 |
| 07 有环但收敛 | A→B→A 后同值短路 | 允许完成，不凭静态 SCC 判配置失败 |
| 08 震荡熔断 | A / B 持续互改 | 整个 Flush 达到安全预算后中止，已写 Data 保留，提取异常 Trace |
| 09 单 Command 失败 | 前后有独立 Command，某一条发生可隔离错误 | 记录错误，其他独立命令继续尝试；Reaction 仅按有效 Change 响应 |
| 10 数组 Scope 移动 | 动态项重排 | 稳定身份不变，L3 根据 Prepared Binder 计划维护真实实例 |
| 11 多对一来源 | 两个 Change 合并触发一次执行 | 记录多个 Change ID；事后可重建，截断时如实标记 |
| 12 发布编译产物 | Prepared ABI 不兼容 | Runtime 拒绝并诊断，不隐式退回 L1 解释路径 |

下一步的推荐验证路径是 PreparedForm → Runtime 初始化 → Scope 实例化 → Reaction 首次运行，用嵌套数组贯穿插入、移动、删除、Host 恢复 Command、真实实例替换 / Dispose；业务基准 / Dirty / Reset 意图归 Host，Runtime 不提供 Reset 特殊模式。随后验证 Validation 与 Renderer 通知如何共享匹配且分别完成。同步回调归当前轮已确认；熔断恢复 / Pending 接口与完整结果结构继续固化；不先建立父子 Reaction、局部健康传播或图调度。


### Reaction 顺序与宿主业务任务的边界

2026-10-19 已确认：Reaction 不声明彼此前后依赖、业务优先级或拓扑调度关系。一个完整业务计算优先在同一 Reaction 内表达；跨 Reaction 通过真实 Data Change 与自身 Watch 自然级联。业务不应依赖无关规则谁先执行，稳定调度顺序用于复现与排查，不是业务排序手段。多条规则竞争覆盖同一字段、结果依赖最后写入者时，先检查规则拆分与数据模型，不新增优先级或冲突仲裁协议。

Pending 按具体 Reaction 实例去重，执行时读取最新输入；取出执行后再次被有效变化命中仍可重新入队。不承诺任意冲突配置都与顺序无关，也不改变同一 then[] 内显式 Command 的有序语义。同步回调写回归当前轮已确认，具体容器与调用栈处理留给实现验收。

Reaction 仅承担协议内同步联动，不理解网络请求、取消、重试、超时或业务结果适用性。Host 自主管理报价等异步能力：观察所需数据、合并业务任务、管理请求及乱序返回，再通过普通 Command 写回。Reaction Pending 去重只针对 Reaction 实例；Host 请求是否合并由 Host 决定，不强制共用队列，也不新增异步 Reaction 或通用宿主任务调度协议。既有语义事件与 External Validation 接入职责不因此扩展为 Reaction 请求执行器。

具体执行见 [Reaction 合并](l3-reactive-engine.md#l3-reactions)，决策见 [ADR-FE-006](decisions/ADR-FE-006-command-flush.md)。

### L4 组件 Adapter 的订阅边界

L4 以物料组件及其 Adapter 为接入单位。Adapter 按 Prepared 配置与当前 Scope 订阅 Runtime 提供的相关状态变化通知，读取当前值、校验结果及动态配置并组装组件 Props；组件渲染与内部差异比较由平台框架处理，不在协议中另建整表 / 节点 / 属性 / 字段端口的更新分级。通知用于重新读取权威状态，不是要求 L4 重放事件以维护第二份业务数据。

组件接收的表单业务数据与校验状态以 Runtime 为唯一权威来源；事件经 Adapter 转成既有 Command 调用 Runtime，数据更新再经订阅反馈到 Props。局部框架缓存只是当前 Props 的呈现，不是独立业务 Store。组件可持有焦点、输入法组合态、展开 / 收起等内部交互状态，其交付边界后续明确。Host 业务操作仍由既有 host.emit 路径交给 Host，不将所有事件一律变成数据 Command。

保留既有 bindings 作为“组件使用哪些数据”的具名映射，不新增所谓字段端口、端口级 Controller 或独立匹配引擎。单字段或多字段控件都由 Adapter 将相关数据组织成实际组件 Props，并将组件事件映射为受控指令。Renderer 负责物料树的装配，Scope 关联与订阅释放等职责需要继续讨论，不强制拆出 View Controller / Binding Controller 类或固定包层次。

此前节点 / 属性拆分与局部一致投影是候选比较，不是用户已接受的新更新体系。订阅与初次读取 / 改绑的安全交接仍需保证，但不因此增加字段端口或新的通知队列协议。

### 共用 Adapter 与物料内部行为

Adapter 是共用的引擎接入能力，不为每个物料编写独立数据 / 事件映射适配器。物料遵守统一的组件接入约定：共用 Adapter 按 Prepared 配置与当前 Scope 订阅 Runtime、读取相关状态传入 Props、提供既有指令调用能力，并管理订阅生命周期。姓名、日期范围等物料的输入事件、第三方组件库 Props 差异和临时交互在物料组件内部实现，不把这些差异注入共用 Adapter，也不另建可配置事件转换语言。具体统一 Props、绑定值和指令 API 尚待讨论，不将前轮“物料专属 Adapter 映射”当作已确认方案。

### 共用 Adapter 的求值边界

共用 Adapter 封装常规绑定读取 / 订阅、受控修改与其他已有指令入口，以及表达式值的取得。物料只实现自己的 Props 消费、呈现和交互，不要求逐个设计引擎接入映射，也不把普通 Props 的平铺 / 分组形式升级为需要用户决策的架构问题。具体调用签名由统一 SDK 固化。

表达式职责沿用 L2 静态编译、L3 统一求值的既有分工：Adapter 按 Prepared 配置调用求值能力并提供结果，不新增原始 L1 AST 解析器、依赖分析器或一套物料表达式语义。只有出现独特指令或特殊值读取的真实需求时，才明确它应复用现有受控接口、归 Host 业务能力还是需要另行确认扩展；不预先引入任意脚本、直接可变 Store 访问或新的通用指令 DSL。

### Adapter 的组件生命周期与回调清理

共用 Adapter 统一管理组件侧生命周期、当前 Scope 关联、订阅 / 监听与回调释放，以及 Runtime 数组成员移动、删除、整体替换在视图侧的对应处理。实际数组 Command、Data 与 Scope Identity 的一致修改仍归 Runtime；不把数据操作实现搬到 L4。成员移动保持原 Scope 关联，删除 / 整替换使旧关联失效，Profile 切换只替换视图接入。

卸载或改绑时，Adapter 释放旧监听、订阅与可解绑回调，不要求每个物料重复处理共性生命周期。正确清理后旧回调通常不再触发；已经被排入外部队列或不能物理撤回的调用仍可能迟到，必须按旧组件 / Scope / 关联身份拒绝，不得使用新的绑定上下文写入其他成员。该检查属于 Adapter 实现保护，不建立新的运行时任务队列或要求用户配置。首次订阅读取与改绑交接应不漏更新，具体平台实现由契约测试验证。

单物料错误按 [L4 错误隔离](l4-renderer.md#material-errors)处理，不通过依赖图向其他物料传播失败。
