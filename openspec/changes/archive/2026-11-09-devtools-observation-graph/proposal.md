# DevTools 通用观测与四视图

## Why

当前独立 DevTools 能发现 Runtime / View / Material、读取展示快照与有限事件，但不能完整解释一次操作如何连锁触发 Reaction、跨对象 / 数组成员传播、经过条件和异步校验形成结果。字段列表和粗粒度事件无法支撑可靠的执行路径高亮、跨视图定位和折叠统计。

本次将已确认的通用观测契约落实为结构化生产者接口、可追溯的执行事实、统一工具 Store 和关系 / 执行 / 状态 / 诊断四视图。场景以投保人修改联动多个被保人为贯穿验收，模型不包含保险专用字段。

proposal 已建立；用户随后要求继续，当前按 W3 推进首个内部实现切片。具体进度与实际证据见 design / tasks；提案结构校验仍不等于业务验收，未完成的生产者 / 消费者切换不对外宣称可用。

## What Changes

- **BREAKING**：直接替换旧 DevTools 协议；Runtime、Renderer、页面桥接、客户端与面板同步迁移。版本不匹配明确拒绝，无 V1 兼容层、双入口、翻译或旧页降级。
- 提供生产者 / epoch、稳定实体、排队项、执行、Work / Call 和事件身份，区分定义模板与当前绑定实例。
- 分离目录发现、固定版本元数据分页、按需值检查、增量交付确认、自动订阅和异常现场定位；查询不触发业务计算。
- 在事实发生处补充 Reaction 条件 / 动作 / 有效变化及校验资格 / 返回 / 发布 / 丢弃记录，保留多根合流、共享工作与缺失信息。
- 以连接生命周期管理自动订阅：连接前不补造过去，断开立即停止交付，不取消在途业务工作；多连接独立。
- 建立统一 Store、四视图共享选择、逐步高亮、上下游聚焦、完整影响链、对象 / 数组折叠及准确统计。
- 增加协议、时序、重试缺口、隔离、图投影与扩展端到端反例；测量元数据和录制成本。

不包含：业务 API / L1 / Prepared ABI 修改、业务调度重构、第二套校验引擎、历史 Data 重建、确定性 Replay、任意 Host 自动因果追踪、全端全 frame 适配、持久化后端和外部发布。不新增图形库安装前置，不等待 Platform / Studio 完整设计。

## Impact

### 权威与确认

唯一权威仍为 docs/design；本目录只保留本次变更范围、实施选择与验收增量，不写入 openspec/specs。

- [通用观测契约](../../../docs/design/l3-observability.md#observation-contract)：三原则、身份、关系、四视图、完整性。
- [详细技术方案](../../../docs/design/l3-observability.md#observation-technical)、[接口](../../../docs/design/l3-observability.md#observation-query-contract)、[快照](../../../docs/design/l3-observability.md#observation-snapshot-protocol)、[采集](../../../docs/design/l3-observability.md#observation-instrumentation)。
- [破坏性升级](../../../docs/design/l3-observability.md#observation-breaking-upgrade)、[OBS-0 至 OBS-4](../../../docs/design/l3-observability.md#observation-technical-delivery)、[OBS-A01 至 OBS-A17](../../../docs/design/l3-observability.md#observation-delivery)。
- [ADR-FE-025 技术修订](../../../docs/design/decisions/ADR-FE-025-observation-contract.md#adr-025-technical)：用户已确认技术方案、会话录制与固定分页，随后明确取消渐进兼容，采用直接 breaking change。
- [数组身份](../../../docs/design/l3-data-scope.md#l3-array-lifecycle)、[共享校验工作](../../../docs/design/l3-validation.md#validation-work-coalescing)、[治理](../../../docs/design/governance.md#observability-contract-status)、[工作流](../../../docs/design/workflows.md#workflow-openspec)。

### 消费者与风险

Runtime 开发观测子入口、Reaction / Command 和 Validation 采集点；Renderer 投影 / 请求观测；DevTools 页面世界桥接、扩展 Transport、客户端、面板；对应单元 / 集成 / 扩展 E2E 和包导出检查均受影响。现有源码和契约需在实施前重新固定基线，当前混合工作区不是本变更独占。

主要风险：重入快照混版、采集改变通知顺序、迟到结果污染当前 Source、丢包重试重复计数、断开一个连接影响其他订阅、数组身份串项、图折叠丢边或重复统计、旧协议路径残留。按 specs 的反例与 tasks 的阶段门禁验证，复杂时序和跨层接缝安排独立审查。

实施按 OBS-0 至 OBS-4 分片，但可用协议切片的生产者与消费者必须同步，不向旧端逐步发布。M16 保持部分完成；仅在实现、反例和对应环境证据齐备后更新进度。具体预算 / 租期 / 性能阈值先测量，不在 proposal 虚构数字。
