---
id: ADR-FE-039
title: ADR-FE-039：表单错误原始现场与 Agent 调查边界
type: decision
status: accepted
layer: 平台
modules:
  - M16
  - M18
  - M19
sources:
  - SRC-PLATFORMDIAGNOSTICS
related:
  decisions:
    - ADR-FE-034
last_reviewed: '2026-11-25'
status_note: 确认首期边界并启动错误上报、聚合与下钻切片
---

# ADR-FE-039：表单错误原始现场与 Agent 调查边界

[2026-11-25 用户确认](../source-map.md#src-diagnostics-evolution)首期仅上报已发布表单错误，Platform 接收可取得的原始诊断现场，暂缓脱敏处理。该决定替代 ADR-FE-034 中“中心仅保存脱敏事件、原始现场只留 Host”的条款。其错误映射、异步交付、受信 Host、PostgreSQL、管理员查询和重试上限继续有效。

Host 按诊断实例固定错误当刻输入，本地异步暂存。Platform 对重试幂等接收，按发布与错误指纹聚合，保留单次错误。Studio 引用单次错误 ID，修复 Graph 将调查关联到错误组与原发布。原始值只交给授权的复现工具；模型读取结构化证据和复现结果。维护者的原始现场查询按现有表单权限单独核验。

实施按[错误接收与查询](../platform-studio.md#platform-diagnostic-events)及[错误引用和 Agent 调查](../platform-studio.md#agent-error-diagnosis)分批验证。
