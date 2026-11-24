# 本次变更

## Why

已登录与团队资格混合，未知 GitHub 身份只能被拒绝，无法完成用户确认的自助注册后申请加入团队流程。

## What Changes

依次交付三个 API / Studio 纵向切片：账号与准入分离、申请审批、登录方式管理。每个切片验收与独立 review 通过后才继续下一切片。真实 GitHub OAuth 单独跟踪，不用模拟提供方替代真实环境验收。不增加多团队产品、自定义角色、账号合并或找回服务。

## Impact

权威依据为 docs/design/platform-studio.md#platform-account-admission、#platform-github-login、#rbac-members；用户2026-11-15确认完整设计并授权按顺序持续实施。影响平台访问、OAuth、成员API、Studio入口/设置/成员页面和API及浏览器测试。旧账号、成员及releaseId公开Host保持有效。主要风险为鉴权放宽、并发审批、身份唯一性和迟到OAuth回调。工作区大量混合改动保留，测试用临时数据库，不推送或部署。
