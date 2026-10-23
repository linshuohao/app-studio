---
id: ADR-FE-019
title: ADR-FE-019：Host 显式替换只读 Context 与统一失效
type: decision
status: accepted
layer: 跨层
modules:
- M03
- M12
- M13
- M14
- M15
related:
  decisions:
  - ADR-FE-008
  - ADR-FE-010
  - ADR-FE-017
  - ADR-FE-018
sources:
- SRC-L3BASELINE
navigation:
  group: 09 · 决策与追溯
  order: 129
last_reviewed: '2026-10-22'
status_note: Host 更新与保守整体失效已确认；不新增 L1 Context Watch，Runtime / Adapter 接口尚未实现
---

# ADR-FE-019：Host 显式替换只读 Context 与统一失效

## 问题与场景

Context 由 Host 提供、表达式只读，原设计没有明确同一实例中环境变化的交接方式。完整校验证明又必须对应本次 Context，不能更新宿主环境后继续以旧证明代表当前输入。

同一表单中的宿主流程状态、只读操作资格等确有更新需要。用户选择的地区 / 币种 / 方案属于业务输入，放入 Data；查询候选项沿物料 Request / Host 资源管理；更换业务单据或根业务身份通常由 Host 明确替换实例，不将这些状态统一塞进 Context。

## 已确认决定

1. Host 可以显式提供新 Context 快照；Runtime 接管输入并解除可变别名，赋予新 Context 身份。禁止依赖 Host 原地修改对象，表单表达式仍只读，Data Command 不能写 Context。
2. 已开始的调用保留自己的 Context 读取快照。替换后旧完整校验证明失效，旧调用不能混读新 Context 后仍作为旧输入结论发布。
3. 首期采用保守整体失效：撤销旧外部校验任务的发布资格并尽力取消，使校验来源失效、登记重新校验；已挂载动态表达式缓存失效并重新读取。保留“未重新校验”状态，不能因旧 Issue 撤销就报告通过。
4. 当前 Flush 正在执行时，新校验在其结束后启动；没有 Reaction Flush 时独立启动。沿用根 Schema 与 Constraint 的统一流程、同步前置和任务有效性，不新增 Context 路径依赖分析或通用异步调度。
5. Context 替换是明确的 Host 管理操作，不自动使 Reaction 入队，不增加 ContextReference 类型的 Reaction.watch / External.watch，也不扩展 L1 Command。必须随变化重新写入业务字段的输入应在 Data 中表达并使用既有 Watch。
6. 能力用于相对低频的宿主环境更新。语言 / 显示环境优先由 Host / L4 处理，只有表达式确需读取时进入 Context；高频查询、加载和请求缓存继续由既有 Host / 物料通道管理。

## 取舍、接缝与状态

保守整体失效减少遗漏：Runtime 无法从 Host Validator 任意代码发现 Context 读取，当前 Prepared watch 也只包含 Data。代价是可能重新求值无关表达式、撤销无关外部校验并多发请求；本期接受这一成本，不承诺 Context 路径级精确更新。

Data 修改仍使用原有精确观察与任务有效性；不能把 Context 替换的保守策略推广成“任意 Data 变化取消所有请求”。原有 watch: [] 仍表示没有 Data 观察项，不意味着动态表达式可以忽略明确的 Context 替换。

replaceContext 是说明性接口名，具体 TS 名称、返回值、输入身份编码和通知交接在 Runtime / L4 契约中整合。此能力属于实例管理接口，不改变可交换 Prepared 字段，不把回调、任务或 Context 身份写进 L1 / Prepared。Compiler 的 Context 静态类型证据仍遵守现行输入约定，不由本 ADR 自动获得。

这是一项新增管理行为；原有表单侧只读和 Data-only Watch 约束保持。现行契约见 [Host Context 交接](../extension-integration.md#host-context-update)，本轮未实现 Runtime、Adapter 或候选验证器。

## 来源

[SRC-L3BASELINE](../source-map.md#src-l3-baseline)及[设计演进](../design-history.md#l3-domain-baseline-confirmed)。
