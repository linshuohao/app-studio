# Compiler

本包按 [Compiler 详细设计](../../docs/design/l2/compiler.md)实施。当前已实现 I01–I04 的编译主链，包括表达式依赖和 watch 准备；保持 private / 0.0.0，已有真实 Runtime / React Adapter 与浏览器业务纵切消费；完整稳定性 / 性能基准及生产验收仍待完成。

成功结果 prepared 为 ReadonlyPreparedForm，并递归冻结。修订时先 structuredClone(result.prepared) as PreparedForm，再编辑克隆；变更后重新进入检查。同进程 Runtime / Renderer 可复用真实检查入口登记的不可变产物，普通冻结、克隆或 JSON 往返不携带验证身份；格式、实际能力与执行兼容检查仍保留。

目录遵循[全仓包组织约定](../../docs/design/engineering.md#package-source-layout)：

```text
src/
  index.ts                  # 公共导出
  types.ts                  # 公共 SDK 类型
  pipeline/compile.ts       # 阶段编排
  input/                    # 接收、规范化、原始位置映射
  capability/               # Catalog 查询、Manifest 自检与锁收集
  analysis/schema/          # 资源模型、连接证明、静态值校验
  analysis/reference/       # 词法 Scope、引用解析、统一 watch 合并
  analysis/expression/      # 结果模型与可能读取的共享分析
  analysis/value/           # 递归 ValueSpec、动态形状和响应式包装
  rules/                    # Constraint / requires、Reaction / Command、消息
  view/                     # 物料 / Scope、共享模板与事件 / 请求映射
  output/assemble.ts        # Prepared 装配与自检
  diagnostics/              # 诊断收集
  validation/               # 协议结构校验
  common/                   # JSON、对象与 Pointer 基础操作
tests/
  pipeline/compile.test.ts
  capability/validation.test.ts
  analysis/dependencies.test.ts
  rules/compile.test.ts
  view/compile.test.ts
  fixtures.ts
```

入口只组织流程；分析与编译模块各自负责其领域，公共导出保持集中。测试独立于 src，生产与测试分别进行类型检查；跨包验证消费真实公共入口，不保留初始化标记链或演示子入口。

阅读实现时先看 pipeline/compile.ts，再沿 input → capability / analysis → rules / view → output 阅读。ExpressionAnalyzer 一次返回结果模型、可能读取和已知静态值；ReferenceAnalyzer 统一解析根 / Scope / Event；ValueCompiler 负责递归值形状与逐表达式包装。规则和视图使用相同事实；Catalog 也已统一物料与纯函数的自检、缓存、平台核对及双摘要锁。

表达式依赖分析和 watch 生成属于本期，已经实际接入。平台分析报告、可视化、增量编译和代码生成仍是后期内容。静态准备已经让运行端能直接取得观察项，但实际运行耗时收益仍须 Runtime / Adapter 消费验证。

```typescript
import { compile } from '@form-engine/compiler';

const result = compile({
  definition: {
    protocolVersion: 'example-protocol',
    id: 'profile',
    version: 'draft',
    data: {
      schema: {
        type: 'object',
        properties: { name: { type: 'string' } },
      },
    },
    views: { only: { material: 'text-input', bind: '/name' } },
  },
  catalog: {
    id: 'fixed-catalog',
    materials: {
      'text-input': {
        manifest: {
          id: 'text-input',
          version: 'example-capability',
          bindings: { value: { schema: { type: 'string' } } },
        },
        artifact: {
          id: 'example-app-build',
          platform: 'web',
          digest: `sha256:${'1'.repeat(64)}`,
        },
      },
    },
    pureFunctions: {},
  },
});

if (result.success) {
  // result.prepared 是真实编译结果；后续交给兼容的 Runtime 消费。
  console.log(result.prepared);
} else {
  console.log(result.diagnostics);
}
```

示例身份与摘要仅作演示。Compiler 不读取或执行实现制品，运行时仍须核对实际制品身份。

当前支持：

- 严格 Definition / Catalog 结构检查、纯 JSON 快照、有限节点 / 深度预算；不修改调用者输入。
- 单视图自动选择或明确 profile；平台按需检查；`bind` / `children` 规范化与原始位置映射。
- 物料、递归 Props、`$literal`、根 / Scope Binding、Slot；静态值按 Schema 校验，动态形状用共享连接证明。
- 命名表达式前向引用 / 环、纯函数签名 / 参数数 / optional / rest / 返回模型；保守合并短路全部分支，不执行函数。
- 每个完整 Props `$expr` 独立生成 `watch`，静态表达式为 `watch: []`；普通 `props.watch` 不受影响。
- Constraint 合并 when / assert / 显式 watch 与 requires 的传递输入；字段前置写入 constraintIds，局部断言观察目标字段，无法局部证明的 Schema 影响覆盖根域；Reaction 保留原显式触发集合。
- one / each 词法 Binder 与成员句柄、七类 Command、模板参数及共享闭包；Scope 身份仍由运行时生成。
- 物料事件与 Host 事件 / 请求契约匹配、请求并发默认值 / 资源引用与需求；调用时 Payload 不附加持续 watch。
- 固定 Schema 资源闭包、JSON Pointer `$ref`、嵌套 `$id`、资源检索别名与相对引用；不联网补资源。
- 基础类型、简单对象、同构数组及可判定的简单联合的保守结构连接；已知不兼容与无法证明分别拒绝，不将业务数值 / 长度限制变成写入门禁。
- 使用能力的 Manifest SHA-256 和输入制品摘要分别锁定，确定静态节点 ID，产物经过 Prepared Schema 自检。

当前 `PREPARED_FORMAT_VERSION` 为 `form-engine.prepared/2`，只是未发布交换格式身份；当前 Runtime 与 React Renderer 已消费该格式；不代表已冻结公开版本或具备跨端兼容承诺。

例如输入 `label: { $expr: { ref: { source: 'data', path: '/name' } } }`，输出在同一包装中加入 `watch: [{ source: 'data', path: '/name' }]`；内部 AST 不变。相同表达式出现在 Command / Payload 时只检查，不附加 watch。Issue target 不自动成为 Constraint 输入，Reaction 的 when / then 读取不变成触发来源。

未选视图不要求其目标物料存在；未使用模板只做输入结构和简写冲突检查，不进入产物闭包。所有保留的全局命名表达式 / 规则均会分析，不因当前视图没引用就遗漏能力锁。

Request 的 Schema 引用使用 URI fragment：读取时先做百分号解码，再按 JSON Pointer 解释转义和查找；不要将编码后的片段直接当作资源字典键。

Schema 静态证明仍是有限子集。复杂组合、条件依赖、Tuple、联合对象路径投影及无法确定的形状拒绝连接；命名锚点与动态 Schema 引用尚不支持。Context 没有额外类型证据时，要求确定类型的连接报告 unproven；不新增 Context watch。Schema 的 default / examples、`$literal` 与 metadata 不作为表达式或依赖递归解析。核心函数只读确定 Catalog，未引入内置实现、别名猜测或常量折叠。

元信息可独立检查，无需表单：

```typescript
import { validateMaterialManifest, validatePureFunctionManifest } from '@form-engine/compiler';

const materialCheck = validateMaterialManifest({ id: 'text', version: 'v1' });
const functionCheck = validatePureFunctionManifest({
  id: 'business.total',
  version: 'v1',
  parameters: [{ name: 'value', schema: { type: 'number' } }],
  returns: { type: 'number' },
});
```

这两个入口目前检查结构、嵌入 Schema 语法和固定参数可选顺序；不证明实现符合声明，也不独立完成外部 Schema 资源闭包检查。Compiler 使用点另行处理相关资源、平台与模型连接。后续契约资源自检和能力开发工具沿同一规则演进。

验证命令：`pnpm --filter @form-engine/compiler test`、`typecheck`、`lint`、`build`。隔离打包消费者由根 `pnpm packages:check` 验证，根 `pnpm check` 串联工程门禁。I05 的完整复杂度 / 体积及目标设备基准待验收；I06 的 TS / React 本地联验已落地，见 [L4 证据](../../docs/design/engineering.md#renderer-implementation)与[完整资产表单证据](../../docs/design/engineering.md#business-travel-implementation)。真实 Host、跨端与生产性能仍待完成。

Reaction 支持显式 Data / Validation 观察与有序 Command / host.emit 响应项，复用 Host
事件名称 / Payload 检查，需求独立于 View 收集。Validation 引用仅在 Reaction 条件和动作
按调用读取，不补充 watch；其他持续表达式或 Constraint 使用时明确诊断。
Prepared 格式为 `form-engine.prepared/2`，明确拒绝旧 `/1` 目标，旧定义可重新编译。
实际 Runtime 校验发布、Host 行为执行和 Adapter 订阅仍由后续模块实现。
