## ADDED Requirements

### Requirement: 共用表达式编辑与验证

Studio SHALL 按 docs/design/platform-studio.md#studio-expression-editor 共享字段与函数编辑、条件树、给定值验证及复杂表达式 JSON 入口。

#### Scenario: 旅险布局、联动和校验往返

- **WHEN** 作者在同一旅险版本中配置嵌套显示条件、引用具名表达式的联动条件和逐成员校验断言
- **THEN** 样例验证展示实际结果和短路状态，换成员后使用对应成员数据，三处独立应用及撤销，保存重开后恢复协议节点。

#### Scenario: 样例类型与请求时序

- **WHEN** 作者在布尔属性中输入字符串结果，或在验证中变更样例再改回
- **THEN** 显示与目标类型不相容及应用错误，过期请求不会阻止当前样例重新验证。
