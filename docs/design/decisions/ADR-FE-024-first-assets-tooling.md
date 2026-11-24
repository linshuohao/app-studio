---
id: ADR-FE-024
title: ADR-FE-024：首批正式资产与版本工程
type: decision
status: accepted
layer: 跨层
modules:
- M03
- M04
- M06
- M14
- M15
- M17
related:
  decisions:
  - ADR-FE-011
  - ADR-FE-013
  - ADR-FE-014
  - ADR-FE-016
  - ADR-FE-022
  - ADR-FE-023
sources:
- SRC-ASSETDESIGN
navigation:
  group: 09 · 决策与追溯
  order: 134
last_reviewed: '2026-10-28'
status_note: 完整方案已确认，后续授权交付工具第 0 批及首个函数；首批 14 个物料、7 个业务函数及完整可控表单本地已交付，真实 Host 未完成
---

# ADR-FE-024：首批正式资产与版本工程

## 背景与确认范围 {#adr-024-context}

L1–L3 核心、React L4 本期实现及 review / 修复已有本地证据，独立 DevTools 已落地；正式物料包为空，业务函数和真实 Host 待推进。用户要求从已有场景提出完整验收表单，倒推首批物料 / 函数，并在对话完整 review 后归档。

草案采用家庭短期出行投保单，明确 Props / Bindings / Events / Requests / Slots、输入交付、业务同步计算、包结构和实施批次。随后用户要求每个资产独立目录，讨论平铺与分层及单资产版本，并要求模板生成和 CLI / npm scripts 编排能力与包版本。最终明确“就按照这个草案去生成正式的文档”。本次授权为统一文档归档，不自动进入代码实现或外部发布。

## 已确认决策与理由 {#adr-024-decision}

- 以多被保人、监护人条件、目的地查询、日期确认、合成保费试算、外部校验和完整快照交付作为整体验收。业务假设只限定测试场景，不替代真实保险规则。首批 14 个 React 物料和 7 个同步函数的完整契约维护在[扩展主题](../extension-integration.md#first-assets)，不在 ADR 重复一份。
- 沿用 Runtime 唯一业务状态、共用 Adapter、既有短路 / Missing、非原子 Command、Host 三条路径及独立 DevTools。新增物料行为包括选项持久化 id / label、日期打开时外部更新重置草稿、双端口逐次交付、普通编辑弹层关闭不回滚、试算失效写 null。
- 一个正式物料 / 函数一个源码目录，在各包内平铺；测试在 tests 下镜像。此前基础 / 展示 / 布局 / 复合分类作为职责说明，不做源码分层，避免新增时交叉归属。Manifest 是机器契约单一源，静态入口不加载 React，文档与必要类型就近。资产目录不等于独立 npm 包。
- 单能力语义版本、包分发版本和不可变制品身份独立；能力可独立升级，包汇总分发，多能力可以共享制品。新增能力采用三段号，兼容影响按行为判断；既有 core 不在本次重编号。源码维护当前版，旧交付不可覆盖，不按版本复制源码目录。
- 首批资产开发前先交付仓库内模板 / 检查脚本。复用已有 Changesets 管包版本，薄层在单一声明中关联资产变化，生成只读计划并集中应用；不维护两份手工变更依据，不按 commit 或 Schema 自动证明行为兼容。完整命令及门禁在[工程主题](../engineering.md#asset-tooling)。

## 延续关系与代价 {#adr-024-impact}

本决策细化 ADR-FE-011 的确定能力锁、ADR-FE-013 的包边界及 ADR-FE-014 的 Changesets 工程选择，不整体替代旧 ADR，不改变 Protocol / Prepared 公共结构。多个能力仍可共用包字节摘要；版本应用、构建和制品摘要按顺序分开。L1 不增加逐节点版本选择、requiredBindings、网络工作流或临时业务状态层。

单资产目录增加目录及就近文件数，换取维护定位；平铺用语义名称 / 工具分类管理，后续确有独立维护或分发需求再拆集合。版本薄层增加模板、声明解析、计划幂等与检查的维护成本，使用首个真实资产演练检验收益，不预建独立 CLI 包、在线仓库、多版本共存或自动发布平台。

## 实施和证据边界 {#adr-024-evidence}

顺序为工具批次 0 → 基础输入呈现 → 组合 / 成员 → 日期 / 远程交互 → 业务函数和完整可控纵切 → 真实 Host。每批依据现行 W3 预检和适用验证；结构构建不代表产品实现。真实服务、费率、业务输出 / 提交和生产性能未完成；本次没有新增实现、变更包版本、启用发布或运行工具版本应用。

目录命名、模板编码和声明正文格式在契约内由实施者细化；原子日期更新、弹层回滚等新增可观察行为须另议。来源和演进见 [SRC-ASSETDESIGN](../source-map.md#src-asset-design)与[确认记录](../design-history.md#first-assets-confirmed)。


## 实施进展

2026-10-28 用户后续要求提交设计并继续，fd96b3c 后实施工具第 0 批及 text.isNonBlank，见[工程证据](../engineering.md#asset-tooling-implementation)。此前“仅归档”的授权记录保留其当时时点；本次实现不变更本 ADR 的决策、版本语义或外部发布边界。


同日第 1 批 7 个正式输入 / 字段物料已有[实施证据](../engineering.md#first-materials-implementation)，其余资产按原批次继续；本 ADR 不新增核心函数模块化或版本迁移决策。


同日第 2 批组合成员亦有[实施证据](../engineering.md#member-materials-implementation)，正式物料累计 12 个，日期 / 搜索及完整业务纵切后续推进；不变更本 ADR 的状态所有权或版本边界。

同日第 3 批 date-range / remote-select 亦有[实施证据](../engineering.md#interaction-materials-implementation)，首批物料累计 14 个；其余 6 个业务函数、完整目标表单和真实 Host 继续推进，未应用真实版本或外部发布。

同日第 4 批全部 7 个业务函数与完整可控表单亦有[实施证据](../engineering.md#business-travel-implementation)，与前批合计 14 个物料 / 7 个函数。仍采用同步计算、显式规则与独立 Host，未改变本 ADR 的架构决策或发布权限；真实产品服务后续验收。
