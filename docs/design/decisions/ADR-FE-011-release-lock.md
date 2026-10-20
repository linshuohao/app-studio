---
id: ADR-FE-011
title: ADR-FE-011：能力分责与不可变发布锁定
type: decision
status: accepted
layer: 跨层
modules:
- M06
tags: []
related:
  decisions: []
sources:
- SRC-L2
- SRC-V05
navigation:
  group: 09 · 决策与追溯
  order: 121
last_reviewed: '2026-10-19'
status_note: 已确认，Manifest / Lock / 兼容字段待固化
---

# ADR-FE-011：能力分责与不可变发布锁定



## 背景与全局约束 {#adr-011-context}

同一表单在 Web / Flutter 依赖不同制品，能力可以独立升级。只记录 latest 或版本范围不能复现旧发布，也不能靠 Runtime 自动搜索能力维持语义。编译器、资产平台、实现代码与 Host 副作用的职责需要分开。

## 已确认选择与取舍 {#adr-011-decision}

能力分为 Material、Pure Function 和 Host；复杂同步校验直接复用 Pure Function，不建平行 Validator DSL。Material / Pure Function 有静态 Manifest，Host 在应用运行时注册，静态 HostContract 可选；缺静态契约不能断言实现不存在，必需 Validator 缺失不能绕过提交义务。

能力源码→CI→平台 Package / Manifest，与 Definition + 确定 Catalog→L2→Prepared 是两条构建链。Form Registry 管表单，Capability Registry 管能力，Compiler 管静态转换，Release Management 登记并分发不可变发布。L2 消费确定快照，不接管源码托管、权限和部署。

Form Release 锁定平台 / Profile 下唯一能力版本与不可变制品身份。升级不改变旧发布，回滚读取旧 Release Artifact，不能用当前 Catalog 重新组装。L1 Protocol、Definition、Compiler、Prepared ABI、能力和 Host SDK 版本各有含义。

该选择相对通用能力执行器或不受控 latest，增加契约、制品追踪及兼容治理成本，换取发布复现和跨端语义约束；不要求不同端共用二进制，也不要求所有 Host 代码进入平台。Manifest 只能声明纯净性与端口契约，实际遵守仍靠审查和契约测试。

## 尚未冻结的接口 {#adr-011-open}

Manifest 最小字段、TypeSignature、内置别名与 core.* 映射、摘要覆盖对象、运行时核对、ABI feature / 兼容矩阵和 Host 缺失分级待固化。来源示意版本号、哈希占位不代表已有发布。暂不默认数据库存任意脚本再 eval，也不默认全动态物料加载或独立市场。

## 来源与关联 {#adr-011-sources}

- 现行：[平台分工](../l2-preparation.md#l2-platform)、[能力分类](../l2-preparation.md#l2-pure-functions)、[双构建链 / Lock](../l2-preparation.md#l2-release)、[版本](../l2-preparation.md#l2-versions)。
- 来源：[L2 V0.1](../source-map.md#src-l2)第 04–13 / 17–21 章；后续 [V0.5](../source-map.md#src-v05)强化 Prepared 唯一入口。L2 D01–D13 / D18 / D19 保留各自确认和待固化状态。
- 关联：[ADR-FE-001](ADR-FE-001-boundaries.md)、[ADR-FE-002](ADR-FE-002-static-language.md)、[ADR-FE-004](ADR-FE-004-prepared-entry.md)；[OD-08 / 10 / 11 与 T06](../governance.md#open-decisions)。

### 入库与制品准入补充

2026-10-20 已确认编辑 / 入库 / 发布前必须给出具体编译诊断，Error 不产出可执行 Prepared，也不允许作为可用发布制品下发 C 端。首阶段 JSON、精确匹配 Prepared 格式，不要求 Compiler 版本等于 Runtime 版本；格式、能力锁与 Host 接入分别检查。完整契约见 [ADR-FE-004](ADR-FE-004-prepared-entry.md)与 [L2 交付](../l2-preparation.md#prepared-delivery)。草稿保存策略不在此预设。
