## ADDED Requirements

### Requirement: Studio 表单管理与配置工作台

Studio SHALL 按 [现行创作契约](../../../../../docs/design/platform-studio.md#authoring-pages) 分别展示可访问表单最近保存与最近发布，并允许打开对应详情。

#### Scenario: 保存新版本后查看已发布的旧版本

- **WHEN** 操作者发布配置 A，再保存配置 B
- **THEN** 最近保存链接打开 B，最近发布链接打开绑定 A 的发布
- **AND** 未登录 Host 按发布 ID 装载 A

#### Scenario: JSON 格式化

- **WHEN** 编辑者格式化可解析配置
- **THEN** 编辑器仅调整 JSON token 之间的空白，等待手动保存
- **AND** 非法或格式化后超限的配置文本保持不变
