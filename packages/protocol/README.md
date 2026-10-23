# @form-engine/protocol

首期协议结构包。手写 TypeScript 类型和 JSDoc 是结构源，构建派生 JSON Schema 2020-12；库版本、Definition 的 protocolVersion、Prepared 的 preparedFormatVersion 是独立维度。本包仍为 private，不代表已发布稳定 ABI。

```ts
import type { FormDefinition, SetCommand } from '@form-engine/protocol/definition';
import type { MaterialManifest } from '@form-engine/protocol/capability';
import type { PreparedForm } from '@form-engine/protocol/prepared';
```

- `definition`：Canonical、Authoring、引用、Scope、表达式、命令、校验、视图。组成类型也公开。
- `capability`：物料、纯函数、Host 契约和确定 Catalog Snapshot；不含 React、函数或网络实现。
- `prepared`：保留 Definition 领域结构，规则 / 完整动态表达式 watch、已解析 requires、资源、锁和 Host 需求；不含实例数据或任务状态。
- `schemas/*.json`：独立 JSON 资源，例如 `@form-engine/protocol/schemas/form-definition.schema.json`。

CompilerInputDefinition 是默认定义输入，接受规范写法与 bind / children 等受支持简写，不要求 syntax 判别。AuthoringMaterialNode / AuthoringFormDefinition 仍公开以表达输入结构；本包不实现规范化。单视图无需显式 Profile / 平台选择；这些默认选择由后续 Compiler 实现，Schema 不自动填充默认值。bind 仍须为合法 JSON Pointer。

公共类型及关键字段使用 JSDoc 说明阶段职责、引用目标、默认 / 省略语义和检查边界，说明随声明产物与 Schema 生成。Definition 与 Prepared 保持独立职责；原引用、Expression、Command 语法直接复用，不再建设静态 Scope ID / 路径分段 / kind 执行树。动态 Props 的 PreparedValueSpec 严格要求 $expr + watch，按调用求值的 PreparedOnDemandValueSpec 沿用原 ValueSpec；不引入泛型 Command / AST 框架。

根入口只导出公共基础类型；跨包不导入 src。开发条件使用源码，打包消费使用 dist；JSON Schema 使用相同已生成资源。

## 生成与验收

```sh
pnpm --filter @form-engine/protocol schema:generate
pnpm --filter @form-engine/protocol schema:check
pnpm --filter @form-engine/protocol typecheck
pnpm --filter @form-engine/protocol test
pnpm --filter @form-engine/protocol build
```

生成器为 ts-json-schema-generator。源类型附近的 `@propertyNames`、`@asType`、`@minimum` 等注解表达必要结构约束。有限的方言转换只处理生成器输出中的 definitions / 引用 / tuple，输出 $defs / prefixItems，再由 Ajv 2020 严格编译检查；不遍历 const / default / examples 里的普通数据。没有手写第二份协议 Schema，不引入自定义校验关键字。嵌入的业务 JSON Schema 引用标准 2020-12 meta-schema，不复刻标准关键字类型。

10 个根资源覆盖 Definition、Authoring、Command、Expression、ValueSpec、三类能力契约 / Catalog 和 Prepared。它们的内部类型通过引用复用；不为每个导出的类型生成独立文件。schema:check 检查确定性输出，build 生成它们；生成文件不手改。

使用 Ajv 时允许 JSON Schema 的基础类型联合（allowUnionTypes），不启用类型转换、默认值填充或删字段。结构通过不代表可执行：引用存在性、Scope 可见性、函数签名连接、字段同步资格集合、环、模板 / requires / Schema 资源关联、目标平台、锁身份和格式精确匹配仍由 Compiler / 装载边界检查。本包没有实现这些算法。

Binding 的 Schema 是静态模型接入契约，不在写入时禁止非法工作值。Slot 只声明名称；有数据事件声明 Payload Schema。External 使用 validator 名称与 watch，不提供参数映射；requires 的字段分支明确 phase: sync。完整校验仍须覆盖全部适用同步 / 异步任务。

Prepared 夹具是手写契约样本，不是编译器产物或执行通过证明。测试使用 test-* 身份，不定义实际发布版本。现行语义见仓库 docs/design/l1/08-decisions-release.md、l2-preparation.md 与 l3-validation.md。

物料有返回值的交互通过 `MaterialManifest.requests` 声明输入输出，由
`MaterialNode.requests` 映射到 `HostContract.requests`。`on` 仍仅支持无返回通知和命令。
原 `services` 声明已移除；Prepared 显式包含请求映射、`requestSchemas` 和 Host 请求需求。
Schema 引用闭包、名称 / 类型连接由 Compiler 检查；生成 Schema 只验证结构。
公共 Adapter 的请求桥接、并发、取消及失效结果处理尚未在本包实现。

开发接入目标：物料公开请求输入输出类型，Host 可关联契约获得参数 / 返回值检查；静态可知注册集合约束必需请求。实际页面物料声明的请求必须全部映射，漏项由 Compiler 报错；缺实际 Host 注册须在装配时使对应物料明确报错。结构 Schema 不检查外部 Catalog 完整性，这些语义检查及 SDK 仍待实现。

## 已确认输入输出结构迁移

PreparedForm 现为 preparedFormatVersion / build / definition / resources / capabilityLock / hostRequirements。definition 保留 constraints 和 reactions 数组、views 与共享 viewTemplates 字典；旧 identity / formPlan / viewPlan / dependencyPlan、scopePatternId、executor 和 observationId 已移除。每份 Prepared 只选择一个视图入口，build.platform 可省略，实际锁定制品的平台身份仍必需。

每个持续呈现的完整 $expr 自带 watch，普通业务对象的 watch 不保留；$literal 和表达式 literal 不扫描。普通字典在 TS 和 Schema 中均排除包装保留键，避免缺少 watch 的表达式落入字典分支。规则使用统一 DataWatch（词法 DataReference + 可选 aspect），Internal / External 输出均有有效 watch，Reaction 保留显式 watch。字段 requires 携带已解析 constraintIds；Binder 保留词法结构，仅将默认 mode 显式化。模板保留参数和结构共享。事件 / Request Payload 与 Command 值不允许附加响应式 watch。

resources.schemas 补充外部业务 Schema，根 Schema 仍位于 definition.data.schema；请求资源位于 resources.requestSchemas。详细来源映射作为独立 PreparedSourceMap 类型，不混入执行产物。CompilerInputDefinition 只描述定义输入；CompileInput / CompileResult / Diagnostic SDK 和实际默认选择属于后续 Compiler 接口设计，本包不假装已实现 compile。

本次是未发布 ABI 的明确结构替换，不为旧执行树提供双格式或回退解释。语义分析、watch 推导、缓存失效、真实 Scope、装载检查与多端 Renderer 均不在本包实现；结构测试通过不能作为运行效率或正确执行的证据。

## Reaction 状态观察与 Host 行为

`Reaction.watch` 使用 `ReactionWatch = DataReference | ValidationWatch`；校验目标包含
`source: 'validation'`、`field: DataReference` 和 `observe: 'issues' | 'status' | 'state'`。
`ValidationReference` 以相同结构只读求值，当前仅用于 Reaction 条件和动作；
Schema 检查引用形状，Compiler 检查使用位置、字段 / Scope 与类型连接。
Command 写目标、Binding、ScopeBinder 与 Constraint 数据观察保持 Data-only。

`Reaction.then` 使用 `ReactionAction = Command | HostEventIntent`，兼容裸 Command，
复用 `host.emit` 按序同步发起 Host 行为，不等待 Host 内部异步结果。
HostEventIntent 从共享模块定义并由原 definition 公共出口继续导出；`batch` 不接受它。
Payload / when 的读取不会自动加入 watch，普通 Reaction 没有 Event 上下文。
Compiler 汇总独立于视图的 Host 事件需求，新 Prepared 格式为 `form-engine.prepared/2`，
旧 `/1` 目标拒绝；旧定义可以重新编译。本轮不实现 Runtime 订阅 / 调度 SDK。
