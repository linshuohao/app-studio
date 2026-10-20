# @form-engine/protocol

首期协议结构包。手写 TypeScript 类型和 JSDoc 是结构源，构建派生 JSON Schema 2020-12；库版本、Definition 的 protocolVersion、Prepared 的 preparedFormatVersion 是独立维度。本包仍为 private，不代表已发布稳定 ABI。

```ts
import type { FormDefinition, SetCommand } from '@form-engine/protocol/definition';
import type { MaterialManifest } from '@form-engine/protocol/capability';
import type { PreparedForm } from '@form-engine/protocol/prepared';
```

- `definition`：Canonical、Authoring、引用、Scope、表达式、命令、校验、视图。组成类型也公开。
- `capability`：物料、纯函数、Host 契约和确定 Catalog Snapshot；不含 React、函数或网络实现。
- `prepared`：静态结构树、Scope 模式、计划、锁和 Host 需求；不含实例数据或任务状态。
- `schemas/*.json`：独立 JSON 资源，例如 `@form-engine/protocol/schemas/form-definition.schema.json`。

AuthoringMaterialNode / AuthoringFormDefinition 是供未来 Compiler 接收 bind / children 等简写的输入类型；当前仅有类型、Schema 与测试，本包不实现简写规范化。bind 仍须为合法 JSON Pointer。

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

使用 Ajv 时允许 JSON Schema 的基础类型联合（allowUnionTypes），不启用类型转换、默认值填充或删字段。结构通过不代表可执行：引用存在性、Scope 可见性、函数签名连接、字段同步资格集合、环、计划 ID 关联、目标平台、锁身份和格式精确匹配仍由 Compiler / 装载边界检查。本包没有实现这些算法。

Binding 的 Schema 是静态模型接入契约，不在写入时禁止非法工作值。Slot 只声明名称；有数据事件声明 Payload Schema。External 使用 validator 名称与 watch，不提供参数映射；requires 的字段分支明确 phase: sync。完整校验仍须覆盖全部适用同步 / 异步任务。

Prepared 夹具是手写契约样本，不是编译器产物或执行通过证明。测试使用 test-* 身份，不定义实际发布版本。现行语义见仓库 docs/design/l1/08-decisions-release.md、l2-preparation.md 与 l3-validation.md。
