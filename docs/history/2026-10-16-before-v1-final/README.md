> 历史过程快照，非当前规范。当前决策见 [L1 V1.0](../../reading/l1-definition-protocol-v1.html)。

> 2026.10.17：本目录阅读副本已统一 Pure Function（纯函数）术语与相关链接；原始字节保存在 [来源包](../2026-10-17-decision-sources.zip)，当时的候选结论仍仅供追溯。

# 复杂动态表单与数据录入引擎

[文档首页](index.html)可直接用浏览器打开，无需构建。

## 当前文档

- [整体架构](complex-dynamic-form-architecture-v1.html)：四层保持，Runtime 内部与 Host 边界已按第六组同步。
- [L1 主台账与路线](l1-definition-decisions-and-roadmap.html)：汇总当前状态、替代关系及后续路线。
- [第一组决策](l1-round01-data-value-reference-scope-binding.html)：D1–D6 采用，D7 原则确定，正文与示例已同步至第六组结论，原稿存历史目录。
- [第二组决策](l1-round02-expression-pure-function-constraint.html)：E1–E7 / C1–C3，保留原则确认/方向认可，正文已按第三组修订；原稿存历史目录。
- [第三组决策](l1-round03-behavior-reaction-command.html)：Command、同步 Reaction、Host 边界及明确否决方案；集成于 2026-10-16，源归档日期为 2026-10-15。
- [第四组决策](l1-round04-view-profile-material-interaction.html)：V1/V4/V7 已确认，V2/V3/V5/V6 原则确认；22 节原始归档和未冻结接口。
- [第五组决策](l1-round05-form-lifecycle-validation-submission.html)：F1/F2 推荐保留；F3/F4/F5 已确认；F6 原则确认。义务、被动校验五态、有效性及 Readiness，保留 26 节源文。
- [第六组决策](l1-round06-definition-protocol-convergence.html)：32 节协议架构收敛与原理组合验收；精确 Canonical Schema、Material Validation Metadata 与实现尚未完成。
- [能力与抽象边界](l1-capabilities-and-abstraction-boundaries.html)、[待讨论契约](l1-definition-design-draft.html)：同步当前决策的配套材料。
- [第三组集成记录](changes-2026-10-16.md)、[前两组记录](changes-2026-10-15.md)。

## 当前基线

四层仍为 Definition → Preparation → Runtime → Renderer。Data / 多 Views 分离，唯一权威 Work Data；Typed Read 仅成功/失败，Missing 与 null 分开；统一类型化引用、词法 Scope、Runtime ID 和受控 Binding。

Expression 使用受控 JSON AST、Pure Function、Named Expression、显式 Slot 和多维成本治理。Constraint 只判断合法性，允许不完整或无效工作态，不自动写数据。

第三组核心只新增 Command 与同步 Reaction。Command 只修改 Form Data；Reaction 多 watch 按 OR 形成触发候选，when 纯求值且依赖不自动加入 watch，then 为同步 Command。一个对象修改可以产生多条变化引用。同步覆盖按确定顺序后写生效，不默认报错，不强制 priority / 冲突仲裁 DSL；精确跨轮顺序、循环和回滚由 L2/L3 继续设计。

外部请求、远程选项、Loading / Error / Retry / Cache、异步校验执行、上传、提交和工作流均归 Host / View Adapter。Runtime 不拥有 Resource Store，不建 Universal Capability Registry 或异步 Action Pipeline。Host 检查外部结果适用性后通过 Command 写回。第五组 F4/F5 已确认 Runtime 知道已声明/注册义务，被动登记 Unverified/Pending/Valid/Invalid/Error、Issues、有效性与 Readiness；具体注册、token、报告/输出 API 仍未冻结。Host 继续执行请求，不新增异步 Reaction 或核心 Resource。

## 第四组已确认方向

独立 View Profile 可按需交付；视图采用 Material 组合树，保留必要 Repeat/Scope，不新建完整 UI 节点分类。Manifest 声明 Props、具名 Binding Port 与必要类型化 Event Port。Binding 只关联数据，编辑能力由 Adapter 决定，修改走 Command，不增加 read/write 逆向映射 DSL。

Material 内部交互和容器呈现留组件；第六组仅保留 form.command / host.emit 受限连接，移出核心 view.present / view.dismiss。原 Fragment 收敛为 Named View Template / 静态 $use。V7 默认详情实时编辑同一 Work Data，完成/关闭不自动回滚，真正 Draft/Cancel/Undo 需求第五组另议。

## 第六组当前收敛

单一逻辑 Definition 按 Data / Expressions / Constraints / Reactions / Views 组织，可按需 Named Template。Authoring 简写不增新语义，Canonical 描述跨端协议，Prepared 为内部准备结构；顶层字段与精确 Schema 尚未冻结。

Reference 根路径简写始终指向 Data Root，局部显式 scope。View ScopeNode、规则入口共享 ScopeBinder from/as/mode(one/each)，身份由 L3 统一；值引用与实例 ScopeHandle 分开，不能将 Handle 当业务 ID 发给服务端。

Material props / Command value 是递归 ValueSpec，任意嵌套显式 $expr 都被识别，不再维护深层动态属性白名单；结构字段、Work Data、Schema default 和外部原始 JSON 不扫描执行。全局 Named Expression 不隐式捕获调用者局部 Scope。

ViewNode 为 MaterialNode / ScopeNode / TemplateUse。Profile entry + viewTemplates/$use 静态复用；模板参数显式传 Handle，既不共享 UI 实例，也不动态替换 DOM。容器 Material 通过 Slots 自主管理开闭，不建立核心 Presentation。children 建议只是 slots.default 简写，不能重复提供。

Host 三条路径：外部校验义务由 Host Validator 执行；host.emit 发送有类型业务意图；Material Adapter 使用注入 Host Services。它们不合并成通用 Resource/Action/Workflow DSL。F4/F5 义务、五态、有效性和 Readiness 保持。

## 后续交付顺序

1. Material Contract + Validation Metadata：补齐字段、对象摘要及数组项校验状态/Issues 的消费接口。
2. 最终 Canonical Schema，收敛 AST、引用、Scope/Handle、ValueSpec/Literal、规则、命令、视图/模板与 Host 字段。
3. TypeScript 类型与 Schema 校验器保持同一语义。
4. L2 Preparation Contract：规范化、词法编译、表达式发现、依赖/模板/能力检查。
5. Profile Bundle 与跨端契约验收，保留完整共享业务规则。
6. L3 专项：Diff、调度、稳定发布、回滚、实例身份及失效。

第六组“通过”是表达原理可组合，不是运行时测试报告或 L1 V1 已发布。F1/F2 默认值/Reset 仍推荐，P6 版本策略为候选细化；Literal、命令 Patch/Remove、模板参数、Material Validation Metadata 和精确 SDK/API 仍未冻结。

## 维护规则

根目录文档都是现行同步版。后确认的决策必须回写主台账、前文正文、图示、示例、状态表及后续入口，不能仅在页首加提示。旧原文只存历史目录，带非现行标识。已确认/原则确认与待细化分开，不把示意 JSON 或执行算法当作定稿。

决策冲突按后确认的结论更新前文；无新决策时不自行冻结尚待细化的接口。每轮同步检查职责所有权、状态口径、示例引用、动态槽位、触发与写入、外部 Issue 和路线，并检查链接/锚点。

[2026.10.14 历史快照](../2026-10-14/README.md)不作为当前设计依据。

[本次全文一致性检查](consistency-review-2026-10-16.md)；[前三组历史原稿](../2026-10-15-round-originals/README.md)仅供追踪，不参与当前设计状态判断。

第四组集成详情见[2026.10.16 调整记录](changes-2026-10-16.md#第四组集成)；[第四组历史原稿](../2026-10-16-round-originals/README.md)仅供来源追踪。

第五组 Readiness 仅证明当前已知、适用、必需的校验已满足且与输出一致，不等于 Host 提交许可。义务需预先声明/注册，同 ID/Scope 不静默覆盖；结论按实例、规则、Scope、依赖状态和调用有效性接受，防止乱序/ABA。上报 Valid 不自动恢复或触发 Reaction。详见[第五组集成记录](changes-2026-10-16.md#第五组集成)。

[第六组集成记录](changes-2026-10-16.md#第六组集成) / [第四至六组历史原稿](../2026-10-16-round-originals/README.md)。
