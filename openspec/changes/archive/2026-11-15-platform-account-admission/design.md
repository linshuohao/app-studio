# 实施设计

## 权威依据与确认

引用 docs/design/platform-studio.md#platform-account-admission；此处只记录实施选择，不建立第二份主规格。三个切片均已授权，顺序门禁为前片验收和独立review通过。

## 内部方案与影响

PlatformAccess 分开账号认证和团队鉴权，所有团队消费者仍调用团队权限入口。GET /account 返回本人登录方式和 membership（none/active/suspended），GET /access 保留团队上下文。Studio先恢复账号，再决定是否加载团队数据；403不能一律清除会话。

未知GitHub身份完成OAuth后先存浏览器绑定的短期注册证明，GET /github/registration仅展示身份，POST /github/register原子确认账号、绑定和会话，不收客户端身份。绑定历史用于拦截解绑后的迟到回调，不能降级为注册。既有state、PKCE、来源检查与唯一性保留。

申请审批沿用数据库写事务和revision冲突模型，批准与成员/角色写入原子完成。首次设密使用用途独立的GitHub重新验证证明，复核原会话和当前绑定；不接受一般登录证明替代。具体字段与测试随切片补入执行证据。

并行只发生在同一切片内：API负责人只写services/api，Studio负责人只写apps/studio；主协调负责集成、变更材料与验收。独立review只读取已固定基线，不参与实现。

## 变更与恢复

初始基线为现有混合工作区，原有未提交内容不能当成本轮新改动提交。既有本地预览与原手工数据库不覆盖。实际验证命令、切片基线和review结果统一追加本变更 evidence.md；历史MVP验收不能证明新增准入流程。
