---
id: ADR-FE-004
title: ADR-FE-004：PreparedForm 是 Runtime 唯一执行入口
type: decision
status: accepted
layer: 跨层
modules:
- M05
tags: []
related:
  decisions: []
sources:
- SRC-PROTOCOLBASELINE
- SRC-V05
navigation:
  group: 09 · 决策与追溯
  order: 114
last_reviewed: '2026-10-21'
status_note: JSON、格式精确匹配与 Error 不产执行制品已确认；具体 ABI 字段待固化
---

# ADR-FE-004：PreparedForm 是 Runtime 唯一执行入口



## 背景与约束 {#adr-004-context}

若 Runtime 同时解释原始 L1 和编译产物，诊断、依赖、能力锁及兼容检查可能出现双轨语义。编译发生在客户端还是发布期，不应改变执行含义；Prepared 必须可供多实例复用，不能携带会话数据。

## 已确认选择与原有备选 {#adr-004-decision}

FormDefinition 供作者编辑与审查，L2 静态转换为确定 PreparedForm，L3 只消费兼容 Prepared，L4 消费准备好的视图及观察关系。Authoring / Canonical 是同一 L1 的表示形式。客户端接收原始定义时也先调用 L2；ABI 或能力不兼容时明确失败，不静默回退直接解释 L1。

相对双轨候选，唯一入口减少语义漂移和重复解析，代价是编译与运行之间必须提供明确格式、兼容检查和分发契约。L2 不读取 Working Data、不执行业务纯函数或真实 Scope 实例化；Prepared 只保存静态关系与求值准备信息。

## 影响、限制与未决项 {#adr-004-consequences}

Prepared 的 Form / View / Dependency Plan 是结构方向，首阶段 JSON、格式精确匹配已确认；具体字段、摘要及后续格式迁移仍待固化。来源映射与编辑期增量分析仍为推荐；编译诊断的源位置需求已存在，不能据此宣称已实现逐行 Source Map。L1 Protocol、Compiler 与 Prepared ABI 独立识别。

## 来源、演进与关联 {#adr-004-sources}

- 现行：[双结构对照](../dependency-reactivity.md#dependency-compiled-protocol)、[L2 输入输出](../l2-preparation.md#l2-compile)、[兼容性](../l2-preparation.md#l2-versions)。
- 明确依据：V0.5 D01 / D02 / D05；[原件与整合记录](../source-map.md#src-v05)，原件第 01 / 02 / 06 章。阶段 V0.5 不是新的正式 Protocol Version。
- 关联：[ADR-FE-005](ADR-FE-005-watch-subscription.md)、[ADR-FE-011](ADR-FE-011-release-lock.md)；[OD-10 / T06](../governance.md#design-roadmap)应以实际消费需求固化 ABI。

### 2026-10-20：交付格式、装载匹配与错误准入

首阶段 Prepared Artifact 采用 JSON 交付，Form / View / Dependency Plan 保持逻辑分工，不要求拆为多个文件。传输压缩不构成另一套协议；不同时建设二进制格式，只有性能证据出现后才另行评估。具体字段、确定性序列化及摘要覆盖对象继续固化，JSON 方向确认不等于完整 ABI 已冻结。

首阶段 Runtime 只接收与其声明支持格式精确匹配的 preparedFormatVersion；不按 Compiler 版本号推断兼容，也不默认接受版本范围或增加 feature 组合协商。目标平台、Profile、能力锁及 Host 接入检查分别执行，格式匹配不代表所有能力必然可用。不兼容或无效制品拒绝进入执行，不回退解释 L1。

编辑、协议入库校验与发布使用同一 L2 分析能力，尽早返回具体源位置、错误码、严重程度和可读原因。编辑器可取得不完整配置的诊断 / 符号等分析信息，但存在 Error 时不得生成可执行 Prepared，不将错误协议作为可用入库 / 发布制品，也不跳过错误节点拼成部分可执行表单。Warning 可伴随成功制品，不能把已规定拒绝的静态错误降为 Warning。错误草稿能否临时保存属于后续 Studio / Platform 范围，不在本轮另定策略。

C 端只消费检查通过且兼容的 Prepared，错误分析结果不能传给 Runtime 继续执行。运行时仍核对格式、目标与能力，保留输入校验、任务有效性和熔断等保护；静态编译不保证网络、Host 实现或业务输入永不出错，Host 能力缺失仍按 ADR-FE-012 的用途降级，不能伪造校验通过。

比较 JSON / 二进制 / 双格式、精确版本 / 版本范围 / feature 协商、只诊断 / 部分可执行 / 分析与执行分离，用户全部采纳 JSON、精确格式、分析可返回但 Error 无执行制品的组合。记录见 [L2 交付](../design-history.md#l2-delivery-update)。


### 2026-10-21：Prepared 首批结构与装载

用户选择准备后的有类型结构树，Template 编译展开，依赖集中计划并以 ID 关联，业务 Schema 资源闭包随 JSON 制品携带；不新增字节码 VM、节点 / 属性更新分级或运行时联网补 Schema。静态模式不保存实际 Scope ID；真实实例仍归 Runtime。

外部 JSON 在接收边界结构检查一次；同进程 Compiler 成功结果不重复全量校验，受控不可变产物可以复用检查结论，格式 / 目标 / 能力检查继续保留。具体 [Prepared 机器基线](../l2-preparation.md#prepared-machine-baseline)和[开发基线](../l1/08-decisions-release.md#protocol-development-baseline)指导正式类型整合，尚无生产验收证据。
