## ADDED Requirements

### Requirement: Studio 设计资源可查询

AI 上下文 SHALL 从实际设计资产提供可定位的组件和 Token 资料。

#### Scenario: 查找 TreeView 和间距

- **WHEN** 预检需要 TreeView 公开入口与 8px 间距
- **THEN** 返回可确认的公开入口、Handbook 属性、可运行例子以及实际 CSS Token

### Requirement: 语言和框架参考有明确作用域

AI 上下文 SHALL 按代码路径和任务意图选参考，带来源、版本和许可证的上游文档可直接读取。

#### Scenario: FastAPI transport

- **WHEN** Python 接口任务明确选择 FastAPI 意图
- **THEN** 返回 Python 参考、FastAPI 官方摘录和本项目 transport 约束
