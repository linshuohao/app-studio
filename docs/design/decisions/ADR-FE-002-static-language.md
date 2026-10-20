---
id: ADR-FE-002
title: ADR-FE-002：纯表达式、结构化引用与局部词法 Scope
type: decision
status: accepted
layer: 跨层
modules:
- M02
- M03
tags: []
related:
  decisions: []
sources:
- SRC-PROTOCOLBASELINE
- SRC-L1
- SRC-L2
navigation:
  group: 09 · 决策与追溯
  order: 112
last_reviewed: '2026-10-21'
status_note: 已确认，类型与签名待固化
---

# ADR-FE-002：纯表达式、结构化引用与局部词法 Scope



## 背景与约束 {#adr-002-context}

需要让跨字段计算、深层动态 Props 和重复数据可以静态检查、跨端复用，又不能把 L1 变成通用程序语言。数据位置、词法名称和运行时项身份必须区分；G03 的受限语言边界约束后续接口。

## 已确认选择与备选 {#adr-002-decision}

表达式采用纯 AST，ValueSpec 用显式 `$expr` 递归嵌入，Literal 明确转义。能力调用是同步确定性的 Pure Function，不读外部可变状态、不 I/O、不写 Data；复杂同步校验复用相同能力，Internal assert 保持 boolean。

Reference 采用结构化来源 / 路径；根路径简写固定从 Data 根开始。局部 ScopeBinder 以 one / each 建立词法绑定，禁止任意位置新建 Scope、动态拼写入路径或隐式捕获调用方 Scope。ScopeHandle 与 DataReference 分责。

原资料保留过全局 Scope 注册表、多类可执行配置和泛化表达能力；当前以局部 Binder、纯 AST 和受控命令替代。避免解析间接性及不可分析行为，代价是作者需显式区分计算、触发、写入，复杂算法需版本化能力实现。未实际讨论的语言方案不补写为历史候选。

## 影响与未决边界 {#adr-002-consequences}

L2 按类型递归分析所有合法表达式位置及可能分支，Literal 不扫描，不能执行纯函数发现依赖。L3 求值当前输入，L4 通过统一能力读取动态 Props。AST Union / Literal 消歧、内置签名、短名到 core.* 映射、Schema 类型兼容和错误返回尚需固化；`op + args` 当前保留，改为 call 不是本次决策。

## 来源与关联 {#adr-002-sources}

- 现行：[Reference / Binder](../l1/02-data-reference-scope.md#reference)、[Expression 与使用位置](../l1/03-expression-validation.md#expression)、[Pure Function](../l2-preparation.md#l2-pure-functions)。
- 来源：[第一 / 二组与定稿](../source-map.md#src-l1)、[L2 原件](../source-map.md#src-l2)。[早期记录](../../history/2026-10-16-before-v1-final/changes-2026-10-15.md)保留 AST 方向认可、剩余边界未冻结的状态。
- 关联：[ADR-FE-005](ADR-FE-005-watch-subscription.md)区分读取与触发；[ADR-FE-007](ADR-FE-007-scope-comparison.md)管理真实身份；[OD-11 / 13](../governance.md#open-decisions)处理正式类型与输入交接。

### 2026-10-20：严格结构、保留标记与可证明兼容

协议结构采用严格检查：未知字段、混用多个 Union 分支及不符合当前分支的字段在配置 / 编译阶段拒绝，不静默忽略或仅警告后继续产出可执行制品。严格范围是协议节点；Working Data、metadata、Schema 和物料 Props 等各按所属数据 / Manifest 契约检查，不能把业务字典的任意键一律当未知协议字段。

ValueSpec 位置的 $expr / $literal 为保留标记键。出现标记键必须按对应包装校验，包装结构不合法直接诊断，不退回普通对象；需要原样保留含这些键的数据时用 $literal 显式转义，其内部不再递归解释。只在类型规定的 AST / ValueSpec 位置解析，不扫描 Working Data、业务 Schema 或 Literal 原文。Expression 的 literal 与 ValueSpec 的 $literal 属于各自语法位置，不混用。

跨 Template 参数、Binding Port、函数参数等类型连接，仅接受明确可判定且能证明兼容的结构；已知不兼容与无法证明兼容均拒绝编译，但诊断码 / 原因应区分。不用运行时兜底、作者强制断言或静默降级绕过连接检查。受限的是静态连接兼容检查能力，不将业务数据根 Schema 改成局部 Schema，也不声称任意 JSON Schema 包含关系均可判定。可判定子集、Union 完整形状、签名与正反例仍需正式固化。

用户以业务稳定和正确性为依据，确认严格拒绝未知字段、保留标记须转义、不证明兼容则拒绝连接。细化既有受限语言原则，不改变字段 op + args，不新增通用类型断言或运行时转换机制。记录见 [L1 严格固化](../design-history.md#l1-strict-update)。


### 2026-10-21：首期表达式与连接基线

用户确认原生 TS / Schema 路线继续实施：递归 ValueSpec 普通对象禁止保留键、Literal 不递归解释。函数签名复用 JSON Schema，普通注册函数只接收值，有限内置 and / or / if 支持短路，静态读取覆盖全部分支；Missing 不隐式转 null，不进行字符串 / 数字强制转换或 eq 通用深比较。

静态连接首期证明常用结构类型（资源身份、基础类型、null、const / enum、对象、同构数组及可判定联合），无法证明与明确不兼容均拒绝；业务约束不作为 Working Data 写入门禁。具体函数参数及算法按[表达式契约](../l1/03-expression-validation.md#function-evaluation-contract)和[连接子集](../l1/08-decisions-release.md#schema-connection-subset)实施，不继续逐细节访谈。
