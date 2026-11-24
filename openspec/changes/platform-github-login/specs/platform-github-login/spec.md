## ADDED Requirements

### Requirement: 绑定后的统一身份

GitHub 登录 SHALL 通过已有绑定进入同一平台用户并使用当前成员权限。

#### Scenario: 同一用户

- **WHEN** 内置管理员完成绑定后分别使用两种方式登录
- **THEN** 用户、成员、权限和操作归因相同

#### Scenario: 未绑定账号

- **WHEN** 未绑定 GitHub 账号完成提供方验证
- **THEN** 不建立平台会话、用户或成员

#### Scenario: 成员停用

- **WHEN** 成员停用后再次访问受保护接口
- **THEN** 按当前资格拒绝

### Requirement: OAuth 回调完整性

回调 SHALL 核验操作目的、流程资格及身份关联。

#### Scenario: 重放及串绑

- **WHEN** 状态已消费或发起会话与绑定目标不匹配
- **THEN** 拒绝建立绑定及会话

#### Scenario: 旧绑定失效

- **WHEN** 解绑先完成，旧绑定的登录回调随后试图签发
- **THEN** 旧绑定不能签发会话

#### Scenario: 提供方不可用

- **WHEN** 授权取消或提供方无法读取身份
- **THEN** 没有部分绑定，内置登录仍可用

### Requirement: 配置与撤销绑定

依据 [GitHub 登录与会话](../../../../../docs/design/platform-studio.md#platform-github-login)，平台用户与 GitHub 身份 SHALL 一对一绑定，绑定或解绑须验证当前会话用户的内置密码。解绑 SHALL 原子撤销绑定和该绑定签发的全部会话。

#### Scenario: 双向唯一性

- **WHEN** 已有绑定的用户试图换绑或同一 GitHub ID 被另一个用户绑定
- **THEN** 拒绝，原绑定继续有效

#### Scenario: 拒绝过期授权

- **WHEN** 绑定回调时重验凭据证明已过期或原会话已退出
- **THEN** 不生成绑定

#### Scenario: 撤销与再绑定

- **WHEN** 解绑完成后，旧的 GitHub 会话访问或旧回调在同账号重新绑定后到达
- **THEN** 旧会话及旧回调均被拒绝，内置会话保持有效

#### Scenario: 提供方撤销

- **WHEN** GitHub 撤销授权，后续 OAuth 回调换码或身份验证失败
- **THEN** 无新增平台会话，已有平台会话按本地规则处理
