---
id: ADR-FE-034
title: ADR-FE-034：首期错误事件采集与现场归属
type: decision
status: accepted
layer: 平台
modules:
- M16
- M18
sources:
- SRC-PLATFORMDIAGNOSTICS
related:
  decisions:
  - ADR-FE-009
  - ADR-FE-026
  - ADR-FE-031
navigation:
  group: 09 · 决策与追溯
  order: 144
last_reviewed: '2026-11-22'
status_note: 首期设计已确认并归档，待授权开发与验收
---

# ADR-FE-034：首期错误事件采集与现场归属

原始现场只留 Host 的条款由 [ADR-FE-039](ADR-FE-039-form-error-evidence.md) 替代。以下保留原决策与映射依据。

维护者需要按表单、发布版本与配置位置查询错误，也需要能定位到出错时的输入。用户明确选择由 Platform 保存脱敏事件、由 Host 保管完整现场，延续 Platform 与填写数据的边界。使用 Host 身份和事件编号关联两端，通过 Host 自己的权限获取现场。

Platform 复用 PostgreSQL。首期仅接入可受信转发的 Host，公开 Release 身份只作定位，查询权限单独授予管理员并检查表单归属。事件保留 30 天，Host 现场默认保留 7 天，Host 上报重试窗口最长 24 小时。上报异步，与业务执行和清理解耦。

核心诊断继续提供完整现场。首期采集与查询的职责、接口、结构和验收条件见[现行设计](../platform-studio.md#platform-diagnostic-events)。已确认范围及归档授权见[确认来源](../source-map.md#src-platform-diagnostics)。

2026-11-22 增量确认[诊断事件映射白名单](../platform-studio.md#platform-diagnostic-mapping)。Host 精确匹配 `flush.aborted`，按 Runtime 实例身份和事件序号对齐双出口，复用上报事件编号。Schema 异常、Validator 缺注册、Reaction 叶命令异常留在 Host。Renderer 现场范围为现有诊断回调所交付的字段。此增量仅授权归档。
