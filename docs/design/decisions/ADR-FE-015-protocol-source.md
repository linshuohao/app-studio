---
id: ADR-FE-015
title: ADR-FE-015：原生 TS 协议源与 JSON Schema 校验链路
type: decision
status: accepted
layer: 跨层
modules:
- M02
- M05
- M06
related:
  decisions:
  - ADR-FE-002
  - ADR-FE-004
  - ADR-FE-013
  - ADR-FE-014
sources:
- SRC-PROTOCOLBASELINE
- SRC-PROTOCOL
navigation:
  group: 09 · 决策与追溯
  order: 125
last_reviewed: '2026-10-21'
status_note: 结构源及 Ajv 路线已确认；具体生成器、完整类型 / Schema 与生产验收未完成
---

# ADR-FE-015：原生 TS 协议源与 JSON Schema 校验链路

## 背景与实际比较

工程底座完成后，用户开始讨论协议包。对话先提出 Schema 优先，用户指出手写繁琐；随后比较原生 TS 类型派生 JSON Schema 和 Zod 定义推导 TS / 导出 Schema。用户最终选择原生类型声明，理由是书写直接、便于维护注释，并供不同包阅读与消费。以上备选尚未形成已确认决策，不存在旧 ADR 的替代。

## 已确认决策

以原生 TS type / interface 及 JSDoc 为权威结构源，必要结构约束以注解或统一生成配置补充。自动生成 JSON Schema，不手改生成物。Compiler 使用 Ajv 检查外部定义结构，再以自身语义分析检查引用、Scope、能力连接等；不将结构检查通过等同于可执行制品成立。

生成规则维持已确认的未知字段拒绝、严格 Union 和保留标记策略，业务字典与 Literal 等按所属契约处理。具体生成器、支持子集与诊断映射随实施固化，必要正反例属于正常契约验收，不将每项工具配置重新交用户决策。

Runtime 不在每次求值、命令或联动执行时重复全量静态检查；Prepared 必要装载有效性 / 格式 / 目标 / 能力检查、动态执行保护及业务数据校验继续保留。完整 Prepared Schema 的装载使用取决于可信交付边界，本轮未统一确定。

未来 Dart 从交换结构派生协议模型及工具支持的编解码，不复制另一份权威协议，不将此路线解释成生成 Flutter 页面、Runtime 或 Renderer。

## 影响与限定范围

补充 ADR-FE-013 / 014，延续 ADR-FE-002 的静态规则及 ADR-FE-004 的 Prepared 唯一执行入口。设计正文仍定义执行语义，TS 是机器结构源，不自动实现算法。定义内 data.schema 仍用于业务数据校验，与协议 Schema 区分。

仅确认结构源、注释与校验路线，不冻结公共子入口、全量字段、开发批次或公开校验 SDK；本轮无依赖安装、生产代码、生成产物或 Dart 工具实现，不关闭 OD-11 或提升模块完成状态。

## 来源与关联

- [L1 结构源与校验链路](../l1/08-decisions-release.md#protocol-structure-source)
- [讨论演进](../design-history.md#protocol-source-confirmed)
- [来源登记](../source-map.md#src-protocol-source)


### 后续确认：完整类型优先与实现迭代

用户认可正式协议及组成类型按三领域公开、首批整合全量类型 / JSDoc / Schema / 正反例，未要求只做局部 Definition。后续已确认[完整开发基线](../l1/08-decisions-release.md#protocol-development-baseline)，不再逐字段讨论；工具适配和名称由实施者整理，真实消费冲突再演进。外部 Prepared 一次结构检查与同进程 Compiler 成功结果免重复全量检查也已确定，收敛本 ADR 初始保留的装载边界；不代表生产 API 或所有 SDK 已冻结。

