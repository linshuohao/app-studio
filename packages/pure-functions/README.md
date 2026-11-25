# pure-functions

从仓库根运行 `node tools/engineering/catalog-docs.mjs --lookup date.inclusiveDays`，按函数 ID 从当前资产目录读取签名、说明、实现和示例。内置函数也使用同一命令，例如 `--lookup core.if`。

## 新增纯函数

1. 用 `pnpm asset:new function --id <namespace.functionName>` 生成目录。业务函数使用业务命名空间，`core.*` 预留给引擎。函数 ID 用稳定的英文标识，业务名称由目录元数据提供。
2. 在 `src/<资产目录>/manifest.ts` 定义签名。固定参数按调用顺序声明，选填固定参数置于末尾，`restParameter` 表示变长尾部。用 JSON Schema 说明参数和结果，明确常量约束及单位。表达式以有序 `args` 传值。
3. 在同目录的 `implementation.ts` 实现同步、确定的计算。只用输入和显式传入的规则，不读时间、全局可变状态或外部服务，不写表单数据。资产 README 和调用示例要写清非法输入、空值、错误和返回值。
4. 在 `catalog-docs.json` 按函数 ID 填目录元数据，在 Playground 的真实表单定义提供调用片段。按对应目录补函数验证用例，通过资产工具更新导出和版本声明。Host 显式注册所需绑定。
5. 从仓库根运行 `node tools/engineering/catalog-docs.mjs` 生成目录，运行 `node tools/engineering/catalog-docs.mjs --check` 核对生成物。生成器校验签名、参数名称、说明、示例和模板插槽。

## 元数据字段

### 签名

| 字段 | 定义 |
| --- | --- |
| `id` | 供表达式 `op` 引用的稳定函数标识。 |
| `version` | 函数签名版本，由资产版本工具管理。 |
| `parameters` | 按位置绑定的固定参数。每项的 `name` 是签名内唯一的英文参数名，`schema` 是值的 JSON Schema，`optional` 表示可省略。 |
| `restParameter` | 可选的变长尾参数定义，每个多出的实参都使用同一值 Schema。 |
| `returns` | 返回值的 JSON Schema。单位、空值行为和示例补在目录说明中。 |

### 函数目录

| 字段 | 定义 |
| --- | --- |
| `title` | 面向作者的函数名称。计算和判断优先用「动词 + 对象」，如「计算总保费」。 |
| `summary` | 可选一句话简介，说明功能和关键结果。 |
| `category` | 可选目录分类，省略时按函数命名空间归类。 |
| `parameterLabels` | 签名参数名到业务名称的映射，覆盖固定参数和变长尾参数。参数名用在插槽里，业务名称用在表单和摘要里。现有内置与业务函数提供中文名称。旧目录缺少标签时，Studio 将英文签名名分词显示，`arg0` 等内部占位名回退为参数序号。 |
| `annotations` | JSON Pointer 到说明的映射，指向 Manifest 的参数、返回值或其 Schema 属性。例如 `/parameters/0` 说明第一个参数的用途，`/returns` 解释结果和单位。 |
| `displayTemplate` | 可选短句模板，使用 `{参数名}` 插入取值，用于折叠摘要。 |
| `displayLines` | 可选结构模板，每个字符串表示一行，使用同样的 `{参数名}` 引用结构化取值。复杂实参由 Studio 在该行下继续缩进。省略时使用函数调用和参数列表。 |
| `callExamples` | 每项包含按签名排列的 `args`、对应的 `result` 和描述场景的 `description`。 |
| `description`、`example` | 内置函数在目录源中填写完整说明与真实表达式片段。业务函数的说明来自资产 README，表达式片段从示例表单提取。 |
| `version`、`source`、`implementation`、`examples` | 输出目录中由生成器填充的签名版本、说明来源、实现类型与配置样例。 |

两个模板都用签名中的固定参数名作为插槽，且必须覆盖全部固定参数。变长函数用通用调用排版。选填实参缺省时使用参数列表回退。模板只描述展示，具名表达式和字段路径仍从配置解析。

例如 `core.if` 的 `displayLines` 是 `["if {arg0}", "then {arg1}", "else {arg2}"]`。`parameterLabels.arg0` 是「判断条件」，`annotations["/parameters/0"]` 解释该条件如何参与求值。

## 旅险函数及示例

`createCoreFunctions(artifact)` 保留现有 core.* 集合、版本与身份保护，不自动混入业务函数。首批七个业务函数按单目录平铺，Host 显式注册需要的 create 工厂；Catalog 的 Manifest 与实际绑定使用同一制品身份。`@form-engine/pure-functions/manifests` 仅导出静态业务契约，不执行算法或加载 React / Runtime。

```ts
import { createTravelTotalPremium } from '@form-engine/pure-functions';
const binding = createTravelTotalPremium(artifact);
binding.invoke([[{ age: 30 }, { age: 12 }], 'basic', 2, ratePolicy]); // 500 分
```

`AgePolicy`、`DailyRates`、`RatePolicy` 类型由根入口导出。政策采用以下明确配置，不从全局状态读取：

```ts
const agePolicy = { minAge: 0, maxAge: 80, adultAge: 18 };
const ratePolicy = {
  agePolicy,
  maxDays: 30,
  maxInsureds: 5,
  rates: {
    basic: { adultDailyMinor: 100, childDailyMinor: 150 },
    plus: { adultDailyMinor: 180, childDailyMinor: 250 },
  },
};
```

上述为合成验收政策，不代表真实保险产品。字段完整且不接受未知项；年龄阈值为非负安全整数，minAge ≤ maxAge。成年阈值独立于保障年龄范围，允许覆盖范围内全为成年人或未成年人。maxDays / maxInsureds 为正安全整数，日费率为非负安全整数。非法政策即使遇到非法工作值也抛错，不隐藏配置故障。普通 JSON 工作值不做类型转换；不返回 NaN / Infinity / BigInt。Missing 在表达式层显式处理。

日期按公历序日计算，不读时钟、时区或经过毫秒数。金额使用安全整数分；先检查业务输入，后计算及检查乘法 / 加法溢出。总价不依赖姓名、证件、监护人或外部资格，不意味着整单合法。业务函数复用私有 `_internal` 算法，UI 日期解析保留独立实现，通过共享测试向量对齐，未增加跨包依赖。

每个公开函数有 manifest.ts、implementation.ts、README；tests 目录镜像组织。生成与版本工具见 [资产工具](../../tools/engineering/assets/README.md)，当前只声明变更，不在本期自动应用版本或发布。
