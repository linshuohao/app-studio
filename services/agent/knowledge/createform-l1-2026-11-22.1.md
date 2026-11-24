# CreateForm 协议手册 · TypeScript 对照稿

这份手册按当前作者侧机器契约组织，用于把已确认的需求写成首份 Authoring FormDefinition。覆盖按机制列出，部分场景只有语义和示例片段，尚未做全量生成及执行评测。实际字段形状以同版本 Authoring Schema 为准，物料、函数及签名以目标目录为准，候选必须交真实 Compiler 检查。

## 1. 从需求到配置

1. 提取字段、数据归属、业务规则、界面行为及外部依赖。先澄清会改变业务结果的缺口，例如单人还是多人、何时必填、目的地保存编码还是名称。
2. 先建立业务数据，再选择视图结构和绑定；分别配置纯计算、校验和联动。需要外部能力时，先判断是物料请求、外部校验还是业务事件。
3. 生成完整候选。编译诊断能定位配置错误；会改变用户业务决定的修正须先澄清。通过检查后交付原文、检查结果、假设与 Host 接入说明，由用户审阅、试填和保存。

### 最小 Definition

下面取自 L1 的极简示例。具体协议标识和可用物料仍随实际构建目标核对。

```json
{
  "protocolVersion": "1.0",
  "id": "profile-basic",
  "version": "1.0.0",
  "data": {
    "schema": {
      "type": "object",
      "properties": {
        "name": { "type": "string" }
      },
      "required": ["name"]
    }
  },
  "views": {
    "default": {
      "material": "text-input",
      "props": { "placeholder": "请输入姓名" },
      "bindings": {
        "value": { "source": "data", "path": "/name" }
      }
    }
  }
}
```

业务数据在 `data.schema`，视图在 `views`。按需添加 `expressions`、`constraints`、`reactions`、`viewTemplates`、`validationMessages` 和非执行性的 `metadata`。当前生成的 Authoring Schema 已包含 `validationMessages`，每条按 `schemaRef`、`keyword` 和 `message` 定位 Schema 消息覆盖；历史正文里的候选字段以当前机器契约核对。生成 Authoring Definition；Prepared、能力锁与 Host 需求由 Compiler 产生。业务规则在表单级生效，视图切换和字段隐藏本身不会撤销校验。

## 2. JSON Schema 在配置中的能力边界

`data.schema` 使用标准 JSON Schema 2020-12。按规则所需的数据和计算能力选择实现：

| 需求                                                               | 配置位置            | 例子                                                                      |
| ------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------- |
| 定义字段和数据结构                                                 | `data.schema`       | 成员数组、成员年龄为整数、目的地为字符串。                                |
| 校验单字段或集合                                                   | `data.schema`       | 字段是否存在、年龄范围、候选值集合、成员数上限。                          |
| 校验可由当前数据声明的字段关系                                     | 优先 `data.schema`  | 选中「其他」时备注必填；按某个判别字段选择适用的数据分支。                |
| 执行本地同步业务断言，或需要精确指定适用条件、成员作用域与错误归属 | Internal Constraint | 同一成员的两项动态值比较；复用同一个纯函数驱动监护人显隐及条件校验。      |
| 校验依赖表单外的权威结果或宿主执行                                 | External Constraint | 查询投保资格、核验账号是否已被使用。Host 提供校验器并按当前快照返回结果。 |

先判断规则是否能直接由当前业务数据的 Schema 表达。超出 Schema 的规则，能用同步表达式和目标目录里的纯函数完成时，仍由内部 Constraint 处理；需要 Host 的外部数据或执行时才使用 External Constraint。条件校验只判断数据是否有效。显隐通过视图表达式表达，数据回写通过 Command 或 Reaction 表达。

Definition 只描述业务模型，Working Data 由实例持有；视图端口和规则通过 DataReference 连接模型。**业务数据能按某个 Schema 校验**和**Compiler 能证明某项 Binding、模板参数或函数参数与该 Schema 兼容**是两回事。复杂条件可服务于业务校验；连接处仍按 Compiler 实际支持的类型证明范围检查。

### Reference 与成员作用域

- 用 JSON Schema 表达对象、数组、类型、基础约束和属性存在性。同一张表的多个视图共用业务数据结构。运行中的输入可能尚不合法，留给实际校验解释。
- 缺失、`null`、空字符串、`0` 和 `false` 各有含义。Host 初始化数据优先，Schema 默认值只填真正缺失的位置。JSON Schema 的 `required` 检查属性是否存在；文本是否非空、是否仅在特定条件下必填，要按业务语义表达。
- 用 JSON Pointer 寻址，空字符串指根值。裸路径简写始终从表单数据根开始。读取当前成员用显式局部引用，例如 `{"source":"data","scope":"person","path":"/age"}`。
- ScopeBinder 用 `from`、`as`、`mode` 声明局部绑定。`each` 对数组逐项绑定，在 View 的 ScopeNode 中逐项渲染子视图；`one` 绑定单个数据位置。别名只在词法范围内有效。
- 表达式按所在位置读取允许的 Data、Context 或 Event。Context 是 Host 提供的只读环境；Event 只在相应交互上下文可读。Command 只修改 Form Data。

## 3. 视图、物料和互动

- 先确定目标及视图入口，再从实际 Catalog 选择物料。核对 Manifest 的属性、具名绑定端口、Slots、事件与请求。模板和 Scope 在确有复用、局部数据或重复呈现时使用。
- 动态属性用 ValueSpec 的 `$expr` 包装；静态业务对象需要按字面量解释时使用协议规定的 `$literal`。普通输入通过 Binding 写入，避免用 change 事件再次做同一份写入。
- 把布局放到支持的 Slots。增删列表项等数据写入用 Command；按钮发起宿主业务流程时使用 `host.emit`。读取到的示例只说明机制，本轮可用资产及版本由实际目录确认。

### 视图入口、具名 Slots 与模板

`views` 是 Profile 名到视图节点的字典。入口节点可为物料、ScopeNode 或 TemplateUse。目标只有一个视图时可用任意唯一名称；多个入口要明确目标选择。不同 Profile 可以有不同布局和物料，仍共用数据、校验与联动。切换视图只替换视图订阅和局部 UI 状态。

Slots 按 Manifest 的声明选名，值为节点数组；Authoring 的 `children` 是默认 Slot 简写，`bind` 是受支持的 Binding 简写。物料端口的名字与类型由对应 Manifest 决定。动态 Props 使用 `$expr`，此处的依赖观察由 Compiler 转换为 Prepared 信息。

模板适合在不同入口复用字段布局。模板参数用根 Data Schema 的 Pointer 注解；调用点通过 `with` 映射 DataReference。模板内部只使用自己的参数及合法词法绑定，调用方的别名不能隐式透传。下面是片段，假设已定义 `#/$defs/Insured`，并且调用点的 `row` 已由当前成员绑定。

```json
{
  "viewTemplates": {
    "insured-fields": {
      "params": { "person": { "schemaRef": "#/$defs/Insured" } },
      "node": {
        "material": "text-input",
        "bindings": { "value": { "source": "data", "scope": "person", "path": "/name" } }
      }
    }
  }
}
```

调用节点为 `{"$use":"insured-fields","with":{"person":{"source":"data","scope":"row","path":""}}}`。模板定义只复用类型，实际挂载实例和 UI 状态各自独立。

## 4. 表达式、校验和联动

校验机制先按第 2 节选择。以下说明需要内部或外部 Constraint，以及确实需要数据修改时怎么配置。

- 表达式是纯计算 AST，支持基本字面量、`{ref: ...}`、`{use: ...}`、`{op: ..., args: [...]}` 和 `{literal: ...}`。调用函数前查实际签名、有序参数与返回类型。纯函数不执行 I/O 或写入数据；全局命名表达式不能隐式捕获调用方的局部 Scope。
- 视图条件决定可见性。内部 Constraint 的 `when` 决定规则是否适用，`assert` 返回布尔值，失败由 `issue.target` 和错误码定位。两者需要同步时使用同一个业务判断。
- 需要向外部核验时声明 External Constraint，引用独立的 Validator 能力名，并填写实际适用条件、显式依赖、结果归属和提交义务。Host 实现在本次稳定输入快照与 Scope 下执行。
- 联动响应数据或校验状态变化时，使用 Reaction 的显式 `watch` 确定触发，`when` 决定执行条件，`then` 按序执行 Command 或业务通知。读取字段不会自动增加触发依赖。仅需展示的计算优先用表达式；确需改变数据才用受控写入。

### Command 与数组身份

| 操作                      | 何时用                             | 容易出错的地方                                                                                                 |
| ------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| set / patch / remove      | 替换值、浅层更新对象字段、删除属性 | patch 不递归合并；删除属性和设为 null 有不同语义。                                                             |
| array.insert / array.move | 新增成员或移动现有成员             | 目的位置按命令执行时的数组解释；越界或失效锚点报错。移动时用成员身份定位被移动项，下标可用于确定最终目标位置。 |
| array.remove              | 删除一名明确的成员                 | 用稳定身份或可用的成员 Scope 句柄，避免把渲染时的下标当成员身份。                                              |
| batch                     | 有序组织数据修改                   | 前序成功的修改可以被后序读到；后序失败不默认回滚。                                                             |

操作结构合法时，数据可以暂时违反业务 Schema。例如通过 Host 导入第六人可以由校验报告超限；界面上的新增按钮应在达到上限时避免发出新增命令。业务约束失败与目标类型错误、非法位置等执行失败分别处理。

### 校验依赖、完成状态与观察

- `requires` 等待当前 Scope 下可确定的同步前置。字段前置按基本 Schema 与相关内部同步资格解释；外部校验仍有自己的适用性、依赖和执行结果。字段前置或规则前置的确切字段使用对应 Schema 分支。
- 外部规则用显式 `watch` 覆盖 Host 实现会读取的数据。以当前调用的数据快照和成员 Scope 执行。成员删除或请求因新输入失效后，旧结果不能覆盖新状态。
- 显式完整校验覆盖全部当前适用义务。空错误列表、请求尚未完成、执行错误或过期报告都不能表示通过。View 的绑定只指向 Data，字段错误由 Runtime 聚合后交给物料展示。
- Reaction 可显式观察 Data 或 Validation。ValidationReference 在允许位置只读，用 `field` 定位 DataReference，用 `observe` 选择 `issues`、`status` 或 `state`。规则读取的数据、触发所观察的数据、命令写入的数据分别核对。
- 新规则实例是否首次运行由 `runOnActivate` 控制。视图重挂、同值重写或普通 Reset 不等同于新规则实例。Host 发起异步业务时，联动只发送事件；返回后的写入走普通 Command，并核对上下文和结果适用性。

## 5. Host 的三类能力

| 场景                 | 配置声明                                                                | 接入方式                                                                                        |
| -------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 物料请求，如搜索城市 | 物料声明的 request 加页面 `host.request` 映射；签名包含输入和结果       | 通过 Renderer 请求桥接注册。Host 返回候选项，选中后由 Binding 写入；Host 负责网络和业务鉴权。   |
| 外部校验，如资格核验 | Constraint 引用 Validator，声明依赖、当前 Scope、结果目标与提交义务     | 在 Runtime 注册 Validator，使用调用时快照，返回对应结果。适用校验未装配时属于未完成。           |
| 业务事件，如提交     | Material Event 或 Reaction 发出 `host.emit`，声明事件名与需要的 Payload | 在 Runtime 注册事件处理。Host 负责业务请求、结果适用性和提交；需要修改表单时通过 Command 写回。 |

可选的 HostContract 提供静态签名。Compiler 提取的 HostRequirements 说明候选有哪些依赖；实际实现和接入状态需要装配证据。接入清单写清名称、业务用途、配置出处、触发、输入输出、注册位置、缺失影响，并另列装配所需的初始 Data 与 Context。正式接入时，用户保存版本并发布，Host 按确定的 releaseId 装载 Prepared 制品及锁定依赖。

### 装载、替换与提交

Host 提交初始数据及只读 Context，Runtime 装配 Data、Scope、规则和视图依赖。Host 可以显式替换环境 Context，表达式重读及校验失效依现行机制处理。普通数据更新走 Command；切换到新单据或真实重建实例时要处理旧订阅、成员和请求的资格。

Host 持有业务 Baseline、Dirty、Reset 与提交策略。需要恢复数据时，由 Host 选择恢复命令或实际替换实例。完整通过的结果与已验证的数据快照绑定，Host 再把快照转换为业务提交输入并执行实际提交。出现审批、多步异步请求或支付需求时，应描述外部接入义务，Definition 仍只表达项目支持的表单机制。

## 6. 旅险贯穿案例

已确认的任务：一个表单可填多名被保人；未满 18 岁显示且必填监护人姓名，满 18 岁隐藏并解除这条必填；城市按国家搜索。

1. 数据：`/insureds` 是成员数组。每个成员有 `age` 和 `guardianName`；城市及国家在旅程数据中。是否要求姓名属性始终存在是数据形状决定，姓名非空仅在监护人规则适用时检查。
2. 视图：为每名成员建立局部绑定。旅险源码中视图别名为 `insured`，在 `condition` 的 `visible` 上读取该成员年龄，容器内姓名输入绑定成员自己的 `/guardianName`。
3. 校验：`guardian-required` 的 Scope 从 `/insureds` 按 `each` 绑定为 `person`。其 `when` 用相同年龄政策，`assert` 检查 `person` 的姓名非空，Issue 同样指向该成员的姓名。视图和校验的别名可以不同，只要各自绑定到正确的当前成员。示例使用 `travel.requiresGuardian`、`text.isNonBlank`；使用前核对目标目录和实际年龄政策。
4. 城市：`remote-select` 的 `filterKey` 读 `/travel/countryCode`，`value` 绑定 `/travel/city`，`search` 映射到 `travel.searchCities`。签名来自实际物料与 Host 契约，选择值的业务含义不明确时先澄清。
5. 检查：真实 Compiler 接受完整原文后，将同一候选交给隔离预览。用一名 17 岁和一名 18 岁成员检验作用域，再对同一成员做 17 → 18 → 17，检查显隐和空值校验。城市搜索可在已装配的受控 Host 环境试填。记录编译、场景执行与目标业务 Host 接入各自的证据。

## 7. 返回候选前自检

- 每条确认过的业务要求有配置落点；字段归属、条件和输出值含义一致。
- 使用的物料、函数及签名来自本轮实际目标；引用、配置形状和 Host 映射通过真实检查。
- 用户可看清关键规则、假设、Host 义务和可试填范围；配置原文与检查凭据对应同一候选。
- 只向用户询问会改变数据、行为或必要接入的决定。检查服务故障作为执行失败报告。

## 8. 能力覆盖和试验矩阵

| 场景                         | 最低验收证据                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| 基础姓名输入、多端口日期范围 | Binding 与目标 Manifest 对得上；真实输入写到正确数据位置。                                         |
| 两名成员及模板复用           | 分别输入不同值并重排；模板调用参数可解析，修改与错误始终归属原成员。                               |
| 动态属性和条件义务           | 17 → 18 → 17 时显隐与必填一致；父成员或其他成员的数据变化不误触。                                  |
| 联动与数据写入               | 区分只展示的计算和需要写入的值；合法触发顺序与实例首次激活符合要求。                               |
| 同步前置及外部校验           | 同步前置未通过时外部校验按契约处理；后发请求、成员删除、过期响应可区分；完整校验检查所有适用义务。 |
| 物料请求与业务通知           | 搜索返回候选项，选中才更新城市；提交事件由 Host 接管，缺少必要注册时报出实际影响。                 |
| 多 Profile 与实例替换        | 新视图装载自己的绑定和订阅，共用数据与业务规则；旧实例的过期结果不写回。                           |
| 能力缺口                     | 缺必要物料或 Host 契约时得到澄清或受阻说明；模型能说明哪一部分需要扩展。                           |

评测时分别记录结构校验、真实 Compiler、Runtime 行为、目标 Host 装配。整份手册的 token、耗时、首次通过率、修正次数和关键需求漏项也单独记录。当前稿对极简示例和模板定义片段执行了结构校验。扩展章节的行为例尚需通过真实测试，不能据此推导任意表单都可生成。

## 来源

现行 L1 的 Definition、Data / Reference / Scope、Expression / Validation、Command / Reaction、View / Material / Host、生命周期和示例章节；Authoring FormDefinition JSON Schema；仓库旅险 Definition 及 Runtime 验收契约。此稿用于测量 Agent 阅读成本。

## TypeScript 到手册的逐项对应

| TypeScript 类型来源                                                                | 对应手册      | 需要一起核对的含义                                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `definition/form.ts` 的 `FormDefinition`                                           | 1、2、3、4、5 | Data、Expression、Constraint、Reaction、View 及说明性字段共同构成一个配置。protocolVersion、表单 id、配置 version 各有不同用途。                                                       |
| `definition/authoring.ts`                                                          | 1、3          | 只扩宽递归视图的作者简写。bind 与对应端口冲突、children 与默认槽冲突按 Compiler 规则处理。                                                                                             |
| `definition/reference.ts`                                                          | 2、4          | DataReference / ContextReference / EventReference / ValidationReference 区分读取上下文；规则 ScopeDeclaration 可用有序 Binder 链，视图 ScopeNode 是一个 Binder。成员句柄用于数组身份。 |
| `definition/expression.ts`                                                         | 3、4          | Expression 是计算 AST；ValueSpec 在规定位置递归嵌入它。AST 原样对象用 literal，ValueSpec 原样对象用 $literal；作者侧 $expr 不带 Prepared 的 watch。                                    |
| `definition/view.ts`、`definition/host-event.ts`                                   | 3、5          | 三类视图节点、具名绑定及 Slots；on 支持 form.command 或 host.emit；requests 单独映射有返回值的请求。                                                                                   |
| `definition/command.ts`、`form.ts` 的 `Reaction`                                   | 4             | Reaction 的 watch、when、then、runOnActivate 各有职责；then 支持命令及 Host 事件，batch.commands 只装 Command。                                                                        |
| `definition/validation.ts`                                                         | 1、4、5       | Internal 的 when / assert 可推导读取；External 用 validator / watch / target 声明义务；requires 是同步前置。SchemaMessageOverride 按 schemaRef、keyword 与 message 工作。              |
| `common.ts`、`capability/material.ts`、`pure-function.ts`、`host.ts`、`catalog.ts` | 2、3、4、5    | 基础 JSON 和消息类型，目标物料端口、纯函数签名、可选 Host 静态签名和确定 Catalog。它们是连接证据；Compiled Prepared 和运行状态各有独立类型。                                           |

### 从同一旅险配置看三个接口如何接起来

#### View：国家影响城市搜索，城市选择写入数据

```json
{
  "material": "remote-select",
  "props": {
    "filterKey": {
      "$expr": {
        "ref": {
          "source": "data",
          "path": "/travel/countryCode"
        }
      }
    }
  },
  "bindings": {
    "value": {
      "source": "data",
      "path": "/travel/city"
    }
  },
  "requests": {
    "search": {
      "type": "host.request",
      "request": "travel.searchCities"
    }
  }
}
```

`filterKey` 是动态 Props，读取国家来构造物料自己的查询上下文。`bindings.value` 指定选中的值写到哪里。`requests.search` 才将物料的查询映射给 Host；省略映射的 payload 时沿用物料提供的 Payload。项目要求已使用物料声明的请求都要映射。显示条件也可用动态 Props，例如条件容器的 visible；它本身不会清空字段或撤销业务校验。

#### Reaction：换国家后清空旧城市

```json
{
  "id": "clear-city-on-country",
  "watch": [
    {
      "source": "data",
      "path": "/travel/countryCode"
    }
  ],
  "then": [
    {
      "op": "set",
      "target": {
        "source": "data",
        "path": "/travel/city"
      },
      "value": null
    }
  ]
}
```

显式观察的是国家，而不是城市。该规则由数据变化触发，因此即使城市组件没挂载，也按规则生命周期生效。清空是显式的 set null；若业务要求属性消失，则用 remove 并检查 Schema。旅险另有带 runOnActivate 的保费估算规则，可对照验证首次激活和后续变更。首次激活参数属于 Reaction，不应加到 View 或 Command。

#### 外部校验：每名成员的投保资格

```json
{
  "id": "identity-eligibility",
  "kind": "external",
  "validator": "travel.checkEligibility",
  "scope": {
    "from": {
      "source": "data",
      "path": "/insureds"
    },
    "as": "person",
    "mode": "each"
  },
  "watch": [
    {
      "source": "data",
      "path": "/idNumber",
      "scope": "person"
    },
    {
      "source": "data",
      "path": "/age",
      "scope": "person"
    },
    {
      "source": "data",
      "path": "/travel/countryCode"
    }
  ],
  "target": {
    "source": "data",
    "path": "/idNumber",
    "scope": "person"
  },
  "requires": [
    {
      "kind": "field",
      "target": {
        "source": "data",
        "path": "/idNumber",
        "scope": "person"
      },
      "phase": "sync"
    },
    {
      "kind": "field",
      "target": {
        "source": "data",
        "path": "/age",
        "scope": "person"
      },
      "phase": "sync"
    }
  ]
}
```

`target` 说明结果关联证件号，实际输入还包括年龄和全局国家。这三处都在 watch 中；只有成员字段带 person，国家从表单根读取。前置检查本成员的证件号和年龄的同步资格。Host 按 travel.checkEligibility 注册校验器，从本次稳定快照和 Scope 取数并报告结果。配置里无需写 URL、payload 映射或可跳过完整校验的标记；当前 ExternalConstraint 类型没有 requiredForSubmit 字段。物料请求的 `host.request` 属于另一条接缝。

上面三段取自或简化自仓库旅险配置，分别用生成的 AuthoringViewNode、Reaction、ExternalConstraint Schema 分支检查。它们是独立配置片段，编译仍需完整 Definition、匹配的业务 Data Schema、Catalog 与目标；行为验证还需运行实例和 Host 装配。
