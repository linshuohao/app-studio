## ADDED Requirements

### Requirement: 定义级联动创作

Studio SHALL 按 docs/design/platform-studio.md#studio-reaction-visual 在工作版本中保存规则。

#### Scenario: 作者混用词法成员与根输入

- **WHEN** 作者按 manifest 输入成员年龄与表单根参数并保存重开
- **THEN** 显式观察、参数顺序、成员写入位置以及原有绑定链均保留。

#### Scenario: 成员移动与根观察

- **WHEN** 两个成员依次修改、重排与移除，作者随后加入同名根字段观察
- **THEN** 每次写入落在对应成员，根变化仅在被观察后触发。
