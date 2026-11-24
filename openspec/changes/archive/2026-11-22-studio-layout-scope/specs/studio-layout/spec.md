## ADDED Requirements

### Requirement: 在 Studio 配置重复容器和显示条件

布局 SHALL 按 docs/design/platform-studio.md#studio-layout-visual 提供共用字段树、重复区和显示条件。

#### Scenario: 在重复区内按成员年龄控制显示

- **WHEN** 作者从数组建立逐项重复，并选择成员年龄编排数值比较
- **THEN** 工作草稿保存词法字段引用及正式 ViewNode，试算样例不进入草稿。

#### Scenario: 移动超出成员作用域

- **WHEN** 作者选择缺少原词法声明的位置
- **THEN** Studio 指出受影响字段和原因，并保持草稿原文。
