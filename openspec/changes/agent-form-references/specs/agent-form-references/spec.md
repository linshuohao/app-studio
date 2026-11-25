## ADDED Requirements

### Requirement: 固定版本的随消息表单引用

Studio SHALL 按 [首批表单引用契约](../../../../../docs/design/platform-studio.md#agent-form-references)支持键盘提交以及从对话、列表和详情中附带已保存表单版本。

#### Scenario: 键入斜杠并补全

- **WHEN** 用户键入 `/` 或 `/f`
- **THEN** 输入框立即提示 `/form`，Tab 或 Enter 补全并聚焦表单搜索框

#### Scenario: 从已选版本创建另一表单

- **WHEN** 用户选定 A 的版本，在 A 再次保存后提交创建 B 的消息
- **THEN** Agent 使用已选版本，交付经 Compiler 检查的独立候选，并在历史提供指向该版本的链接

#### Scenario: 版本无效

- **WHEN** 随消息发送的引用版本不能解析到指定表单或空间
- **THEN** Platform 拒绝提交，Studio 保留待发正文及引用供用户调整

### Requirement: 固定资产和已保存页面对象

Studio SHALL 按 [第二批引用契约](../../../../../docs/design/platform-studio.md#agent-asset-object-references)支持纯函数、物料和已保存配置中的对象引用。

#### Scenario: 资产身份与对象位置

- **WHEN** 用户从目录、补全或页面点选添加引用
- **THEN** 消息携带选定制品摘要或固定表单版本及对象路径，Platform 校验后 Agent 使用对应只读资料
