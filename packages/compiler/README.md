# Compiler

本包按 [Compiler 详细设计](../../docs/design/l2/compiler.md)实施。当前完成 I01 静态视图纵切，保持 private / 0.0.0；完整表达式、规则与交互编译尚未交付。

目录遵循[全仓包组织约定](../../docs/design/engineering.md#package-source-layout)：

```text
src/
  index.ts                  # 公共导出
  types.ts                  # 公共 SDK 类型
  pipeline/compile.ts       # 阶段编排
  input/                    # 接收、规范化、原始位置映射
  capability/               # Catalog 查询、Manifest 自检与锁收集
  analysis/schema/          # 资源模型、连接证明、静态值校验
  view/                     # 视图检查与静态 ValueSpec 遍历
  output/assemble.ts        # Prepared 装配与自检
  diagnostics/              # 诊断收集
  validation/               # 协议结构校验
  common/                   # JSON、对象与 Pointer 基础操作
tests/
  pipeline/compile.test.ts
  capability/validation.test.ts
  fixtures.ts
```

入口只组织流程；分析与编译模块各自负责其领域，公共导出保持集中。测试独立于 src，生产与测试分别进行类型检查；已有 engineering 入口保留在 src 根用于工程联验。

阅读实现时先看 pipeline/compile.ts，再沿 input → capability / analysis/schema / view → output 阅读。当前体量主要来自校验，尤其是 Schema 的资源身份、引用解析、结构连接和静态 Props 值校验；这些是静态视图闭环已使用的基础能力，也会被后续表达式 / 完整视图批次复用。外部资源别名、嵌套 $id 等是现有引用支持的边界处理，不代表已建设平台分析功能。

I01 尚未实现表达式依赖分析、watch 生成和规则编译，也没有平台分析报告、可视化、增量编译或代码生成。当前校验闭环不等于已证明运行时优化收益；后续须由真实依赖分析及 Runtime / Adapter 消费验证。

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
- 静态物料、静态嵌套 Props、`$literal`、根数据 Binding、Slot 检查；Props 用 Manifest Schema 验证。
- 固定 Schema 资源闭包、JSON Pointer `$ref`、嵌套 `$id`、资源检索别名与相对引用；不联网补资源。
- 基础类型、简单对象及同构数组的保守结构连接；已知不兼容与无法证明分别拒绝，不将业务数值 / 长度限制变成写入门禁。
- 使用能力的 Manifest SHA-256 和输入制品摘要分别锁定，确定静态节点 ID，产物经过 Prepared Schema 自检。

当前 `PREPARED_FORMAT_VERSION` 为 `form-engine.prepared/1`，只是未发布交换格式身份；Runtime 尚未实现，不代表已有兼容运行端。

命名表达式、响应式 `$expr`、Constraint、Reaction、Scope 视图、模板使用、Event / Request 映射和校验消息编译返回 `FEATURE_NOT_IMPLEMENTED`，不产生部分 Prepared。页面缺少必需请求映射会得到具体诊断。未选视图不要求其目标物料存在；未使用模板只做输入结构和简写冲突检查，不进入产物闭包。

Schema 静态证明仍是首批子集。复杂组合、条件依赖、Tuple 及无法确定的形状拒绝连接；命名锚点与动态 Schema 引用尚不支持。Schema 的 default / examples、`$literal` 与 metadata 不作为表达式或依赖递归解析。

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

验证命令：`pnpm --filter @form-engine/compiler test`、`typecheck`、`lint`、`build`。隔离打包消费者由根 `pnpm packages:check` 验证，根 `pnpm check` 串联工程门禁。I02–I06 的交付与 Runtime / Adapter 联验仍待完成。
