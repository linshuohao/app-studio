# CreateForm 配置手册

## 1. 从需求到配置

1. 提取字段、数据归属、业务规则、界面行为及外部依赖。先澄清会改变业务结果的缺口，例如单人还是多人、何时必填、目的地保存编码还是名称。
2. 先建立业务数据，再选择视图结构和绑定；分别配置纯计算、校验和联动。需要外部能力时，先判断是物料请求、外部校验还是业务事件。
3. 生成完整候选。编译诊断能定位配置错误；会改变用户业务决定的修正须先澄清。通过检查后交付原文、检查结果、假设与 Host 接入说明，由用户审阅、试填和保存。

### 最小 Definition

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

业务数据放在 data.schema，视图入口放在 views。validationMessages 按 schemaRef 和 keyword 定位校验项并覆盖文案。Compiler 从候选生成 Prepared、能力锁与 Host 需求。

Definition 只保存可交换声明。metadata 接受业务 JSON，里面的标记不会执行。协议对象拒绝未知字段或混用联合分支；不要增加 services、scopes 或 submissionWorkflow。Canonical 与 Authoring 共享业务模型，Prepared ABI 单独版本化。

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

Binder.from 只接受静态数据引用。有序绑定链的后项可使用前项，别名不能遮蔽。成员移动后，相对成员的观察仍指原人，固定下标则读取当前位置。成员删除后句柄失效；整数组替换时不能根据业务值猜测身份复用。非法输入可暂存为工作值。跳过动作不会清除旧派生值，需要清除时显式写回。

静态连接可检查同资源引用、基础类型（integer 可接 number）、显式 null、const / enum、对象必需属性和额外属性、同构数组与简单联合。源联合的每个分支都要被目标接受。已知冲突与无法证明都阻止连接。复杂条件可用于业务校验；连接处需另有可证明的形状。

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

多入口没有明确选择时不能取字典首项。Profile 与实现平台分别选择。条件隐藏时仍保留父级条件观察。物料的输入体验限制不能替代业务校验。模板引用必须存在且无环；实参须符合形参 schemaRef。bind 指向根数据并展开为 bindings.value；children 展开为 slots.default；同一端口或默认槽重复配置会冲突。物料事件通过 on 响应，事件未声明 payloadSchema 时没有可读取的事件数据。

## 4. 表达式、校验和联动

校验机制先按第 2 节选择。以下说明需要内部或外部 Constraint，以及确实需要数据修改时怎么配置。

- 表达式是纯计算 AST，支持基本字面量、`{ref: ...}`、`{use: ...}`、`{op: ..., args: [...]}` 和 `{literal: ...}`。调用函数前查实际签名、有序参数与返回类型。纯函数不执行 I/O 或写入数据；全局命名表达式不能隐式捕获调用方的局部 Scope。
- 视图条件决定可见性。内部 Constraint 的 `when` 决定规则是否适用，`assert` 返回布尔值，失败由 `issue.target` 和错误码定位。两者需要同步时使用同一个业务判断。
- 需要向外部核验时声明 External Constraint，引用独立的 Validator 能力名，并填写实际适用条件、显式依赖、结果归属。Host 实现在本次稳定输入快照与 Scope 下执行。
- 联动响应数据或校验状态变化时，使用 Reaction 的显式 `watch` 确定触发，`when` 决定执行条件，`then` 按序执行 Command 或业务通知。读取字段不会自动增加触发依赖。仅需展示的计算优先用表达式；确需改变数据才用受控写入。

Missing 不序列化。普通函数不隐式转换类型，求值失败与业务断言为假分别处理。core.and、core.or、core.if 短路，编译时仍分析所有可能读取；其他函数严格求值。固定参数按序，可选参数置尾，变长参数由 restParameter 声明。

ValueSpec 的 $expr / $literal 包装拒绝额外字段，转义后的内容不再递归解释。

### Command 与数组身份

| 操作                      | 何时用                             | 容易出错的地方                                                                                                 |
| ------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| set / patch / remove      | 替换值、浅层更新对象字段、删除属性 | patch 不递归合并；删除属性和设为 null 有不同语义。                                                             |
| array.insert / array.move | 新增成员或移动现有成员             | 目的位置按命令执行时的数组解释；越界或失效锚点报错。移动时用成员身份定位被移动项，下标可用于确定最终目标位置。 |
| array.remove              | 删除一名明确的成员                 | 用稳定身份或可用的成员 Scope 句柄，避免把渲染时的下标当成员身份。                                              |
| batch                     | 有序组织数据修改                   | 前序成功的修改可以被后序读到；后序失败不默认回滚。                                                             |

操作结构合法时，数据可以暂时违反业务 Schema。例如通过 Host 导入第六人可以由校验报告超限；界面上的新增按钮应在达到上限时避免发出新增命令。业务约束失败与目标类型错误、非法位置等执行失败分别处理。

insert 下标允许 0 到 length；move 使用移动后的最终下标 0 到 length−1。before / after 锚点须属于目标数组，失败的移动保留原成员。

### 校验依赖、完成状态与观察

- `requires` 等待当前 Scope 下可确定的同步前置。字段前置按基本 Schema 与相关内部同步资格解释；外部校验仍有自己的适用性、依赖和执行结果。
- 外部规则用显式 `watch` 覆盖 Host 实现会读取的数据。以当前调用的数据快照和成员 Scope 执行。成员删除或请求因新输入失效后，旧结果不能覆盖新状态。
- 显式完整校验覆盖全部当前适用义务。空错误列表、请求尚未完成、执行错误或过期报告都不能表示通过。View 的绑定只指向 Data，字段错误由 Runtime 聚合后交给物料展示。
- Reaction 可显式观察 Data 或 Validation。ValidationReference 在允许位置只读，用 `field` 定位 DataReference，用 `observe` 选择 `issues`、`status` 或 `state`。规则读取的数据、触发所观察的数据、命令写入的数据分别核对。
- 新规则实例是否首次运行由 `runOnActivate` 控制。视图重挂、同值重写或普通 Reset 不等同于新规则实例。Host 发起异步业务时，联动只发送事件；返回后的写入走普通 Command，并核对上下文和结果适用性。

requires 多项须全部满足，constraintId 只能连接可唯一绑定的同步规则，环、自引用和外部前置均非法。issue.target 只定位结果。message 用 {"text":"请输入姓名"} 或 {"key":"guardian.required"}；覆盖文案不改变判定。旧 Issue 按来源撤销，独立规则的错误继续保留。完整校验绑定输入快照并等待全部适用校验，增量检查只处理命中的规则。

Reaction.watch 只接受 data 或 validation；普通 Reaction 没有 event。Validation 可用于该 Reaction 的 when、命令值和通知 payload；持续 View、Constraint 和全局命名表达式不能借此读取校验状态。已排队的同一实例可合并触发并读取最新值；then 中两次相同通知仍交付两次。前一命令的写入对后一动作可见。Host 返回的 Promise 不参与顺序执行；业务需自行避免跨异步轮次的循环。

## 5. Host 的三类能力

| 场景                 | 配置声明                                                                | 接入方式                                                                                        |
| -------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 物料请求，如搜索城市 | 物料声明的 request 加页面 `host.request` 映射；签名包含输入和结果       | 通过 Renderer 请求桥接注册。Host 返回候选项，选中后由 Binding 写入；Host 负责网络和业务鉴权。   |
| 外部校验，如资格核验 | Constraint 引用 Validator，声明依赖、当前 Scope、结果目标               | 在 Runtime 注册 Validator，使用调用时快照，返回对应结果。适用校验未装配时属于未完成。           |
| 业务事件，如提交     | Material Event 或 Reaction 发出 `host.emit`，声明事件名与需要的 Payload | 在 Runtime 注册事件处理。Host 负责业务请求、结果适用性和提交；需要修改表单时通过 Command 写回。 |

可选的 HostContract 提供静态签名。Compiler 提取的 HostRequirements 说明候选有哪些依赖；实际实现和接入状态需要装配证据。接入清单写清名称、业务用途、配置出处、触发、输入输出、注册位置、缺失影响，并另列装配所需的初始 Data 与 Context。正式接入时，用户保存版本并发布，Host 按确定的 releaseId 装载 Prepared 制品及锁定依赖。

请求输入由物料经页面映射送给 Host，Host 结果必须满足物料 resultSchema。latest 默认按挂载实例及请求名淘汰旧调用，parallel 独立交付。卸载、改绑或成员删除使旧调用失效；桥接区分 success、error、discarded，业务结果 Schema 只描述成功数据。依赖 props 改变时由物料取消或重发；请求不计入完整校验。缺少必需映射在编译时诊断，Host 的实际注册另在装配时核对。

### 装载、替换与提交

Host 提交初始数据及只读 Context，Runtime 装配 Data、Scope、规则和视图依赖。Host 可以显式替换环境 Context，表达式重读及校验失效依现行机制处理。普通数据更新走 Command；切换到新单据或真实重建实例时要处理旧订阅、成员和请求的资格。

Host 持有业务 Baseline、Dirty、Reset 与提交策略。需要恢复数据时，由 Host 选择恢复命令或实际替换实例。完整通过的结果与已验证的数据快照绑定，Host 再把快照转换为业务提交输入并执行实际提交。出现审批、多步异步请求或支付需求时，应描述外部接入义务，Definition 仍只表达项目支持的表单机制。

读取 snapshot 不触发 Flush、等待异步或建立 Baseline。Context 替换可使呈现和校验失效，本身不会触发 Reaction。导入或 Reset 后若显式观察值未变，不能依靠同一规则重新计算。单入口自动选中；多 Profile 可按目标交付视图依赖，所有 Profile 共享的校验与联动仍须保留。

## 6. 旅险贯穿案例

已确认的任务：一个表单可填多名被保人；未满 18 岁显示且必填监护人姓名，满 18 岁隐藏并解除这条必填；城市按国家搜索。

1. 数据：`/insureds` 是成员数组。每个成员有 `age` 和 `guardianName`；城市及国家在旅程数据中。是否要求姓名属性始终存在是数据形状决定，姓名非空仅在监护人规则适用时检查。
2. 视图：为每名成员建立局部绑定。这里使用的视图别名为 `insured`，在 `condition` 的 `visible` 上读取该成员年龄，容器内姓名输入绑定成员自己的 `/guardianName`。
3. 校验：`guardian-required` 的 Scope 从 `/insureds` 按 `each` 绑定为 `person`。其 `when` 用相同年龄政策，`assert` 检查 `person` 的姓名非空，Issue 同样指向该成员的姓名。视图和校验的别名可以不同，只要各自绑定到正确的当前成员。示例使用 `travel.requiresGuardian`、`text.isNonBlank`；使用前核对目标目录和实际年龄政策。
4. 城市：`remote-select` 的 `filterKey` 读 `/travel/countryCode`，`value` 绑定 `/travel/city`，`search` 映射到 `travel.searchCities`。签名来自实际物料与 Host 契约，选择值的业务含义不明确时先澄清。
5. 检查：真实 Compiler 接受完整原文后，将同一候选交给隔离预览。用一名 17 岁和一名 18 岁成员检验作用域，再对同一成员做 17 → 18 → 17，检查显隐和空值校验。城市搜索可在已装配的受控 Host 环境试填。记录编译、场景执行与目标业务 Host 接入各自的证据。

### View：国家影响城市搜索，城市选择写入数据

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

### Reaction：换国家后清空旧城市

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

显式观察的是国家，而不是城市。该规则由数据变化触发，因此即使城市组件没挂载，也按规则生命周期生效。清空是显式的 set null；若业务要求属性消失，则用 remove 并检查 Schema。首次激活参数属于 Reaction，不应加到 View 或 Command。

### 外部校验：每名成员的投保资格

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

## 7. 返回候选前自检

- 每条确认过的业务要求有配置落点；字段归属、条件和输出值含义一致。
- 使用的物料、函数及签名来自本轮实际目标；引用、配置形状和 Host 映射通过真实检查。
- 用户可看清关键规则、假设、Host 义务和可试填范围；配置原文与检查凭据对应同一候选。
- 只向用户询问会改变数据、行为或必要接入的决定。检查服务故障作为执行失败报告。

### 试填时核对的行为

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

## 配置字段与分支

以下声明共用同一组类型名。字段名后的 ? 表示可省略。

### 基础值与制品身份

```ts
/** 可交换的 JSON 基础值。Missing 不属于 JSON，不能以 undefined / NaN 代替。 */
export type JsonPrimitive = string | number | boolean | null;
/** 原样业务 JSON；其中恰好出现 $expr 等键，也不会自动成为表达式。 */
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
/** 允许任意业务属性名的 JSON 对象，不适用协议节点的未知字段拒绝规则。 */
export interface JsonObject {
  [key: string]: JsonValue;
}
/**
 * 嵌入的 JSON Schema 2020-12。TS 保留 JSON 形态，派生 Schema 引用标准 meta-schema 检查关键字语法。
 * 它既不代表某份业务数据已经合法，也不证明两个 Schema 能静态兼容；后者由 Compiler 判断。
 */
export type JsonSchema = boolean | JsonObject;
/** 展示文案或由 Host 解析的资源键；消息缺失不能吞掉错误，消息覆盖不能改变校验结论。 */
export type MessageSpec = { text: string } | { key: string };
/**
 * 含算法前缀的不可变内容摘要。十六进制长度由生成的 Schema 检查，TS 模板类型只约束前缀。
 * @pattern ^sha256:[a-f0-9]{64}$
 */
export type ContentDigest = `sha256:${string}`;
/** 确定的实现制品身份，可被多个能力共用；下载地址不替代该身份。 */
export interface ArtifactIdentity {
  /** 制品或不可变应用构建的身份，不是 Material / Pure Function 的逻辑 ID。 */
  id: string;
  /** 该实现适用的平台，由装载边界与编译目标核对。 */
  platform: string;
  /** 实际交付制品字节的摘要；不等同于 Manifest 的契约摘要。 */
  digest: ContentDigest;
}
/** Definition 与 Prepared 语义完全相同的数字目的位置；锚点位置仍由各自领域声明。 */
export interface ArrayIndexPosition {
  kind: 'index';
  /**
   * 插入时为执行时数组的 0..length；移动时为移动后的最终下标 0..length-1。
   * Schema 检查非负整数，当前数组的实际边界由 Runtime 在执行时检查，不自动夹取或追加。
   * @minimum 0
   * @asType integer
   */
  index: number;
}
```

### 表单与联动

```ts
/** 有序响应项；Host 行为同步发起，不等待其异步完成，不扩展 Command。 */
export type ReactionAction = Command | HostEventIntent;
/** 数据或校验状态变化驱动的同步联动声明；实例随 Runtime / Scope 激活，不随 View 显隐注销。 */
export interface Reaction {
  /** 定义内规则身份，区别于每个 Scope 的实际运行实例身份。 */
  id: string;
  /** 规则使用的局部词法上下文；省略时不建立额外 Binder。 */
  scope?: ScopeDeclaration;
  /** 显式触发来源；when 和 Command 值的读取不会被静默加入。 */
  watch: ReactionWatch[];
  /** 被触发后才检查的适用条件；省略时无额外条件。 */
  when?: Expression;
  /** 按序执行命令或发出 Host 通知；不 await Host，不默认整体回滚。 */
  then: ReactionAction[];
  /** 默认 false；只在新规则实例首次建立时应用，不因 View 重挂或业务 Reset 再次激活。 */
  runOnActivate?: boolean;
}
/** 作者维护和交换的 Canonical 定义。它是 Compiler 输入，不是 Runtime 的执行入口。 */
export interface FormDefinition {
  /** L1 语法 / 语义格式身份，独立于包版本和 Prepared 格式版本。 */
  protocolVersion: string;
  /** 业务表单身份，不是某次运行实例 ID。 */
  id: string;
  /** 该业务定义的修订身份；不用于推断引擎或能力兼容性。 */
  version: string;
  /** 完整业务数据模型；当前 Working Data 不保存在 Definition 中。 */
  data: { schema: JsonSchema };
  /** 按名称复用的纯表达式；不隐式捕获调用方局部 Scope。 */
  expressions?: Record<string, Expression>;
  /** 当前表单全部业务约束；缺省表示未额外声明 Constraint。 */
  constraints?: Constraint[];
  reactions?: Reaction[];
  /** 视图名到入口节点；单入口自动选中，不强制 default 名称或显式 Profile / 平台选择。 */
  views: Record<string, ViewNode>;
  /** 共享静态模板；编译准备内部依赖，运行时绑定参数并实例化，不复制业务数据。 */
  viewTemplates?: Record<string, ViewTemplate>;
  /** 按业务 Schema 声明位置和关键字覆盖文案，不新增校验规则。 */
  validationMessages?: SchemaMessageOverride[];
  /** 非执行性元数据，允许任意业务 JSON 键，不在其中识别表达式。 */
  metadata?: Record<string, JsonValue>;
}
```

### 创作简写

```ts
/**
 * 允许书写简写的物料输入。供 Compiler 默认入口规范化使用，本包不实现转换算法。
 * Canonical MaterialNode 不接收 bind / children；简写冲突须报错，不能靠字段优先级静默覆盖。
 */
export interface AuthoringMaterialNode extends Omit<MaterialNode, 'slots'> {
  /** 根数据 Pointer 简写，例如 /name；规范化为 bindings.value，不随局部 Scope 改为相对路径。 */
  bind?: JsonPointer;
  /** slots.default 的书写简写，子节点也可继续使用 Authoring 语法。 */
  children?: AuthoringViewNode[];
  slots?: Record<string, AuthoringViewNode[]>;
}
/** 在 Scope 包装内递归接受 Authoring 子节点，绑定语义仍沿用 ScopeNode。 */
export interface AuthoringScopeNode extends Omit<ScopeNode, 'node'> {
  node: AuthoringViewNode;
}
/** Authoring 输入节点集合；规范化后只剩 Canonical ViewNode。 */
export type AuthoringViewNode = AuthoringMaterialNode | AuthoringScopeNode | TemplateUse;
/** 允许模板体使用简写；参数仍只支持 Typed Data Reference。 */
export interface AuthoringViewTemplate {
  params?: Record<string, TemplateDataParam>;
  node: AuthoringViewNode;
}
/** 带书写简写的输入表示，不是第三套业务协议，不能直接交给 Runtime 执行。 */
export interface AuthoringFormDefinition extends Omit<FormDefinition, 'views' | 'viewTemplates'> {
  views: Record<string, AuthoringViewNode>;
  viewTemplates?: Record<string, AuthoringViewTemplate>;
}

/** Compiler 默认接收的定义；规范写法也满足该结构，不要求 syntax 或两条调用入口。 */
export type CompilerInputDefinition = AuthoringFormDefinition;
```

### 引用与作用域

```ts
/**
 * 作者侧 JSON Pointer。空串引用根值，'/' 引用空字符串属性；~0 / ~1 分别转义 ~ / /。
 * 不使用 './age' 等额外语法；路径能否在相应数据模型上成立由 Compiler 检查。
 * @pattern ^(?:/(?:[^~/]|~[01])*)*$
 */
export type JsonPointer = string;
/** 数据位置的声明；它不是读取结果，也不是数组成员的运行时身份。 */
export interface DataReference {
  source: 'data';
  /** 无 scope 时相对表单数据根；有 scope 时相对该词法绑定的数据位置。 */
  path: JsonPointer;
  /** 可见的词法名称，例如 insured。省略表示根数据，不隐式捕获当前数组项。 */
  scope?: string;
}
/** Host 提供的只读上下文引用，不是 Command 的可写目标，也不扩展 Data-only watch。 */
export interface ContextReference {
  source: 'context';
  /** 相对 Host Context 根的 JSON Pointer。 */
  path: JsonPointer;
}
/** 仅在处理相应物料事件或请求时有效；不能从全局表达式或普通 Reaction 隐式取得 Payload。 */
export interface EventReference {
  source: 'event';
  /** 相对本次 Payload 根；路径与值类型须能由对应 Event / Request 的 payloadSchema 证明。 */
  path: JsonPointer;
}
/** 字段对外校验快照的观察 / 读取投影；不暴露内部任务与请求代次。 */
export type ValidationObservation = 'issues' | 'status' | 'state';
/** 只读字段校验引用，当前用于 Reaction 条件 / 动作；field 按当前词法 Scope 绑定稳定成员，不以数组下标充当成员身份。 */
export interface ValidationReference {
  source: 'validation';
  field: DataReference;
  /** issues 读取聚合问题，status 读取对外状态，state 读取完整对外快照。 */
  observe: ValidationObservation;
}
/** 显式校验状态观察目标；与只读引用共享位置和投影，不是 Data Change。 */
export type ValidationWatch = ValidationReference;
/** Reaction 的显式触发来源；Context / Event 不在此集合内。 */
export type ReactionWatch = DataReference | ValidationWatch;
/** 读取来源的封闭集合。使用位置决定是否可读，写目标只接受 DataReference。 */
export type Reference = DataReference | ContextReference | EventReference | ValidationReference;
/** 在规定的结构入口建立局部词法绑定；不创建第二份数据，也不是全局 Scope 注册项。 */
export interface ScopeBinder {
  /** 绑定的数据位置，只能为静态 Data Reference，不能用表达式动态拼接位置。 */
  from: DataReference;
  /** 后续词法上下文使用的名称；可见性及禁止遮蔽规则由 Compiler 检查。 */
  as: string;
  /** one 绑定单个位置，each 按数组成员建立上下文；Prepared 保存规范化后的显式模式。 */
  mode?: 'one' | 'each';
}
/** 规则可用一个 Binder 或非空有序链；后项可使用前项绑定，View 的 ScopeNode 只用一个 Binder。 */
export type ScopeDeclaration = ScopeBinder | [ScopeBinder, ...ScopeBinder[]];
/** 按词法名称取得当前成员的稳定身份，供删除 / 移动使用；不能当作普通业务值读取。 */
export interface ScopeHandleReference {
  /** 指向可见的成员上下文，不是固定数组下标，也不是可持久化的 Runtime Scope ID。 */
  $scope: string;
}
```

### 表达式与值

```ts
/** 读取声明位置的当前值；读取本身不建立订阅。 */
export interface ReferenceExpression {
  ref: Reference;
}
/** 复用 FormDefinition.expressions 中的具名表达式；Compiler 检查引用与循环。 */
export interface NamedExpression {
  /** 定义内名称；被引用表达式不能隐式捕获调用者局部 Scope。 */
  use: string;
}
/** 同步纯计算调用，不允许 I/O、写 Data 或任意脚本。 */
export interface CallExpression {
  /** Canonical 使用确定的能力名，如 core.gte；Authoring 短名需先按白名单规范化。 */
  op: string;
  /** 有序参数；签名及内置短路语义由 Compiler / 执行器落实。 */
  args: Expression[];
}
/** AST 位置的原样 JSON 值；内部对象不再按 ref / use / op 等字段解析。 */
export interface LiteralExpression {
  literal: JsonValue;
}
/** 作者侧计算树。求值失败不等同于返回 false；可能读取集合由使用位置决定如何参与依赖。 */
export type Expression =
  JsonPrimitive | ReferenceExpression | NamedExpression | CallExpression | LiteralExpression;
/** 在递归 ValueSpec 中显式进入表达式语法；不能和其他对象字段混用。 */
export interface ExpressionValue {
  $expr: Expression;
  /** 生成的响应式包装不能作为原始定义或调用时 Payload 复用。 */
  watch?: never;
}
/** ValueSpec 位置的原样 JSON 包装；内部不递归解释，允许存放含保留键的真实业务数据。 */
export interface LiteralValue {
  $literal: JsonValue;
}
/**
 * 属性值仍递归为 ValueSpec 的普通对象。保留键只能出现在相应的严格包装分支，不能降级为普通键。
 * @propertyNames {"not":{"enum":["$expr","$literal"]}}
 */
export type ValueObject = {
  [key: string]: ValueSpec;
} & {
  $expr?: never;
  $literal?: never;
};
/** Props、Command 值及 Host Payload 的递归配置；只在这些规定位置解析，不扫描 Working Data。 */
export type ValueSpec = JsonPrimitive | ExpressionValue | LiteralValue | ValueSpec[] | ValueObject;
```

### 视图与交互

```ts
/** 在物料事件发生时执行数据命令，不因命令值读取变化而自动触发。 */
export interface CommandIntent {
  type: 'form.command';
  command: Command;
}
/** 对配置开放的两类事件响应；物料内部 Binding 写入不必重复映射成 on.change。 */
export type InteractionIntent = CommandIntent | HostEventIntent;
/** 一次物料请求到 Host 的映射，与无返回值的 on 通知分开。 */
export interface HostRequestIntent {
  type: 'host.request';
  /** Host 注册名称，不要求与物料请求名一致。 */
  request: string;
  /** 本次调用时求值，可读取 event Payload；省略时原样转发物料 Payload。 */
  payload?: ValueSpec;
}
/** 使用一个物料的作者侧视图节点；不携带组件实现或当前运行状态。 */
export interface MaterialNode {
  /** 逻辑物料 ID；版本与目标实现由确定 Catalog / 能力锁解析。 */
  material: string;
  /** 动态 / 静态 Props，最终值须满足物料 Props 契约。 */
  props?: Record<string, ValueSpec>;
  /** 物料声明的具名数据位置，可单字段或多字段；不声明读写权限。 */
  bindings?: Record<string, DataReference>;
  /** 物料接受的槽位名到子节点数组；默认槽位名为 default，没有通用数量限制。 */
  slots?: Record<string, ViewNode[]>;
  /** 物料语义事件名到响应；Payload 形状来自该物料的 EventContract。 */
  on?: Record<string, InteractionIntent>;
  /** 物料请求名到 Host 映射；声明请求漏映射由 Compiler 报错，无请求物料可省略。 */
  requests?: Record<string, HostRequestIntent>;
}
/** 显式建立视图词法上下文；each 模式重复实例化子视图，不另加 repeat。 */
export interface ScopeNode {
  scope: ScopeBinder;
  node: ViewNode;
}
/** 静态模板复用；Prepared 保留共享结构与参数绑定，不是 DOM 替换。 */
export interface TemplateUse {
  /** viewTemplates 中的名称，循环 / 缺失引用由 Compiler 诊断。 */
  $use: string;
  /** 模板形参到调用方可见 Data Reference 的映射，不隐式捕获其他 Scope。 */
  with?: Record<string, DataReference>;
}
/** Canonical 视图只包含物料、Scope 包装和静态模板使用三类节点。 */
export type ViewNode = MaterialNode | ScopeNode | TemplateUse;
/** 模板参数只引入可定位的数据位置，其类型复用业务 data.schema。 */
export interface TemplateDataParam {
  /** 相对根 data.schema 的声明引用，例如 #/$defs/Insured。 */
  schemaRef: string;
}
/** 供不同布局静态复用的节点结构，不建立独立数据域。 */
export interface ViewTemplate {
  params?: Record<string, TemplateDataParam>;
  node: ViewNode;
}
```

### 数据命令

```ts
/** 作者侧数字目的位置，复用与 Prepared 完全相同的下标语义和生成约束。 */
export type IndexPosition = ArrayIndexPosition;
/** 插入 / 移动到仍属于目标数组的指定稳定成员之前。 */
export interface BeforePosition {
  kind: 'before';
  item: ScopeHandleReference;
}
/** 插入 / 移动到仍属于目标数组的指定稳定成员之后。 */
export interface AfterPosition {
  kind: 'after';
  item: ScopeHandleReference;
}
/** 执行时解析目的位置；锚点失效、越界或非整数须失败，不静默修正。 */
export type ArrayPosition = IndexPosition | BeforePosition | AfterPosition;
/** 替换目标位置的值；写入结构可执行即可，业务 Schema 不作为写入门禁。 */
export interface SetCommand {
  op: 'set';
  /** 可写 Data 位置，不能是 Context / Event / 组件 Props。 */
  target: DataReference;
  /** 执行时按当前输入求值；不因值读取其他字段而自行建立订阅。 */
  value: ValueSpec;
}
/** 浅层更新对象字段，不递归深合并。 */
export interface PatchCommand {
  op: 'patch';
  target: DataReference;
  /** 待写字段字典，键为业务字段名，各值按 ValueSpec 求值。 */
  value: Record<string, ValueSpec>;
}
/** 删除目标属性，区别于把属性设置为 null；数组成员删除使用 array.remove。 */
export interface RemoveCommand {
  op: 'remove';
  target: DataReference;
}
/** 在指定数组位置插入一个求值后的成员；不以 maxItems 等业务约束阻止写入。 */
export interface ArrayInsertCommand {
  op: 'array.insert';
  /** 实际值必须能执行数组操作，否则报告结构失败。 */
  target: DataReference;
  position: ArrayPosition;
  value: ValueSpec;
}
/** 按稳定成员身份删除；数组重排后不能误删原下标的新成员。 */
export interface ArrayRemoveCommand {
  op: 'array.remove';
  target: DataReference;
  item: ScopeHandleReference;
}
/** 移动后保留成员身份；校验目的位置失败不能留下已经移除的半完成状态。 */
export interface ArrayMoveCommand {
  op: 'array.move';
  target: DataReference;
  /** 被移动的成员；与 position 中的目的锚点分别解释。 */
  item: ScopeHandleReference;
  position: ArrayPosition;
}
/** 顺序执行且默认非原子；后续失败不回滚先前成功修改，不是通用工作流。 */
export interface BatchCommand {
  op: 'batch';
  /** 保留命令顺序与次数，不能仅因相同目标合并两次 insert 等显式行为。 */
  commands: Command[];
}
/** 作者侧七类受控数据修改语言。网络 / 提交 / UI 动画由 Host 或物料负责。 */
export type Command =
  | SetCommand
  | PatchCommand
  | RemoveCommand
  | ArrayInsertCommand
  | ArrayRemoveCommand
  | ArrayMoveCommand
  | BatchCommand;
```

### 校验与消息

```ts
/** 字段的同步启动资格：相关 Schema / 适用 Internal 已完成且无错误，不证明异步或完整通过。 */
export interface FieldPrerequisite {
  kind: 'field';
  /** 当前唯一 Scope 实例下的字段位置；不聚合其他成员的同名字段。 */
  target: DataReference;
  phase: 'sync';
}
/** 指定同步 Constraint 的本轮通过结论；External 目标、环和自包含由 Compiler 拒绝。 */
export interface ConstraintPrerequisite {
  kind: 'constraint';
  /** 声明 ID，由 Compiler 解析到唯一可绑定的 Scope 规则实例模式。 */
  constraintId: string;
}
/** 多项前置须全部满足；首期不支持跨异步等待及集合 or / any。 */
export type ValidationPrerequisite = FieldPrerequisite | ConstraintPrerequisite;
/** 内部业务断言失败时产生的 Issue 声明，不在此存放当前校验结果。 */
export interface IssueDefinition {
  /** 错误归属位置；该目标本身不自动成为规则的读取依赖。 */
  target: DataReference;
  /** 稳定业务错误码，独立于展示语言和执行异常诊断。 */
  code: string;
  /** 专属文案覆盖；省略时由默认消息体系处理。 */
  message?: MessageSpec;
}
/** 同步业务断言；when / assert 的可推导读取由 Compiler 合并，不另填 watch。 */
export interface InternalConstraint {
  id: string;
  kind: 'internal';
  scope?: ScopeDeclaration;
  /** 适用条件；不再适用时该规则的旧 Issue 不应保留为当前结果。 */
  when?: Expression;
  /** 本轮同步前置；省略表示没有显式额外前置。 */
  requires?: ValidationPrerequisite[];
  /** 必须返回 boolean；求值异常不是业务 false，也不执行 Command。 */
  assert: Expression;
  issue: IssueDefinition;
}
/** Host 外部校验义务。Host 读取本次调用快照 / Scope，网络、重试与多步异步留在实现内部。 */
export interface ExternalConstraint {
  id: string;
  kind: 'external';
  /** 独立能力名，不按规则 id 猜实现；不同规则可以引用同一能力。 */
  validator: string;
  scope?: ScopeDeclaration;
  when?: Expression;
  requires?: ValidationPrerequisite[];
  /** Host 内部不透明的数据依赖；与 when 的可见读取合并失效，不等于每次变化立即请求。 */
  watch: DataReference[];
  /** 义务和结果的归属字段，不把它误认为唯一输入。 */
  target: DataReference;
}
/** 数据校验声明，不包含任务代次、Pending、结果或回调。 */
export type Constraint = InternalConstraint | ExternalConstraint;
/** 覆盖 Schema 某项检查的展示消息；动态数组成员复用同一声明，不按可变下标配置。 */
export interface SchemaMessageOverride {
  /** 相对根 data.schema 的声明引用，例如 #/properties/age。 */
  schemaRef: string;
  /** 对应校验关键字，例如 minimum；资源和关键字的关联由 Compiler 检查。 */
  keyword: string;
  message: MessageSpec;
}
```

### Host事件

```ts
/** 将业务意图交给 Host；不描述网络或等待 Host 返回值的编排。 */
export interface HostEventIntent {
  type: 'host.emit';
  /** Host 业务事件名称，区别于 MaterialNode.on 字典中的物料事件名称。 */
  event: string;
  /** 触发时按调用求值；仅物料事件上下文允许 Event Reference，Reaction 不提供 Event。 */
  payload?: ValueSpec;
}
```

### 物料契约

```ts
/** 某个具名 Binding 预期的数据形状；用于静态连接检查，不是 Runtime 写入权限或业务合法性门禁。 */
export interface BindingContract {
  schema: JsonSchema;
}
/** 物料对配置暴露的事件数据契约；不描述处理结果返回值或异步调用链。 */
export interface EventContract {
  /** 省略表示无配置可读 Payload 的通知；存在时供 Compiler 检查 Event Reference 路径及类型。 */
  payloadSchema?: JsonSchema;
}
/** 有返回值的物料交互契约；名称属于物料，与 Host 实现名称无关。 */
export interface RequestContract {
  /** 物料发起请求提供的 JSON 数据；没有输入时可声明 null。 */
  payloadSchema: JsonSchema;
  /** 物料消费的 JSON 业务结果，不包含桥接层的 success / error / discarded 包装。 */
  resultSchema: JsonSchema;
  /** 同一挂载实例、同一请求名的并发策略；默认 latest，parallel 各次独立交付。 */
  concurrency?: 'latest' | 'parallel';
}
/** 物料的可序列化声明。Compiler 只读契约，不加载 UI 实现来推断能力。 */
export interface MaterialManifest {
  /** 稳定逻辑物料名，与视图中的 material 对应。 */
  id: string;
  /** 物料语义 / 契约版本，实际平台实现另由制品身份锁定。 */
  version: string;
  /** 求值后的 Props 应满足的模型；不包含 Binding、Slots 或当前组件状态。 */
  propsSchema?: JsonSchema;
  /** 物料接受的 Binding 名及数据形状，不区分 read / write。 */
  bindings?: Record<string, BindingContract>;
  /**
   * 允许的槽位名称；默认槽位使用 default，只限制名称，不设置通用节点数量规则。
   * @uniqueItems true
   */
  slots?: string[];
  /** 配置 on 映射可以使用的语义事件，不登记组件内部全部回调或指令调用。 */
  events?: Record<string, EventContract>;
  /** 页面实际使用物料时，声明的请求必须全部映射；仅加载未使用物料不要求接入。 */
  requests?: Record<string, RequestContract>;
}
```

### 纯函数签名

```ts
/** 纯函数的单个值参数。签名是数据契约，不允许注册函数接收 AST / 求值器。 */
export interface FunctionParameter {
  /** 说明用参数名；调用仍采用有序 args，不引入命名实参语法。 */
  name: string;
  schema: JsonSchema;
  /** 固定参数的可选项只能位于尾部，顺序合法性由 Compiler 检查。 */
  optional?: boolean;
}
/** 同步、确定性且无 I/O / 写 Data 副作用的计算契约；实际纯净性仍须实现审查和行为测试。 */
export interface PureFunctionManifest {
  /** Canonical 能力名；core.* 保留给内置集合，禁止业务覆盖或静默查找回退。 */
  id: string;
  version: string;
  /** 固定位置参数，按声明顺序匹配 args。 */
  parameters: FunctionParameter[];
  /** 可选的变长尾参数；省略表示不接受超出固定签名的额外实参。 */
  restParameter?: FunctionParameter;
  /** 结果的值类型；不把求值异常或 Missing 当成一个合法返回值。 */
  returns: JsonSchema;
}
```

### Host契约

```ts
/** Host Validator 调用快照 / Scope 接入版本，不包含命名参数映射、网络配置或实现函数。 */
export interface HostValidatorContract {
  contractVersion: string;
}
/** Host 接受的业务事件；Payload 契约复用事件数据结构，不表达等待返回。 */
export interface HostEventContract extends EventContract {
  /** true 仅用于明确可跳过的事件，如遥测；缺省不授权静默忽略。 */
  optional?: boolean;
}
/** Host 请求的静态输入输出签名；不包含网络配置、注册函数或取消句柄。 */
export interface HostRequestContract {
  payloadSchema: JsonSchema;
  resultSchema: JsonSchema;
}
/** 可选的宿主静态声明，用于增强编译检查；没有它不等于运行时实现必然缺失。 */
export interface HostContract {
  /** 按独立校验能力名登记契约，不按某个 Constraint id 绑定。 */
  validators?: Record<string, HostValidatorContract>;
  /** 按 host.emit 的业务事件名登记，与物料发出的事件名区分。 */
  events?: Record<string, HostEventContract>;
  /** 页面 host.request 所引用的应用能力；可由不同 Host 自行命名。 */
  requests?: Record<string, HostRequestContract>;
}
```

### 能力目录

```ts
/** 已选择的物料契约与目标实现；Compiler 不在该条目中运行组件代码。 */
export interface MaterialCatalogEntry {
  manifest: MaterialManifest;
  artifact: ArtifactIdentity;
}
/** 已选择的纯函数契约与目标实现；编译只检查签名，不执行该函数。 */
export interface PureFunctionCatalogEntry {
  manifest: PureFunctionManifest;
  artifact: ArtifactIdentity;
}
/** Compiler 接收的确定快照，不是 Registry 搜索 API，也不表示运行时可变的 latest 集合。 */
export interface CapabilityCatalogSnapshot {
  /** 已解析快照身份，进入 Prepared 的追溯 / 缓存依据。 */
  id: string;
  /** 键与对应 Manifest id 应一致；唯一解析和制品关联由编译 / 构建边界检查。 */
  materials: Record<string, MaterialCatalogEntry>;
  pureFunctions: Record<string, PureFunctionCatalogEntry>;
  /** 省略时 Compiler 仍提取明确需求，由运行时核对，不伪造静态兼容保证。 */
  host?: HostContract;
}
```
