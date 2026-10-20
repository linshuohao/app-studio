---
id: ADR-FE-014
title: ADR-FE-014：首期工程工具链与脚手架初始化
type: decision
status: accepted
layer: 系统
modules:
- M01
- M17
related:
  decisions:
  - ADR-FE-013
sources:
- SRC-ENGINEERING
navigation:
  group: 09 · 决策与追溯
  order: 124
last_reviewed: '2026-10-20'
status_note: 工具组合与流程已确认；尚未执行工程初始化和兼容验收
---

# ADR-FE-014：首期工程工具链与脚手架初始化

## 背景与实际比较

六包与目录已确认，但仍为占位。用户要求先完成工程选型，指定 Next.js 轻量 Playground 与 NestJS 后端，核心保持纯 TS。讨论比较 pnpm 与其他包管理、Turborepo / Nx、库构建和检查测试组合，以及 shadcn/ui、Ant Design 等组件与样式路线。

## 已确认决策

采用 pnpm Workspace + Turborepo、tsdown、ESLint Flat Config / typescript-eslint + Prettier、Vitest + Playwright、Husky / lint-staged / commitlint、Changesets。UI 采用 A 定制优先：shadcn/ui + Tailwind + CSS Variables，CSS Modules 补充局部复杂样式。Git 采用短分支 / PR / Squash 的主干开发与 Conventional Commits，质量任务由 CI 执行；CI 优先方案为 GitHub Actions，实际托管平台仍待确定。

项目初始化使用官方脚手架，依赖通过 pnpm create / dlx / add 的 latest 标签安装，不预填版本号。模板生成后通过 pnpm 更新并联验，实际版本和锁由工具生成；日常和 CI 使用 frozen install。脚手架默认配置需按已确认组合整合，latest 不保证兼容。

Playground 保持轻量，本轮不讨论应用状态管理和产品架构；Platform / Studio 后续专题展开。底层组件基础、协议结构源和目标兼容范围未因本决策自动确定。实施细化、安装顺序与验收统一在[工程方案](../engineering.md)。

## 影响与限制

补充 ADR-FE-013，不替代既有包边界或 L1–L4 / Host 契约。工具安装不表示生产 SDK 或协议发布；本轮只写文档，没有安装、脚手架执行、CI 或工程运行验收证据。保留单一物料数据源、Manifest 独立消费、核心框架隔离及默认样式可选交付。

## 来源与关联

- [工程方案与官方命令依据](../engineering.md)
- [讨论演进](../design-history.md#engineering-toolchain-confirmed)
- [来源登记](../source-map.md#src-engineering)
- [下一步与状态](../governance.md#implementation-readiness)
