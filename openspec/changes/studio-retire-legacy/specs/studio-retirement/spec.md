## ADDED Requirements

### Requirement: 单一 Studio 入口

新版 Studio SHALL 作为唯一交互入口，兼容携带旧外壳参数的资源链接。权威行为见 [Studio 导航](../../../../../docs/design/platform-studio.md#studio-ui-layout)。

#### Scenario: 打开旧书签

- **WHEN** 登录后访问包含目录或表单定位以及 `studio=legacy` 的书签
- **THEN** 地址移除旧外壳参数并定位原资源

### Requirement: 退役场景存储

Platform SHALL 退役旧场景接口和相应存储，并保留草稿文本与交付幂等语义。权威行为见 [Agent 草稿归属](../../../../../docs/design/platform-studio.md#agent-conversation-draft-ownership)。

#### Scenario: 升级已有草稿的数据库

- **WHEN** 将包含旧场景和已交付草稿的 Platform 数据库升级
- **THEN** 旧场景表和冗余列被移除，草稿文本、修订与交付指纹仍可读取
