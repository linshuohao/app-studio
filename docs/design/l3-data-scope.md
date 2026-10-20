---
id: DESIGN-L3-DATA
title: L3 数据、快照与 Scope
type: design
status: active
layer: L3
modules:
- M07
- M08
sources:
- SRC-V04
- SRC-V05
- SRC-V06
- SRC-HOST
related:
  decisions:
  - ADR-FE-006
  - ADR-FE-007
  - ADR-FE-008
  - ADR-FE-009
navigation:
  group: 04 · L3 运行时
  order: 52
reading_next: DESIGN-L3-VALIDATION
relocated_sections:
- source: docs/design/l3-reactive-engine.md
  anchor: l3-data
  target: l3-data
- source: docs/design/l3-reactive-engine.md
  anchor: l3-initialization-baseline
  target: l3-initialization-baseline
- source: docs/design/l3-reactive-engine.md
  anchor: l3-change-detection
  target: l3-change-detection
- source: docs/design/l3-reactive-engine.md
  anchor: l3-observed-equality
  target: l3-observed-equality
- source: docs/design/l3-reactive-engine.md
  anchor: l3-dependency-index
  target: l3-dependency-index
- source: docs/design/l3-reactive-engine.md
  anchor: l3-scope-index
  target: l3-scope-index
- source: docs/design/l3-reactive-engine.md
  anchor: l3-scope-read-state
  target: l3-scope-read-state
- source: docs/design/l3-reactive-engine.md
  anchor: l3-array-lifecycle
  target: l3-array-lifecycle
- source: docs/design/l3-reactive-engine.md
  anchor: l3-command-sequence
  target: l3-command-sequence
- source: docs/design/l3-reactive-engine.md
  anchor: l3-v06-acceptance
  target: l3-v06-acceptance
---

# L3 数据、快照与 Scope

本篇维护数据事实、稳定读、变化比较和重复实例身份的完整契约。调度与错误处理见[运行时与 Flush](l3-reactive-engine.md)，校验结果见[校验专题](l3-validation.md)。

## 即时不可变数据与有序 Command {#l3-data}

2026-10-19 已确认输入限制边界：业务输入限制在交互入口落实；例如 maxItems=5 时界面禁用添加按钮，不发出插入 Command。数据层不依据业务 Schema 拦截写入：若 Host 导入或程序写入第六项，只要操作结构可执行，就写入 Working Data，再由 Validation 报告超限并阻止提交。目标不是数组、位置非法等结构性错误仍须拒绝，不能与业务校验失败混为一类。该边界统一适用于插入、修改和导入，保留暂时业务不合法的工作态，不增加逐 Command 业务预校验或事务机制。

五项不变量：

1. 业务值允许暂时不合法。清空必填项、超出年龄限制可以进入 Working Data，Validation 报告问题。
2. 有效 Command 同步生效。紧接着读取当前 Data 应看到修改，不等待 Reaction 或校验完成。
3. 每次更新形成不可变 Root，未变化子树可以结构共享；旧 Snapshot 保持稳定，不逐步深拷贝整张表单。
4. 单次数组结构操作同时保持 Data 与 Scope Identity 一致，不能暴露索引与身份映射错位的半完成状态。
5. 数据已更新不等于 Renderer 已绘制；调度延迟不保证浏览器先画一帧。

```text
读取 Snapshot v1：age = 20
执行 set age = 25
立即读取当前 Snapshot v2：age = 25
再次读取先前持有的 v1：仍为 age = 20
联动 premium 此刻可能尚未完成，需分别判断收敛状态。
```

默认 `batch` 和 Reaction 的 `then[]` 都按顺序执行 Command，各条有效修改实时生效，不默认回滚先前成功写入。该边界取代“候选数据树中完成整个 batch 后原子提交”的早期候选。业务 Invalid、Scope 已删除、非法数组位置、非法 Command 是不同结果；后几种属于结构性执行失败，单个结构操作仍须保持内部一致性。可隔离的单条 Command 失败应记录并报告，后续独立 Command 继续尝试，其他 Reaction 仍只由有效 Data Change 和自身 watch 决定；精确错误类型、返回值与无法继续的结构性条件待固化。

组合 batch 的每条实际子 Command 仍分别取得前后状态并完成检测，不能仅在整组结束后比较一次净结果。显式首次激活是独立入队原因；这里“按有效 Data Change”描述变化传播，不取消激活策略。

两条显式 `array.insert` 各执行一次，不能因目标相同被合并；待执行 Reaction 的多次失效可以合并，两者属于不同层次。同值短路放在实际变化判定中，基本值应避免无意义传播；对象不默认全量深比较；推荐按观察值 Object.is 与存在性比较，子路径同值跳过、对象引用变化保守失效，具体编码继续固化。

## 实例初始化、稳定快照与 Host 业务基准 {#l3-initialization-baseline}

Runtime 不自动建立业务 Baseline，不维护 Dirty，也不提供 Reset 特殊重算模式；Host 按业务意图生成普通 Command。

```text
Host：加载外部数据，选择初始输入
  → Runtime：装载兼容 PreparedForm + Working Data
  → Runtime：建立 Scope、规则实例和观察注册
  → 新 Reaction 实例：仅按 runOnActivate 首次入队
  → Flush：执行已入队规则，内部写回继续经过普通依赖变化检测
  → Host：按业务需要观察完成结果，可取得 snapshot() 自行保存业务 Baseline
```

新实例首次激活是明确的独立入口，不是“让数据保持正确”的授权。它只在新 Reaction 实例建立时应用；已有实例不会因导入、Reset、结果不符预期、读取快照或收到“重算意图”再次应用 runOnActivate。默认不执行已确认，正式字段形状、实例建立 / 销毁与 SDK 仍需固化。真正创建新 Scope / 规则实例时按策略激活；不得为重跑已有实例伪造重建生命周期。

Runtime 提供稳定快照读取能力，是否保存、何时替换业务 Baseline 由 Host 决定。Host 可以在初始 Reaction 完成后保存快照，也可以依业务选别的时点；这不是 Runtime 的固定基准建立阶段。snapshot() 仅返回当前稳定数据表示，不隐式 Flush、不等待所有异步 Validation、不标记 Clean、不自动建立任何业务历史。初始规则未完成时取得的快照仍只是当时数据，所需完成 / 观察 API 另行固化。

```typescript
// 职责草图，正式类型、错误、返回值与完成观察接口仍待固化。
interface FormRuntime {
  read(ref: DataReference): unknown;
  snapshot(): FormData;
  dispatch(command: Command): void;
  // 数据订阅、规则执行观察与 Validation 等能力另按各自契约提供。
}
```

业务 Dirty 回答“用户是否修改了需要保存的数据”，不同应用可以有不同定义：

| Host 场景 | 可采用的业务判断 |
| --- | --- |
| 普通资料编辑 | 当前数据是否与所选加载快照不同 |
| 投保单编辑 | 需要提交的投保信息是否被修改 |
| 自动计算表单 | 计算结果变化是否应算用户编辑，由业务决定 |
| 审批系统 | 指定字段是否计入编辑状态 |
| 实时数据表单 | 外部数据变化是否计入用户修改 |

这些取舍不进入 Runtime 核心：不增加 isDirty、markClean、resetToBaseline，不因编辑状态区分用户字段 / Reaction 字段、基础字段 / 派生字段或修改来源。L3 的前后 Root、Scope 旧位置视图与临时 Trace 继续服务变化检测、稳定身份和诊断，不充当业务 Baseline。

Reset 由 Host 按业务定义生成普通恢复 Command；即使上层提供 reset() 便捷 API，也遵守同一修改、观察值比较、Scope 与错误契约。恢复后若有效 Watch 没变，已有 Reaction 不执行。Host 若希望使用当前费率，必须用正确的显式 Watch 配置或实际数据修改表达条件，不能调用绕过依赖检测的 Runtime 重算入口；Context 仍沿用现行只读输入与受控宿主入口，不扩展 L1 Command / Watch 到 Context。

异步数据加载、防止迟到响应覆盖编辑、保存 / 提交策略与业务 Baseline 都由 Host 编排。创建实例或显式初始化输入的准确 SDK 尚未冻结；普通对象导入仍是 Command，不代表重新创建规则或重置业务基准。初始校验、异步义务和 Submit 完成条件继续按各自契约设计。

## 单条 Command 内完成变化检测 {#l3-change-detection}

```diagram
{
  "id":"figure-l3-change-detection",
  "title":"Command 内的 Data / Scope 一致更新与观察失效",
  "rows":[
    [{"title":"读取变更前状态","body":"previousRoot + 可稳定读取旧绑定的 ScopeReadView；只保留本次需要的材料"}],
    [{"title":"完整提交 Data + Scope","body":"不可变更新与结构共享；结构操作不暴露只改数据或只改身份的半状态","major":true}],
    [{"title":"索引定位候选观察者","body":"Prepared 路径模板 + Trie 等索引；结合父子路径、结构影响与 Scope"}],
    [{"title":"比较前后逻辑观察值","body":"存活相对观察沿同一 ScopeId，绝对观察沿同一路径；生命周期分别处理"}],
    [{"title":"投递失效标识","body":"Reaction pending 去重；Validation 失效；View / Host 按各自协议通知"}],
    [{"title":"释放本次 ChangeContext","body":"不向下游传旧位置或 ScopeChange；只留下所需 ChangeId / Trace 关联"}]
  ],
  "arrows":["↓","↓","↓","↓","↓"],
  "note":"候选命中不是最终触发。比较逐条 Command 完成，Reaction 真正执行时读最新数据；通知时机与同步重入仍待固化。"
}
```

ChangeContext 不是 Reaction 输入，也不是 Flush Context。每条 Command 临时保留 previousRoot / nextRoot 与可读旧 Scope 位置，提交 Data / Scope 后定位候选、比较观察值，结束后即可释放。结构操作的 before / after 必须各自一致；下一个 Command 从上一个已提交状态继续，不等 Operation 或 Flush 结束才推导变化。

一次 Command 的有效 Data Change 不保证每位观察者失效：对象替换可能改变 Root / 父对象引用，而被观察的 age 值仍相同。来源、Command 名称与“谁会写这个字段”均不改变比较规则；显式只 watch age 的规则，不因 premium 被另一份数据覆盖就自动重算。

## 观察粒度、相等性与旧值来源 {#l3-observed-equality}

已确认按 Watch 所观察的位置比较，而非整张表单深比较：基本值按值与存在性比较，对象 / 数组按引用比较；不提供默认深比较或作者自定义比较器。JS 的 Object.is 为实现候选，跨端数值等价细节仍待固化与验收。存在性如何编码也须与 Missing 读取契约一致，不能把缺失与 null 或合法的 0 / false 混同。

| 观察位置 | 修改前 → 后 | 已确认观察语义下是否失效 |
| --- | --- | --- |
| /insured/age | 25 → 25 | 不失效，即使父对象换了引用 |
| /insured/name | 张三 → 李四 | 失效 |
| /insured | 旧对象 → 新对象，内容可以相同 | 引用不同，保守失效 |
| /insured/address/city | 深圳 → 深圳 | 不失效 |
| /insured/beneficiaries | 旧数组 → 新数组 | 引用不同，失效 |

```typescript
// 推荐比较草图；Observed、存在性与跨端编码待固化。
function sameObservedValue(a: Observed, b: Observed) {
  return a.exists === b.exists && Object.is(a.value, b.value);
}
```

JSON 输入主要区分缺失与 null；若运行时允许显式 undefined，还需明确它与不存在的区别。外部输入的对象 / 数组值进入引擎时复制，解除 Host 原对象与内部数据的可变别名；内部以不可变 Root 和结构共享更新。read / snapshot 返回只读契约，不在生产环境为每次读取深拷贝或默认增加代理。开发环境递归冻结引擎持有的业务数据，捕获误写，不冻结 Host 原对象、Scope Index、Pending 或其他内部可变管理结构。Command 必须先构造修改路径上的新容器再写入，不能原地修改冻结的旧对象或数组；新数据发布前冻结，未变化且已保护的共享子树可复用。生产环境违反只读契约属于错误使用，不保证绕过 Command 修改后的状态正确。

对 JSON 树形输入，复制耗时与新增内存均为 O(n)，n 是本次传入值的规模：初始化整表按整表规模，替换大数组按该数组规模，标量写入没有深拷贝子树。不是每条 Command 深拷贝全表。路径容器复制另受路径深度及各容器宽度影响，不能宣称固定 O(depth) 或常量成本。开发冻结遍历所保护数据，首次全量通常 O(n)，后续应跳过已冻结共享子树；Object.freeze 仅浅冻结，嵌套保护需遍历。实际延迟与峰值内存须由目标设备基准测量，未做生产实现或性能测试。

| 旧值方案 | 状态成本与差别 | 当前方向 |
| --- | --- | --- |
| 周期性完整 Snapshot | 周期不能精准代表当前 Command 前状态，增加全表保存 | 不采用为变化检测基线 |
| 每个 Reaction 缓存上次执行参数 | Scope × 规则常驻缓存，且比较的是上次执行而非上条 Command | 默认不采用 |
| previousRoot / nextRoot | 两个引用，结构共享使旧值可读，不深拷贝全表 | 已确认前后 Root 原则 |

每条 Command 前后比较还能保留“25→26→25”的两次真实变化；不能把它偷换为“最终值等于上次 Reaction 参数，所以没变化”。同一实例仍只有一份 pending，实际执行读取最终值。Root 的临时持有与消费者主动持有旧 Snapshot 的生命周期分别管理，不要求强制销毁外部快照，也不永久保存所有 Root。

## Dependency Index：候选路径定位与 Prepared 模板 {#l3-dependency-index}

Trie / 前缀树与编译依赖模板结合是推荐实现方案：L2 输出规范化路径、Scope Slot 和静态依赖计划；L3 结合实际订阅与真实 Scope 建立可查询索引。Trie 不必成为 Prepared ABI，L2 不能把运行时所有被保人的实例节点编译写死。

```text
Prepared 路径模板 / 推荐运行时索引（不是 L1 语法）
root
├─ insureds
│  └─ [Scope Slot]
│     ├─ age         → 当前项保费 Reaction
│     ├─ premium     → 汇总相关观察
│     └─ beneficiaries / [Nested Scope Slot] / name → View 观察
└─ product / code    → 清空附加保障的 Reaction
另有集合 / 长度 / 顺序等结构观察描述，编码仍待固化。
```

| 修改 | 查找候选 | 随后比较 / 处理 |
| --- | --- | --- |
| set /insureds/0/age | 精确路径和相关祖先观察者 | 根据前后值与绑定实例决定失效 |
| set /insureds/0 为对象 | 该节点下已经登记的观察子树及祖先观察者 | 比较已有观察路径，不深遍历全部导入数据字段 |
| move /insureds | 集合 / 位置候选与相关 Scope 关系 | 相对实例观察按同一身份读取，避免无变化的全实例比较 |
| set /insureds 为数组 | 受影响子树、绝对位置与结构观察 | 结合旧实例销毁、新实例激活与存活观察比较 |

推荐 Trie 的典型成本为插入约 O(depth)、精确查找约 O(depth + matches)；父对象替换需遍历命中的观察子树，成本随相关订阅数量增长，不宣称每次操作恒定时间。深层数组、Move、高层对象少量 Watch 与海量子路径 Watch 都需实测；模板实例化、反查和解析缓存的准确数据结构在实现阶段决定。

来源的 `insureds/length`、通配符与相对路径均是说明性索引 / Authoring 示意，不能当成新增合法 L1 JSON Pointer。成员序号、长度、顺序的观察须用正式支持的集合 / 位置语义表达，具体结构观察编码继续固化。

## Scope Index：相对位置与同一逻辑实例 {#l3-scope-index}

ScopeId 稳定，位置由 Scope Registry / Scope Index 统一拥有。已确认的存储原则是父 Scope + 相对集合位置 + 本层位置，完整绝对路径按需向上解析；父级移动只改当前集合相关直接成员的位置，不重写整棵后代绝对路径。

```typescript
// 信息需求草图，不冻结权威顺序表与辅助 index 的具体编码。
interface ScopeEntry {
  id: ScopeId;
  parentScopeId: ScopeId;
  collectionPath: PathSegment[];
  index: number;
}
```

```text
A：parent=root，collection=insureds，index=0
B：parent=root，collection=insureds，index=1
X：parent=A，collection=beneficiaries，index=0
Y：parent=A，collection=beneficiaries，index=1
X 的绝对路径 = /insureds/<A.index>/beneficiaries/<X.index>
A 移动后 X / Y 的父关系和相对位置不变。
```

Scope Index 存事实，Dependency Index 查逻辑字段的观察者，两者不合并为一套永久物理路径订阅。可维护 collection → ScopeId[] 快速反查；若 Entry 同时保留 index，须确定一个权威来源，另一个作为派生辅助索引，由同一结构 Command 维护一致。

| 观察意图 | Move A / B 前后读取什么 | 年龄 A=25、B=30 时 |
| --- | --- | --- |
| Scope A 的相对 age | before / after 都沿 Scope A 读取 | 25→25，相对年龄不失效 |
| 固定 /insureds/0/age | 同一物理位置，可能从 A 切到 B | 25→30，失效；若恰好同值仍需按值比较 |
| 整个 /insureds 或顺序 | 数组引用 / 明确结构观察 | 顺序改变，影响相应观察者 |

身份与位置分离是确认原则；位置型与相对型 Watch 的具体匹配方案、跳过无变化实例的优化仍为推荐 / 验证工作。依赖成员序号的业务不能只 watch 相对 age，需明确位置或集合变化意图。L4 行组件绑定 ScopeId，Host 也可选择观察固定位置，两者都使用共同 Scope Resolver，无需自己重写移动后的物理订阅。

## 临时 ReadState：旧 Scope 位置也必须可读 {#l3-scope-read-state}

不可变 previousRoot 保住旧 Data，并不会自动保住原地修改的 Scope Registry 旧位置。结构 Command 需同时取得稳定旧绑定，才能让相对观察在两个状态中指向同一个实例。只存“同一个可变 Registry 的引用”不满足要求。

```typescript
interface ReadState {
  dataRoot: DataRoot;
  scopes: ScopeReadView;
}
interface ChangeContext {
  before: ReadState;
  after: ReadState;
  impact: ChangeImpact;
}
```

推荐先保留本次受影响集合的旧 ScopeId 顺序 / 位置视图，或使用轻量版本读取；不为了对称强制全量复制或不可变化整个 Registry。嵌套后代的旧绝对路径由旧父位置递归组合，必要时缓存本次解析。具体局部视图保存形式是实现验证项。

提交一致的 Data / Scope → 定位候选并在 before / after 读取 → 投递 ObserverId / ReactionInstanceId → 释放 ChangeContext。旧位置不放入 Pending，不随联动传播 ScopeChange。Reaction 最终执行只根据 ScopeId 读取当时最新位置与 Data；Trace 可保留 ChangeId，不借此延长整个 ReadState 生命周期。

## 数组操作、生命周期与统一订阅 {#l3-array-lifecycle}

数组插入 / 移动的目的位置同时支持数字下标与稳定成员锚点（成员之前 / 之后）。移动对象按稳定成员身份指定，数字只描述目的位置；位置在 Command 实际执行时按当时数组解析。移动的数字目的位置指移动后的最终下标，例如 [A,B,C] 中将 A 移到 2，结果为 [B,C,A]。长度为 n 的数组插入位置为整数 0…n，n 表示追加；已有成员在同一数组内移动的最终下标为整数 0…n−1。

位置越界、非整数、目标锚点已删除或不属于目标数组等位置失效必须明确返回结构性失败，不自动夹到首尾，不回退追加或猜测其他成员。单次操作在解析 / 校验位置后再一致更新 Data 与 Scope，失败不留下半完成的移除状态；失败不回滚 batch 中先前已成功的其他 Command。锚点与数字位置共用同一结构执行机制，正式字段 / Union、错误编码及精确返回结构继续固化，不新增命令种类。

新 Reaction 实例默认不因建立而执行；只有显式开启首次激活执行时才在建立时入队。该默认值同时适用于引擎初始化、数组插入及整体替换后建立的新成员。初始化已有输入不伪造为新实例的一次 Watch 变化；建立之后的有效 Watch 变化仍正常触发。首次校验与首次视图读取有各自入口，不受此默认值控制。

| 操作 | Data / Scope | 已有相对观察 | 固定位置 / 集合观察 | 首次激活 |
| --- | --- | --- | --- | --- |
| array.insert | 新建 Scope，调整同层位置 | 存活成员同值可跳过 | 按位置 / 长度 / 集合变化比较 | 新成员按策略 |
| array.move | 身份保留，调整同层顺序 | 非位置型内部字段同值可跳过 | 顺序 / 位置观察按值或结构语义处理 | 不重新激活存活项 |
| array.remove | 销毁被删 Scope，存活项保留身份 | 存活成员同值可跳过；删项任务取消 | 受影响位置 / 长度比较 | 不适用 |
| set 现有成员对象 | 保留该行身份，嵌套结构另行处理 | Trie 命中的子字段逐一比较 | 父对象引用可能变化 | 通常不重激活该成员 |
| set 整个数组 | 销毁旧成员 Scope，创建新成员实例 | 新实例无旧观察基准，按生命周期处理 | 集合与固定位置照常比较 | 新成员按策略 |

2026-10-19 已确认：整体替换数组即销毁旧成员实例并创建新成员实例，这是操作语义，不是按成本选择的默认优化。即使新旧成员数据完全相同，也不继承实例身份；不通过业务 ID、姓名、内容或深度比较识别旧成员。旧成员 Scope、规则与订阅释放，旧异步结果失去适用资格，UI 局部状态不自动继承；新成员按新实例激活策略处理。需要保留身份时使用字段修改、move 等明确保留原成员的操作。对深度匹配与重建的成本判断不构成实测结论，身份语义不依赖性能比较。 嵌套替换与草稿首次激活仍需实现验收，确认语义不等于实现已通过。

存活观察者比较前后值，删除和新建实例走生命周期：释放旧订阅 / 规则 / 外部结果适用性，按编译策略激活新实例。不能把不存在的旧实例当成普通旧值，也不能漏掉新建成员首次入队。生命周期安排不代替既有 Validation / View / Host 的各自完成语义。

| 消费者 | 共用的数据匹配基础 | 匹配后的行为 |
| --- | --- | --- |
| Reaction | Prepared Watch、路径索引、Scope Resolver、前后观察值 | 合并 pending，在 Flush 中执行 |
| Constraint / Validation | 相应数据依赖与 Scope | 使结果失效并去重登记校验 Pending；正常联动收敛后按本轮链执行，外部请求时机另按策略 |
| 已挂载 View | 订阅的 Data 路径 / Scope | 通知重读，由 L4 决定呈现节奏 |
| Host 数据观察 | 明确路径或 Scope 的数据订阅 | 通知读取当前数据，不需知道修改来自哪条规则 |
| Reaction 执行 / Flush 中止 / Error 事件 | **不进入 Data Trie** | 通过独立执行事件观察或 Trace 消费 |

统一的是数据依赖查找、比较与 Scope 解析，不是让全部消费者进入 Reaction Queue。执行事件 API 仍需固化；它与 `host.emit` 业务事件也不能仅因都称“事件”就混成同一协议域。同步通知重入与订阅释放交接仍按原有未决契约验收。

## 多 Command 轨迹与执行骨架 {#l3-command-sequence}

```text
起始：index0=A(age25)，index1=B(age30)
同一 Operation：
  Command 1：set /insureds/0/age=26 → Change #1，使保费@A 入队
  Command 2：move 0→1 → A/B 位置互换，相对 age 不失效
  Command 3：set /insureds/1/age=28 → Change #3，再次命中保费@A
Pending：保费@A 仍一份，triggeredBy 可包含 [#1,#3]
Flush：执行一次，通过 A 当前绑定读取 age28
```

Command 2 仍可能影响固定位置和集合观察者，不能因为相对年龄不变就把 Move 判为没有变化。每条 Command 立即写入并检测，后续命令读取前一步最新位置；可隔离错误不阻断独立行为。该轨迹不是原子事务，也不积累三份 ScopeChange 等到 Flush 再分析。

```text
executeCommand(preparedCommand):                  // 概念骨架，不是生产算法
  capture beforeRoot + affected old ScopeReadView
  apply immutable update and consistent Scope change
  commit Data + Scope together
  find candidate observers from local impact + dependency index
  for each observer alive in both before and after:
    read the same logical target in each ReadState
    if observed values differ: invalidate(observer, changeId)
  dispose removed Scope instances; activate created instances by policy
  release temporary before / ChangeContext

invalidate(observer, changeId):
  reaction   → enqueue or merge instance + source ChangeId
  validation → invalidate the rule instance result
  data view / host subscriber → mark notification pending
execution events → use the separate execution observer interface
```

源码附件的伪代码有 `result.changed` 早退；实现时必须确保它涵盖相关结构 / 生命周期变化，不能把“某个 Watch 同值”当成整次 Command 无效而跳过 Scope 处理。旧视图稳定性、Data / Scope 一致发布、生命周期与通知交接、模板索引维护都需实际验证。骨架不提前冻结回调顺序、重入算法、Scope 视图物理表示或正式 API。

## 端到端设计验收与实现边界 {#l3-v06-acceptance}

以下是 PreparedForm / Data / Scope / Dependency Index 的行为验收，包含候选实现需证明的结果，不是已通过的运行时测试。数组整体替换即重建已确认，首次激活默认不执行已确认，字段与 SDK 仍待固化。

| 来源场景 | 输入 / 过程 | 必须证明 |
| --- | --- | --- |
| 01 单字段同值 | set(age,25)，原值为25 | 不因同值产生数据失效通知或调度；独立执行事件另行处理 |
| 02 父对象替换、子字段同值 | /insured 换新引用，age仍25 | 子路径年龄观察跳过，整个对象引用观察可失效 |
| 03 父对象替换、被观察字段改变 | 新年龄30 | 索引命中子观察路径并登记年龄规则 |
| 04 未观察大对象字段修改 | 500个未观察字段变化 | 不扫描全部Reaction、不凭空触发未命中观察者 |
| 05 Move与稳定Scope | A及其嵌套受益人随父移动 | 身份保留；A相对age不因位置变化失效 |
| 06 Move与固定索引 | 观察/insureds/0/age | 按前后位置值比较，切换对象且值不同时失效 |
| 07 删除首项 | 删除A，B前移 | A销毁；B相对观察不被读成另一个人 |
| 08 嵌套受益人移动 | X在A内移动 | X身份保留，父集合顺序观察正确失效 |
| 09 整数组导入 | 整体替换数组，即使成员内容完全一致 | 旧 Scope 释放、新 Scope 身份不同；旧异步结果不可提交；位置 / 集合观察更新，新实例按激活策略处理 |
| 10 多Command命中同一实例 | set年龄→move→set年龄 | 逐条比较、pending去重，Trace保留多个ChangeId，执行读取最终数据 |
| 11 同步业务级联 | 内部Command产生新变化 | 可继续失效其他规则，同轮执行到收敛 |
| 12 整个Flush熔断 | 持续震荡 | 整体预算停止，不计算局部健康或影响链 |
| 13 View行绑定 | 行组件绑定ScopeId后数组移动 | 仍读取同一实例在新索引的数据，L4不重写物理订阅 |
| 14 Host执行事件 | 监听Reaction完成与数据变化 | 两类订阅分开，执行事件不进入Data Trie |
| 15 异步初始化 | Host 加载数据后建立实例 | 新规则按 runOnActivate；Runtime 提供稳定 snapshot，Host 可自行选择时点保存业务 Baseline，Runtime 不自动建立 |
| 16 Host Reset | Host 恢复数据，现存规则的 Watch 未变 | 只走普通 Command / 比较链路，不因 Reset 或费率期望重跑已有实例；新实例确实建立时才应用 runOnActivate |

实现前优先验证共享对象不可被外部原地修改、连续 Move / Remove / Insert 的旧位置视图、整数组重建与首次激活对草稿的组合影响；再明确存在性、位置型观察和解析缓存。分别测量深数组、频繁重排、大对象少量 Watch 与大量子路径 Watch 的索引成本，不预设全局依赖快照、无限版本链或沿联动传播 ScopeChange。

下一步可用这 16 个案例验证 Prepared Watch → 索引候选 → Data / Scope 前后值 → 观察者失效的闭环，再做性能基准；Validation 同步 / 异步失效、删除清理与完整校验已进入 [校验专题](l3-validation.md)，缺失前置、返回类型与异常 Submit 衔接仍待固化。业务 Reset / Dirty / Baseline 已划归 Host，不再作为 Runtime 的待讨论执行模式；不得由推荐索引实现倒推字段所有权、结果修复或自动 Watch。原始附件与整合前全文见 [来源归档](../history/README.md#data-scope-v06-integration)。

### 数组位置契约验收补充

| 场景 | 预期 |
| --- | --- |
| [A,B,C] 中 A 移动到下标 2 | [B,C,A]，A 与后代身份保留 |
| 长度 n 的数组在位置 n 插入 | 追加新实例 |
| 以 B 为锚点插到 B 之前 / 之后 | 按执行时 B 的稳定身份与位置定位 |
| 非整数、越界或锚点已删除 | 结构性失败，无部分 Data / Scope 修改 |
| 同一 batch 前序命令已改变顺序 | 后序位置按执行时最新数组解析，不回滚前序成功命令 |

这些是待实现验收，不是候选验证器已通过的用例。
