# 10 · 共享表达式配置设计

布局属性和显隐、联动的 `when` 与动作值、Constraint 的 `when` 与 `assert` 共用 ExpressionEditor。调用方提供当前位置的字段树、词法 Scope、函数 Catalog、具名表达式和结果要求，决定如何写回各自协议位置。

## 配置一个值

| 取值来源 | 交互与协议 |
| --- | --- |
| 固定值 | 用类型化输入区分字符串、数字、布尔、null 和结构化 JSON。Expression 的结构化原样值使用 `literal`，ValueSpec 的原样对象使用 `$literal`。 |
| 读取字段 | 用 FieldPicker 在当前 Scope 的可见字段中单选，显示字段名、类型、路径和不可选原因。取消保留原选项。根字段与局部同名字段分别展示，实际引用使用 `ref`。 |
| 函数结果 | 从分组 Select 选函数后才显示参数。按 Catalog 的签名顺序和语义名称排列，处理可选和变长参数。每个参数重复使用同一套取值来源，可继续嵌套。提交保持 `op` 和有序 `args`。 |
| 具名表达式 | 展示业务名和技术标识；引用写 `use`。可见候选由当前上下文和协议决定。复用已有表达式时验证作用域及结果类型。 |

函数根节点与新选函数默认展开。深层限制累计缩进；收起时显示一行业务摘要，空间不足用省略号。参数名和函数名旁的说明可通过悬停或键盘焦点阅读；函数说明可打开完整签名与用法。摘要旁的「详情」开启只读弹窗，按签名顺序展示参数和值，支持逐层展开和 Escape 返回原触发按钮。内容放不下时在参数边界换行。

读取场景用 ExpressionDisplay 的紧凑或结构化样式。日常读业务短句，查看定义时展示函数 ID、字段路径和 Scope。Catalog 的 `displayTemplate`、`displayLines` 和 `parameterLabels` 提供业务展示信息；模板缺失、签名不符或参数不匹配时回退通用函数与参数表示。展示模板只描述结构，保留原计算树。

## 写回由调用方决定

| 使用位置 | 写入形式 |
| --- | --- |
| 物料 Props、动作值或 Host Payload 的动态值 | 在 ValueSpec 位置用 `{"$expr": <Expression>}`。 |
| Reaction 成立条件、Constraint 适用条件与内部断言 | `when` 或 `assert` 直接保存 Expression。 |
| Action 写入目标 | 用 FieldPicker 选择目标，按 DataReference 写入。读取字段的表达式与动作目标各有入口。 |

编辑器可以在表单与局部 JSON 之间往返。局部 JSON 修改当前表达式，语法无效时保留原文供修复。应用只把结果交给外层，外层负责位置检查、暂存、原文局部写回、撤销和保存。失败保留输入；取消、换位置或换草稿后忽略旧试算和检查结果。缺少输入、求值失败、结果类型不符和返回 false 是可区分结果。Expression 中的字段读取本身不会改变 Reaction 的 Watch。

## 验证表达式

1. 从当前表达式或动作值打开「验证表达式」，带入所在位置的类型和 Scope。默认展示条件树或结果区，样例输入可用字段表单或 JSON 提供。
2. 如果引用重复成员，选择要验证的那一项。试算用当前 Compiler 与隔离 Runtime，校验实际结果和位置要求。返回值保持类型，显示缺失字段、求值错误和短路跳过节点。
3. 点击条件树节点关闭试算并回到对应编辑位置。关闭时恢复触发项焦点。样例数据和试算结果留在验证会话。涉及真实控件事件或运行时校验状态时，用表单试填验证。
4. 分别验证应用、取消、撤销和保存重开。外层提交时依旧核对当前位置，防止试算中的成功被错用于修改后的表达式。

## 旅险回归场景

- **布局显示条件**。用根计划和具名 `tripDays` 组成 `core.and` 和 `core.or`。给两套输入得到「显示／隐藏」，核对短路节点及点击定位。把返回字符串的常量放入布尔 `disabled`，试算提示类型不匹配，应用也拦截。
- **联动动作值**。使用同一成员的年龄与根级的计划、天数计算保费。参数顺序通过折叠摘要、只读详情和 JSON 核对。调整动作值时保留目标字段及显式 Watch。
- **校验断言**。对不同成员验证各自年龄或姓名。选择的作用域、路径和成员变化可解释，切换成员只改变试算数据。将结果一次应用、撤销和保存重开，核对原 `assert` 位置。
- **异步边界**。故意延迟验证，取消并编辑另一值，旧返回不能覆盖新结果或让被取消的表达式写回。

原仓设计为 `docs/design/platform-studio.md#studio-expression-editor` 和 `#studio-expression-reading`。可交互样例位于 `packages/studio-design/handbook/studio-components/` 的 `expression-travel.html`、`expression-display.html` 和 `expression-verification-panel.html`。实现入口为 `apps/studio/src/app/expression-editor.tsx`、`expression-display.tsx` 和 `expression-verification.ts`。主回归位于 `apps/studio/tests/expression-editor.spec.ts`。
