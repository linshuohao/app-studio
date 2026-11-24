---
id: ADR-FE-029
title: ADR-FE-029：配置版本与首期交付闭环
type: decision
status: accepted
layer: 平台
modules:
- M18
- M19
supersedes:
- ADR-FE-028
sources:
- SRC-PLATFORMSIMPLIFIED
navigation:
  group: 09 · 决策与追溯
  order: 139
last_reviewed: '2026-11-11'
status_note: 首期规则已确认，发布与在线装载已通过本地验收
---

# ADR-FE-029：配置版本与首期交付闭环

用户确认简化创作契约。表单直接组织不可变配置版本，每次保存追加原文，来源只供追溯。此决策完整承接 ADR-FE-028 的首期范围，将分支、最新指向与覆盖确认移出首期。确定配置经检查构建后形成不可变发布，保留 RBAC、错误准入与 Host 精确版本规则。

首期保留内置账号并增加 GitHub 登录。发布固定输入并在提交时复核资格。2026-11-11 确认 Host 按 releaseId 公开在线读取，发布同键异参冲突，成功回执长期保留且按当前查看权限重放。发起或继续未完成发布须具备当前发布资格。具体契约、取舍、交付切片与验收见[现行设计](../platform-studio.md#platform-authoring-mvp)。


2026-11-14 范围增补：用户确认最小物料与纯函数目录、成员与角色管理进入本次 MVP，并要求各块同时覆盖 API 与页面。此前仅单人首用及物料后台全部后置的范围限制相应调整，完整资产治理仍后置。配置版本、发布身份和模块化单体决策保持有效；具体范围、任务与验收统一见[本次 MVP 补齐](../platform-studio.md#platform-mvp-completion)，新增功能尚未完成设计、实现或验收。


2026-11-15 身份准入增补：用户确认 GitHub 自助注册平台账号、申请加入默认团队、管理员审批授予角色及本人登录方式管理。平台会话与成员授权分离；普通成员入口由管理员创建账号和分发密码改为申请审批。已存在的账号、成员、配置版本和发布身份保持有效，首位管理员受控初始化不变。本项为本 ADR 首期范围的增量修订，不替代配置版本决定或 ADR-FE-026 的 RBAC 规则。此前身份入口与替代关系保留在[演进记录](../design-history.md#platform-account-admission-confirmed)，完整设计、API接口、切片和状态见[账号准入](../platform-studio.md#platform-account-admission)。新行为已按三个切片完成API/Studio实现、本地自动验收与独立review；真实OAuth和用户最终人工验收单独保留。
