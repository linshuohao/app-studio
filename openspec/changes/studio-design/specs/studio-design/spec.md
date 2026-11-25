## ADDED Requirements

### Requirement: Studio Design 共享组件与规则入口

Studio SHALL 通过 workspace 包消费公共组件和 Token。Handbook SHALL 使用同一套源码，Studio 页面、组件、Token 和手册变更 SHALL 加载现行设计准则。依据 `docs/design/platform-studio.md#studio-ui-context`。

#### Scenario: 从新检出构建手册

- **WHEN** 锁定依赖已安装且运行工作区构建
- **THEN** Studio 可解析公共组件与 Token，Handbook 在包内 dist 生成组件文档和运行示例

#### Scenario: 工作流准备修改 Token 或组件

- **WHEN** 按 Studio Design 的修改路径或意图查询条款
- **THEN** 查询结果包含统一首读准则、匹配的领域条款和检查入口
