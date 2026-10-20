---
id: ADR-FE-010
title: ADR-FE-010：完整 Schema、增量 Constraint 与字段错误消费
type: decision
status: accepted
layer: 跨层
modules:
- M10
- M11
- M12
- M13
tags: []
related:
  decisions: []
sources:
- SRC-PROTOCOLBASELINE
- SRC-PREREQUISITES
- SRC-L1
- SRC-V07
navigation:
  group: 09 · 决策与追溯
  order: 120
last_reviewed: '2026-10-21'
status_note: 已确认编译依赖补全与前置共同入队；引用 / 资格 / 异步契约待固化，存储 / 消息为推荐
---

# ADR-FE-010：完整 Schema、增量 Constraint 与字段错误消费



## 背景、约束与原有方案 {#adr-010-context}

Schema 组合语义难以安全拆成每字段 Keyword 单元；固定“Schema→全部同步→全部异步”不能表达真实前置；给 Validation 再建结果 PubSub / 通用异步 DAG 会重复响应式调度。UI 主要需要字段错误，但执行正确性仍依赖新鲜度、是否完成和适用性。

## 已收敛选择 {#adr-010-decision}

首版保留完整根 JSON Schema，经平台 Adapter 只读执行；业务 Constraint 独立于 Ajv Keyword ABI。复用 Data / Scope / 依赖匹配，命中后去重登记本轮 Constraint；正常 Reaction 收敛后校验，没有 Reaction 也有入口。普通增量不在 Runner 扫全部规则推断依赖；完整校验显式覆盖全部适用规则。

L2 自动补全可推导的 Validation 数据依赖，未知业务依赖由作者显式提供；前置输入依赖传递纳入后置有效依赖，不要求重复配置。本轮从命中任务递归补齐前置 Constraint，按具体实例去重并必要重排，不把发起顺序当成通过，不建立结果反向 PubSub 或通用跨异步 DAG；多步异步优先封装为同一 Host External。按字段聚合错误供 L4 / Host 消费，规则不随 View 挂载失效，校验不写 Data 或自动触发 Data-only Reaction。

来源比较过局部 Schema 引擎、固定同步 / 异步阶段、结果反向索引、向 UI 暴露每源复杂状态机；这些未作为当前采用方案。自动补齐前置曾是未采用候选，2026-10-19 用户讨论已明确采用本轮递归补齐，替代严格缺失跳过倾向。代价是根 Schema 仍需完整校验，共同入队可能重复执行前置，需用基准衡量。

### 2026-10-21：前置实例绑定与同步等待范围

字段 / 规则两种前置引用沿用既有讨论，不重开选择；按 Scope ID 对应的具体唯一实例绑定，规则实例结合规则身份定位，数组移动后不按下标串项。本期不增加跨成员 or / any 集合前置，后续按真实需求评估。

首期只等待同步前置；后置 External 可以在同步资格满足后发起，但不等待另一条异步 Constraint。多步异步封装在同一个 Host Validator 内，取消与代次由现有任务契约承接。完整校验等待全部适用异步任务不受此限制影响。字段资格涉及异步来源时的解析范围还须设计，不能将“只等待同步”偷换成“忽略异步也算字段全部有效”。

仅收敛前置范围，正式 requires Union、字段资格集合及 Prepared 表示尚未发布。见 [现行契约](../l3-validation.md#prerequisite-scope-contract)及[用户确认](../design-history.md#prerequisite-scope-confirmed)。

## 推荐实现与未决边界 {#adr-010-open}

按 Source 保存、字段索引派生、同步原子替换、聚合内容变化才通知、默认消息模板加局部覆盖为推荐。过期 / 已销毁实例返回不能提交是必要正确性，具体代次 / token 实现为推荐。Issue、消息覆盖、多语言、Source / SDK 均未冻结。

2026-10-19 确认：仅 B 初始入队时补齐 A，使用本轮前置结论，不复用历史通过结果；A 输入变化通过编译补全的依赖使 B 失效，不建立结果 PubSub。依赖补全不等于立即请求 Host，自动 / 失焦 / 主动策略、异步资格撤销、字段 Schema 资格范围和跨 Scope 绑定仍待固化。Reaction 显式 Watch 原则保持不变。`requires` / `validationMessages` 未作为当前候选 Canonical 字段发布，不通过本 ADR 自动加入。

无 Issue 不证明通过。完整返回需表达业务失败、不完备和输入过期，全部适用校验仍须完成；业务输出由 Host 转换和检查；Reaction 错误不自动阻止提交，联动熔断后仍可独立完整校验，通过后 Host 可提交对应快照；准确 valid / invalid / incomplete / stale 编码、等待范围、Context 证明与恢复接口仍待固化。Web Ajv / Dart 是 Adapter 方向，不宣称现有 Dart 库已通过；性能必须实测。

## 来源、演进与关联 {#adr-010-sources}

- 当前完整规范：[L3 校验全文](../l3-validation.md)、[L1 Constraint / Readiness](../l1/03-expression-validation.md#constraint)。
- 来源：[第五组义务与 Readiness 演进](../../history/2026-10-16-before-v1-final/changes-2026-10-16.md)；[V0.7 原件](../source-map.md#src-v07)第 03 / 05–14 / 16 章。D06 的收敛倾向须与 D14 待验证一起读，D09–D13 不提升为冻结接口。
- 关联：[ADR-FE-005](ADR-FE-005-watch-subscription.md)、[ADR-FE-008](ADR-FE-008-host-editing.md)、[ADR-FE-009](ADR-FE-009-errors-trace.md)；[REV-01 / 02](../design-review.md#rev-01)、[OD-01 / 02 / 09 / 12](../governance.md#open-decisions)。

### 2026-10-19：本组字段资格与完整校验确认

本组已确认：字段有效指其前置校验已经结束且该字段没有错误，不要求作者区分错误来自 Schema 还是业务 Constraint。有前置条件的任务后置执行，执行前核对实际前置已完成且通过；不能仅凭排在后面就当作前置通过。前置未完成或执行异常也不能按“无字段错误”放行。循环、自依赖和字段聚合导致的自包含仍须静态诊断，准确引用 / 实例绑定契约待固化，不据此扩展通用异步 DAG。

完整校验覆盖全部当前适用的同步和异步校验，只有全部完成且通过才能报告成功；不能把仍未完成或失败的异步校验当作可忽略的外部服务。无关报价、埋点等 Host 业务服务不属于校验等待范围。业务错误或执行异常不能报告完整通过，错误与未完成的具体组合编码仍待固化。

尽量收集独立规则的错误；失败只阻止以它为前置的后置任务，不终止其他独立校验。后置跳过不伪造业务失败；保留前置错误与真实执行诊断。此原则同时适用于同步与异步任务，不采用首错停止，也不因其他独立字段有错就一律停止全部远程校验。

这替代仅以 Schema 解释字段资格的助手建议，以及完整校验只等待部分外部校验的候选表述。requiredForSubmit 候选字段不再作为完整校验的豁免依据，正式字段迁移仍待固化。异步等待期间的输入新鲜度策略尚未确认。记录见 [本组讨论](../design-history.md#validation-group-completion-update)。

### 异步校验任务的新旧调用

异步校验的重复调用在校验任务执行层处理，不扩展 Flush 或建立自动追赶的全局调度。同步校验完成后，异步任务可以继续在途；新输入按正常 Command → 下一轮 Flush → 受影响校验路径处理。同一规则实例再次发起校验时，可用版本 / 请求身份识别新旧任务，或撤销旧任务的适用资格并由 Host 尝试取消旧请求；不强制固定某一种实现。独立规则和其他 Scope 实例不因无关请求被替换而整体取消。

正确性要求是旧任务不能覆盖当前有效结果：输入 / 前置资格变化、实例销毁或新调用替换旧调用后，旧成功与旧异常均不得重新发布为当前结果。取消网络请求未必成功，调用替换时撤销结果发布资格与实际请求取消应分开；具体版本号、任务句柄与取消 API 属于后续实现 / SDK 固化。引擎不禁用编辑、不添加全局 Loading，相关交互由 Host 管理。完整校验仍等待全部适用同步 / 异步校验；被替换的调用不能冒充当前表单完整通过，准确取消 / 过期返回编码仍待固化。

讨论记录见 [任务级处理](../design-history.md#validation-task-replacement-update)。

### 取消接入选择

External Constraint 接入选定“Host 返回结果任务及可选 cancel 句柄”。引擎按具体 Constraint 实例管理调用代次 / 任务身份，输入或前置资格失效、同实例新调用替换、Scope 删除及实例销毁时，先撤销旧任务的发布资格，再调用其可选取消句柄。成功与异常返回都必须核对实例存活、任务代次与输入资格；不能只依据全表版本变化取消无关任务，也不能仅比较值相同就接收 A→B→A 的旧请求。

版本与结果有效性是必要正确性契约；取消是尽力而为的资源优化，Host 可以不提供，也不保证网络请求终止。Host 负责实际请求及取消实现，引擎不理解 HTTP / 重试。取消回调要求幂等，任务完成或退出后释放句柄；取消异常只记诊断，不中断其他任务清理或恢复旧任务资格。被主动取消的旧任务不得再发布业务错误或成功，相关诊断与正常网络故障区分。

该能力属于运行时 Host Validator 接口，不将回调写入 L1 或可序列化 Prepared，也不引入异步 Reaction。本次不新增跨端取消信号抽象。完整调用的取消 / 过期返回类型、具体代次编码与 SDK 仍需固化，但不再重新选择取消接入方向。

用户授权助手选定接入方式；采用结果任务加可选取消句柄，避免当前增加跨端信号抽象。具体网络取消由 Host 实现；版本有效性不依赖取消成功。记录见 [取消接入决策](../design-history.md#validator-cancel-handle-update)。

### 2026-10-20：Host 接入与输出职责修订

校验能力使用独立名称被规则引用；缺失按用途降级但不能伪造校验通过。引擎 Readiness 不再包含 Host 业务输出转换 / 验证阶段，表单校验与 Host 业务交付分开。该局部职责修订由 [ADR-FE-012](ADR-FE-012-host-output.md)明确，本文其余 Schema / Constraint / 异步有效性决策继续有效，不整份废弃。


### 2026-10-21：同步字段资格与消息覆盖收敛

用户确认字段前置明确表示 Schema + 相关适用 Internal 完成且无相关错误的同步资格，不包括 External、不冒充完整通过；规则前置指向 External 时拒绝，多前置全部满足，自包含诊断不静默排除自身。此处明确收窄此前“字段有效”的宽泛表述，完整校验仍等待全部适用同步 / 异步规则。

消息采用 Constraint 局部覆盖及 Schema 声明位置 + keyword 覆盖，text / key 两类，资源解析归 Host；专属覆盖 → Host 默认模板 → 通用回退，缺失资源不能吞掉错误，不新增数据路径通配符。实现按[同步资格](../l3-validation.md#prerequisite-scope-contract)与[消息契约](../l3-validation.md#validation-message-contract)整合，不将旧候选字段当正式类型。
