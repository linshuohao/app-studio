---
id: MAP-CAPABILITIES
title: 纵向与横向能力图谱
type: design
status: active
layer: 系统
modules:
- M01
tags: []
sources:
- SRC-EARLY
- SRC-L1
- SRC-L2
- SRC-DEP
related: {}
last_reviewed: '2026-10-20'
navigation:
  group: 01 · 架构全貌
  order: 20
reading_next: PROTOCOL-L1
relocated_sections:
- source: docs/design/architecture.md
  anchor: mapping
  target: mapping
---

# 纵向与横向能力图谱

上一站：[整体架构](architecture.md)。首期包与 React / TS 目录见[应用工程架构](architecture.md#application-engineering)。本页先画能力全貌，再给每个能力一个清楚的去处。横向能力贯穿多层，不增加新的纵向引擎层。

## 产品能力定位与阅读层级 {#product-capability-map}

[整体蓝图](architecture.md#product-blueprint)回答产品由什么组成、怎样协作；本页将能力对应到责任与专题；各层 / 能力专题维护完整设计。它们属于文档阅读层级，不增加表单 L1–L4 的执行层。整体产品组织仍待审阅，已有核心责任继续有效。


```diagram
{
  "id": "figure-product-capability-map",
  "title": "产品能力地图 · 六部分及其主要能力",
  "rows": [
    [
      {
        "title": "四层引擎",
        "body": "声明、编译、数据与执行、校验、呈现"
      },
      {
        "title": "能力资产",
        "body": "物料、纯函数、契约与确定实现"
      }
    ],
    [
      {
        "title": "Host / 业务应用",
        "body": "请求、业务持久化、外部校验执行、提交"
      },
      {
        "title": "Studio",
        "body": "定义编辑、诊断、预览、调试；完整产品待设计"
      }
    ],
    [
      {
        "title": "Platform",
        "body": "资产、构建、发布、分发、权限与审计；方案待确认"
      },
      {
        "title": "Agent",
        "body": "创作、填写、诊断、知识与工具协作；具体接入待定"
      }
    ]
  ],
  "arrows": [
    "协作边界",
    "产品与治理扩展"
  ],
  "note": "卡片按职责分组，不表示上下依赖或完成进度。运行保障、监控与 Agent 辅助问题处理已纳入蓝图，可后置建设；具体方案待设计，不成为当前核心实现前置。"
}
```

| 能力范围 | 深入阅读 |
| --- | --- |
| 四层引擎 | 下方纵向图谱及 L1–L4 专题 |
| 物料 / 纯函数与 Host | [扩展与集成](extension-integration.md) |
| Platform / Studio | [范围与候选流程](platform-studio.md#platform-studio-status) |
| Agent 场景与完整能力 | [赋能与接入规划](platform-studio.md#agent-capability-plan)、[Agent 八层覆盖](platform-studio.md#agent-eight-layers) |
| 可观测性、监控与问题处理（已纳入蓝图，可后置建设） | [运行保障与 Agent 辅助处理](architecture.md#blueprint-operations) |
| 建设顺序与当前状态 | [蓝图建设路径](architecture.md#blueprint-roadmap)、[治理与待讨论事项](governance.md#design-status) |

## 纵向：四层核心能力 {#vertical-capabilities}

```diagram
{
  "id": "figure-capability-vertical",
  "title": "纵向能力：从声明到交互",
  "rows": [
    [
      {
        "title": "L1 · 协议与领域模型",
        "body": "描述数据、引用、Scope、表达式、约束、命令与视图"
      }
    ],
    [
      {
        "title": "L2 · 预处理与编译",
        "body": "规范化、静态诊断、依赖分析，交付 Prepared"
      }
    ],
    [
      {
        "title": "L3 · 运行时",
        "body": "数据与身份、统一观察、Command / Flush、校验与结果"
      }
    ],
    [
      {
        "title": "L4 · 呈现与交互适配",
        "body": "首期 React；物料实例、绑定、订阅、输入与 UI 生命周期，SDK 与实现待落地"
      }
    ]
  ],
  "note": "箭头表示准备与消费关系，不表示 UI 调用必须逐层转发。完整调用与状态交互见各专题。"
}
```

| 层 | 具体设计文档 | 阅读内容 |
| --- | --- | --- |
| L1 | [协议设计](l1/README.md) | 模型与顶层结构 → 数据 / 引用 / Scope → 表达式 / 约束 → Command / Reaction → 视图 → 生命周期 → 示例与类型 |
| L2 | [预处理与编译](l2-preparation.md) | 编译输入输出、诊断、静态分析、能力契约与 Prepared 交付 |
| L3 | [总览与 Flush](l3-reactive-engine.md)、[数据与 Scope](l3-data-scope.md)、[校验](l3-validation.md)、[Trace](l3-observability.md) | 唯一数据、身份、变化传播、Flush、错误，以及独立校验完成语义 |
| L4 | [呈现与交互适配](l4-renderer.md) | 行为专题已收敛，首期 React 已选；正式 SDK 与平台实现待验证 |

## 横向：跨层协作能力 {#horizontal-capabilities}

```diagram
{
  "id": "figure-capability-horizontal",
  "title": "横向能力图谱：每项契约在各层的责任",
  "columns": [
    "横向能力",
    "L1 · 声明",
    "L2 · 编译",
    "L3 · 运行",
    "L4 · 呈现",
    "Host / 平台"
  ],
  "rows": [
    [
      {
        "title": "依赖 / Scope"
      },
      {
        "title": "引用与 Binder"
      },
      {
        "title": "读取 / Watch 计划"
      },
      {
        "title": "真实身份与变化匹配"
      },
      {
        "title": "挂载 / 改绑 / 释放"
      },
      {
        "title": "订阅与消费"
      }
    ],
    [
      {
        "title": "校验 / 完成"
      },
      {
        "title": "Schema 与 Constraint"
      },
      {
        "title": "规则与前置准备"
      },
      {
        "title": "执行、结果与有效性"
      },
      {
        "title": "消费 Field State"
      },
      {
        "title": "外部校验与真实提交"
      }
    ],
    [
      {
        "title": "受控扩展"
      },
      {
        "title": "物料 / 纯函数引用"
      },
      {
        "title": "检查静态 Manifest"
      },
      {
        "title": "绑定纯计算能力"
      },
      {
        "title": "绑定物料实现"
      },
      {
        "title": "业务服务与请求"
      }
    ],
    [
      {
        "title": "诊断 / 观测"
      },
      {
        "title": "原始定义位置"
      },
      {
        "title": "静态 Diagnostic"
      },
      {
        "title": "临时事实 Trace"
      },
      {
        "title": "UI 接入与定位"
      },
      {
        "title": "报告与开发工具"
      }
    ],
    [
      {
        "title": "兼容 / 交付"
      },
      {
        "title": "声明格式契约"
      },
      {
        "title": "Prepared 与依赖锁"
      },
      {
        "title": "核对消费契约"
      },
      {
        "title": "目标平台实现"
      },
      {
        "title": "不可变发布原则"
      }
    ],
    [
      {
        "title": "产品 / 工具"
      },
      {
        "title": "作者需要编辑的模型"
      },
      {
        "title": "复用编译诊断"
      },
      {
        "title": "预览消费边界"
      },
      {
        "title": "预览呈现边界"
      },
      {
        "title": "Platform / Studio 待专题设计"
      }
    ]
  ],
  "note": "按行读一项横向契约，按列看某层参与什么。这里只重述已有责任，不表示各单元已经完成模块设计；窄屏可横向滚动或放大。"
}
```

| 横向能力 | 权威设计入口 | 各层的接缝 |
| --- | --- | --- |
| 依赖、Scope、订阅与生命周期 | [依赖编译与响应式订阅](dependency-reactivity.md) | 读取 / 触发 / 活跃订阅；编译 / 匹配 / 挂载分责 |
| 校验与完成 | [校验执行与结果](l3-validation.md) | 声明、前置、异步有效性、字段展示与 Host 提交 |
| 物料与业务宿主 | [物料扩展与 Host 集成](extension-integration.md) | Manifest、平台组件、外部请求和受控回写 |
| 诊断、Trace、保护与跨端验收 | [运行事实与诊断](l3-observability.md#l3-trace)、[编译验收](l2-preparation.md#l2-acceptance) | 编译错误定位、运行事实、错误隔离、共享语义验证 |
| 资产与发布约束 | [双构建链与不可变交付](l2-preparation.md#l2-release) | 平台管理资产，编译器产出准备结构，运行时核对兼容 |
| Platform 与 Studio | [范围及待设计工作](platform-studio.md) | 现有责任说明与未来产品 / 模块设计分开 |

## 六大设计方向映射到各层 {#mapping}

六个方向是贯穿各层的评审维度，不是六个新的纵向层级。

| 方向 | 主要涉及层次 | 核心问题 |
| --- | --- | --- |
| 协议灵活度与复杂度 | L1 + L2 | 简单配置简单，复杂场景能组合，扩展不破坏静态分析 |
| 逻辑编排与运行时 | L3 + Host 边界 | 内部状态如何稳定修改、观察和恢复，外部流程由谁拥有 |
| 跨端一致性 | L1 + L3 + L4 | 共享哪些规则，允许哪些 Profile / 平台差异 |
| 物料与扩展性 | Material + L4 + Host | 扩展契约明确，领域需求不侵入核心 |
| 制品兼容与演进 | L1 + L2 + Tooling | 定义、数据与依赖如何长期可用、迁移和回滚 |
| 工程治理与质量 | 所有层 | 每个关键语义可验证、可解释、可追踪 |

### 必须警惕的跨层破坏

- **协议任意 JS：**破坏纯计算、静态分析和跨端语义。
- **物料直接写 Store：**绕过受控命令、实际变化、校验失效和通知。
- **Renderer 自算业务：**造成跨端规则漂移与第二份权威数据。
- **索引不带定义/依赖版本：**破坏缓存、发布和回滚正确性。
- **外部结果不核对有效性：**将旧请求、已删除实例或过期校验当成当前事实。
- **把概念图当作已实现保证：**在未设计事务、身份或跨端契约前宣称生产验收通过。

## 看完图谱以后 {#after-map}

第一次系统阅读按 L1 → L2 → L3 → L4 展开；研究跨层问题时直接进入上表专题。哪些尚未讨论完、下一次讨论做什么，统一看[设计进展](governance.md#layer-progress)。
