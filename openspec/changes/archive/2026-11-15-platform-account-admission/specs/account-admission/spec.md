## ADDED Requirements

### Requirement: 账号与成员资格分离

The system SHALL 允许未知GitHub身份确认注册账号，但不自动赋予团队资格。

#### Scenario: 注册后访问团队资源
- **WHEN** 未加入团队的新账号请求本人账号和团队表单
- **THEN** 本人账号可读，团队表单403，Studio展示准入页且不当作退出登录

#### Scenario: 解绑后的迟到回调
- **WHEN** 旧OAuth回调晚于解绑完成
- **THEN** 不签发会话、不恢复绑定、不转为注册

### Requirement: 申请审批原子授予资格

The system SHALL 仅允许当前有成员管理权限的管理员审批pending申请并显式选择角色。

#### Scenario: 审批与撤回并发
- **WHEN** 两个操作针对同一revision提交
- **THEN** 仅先完成的有效操作生效，批准与成员角色创建原子完成

### Requirement: 登录方式管理

The system SHALL 允许GitHub原生账号经独立用途重新验证后首次设密，禁止解绑唯一登录方式。

#### Scenario: 首次设密及会话
- **WHEN** 有效当前绑定身份重新验证并成功设密
- **THEN** 保留发起会话并撤销其他会话，可用内置密码登录
