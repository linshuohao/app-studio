---
id: GOV-FE-001
title: 设计进展与待讨论事项
type: governance
status: active
layer: 跨层
modules: []
tags: []
related:
  decisions:
  - ADR-FE-025
  - ADR-FE-024
  - ADR-FE-023
  - ADR-FE-021
  - ADR-FE-020
  - ADR-FE-018
  - ADR-FE-019
sources:
- SRC-PLATFORMMODULES
- SRC-PLATFORMRBAC
- SRC-OBSERVABILITY
- SRC-PLATFORMBLUEPRINT
- SRC-ASSETDESIGN
- SRC-DEVTOOLS
- SRC-RUNTIMEIMPLEMENTATION
- SRC-WORKFLOWS
- SRC-REACTIONSTATE
- SRC-L3BASELINE
- SRC-COMPILERIOTYPES
- SRC-COMPILERIO
- SRC-PROTOCOLIMPLEMENTATION
- SRC-PROTOCOLBASELINE
- SRC-REVIEW
navigation:
  group: 08 · 继续设计
  order: 90
last_reviewed: '2026-11-08'
status_note: 审查记录与建议，非新增架构决策
module_layers:
  M01: 系统
  M02: L1
  M03: L1
  M04: L1
  M05: L2
  M06: 平台
  M07: L3
  M08: L3
  M09: L3
  M10: L3
  M11: L3
  M12: L3
  M13: L3
  M14: L4
  M15: Host
  M16: Tooling
  M17: Tooling
  M18: 平台
  M19: Studio
---

# 设计进展与待讨论事项

这里维护“哪些设计尚未完成、接下来讨论什么”。下方列出已有基础与缺口；建议顺序不是已批准的新架构方案。历史取舍另见[决策与讨论演进](design-history.md)。

## 按层看进展与讨论入口 {#layer-progress}

2026-11-22 已确认[可视化编辑的职责边界](platform-studio.md#studio-visual-editing-boundary)：基本信息由编辑器外部承接。数据模型、布局、联动与自定义校验按专题进入详细设计，四个 Tab 仍为候选。[数据模型首期可视化](platform-studio.md#studio-data-model-visual)已确认，可独立实施。[布局可视化编辑](platform-studio.md#studio-layout-visual)已接入工作版本的配置页，共享 JSON 草稿、撤销、检查和保存；本地验收见布局专题。[定义级联动编辑](platform-studio.md#studio-reaction-visual)已接入工作版本，已在 Studio 受控预览验证显式观察与双成员写回。[自定义校验可视化编辑](platform-studio.md#studio-constraint-visual)已复核，进入独立实施交接。生产交付状态以各实施任务的验收为准。

2026-11-22 已确认[Studio 七项工作台能力与交付顺序](platform-studio.md#studio-authoring-expansion)。第一批配置对比已接入编辑、历史与发布确认，并在隔离 PostgreSQL 环境通过 Chrome 流程。第二批本机草稿恢复已接入 IndexedDB。Chrome 已验证刷新、独立标签页、显式退出清理、冻结保存重试及 375 像素宽的版本对比。第三批目录插入配置已接入编辑工作台。Chrome 已验证远程搜索的绑定与 Host 映射、纯函数的声明参数顺序、插入前预览、单步撤销和窄屏操作，正式保存与发布仍由用户触发。第四批 Host 接入诊断已接入精确发布与示例 Host，Chrome 已验证正常装载、缺少能力、内容摘要不符与函数版本不匹配。第五批表单语义编辑已接入配置工作台，与 JSON 视图共用草稿和撤销记录。第六批已接入工程模板创建与独立测试场景。团队场景在 PostgreSQL 单独维护修订，草稿与历史配置都可使用模拟 Host 运行。第七批操作记录查询已接入表单、成员与账号安全入口，按权限读取已有持久化事实；同名发布通过精确 ID 关联配置与发布详情。

设计基线 d2b1598，资产设计提交 fd96b3c：L1–L3 核心、React L4 本期开发 / review / 修复及独立 DevTools 已有本地证据；首批资产设计于 2026-10-27 确认，2026-10-28 工具第 0 批及 text.isNonBlank 试点已有[实施证据](engineering.md#asset-tooling-implementation)，首批全部 14 个 UI 物料、7 个业务函数与完整可控目标表单已本地交付，见[业务纵切证据](engineering.md#business-travel-implementation)。2026-10-31 当前批次已补齐独立审查、缺陷修复与本地门禁，见[批次收口证据](engineering.md#assets-batch-closure)。真实 Host、全端和生产性能仍待验收。Platform / Studio 的候选产品方案不因本期资产工具确认而自动转为已确认。

| 范围 | 目前能读到什么 | 接下来需要讨论什么 | 问题与交付入口 |
| --- | --- | --- | --- |
| L1 · 协议 | 数据、引用、规则、视图与生命周期的主体语义 | 位置命令、严格 Union、内置签名、Manifest / 类型兼容 | OD-05 / 06 / 11；T03 |
| L2 · 预处理 | 已确认输入输出和本期 Compiler 完整设计；协议类型 / Schema 已同步 | 编译主链与 TS / React 消费已实现；完整基准待验收，平台完整报告待实现 | OD-08 / 10 / 11；T06 |
| L3 · 数据与执行 | 整体领域骨架、不可变数据 / Scope、Watch、同轮 Flush 与当前轮熔断 | SDK、快照 / 身份及新触发已实现；整体成本与生产预算待验收 | OD-03 / 04 / 06 / 07；T02 / T04 |
| L3 · 校验 | Flush 后统一内外校验、同步前置、异步有效性、完整结果语义与 Context 替换 | 实例绑定、资格撤销、Issue / 完整结果已实现；真实 Host 提交待接入 | OD-01 / 02 / 09 / 12 / 14；T01 / T05 |
| L4 · 呈现 | React SDK / 共用 Adapter 与四批本地主端证据；正式资产完整设计已确认 | 工具、首批全部资产与完整可控表单已本地交付，继续真实 Host、其他端及性能验收 | OD-13 / 15；T11 → T07；[资产方案](extension-integration.md#first-assets) |
| Platform | 通用动态表单平台定位、环节—页面—模型组织及基础管理范围已确认 | 具体模型、权限、交付操作及 API；MVP 范围已确认，新增目录与成员管理待交付 | OD-16；T09 |
| Studio | 作者场景、页面职责及先 P1 / P2 的设计顺序已确认 | 表单管理、工作台交互与编辑 / 保存 / 预览契约 | OD-17；T10 |

2026-10-31 状态核对以 `fd96b3c` 加当前未提交工作区为基线，对照源码、现有测试与[工程实施记录](engineering.md#business-travel-implementation)，本轮只同步文档，不重新执行业务测试。本文中：**已实现**表示已有实际代码；**待实现**表示能力尚未落地；**待验收**表示已有实现但相应场景 / 环境的证据不足。设计状态“部分完成”不等于该模块尚无代码；历史批次记录仅描述当时范围。

| 已实现范围 | 源码与可复核测试 | 既有验证证据 / 剩余范围 |
| --- | --- | --- |
| 协议、Compiler 与 Prepared /2 | packages/protocol/src；packages/compiler/src；Compiler pipeline / analysis / rules / view tests | [编译记录](engineering.md#compiler-static-analysis)；完整复杂度 / 体积基准待验收，平台报告 / 增量编译待实现 |
| 数据、相对 Scope 索引、旧快照与 Command | packages/runtime/src/data、scope、commands；data / commands / scope-index tests | [索引实施](l3-data-scope.md#l3-scope-index)与 [Runtime 记录](l3-reactive-engine.md#runtime-implementation)；整体编辑成本与目标设备待验收 |
| 联动、校验前置、异步有效性与完整结果 | runtime.ts、reactions、validation；reaction / validation / validation-queue / lifecycle tests | [L4 联验](engineering.md#renderer-implementation)与[完整表单](engineering.md#business-travel-implementation)；真实业务服务待接入 |
| React Adapter、请求、Profile 与首批资产 | packages/renderer-react、materials-react、pure-functions；tests/integration/*session.test.ts 与 tests/e2e | [资产批次记录](engineering.md#business-travel-implementation)；真实 Host 待实现，其他端待实现，生产性能待验收 |
| 独立 DevTools 与资产工具 | packages/devtools；tools/engineering/assets；工具 / 扩展测试 | [DevTools](engineering.md#devtools-implementation)、[资产工具](engineering.md#asset-tooling-implementation)；外部发布未启用，远端 CI 待验收 |

## 下一次讨论从哪里开始 {#next-discussion}

当前下一步为[首批资产后的真实 Host](extension-integration.md#first-assets-delivery)：工具、全部 14 个物料 / 7 个业务函数与完整可控目标表单已有[本地证据](engineering.md#business-travel-implementation)。需先明确真实查询 / 核保 / 费率 / 持久化 / 提交的服务契约和业务适用性，再装配实际应用。业务假设限定可控验收，真实服务和产品规则另承接。以下较早日期的推进记录保留为来源依据，不替代本段当前顺序。

2026-10-22 用户已确认 [L3 整体领域骨架](l3-reactive-engine.md#l3-domain-model)、Flush 后统一内外校验、当前轮熔断清队列 / 后续新触发正常执行，以及 Host 显式替换 Context 的保守整体失效。2026-10-23 进一步授权按初始化、编辑传播、校验结果反馈、成功 / 失败四类场景先写用例再实现，以总图及局部图审查；[本批实现与 Review 入口](l3-reactive-engine.md#runtime-implementation)已有无界面核心代码和真实 Compiler 消费用例。下一步按该入口 review SDK 草案及实际路径，继续 Adapter / UI 接入与性能验证，不重复讨论命名和常规容器。后续 I06 的 TS / React Adapter 与浏览器纵切已有本地证据；I05 完整基准、真实 Host、跨端及公开 SDK 发布验收仍保留。

2026-10-19 已确认可推导校验依赖由 L2 补全、后置入队递归补齐前置（见 [讨论记录](design-history.md#validation-prerequisite-update)）。同日后续确认 Reaction 错误不自动阻止提交；当时持续暂停方案已由 2026-10-22 当前轮停止 / 后续新触发正常执行替代，仍保留填写与独立完整校验（见[本轮记录](design-history.md#l3-domain-baseline-confirmed)）。跨 Reaction 不声明业务顺序与 Host 自主管理异步任务也已确认。同步回调写回归当前 Flush、沿用去重与预算也已确认，不再作为待决策行为；具体实现需验收；T01 继续固化引用、实例绑定及资格契约；L1 的独立固化工作 T03 可并行。Platform / Studio 可以先各自澄清目标与范围，不需要等核心全部实现，但完整接口要等相关消费契约明确后再定。

每次讨论只选择一个明确问题，记录已有约束、仍可比较的方案、要验证的反例与预期输出。获得明确共识后回写所属设计；未得出结论就继续保留为待讨论，不按讨论轮次创建“新版本”。

## 纵向与横向完整性矩阵 {#design-status}

以下为基于正文与附件的**审查判断**；本期受影响的资产 / L4 / 工具行已按 2026-10-27 方案确认更新，其余历史限制按各主题实际证据读取。模块 ID 用于检索，不宣称对应代码包已存在。“可开始”仅针对所列范围；现有本地核心和 React / DevTools 证据不替代正式物料与真实 Host 的生产验收。阅读状态“已完成”只对应该行所限定的职责范围：M01 为分层责任、M17 为现有文档 / 候选工具，不表示整个引擎已经完成。“存在阻塞”表示相关公共行为仍需前置决策；其余主体已明确但契约未全闭环的行列为“部分完成”。

| 模块 ID / 范围 | 阅读状态 | 已确定内容及依据 | 尚未确定 / 阻塞项 | 设计闭环判断 | 可进入的工作 |
| --- | --- | --- | --- | --- | --- |
| M01 全局分层 | 已完成 | [四层与 Host / 扩展责任](architecture.md#architecture) | 不要求先决定物理包或部署 | 架构责任闭环；不等于每层契约闭环 | 可作为后续设计和包边界约束 |
| M02 L1 数据 / 引用 / 词法 Scope | 部分完成 | [结构化引用、局部 Binder、Missing / null](l1/02-data-reference-scope.md#reference) | 严格结构与可证明兼容策略已确认；Union 形状、存在性与兼容子集；OD-05 / 06 / 11 | 主体语义收敛，正式规范未闭环 | 可固化类型 / 反例；不标正式协议可发布 |
| M03 Expression / Pure Function | 部分完成 | [签名与求值](l1/03-expression-validation.md#function-evaluation-contract)、现有 core 实现及[七个业务函数设计](extension-integration.md#first-assets-functions) | 跨端与真实领域规则待验证 | TS 核心及全部 7 个业务函数已有[本地实现 / 正反例](engineering.md#business-travel-implementation) | 随真实 Host 验证，不重开 Missing / 短路原则 |
| M04 L1 View / Template / Binding | 部分完成 | [三类节点与端口](l1/05-view-material-host.md#view)、React 消费及[14 个物料契约](extension-integration.md#first-assets-materials) | 真实 Host 组合；Binding 漏映射沿现有边界 | 全部 14 个物料及完整可控目标表单已有[源码 / UI / 打包证据](engineering.md#business-travel-implementation) | 随真实 Host，沿已有 Compiler / Runtime 验证 |
| M05 L2 编译与诊断 | 部分完成 | [本期完整设计](l2/compiler.md)、四职责组 / 六阶段 / 检查策略与 SDK 已确认；协议类型已迁移 | I01–I04 编译主链、共享表达式依赖与 watch、规则 / 模板 / 交互已接入；TS / React 本地消费已联验；完整基准待验收，Context 类型证据 / 后期报告格式保留 | 本期模块设计已收敛；静态准备不等于 Runtime 性能或整体发布通过 | 已有真实依赖生成与规则 / 视图回归；继续 I05 完整基准与 I06 真实 Host / 跨端验收 |
| M06 能力与发布治理 | 部分完成 | [确定锁与双摘要](l2-preparation.md#capability-digest-contract)、[单资产 / 包版本与 Changesets 编排](engineering.md#asset-tooling)已确认 | 真实制品留存 / 发布平台另验收，远端 CI 待运行 | 工具第 0 批已有本地生成、声明、计划 / 应用反例及打包证据，真实仓库尚未应用版本 | 工具支撑资产后续批次，不自动迁移 core 版本或改变旧 Release |
| M07 数据 / Snapshot | 部分完成 | [即时不可变 Root、稳定读](l3-data-scope.md#l3-data) | 输入复制 / 读取只读 / 开发冻结已确认；Missing、snapshot SDK 与实际成本；OD-06 | 不变量明确，接入细节部分闭环 | 可验证结构共享、旧快照；不作稳定 SDK 承诺 |
| M08 Scope / 变化索引 | 部分完成 | [逐 Command 比较、相对位置](l3-data-scope.md#l3-change-detection)；[数组 + 哈希容器已确认](l3-data-scope.md#l3-scope-index) | 相对索引、旧位置视图、整数组替换重建已实现；整体编辑链 / 设备性能待验收；OD-07 | 相对索引 / 身份 / 观察已有源码及 scope-index 回归；不外推整条链路性能 | 保留增量维护和旧视图回归，测量整体成本；不将推荐 Trie 当作未完成契约 |
| M09 Reaction / Flush / 错误 | 部分完成 | [整体领域骨架与正常 Flush](l3-reactive-engine.md#l3-domain-model)、错误隔离、当前轮熔断清队列 / 新触发已确认 | 队列、FlushOutcome / flush、同轮保护与清理已实现；生产预算待标定；OD-03 / 04 | 核心行为已有实现与本地证据，正式发布 / 生产验收未完成 | 保留旧任务不续跑、新有效失效建轮及独立完整校验回归，继续生产验收 |
| M10 Schema Adapter | 部分完成 | [完整只读 Schema](l3-validation.md#validation-schema) | Draft / 关键词 / format / Dart 等价与性能；OD-11 | 方向明确，跨端契约未闭环 | 可验证 Adapter；没有跨端通过证据 |
| M11 Constraint 前置与增量 | 部分完成 | [同步资格、唯一实例与共同入队](l3-validation.md#prerequisite-scope-contract)、L2 有效 watch / requires 已确认 | Runtime 具体实例绑定、资格撤销 / 通知与 React 消费已实现；跨端 / 真实业务待验收；OD-01 / 02 | 已有 Compiler / Runtime 前置实现与本地反例；不重开已确认原则 | 保持前置传递、兄弟隔离及在途资格撤销回归，继续真实 Host 验收 |
| M12 异步校验 / Issues | 部分完成 | [有效性保护、来源与字段聚合](l3-validation.md#validation-results) | Source / Issue、任务代次、通知 / 前置撤销已实现；真实服务与生产成本待验收；OD-02 / 09 / 12 | 当前 SDK 与乱序 / 取消 / 来源隔离已有本地证据，跨端未验收 | 沿现有实现继续真实 Host 和跨端验收，不重建原型 |
| M13 完整校验 / Submit 交接 | 部分完成 | [四类结果语义与信息结构](l3-validation.md#validation-result-contract)、全适用等待、Reaction / Submit 分离及 Context 身份已确认 | 具体结果 SDK、覆盖 / 任务交接、快照证明与 Host 实际联验；OD-03 / 09 / 12 / 14 | 核心语义及 SDK 已有本地证据；完整表单[覆盖 stale / incomplete / 快照交付](engineering.md#business-travel-implementation)，未完成生产验收 | Host 真实提交 / 输出转换另实现 |
| M14 L4 / Material Adapter | 部分完成 | [React SDK 与四批证据](l4-renderer.md#react-implementation)、[首批正式资产](extension-integration.md#first-assets)已确认 | 真实 Host、其他端和生产性能未完成 | TS / React 本期闭环；工具、全部资产和完整可控表单本地已交付 | 真实 Host |
| M15 Host / 实例生命周期 | 部分完成 | [三路径](extension-integration.md#capabilities)、现有 SDK / 可控 Host 及[真实装配路线](extension-integration.md#first-assets-delivery) | 真实查询、核保、费率、持久化、输出 / 提交及业务恢复验收 | 完整可控表单[已有联验](engineering.md#business-travel-implementation)，不等于真实应用完成 | 接真实契约，不新增 host-sdk |
| M16 Trace / Devtools | 部分完成 | [独立工具边界](l3-observability.md#independent-devtools)及[通用观测契约](l3-observability.md#observation-contract)已确认；首期有[本地扩展证据](engineering.md#devtools-implementation) | Web 新目录 / 快照增量 / 因果上报与四视图已本地实现；跨端与生产阈值待验收；自动重放不在本次承诺内 | 三原则及数据语义已收敛，不代表完整能力已实现 | 按 [OBS-0 至 OBS-4](l3-observability.md#observation-delivery)记录本地交付；不以 Web 验收替代跨端生产验收 |
| M17 文档与候选验证工具 | 已完成 | [复现入口和明确证据边界](../validation/README.md#reproduce) | 不覆盖 Prepared / 真正 Runtime / 跨端 | 已有可执行工具；覆盖范围有限 | 可继续维护和复跑，结果不能外推生产能力 |
| M18 Platform 整体平台 | 部分完成 | [产品蓝图组织与基础管理范围](platform-studio.md#platform-blueprint)已确认 | 身份接入、权限实现、制品装载、API 与存储；最小 MVP 已确认；OD-16 | 蓝图已有，新增契约未闭环 | 现有交付链路已有局部证据；补齐最小能力目录与成员角色管理 API；见 MVP 补齐任务；T09 |
| M19 Studio 创作工具 | 部分完成 | [业务页面职责组织](platform-studio.md#blueprint-pages)已确认，具体页面候选 | P1 / P2 具体交互和预览适配；追加配置版本与历史编辑已确认；[Studio UI 契约](platform-studio.md#studio-ui-contract)已确认，样板、组件迁移与验收待实施；OD-17 | 组织确认不等于页面设计完成 | Admin 设计稿、目录页面、成员角色管理及表单工作台补齐；见 MVP 补齐任务；T10 |

横向检查覆盖以下接缝：L1→L2 语义与类型（M02–M06）；L2→L3 静态计划 / ABI（M05、M08、M09）；Data↔Scope 一致性（M07–M08）；Reaction→Validation→Host 完成（M09–M13）；Runtime↔L4 快照和订阅（M12–M15）；生命周期与异步适用性（M08、M12、M15）；锁定、Trace 与源位置（M06、M16）。性能 / 测试 / 观测 / 安全已有目标与责任说明，尚无足以证明目标端性能或完整隔离的实现结果。

## 待决策与契约整理事项 {#open-decisions}

L3 首期核心取舍已按本轮确认收敛，以下保留稳定 OD 编号供追溯与实施对照；标明已确认的行仅剩契约整理 / 验收，不要求逐项重开用户决策。Platform / Studio 等尚未展开主题保持原状态。

OD 是本次建立的跨主题问题编号。以下选项只有明确注明“来源候选”的才代表原资料讨论；其余均为**新增分析建议**。本表只索引未知项，最终结论应回写对应专题和 ADR，不在这里维护第二套规范。

| ID / 类别 | 具体问题与已有基础 | 可比较方向与当前状态 | 依赖 / 影响 / 下一步 |
| --- | --- | --- | --- |
| OD-01 / A | 增量缺少前置如何处理？已有本轮链 / Pending | 已确认：L2 补全可推导依赖；后置初始入队时递归补齐前置，按本轮结论执行，不复用旧通过结果 | 前置：G05 / G11；影响 M05 / 11 / 13；落实 REV-01 共同入队案例与实例绑定，T01 |
| OD-02 / A | 字段有效性前置范围、跨 Scope 引用与跨轮资格失效 | 依赖传递已确认，不建结果 PubSub；字段有效已确认是前置完成且字段无错误，不要求作者区分来源；字段 / 规则引用、Scope ID 唯一实例及首期只等待同步前置已确认，不增加集合 or / any；字段资格已收敛为 Schema + 相关适用 Internal 的同步资格；引用类型与异步撤销按完整基线实施，不隐含通用异步 DAG | 依赖 OD-01；影响 M08 / 11 / 12；推演 REV-02，T01 |
| OD-03 / B | 当前轮熔断后的 Pending / 新触发与独立校验 | 已解决行为选择：停止当前 Flush、清空剩余 Reaction，旧任务不自动续跑；下一次新有效触发正常建轮及预算，不要求显式恢复。保留填写 / 快照 / 独立完整校验，Reaction 错误不直接阻止提交；ADR-FE-018 | M09 / 13 / 15；T02 已实现 Outcome / 清理与等待 SDK，保留 C16 / C17 回归并推进生产验收 |
| OD-04 / A | 同步通知重入、执行顺序和运行中再次失效 | 已确认不增加 Reaction 前后依赖 / 业务优先级，业务不依赖跨规则顺序；稳定队列为复现用途，同步回调写回直接归当前轮，沿用去重与预算，不新增通知队列；内部队列与同轮回归已有本地证据，生产预算待验收 | 前置：G06 / G07；影响 M09 / 14 / 16；用 C16 验证已确认的同轮写回与预算不重置；同目标覆盖先审查业务建模，T02 |
| OD-05 / B | array.insert / move 位置与结构错误分类 | 已确认业务限制归交互入口，数据层不做业务 Schema 拦截，REV-04 已解释；数字 / 锚点双定位、移动最终下标、位置失效明确失败已确认；ArrayPosition / Union 与结构错误 SDK 已实现；发布兼容承诺待验收，不增加新命令 | 前置：G02 / G06；影响 M02 / 08 / 09；T03 |
| OD-06 / B | 新实例激活默认值、创建 / 替换 / 销毁及稳定快照 SDK | 首次可配置、仅新实例且默认不执行已确认；正式字段、错误和持有语义未定；输入复制、读取只读约定、开发冻结已确认；防御实现与性能待验证 | 前置：G09；影响 M07 / 09 / 15；T03 / T04 |
| OD-07 / B | 观察等值 / Missing / 结构编码及整数组身份策略 | 已确认整数组替换即重建，即使成员数据相同也不复用身份；按观察位置比较已确认，TS Object.is 与局部旧 ScopeReadView 已实现；跨端等价待验收，Trie 仍为实现候选，不直接成为 ABI | 依赖 OD-05 / 06；影响 M05 / 08 / 12 / 14；T04 |
| OD-08 / B | External 到 Host 能力映射、输入报告与缺失等级 | 已确认独立能力名称、规则显式引用，缺失按用途降级、开发端诊断且用户端不暴露技术错误；缺校验器不算通过。输入已确认本次调用快照 + Scope + watch、不加参数映射；引用字段与 HostCapabilities / ValidatorTask 已实现，真实服务待接入，见 ADR-FE-012 | 依赖 G01 / G12；影响 M05 / 06 / 12 / 15；T05 |
| OD-09 / B | 局部异步结果与完整证明如何关联 Data / Context / 实例 | 已确认全适用异步等待、任务代次与可选 cancel；新增 Host 显式替换 Context、保守撤销旧任务 / 来源并重新校验，完整证明关联 Context 身份；ADR-FE-019。Data 局部变化仍按独立任务依赖处理 | M12 / 13 / 15；T02 / T05 已实现具体 SDK / 取消 / 过期返回，继续真实业务验收，不再重开 Context 是否可更新 |
| OD-10 / B | Prepared ABI、版本兼容、求值 / 订阅 / 首次读与改绑交接 | 已确认 JSON、首阶段格式精确匹配、Error 无执行制品且编辑分析可返回；保留领域结构、共享模板、完整表达式级就地 watch、默认输入和资源闭包；外部一次装载检查保持；类型 / Schema 已迁移，本期详细设计与目标 SDK 已确认，编译算法与 TS / React 消费联验已实现；完整基准及跨端待验收 | 依赖 T01–T05 的最小消费契约；影响 M05 / 06 / 14；T06 / T07 |
| OD-11 / B | 正式类型 / Schema、内置签名别名、Manifest / 锁 / Schema Adapter 等价范围 | 已确认未知字段拒绝、保留标记须转义、静态连接无法证明兼容即拒绝；已确认 Binding 类型 Schema 且不区分读写、Slot 只声明名称、Event Payload 契约；原生 TS + JSDoc 为源、生成 Schema、Compiler 使用 Ajv；常用结构兼容子集、Schema 签名、有限内置短路与双摘要已确认；首批类型与生成适配已实现并有结构验收；具体内置签名 / 类型连接算法已有所属包实现与本地回归，不宣称已有发布版本或 Dart 工具选型 | 依赖 M02–M06 / M10；影响全层；T03 / T06 / T08 |
| OD-12 / B | Issue、完整结果、Source 通知和 Trace 事件最小公共结构 | 消息已确认局部 / Schema 声明位置覆盖与 Host 资源解析；既有完整异常输入 / 定位、完整校验关联和首期只读 API 已实现；新增[通用观测语义及三个原则](l3-observability.md#observation-contract)已确认。详细接口与直接破坏性升级已确认，目标 DTO / 同步迁移与生产者上报已本地交付，持久化介质 / 发送批次属实现选择；记录保留策略、脱敏与生产容量仍待固化 / 验收，不以辅助摘要替代异常现场 | 依赖 OD-03 / 04 / 09；影响 M05 / 08 / 09 / 12 / 13 / 14 / 16；T05 / T07 / T08，实施按 OBS-0 至 OBS-4 |
| OD-13 / B | 输入解析失败、组合端口、UI 临时值的交付边界 | 已确认普通输入含非法工作值写入 Runtime，确认型交互内部管理，编辑结束展示 Runtime；不增临时数据层 / Codec 生命周期，首批物料本地接入已有证据；真实 Host 与跨端验收待完成 | 依赖 OD-10 / 11；影响 M02 / 07 / 14；正式资产交互已确认，按[输入契约](extension-integration.md#first-assets-input)实施及验收，T07 |
| OD-14 / B | Normalized Output 的转换归属、类型、验证和失败 / 新鲜度 | 已解决归属：转换 / 输出检查全部归 Host，引擎只交付已校验数据快照，不新增核心输出流水线，见 ADR-FE-012 | 依赖 OD-09 / 11 / 13 的相关输入约束；影响 M02 / 13 / 15；REV-10 已解释；Host 自行定义请求契约，T05 仅保留校验数据交付 SDK |
| OD-15 / B | L4 如何从已有边界推进为完整模块设计？ | 完整 React SDK、模块与四批交付已确认，见 ADR-FE-022；FormRenderer / 共用 Hook、请求、Runtime 消费接口及本地主端验证已有实现；首批正式物料与可控 Host 已本地交付；真实 Host 应用与其他端仍待推进 | M14；T11 本专题收敛，T07 已有正式资产与完整可控表单纵切，后续真实应用接入 |
| OD-16 / B | Platform 具体模型、基础权限、发布接入与 MVP 如何设计？ | [蓝图组织](platform-studio.md#platform-blueprint)与用户权限纳入范围已确认，创作模型与最小 MVP 已收敛，接口待细化；[单团队 RBAC](platform-studio.md#platform-rbac)已确认 | DDD 模块化单体及[最小 MVP](platform-studio.md#platform-authoring-mvp)已确认；旧 P2–P4 由保存追加修订、直接发布、精确 releaseId 消费承接；继续 API / 存储 / 装载；M18；T09 |
| OD-17 / B | 表单管理与工作台怎样组织编辑、保存、检查和预览？ | 列表 / 工作台组织、逐次保存配置版本与历史编辑已确认；具体界面与 API 未落地 | 细化 P1 / P2 状态、失败反馈与预览适配；不重开保存语义，不做实时协作；M19；T10 |


A 表示应先解决的跨模块架构行为；B 表示方向明确但需模块设计。C 类为可推迟的实现选择：局部旧视图物理表示、索引缓存、预算阈值与限频常数；对外可观察行为仍须先定。D 类为未来扩展：独立于整数组替换的业务差量协调（如将来需要须另议）、时间切片 / 优先级、历史恢复 / 确定性 Replay、局部 Hash 与物料市场。Studio 的目标与最小范围单独纳入 T10，并不预设必须建设完整拖拽或多人协作系统。除非出现证据，不把 D 升为当前阻塞。

## 按依赖推进的设计路线 {#design-roadmap}

下面的顺序、任务 ID 和优先级是**审查建议**，承接[原有完整路线](design-history.md#roadmap)。并行箭头表示设计可互相验证，不要求完成整层代码才讨论下层。

```diagram
{
  "id": "figure-governance-roadmap",
  "title": "建议设计顺序：先闭合行为，再冻结接口与验证实现",
  "rows": [
    [
      {
        "title": "T01 · 校验前置闭环",
        "body": "同步资格 / 唯一实例与共同入队已实现；真实服务待验收；OD-01 / 02"
      },
      {
        "title": "T03 · L1 与生命周期固化",
        "body": "命令、激活、Union / 内置已有类型与实现；发布兼容待验收"
      }
    ],
    [
      {
        "title": "T02 · Flush / 完整校验完成",
        "body": "Pending、重入、Outcome 与完整校验已实现；真实 Submit 待接入"
      },
      {
        "title": "T04 · Data / Scope 观察验证",
        "body": "等值、替换、旧位置、快照防御；承接 T03"
      }
    ],
    [
      {
        "title": "T05 · Host / 结果接入",
        "body": "能力映射、代次、Issue、输入证明已实现；真实服务待接入"
      }
    ],
    [
      {
        "title": "T06 · 最小 Prepared 与发布契约",
        "body": "联验消费结构、兼容与锁；以 T01–T05 为输入"
      }
    ],
    [
      {
        "title": "T11 · L4 完整模块设计",
        "body": "React SDK / Binding / Scope / 请求及失败隔离已实现；其他端待实现"
      }
    ],
    [
      {
        "title": "T07 · 主端纵切验证",
        "body": "首批全部资产与可控表单已本地联验；真实 Host 待接入"
      }
    ],
    [
      {
        "title": "T08 · 跨端 / 性能 / 发布验收",
        "body": "Golden Tests、真实设备成本、Trace、兼容迁移"
      }
    ]
  ],
  "arrows": [
    "↓ 相关行为交叉验证",
    "↓",
    "↓",
    "↓",
    "↓",
    "↓"
  ],
  "note": "先定义契约再实现；T03 的独立规范工作可与 T01 并行。预算常数、缓存和数据结构在原型中标定，候选验证通过不代替生产验收。"
}
```

平台与 Studio 的范围讨论与核心行为线并行，具体接口需与消费契约对齐。

```diagram
{
  "id": "figure-platform-studio-roadmap",
  "title": "并行设计线：Platform 范围 → Studio 创作流程",
  "flow": true,
  "rows": [
    [
      {
        "title": "T09 · Platform 最小范围",
        "body": "用户、资产与发布流程、职责边界、候选模块与未知项"
      },
      {
        "title": "T10 · Studio 创作流程",
        "body": "沿平台范围和 L1 / L2 边界，明确编辑、诊断、预览、保存与验收"
      }
    ]
  ],
  "note": "这条范围讨论线现在即可开始，不等待核心 T08 完成；完整接口再与相关核心契约对齐。不预设完整拖拽或多人协作系统。"
}
```

| 任务 / 优先级 / 分类 | 具体问题、现有基础与尚未知内容 | 前置依赖 / 影响 | 下一步、预期输出和完成标准 |
| --- | --- | --- | --- |
| T01 / 最高 / A | 已确认依赖补全 / 共同入队、同步字段资格与 Scope 唯一实例；引用类型、具体实例与异步资格交接已实现，真实业务待验收 | G05 / G11；M05 / 11 / 12 / 13 | 按已确认策略推演 A(idNumber)、B(name)及在途返回；输出依赖推导 / 传递、前置引用与实例绑定契约；V10–V13、递归补齐 / 环 / 兄弟 Scope / 资格撤销均有确定结果；Reaction 显式 Watch 不变 |
| T02 / 最高 / A | 已确认错误隔离、当前轮熔断清队列 / 新触发、独立校验及 Context 替换；已有 FlushOutcome / 完整校验 / Context 实现，剩余为生产验收与发布契约整理 | T01 的校验完成语义；M09 / 13 / 15 / 16 | 输出 Outcome / 等待 / 清理接口和错误分类；C16 同轮预算、C17 旧队列不自重试 / 新有效失效建轮、独立完整校验可提交；Context 替换使旧证明 / 任务失效，无 Reaction 时独立校验 |
| T03 / 高 / B | 三领域类型、JSDoc、10 个派生 Schema 根及结构 / 包消费正反例已实现；后续随 Compiler 消费联验，不逐字段重开讨论 | G02 / G03 / G09；与 T01 并行，M02–M04 / 15 | 输出无占位类型 / 候选 Schema、别名 / Literal / Binder / Manifest 契约；第六项插入允许写入并报校验错误已确认；数字 / 锚点、最终下标及位置失效报错已确认；字段与结构错误 SDK 已实现，继续保持类型 / Schema / 正反例互相对应，新激活仅新实例 |
| T04 / 高 / B+C | 逐 Command 前后比较、相对位置及数组 + 哈希容器已确认；增量索引、旧视图和输入防御已实现；整体成本待测量 | T03 相关命令和生命周期；M07 / 08 / 12 / 14 | 已有观察 / 身份实现与 scope-index 回归，继续生产成本验收；01–16 与 B01–B08 对应稳定行为，连续 move/remove/insert 无串项，旧 snapshot 不变；Trie / 旧视图存法依据测量选定 |
| T05 / 高 / B | 已有 Host 三路径与来源 / 字段聚合；能力名称 / 降级 / Host 输出归属已确认；请求 / 结果 SDK、Context 证明已实现；真实 Host 输出与业务恢复待接入 | T01 / T02 相关行为、T03 能力契约；与 T07 的输入边界交叉验证；M06 / 12 / 13 / 15 | 输出 Requirements / 注册 / token / Issue / 完整结果及已校验数据快照交付契约；相同能力多规则、A→B→A、无关字段变化、销毁后成功与异常、缺必需能力、输入过期、转换失败均有验收，表单校验证明对应交付数据，Host 输出检查不混入引擎证明 |
| T06 / 高 / B | 两份结构 / 独立 ABI 保留；ADR-FE-017 输入输出和协议类型 / Schema 已同步：领域结构、模板共享、精确表达式 watch、默认入口；本期 Compiler 模块 / 校验策略与目标 SDK 已确认，按 I01–I06 实施；2026-10-27 已确认成功产物深度只读及受控验证复用，生产性能仍待 T08 | T01–T05 最小消费需求；M05 / 06 / 14 | 输出可序列化 Prepared / Format 精确匹配契约、能力锁、诊断及来源关联；同锁定输入可复现、多实例隔离、Profile 不裁剪共享规则、不兼容拒绝且不回退 L1 |
| T11 / 高 / B | L4 SDK / 四批 TS React 实现已有本地证据，本专题收敛；正式资产设计于 2026-10-27 确认 | 既有 Runtime / Compiler 消费接缝；M14 | SDK 后续回归沿现有测试；资产实施交 T07，首批正式物料已实现，真实 Host 待接入，不重标为 SDK 待设计 |
| T07 / 中 / B | React SDK / 夹具纵切已有证据；正式资产与工程工具设计已确认 | T02 / T04 / T05 / T06 / T11 的已有消费接缝；M03 / M04 / M06 / M07–M15 | 工具 0、全部 14 个物料 / 7 个函数与[完整可控表单](engineering.md#business-travel-implementation)已有本地证据，继续[真实 Host](extension-integration.md#first-assets-delivery)；覆盖非法输入、确认、成员、请求、试算、完整校验和失败轨迹 |
| T08 / 中 / C，部分 B | 已有边界验收和性能目标；通用观测契约已确认，未知为跨端等价、真实性能 / 发布门槛 | T07；全层 | 观测增量按 [OBS-0 至 OBS-4](l3-observability.md#observation-delivery)准备，核心接缝可独立推进；输出 Web / Dart 共享向量、目标设备基准、Trace 截断 / 脱敏契约、迁移 / 回滚验证；V01–V16、C01–C18及跨层场景有实现证据，阈值有测量依据；未达成项继续公开，不假定全部模块可发布 |
| T09 / 高 / B | Platform 蓝图与最小创作 MVP 已确认；交付接口及基础接入待细化 | G01 / G12；与 T10 的表单管理协同，M18 | RBAC、DDD 模块化单体、配置版本追加与 releaseId 在线消费已确认；补齐 API、存储、身份及制品加载契约和纵切验收；文档确认不作编码授权 |
| T10 / 高 / B | Studio 页面职责、配置版本与历史编辑已确认，具体交互待落地 | T09 基础边界、L1 语言和 L2 诊断能力；M19 | 结合列表 P1 与工作台 P2 细化已确认的保存→修订→检查→发布路径、历史编辑及失败反馈，完成接口与预览适配；不以归档声明实现完成 |



2026-10-26 T01 / T05 的 TS Runtime 已按用户确认增加统一校验入口、来源工作去重与在途任务复用，完整调用独立等待覆盖并保留 stale / 重试语义，见 [ADR-FE-021](decisions/ADR-FE-021-validation-work-coalescing.md)及 [Runtime Review 入口](../../packages/runtime/README.md)。该局部证据不关闭跨端 / UI / 生产验收。已完成结果缓存与字段查询 / Issue 索引仅为候选，用户明确当前无必要；未来先验证重复启动、规则 / Schema 次数、聚合查询量、内存与耗时，再决定是否采用，不预先设新任务、阈值或 API。

T01 / T02 的核心行为与 SDK 已实现并有本地证据，接下来承接真实 Host 和生产验收；不因稳定发布尚未完成重开已确认架构决策。T03 的独立规范工作和 T04 的验证可以继续，候选工具与原型成功仍不能代替正式契约。


详细约束与问题证据见[架构审查](design-review.md)，逐项讨论时再查对应来源与反例。

## 从原则讨论转入契约与编码准备 {#implementation-readiness}

2026-10-20 用户要求提速、同类合并，不再改变或重复讨论已确认原则。后续不以“下一组字段 / 回调 / 容器选择”循环推进，而按现有主题交付完整契约草案与正反例。无法由已有共识确定的真正行为冲突集中报告，其余由维护者整理为可审查的实现建议。

| 收尾工作 | 交付到现有主题 | 状态边界 |
| --- | --- | --- |
| L1 字段 / 类型一致性 | 各 L1 主题与类型概念稿：判别 Union、数组位置、默认激活、校验能力引用 / 前置、候选字段迁移及正反例 | 正式 TS 类型、派生 Schema 与 Compiler 消费已实现；稳定发布未完成 |
| L2 / L3 / Host 消费接口 | L2、L3 数据 / 执行 / 校验、Host：Prepared 字段、读写订阅 / 求值、Issue / 完整结果、任务 / cancel、诊断 / 错误码与身份 | TS SDK 与本地联验已有证据；真实 Host 与发布兼容验收待完成 |
| L4 模块整合 | [完整流程](l4-renderer.md#implementation-contract)：组件装配、共用 Adapter、输入、生命周期、错误、验收 | React SDK 与首批物料已本地交付；其他端待实现，生产验收未完成 |
| 核心首个实现闭环（路线已确认） | 确定协议 → L2 检查 → Runtime 数据 / Scope / Flush / 校验 → L4 常用物料 → Host 提交 | TS / React 与可控 Host 闭环已实现；真实业务服务待接入，生产验收未完成 |

首个纵切建议包含文本 / 数字 / 确认型日期组件、动态数组、条件显示、同步与异步校验、取消 / 乱序、局部物料错误和 Host 提交。首期已确认 Web/TS + React、六个 TS 包及 packages-flutter 顶层预留，当前已完成工程底座、TS 核心与 React / 首批资产本地交付；工具组合与初始化流程见[工程方案](engineering.md)；本地安装兼容已有记录，正式发布兼容承诺仍待完成。

完整 Platform / Studio、跨端性能和全部发布治理继续按既有范围推进，不作为核心模型与纵切开始编码的统一前提。反之，核心可探索实现也不表示整个引擎对外契约已冻结。

### 当前进度：工程底座完成本地联验，核心契约继续固化

首期确认 Web/TypeScript + React；packages 下六包为 protocol / compiler / runtime / renderer-react / materials-react / pure-functions，packages-flutter 在根目录保留后续 Dart / Flutter。apps/playground、services/api 与六包已有官方脚手架工程，tests 提供跨包 / 浏览器验证；tools / docs 保留原有文档与候选验证体系。见[现行边界与目录](architecture.md#application-engineering)、[ADR-FE-013](decisions/ADR-FE-013-ts-react-packages.md)。原七包草案退为历史比较，不另建 host-sdk、公开 testkit 或通用 renderer-core。

工具链已确认 pnpm Workspace + Turborepo、Next.js 轻量 Playground、NestJS 后端、tsdown、ESLint / Prettier、Vitest / Playwright、Husky / lint-staged / commitlint、Changesets 与 shadcn/ui + Tailwind + CSS Variables；见[完整工程方案](engineering.md)及 [ADR-FE-014](decisions/ADR-FE-014-engineering-toolchain.md)。通过官方脚手架与 pnpm latest 获取执行时依赖，再生成清单 / 锁固定实际环境，日常 / CI 使用 frozen install；后续用户已授权执行，E1–E4 工程配置与本地联验完成，真实版本、兼容范围例外、工具审查和验收见[实施记录](engineering.md#engineering-implementation)。远端 CI / 分支保护未运行，开发工具链保留一项上游未修复漏洞记录；下一步按既有 T01–T07 整合公共契约和纵切验收。协议源已确认原生 TS + JSDoc → JSON Schema，Compiler 使用 Ajv（见 [ADR-FE-015](decisions/ADR-FE-015-protocol-source.md)）；具体生成器已落地，正式目标兼容范围仍待验收，组件实现采用当前 shadcn 默认 Base UI。跨语言保留协议和用例扩展边界，Dart 绑定 / Runtime、Flutter Renderer、跨语言驱动与后端微服务均不作为当前前置。目录建好不关闭 OD、不提升 M02–M16 的完成状态，M18 / M19 仍待设计。平台定位与组织方式已于 2026-11-08 确认；具体页面、模型、MVP 和旧 P2–P4 仍待设计 / 确认。

讨论方式按用户要求：完整专题先在对话中收敛，明确确认后一次归档与构建；不在每次局部讨论后保存候选。当前已获统一归档授权，不新增独立维护报告页。

### 协议包讨论收敛，转入完整类型实施

2026-10-21 用户确认先按[完整开发基线](l1/08-decisions-release.md#protocol-development-baseline)推进，消费者遇真实问题再迭代，不继续逐字段讨论。已确认三领域公共类型、同步字段资格、结构兼容子集、函数签名 / 有限短路、消息、能力身份、双摘要、Prepared 结构树 / 资源闭包和装载检查。T03 可以按全量类型 + Schema + 正反例实施，T06 按相同基线联验；命名 / 容器 / 工具配置不再列为架构阻塞。

Protocol 首批三领域类型及 10 个 Schema 根的结构 / 打包验收已完成，见[实施记录](engineering.md#protocol-implementation)。M02–M06 仍不视为全链路生产验收完成；Runtime 的快照、Issue / 完整结果、任务与 Context 管理 API 仍归各自包，不以协议讨论收敛宣称全引擎 SDK 就绪。真实行为冲突才重开设计，Platform / Studio 与 Dart 不作为本期前置。

### 项目工作流与契约证据规则已建立 {#项目工作流入口已建立工程验收仍待实施}

2026-10-20 用户确认建设五类研发工作流及场景说明，见 [项目工作流](workflows.md)：方案讨论、确认归档、开发交付、问题修复、流程改进。2026-10-24 进一步要求按契约驱动、增量交付、行为理解和证据验证统一调整项目规则：W3 增强只读预检，W3 / W4 共用辅助深度审查，决策按行为影响分级，关键契约关联实现、反例与实际证据；真实缺口只暂停受影响范围，修复后按最终基线复验。

仓库唯一入口 `form-workflow` 按需加载五类任务及深度审查能力，复用已有维护程序及工程门禁；不新增引擎架构决策、关闭既有 OD 或提高 M02–M16 状态。E1–E4 已有本地工程验收记录，远端 CI / 分支保护仍以实际启用为准；生产行为测试、可控 Host 和纵切覆盖按实现证据逐项核对。新规则的检查、独立场景演练及真实任务效果分别报告，后两者未执行时保留未验证状态；第三方工具不自动安装。后续选一个已授权状态 / 调度行为试用，观察人工纠偏、返工、审查有效发现和契约验证缺口，不为流程另建产品路线图任务。


2026-11-02 已确认 OpenSpec 管理复杂变更、Superpowers 方法复用及项目 hooks；接入与验证边界见[工作流](workflows.md#workflow-openspec)。真实业务试用效果待验证，不提高模块完成状态，不新增产品路线图任务。


2026-11-04 Review 的整体讲解顺序经用户试用确认，工具两项 P2 已修复，本地及独立回归通过；细则见[工作流](workflows.md#deep-review)。不改变产品模块或远端 CI 状态。

### Agent 规划阶段与当前确认范围

历史阶段：用户澄清先做动态表单业务不等于不讨论 Agent。完整赋能场景与能力接入覆盖保留在 [平台主文档](platform-studio.md#agent-capability-plan)，供后续集中审阅；暂不选型、自建或纳入核心编码前置。当时确认的是讨论 / 建设范围区分；2026-11-15 已确认的服务、知识、记忆与编排子集见[当前状态](#agent-blueprint-progress)，A2A / A2UI 等剩余覆盖继续候选。

### Agent 八层覆盖与阅读呈现

按用户清单补齐 [Agent L1–L8 逐项排查](platform-studio.md#agent-eight-layers)，每层给出表单赋能、落点 / 边界与产物验收；该 Agent 分层不是表单 L1–L4。八层保留完整候选覆盖；2026-11-15 的已确认子集、技术栈和阶段以[当前蓝图](platform-studio.md#agent-confirmed-blueprint)为准，训练方法等其余范围继续候选。

2026-10-20 用户确认将[运行保障与问题治理](architecture.md#blueprint-operations)纳入完整蓝图，覆盖可观测性、监控告警、问题处理与 Agent 辅助；实现可后置，不成为核心纵切前置。M16 的既有诊断 / Trace 契约继续固化，M18 / M19 仍待设计；完整监控与处置及自动操作权限随后续 T09 / T10 和 Agent 场景设计展开，不关闭 OD-12 或改变 T01–T08 的已有要求。


### 物料 Request 已确认增量

[物料 Request](l1/05-view-material-host.md#material-requests) 与 [ADR-FE-016](decisions/ADR-FE-016-material-requests.md) 已确认，替代原物料服务需求；T03 同步三领域类型 / 生成 Schema / 结构正反例。T06 仍需覆盖 Compiler 名称及类型连接、Prepared 引用闭包和 Adapter 并发 / 生命周期实际验收。现有 M04 / M06 / M14 状态不因此提升，不重开已定并发或要求额外物料工厂；无新增架构阻塞。


### 请求开发接入的实现目标补齐

T03 / T06 及 L4 接入验收须覆盖 [请求类型贯通和完整性](l1/05-view-material-host.md#request-development-contract)：物料公开请求输入输出、Host 关联契约和类型约束、必需映射 Compiler Error、实际注册装配预检及页面错误隔离。请求首期不设 optional，仅加载未使用物料不要求注册。已确认规则替代等到调用才报告未绑定；具体 SDK 辅助 API 与推导工具为实现细化。Compiler / Runtime / React Renderer 已实现上述检查与类型 / 装配接缝，见[本地证据](engineering.md#renderer-implementation)；真实 Host 与跨端待验收，无新增架构阻塞。

## 状态观察与 Host 行为的增量状态 {#reaction-state-status}

ADR-FE-020 解决 Reaction 如何声明 Host 行为、如何监听校验信息及 View / 校验订阅的统一方向；局部替代旧 Data-only Reaction 与 Command-only then。协议 / Schema 与 Compiler 检查同步，Prepared /2 明确兼容边界；M03 / M05 / M09 / M11 / M12 / M14 / M15 的模块完成度保持，不能以类型通过证明运行时订阅已实现。

T04 / T05 / T07 继续落实 Runtime 观察注册与安全初读、分源匹配、字段一致发布、Host 注册交付 / 释放及 Adapter 重读。OD-12 仍需固化公开状态枚举、Issue / 快照 / 完整结果 / Trace SDK；新观察语法不自动关闭这些问题。验收补充：相同 Issues 的状态变化、每结果即时通知、过期结果拒绝、成员移动 / 删除、两个显式 emit 不合并、事件 Payload 不能读取普通 Reaction 的 Event、校验反馈跨异步轮收敛。


## L4 四批交付授权 {#l4-react-delivery-status}

2026-10-26 用户确认 [L4 完整 React SDK 与四批计划](l4-renderer.md#react-sdk-delivery)，T11 本专题收敛，OD-15 转为已确认方案的实现 / 消费联验；不要求逐项批准 Hook 名称或框架实现。M14 保持部分完成，直到四批有实际运行证据；T07 承接真实 React 主端纵切，正式物料库、业务纯函数和 Host 应用整体装配随后设计。当前未以确认关闭跨端、生产性能或 Platform / Studio 待设计状态。


2026-10-26 上述四批已落地 TS / React，具体 [实现关联与独立审查反例](l4-renderer.md#react-implementation)及本地命令结果见 [工程证据](engineering.md#renderer-implementation)。M14 继续标为部分完成，限定原因是正式物料 / Host 应用、其他目标端及生产性能未完成，不再把 TS SDK 和首次读取接缝写成待讨论阻塞；T11 本专题已收敛，T07 已有可控 Host / 测试物料的实际页面链路。正式基础物料、业务纯函数及真实 Host 应用仍按用户确认顺序随后设计。


### 独立 DevTools 首期边界确认 {#devtools-status}

2026-10-26 用户确认 [ADR-FE-023](decisions/ADR-FE-023-independent-devtools.md) 并授权落地独立工具包与浏览器扩展入口。M14 不再承担技术诊断界面，M16 增加开发态发现 / 查询 / 订阅与只读工具首期；必要异常完整现场继续保留。OD-12 中完整因果轨迹、字节预算 / 生产报告阈值、全端和自动重放不因此关闭；M18 / M19、正式物料和 Host 应用状态不变。实际检查与扩展宿主范围见工程证据，不从目录建立推导发布完成。


## 首批正式资产与工程工具确认 {#first-assets-status}

2026-10-27 用户确认完整草案及目录 / 版本 / 模板工具调整并授权正式归档。依据 [ADR-FE-024](decisions/ADR-FE-024-first-assets-tooling.md)，现行方案在[扩展主题](extension-integration.md#first-assets)与[工程工具](engineering.md#asset-tooling)。14 个物料、7 个业务函数、家庭短期出行验收表单和 Host 路线已明确；单资产目录包内平铺、tests 镜像、Manifest 单一源，能力版本与包版本独立，先工具再资产。

M03 / M04 / M06 / M14 / M15 / M17 的本期设计信息补齐，不因归档升级为实现完成；T07 承接工具 0 及资产 1–4 批。真实费率 / 服务契约是后续 Host 业务验收前置，不是基础资产实施的统一阻塞。原子双端口、整弹层回滚、多版本共存和外部发布不在确认范围；如需改变另议，不默认为内部实现。Platform / Studio、全端和生产性能状态不变。

本次只归档，不创建生产目录、工具或新的包版本，不执行发布。实际构建 / 阅读检查只支持文档一致性；资产工具及产品行为证据在后续实施记录中补齐。


2026-10-28 按用户“提交后继续”指令，设计提交 fd96b3c 后完成工具批次 0 及 text.isNonBlank 试点，见[实施证据](engineering.md#asset-tooling-implementation)。M03 / M06 / M14 保持部分完成，更新实际可用范围，T07 下一步为基础输入呈现；14 个正式 UI 物料、其余 6 个函数、真实 Host、外部发布与远端 CI 不因工具通过而标为完成。无新增公共状态语义、ADR 替代或架构阻塞。


同日用户继续授权后，第 1 批 7 个输入 / 字段物料已有[本地实施证据](engineering.md#first-materials-implementation)，T07 下一步进入组合成员；M04 / M14 继续部分完成。核心函数仅只读评估，本轮没有模块化实施或版本迁移；不能从维护性建议推导新公共 API 或 core 版本规则。


用户再继续后，第 2 批组合成员已有[本地证据](engineering.md#member-materials-implementation)，正式物料累计 12 个；T07 下一步为 date-range / remote-select。M04 / M14 保持部分完成，剩余 2 个复合物料、6 个函数、真实业务 Host 和完整目标表单未验收；核心函数仅保留前轮只读意见。

同日后续第 3 批 date-range / remote-select 已有[本地证据](engineering.md#interaction-materials-implementation)，首批 14 个物料全部本地交付。T07 下一步为第 4 批业务纵切；M04 / M14 仍为部分完成，其余 6 个业务函数、完整目标表单、真实服务和生产性能未验收。

同日后续第 4 批全部业务函数与完整可控表单已有[本地证据](engineering.md#business-travel-implementation)，首批累计 14 个物料 / 7 个函数。T07 的本地资产 0–4 批完成，后续真实 Host 待服务与业务契约；M03 / M04 / M13 / M14 / M15 继续部分完成，不将本地合成政策与模拟交付升级为生产保险验收。核心函数模块化仍未实施或确认为规范。

### 通用观测契约归档与实施准备 {#observability-contract-status}

2026-11-08 用户确认完整方案及三个原则，见 [ADR-FE-025](decisions/ADR-FE-025-observation-contract.md)。本次新增通用数据集、身份与关系、实际因果、快照 / 游标完整性、四视图消费及折叠统计契约；澄清旧首期观测 API 不等于完整新契约已实现。没有替代 Runtime / Renderer / DevTools 状态所有权、显式 Reaction Watch、Source / Work / Call 复用或 Flush 封存原则，未新增架构冲突。

OD-12 的观测语义部分收敛，详细接口及直接破坏性升级已确认；具体 DTO / SDK 代码、生产者接入、工具消费与生产阈值仍需交付 / 验收。M16 保持部分完成，不关闭 T08 或跨端发布工作。历史重建、确定性 Replay、任意 Host 自动因果追踪不纳入本次承诺；正常 Trace 保留策略和脱敏仍按原边界推进。

[OBS-0 至 OBS-4 与 17 项验收](l3-observability.md#observation-delivery)是后续实施准备，依赖现有 T01 / T04 / T05 / T06 / T11 接缝，不要求 Platform / Studio 全部完成。首次确认时只归档、不改实现；随后已授权进入 W3，当前进度见下文。旧接口删除及同步升级已有本地检查；当前边界见现行实施记录。

同一专题的详细技术方案已确认，见[接口与技术实施清单](l3-observability.md#observation-technical)。当时明确会话录制租约和固定版本分页 / 失败语义（录制语义后被自动订阅替代）；用户最新修订取消渐进兼容，Runtime / Renderer / 桥接 / 面板同批破坏性升级，版本不匹配拒绝，无 V1 回退。旧协议兼容方向已在正文及 OBS-A17 更新，演进保留修订理由，未改变业务调度、状态所有权、L1 / Prepared ABI 或必需异常现场。

OBS-0 至 OBS-4 的技术任务与反例已补齐；接口语义不再作为未决原则，具体导出命名、内部结构和预算测量按契约处理。M16 / T08 不关闭。

2026-11-09 自动订阅修订前实施证据：新版 Hook、Runtime / Renderer、桥接、客户端与四视图入口已同步切换，无旧协议兼容。已接入真实操作 / 排队 / Reaction / Source / Work / Call / Renderer request 事实、录制边界在途摘要与原 Runtime 诊断可用性定位；独立审查修复跨代次、重入、引用与预算问题。Runtime 210、Renderer 70、DevTools 11、传输 10 项回归通过，真实 MV3 基础浏览流程及隔离打包消费者通过，先前缓存阻断已解除。50 成员成本已有部分实测，但完整元数据增量 / 墓碑、共享定义、完整执行泳道与潜在 / 实际成员统计、布局成本及最终验收尚未闭环，不提升 M16 为完成，不执行整变更 verify / archive。详见[当前实施边界](l3-observability.md#observation-implementation)。

2026-11-09 自动订阅修订已授权并进入实现：移除手动录制和面板定时拉取；真实连接负责事件推送，查询保持按需，接收和视图刷新解耦，延续视觉 demo。该修订的实现、验证与剩余项统一见[当前实施边界](l3-observability.md#observation-implementation)及现有 devtools-observation-graph 任务，不以旧录制测试冒充新订阅验收。

2026-11-09 完整功能补齐：共享 Prepared / View 定义、固定快照加确认式元数据增量、实例墓碑、逐动作跳过事实、新 Source 原因、操作范围与真实关系、成员聚合和循环布局均已接入。独立审查关闭重复诊断身份、取消重入泄漏、共享 Work 串线和选择器刷新反例；真实 MV3 覆盖 36 人跨对象联动。成本采用独立进程 RSS 高水位与真实布局算法测量；M16 保留跨端及目标生产设备验收，不夸大为全平台发布完成。详细范围及最终门禁收据见 `openspec/changes/archive/2026-11-09-devtools-observation-graph/`，本地变更已通过 verify 并归档。


2026-11-10：[最小创作 MVP](platform-studio.md#platform-authoring-mvp)及 [ADR-FE-028](decisions/ADR-FE-028-platform-authoring-mvp.md)确认。M18 / M19 仅业务规则部分完成，未实现；T09 / T10 继续承接接口、存储、身份和 Host 装载及页面细化。每次保存追加修订、覆盖确认保留旧历史，替代旧保存 / Fork 候选；Error 编译门槛保持有效。


2026-11-11：首期改为表单直接组织配置版本，登录采用内置账号及 GitHub，Host 在线装载。见[最小 MVP](platform-studio.md#platform-authoring-mvp)及 [ADR-FE-029](decisions/ADR-FE-029-platform-config-versions.md)。T09 / T10 按四个切片提案推进，仍待实现验收。

2026-11-11 发布与在线装载切片通过本地 API、Chromium 与引擎回归。已覆盖确定版本、幂等回执、资格复核与 SQLite 原子提交，以及示例 Web Host 匿名读取和兼容新旧发布的独立装载。实施记录见 `platform-release-host`。T09 / T10 仍分别跟踪平台和工作台的其余范围。

2026-11-14 GitHub 登录的绑定、解绑与会话规则已确认，加入首期访问切片。部署侧提供匹配的 OAuth 应用配置后补真实往返验收。见[GitHub 登录与会话](platform-studio.md#platform-github-login)。


2026-11-14 MVP 范围扩展已确认：物料与纯函数最小目录、成员与角色管理均纳入本次交付，API 与页面必须成对验收。用户已选择 Linear 轻量风，并确认管理员核验身份后创建内置账号与初始密码。T09 / T10 按 [MVP-A 至 MVP-E](platform-studio.md#platform-mvp-completion) 已接入目录、成员与改密 API / 页面，本地 API 和 Chrome 流程通过，独立源码审查完成；人工体验与真实 GitHub OAuth 仍待验收，M18 / M19 保持部分完成。旧四切片测试只支持原范围，不能关闭扩展后的 MVP；真实 GitHub OAuth 仍单独补验。

2026-11-14 最终收口：MVP A–E本地自动验收完成（6组API集成、19条Chrome），独立review发现的创建晚到导航P2已修复并通过反例复验；37项目录的结构/说明/示例已同步。用户人工体验验收待进行，真实GitHub OAuth单独未验证，M18/M19继续保持部分完成；最终基线与限制见[收口证据](../../openspec/changes/archive/2026-11-14-studio-linear-catalog/final-verification.md)。


## 2026-11-15 账号准入增量状态 {#platform-account-admission-progress}

用户已确认[GitHub 自助注册、团队申请审批及登录方式管理](platform-studio.md#platform-account-admission)完整方案，并授权按切片持续实施。账号与准入分离、申请审批、登录方式管理三个切片的API与Studio均已交付，本地API/Chrome验收与各切片独立review通过。审查发现的回调成功误报、列表重试旧错误及跨会话晚到401已修复并复验。普通Studio成员入口已改为审批，旧POST /members保留兼容；首位管理员仍受控初始化。M18 / M19保持部分完成，真实OAuth、反向代理限流配置和用户最终人工验收继续单独跟踪，不能以本地模拟OAuth替代。当前执行证据见本次 `platform-account-admission` 变更，归档目标为 `openspec/changes/archive/2026-11-15-platform-account-admission/evidence.md`。Studio ESLint覆盖、类型检查与本轮浏览器回归均已实际执行；早期验收记录中的未覆盖限制仅作历史追溯。


### 首期错误事件采集 {#platform-diagnostic-progress}

2026-11-22 [ADR-FE-034](decisions/ADR-FE-034-platform-diagnostic-events.md)确认[平台错误事件采集](platform-studio.md#platform-diagnostic-events)。在 T09 范围内跟踪受信 Host 上报、Platform PostgreSQL 脱敏存储、管理员查询与保留策略，待授权开发和验收。M18 仍为部分完成。OD-12 仍跟踪辅助 Trace 的保留策略以及生产容量等未验收事项，M16 的既有诊断证据边界继续有效。

上报[事件白名单、熔断去重和 Renderer 现场范围](platform-studio.md#platform-diagnostic-mapping)已确认，随 T09 的首期采集方案待授权开发与验收。

### Agent 蓝图、首期与后续阶段 {#agent-blueprint-progress}

2026-11-19 [ADR-FE-033](decisions/ADR-FE-033-agent-create-conversation.md)确认[首期仅创建契约](platform-studio.md#agent-create-contract)：统一助手、多轮澄清、持久业务会话、异步 Run、候选审阅、保存与归档原子完成。替代首批诊断修复与同步 / 临时会话安排；六类职责、Harness、Loop、PostgreSQL 分域与安全原则保留。M18 / M19 仍部分完成，无 Agent 实现或验收证据。

[三个会话](platform-studio.md#agent-create-design-workstreams)分别细化 Studio、Platform、Agent，已在后续统一收口。原版本 / release 编辑、诊断修复、草稿同步、多人会话、SSE、长期记忆后续；持久会话与可靠受理已纳入首期。


2026-11-19 增量确认[MCP / 插件扩展方向](platform-studio.md#agent-mcp-extension)：首期继续 Studio 创建闭环；三方详细设计须分离入口与业务用例，未来 MCP 复用 Platform 应用服务及 Agent Harness。MCP、宿主插件、外部授权和外部保存确认后续设计，不扩张本期实现范围，无开发授权。

2026-11-22 确认[智能表单工作台蓝图](platform-studio.md#agent-form-workspace)，首期仍只做 Studio 创建闭环。[首期验收](platform-studio.md#agent-create-runtime-acceptance)增加 Agent 生成旅险候选的真实 Runtime 场景，建立配置检查、实际联动与校验、审阅保存的证据关联。定向编辑、产品内场景测试与修复、填写辅助和交付运维继续分专题设计。创建接口及状态所有权沿用 ADR-FE-033，M18 / M19 仍为部分完成；本次仅归档检查，未开始开发，Runtime 验收尚待实际执行。

同日确认三方[创建详细方案](platform-studio.md#agent-create-contract)，包括接口、状态、候选有效性、可靠投递与接管恢复、[实施切片](platform-studio.md#agent-create-delivery-slices)和旅险验收路径。模型供应方、具体限额和保留期限明确留实施预检，正式类型、内部接口细节和部署约束随预检核对。M18 / M19 不变，Agent 代码、联调与真实 Runtime 验收均待后续授权。

2026-11-22 后续确认[直接调用 CreateForm](platform-studio.md#agent-create-contract)，替代上述首期异步执行细节。Platform 保留会话、消息、候选和完成记录；Agent 持有 Graph 执行状态。Graph、工具与调用失败语义继续设计。M18 / M19 仍为部分完成。

2026-11-23 [候选编译修复循环](platform-studio.md#agent-create-compiler-repair)已明确节点职责、次数上限及终止反馈。Graph 已接入修复节点，真实模型与 Studio 联合验收待完成，M18 / M19 维持部分完成。

2026-11-23 统一 Graph 已接入 Studio 和 Platform。隔离 Chrome、实际配置的模型及 Compiler 验证同一会话的问答 → 创建澄清 → 插问 → 回答后交付候选。失败续修、检查环境过期及轮次重放另有回归测试，M18 / M19 维持部分完成。见[统一助手 Graph](platform-studio.md#agent-turn-graph)。

2026-11-23 用户确认[数据归属与全量清洗](platform-studio.md#agent-conversation-draft-ownership)。删除对话保留平台草稿；Agent 和 API 分别维护所拥有的数据。本机已全量迁移 3 个会话、4 个轮次及 1 份独立草稿；草稿候选、工作稿和预览摘要已对平，正式表单与版本数量一致，原混合表已移除。

2026-11-24 已确认并授权实施[轮内消息和步骤恢复](platform-studio.md#agent-turn-recovery)。验收覆盖未完成轮次重开、部分回复、复用成功步骤与并发续办，按本轮执行证据判定交付状态。


2026-11-22 补充[需求理解与配置交接](platform-studio.md#agent-create-requirements)的设计与旅险走查。已记录标准需求、协议与能力检查的边界，以及整份手册合并标准需求的本地分词基线。独立模型生成、Compiler / Runtime 验收及检查拆分效果仍待验证，M18 / M19 状态不因本次归档变化。

### PostgreSQL 迁移与 Agent 运行状态 {#agent-postgresql-progress}

2026-11-15 [ADR-FE-031](decisions/ADR-FE-031-postgresql-agent-runtime.md)确认 PostgreSQL 分域、双向服务凭证、运行 Token、检查去重与终态事务、多实例共享状态和排空发布。2026-11-17 用户授权 Platform 迁移实施；PostgreSQL 适配、20 表导入及隔离数据库验证已有实现，2026-11-18 已完成本机业务库切换与恢复/Studio验收；无生产部署，Agent 开发仍未执行，M18 / M19 保持部分完成。

实施顺序见[迁移方案](platform-studio.md#platform-postgresql-migration)：盘点预检 → 异步存储事务适配 → 数据演练回归 → 受控切换 → Agent 多实例联验。迁移为多实例业务联验前提，合成输入的 Agent 工作流可独立开发。Platform 已选 pg + node-pg-migrate，并补齐停写导入/回退规则和实施证据；本机开发环境已完成受控切换；未来部署环境单独落实运维配置。Agent 的密钥轮换、崩溃失效检测及等待协议仍须实施预检补齐；模型与真实配置传输范围待内测前确认。
