---
id: ADR-FE-017
title: ADR-FE-017：保留领域结构的编译输入输出与表达式级观察
type: decision
status: accepted
layer: 跨层
modules:
- M03
- M04
- M05
- M06
- M11
- M14
related:
  decisions:
  - ADR-FE-003
  - ADR-FE-004
  - ADR-FE-005
  - ADR-FE-010
  - ADR-FE-015
  - ADR-FE-016
sources:
- SRC-COMPILERIOTYPES
- SRC-COMPILERIO
navigation:
  group: 09 · 决策与追溯
  order: 127
last_reviewed: '2026-10-21'
status_note: 输入输出及默认易用性已确认，协议类型 / Schema 已迁移；Compiler 功能 / 校验算法及各端执行尚未实现
---

# ADR-FE-017：保留领域结构的编译输入输出与表达式级观察

## 背景与实际比较

用户要求以运行时效率解释每项编译转换，指出静态绑定编号不能代替运行时生成的 Scope ID，能力实现仍在运行时装配，模板完全展开存在体积代价，显式 Reaction.watch 无需再推导。讨论比较全面重写准备树、定义加必要静态信息、集中依赖表与消费者就地 watch；又比较组件合并观察后全部重算和完整表达式分别观察，用户明确选择精确求值，拒绝仅为形式优雅增加理解成本。

此前草案以 preparation 包装依赖和前置，又建议按组件合并；这些中间建议未成为最终确认。用户接受 $expr 包装内 watch 与物料同名属性不冲突，审阅完整输入输出后确认，并补充无需显著区分 Canonical / Authoring、参数有默认值、单视图无需额外 Profile / 平台选择的开箱即用要求。

## 已确认决定

1. L1 → Compiler → Prepared → Runtime 仍为唯一执行路径；输出是 JSON 静态结构，不生成各端正式代码，不提前求业务值。
2. Prepared 保留 Definition 原领域组织与表达式 / Command / Scope / Reference 语义。只增规范化、确定观察、已解析 requires、资源和能力锁等有直接消费用途的信息；不全面编号化、路径改写或重组为三类 Plan。
3. 公共入口默认接受规范及受支持简写，不强制 syntax 选择。单一视图自动选中，无需特定名字或显式 Profile；平台仅在确有目标选择时指定，未指定仍锁定快照中的实际实现和平台。默认不能掩盖歧义或协议冲突。
4. Reaction 保留显式 watch；Constraint 的输出 watch 是有效依赖，含前置传递。字段 requires 补已解析 Internal 集合；不另设 preparation 或 prerequisites 容器。
5. 每个用于持续呈现的完整 $expr 包装携带 watch，按表达式失效 / 复用结果；嵌套运算子不各自建立观察。Binding 沿用自身引用。Adapter 统一生命周期，不以组件全部重算代替精确表达式求值。
6. watch 不是普通业务键的保留名；仅在严格 $expr 包装中解释为依赖。Literal 不扫描，求值返回的对象不重新解释。事件 / Request Payload 与 Command 值按调用求值，不自动订阅。
7. Template 保留共享结构、已检查参数和模板体依赖，运行时绑定参数 / Scope 并实例化；不默认全展开。选择视图只裁剪视图闭包，完整共享业务规则与根 Schema 保留。
8. 资源闭包、双摘要、请求通道、外部一次结构检查、格式精确匹配与 Error 无执行制品保持。代码 / 组件 / 真实 Scope / Issues / 请求状态不写入产物。

完整契约、默认规则、输入输出对照和示例统一在 [L2](../l2-preparation.md#compiler-io-contract)，不在 ADR 复制另一份字段规范。

## 与既有决策的关系

本 ADR 局部修订 ADR-FE-004 后续机器结构基线中的模板展开、三类 Plan 与集中依赖，以及 ADR-FE-003 / ADR-FE-005 关联的“不保留表达式级准备”限制；这些 ADR 的核心选择（唯一入口、静态模板与容器物料、Read / Watch / Subscription 分离）仍然有效，不整体废止，故不将整份旧 ADR 标记 superseded。旧 ADR 内相应段落标注被本 ADR 局部替代，并链接本记录；旧选择及理由保留于演进。

延续 ADR-FE-010 的本轮同步前置与依赖补全、ADR-FE-015 的 TS 单结构源、ADR-FE-016 的 validators / events / requests；不恢复 services，不增加 Context 自动触发链、异步 Reaction、字段 Controller 或通用结果 DAG。

## 收益、代价与状态

收益为运行时不再发现隐式依赖或推导相关前置，精确复用无关表达式结果，模板结构共享，输入输出更易对照。代价为每个响应式表达式保留 watch 和运行时结果关联，Adapter 仍需参数 / Scope 绑定、首次读交接与清理；不声称已有基准证明或保证各端相同渲染次数。

本轮仅归档设计，packages/protocol 的旧 Prepared 类型 / Schema 尚未迁移，不标记为新 ABI 实现。Compiler 功能清单、校验 / 类型连接 / 依赖算法、缓存与各端接入留给下一专题。增量分析、模板特化、常量折叠、编号编码、代码生成和可视化按真实收益后续评估。

### 后续授权：协议类型同步

用户随后明确要求先提交设计再调整协议类型。设计提交为 bdec628；packages/protocol 已迁移为 definition / build / resources，规则与完整响应式包装就地 watch、共享模板和准备后 requires，复用原引用 / 表达式 / Command 语法。TS 与 Schema 一起拒绝缺少 watch 的响应式包装以及将响应式包装复用为按调用 Payload；Scope mode 的缺省 one 在 Prepared 中显式保存。范围及验证见[实施记录](../engineering.md#compiler-io-types)。本次不实现 Compiler / Runtime，不改变上文的行为决定或发布 ABI 版本。

## 来源

2026-10-21 当前对话中的输入输出审阅与最终确认，登记为 [SRC-COMPILERIO](../source-map.md#src-compiler-io)；未伪造逐字会话存档。历史与替代范围见[演进](../design-history.md#compiler-io-confirmed)。
