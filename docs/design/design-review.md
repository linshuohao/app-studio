---
id: REVIEW-FE-001
title: 架构约束与一致性审查
type: governance
status: active
layer: 跨层
modules: []
tags: []
sources:
- SRC-L3BASELINE
- SRC-REVIEW
related:
  decisions:
  - ADR-FE-018
  - ADR-FE-019
last_reviewed: '2026-10-22'
reviews:
  REV-01:
    modules:
    - M05
    - M11
    - M13
    severity: high
    blocking: false
    state: explained
  REV-02:
    modules:
    - M08
    - M11
    - M12
    - M13
    severity: high
    blocking: false
    state: explained
  REV-03:
    modules:
    - M09
    - M13
    - M15
    severity: high
    blocking: false
    state: explained
  REV-04:
    modules:
    - M02
    - M08
    - M09
    severity: medium
    blocking: false
    state: explained
  REV-05:
    modules:
    - M05
    - M06
    - M12
    - M15
    severity: medium
    blocking: false
    state: explained
  REV-06:
    modules:
    - M12
    - M13
    - M15
    severity: medium
    blocking: false
    state: explained
  REV-07:
    modules:
    - M07
    - M08
    severity: medium
    blocking: false
    state: explained
  REV-08:
    modules:
    - M02
    - M03
    - M05
    severity: medium
    blocking: false
    state: open
  REV-09:
    modules:
    - M01
    - M08
    - M09
    - M15
    severity: info
    blocking: false
    state: explained
  REV-10:
    modules:
    - M02
    - M13
    - M15
    severity: medium
    blocking: false
    state: explained
navigation:
  group: 09 · 决策与追溯
  order: 101
relocated_sections:
- source: docs/design/governance.md
  anchor: review-scope
  target: review-scope
- source: docs/design/governance.md
  anchor: global-constraints
  target: global-constraints
- source: docs/design/governance.md
  anchor: consistency-findings
  target: consistency-findings
- source: docs/design/governance.md
  anchor: governance-maintenance
  target: governance-maintenance
---

# 架构约束与一致性审查

本篇供核对约束与问题证据。继续讨论先看[设计进展与待讨论事项](governance.md)，设计正文不穿插本篇的审查过程。

## 资料范围与判定方法 {#review-scope}

**事实**是资料中可直接定位的内容；**已确认决策**须有明确结论或替代记录；**推断 / 建议**是本次审查提出的分析；**未知 / 待决策**表示来源未闭环。这四类不能相互替代。本篇的问题严重程度、实施准入判断和建议顺序均属于审查判断，不冒充原讨论结论。

本地范围包含现行整体架构、使用指南、L1 八个主题及阅读分组、L2、依赖订阅、L3 执行、L3 校验、领域词汇、历史索引与轮次记录、历史 HTML 和 ZIP 来源、候选验证源及现有报告。读取历史是为了核对决策演进；旧内容不因较长或更具体而恢复效力。来源包中的脚本只作为文本证据，不执行附件代码。目录 / 文件 / 章节及摘要由[覆盖清单](source-map.md#source-inventory)记录。

原始对话没有完整逐字导出。Runtime / Host 修订仅有明确标识的决策摘录，不能补造决策人、会话轮次或逐字引语。站内历史 HTML 曾统一纯函数术语，逐字证据应使用原始 ZIP。不存在于本地的外部材料、未保存的讨论和生产实现均不在本次覆盖范围内。

完成度以“职责 → 模型 → 接口 → 流程 → 生命周期 → 异常 → 验收证据”逐项判断，不按篇幅或写代码与否打百分比。**可局部验证**允许探索实现；**可形成正式实现契约**要求相关未决项已解决；**生产验收通过**必须另有实现证据。

## 全局约束与模块责任 {#global-constraints}

下表是约束检索入口，完整技术说明以链接正文为准。编号 G01–G12 是本次建立的稳定索引，不是新协议字段。

| ID | 已确认约束 | 权威正文 | 关联 ADR |
| --- | --- | --- | --- |
| G01 | 表单数据交互为核心范围；请求、提交和业务流程归 Host | [产品边界](architecture.md#boundary)、[Host](l1/05-view-material-host.md#host) | [001](decisions/ADR-FE-001-boundaries.md) |
| G02 | 单实例唯一 Working Data；View / Profile 不复制权威业务数据；工作态允许业务不合法 | [Data](l1/02-data-reference-scope.md#data) | [001](decisions/ADR-FE-001-boundaries.md) |
| G03 | 受限纯 AST、结构化 Reference、局部词法 Binder；无任意脚本或动态写路径 | [表达式](l1/03-expression-validation.md#expression)、[Scope](l1/02-data-reference-scope.md#scope) | [002](decisions/ADR-FE-002-static-language.md) |
| G04 | L3 只消费兼容 Prepared；L2 静态编译，不读取实例或执行纯函数 | [双结构](dependency-reactivity.md#dependency-compiled-protocol)、[编译边界](l2-preparation.md#l2-boundary) | [004](decisions/ADR-FE-004-prepared-entry.md) |
| G05 | Read / Watch / Subscription 分离；Reaction 显式 Watch 由作者确认，不自动增删 | [Watch 审查](dependency-reactivity.md#dependency-watch-review) | [005](decisions/ADR-FE-005-watch-subscription.md) |
| G06 | Command 即时不可变写入；batch / then 默认有序非原子；逐 Command 检测 | [Data / Command](l3-data-scope.md#l3-data)、[检测](l3-data-scope.md#l3-change-detection) | [006](decisions/ADR-FE-006-command-flush.md) |
| G07 | Reaction pending 可合并、执行读最新状态、内部级联归本轮；显式 Command 保留次数 | [Reaction](l3-reactive-engine.md#l3-reactions)、[Flush](l3-reactive-engine.md#l3-flush) | [006](decisions/ADR-FE-006-command-flush.md) |
| G08 | Scope 身份与下标分离；Data / Scope 一致发布；位置存父级相对关系 | [Scope Index](l3-data-scope.md#l3-scope-index) | [007](decisions/ADR-FE-007-scope-comparison.md) |
| G09 | runOnActivate 仅新规则实例；稳定 snapshot；业务 Baseline / Dirty / Reset 归 Host；Context 表单侧只读，Host 可显式替换并统一失效 | [四条原则](l3-reactive-engine.md#l3-runtime-host-boundary)、[Context](extension-integration.md#host-context-update) | [008](decisions/ADR-FE-008-host-editing.md)、[019](decisions/ADR-FE-019-host-context-replacement.md) |
| G10 | 可隔离错误继续；预算超限只停当前 Flush 并清队列，后续新有效触发正常建轮；无局部 Health，Trace 不参与许可 | [错误](l3-reactive-engine.md#l3-errors)、[Trace](l3-observability.md#l3-trace) | [018](decisions/ADR-FE-018-flush-round-protection.md) |
| G11 | 完整根 Schema + 独立 Constraint；校验只读，字段聚合不等于完整通过；过期异步结果不可提交 | [校验](l3-validation.md#validation-baseline)、[完整性](l3-validation.md#validation-completeness) | [010](decisions/ADR-FE-010-validation.md) |
| G12 | Material / Pure Function / Host 分责；发布锁定版本和不可变制品；L1 Protocol 与 Prepared ABI 独立 | [能力与发布](l2-preparation.md#l2-release) | [011](decisions/ADR-FE-011-release-lock.md) |

跨模块规则的主要维护位置：L1 管声明语义；L2 管编译、能力绑定与发布交接；依赖专题管使用位置和订阅生命周期；L3 执行专题管数据 / Scope / Flush；校验专题管校验结果与完备性；整体架构保留各层目标、取舍、图示及集成，不退化成摘要。术语只在[领域词汇](../CONTEXT.md)维护，历史和 ADR 解释原因，不成为另一份运行规则。

## 一致性审查结论与问题 {#consistency-findings}

没有发现必须推翻四层主架构的证据。已确认的全局边界基本一致；真正妨碍正式跨模块实现的是若干未闭环契约。下列“高”表示应阻止相关接口冻结或发布，不代表线上事故。问题区分设计张力、缺口、表面冲突和已有明确替代的历史差异。

### REV-01：严格本轮前置与增量集合的原始张力 {#rev-01}

- **原问题与来源：**[仅命中 Constraint 入 Pending](l3-validation.md#validation-pending)与原严格缺失跳过倾向，使仅修改 name 时 B 入队而 A 不入队，即使 A 的旧结论有效也无法执行 B。
- **2026-10-19 结论：**用户已确认后置入队时递归补齐前置 Constraint、按具体实例去重并使用本轮结论；不使用历史通过结果。严格缺失跳过不再是现行方向，详见 [ADR-FE-010](decisions/ADR-FE-010-validation.md)。
- **状态：**原策略冲突已解释，不再阻塞策略选择；引用语法、环路诊断与跨 Scope 实例绑定仍由 OD-01 / OD-02 / T01 固化，未宣称实现通过。

### REV-02：跨轮前置资格与依赖传递 {#rev-02}

- **原问题与来源：**B 在途时只有 A 的输入变化，若 B 未观察相关输入，单比较 B 自身依赖无法撤销其资格。
- **2026-10-19 结论：**L2 自动推导可分析读取，并把前置输入依赖传递纳入后置有效依赖；不可推导的 Host 业务依赖由作者显式提供。无需作者重复声明，也不建立前置结果 PubSub，不改变 Reaction Watch。
- **2026-10-22 状态复核：**前置已明确为 Schema + 相关适用 Internal 的同步资格、具体 Scope 唯一实例和本轮共同入队；输入 / 前置 / 实例失效以及新调用替换均先撤销旧任务资格。原行为张力已解释，不再阻塞架构决策。具体绑定算法、token / 通知和在途资格验收仍关联 OD-02 / OD-09 / T01，不以设计归档宣称 Runtime 已实现。

### REV-03：异常 Flush 与提交的原交接缺口 {#rev-03}

- **原问题：**已写 Data 保留，但熔断后是否继续校验、是否阻止提交与后续触发边界未定。
- **2026-10-19 已确认及本轮替代：**Reaction 异常隔离、报告 Host，不自动阻止提交。2026-10-22 将持续暂停改为仅停止当前轮并清空剩余 Reaction，后续新有效触发正常建轮；保留填写、快照与独立完整校验，关键业务关系由 Constraint 检查。数据不可可靠读取或校验机制不可用时不能证明合规，见 [ADR-FE-018](decisions/ADR-FE-018-flush-round-protection.md)。
- **状态：**策略已收敛；Outcome / 完整结果与清理交接由 OD-03 / OD-04 / T02 整理并实际验收，不再等待恢复行为决策。

### REV-04：数组命令的 Schema 限制歧义已澄清 {#rev-04}

- **原问题：**L1 将 array.insert 写作“受目标 Schema 约束”，没有区分结构可执行性与业务合法性；maxItems=5 时是否拒绝第六项与允许业务不合法工作态存在表述张力。
- **2026-10-19 用户确认：**业务输入限制在交互入口落实；例如 maxItems=5 时界面禁用添加按钮，不发出插入 Command。数据层不依据业务 Schema 拦截写入：若 Host 导入或程序写入第六项，只要操作结构可执行，就写入 Working Data，再由 Validation 报告超限并阻止提交。目标不是数组、位置非法等结构性错误仍须拒绝，不能与业务校验失败混为一类。该边界统一适用于插入、修改和导入，保留暂时业务不合法的工作态，不增加逐 Command 业务预校验或事务机制。
- **状态：**歧义已解释，L1 / L3 与 ADR-FE-006 已同步。数组数字 / 锚点双定位、移动最终下标及位置失效明确失败也已确认；OD-05 / T03 仍保留正式位置字段与结构错误编码，不再重复讨论业务限制是否由数据层拦截。

### REV-05：Host 校验器能力引用已明确 {#rev-05}

- **2026-10-20 用户确认：**规则与 Host Validator 使用独立名称，规则显式引用能力；相同语义可复用能力，规则 / Scope / 任务身份独立。开发端诊断缺失、用户端按用途降级，缺校验器不能视为通过。引用字段和 SDK 仍待固化。
- **状态：**原问题已解释，决策见 [ADR-FE-012](decisions/ADR-FE-012-host-output.md)，不表示 SDK 或生产实现完成。

### REV-06：Context 与完整校验证明的新鲜度缺少接入机制 {#rev-06}

- **双方与来源：**[现行 Context 只读 / Data-only Watch](l3-reactive-engine.md#l3-runtime-host-boundary)；[完整证明关联 Context](l3-validation.md#validation-async)。
- **类型 / 严重程度：**新鲜度接口缺口，中；两项原则可以共存，不构成扩展 Context Watch 的依据。
- **具体表现：**完整校验使用渠道或策略上下文后，Host 换入新上下文，旧证明怎样被识别为不可复用尚无 SDK。局部请求有效性与整体输入证明也须分别处理。
- **2026-10-22 已解决：**Host 显式替换只读 Context 快照并赋新身份，保守失效动态呈现、全部校验及旧外部任务资格；旧完整证明不代表新输入，重新校验走统一入口，不自动触发 Reaction。见 [ADR-FE-019](decisions/ADR-FE-019-host-context-replacement.md)。SDK / 通知及性能仍需整理验收，OD-09 / T02 / T05 不再重复讨论是否允许更新。

### REV-07：稳定旧值的数据防御契约已明确 {#rev-07}

- **原问题：**Host 修改传入或读出的共享对象可能绕过 Command，破坏旧快照和变化检测。
- **2026-10-20 用户确认：**外部输入的对象 / 数组值进入引擎时复制，解除 Host 原对象与内部数据的可变别名；内部以不可变 Root 和结构共享更新。read / snapshot 返回只读契约，不在生产环境为每次读取深拷贝或默认增加代理。开发环境递归冻结引擎持有的业务数据，捕获误写，不冻结 Host 原对象、Scope Index、Pending 或其他内部可变管理结构。Command 必须先构造修改路径上的新容器再写入，不能原地修改冻结的旧对象或数组；新数据发布前冻结，未变化且已保护的共享子树可复用。生产环境违反只读契约属于错误使用，不保证绕过 Command 修改后的状态正确。
- **状态：**防御策略已确认，实际别名隔离 / 冻结实现与目标端成本由 T04 验证，不宣称实现完成。细节见 [数据与比较](l3-data-scope.md#l3-observed-equality)、ADR-FE-007。

### REV-08：候选规范与样本之间有明确的未迁移边界 {#rev-08}

- **来源：**[短 ID 与 core.*](l2-preparation.md#l2-function-identity)、[runOnActivate 尚未定型](l1/04-command-reaction.md#reactions)、[前置和消息语法未发布](l3-validation.md#validation-layers)、[验证证据边界](../validation/README.md)。
- **类型 / 严重程度：**已知规范固化差异，中；本次不按正式发布后的兼容缺陷处理。
- **具体表现：**现有 Canonical 候选样本保留短函数名，类型汇编没有激活策略，候选 Schema 不支持 requires / validationMessages。通过现有探针不能证明新契约已覆盖。
- **解决方向（建议）：**正式固化时一次对齐类型、Schema、别名、正反例与版本说明；本次保留样本和边界说明。**需要决策：OD-06 / OD-07 / OD-11；迁移由 T03 / T06 验收。**

### REV-09：历史替代及同名概念不是现行冲突 {#rev-09}

| 表面不一致 | 审查判定与来源 | 是否重新决策 |
| --- | --- | --- |
| L1 不建全局 Scope Registry，L3 却有 Scope Index | 前者是词法 Binder，后者是实例位置登记；[L1](l1/02-data-reference-scope.md#scope-handle)已区分 | 否 |
| V0.6 自动 Baseline / Reset 重算与当前 Host 边界相反 | 有明确用户替代；[ADR-008](decisions/ADR-FE-008-host-editing.md)保留旧依据 | 否 |
| 旧 batch 失败不部分成功与当前非原子 batch 相反 | 已由 V0.4 / V0.5 明确替代；[ADR-006](decisions/ADR-FE-006-command-flush.md) | 否 |
| V0.4 局部 Health 与当前整体熔断相反 | V0.5 明确撤回 Health；[ADR-009](decisions/ADR-FE-009-errors-trace.md) | 否 |
| Schema 根全量与 Constraint 增量同时存在 | 不同校验域、不同成本；[校验入口](l3-validation.md#validation-pending) | 否 |
| UI 聚合 Issue 简化，但内部保留完备性 / 请求代次 | 显示消费与执行正确性不同；[校验结果](l3-validation.md#validation-results) | 否 |
| Prepared activation 与 runOnActivate 都含激活字样 | 前者说明观察生命周期归属，后者是首次执行策略；[计划边界](dependency-reactivity.md#dependency-plan) | 字段消歧归 OD-06 / OD-10，不重开职责 |

未发现必须新建 View Engine、Workflow Engine、校验结果总线或独立同步 Validator DSL 的证据。为填补以上缺口引入这些机制是新增设计提案，必须另作成本评估，不能当作文档整理。

### REV-10：业务输出转换归 Host 已明确 {#rev-10}

- **2026-10-20 用户确认：**引擎交付完整校验对应的 Working Data，Host 自行转换 / 检查业务输出并提交。表单业务所需正确数据直接在配置中表达，不新增引擎输出转换流水线；原跨层职责缺口已由 ADR-FE-012 解决。
- **状态：**原问题已解释，决策见 [ADR-FE-012](decisions/ADR-FE-012-host-output.md)，不表示 SDK 或生产实现完成。

## 增量维护与变更准入 {#governance-maintenance}

新资料到达后，先更新[来源清单与映射](source-map.md#incremental-coverage)，判断它是补充、明确替代、候选还是冲突，再更新所属规范、相邻图文、ADR 的状态 / 替代链及本篇受影响条目。重复数字须带来源命名空间，例如 `L2.D01`、`DEP.D01`、`V05.D01`；不得把历史待确认重新列为当前未决。

本次 ADR 采用 `ADR-FE-001` 起的独立命名空间，与历史规划中的 ADR-01 / ADR-07 无隐式替代关系。已有阶段 D / R / B / V 编号全部保留，ADR 只提取背景与取舍，完整执行规则不复制维护。问题关闭须给出确认依据、受影响规范、反例及结果；建议被采纳后才更新为已确认，不以文件保存或日期先后代替决策。

正式发布准入至少需要：相关 A / B 问题闭环；正式类型与 Schema 对齐；Prepared / SDK / Manifest / Lock 兼容约定明确；代表业务正反例及生命周期、异常、异步、跨端行为有实现证据。当前证据不足以给任何生产模块盖“验收完成”章；文档生成与候选探针的通过只证明其声明范围。
