## 实施
GET /api/platform/members 管理员查询当前空间成员；POST /members 以已有内置账号 username 和 roles 关联已启用用户，不创建用户/凭证，不恢复已有停用成员，重复关联409。
POST /members/:memberId 以 revision、roles、active 原子替换，事务内重新授权 member:manage、检查当前revision及至少一个用户和成员均启用的admin。角色非空、唯一且只允许四种内建角色；冲突409、非法400、未知404、权限不足403。
附加迁移 platform_member_changes 持久化操作者、结果状态、时间，以追加序号作成员revision；不改变原表单、历史、发布数据。停用即时阻断访问，恢复仍沿用既有有效会话，界面明确提示。并发写由 SQLite BEGIN IMMEDIATE 串行，过时角色表单不会覆盖后续撤权。

## 已确认身份接入
POST /members 可明确 createAccount:true、identityVerified:true 并提交 password：密码至少12字符、最多256字节，随机盐 scrypt 仅存派生值。异步hash前后都校验管理权限；用户名唯一，不覆盖已有用户凭证。创建用户、凭证、成员、初始角色与无秘密审计在同一事务。createAccount省略/false沿用已有账号关联。
POST /api/platform/password：当前有效成员验证 currentPassword 后设置 password。hash完成后在事务内重鉴权、比对原凭证；并发变更409。当前会话保留，其他会话撤销；审计不包含凭证。登录提交与GitHub绑定/解绑也比对当前凭证，阻止旧密码证明越过轮换。
