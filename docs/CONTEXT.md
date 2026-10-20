---
id: GLOSSARY-FE-001
title: 术语与语义边界
type: glossary
status: active
layer: 跨层
modules: []
tags: []
related:
  decisions: []
sources: []
navigation:
  group: 09 · 决策与追溯
  order: 150
last_reviewed: '2026-10-19'
---

# 术语与语义边界

复杂动态表单与数据录入引擎的领域词汇。协议与决策正文见 [L1 定义协议](design/l1/README.md)。

## Language

**Working Data（工作数据）**：单个 FormRuntime 当前唯一权威的业务数据，允许处于尚未满足业务约束的编辑状态。
_Avoid_：另设最后合法值作为当前真相，或把 UI 临时输入、校验结果与工作数据混为一体。

**Normalized Output（规范化输出）**：Host 根据已校验 Working Data 构造的业务提交数据；转换与所需输出检查归 Host，不是 Runtime 的第二份核心状态，也不属于引擎完整校验范围。
_Avoid_：将当前 Working Data 或没有 Issue 的快照自动等同于可提交输出。

**ScopeBinder（词法作用域绑定）**：原始定义中将可定位数据位置引入局部别名的结构声明，one / each 表示其绑定方式。
_Avoid_：运行时实例登记、业务主键，或任意表达式可创建的通用变量。

**FormDefinition（原始定义）**：由业务作者表达并审查的数据、规则与视图定义，是 L2 编译的输入；Canonical 与 Authoring 是其规范形式和可选简写。
_Avoid_：将原始定义当成 Runtime 的另一种直接执行入口，或把 Authoring / Canonical 算成两份独立业务协议。

**PreparedForm（编译后协议）**：L2 生成、供 L3 / L4 消费的确定执行产物，与 FormDefinition 具有不同的职责和版本契约。
_Avoid_：原始 JSON 的另存副本、实例状态容器，或运行时自动补全 watch 的配置。

**Prepared Source Map（编译来源映射）**：关联准备后的规则与原始定义位置、身份和版本的诊断信息，用于回查业务配置；具体结构是推荐方向，尚未冻结。
_Avoid_：调度控制关系、Reaction 父子树，或可确定性重放的证明。

**Read Dependency（读取依赖）**：某个表达式或取值过程可能使用的输入引用，不表示这些输入的变化必然触发业务行为。
_Avoid_：将所有读取自动视为 Reaction 的触发条件。

**Watch Dependency（触发依赖）**：某个行为需要响应的状态变化范围，由使用位置的语义决定，显式 `watch` 是其中一种声明方式。
_Avoid_：将 watch 解释为执行时机或回调调度策略。

**Dependency Plan（依赖计划）**：描述行为、触发依赖、作用域模式和激活归属的静态观察计划；Observation Plan 是同一概念的说明性别称。
_Avoid_：将计划当作已经激活的订阅，或另设一套平行的 Observation Plan 模型。

**Dependency Index（运行时依赖索引）**：根据 Prepared 依赖计划与活跃订阅定位可能受某次修改影响的观察者的查找结构，命中后仍需比较观察值与处理实例生命周期。
_Avoid_：把索引命中当成必然触发，或把具体 Trie 存储结构当成已经冻结的 Prepared ABI。

**Subscription（活跃订阅）**：某个消费者在 FormRuntime 中已建立的观察关系，具有自身的激活与释放生命周期。
_Avoid_：把全部 Prepared View 计划等同于已挂载的视图订阅。

**Scope Pattern（作用域模式）**：描述词法绑定与逐项关系的静态模式，与某个真实数组项的实例身份不同。
_Avoid_：用当前数组下标或实例 ID 表达静态模式。

**Scope Registry / Scope Index（实例身份与位置登记）**：记录稳定 ScopeId 及其父 Scope、相对集合位置与本层位置，完整绝对路径按需解析；辅助位置索引不成为第二份事实来源。
_Avoid_：为每个后代永久存储并随父级移动重写完整绝对路径，或让 L4 维护物理下标重绑定。

**Scope-relative Watch（实例相对观察）**：沿同一 ScopeId 读取相对数据位置的观察关系；与固定绝对路径所表达的位置观察分别解释。
_Avoid_：把一个人的位置移动当作其年龄等内部字段发生变化，或用年龄观察隐含成员序号变化。

**ChangeContext（变更比较上下文）**：仅供当前 Command 检测依赖变化的前后数据 / Scope 读取视图及局部修改影响。
_Avoid_：与 Flush Context 混用、作为 Reaction 历史输入，或跨 Command / Operation 传播 ScopeChange。

**Data Snapshot（稳定数据快照）**：Runtime 对某一时刻 Working Data 的稳定只读表示，后续更新不改变已取得的快照。
_Avoid_：读取时隐式 Flush、自动保存业务 Baseline、标记 Clean 或逐步持久化全部历史 Root。

**Business Baseline（业务基准）**：Host 按业务目的选择并保存的数据快照，供自身编辑、恢复或保存策略使用，不是 Runtime 自动拥有的状态。
_Avoid_：把初始 Reaction 完成强制解释为 Runtime 建立基准，或与 Command 临时旧值视图混用。

**Dirty（业务编辑状态）**：Host 对“是否修改了需要保存的业务数据”的判断，字段范围与修改来源取舍由业务应用决定。
_Avoid_：作为 Runtime 核心状态，或要求引擎划分用户字段 / Reaction 字段、基础字段 / 派生字段。

**Reset（业务恢复意图）**：Host 按自身规则生成数据恢复 Command 的业务操作，运行时继续按普通数据变化契约执行。
_Avoid_：Reactive Engine 特殊模式、绕过 Watch 重算已有规则，或再次应用 runOnActivate。

**Reactive Engine（统一观察机制）**：Runtime 内按状态来源、引用与 Scope 实例匹配活跃订阅的协作机制，供联动、校验和视图观察共用。
_Avoid_：将它扩张为与 Data、Reaction、Validation 并列的新业务领域或通用工作流引擎。

**Operation（外部操作）**：一次由 View / Host 等外部来源发起的数据修改调用，表达修改从哪里来。
_Avoid_：将一次 Operation 等同于独占的 Flush 或可回滚业务事务。

**Data Change（有效数据变化）**：Command 对当前 Working Data 造成的真实变化，是后续依赖失效的依据。
_Avoid_：将每次 Command 调用都算作有效变化，或将 Validation 状态变化混入 Data Change。

**Reaction Instance（联动实例）**：一条 Reaction 定义绑定实际 Scope 后形成的同步规则实例；常规执行由有效 Watch 变化驱动，新实例可按 runOnActivate 首次入队，执行时读取最新数据。
_Avoid_：主动维持业务数据正确性的计算服务、按次数记账的事件处理器，或以数组下标标识实例。

**Flush（联动执行轮次）**：消费待执行 Reaction 实例直至收敛或停止的一轮执行，可接收多个 Operation 引发的失效。
_Avoid_：数据提交事务、每条 Reaction 各自一轮，或所有校验与 UI 绘制都已完成。

**Flush Context（轮次上下文）**：仅属于一轮联动执行的计数、来源与临时追踪证据。
_Avoid_：全部 Runtime 状态的容器，或跨轮保留的完整生产历史。

**Flush Outcome（轮次执行结果）**：描述本轮是否收敛、发生可隔离错误或因预算停止的结果，与调度阶段分别表达；准确字段和提交消费方式仍待固化。
_Avoid_：以此建立局部 Reaction Health、失败下游禁用或局部影响链恢复状态；整体 Flush 是当前保护边界。

**Flush Trace（轮次追踪）**：一轮执行中的有序行为、实际数据变化及触发来源记录，供异常诊断与开发工具解释执行链。
_Avoid_：将追踪等同于完整历史数据、确定性重放或热路径实时因果图。

**Constraint Instance（约束实例）**：一条业务约束绑定实际 Scope 后形成的校验义务，读取依赖用于失效，结果由 Runtime 管理；外部能力由 Host 执行。
_Avoid_：与 Reaction 共用执行队列、由 View 挂载决定业务有效性，或将本轮 requires 占位当成已发布字段。

**Validation Round（校验轮次）**：在明确校验入口中处理本轮选定的 Schema / Constraint 任务，前置整理与结果提交具有自身完成语义。
_Avoid_：等同于 Reaction Flush、扫描全部规则推断普通增量任务，或通用异步工作流。

**Validation Source（校验结果来源）**：根 Schema 或某个 Constraint 实例的 Issue 贡献归属，用于替换和撤销该来源自己的结果。
_Avoid_：覆盖其他来源错误，或让来源结果修改业务数据。

**Field Issue Aggregate（字段错误聚合）**：面向稳定 Scope 与相对路径收集各校验来源 Issue 的消费视图，供 View / Host 查询和订阅。
_Avoid_：第二份可写业务真相，或把无 Issue 当成完整校验已通过。

**Pure Function（纯函数）**：表单纯表达式可调用的同步、确定性计算能力，内置能力与注册的领域能力属于同一类别；输入相同则输出相同，不读外部可变状态，也不产生 I/O 或数据写入副作用。
_Avoid_：泛称 Function 而省略纯计算约束、把异步业务操作归入纯函数。

**Capability Catalog**：编译时可查询的 Material 与 Pure Function 契约集合；Host 静态契约可以作为可选补充。
_Avoid_：将契约目录等同于可执行代码或统一业务执行器。

**Capability Lock**：一次表单发布在指定平台与 Profile 下选定的能力版本及不可变制品身份。
_Avoid_：以最新版本指针代替发布锁定。

**Form Release**：绑定业务表单版本、编译产物、能力锁及 Host 依赖要求的不可变发布单元。
_Avoid_：回滚时使用当前能力目录重新组装旧发布。

**View Profile**：同一 FormDefinition 内按场景命名的视图，其值直接是一个 ViewNode。`default` 只是可选名称，不表示额外的协议层级。
_Avoid_：Profile Entry 包装、固定 default 根。

**Default Slot**：Material 的默认子节点组合位置，以 `slots.default` 表达，与 Profile 名称无关。
_Avoid_：把默认插槽与默认视图混用。

**定义信息**：文档中对协议标识、版本和非执行性 metadata 的阅读分组；它不是新的协议字段或嵌套对象。
_Avoid_：basicInfo 协议域。
