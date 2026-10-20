---
id: ADR-FE-013
title: ADR-FE-013：TS / React 首期包边界与 Flutter 预留
type: decision
status: accepted
layer: 系统
modules:
- M01
- M02
- M05
- M14
- M15
tags: []
related:
  decisions:
  - ADR-FE-001
  - ADR-FE-003
  - ADR-FE-004
sources:
- SRC-REVIEW
navigation:
  group: 09 · 决策与追溯
  order: 123
last_reviewed: '2026-10-20'
status_note: 首期语言 / 框架、六包职责与目录已确认；仅建立占位，正式契约和工具链未落地
---

# ADR-FE-013：TS / React 首期包边界与 Flutter 预留

## 背景与实际比较

四层责任已经明确，物理包此前未确定。初稿七项包含 contracts、compiler、runtime、renderer、host-sdk、capabilities、testkit，混合了公共格式、生产库、接入便利层和开发支持。后续讨论收敛为按职责与消费者划分六类，并明确首期 Web/TS + React、未来 Dart / Flutter。

目录曾比较 packages 下再放 ts / flutter 分组与 TS 直接放 packages、Flutter 顶层 packages-flutter。用户选择后者，认为无需额外嵌套且结构可以持续演进。用户随后授权创建 .gitkeep 占位和统一更新文档。

## 已确认决策

首期六包位于 packages/protocol、compiler、runtime、renderer-react、materials-react、pure-functions。Protocol 收纳可交换格式及 TS 绑定，不集中全部内部类型；Compiler 不依赖 Runtime 执行或物料 UI；Runtime 保持框架无关；React Renderer 与 React 物料分别交付；纯函数与 UI 分开。

Host 注册与实例接口归 Runtime，呈现装配归 Renderer，网络和业务流程归 Host 应用，暂不独立 host-sdk。共享测试支持先内部组织，不立即发布 testkit；不预建通用 renderer-core。各包公共入口、构建和发布元数据在实际实现时固化，不因目录存在宣称 SDK 已冻结。

顶层保留 apps、packages、packages-flutter、services、tools、tests、docs。未来 Flutter 的 Dart Runtime、Renderer 和物料按相同协议与行为契约扩展，当前只保留位置；不增加多语言工作区框架、Dart 实现或多个 Web Renderer。后端继续规划，微服务按实际需求再拆分。

统一协议来源与可复用行为用例用于未来扩展，当前先完成 TS 实现；具体生成工具、断言格式与跨语言驱动尚未确定。协议结构不自动生成执行算法，不为未来平台把当前 TS 写成跨语言伪代码或增加空抽象层。

## 影响与限定范围

延续 ADR-FE-001 的四层和唯一数据 / Host 分责、ADR-FE-003 的 Adapter 与物料边界、ADR-FE-004 的 Prepared 唯一执行入口；没有替代旧 accepted ADR。原七项只是未确认草案，比较理由在演进中保留。

目前仅有 10 个 .gitkeep 占位。没有生产协议 Schema、package.json、依赖锁、React / TS 安装、Runtime / Renderer 或正式测试实现。版本与工程工具待选，公开契约缺口和模块状态不因此关闭。Platform / Studio 的详细产品方案、发布入口、后端部署与 Agent 方案未被本决策确认。

## 来源与关联

- [现行包边界与目录](../architecture.md#application-engineering)
- [讨论确认与原候选](../design-history.md#ts-react-package-layout)
- [实现准备及剩余工作](../governance.md#implementation-readiness)
- [来源登记](../source-map.md)
