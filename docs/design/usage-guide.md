---
id: GUIDE-FE-001
title: 使用与开发指南
type: guide
status: active
layer: 系统
modules:
- M01
tags: []
related:
  decisions:
  - ADR-FE-018
  - ADR-FE-019
sources:
- SRC-L3BASELINE
- SRC-L1
- SRC-V05
- SRC-HOST
- SRC-V07
navigation:
  group: 10 · 使用与例证
  order: 200
last_reviewed: '2026-10-22'
---

# 使用与开发指南

这套框架把表单的数据、规则和呈现分开描述，让不同界面共享同一份业务语义。本指南面向表单配置者、宿主接入者和后续参与开发的同事：先理解一个字段如何工作，再按需求学习计算、联动、重复项、外部业务和排障。设计思想、完整分层与取舍见 [设计者指南](architecture.md)，具体协议只在对应主题维护。

当前已实现 TS 协议 / Schema、Compiler、Runtime、React Renderer、首批物料 / 业务函数及完整可控表单，尚未发布生产 SDK。实际接入以 [Compiler](../../packages/compiler/README.md)、[Runtime](../../packages/runtime/README.md)和 [Renderer](../../packages/renderer-react/README.md)为准；本指南的概念草图不作为可直接复制的 API。真实 Host、跨端与生产性能仍待交付或验收。阅读和运行现有协议验证的方法见 [协议样例的复现说明](../validation/README.md#reproduce)。

## 先理解框架替你完成什么 {#usage-purpose}

假设要做保险投保页：录入多位被保人，未成年人需监护人，年龄影响保费，还要访问外部核保服务。框架让这些规则脱离具体输入框，使 PC 页面、移动页面和摘要视图能共享数据与规则。

| 你要做的事 | 由谁表达 / 执行 | 最先学习 |
| --- | --- | --- |
| 姓名录入、布局与字段连接 | Schema + View + Material Binding | 最小表单 |
| 显示未成年提示、计算摘要 | Expression 纯计算 | 计算与校验 |
| 要求监护人姓名 | Constraint，Runtime 管校验结果 | 计算与校验 |
| 把保费保存为业务字段 | Reaction 发出 Command | 数据更新与联动 |
| 同样规则作用于每位被保人 | Scope + 稳定实例身份 | 重复数据 |
| 查询城市、核保、上传、支付 | Host / 物料服务；需要时显式写回数据 | 宿主接入 |

浏览表单的最终用户只面对业务界面；这里的“使用者”主要指配置和集成框架的人。框架覆盖表单数据交互，通用页面搭建与完整业务工作流不属于核心目标。

沿着一次输入理解四层即可：L1 描述表单；L2 检查并准备定义；L3 保存数据、执行规则、管理校验；L4 连接平台组件、输入和呈现。Material 是事先注册的 UI 能力，Host 是使用引擎的业务应用。

## 第一步：把一个输入框连到数据 {#usage-basic}

先打开 [完整极简定义](l1/07-examples.md#simple)，只追踪三处：

```text
data.schema.properties.name     姓名的数据形状
views.default.material         使用 text-input 物料
views.default.bindings.value   将输入端口连接 data:/name
```

`views.default` 直接是一个 ViewNode。这里的 default 是视图名称，物料的 `slots.default` 是组合子节点的位置，二者含义不同。`bindings` 是具名端口映射：输入框的 value 端口连接姓名位置；同一姓名还可以被摘要视图读取。

你需要给出 Definition、初始数据及可用物料，由后续集成层把它们接起来。初始值存在时按初始化规则使用，缺失位置再按默认值规则补齐。输入改变后，经 Binding 发出受控 Command 更新 Working Data；组件不会拥有另一份权威业务数据。

你编辑的是原始 FormDefinition；L2 检查并编译为 PreparedForm，L3 用这个兼容产物创建实例。即使客户端才编译，也先经过同一 L2，不直接把原始配置交给另一条 Runtime 解释路径；产物不兼容时明确报错。两份结构的完整对照见 [原始与编译后协议](dependency-reactivity.md#dependency-compiled-protocol)。

此时无需引入 Scope、Template 或 Reaction。学完应能指出“值存在哪里、哪个端口读写它、谁处理输入法与焦点”：分别是 L3 Working Data、Binding、L4 / Material。字段形状见 [Data](l1/02-data-reference-scope.md#data)，寻址见 [Reference](l1/02-data-reference-scope.md#reference)，端口见 [Binding](l1/05-view-material-host.md#binding)。

## 第二步：分别表达计算、合法性和修改 {#usage-rules}

增加“未满 18 岁需监护人”时，先拆成三个明确需求：

| 需求 | 表达方法 | 观察到的行为 |
| --- | --- | --- |
| 判断是否未成年 | Expression：age < 18 | 纯计算，不写业务数据 |
| 显示监护人区域 | View 动态 Props / 容器契约读取该表达式 | L4 决定是否挂载区域 |
| 未成年时姓名必须非空 | Internal Constraint 的 when + assert | 姓名为空产生 Issue，即使区域未挂载也有效 |

Expression 可以调用内置或注册的 Pure Function，二者都同步、确定、无 I/O。复杂同步校验可以复用领域纯函数；请求核保服务则交给 Host。

业务值允许暂时不合法：用户清空必填姓名后，Working Data 保留这次编辑，Validation 报告错误。隐藏一个区域不会自动删除数据、取消约束或清除错误；若业务要求清空某字段，需明确 Command / Reaction。

可以把校验理解为“结构约束 + 业务判断 → 字段错误”：完整 JSON Schema 检查必填、类型和范围；Constraint 表达跨字段判断与外部义务。普通有效修改先完成必要联动，再执行根 Schema 和本轮命中的 Constraint；批量命中同一实例会去重，不重新扫描全部业务规则找依赖。

例如 age 同时超过 Schema 上限、又不满足某条业务规则，字段可以展示两个来源的错误。Schema 重跑只撤销自己的旧错误；异步核验过期也只撤销该外部来源。字段组件读取聚合结果，不需要逐一监听每个校验器。前置 A 通过才执行 B 属于较高级的校验链能力，requires 类型、编译补全及运行时递归补齐已有实现与本地用例，普通表单可先使用独立 Constraint。详见 [校验故事与字段结果](l3-validation.md#validation-story)。

学完应能判断“只需要显示计算值，还是必须保存一个业务字段”。前者直接读表达式，后者才引入修改命令。完整语法与使用位置见 [Expression](l1/03-expression-validation.md#expression)、[Constraint](l1/03-expression-validation.md#constraint) 和 [跨字段例子](dependency-reactivity.md#dependency-usage)。

## 第三步：理解即时写入与稍后完成的联动 {#usage-updates}

需要把计算保费存入 `/premium` 时，Reaction 显式 watch 年龄与产品，执行时用纯函数计算并发出 set。`watch` 决定哪些变化使它失效；`when` 判断是否执行；`then` 的 Command 按序执行。仅被 when / then 读取的其他字段不会自动成为 watch。

如果保费计算读取产品费率，但你只 watch 年龄，编辑器可用 L2 提示补充费率。你可以接受，也可以确认只想在年龄变化时重算；接受后修改原始定义并重编，Runtime 始终按确认后的计划执行。产品变化清空附加选项，即使清空命令不读取产品，也需要保留这个显式 watch。详见 [编译建议与作者确认](dependency-reactivity.md#dependency-watch-review)。

```text
1. 修改 age：Command 立即更新当前数据。
2. Flush 启动前再修改 product：同一保费 Reaction 仍只待执行一份。
3. Flush 启动：Reaction 读取最新 age 和 product，计算并写入 premium。
4. 若其他 Reaction 观察 premium，继续在本轮执行，直到收敛或保护停止。
```

因此“立即读到刚输入的年龄”和“保费联动已经完成”是两种状态。Operation 表示一次外部修改来源；Flush 是集中完成待执行联动的一轮，多个 Operation 可以合并进入同轮。Flush 完成也不证明远程校验或 UI 绘制已完成。当前 SDK 以 flush() 等待同步收敛，以 validate() 获取完整校验结果，不能假设 dispatch 返回即满足全部提交条件。

`batch` 是有序修改组合，各条有效 Command 实时生效，不默认把整组作为可回滚事务。旧 Snapshot 不随新数据更新而改变。可隔离的单条 Command 错误记录后，后续独立 Command 继续尝试；其他 Reaction 只按实际数据变化和自己的 watch 响应，不检查“上游是否成功”。业务校验失败、可隔离执行错误与整个 Flush 超限分别处理，当前结果与诊断类型见 Runtime SDK；稳定发布兼容承诺尚未冻结。

还要区分初始缺失与用户清空。没有年龄时可以由 when 跳过，或让纯函数按空值契约返回 null；若用户清空年龄后保费也应清空，就明确写入 premium=null。只跳过不会自动清掉旧值，0 / false 也不能按统一 falsy 当成未初始化。框架不增加通用 Reaction Ready 状态机，见 [缺失与清空](l3-reactive-engine.md#l3-missing-values)。

“从历史联系人导入整位被保人”仍是普通 set，不重新初始化整张表单。引擎定位已观察的子路径，再比较前后值：推荐方案中年龄 25→25 不使年龄规则失效，姓名变了则使姓名观察失效；整个对象换了引用，观察该对象的消费者可保守刷新。用户、Host 和 Reaction 写回都遵守同一检测，也不因保费被覆盖就自动推断它归某条规则所有。详见 [导入与观察粒度](l3-data-scope.md#l3-observed-equality)。

Reaction 适合让状态趋于正确值，待执行时可合并，执行后再次失效也可重新入队。需要“每点一次新增一条”，直接发出对应 Command / Host 事件；两条显式 array.insert 保留两次操作。不要依赖 Reaction 触发次数记账，无条件新增也可能导致无法收敛。

学完应能解释为何连续两次输入可能只执行一次保费规则，却不会吞掉两条显式新增命令。完整声明见 [Command / Reaction](l1/04-command-reaction.md#commands)，运行机制与四种轨迹见 [L3 Flush](l3-reactive-engine.md#l3-flush) 和 [执行轨迹](l3-reactive-engine.md#l3-traces)。

## 第四步：把字段和规则用到重复项 {#usage-arrays}

新增多位被保人时，ScopeBinder 从 `/insureds` 建立 `each` 绑定，让同一字段、计算与约束分别作用于当前项。L2 保存这种静态关系，L3 绑定真实成员，L4 仅挂载实际需要展示的行。

```text
开始：index0 → 被保人 A；index1 → 被保人 B
把 B 移到最前：index0 → B；index1 → A
B 的稳定 Scope 身份仍是 B。
B 的校验、订阅与 Trace 不能变成 A 的状态。
```

操作某一项时使用稳定实例身份，而不是长期保存当前下标。删除后释放该项规则与状态，晚到的外部报告不能再应用；整体替换按下文已确认的身份规则执行。UI 虚拟列表只释放未挂载行的 View 订阅，业务 Reaction / Constraint 继续有效。

若 B 的年龄没有变化，跟随 B 的相对年龄观察不应只因移动而重算；固定位置 `/insureds/0/age` 则观察“当前位置 0”，前后值不同会失效。需要成员序号或排序的业务，应明确观察位置 / 集合，不能只观察年龄。框架在父 Scope 下存相对位置，移动被保人不要求为全部受益人重写路径，View 行也无需手工改绑物理下标。

替换某一行对象保留该行身份，子字段逐项比较；整数组替换即重建成员 Scope 已确认，即使数据相同也不复用身份，不按业务 ID / 姓名 / 内容匹配。新 Scope 按显式首次激活策略运行，默认不执行已确认，当前字段为 runOnActivate，已由协议 / Compiler / Runtime 消费。连续“改 A 年龄→移动 A→再次改 A 年龄”会逐条检测，但 A 的同一保费实例在 Flush 前只待执行一份，执行读最终年龄，见 [逐 Command 轨迹](l3-data-scope.md#l3-command-sequence)。

学完应能说明“当前项位置”和“当前项是谁”的区别，以及为什么移动数组不能只做普通 splice。详见 [ScopeBinder](l1/02-data-reference-scope.md#scope)、[ScopeHandle](l1/02-data-reference-scope.md#scope-handle) 与 [跨层实例生命周期](dependency-reactivity.md#dependency-scope)。

## 第五步：组合视图与接入业务应用 {#usage-integration}

需要重复字段组时用静态 Template 和 Typed DataReference 参数；需要容器组合时用 Slots；需要 PC / Mobile 等场景时用具名 Profile。同一 FormRuntime 的 Profile 共用业务数据与规则，切换只替换 View 订阅与局部状态。UI 的焦点、展开和输入法状态由 L4 / Material 管理。

Host 的三条接入路径分别服务不同任务：

| 路径 | 典型业务 | 归属 |
| --- | --- | --- |
| External Constraint | 证件核验、资格检查 | L1 声明义务与 watch；Host 执行，Runtime 检查报告有效性 |
| host.emit | 保存意图、点击报价或触发业务流程 | Material 语义事件交给 Host |
| 配置物料请求 | 城市搜索、详情、复杂候选选择 | requests 映射到 Host 输入输出函数；公共 Adapter 交付结果，选定值经 Binding / Command 写入；文件传输归平台实现 |

例如城市查询 A 尚未返回，用户已经改选目的地并发起 B。A 晚到不能覆盖 B；外部校验还需核对 Scope、请求和输入新鲜度。External watch 变化使旧结果失效并登记任务；Flush 结束后与内部校验统一执行，先 Schema，再按同步前置发起就绪任务，独立规则不等待网络。

Host 准备初始数据后创建 Runtime / Scope / 规则，新 Reaction 实例只按 runOnActivate 首次激活。后续已有实例的常规执行必须发生有效 Watch 变化；导入、Reset、读取快照或重挂 View 的意图本身都不能绕过变化检测。真正的新实例按其生命周期处理，不能把普通恢复伪装成重新初始化来修复计算结果。

Runtime 提供稳定 snapshot，Host 自行决定是否保存为业务 Baseline、何时标 Clean、哪些字段或修改计入 Dirty。需要初始联动完成后的快照时，Host 可在观察到完成后读取；snapshot 本身不 Flush、不建基准、不判断编辑状态。网络加载、迟到响应保护、保存和 Reset 意图都由 Host 管理。

用户点击 Reset 时，Host 按自己的规则生成普通恢复 Command。Watch 未变，已有 Reaction 就不新增入队；即使期望当前费率下的保费不同，也不能让 Runtime 绕过依赖检测重算。业务应通过正确的 Watch 配置或实际数据修改表达触发条件，Context 对表单仍只读；Host 可显式替换快照，统一失效呈现 / 校验，但不直接重跑 Reaction。详见 [Host 业务基准与恢复](l3-data-scope.md#l3-initialization-baseline)。

例如 age25 / premium150 被导入 age25 / premium80，现存规则只 watch age 且没有先前 pending，就保持 premium80。引擎按协议执行，不承诺自动修正业务结果。已有 pending 若来自先前有效变化仍会按队列执行；这与同值导入不会新增任务分别解释。Dirty 也不会由 Runtime 判断：普通资料、审批、投保和实时数据页面可以各自定义何谓“需要保存的修改”。

Host 真正提交前需要显式完整校验，覆盖全部适用规则，由 Host 转换业务请求、检查输出、权限和业务条件；不要求 Reaction 执行成功，熔断后仍可独立完整校验，通过后提交对应快照。普通增量只检查命中部分；字段没有错误也不证明所有必要规则已执行。完整结果须区分通过、业务失败、不完备与输入过期，具体 SDK 尚未冻结；数据或相关 Context 改变后，旧完整结论不能证明新输入通过。保存快照、Flush 结束和校验通过各自表达不同信息，详见 [完整校验与提交](l3-validation.md#validation-completeness)。

学完应能把“网络请求、规则义务、数据回写、真实提交”分别交给正确的一方。完整契约见 [View / Template](l1/05-view-material-host.md#view)、[Host 三条路径](l1/05-view-material-host.md#host)、[生命周期](l1/06-lifecycle-profiles.md#lifecycle) 和 [Readiness](l1/03-expression-validation.md#validation)。

## 第六步：定位规则和接入问题 {#usage-diagnostics}

| 观察到的现象 | 先核对什么 | 深入位置 |
| --- | --- | --- |
| 修改某字段没有重算 | 它是否在显式 Reaction.watch；是否有有效变化；Scope 是否仍有效 | [触发位置](dependency-reactivity.md#dependency-usage) |
| 字段隐藏后仍有错误 | Constraint 仍是业务规则；可见性不会自动取消合法性 | [约束](l1/03-expression-validation.md#constraint) |
| 输入已更新，保费暂未更新 | 即时 Data 与 pending / Flush 完成分别观察 | [Flush](l3-reactive-engine.md#l3-flush) |
| 规则持续互相覆盖 | 有效写入链、实例执行次数、预算停止原因 | [保护](l3-reactive-engine.md#l3-protection) |
| 有命令报错但其他规则仍运行 | 可隔离错误不阻断独立行为；Trace 区分错误与成功 Change | [错误隔离](l3-reactive-engine.md#l3-errors) |
| 字段没有错误但无法提交 | 是否有未执行、过期或异常的必要规则；是否请求了完整校验 | [完整性](l3-validation.md#validation-completeness) |
| 后置校验被跳过 | 本轮前置是否存在且通过；结合 blocked 状态与 coverage 检查，本地前置用例已有覆盖 | [本轮校验链](l3-validation.md#validation-round) |
| 整轮预算停止后队列空 | 本轮是中止；剩余 Reaction 已清空且不自重试，后续新有效触发正常建轮 | [整体熔断](l3-reactive-engine.md#l3-errors) |
| 只改保费却未按年龄重算 | 现存规则只 watch age，age 同值就不新增执行；结果不是 Runtime 主动修复的职责 | [已确认执行边界](l3-reactive-engine.md#l3-runtime-host-boundary) |
| Host 想知道规则是否执行 | 使用执行事件观察 / Trace；数据订阅只表达所观察数据是否失效 | [两类订阅](l3-data-scope.md#l3-array-lifecycle) |
| 远程结果覆盖了新输入 | Host 适用性检查、报告输入与 Scope 新鲜度 | [Host](l1/05-view-material-host.md#host) |

异常 Trace 用有序执行、实际 Change 和 triggeredBy 说明“谁因何执行、改了哪里”。同一规则多次执行有独立 ID。正常生产 Flush 不保留完整历史，异常先提取受限报告；Devtools 可独立保存记录，关闭它不能改变业务结果。Trace 截断时只能解释保留下来的证据，不能据此承诺历史值恢复或确定性重放。

发生安全预算停止时中止整个 Flush，保留已写数据并报告；不要自动无限重启同一批待执行任务。已替代局部 Health 与失败下游禁用方案，Trace 只解释实际过程。当前实现清空本轮剩余 Reaction Pending，不自动续跑；后续新有效变化建立新轮。独立完整校验仍可进行，Host 只交付当前 valid 证明对应快照；真实提交服务待接入。记录内容与复现能力见 [Trace](l3-observability.md#l3-trace) 和 [三档复现](l3-observability.md#l3-devtools)。

## 开发物料与纯函数 {#usage-asset-development}

这两个例子来自现有资产。`date-range` 把两端日期交给 Runtime，`text.isNonBlank` 在投保字段校验中区分空白输入与有效文本。用新的练习 ID 查看或生成模板，用真实资产核对实现、装配与验收。以下命令从仓库根目录运行，开发环境按[日常命令](engineering.md#engineering-implementation)准备。

### 从 CLI 到模板

```bash
pnpm asset:new material --id date-range-example --dry-run
pnpm asset:new function --id text.hasVisibleText --dry-run
```

输出列出计划生成和修改的文件。要在练习分支生成骨架，确认 ID 未使用后去掉 `--dry-run`。模板同时生成 `manifest.ts`、实现、README、镜像测试，以及集中汇总和公开导出的更新。生成的实现与待补测试需要按真实行为完成。现有资产可直接阅读和运行其用例。模板、生成约束及失败处理见[资产 CLI 手册](../../tools/engineering/assets/README.md)。

### 物料例子 · date-range {#usage-material-example}

1. **声明。** [Manifest](../../packages/materials-react/src/date-range/manifest.ts) 闭合 Props Schema，声明必填 `label`、可选起始范围和两个独立的可空字符串端口 `start`、`end`。放到表单时，两个端口分别指向日期字段；同一布局还可以包含其他物料。
2. **实现。** [日期范围组件](../../packages/materials-react/src/date-range/implementation.tsx) 在弹窗内保留本地编辑值，确认后经共享 Adapter 分别交付开始和结束日期。取消时保留 Runtime 原值；第一端成功、第二端失败时显示部分成功并读回实际值。起止顺序等业务规则配置为 Constraint。
3. **装配。** Compiler 读取 `@form-engine/materials-react/manifests` 的静态契约；运行侧通过 `createDateRange(artifact)` 加载确定制品下的实现。下面的视图节点使用两端绑定，Schema 需提供对应字段。
4. **验证。** 跑物料包测试，再在 Playground 打开 `/demos/interactions` 的日期交互，分别确认提交、取消和部分写入。真实业务 Host 的接入另沿该物料及宿主的集成契约验证。

```ts
const dateRangeView = {
  material: 'date-range',
  props: { label: '出行日期' },
  bindings: {
    start: { source: 'data', path: '/travel/startDate' },
    end: { source: 'data', path: '/travel/endDate' },
  },
} as const;
```

```bash
pnpm --filter @form-engine/materials-react test date-range
pnpm --filter @form-engine/playground dev
```

参见[物料说明](../../packages/materials-react/src/date-range/README.md)、[行为测试](../../packages/materials-react/tests/date-range/implementation.test.tsx)和[交互演示源码](../../apps/playground/src/demos/interactions/definition.ts)。

### 纯函数例子 · text.isNonBlank {#usage-function-example}

1. **声明。** [Manifest](../../packages/pure-functions/src/text-is-non-blank/manifest.ts) 接受一个 JSON 值并返回布尔值。需要兼顾字段不存在的表达式可先通过 `core.exists` 判断。
2. **实现。** [函数实现](../../packages/pure-functions/src/text-is-non-blank/implementation.ts) 要求一个参数。对字符串按 ECMAScript `trim` 规则判定，空白和非字符串返回 `false`。函数保留输入值，Runtime 快照中的姓名仍可包含原来的空格。
3. **装配。** 将静态 Manifest 和对应制品身份放进编译 Catalog，用 `createTextIsNonBlank(artifact)` 得到运行实现，按 `text.isNonBlank` 注册到 Runtime。编译侧和运行侧使用相同的资产与制品身份。下面是约束中的 `assert` 表达式，完整定义和字段 Issue 归属见集成用例。
4. **验证。** 包测试覆盖正常字符串、空白、非字符串和参数数量。跨包用例用空白姓名编译并运行校验，写入 `" 张三 "` 后再次完整校验，断言结果变为有效且快照保留原文。

```json
{
  "op": "text.isNonBlank",
  "args": [{ "ref": { "source": "data", "path": "/name" } }]
}
```

```bash
pnpm --filter @form-engine/pure-functions test text-is-non-blank
pnpm exec vitest run tests/integration/business-functions.test.ts
```

参见[函数说明](../../packages/pure-functions/src/text-is-non-blank/README.md)、[边界测试](../../packages/pure-functions/tests/text-is-non-blank/implementation.test.ts)和[编译到校验的集成用例](../../tests/integration/business-functions.test.ts)。

### 目录资料、变更声明与版本计划 {#usage-asset-delivery}

补齐资产的用法、参数和例子后，生成 Studio 使用的目录资料并检查同步。对于准备交付的资产行为变更，用 `asset:change --id` 记录兼容影响。示例命令中的环境变量由调用者指定，`ASSET_BASE_REF` 表示所选检查基线，`RELEASE_BASE_REF` 表示上次交付对应的提交或标签。

```bash
node tools/engineering/catalog-docs.mjs
node tools/engineering/catalog-docs.mjs --check
```

例如对确认为兼容修复的物料改动，单独记录一条声明：

```bash
pnpm asset:change --id date-range --bump patch --summary '修复日历焦点回到触发字段'
```

该命令会写入待发布声明。实际升级级别按改动对公开行为的影响确定；新资产的初始 Manifest 版本按现有发布规则处理。随后检查资产并生成版本计划。

```bash
pnpm assets:check --base "${ASSET_BASE_REF:?指定检查基线}"
pnpm release:plan --base "${RELEASE_BASE_REF:?指定上次交付基线}"
```

版本计划应能追溯到具体资产、包与依赖影响。资产版本描述能力兼容性，包版本描述分发单元，Manifest 和实际制品另有摘要。计划用于审阅；版本应用及制品发布沿[现有交付流程](engineering.md#asset-tooling)执行。需要验证发布包确实能被独立项目消费时，运行 `pnpm packages:check`。

## 参与开发：从一个业务链路进入对应契约 {#usage-contributing}

先用“改年龄 → 保费联动 → 监护人校验 → 视图更新 → 外部核验 → 提交”解释职责，再进入负责的层。共享词汇在设计者指南中查阅，正式声明与状态以专题为准。

| 参与方向 | 要交付与核对的内容 | 设计依据 |
| --- | --- | --- |
| 表单作者 / 设计器 | 合法 Canonical、诊断定位、复杂能力按需引入 | [L1 协议](l1/README.md)、[完整样例](l1/07-examples.md#sample) |
| 编译与平台 | 契约快照、静态计划、能力锁、不可变发布 | [L2 编译与发布](l2-preparation.md#l2-delivery) |
| Runtime | 兼容 Prepared 输入、稳定 snapshot、逐命令比较、新实例激活、相对身份索引与整体熔断 | [L3 验收](l3-reactive-engine.md#l3-acceptance)、[Host 边界验收 B01–B08](l3-reactive-engine.md#l3-runtime-host-boundary) |
| 校验与 Adapter | 完整 Schema、Pending / 前置、异步有效性、来源替换 / 字段聚合与跨端一致性 | [校验设计与 V01–V16](l3-validation.md#validation-acceptance) |
| Renderer / Material | 端口、统一求值、快照一致性、挂载与释放 | [Renderer](l4-renderer.md#renderer)、[订阅生命周期](dependency-reactivity.md#dependency-view) |
| Host / 集成测试 | 外部新鲜度、生命周期、提交前提和真实业务恢复 | [Host 集成](extension-integration.md#capabilities)、[跨层验收](dependency-reactivity.md#dependency-acceptance) |

阅读样例的机器报告时，先看验证范围：当前候选结构验证和有界探针不是生产编译器、Flush 或跨端适配器的实现证明。若要评审或改变架构，转到 [设计者指南](architecture.md) 的完整模型、图示、决策和交付路线；无需先把全部内部算法学完才能使用一个普通字段。
