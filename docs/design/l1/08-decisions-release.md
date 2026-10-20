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
  decisions: []
sources:
- SRC-L1
- SRC-L2
- SRC-V07
navigation:
  group: 02 · L1 协议
  order: 38
last_reviewed: '2026-10-19'
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
| Interaction Event Context | Event Reference 仅在有效上下文 | 明确事件 Payload Schema 与解析限制 |
| External watch 迁移 | 当前草案使用 watch；合并 when 读取，失效与请求分离 | 正式版本识别、dependsOn → watch 的迁移规则与双字段拒绝 |
| 使用位置与 Prepared 依赖契约 | Read / Watch / Subscription 分离，L2 计划 / L3 匹配 / L4 挂载 | 用矩阵和跨层验收固化；不把候选 ABI 或调度策略写入 L1 |
| Validation 前置与结果 | 完整 Schema + 增量本轮 Constraint + 字段 Issue 聚合 | 依赖补全 / 共同入队、全部适用校验等待已确认；冻结前置引用 / 消息覆盖、PreparedValidation、Issue / 完整结果 API、跨端与性能 |
| Formal JSON Schema | Canonical 形状已收敛 | 生成并验证 2020-12 Schema 与 TS 类型一致性 |

> **冻结原则**
> 
> 这些是将“架构共识”工程化为“正式规范”的工作清单。除非样例或校验出现事实上的冲突，否则不再因局部实现问题增设新的顶层领域模型。

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
