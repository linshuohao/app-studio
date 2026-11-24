## ADDED Requirements

### Requirement: 确定版本交付

发布 SHALL 绑定确定配置版本及固定的构建输入。

#### Scenario: 继续编辑

- **WHEN** 发布 V1 后用户另存 V2
- **THEN** 交付仍绑定 V1

#### Scenario: 响应丢失

- **WHEN** 成功提交后同一发起人以当前查看权限同键重发相同请求
- **THEN** 返回原 releaseId，只存在一个成功结果

#### Scenario: 编译失败

- **WHEN** 原文不合法或 Compiler 返回 Error
- **THEN** 不产生可读交付

### Requirement: 发布可见性与资格

发布提交 SHALL 与当前资格及表单状态一致。

#### Scenario: 撤权或归档先提交

- **WHEN** 编译后提交前停用、撤权或归档先完成
- **THEN** 无新交付及成功审计，旧交付保留

#### Scenario: 退出后提交

- **WHEN** 已受理请求发起人主动退出，提交时仍具发布资格
- **THEN** 发布可以完成，后续新请求仍需会话

#### Scenario: 部分写入失败

- **WHEN** 写入制品或成功结果时注入事务失败
- **THEN** 读取端看不到半提交的交付

### Requirement: Host 在线装载

Host SHALL 按指定 releaseId 在线获取并验证制品后创建实例。

#### Scenario: 新旧版本共存

- **WHEN** Host 先加载 R1 再为新实例选 R2
- **THEN** 既有实例仍使用 R1，R2 准确装载

#### Scenario: 装载反例

- **WHEN** 发布不存在、摘要错误或锁定能力不兼容
- **THEN** 明确反馈失败，不启动新实例

#### Scenario: 公开读取

- **WHEN** Host 未登录且请求已提交的 releaseId
- **THEN** 返回该发布的装载信息和 Prepared 制品，Studio 发布记录仍要求查看权限
