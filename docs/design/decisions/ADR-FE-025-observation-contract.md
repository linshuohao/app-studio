---
id: ADR-FE-025
title: ADR-FE-025：通用观测契约与四视图
type: decision
status: accepted
layer: 跨层
modules:
- M05
- M08
- M09
- M12
- M13
- M14
- M16
related:
  decisions:
  - ADR-FE-023
  - ADR-FE-021
  - ADR-FE-018
sources:
- SRC-OBSERVABILITY
navigation:
  group: 09 · 决策与追溯
  order: 135
last_reviewed: '2026-11-08'
status_note: 完整方案、详细技术契约及直接破坏性升级已确认；本次仅归档与实施准备，不授权修改实现，不代表新契约已交付
---

# ADR-FE-025：通用观测契约与四视图

## 背景与决定 {#adr-025-context}

字段和事件列表不足以解释 Reaction、校验及结果之间的流动。用户通过视觉 demo 逐步要求多 Reaction 连锁、条件分支、异步校验、跨视图选择、直接上下游与完整影响链、嵌套对象和数组成员、跨对象联动及大数组折叠，并进一步要求说明现有 Schema / 上报 / DevTools 数据能否支撑。用户确认完整通用模型和上报方案，以及三个原则，授权先归档、检查一致性并整理阶段与验收，暂不改实现。

现行完整契约维护在 [L3 诊断与 Trace](../l3-observability.md#observation-contract)，由定义、位置 / 绑定 / 实例、类型化关系、当前状态、事件及完整性六组数据支持关系、执行、状态和诊断四视图。模型不依赖具体业务字段，折叠和高亮由工具投影生成。

## 三个原则与约束 {#adr-025-decision}

1. 区分可能影响与实际发生：静态可达不作为执行证据，缺失记录不推断为未发生。
2. 自动订阅、按需读取：连接后主动推送事实，选中后读取结构 / 状态，值显式检查；不用轮询或手动录制；必需异常现场独立交付。
3. 有界且不干扰业务：限制事件、字节与引用，明确缺失 / 截断 / 不支持；工具失败与断开不改变业务执行及请求资格。

复用 Runtime 成员身份和完整 ScopeBinding，分开定义、实例和执行；数组位置不充当身份。实际因果允许多根合流，共享 Work 与 Call 消费关联分别保留。快照与增量有明确切点和完整性，不承诺 Runtime / Renderer 全局原子快照或自动补回历史。

## 与既有决定的关系及代价 {#adr-025-consequences}

扩展 ADR-FE-023 的独立只读工具能力，保留其所有权、生产默认关闭及失败隔离；不整体替代该 ADR。保留 ADR-FE-021 的工作复用、调用过期及发布资格，保留 ADR-FE-018 的 Flush 生命周期和保护。事件采集不能成为第二个调度器，观测图不反向改变业务 Watch。

结构化目录与事实需要生产者补充上报，有额外采集与缓存成本；以按需读取、真实连接生命周期和有界预算控制；旧协议不兼容，同版可选能力缺口如实说明。完整异常现场仍按原契约处理，不能用工具副本限额缩减。历史 Data 重建、确定性 Replay、任意 Host 副作用自动追踪与全端发布不因此获得承诺。

实施拆分和可验证反例见 [OBS-0 至 OBS-4 / OBS-A01 至 OBS-A17](../l3-observability.md#observation-delivery)。详细接口语义已确认；后续 Web DTO / SDK 接线与同步升级已有本地实现、真实 MV3 和成本证据，见现行实施边界。跨端、目标生产容量和设备性能仍需验收；M16 继续部分完成。视觉 demo 本身仅证明展示意图，真实数据链路以运行证据为准。

## 技术方案确认与升级方式修订 {#adr-025-technical}

2026-11-08 用户确认[详细技术方案](../l3-observability.md#observation-technical)，包括会话拥有录制租约、开始不补造过去、停止立即固定边界不等在途任务，以及固定版本分页 / busy 可重试 / 快照过期重读。用户随后明确“不用渐进式，直接用 break change，不需要兼容”，替换原先保留 V1 / V2 双入口及旧页降级的方向。

现行决定是 Runtime、Renderer、页面桥接和面板同批迁移，精确检查新观测协议版本，不匹配明确拒绝并提示升级；无旧入口、自动翻译或降级路径。保留版本校验是识别不匹配，不是兼容承诺。阶段划分仅用于开发 / 验收，不能据此发布依赖不匹配消费者的切片。业务 API、L1 / Prepared ABI、独立只读和必要异常现场原则不变。

本修订只替代本 ADR 关联主题中的旧协议兼容方向，不整体替代 ADR-FE-025 或 ADR-FE-023；原方向和用户修订原因留在[演进](../design-history.md#observation-technical-confirmed)。接口及技术验收统一见[查询契约](../l3-observability.md#observation-query-contract)与[实施清单](../l3-observability.md#observation-technical-delivery)。本次没有实现授权或新增运行证据。

2026-11-09 用户修订：端到端订阅与自动推送替代上一版显式录制语义；startCapture / stopCapture 不保留兼容。采集接收与视图刷新解耦，选中对象不决定执行覆盖范围，视觉遵循原 DevTools demo。旧录制租约确认仅保留为决策演进，现行接口与资源边界见[订阅生命周期](../l3-observability.md#observation-breaking-upgrade)。
