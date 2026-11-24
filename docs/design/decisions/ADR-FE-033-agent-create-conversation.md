---
id: ADR-FE-033
title: ADR-FE-033：首期创建配置、持久会话与异步接口
type: decision
status: superseded
layer: 平台
modules:
- M18
- M19
sources:
- SRC-AGENTBLUEPRINT
related:
  decisions:
  - ADR-FE-030
  - ADR-FE-031
  - ADR-FE-032
supersedes:
- ADR-FE-032
superseded_by: ADR-FE-035
navigation:
  group: 09 · 决策与追溯
  order: 143
last_reviewed: '2026-11-22'
status_note: 创建专用入口由 ADR-FE-035 局部替代。创建范围、工作台蓝图及 Runtime 验收保留；首期异步执行部分已由直接调用增量决定替代，未授权开发
---

# ADR-FE-033：首期创建配置、持久会话与异步接口

> 2026-11-22 增量替代：首期执行以文末直接调用决定为准。以下保留原决策经过。

用户指出诊断入口要求用户已知问题，决定先做配置创作；随后将已有版本编辑明确移出首期，并确认仅创建方案。用户要求中间会话可保存继续，生成并保存成功才完成归档。2026-11-19 明确授权归档接口与三个会话范围，同步后只做详细设计，不开始开发。

统一 Studio 助手外壳继续有效；首期先创建空白表单，进入多轮需求澄清、能力查询、候选生成检查、审阅与保存归档。一个配置创作 Agent 内含需求澄清，不先实现六套服务。已存在配置版本 / 发布版本编辑、任意草稿同步、诊断修复和发布留后续。

Platform 在 platform_db 持久化 Conversation / Turn / Proposal / 完成版本关系，Agent 在 agent_db 持久化 Run 执行与恢复资料。业务会话属于本人并受表单权限控制，历史不是长期记忆或知识库。首期改用双侧异步 202 受理及结果查询，可靠投递与幂等对账独立于浏览器；具体调度、恢复和保留规则仍须详细设计。

完成接口只引用最新且有效的候选，由 Platform 复用保存领域能力，原子创建配置版本并归档会话。用户在对话中调整候选，首期不接受手动修改候选原文再完成。其他入口已保存版本时冲突，不自动转成编辑。关闭页面不取消，活动轮次不能放弃，放弃不自动删表单。

本决定替代 [ADR-FE-032](ADR-FE-032-studio-assistant-entry.md) 的首批诊断修复、第二批新建、第三批会话恢复安排，保留其统一面板方向。局部替代 [ADR-FE-030](ADR-FE-030-agent-harness.md) 的首期修复 / 同步语义及 [ADR-FE-031](ADR-FE-031-postgresql-agent-runtime.md) 的会话归属 / 内存状态 / 不恢复假设；六类职责、Harness、三层 Loop、PostgreSQL 分域、双向凭证和快照检查原则保留。

唯一详细正文见[创建接口契约](../platform-studio.md#agent-create-contract)，职责见[三方设计范围](../platform-studio.md#agent-create-design-workstreams)。三个会话先在对话提交详细设计和验收，共享语义经统一确认后归档。正式开发须另行授权。

2026-11-19 扩展方向增量确认：首期仍只交付 Studio 创建闭环；后续通过 Platform 边界的 MCP 适配层复用同一应用服务，插件 / Skill 作为宿主包装，配置 Agent / Harness 继续复用。首期设计分离入口协议与业务用例，不提前开发 MCP、插件、外部授权或通用网关。外部初步接入以完整创建能力及 Studio 审阅保存为方向；工具 Schema、组合动作、外部确认和授权待后续专题。详见[MCP 扩展方向](../platform-studio.md#agent-mcp-extension)。本增量不替代已确认创建接口，也不授权开发。

2026-11-22 增量确认[智能表单工作台蓝图](../platform-studio.md#agent-form-workspace)及[首期真实 Runtime 验收](../platform-studio.md#agent-create-runtime-acceptance)。B 端 Studio 承担创建与审阅，后续在 Studio 内增加定向编辑及测试修复；C 端由业务 Host 承接辅助填写。首期保持仅创建闭环，使用 Agent 生成的旅险候选验证实际 Runtime 行为，并审阅保存该候选。场景执行先用于交付验收，后续再接入 Builder。现有接口、状态与保存边界继续适用。用户授权统一归档和检查，未授权开发。

同日确认三方详细设计收口。最近候选与当前可保存资格分别表达，新轮受理暂停旧候选保存；预览和保存绑定确切候选及证据。采用可靠投递与对账、按执行代次接管、执行截止与结果对账分离。恢复使用必要窗口内加密的逐轮随机 Token，授权记录留摘要。详见[失败恢复](../platform-studio.md#agent-create-recovery)及[实施切片与预检未决项](../platform-studio.md#agent-create-delivery-slices)。模型供应方、具体限额和保留期限留实施预检确认。本次授权限于归档与检查。


2026-11-22 用户确认首期采用 [Platform 直接调用 CreateForm](../platform-studio.md#agent-create-contract)。此增量替代本 ADR 中的独立 Run 应用层、双侧异步接口、执行状态对账与接管恢复。Platform 保留持久业务会话和候选审阅保存，Agent 持有本轮 Graph 执行状态。首期创建范围、四类结果、确切候选检查、原子完成及真实 Runtime 验收保留。用户授权归档并继续设计 Graph 与工具。

2026-11-23 增量确认[候选编译修复循环](../platform-studio.md#agent-create-compiler-repair)。CreateForm Graph 统一调度修复和复验，最多 3 轮修复。Agent 持有本轮尝试状态，Studio 从最终受阻结果展示熔断原因。

2026-11-24 更新上述修复预算。每次执行最多 10 轮，同一未完成轮次由用户重试时，新额度从零起算并复用已完成步骤。已完成的受阻轮次从后续消息继续修复。现行规则见[候选编译修复循环](../platform-studio.md#agent-create-compiler-repair)。

2026-11-23 [ADR-FE-035](ADR-FE-035-agent-turn-graph.md) 替代首期仅创建、由固定创建入口开始的安排。
