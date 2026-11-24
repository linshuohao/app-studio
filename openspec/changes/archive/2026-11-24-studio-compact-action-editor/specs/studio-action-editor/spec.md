## ADDED Requirements

### Requirement: 单列动作配置

Studio SHALL 按 docs/design/platform-studio.md#studio-action-editor 为联动动作提供单列编辑。

#### Scenario: 选择动作并设置值

- **WHEN** 作者新增动作或更改类型
- **THEN** 在类型下方显示对应字段，写入值、属性值、新成员与消息内容使用表达式编辑器。

#### Scenario: 批量修改后取消或应用

- **WHEN** 作者调整子命令或修改其表达式
- **THEN** 整批仅在应用并通过检查后写回。取消保留既有规则与相邻节点。

#### Scenario: 稳定成员与位置

- **WHEN** 作者配置数组插入或移动
- **THEN** 成员和参照锚点按作用域句柄选择，数字位置明确以 0 为起点。
