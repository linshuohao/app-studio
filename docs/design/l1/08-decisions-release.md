---
id: L1-RELEASE
title: 类型概念稿与规范固化
type: protocol
status: active
layer: L1
modules:
- M02
- M06
tags: []
related:
  decisions:
  - ADR-FE-015
sources:
- SRC-PROTOCOLBASELINE
- SRC-PREREQUISITES
- SRC-CONTRACTS
- SRC-L1
- SRC-L2
- SRC-V07
- SRC-PROTOCOL
navigation:
  group: 02 · L1 协议
  order: 38
last_reviewed: '2026-10-21'
reading_next: DESIGN-L2
---

# 类型概念稿与规范固化

> L1 架构与语义决策正文；正式类型、Schema 与发布验收状态见各节。

## 仍需规范固化的事项：不等于重开架构 {#boundaries}

> 状态：待固化

| 事项 | 当前方向 | 固化工作 |
| --- | --- | --- |
| Reference / Expression Union | 类型与用途已经明确 | 严格拒绝未知 / 混用字段、保留标记与 Literal 转义已确认；补齐 Union 形状和正反例 |
| ScopeBinder 单/链 | View 单 Binder、规则可链式绑定 | 用 Schema/TS 校验数组链顺序和遮蔽规则 |
| Pure Function Contract | 同步确定性、受限、类型明确；内置与注册共用调用 | 列出内置签名、`core.*` / 短名别名映射、错误诊断与版本契约 |
| Command 全量结构 | 封闭 7 类动作；batch 有序即时生效、非原子；可隔离错误继续独立行为 | 补完插入 / 移动位置、错误分类和诊断接口 |
| Reaction 收敛与错误 | 最新状态合并、显式首次激活可配置；显式 Command 保留次数、超限整体熔断 | 默认不执行、同轮回调和无业务顺序依赖已确认；固化激活字段、队列 / 恢复接口；不增加队列 / 索引字段 |
| 实例生命周期与快照 | 新实例按 runOnActivate；稳定快照由 Host 按需用于业务基准 | 默认不执行已确认；实例建立 / 替换、snapshot / 完成观察 SDK；业务 Dirty / Reset 不是核心未决项 |
| Scope 与观察粒度 | 父级相对位置；候选定位后比较逻辑观察值 | Object.is / 存在性、位置观察编码、数组整体替换重建已确认；具体实现与跨端验收 |
| JSON Schema 兼容性 | Typed Params 引用 schemaRef | 已确认不兼容 / 无法证明均拒绝连接；固化可判定子集和分类诊断 |
| Material / Pure Function Version Resolution | 确定 Catalog Snapshot，Release 锁定版本及制品身份 | 固化锁字段、摘要对象、升级与 Runtime 兼容检查 |
| Interaction Event Context | Event Reference 仅在有效上下文；有数据事件声明 Payload Schema、无数据通知只需名称已确认 | 固化正式类型及路径 / 类型连接诊断，不增加返回值 / 异步编排 |
| Material Binding / Slot | Binding 声明数据 Schema、不区分读写；Slot 首期只声明名称已确认 | 正式 Manifest 子类型与兼容检查验收 |
| Host Validator 输入 | 本次调用快照 + Scope + 显式 watch 已确认，不新增参数映射 | 快照 SDK、依赖完整性与异步有效性验收 |
| External watch 迁移 | 当前草案使用 watch；合并 when 读取，失效与请求分离 | 正式版本识别、dependsOn → watch 的迁移规则与双字段拒绝 |
| 使用位置与 Prepared 依赖契约 | Read / Watch / Subscription 分离，L2 计划 / L3 匹配 / L4 挂载 | 用矩阵和跨层验收固化；不把候选 ABI 或调度策略写入 L1 |
| Validation 前置与结果 | 完整 Schema + 增量本轮 Constraint + 字段 Issue 聚合 | 依赖补全 / 共同入队、完整校验等待全部适用项已确认；前置支持字段 / 规则、Scope 唯一实例且本期仅等同步已确认；冻结引用语法 / 字段资格集合 / 消息覆盖、PreparedValidation、Issue / 完整结果 API、跨端与性能 |
| Formal JSON Schema | Canonical 形状已收敛 | 生成并验证 2020-12 Schema 与 TS 类型一致性 |

> **冻结原则**
> 
> 这些是将“架构共识”工程化为“正式规范”的工作清单。除非样例或校验出现事实上的冲突，否则不再因局部实现问题增设新的顶层领域模型。

## 协议结构源与校验链路 {#protocol-structure-source}

2026-10-21 用户确认：以原生 TypeScript 的 type / interface 及 JSDoc 为权威结构源，自动生成 JSON Schema，由 Compiler 使用 Ajv 进行输入结构校验。公共声明保留字段含义、使用边界与必要注释，供各包开发者阅读和 IDE 提示；生成的 Schema 不手改，不另维护平行结构。必要的机器约束使用类型附近的注解或统一生成配置表达，具体生成器与配置在实施时固化。重要选择见 [ADR-FE-015](../decisions/ADR-FE-015-protocol-source.md)。

```text
原生 TS 协议类型 + JSDoc + 必要结构约束
                  ↓ 自动生成
              JSON Schema
                  ↓ Ajv
        Compiler 输入结构校验 → 语义分析 → Prepared
```

TS 类型用于开发期检查，外部 JSON 仍需运行时结构校验。未知协议字段、Union 混用和保留标记等沿用现行严格策略；业务字典、metadata、Schema 与 Literal 按各自契约检查，不一律禁止任意键。生成链路的必要正反例纳入正常契约验收，不反复将工具配置提升为用户决策。

Ajv 只承担结构检查；引用存在性、Scope 合法性、能力签名 / 端口兼容等由 Compiler 的语义分析实现。协议 Schema 与表单内的 data.schema 用途不同：后者描述用户业务数据，交给 Runtime Validation 检查。

Runtime 不在每次表达式求值、命令执行或联动时重复整份协议的静态检查。Prepared 装载仍须核对格式、目标、能力及必要输入有效性；后续首批基线已确认外部文件 / 接口 / 缓存 JSON 在接收边界做一次结构检查，同进程 Compiler 刚成功生成的结果不重复全量 Schema 校验，受控不可变产物可复用检查结果。动态命令结构执行保护和业务数据校验继续保留，不能以已编译为由跳过。

未来 Dart 可从生成的 JSON Schema 派生协议模型、工具支持的编解码及结构检查代码；不是生成 Flutter 页面、Dart Runtime 或 Flutter Renderer。当前不实施 Dart 生成链路，具体工具与注释保留能力待后续验证。

最初确认限定于结构源与校验路线；后续用户已确认三领域及[首批开发基线](#protocol-development-baseline)，其范围以对应现行节为准。具体公共声明、生成工具适配与正反例随实施完成，尚无正式类型 / Schema 发布或生产验收，附录继续保留概念稿身份。

## 协议包首批开发基线 {#protocol-development-baseline}

2026-10-21 用户确认按完整草案进入开发准备，不继续逐字段讨论；实际消费者出现问题后再按真实反例迭代。此前的结构源、三领域、Host 输入与物料声明、同步前置原则保持。definition / capability / prepared 各领域公开正式命名类型及组成类型，不逐项按当前消费者筛选；生成脚本、测试与其他包内部实现类型不进入公共出口。内部文件路径不是公共契约。

首批整合三个领域的完整 TS 类型、JSDoc、自动 Schema 和正反例，不只交付一个局部 Definition 子集；按依赖顺序实现，但不以全部消费者已实现为前提。字段命名、容器、错误码、生成配置由维护者在已确认行为内整理；只有真实跨层冲突或新增可观察行为才重开讨论。结构确认不是全量 ABI 已验收，Runtime / Compiler API 仍归所属包。

| 范围 | 当前已确认基线 | 实施交付 |
| --- | --- | --- |
| Union / ValueSpec | 递归结构可校验，普通对象禁止 $expr / $literal 保留键，严格包装，Literal 内不解释 | 类型附近约束 / 固定生成规则输出标准 Schema；不手写第二套协议 |
| Command | 目的位置用 index / before / after 判别 Union，沿用最终下标与失败语义 | 补齐类型与结构错误验收；不新增命令种类 |
| Reaction | runOnActivate 可选，默认 false，仅新实例首次建立适用 | 类型 / Schema 与样例迁移 |
| External | validator 独立引用能力；正式类型移除 requiredForSubmit 候选豁免字段 | 候选样本迁移时按源修改，不把旧样本视为正式结构 |
| Authoring | 简写输入与 Canonical 类型分开，bind / children / 短函数名规范化 | Canonical 不接收旧 dependsOn 或双字段，历史候选不虚构发布版本 |
| 校验前置 / 消息 | 同步字段资格与规则前置；消息配置独立于结论 | 见 [前置](../l3-validation.md#prerequisite-scope-contract)及[消息](../l3-validation.md#validation-message-contract) |
| 类型连接 | 常用结构的可证明兼容，业务合法性与工作态独立 | 见[连接子集](#schema-connection-subset) |
| 能力 / Prepared | Schema 签名、有限内置短路、双摘要、结构树及资源闭包 | 见 [L2](../l2-preparation.md#prepared-machine-baseline) |
| 装载 | 外部 JSON 一次结构检查；当前进程 Compiler 成功结果不重复全量校验 | 保留格式 / 目标 / 能力核对，不在交互高频路径重复 |

旧类型汇编保留概念稿与追溯身份；其中占位、requiredForSubmit 等与后续确认不一致时，以本节及相应现行主题为准。本轮不修改候选验证源或宣称已发布协议；正式类型实施时统一迁移。

## 首期 Schema 类型连接子集 {#schema-connection-subset}

首期证明数据形状兼容，不建设任意 JSON Schema 包含关系证明器。业务 data.schema 可以使用完整已支持校验语法；复杂 Schema 并不因此都能用于静态连接。结构投影用于 Binding / Template / 函数接入检查，业务 minLength / 数值范围等不成为 Runtime 写入门禁；生成类型也不能把 Working Data 收窄为始终业务合法。

支持明确资源身份下的同一 Schema 引用；基础类型（integer 可接入 number）、显式 null、const / enum 集合包含、对象必需属性及属性类型 / 额外属性、同构数组元素、可明确判定的简单联合。源联合的每个可能分支须被目标接受。复杂条件、任意 not、无法解析引用等超出证明能力时返回无法证明，已知冲突返回不兼容，两者都拒绝连接，禁止断言 / 运行时兜底绕过。

详细投影、可判定递归处理、诊断码由实现和正反例固化，不逐个关键词要求用户选择；真实无法覆盖的消费场景再演进。

## 附录：完整的核心类型关系（概念稿） {#types}

> 状态：待固化

**架构核心类型汇编（用于后续正式 TypeScript 固化）**

```typescript
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonSchema = Record<string, unknown>; // 采用正式 JSON Schema 类型

type DataReference = { source: 'data'; path: string; scope?: string };
type ContextReference = { source: 'context'; path: string };
type EventReference = { source: 'event'; path: string };
type Reference = DataReference | ContextReference | EventReference;

type ScopeBinder = {
  from: DataReference;
  as: string;
  mode?: 'one' | 'each';
};
type ScopeDeclaration = ScopeBinder | ScopeBinder[];
type ScopeHandleReference = { $scope: string };

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

type IssueDefinition = { target: DataReference; code: string };

type InternalConstraint = {
  id: string; kind: 'internal';
  scope?: ScopeDeclaration;
  when?: Expression;
  assert: Expression;
  issue: IssueDefinition;
};
type ExternalConstraint = {
  id: string; kind: 'external';
  scope?: ScopeDeclaration;
  when?: Expression;
  watch: DataReference[];
  target: DataReference;
  requiredForSubmit?: boolean;
};
type Constraint = InternalConstraint | ExternalConstraint;

// Command 具体每种操作的字段请以正式 JSON Schema 为准
// 下方展示稳定的分发类别，非已完整定义的公开类型。
type Command =
  | { op: 'set'; target: DataReference; value: ValueSpec }
  | { op: 'patch'; target: DataReference; value: Record<string, ValueSpec> }
  | { op: 'remove'; target: DataReference }
  | { op: 'array.insert'; target: DataReference; value: ValueSpec; [k: string]: unknown }
  | { op: 'array.remove'; target: DataReference; item: ScopeHandleReference }
  | { op: 'array.move'; target: DataReference; item: ScopeHandleReference; [k: string]: unknown }
  | { op: 'batch'; commands: Command[] };

type Reaction = {
  id: string;
  scope?: ScopeDeclaration;
  watch: DataReference[];
  when?: Expression;
  then: Command[];
};

type InteractionIntent =
  | { type: 'form.command'; command: Command }
  | { type: 'host.emit'; event: string; payload?: ValueSpec };

type MaterialNode = {
  material: string;
  props?: Record<string, ValueSpec>;
  bindings?: Record<string, DataReference>;
  slots?: Record<string, ViewNode[]>;
  on?: Record<string, InteractionIntent>;
};
type ScopeNode = { scope: ScopeBinder; node: ViewNode };
type TemplateUse = { $use: string; with?: Record<string, DataReference> };
type ViewNode = MaterialNode | ScopeNode | TemplateUse;
type ViewTemplate = {
  params?: Record<string, { schemaRef: string }>;
  node: ViewNode;
};

type FormDefinition = {
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
};
```

> **不要误当成可直接发布的 npm 类型**
> 
> 本附录刻意把 `array.insert` / `array.move` 的具体位置描述留作固化项，且 JsonSchema 使用抽象占位。它是已收敛语义的汇编，不是已经编译与验证的完整类型包。

## 正式 发布前的验收与交付 {#release}

> 状态：已收敛

- [ ] 生成完整 `form-definition.types.ts`，消除占位和不严谨 Union
- [ ] 生成完整 `form-definition.schema.json`，与 TypeScript 一致
- [ ] 校验简单表单 / 动态数组 / 多端保险表单三类样例
- [ ] 反例验收：非法引用、Scope 越界、模板参数类型不匹配、端口不兼容
- [ ] 冻结 Material Manifest 版本解析约定及 Pure Function 合约
- [ ] 发布规范语义说明、版本兼容说明与变更记录

上述勾选仅供阅读时自查，不自动代表项目真实完成状态。后续阶段 L2、L3、L4 只能在遵守这份 L1 语义的前提下选择自己的实现策略。

> 最终决策：**停止 L1 的开放式抽象扩张，进入 Canonical Type / JSON Schema / 反例验收**。需要修订时提出能复现的协议冲突，而不是重新设计已确定的领域层次。

## 严格协议与可证明连接 {#strict-contract}

协议结构采用严格检查：未知字段、混用多个 Union 分支及不符合当前分支的字段在配置 / 编译阶段拒绝，不静默忽略或仅警告后继续产出可执行制品。严格范围是协议节点；Working Data、metadata、Schema 和物料 Props 等各按所属数据 / Manifest 契约检查，不能把业务字典的任意键一律当未知协议字段。

ValueSpec 位置的 $expr / $literal 为保留标记键。出现标记键必须按对应包装校验，包装结构不合法直接诊断，不退回普通对象；需要原样保留含这些键的数据时用 $literal 显式转义，其内部不再递归解释。只在类型规定的 AST / ValueSpec 位置解析，不扫描 Working Data、业务 Schema 或 Literal 原文。Expression 的 literal 与 ValueSpec 的 $literal 属于各自语法位置，不混用。

跨 Template 参数、Binding Port、函数参数等类型连接，仅接受明确可判定且能证明兼容的结构；已知不兼容与无法证明兼容均拒绝编译，但诊断码 / 原因应区分。不用运行时兜底、作者强制断言或静默降级绕过连接检查。受限的是静态连接兼容检查能力，不将业务数据根 Schema 改成局部 Schema，也不声称任意 JSON Schema 包含关系均可判定。可判定子集、Union 完整形状、签名与正反例仍需正式固化。

本轮只确认检查策略；候选类型汇编 / Schema 尚未迁移，不能将本节或附录视为正式发布包。
