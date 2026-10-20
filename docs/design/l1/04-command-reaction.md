---
id: L1-COMMAND
title: 命令与同步联动
type: protocol
status: active
layer: L1
modules:
- M09
tags: []
related:
  decisions:
  - ADR-FE-006
  - ADR-FE-008
  - ADR-FE-009
sources:
- SRC-L1
- SRC-V04
- SRC-V05
- SRC-HOST
navigation:
  group: 02 · L1 协议
  order: 34
last_reviewed: '2026-10-19'
reading_next: L1-VIEW
---

# 命令与同步联动

> L1 架构与语义决策正文；正式类型、Schema 与发布验收状态见各节。

## Command：封闭的受控数据修改语言 {#commands}

> 状态：已收敛

| 操作 | 语义 | 边界 |
| --- | --- | --- |
| set | 替换目标 Data 值 | 目标必须为可写 Data Reference |
| patch | 浅层对象字段更新 | 不隐式递归深度合并 |
| remove | 删除属性位置 | 区分将属性设为 null |
| array.insert | 插入集合项 | 校验目标与位置的结构可执行性；不以 maxItems 等业务 Schema 限制拦截写入 |
| array.remove | 按稳定项身份删除 | 不可仅依赖不稳定 index |
| array.move | 按稳定项身份移动 | 保留被移动项身份 |
| batch | 按顺序组织多个 Command，各条有效修改即时生效 | 默认非原子，不默认回滚前序成功修改；不能变成通用工作流 |

### 数组目的位置与失败边界

数组插入 / 移动的目的位置同时支持数字下标与稳定成员锚点（成员之前 / 之后）。移动对象按稳定成员身份指定，数字只描述目的位置；位置在 Command 实际执行时按当时数组解析。移动的数字目的位置指移动后的最终下标，例如 [A,B,C] 中将 A 移到 2，结果为 [B,C,A]。长度为 n 的数组插入位置为整数 0…n，n 表示追加；已有成员在同一数组内移动的最终下标为整数 0…n−1。

位置越界、非整数、目标锚点已删除或不属于目标数组等位置失效必须明确返回结构性失败，不自动夹到首尾，不回退追加或猜测其他成员。单次操作在解析 / 校验位置后再一致更新 Data 与 Scope，失败不留下半完成的移除状态；失败不回滚 batch 中先前已成功的其他 Command。锚点与数字位置共用同一结构执行机制，正式字段 / Union、错误编码及精确返回结构继续固化，不新增命令种类。

**修改目标与计算值必须严格区分**

```json
{
  "op": "set",
  "target": { "source": "data", "path": "/order/total" },
  "value": {
    "$expr": {
      "op": "mul",
      "args": [
        { "ref": { "source": "data", "path": "/order/price" } },
        { "ref": { "source": "data", "path": "/order/quantity" } }
      ]
    }
  }
}
```

2026-10-19 已确认：业务输入限制在交互入口落实；例如 maxItems=5 时界面禁用添加按钮，不发出插入 Command。数据层不依据业务 Schema 拦截写入：若 Host 导入或程序写入第六项，只要操作结构可执行，就写入 Working Data，再由 Validation 报告超限并阻止提交。目标不是数组、位置非法等结构性错误仍须拒绝，不能与业务校验失败混为一类。该边界统一适用于插入、修改和导入，保留暂时业务不合法的工作态，不增加逐 Command 业务预校验或事务机制。

Command 只做表单数据修改。请求上传、业务审批、支付、弹窗动画和远端提交均不变成 Command 类型。复杂业务逻辑可以由 Host 根据结果发回一个受控 Command。

Command ValueSpec 在执行时求值，不因读取其他字段而自行建立订阅。Reaction 产生的新 Command 也走相同修改入口，保证后续依赖继续统一匹配。Command 的顺序与次数是行为的一部分，两次 `array.insert` 不能仅因目标相同就合并成一次。

有效 Command 同步更新 Working Data，后续读取立即可见；数据允许业务上暂时不合法，由 Validation 报告。单个结构操作仍须保持 Data 与 Scope Identity 一致。`batch` 与 `then[]` 不默认整体回滚；可隔离的单 Command 错误记录后继续后续独立命令，其他 Reaction 按有效 Change 响应，不检查上游成功。具体错误分类、接口与无法继续的结构性条件待固化，详见 [L3 数据与修改边界](../l3-data-scope.md#l3-data)。

## Reaction：明确触发与条件的边界 {#reactions}

> 状态：已收敛

**规则级作用域可使用有序绑定链**

```typescript
interface Reaction {
  id: string;
  scope?: ScopeBinder | ScopeBinder[];
  watch: DataReference[];
  when?: Expression;
  then: Command[];
}
```

**数据变化时的最小联动声明**

```json
{
  "id": "clear-city-on-country-change",
  "scope": {
    "from": { "source": "data", "path": "/insureds" },
    "as": "insured",
    "mode": "each"
  },
  "watch": [
    { "source": "data", "scope": "insured", "path": "/country" }
  ],
  "then": [
    {
      "op": "set",
      "target": { "source": "data", "scope": "insured", "path": "/city" },
      "value": null
    }
  ]
}
```

`watch` 规定常规执行需要响应的观察位置，有效观察值变化才使已有实例入队；`when` 决定入队执行时是否运行 then。二者不能互相代替，Expression 读取不自动成为触发条件。`then` 已是有序 Command 数组，不必强制包 batch；新实例首次激活按独立策略处理。

L2 分开记录读取与显式触发关系，L3 随 FormRuntime / Scope 激活 Reaction，通过统一观察机制匹配 watch；View 是否挂载不影响业务联动。`when` 与 `then` 的读取均不自动追加 watch。首次是否运行 Reaction 是独立生命周期策略，不能由订阅注册隐式决定。

L2 可提示 Reads / Watch 差异或潜在写冲突，由作者选择补充或保持，确认后修改 L1 并重编。不静默增加、删除或覆盖 watch，也不把未采纳建议作为 Runtime 执行依赖。Constraint / View 仍按各自语义推导观察，见 [编译审查闭环](../dependency-reactivity.md#dependency-watch-review)。

首次激活策略显式可配置：L1 表达、L2 编译，runOnActivate 仅在新 Reaction 实例首次建立时应用，不依赖先发生 watch 变化，也不等于订阅注册必然运行。它不允许已有实例因导入、Reset、结果看似错误或 View 重挂再次执行。默认不执行，只有显式开启才首次入队；字段形状和兼容规则仍待固化，候选 Schema / 样例尚未覆盖；不增加通用 onInit 或 Ready 状态机。

普通导入 `{age:25,premium:80}` 覆盖 `{age:25,premium:150}` 时，现存实例若只 watch age 且没有先前 pending，不重新执行，premium 保持导入值。Runtime 保证按协议执行并维护声明的校验，不保证作者配置一定产生期望结果。Dirty、业务 Baseline 和 Reset 策略归 Host，不能成为绕过变化检测的理由，见 [四条已确认原则](../l3-reactive-engine.md#l3-runtime-host-boundary)。

每条 Command 内部完成前后 Data / Scope 读取和变化检测，待执行实例只接收失效标识与必要 ChangeId。对象 / 数组引用比较、子路径同值跳过是 推荐相等性方案；不把 Command 修改来源或“哪个 Reaction 写这个字段”变成触发条件。普通字段、Host 回写与 Reaction 写回走同一检测，不引入派生字段所有权，详见 [观察粒度](../l3-data-scope.md#l3-observed-equality)。

Reaction 是变化驱动的同步规则，不是主动维护业务结果正确性的计算服务。同一实际 Scope 下实例待执行时，多次有效 watch 失效可合并，执行读最新 Data；执行后再次发生有效变化可重新入队。先前有效变化已入队的任务不因后来同值写入被撤销。需要逐次保留的新增或副作用由明确 Command / Host 事件表达；then 中无条件反复新增仍需诊断收敛风险。

> **范围约束**
> 
> Reaction.watch 的变化匹配只消费内部 Data Change，显式首次激活策略是另一种入队原因；Command 求值与修改保持同步受控，不引入异步业务 Reaction。外部校验完成仅更新 Validation State，不触发只观察 Data 的联动；需要改变数据时由 Host 显式提交 Command。L3 延迟启动同步 Flush，内部级联留在当前轮；可隔离错误继续独立行为，预算超限整轮熔断，不建立父子执行控制或局部 Health。通知重入、精确排序与熔断后 Pending 仍待固化，见 [L3 执行契约](../l3-reactive-engine.md#l3-flush)。L1 不加入队列、计数、Trie、Scope Index 或 Trace 字段。
