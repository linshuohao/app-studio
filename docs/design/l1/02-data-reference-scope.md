---
id: L1-DATA-SCOPE
title: 数据、引用与作用域
type: protocol
status: active
layer: L1
modules:
- M02
- M07
- M08
tags: []
related:
  decisions:
  - ADR-FE-020
  - ADR-FE-002
  - ADR-FE-007
sources:
- SRC-REACTIONSTATE
- SRC-L1
- SRC-V06
navigation:
  group: 02 · L1 协议
  order: 32
last_reviewed: '2026-10-19'
reading_next: L1-EXPRESSION
---

# 数据、引用与作用域

> L1 架构与语义决策正文；正式类型、Schema 与发布验收状态见各节。

## Data / Value / Default / Output {#data}

> 状态：已收敛

**数据结构只定义一次**

```json
{
  "data": {
    "schema": {
      "type": "object",
      "properties": {
        "applicant": { "$ref": "#/$defs/Person" },
        "insureds": { "type": "array", "items": { "$ref": "#/$defs/Person" } }
      },
      "$defs": {
        "Person": {
          "type": "object",
          "properties": {
            "name": { "type": "string" },
            "age": { "type": "integer" }
          }
        }
      }
    }
  }
}
```

- **数据与视图分离：**JSON Schema 管结构与基础约束；单个 Form 不需要按 Profile 创建多份业务 Schema。
- **Working Data 允许暂时不合法：**例如输入过程、Host 回填或旧数据，不得静默以“最后一次合法值”替换当前数据。普通输入无法解析为目标类型时可交付当前文本作为非法工作值；编辑结束后的组件展示必须对应 Runtime，详见 [L4 输入交付](../l4-renderer.md#input-handoff)。
- **缺失与 null 不同：**Missing、null、解析失败属于不同语义；不设计独立的 Incomplete 解析状态。
- **默认值：**Host 初始化数据优先，Schema 默认值可填充真正缺失的位置；不覆盖显式 null。
- **空值与联动：**Missing、null、空字符串、0、false 不混同。缺失时跳过还是返回 null，由业务 when / Pure Function 明确；用户清空后若需清掉派生值，必须显式写回，跳过不会自动清旧值。不新增通用 Ready 状态；首次激活策略可配置，字段默认值与 API 待固化。
- **稳定快照与普通导入：**Runtime 提供稳定数据快照；Host 自行决定是否保存业务 Baseline、如何判断 Dirty 和生成 Reset Command。普通整对象 / 数组导入只按实际 Watch 变化触发，不自动修复被覆盖的业务结果，不推断字段所有权或编辑来源。
- **提交：**引擎完整检查 Schema 及全部适用同步 / 异步约束，交付对应数据快照；Host 自行进行业务请求转换、输出检查与真正提交。表单业务所需正确数据应在表单配置中直接表达，不由引擎提交阶段隐式修正。

## Reference：统一寻址规则 {#reference}

> 状态：已收敛

**引用类别**

```typescript
type DataReference = {
  source: 'data';
  path: string;          // JSON Pointer
  scope?: string;        // 仅词法可见的局部名称
};
type ContextReference = {
  source: 'context';
  path: string;
};
type EventReference = {
  source: 'event';
  path: string;
};
```

**不同来源的只读/可写能力由所处位置约束**

```text
{ "source": "data", "path": "/applicant/name" }
{ "source": "data", "scope": "insured", "path": "/age" }
{ "source": "context", "path": "/countryOptions" }
{ "source": "event", "path": "/selectedValue" }
```

统一使用 JSON Pointer：`""` 表示引用根值，`"/"` 表示空字符串字段名。绝对路径简写（例如 `"/applicant/name"`）始终从 Form Data 根开始，不会随当前 Scope 隐式变成相对路径。

> **位置级约束**
> 
> Expression 可读取受允许的 Data / Context（Event 仅在交互上下文有效）；Reaction 的 when / action 值另可读取 ValidationReference，详见[校验状态观察](04-command-reaction.md#reaction-state-host)。Command `target` 只能写 Data，不能写 Context、Event、Validation 或 Material Props。

## ScopeBinder：局部词法绑定，不建全局注册表 {#scope}

> 状态：已收敛

**唯一绑定语义**

```typescript
interface ScopeBinder {
  from: DataReference;
  as: string;
  mode?: 'one' | 'each';
}
```

`one` 将一个数据位置绑定为局部名称；`each` 对一个数组的每个项建立独立上下文。在 View 的 ScopeNode 中，`each` **直接表示重复实例化对应子视图**，父 Material 不需要额外 `repeat`。

**View 中的逐项实例化**

```json
{
  "scope": {
    "from": { "source": "data", "path": "/insureds" },
    "as": "insured",
    "mode": "each"
  },
  "node": {
    "material": "insured-card",
    "bindings": {
      "value": { "source": "data", "scope": "insured", "path": "" }
    }
  }
}
```

View、Reaction、Constraint 在协议允许的位置建立局部 Binder；它们不定义独立的数据存储域。L2 处理词法名称绑定，L3 对应实际数据位置与数组项稳定身份；不同规则使用同名别名，不构成全局 Scope 冲突。

依赖编译中，L2 保存 Scope Pattern、`each` 模式及 `from` 的结构关系，不展开当前成员或保存实例 ID；L3 将模式绑定到真实实例并激活该实例的业务规则，L4 仅对实际挂载的 View 实例订阅。插入创建规则实例，删除清理订阅与义务关联，移动跟随稳定身份；整组替换的身份复用契约仍需 L3 固化。见 [跨层 Scope 分工](../dependency-reactivity.md#dependency-scope)。

> **不扩张为通用变量系统**
> 
> Scope 只能出现于明确的结构性入口；普通 Props、Expression 和 Command 都不能随意创建 Scope。`from` 不接受任意 Expression 拼出的动态数据位置；词法链中不得重复遮蔽已有别名（保守规则）。

## ScopeHandle 与数组实例身份 {#scope-handle}

> 状态：已收敛

**Data Reference 与 ScopeHandle 不混用**

```text
// 获取当前数组项的业务值：
{ "source": "data", "scope": "insured", "path": "" }

// 在需要项身份的命令中表达当前实例：
{ "$scope": "insured" }

// 示例：精确删除当前项，而不是按数组下标删除
{
  "op": "array.remove",
  "target": { "source": "data", "path": "/insureds" },
  "item": { "$scope": "insured" }
}
```

ScopeHandle 表示数据实例的定位身份，不代表数据副本，也不是业务主键。数组排序后不能悄悄指向新的同下标对象；原实例被删除时句柄失效。普通 View Template 参数则**只传 Data Reference**，不需要对外暴露 ScopeHandle。

明确 L3 的 Scope Index 存父 Scope、相对集合位置与本层位置，绝对路径按需解析；这是运行时实例登记，不恢复 L1 全局 Binder / scopes 注册表。移动父项不应改写全部后代绝对路径，L4 无需自己维护物理下标重绑定。

相对当前 Scope 的 age 比较同一实例，固定 `/insureds/0/age` 比较同一位置。Move 后同一个人的年龄不变，相对年龄观察不应仅因下标改变失效；固定位置则按前后值比较。依赖序号 / 顺序需明确集合或位置观察，不隐含在年龄中；正式结构观察编码仍待固化。

现有成员对象替换保留行身份，子观察路径比较前后值，嵌套集合另行处理。整个数组替换默认重建成员 Scope 是推荐，非冻结身份协调规则；不能根据姓名或内容猜旧身份，新实例按首次激活策略处理。详见 [Scope 与数组生命周期](../l3-data-scope.md#l3-array-lifecycle)。
