## ADDED Requirements

### Requirement: 常用表单物料交付

系统 SHALL 提供可在 Studio 与 Playground 使用的五项 Shadcn 表单物料。

#### Scenario: 单日期提交

- **WHEN** 用户输入日期后按 Enter、离开输入框或从日历选择
- **THEN** 有效日以公历字符串写入，无效草稿留在输入框并提示修正

#### Scenario: 日期范围确认

- **WHEN** 用户在范围面板的日历选中日期
- **THEN** 表单值在确认前保留，取消丢弃草稿，确认沿用现有双端绑定写入

#### Scenario: 文本与选项

- **WHEN** 用户输入多行备注、切换单选项或取消最后一个多选项
- **THEN** Runtime 分别收到含换行的文本、选项 ID 和空数组
