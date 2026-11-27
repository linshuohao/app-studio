---
id: GUIDE-PROJECT-001
title: Assemble Studio 项目手册
type: guide
status: active
layer: 系统
modules:
- M01
navigation:
  group: 01 · 架构全貌
  order: 0
last_reviewed: '2026-11-27'
reading_next: ARCH-FE-001
---

# Assemble Studio 项目手册

以一张旅险表单走完创作、发布和填写。看清系统怎样处理「改年龄后重算保费」，再跟着两个现有资产做一次开发。

## 一张表单如何交付 {#project-flow}

```diagram
{
  "id": "figure-handbook-delivery",
  "title": "旅险表单从定义到上线填写",
  "rows": [
    [{"title": "创作 · Studio", "body": "配置字段、布局、联动和校验。Agent 可以理解需求并交付候选草稿，由作者审阅。"}],
    [{"title": "发布 · Platform API", "body": "管理权限、草稿和版本。Compiler 对照能力目录检查定义，生成已锁定依赖的 PreparedForm。", "major": true}],
    [{"title": "填写 · 业务 Host", "body": "按 releaseId 获取制品，装配 Runtime、React Renderer 和物料。Host 负责外部核验和业务提交。"}]
  ],
  "arrows": ["编辑并保存 Definition", "按发布版本交付制品"],
  "note": "Studio 试填使用同一套 Runtime 和 Renderer。Playground 是接入引擎的参考应用。"
}
```

**草稿和发布归 Platform，会话和执行记录归 Agent，填写数据归当次 Runtime 实例。** 看服务与目录边界可进入[整体架构设计](../architecture.md#current-system)。

## 引擎四层各交付什么 {#engine-layers}

| 层 | 负责什么 | 旅险中的例子 |
| --- | --- | --- |
| [L1 · Definition](../l1/README.md) | 声明数据、视图、表达式、联动和校验，产出可编辑定义。 | 声明被保人年龄、保费联动、监护人姓名约束。 |
| [L2 · Compiler](../l2-preparation.md#preparation) | 检查引用、规则和物料契约，按目标视图生成 PreparedForm。 | 检查规则引用的是当前成员的年龄，锁定物料和纯函数版本。 |
| [L3 · Runtime](../l3-reactive-engine.md#runtime) | 持有工作数据和成员身份，执行命令、联动与校验。 | 修改其中一位被保人的年龄，只更新符合规则的成员。 |
| [L4 · Renderer](../l4-renderer.md#renderer) | 装配物料，通过 Adapter 连接绑定、订阅和交互。 | 展示输入框、最新保费与校验结果。 |

物料的 **Manifest 供 Compiler 检查，组件实现供 Renderer 装配**。纯函数的签名供 Compiler 检查，函数实现由 Runtime 调用。请求和业务提交由 Host 接手。 [跨层能力图谱](../capability-map.md#horizontal-capabilities)

## 改年龄，为什么会重算保费 {#age-change}

```diagram
{
  "id": "figure-handbook-age-change",
  "title": "同一个被保人的年龄、保费与校验",
  "flow": true,
  "rows": [
    [{"title": "① 输入生效", "body": "Adapter 提交 Command，Runtime 当即写入成员年龄。"}, {"title": "② 联动执行", "body": "显式 Watch 触发 Reaction。Flush 中读取最新状态，按规则写入保费。", "major": true}, {"title": "③ 更新校验", "body": "联动队列排空后推进本轮校验。界面通过订阅读取数据与校验结果。"}]
  ],
  "note": "数组换序仍按成员身份定位。外部校验有独立生命周期，提交由 Host 根据完整校验及对应快照决定。"
}
```

比如保费计算会读取计划和天数，是否因它们变化而重算取决于 Watch 声明。排查时依次看**成员身份、观察来源、动作写入、校验结果**。 [Runtime 执行时序](../l3-reactive-engine.md#runtime-input-timeline) · [Scope 与成员身份](../l3-data-scope.md#l3-scope-index)

## 在 Studio 修改一个控件 {#visual-editing}

```diagram
{
  "id": "figure-handbook-visual-editing",
  "title": "一处修改如何进入配置版本",
  "flow": true,
  "rows": [
    [{"title": "定位与暂存", "body": "在编排画布点中控件，在抽屉改提示文字。"}, {"title": "应用到草稿", "body": "局部写回，可在整份 JSON 核对修改，再撤销回到原值。", "major": true}, {"title": "试填与保存", "body": "在真实 Renderer 中试填，保存已应用的配置并重新打开核对。"}]
  ]
}
```

- **字段**在树上增删与定位，在统一抽屉编辑属性、引用和条件。一次应用可以撤销整批改动。
- **布局**在画布插入、删除和拖动，在抽屉改属性或替换物料。替换尽量保留兼容子树，移动要保留原有 Scope 的引用含义。
- **联动与校验**从清单打开整条规则。联动按观察、条件和有序动作编辑；校验配置断言或 Host 校验，以及前置和结果归属。

四个分区共用定义草稿。局部 JSON 用来处理当前片段，整份 JSON 用来核对差异。暂存可以取消，试填值留在预览实例。 [交互与验收细节](../platform-studio.md#studio-visual-editing-flow)

## 动手扩展一个资产 {#asset-walkthrough}

在仓库根目录预览两个模板。它们会列出 Manifest、实现、README、镜像测试与公开导出的变更计划。在练习分支使用新的 ID，移除 `--dry-run` 即可生成骨架。

```bash
pnpm asset:new material --id date-range-example --dry-run
pnpm asset:new function --id text.hasVisibleText --dry-run
```

| 真实例子 | 声明与实现 | 怎么验证 |
| --- | --- | --- |
| **日期范围物料** `date-range` | [Manifest](../../../packages/materials-react/src/date-range/manifest.ts) 声明 `start`、`end` 两个绑定。组件先暂存，确认后用 Adapter 分别写入；取消保留原值。 | 跑物料测试，在 Playground 的 `/demos/interactions` 试确认和取消。 |
| **非空纯函数** `text.isNonBlank` | [Manifest](../../../packages/pure-functions/src/text-is-non-blank/manifest.ts) 声明一个输入与布尔返回。内部约束调用它判定姓名，空白为无效，有文字为有效。 | 跑函数与跨包测试，核对空白输入被拒绝、有效原文仍保留。 |

```bash
pnpm --filter @form-engine/materials-react test date-range
pnpm --filter @form-engine/pure-functions test text-is-non-blank
pnpm exec vitest run tests/integration/business-functions.test.ts
```

准备交付时，用 `asset:change` 记录兼容影响，用 `assets:check` 核对资产，再用 `release:plan` 预览版本变更。继续看[完整开发步骤](../usage-guide.md#usage-asset-development)与[资产 CLI 手册](../../../tools/engineering/assets/README.md)。
