> 历史过程快照，非当前规范。当前决策见 [L1 V1.0](../../reading/l1-definition-protocol-v1.html)。

# 全文一致性检查与修订 · 2026-10-16

## 检查范围与结论

检查根目录 8 份现行 HTML、README、两份调整记录，以及历史目录的职责标识。以第三组 ADR-03-00 / B1–B8 / EXT-1 / EXT-2 / VAL-EXT 为最新边界，继承第一组 D1–D7 和第二组 E1–E7 / C1–C3 未被替代的结论。

发现的主要问题是：早期正文仍写着旧模型，页首补充说明与正文冲突。本次直接修订第一、二组正文与图示、代码示例、状态和交接；不再让读者自行合并各轮补丁。原始章节迁至历史目录保留，不修改下载文件。

## 已修正的问题

| 位置 | 原问题 | 现行修正 |
| --- | --- | --- |
| 第一组 D2 | Resource / Submit 混入核心值消费链 | Host 消费可用当前值；请求与提交是核心外流程 |
| 第一组 D3 | 示例声明 source: resource，暗示核心内置资源源 | 当前示例仅使用 data / context；外部远程候选交适配器，不冻结新命名空间 |
| 第一组 D5 | 核心清理 resource 状态 | 核心清理内部实例状态，Host 管理外部任务；通知接口后议 |
| 第一组 D6 / D7 | 稳定修改、回填优先仍写成待选择 | 沿用第三组 B6 和第一组 D7；只保留结算算法、Reset 等细节待议 |
| 第一组结尾 | 下一组仍为 Expression | 第二、三组已完成，当前下一阶段统一为第四组 View |
| 第二组 E6 / E7 | 核心 Resource Slot、外部 Capability 作为纯求值阶梯末端 | 核心纯计算止于 Pure Function，I/O 退出核心归 Host；外部请求参数不是已确认的核心 Slot |
| 第二组 C2 / P7 | 异步任务和请求状态交 Resource + L3 Validation | Host 执行异步校验；引擎至多可选被动 Issue 接口，正式状态和合并尚未冻结 |
| 第二组执行图 | Runtime 承担“资源协调” | 改为纯求值、同步约束、成本与数据 Command / Reaction；Host 单列 |
| 第二组测试示例 | 把 "12." 必然失败写成普遍规则 | 明确是某严格 Codec 用例，接受性按 Codec；始终不增加 Incomplete |
| 第二组交接 | form submit 等列作未决的通用 Command，并重开事件/资源议程 | 同步第三组有限数据 Command、watch/when 与覆盖原则；提交归 Host，Reset 完整语义第五组细化 |
| 主台账 | 旧 context.agePolicy 路径、无版本纯函数，与已采纳引用不一致 | 改为类型化 context Reference 和版本化 Pure Function 示意，不冻结具体语法 |
| 主台账 | 当轮日期、状态和历史原文说明混同 | 当前同步日期明确；D2 已采用与编辑上下文未定分开；旧原稿只在历史目录 |
| 整体架构 | Prepared Form 仍包含核心资源引用 | 明确核心准备数据/表达式/Command/Reaction/物料契约，不含网络任务与资源 Store |
| 整体架构 | 初始化/分步看似完整定稿，blur 与数据入口混用 | 保留 D7/B6 方向，生命周期/校验/Reset 细节后议；局部 UI Intent 不并入通用数据事件 |
| 整体架构 | 字段快照与一个字段多视图的控制状态容易混淆 | 数据/同步诊断与 ViewNode Slot 结果分开；具体 Controller/Snapshot 接口第四组细化 |

## 统一后的判断依据

1. 唯一可写 Work Data；Typed Read 为成功/失败，Missing、null、业务 invalid 分开；不回退旧有效值。
2. JSON AST 与显式动态 Slot；内联/命名复用/Pure Function 不产生 I/O 或写入副作用。
3. Constraint 为同步合法性断言；允许无效编辑态，不自动变成事务回滚条件。
4. 修改统一走数据 Command；Reaction 为多 watch OR、纯 when、同步 then，when 依赖不自动加入 watch。
5. 同步顺序确定、同目标后写覆盖；不恢复 priority/冲突仲裁 DSL，跨轮算法仍未冻结。
6. 外部请求、缓存、重试、上传、提交与异步校验执行归 Host / View Adapter；可选被动 Issue 不等于核心任务调度。
7. 多 View 共享数据与业务语义，Profile 与平台目标分开；staged 的完整语义尚待第五组。
8. 第四组 View → 第五组 Lifecycle / Editing Context → 第六组 Protocol；剩余接口继续细化，不重开已采用方向。

## 历史与后续维护

- 根目录为现行同步版，各组章节锚点保持。
- `docs/history/2026-10-15-round-originals/` 保留用户提供的三组原始正文，带历史标识及返回当前版导航。
- 2026-10-14 历史快照与旧调整日志仅为演进证据，不参与当前状态判断。
- 每次新决策先更新主台账，再回写受影响的前文正文、图示、示例、接口、状态和路线；仅加页首说明不算完成同步。
- 本次未新增设计决策，没有冻结 Codec、AST 精确语法、传播表、预算、调度、staged 或外部 Issue 正式 API。

## 验证

逐份核读现行正文，并按职责与关键术语复查；检查现行及历史 HTML 的本地文件链接、章节锚点、重复 ID 和 Markdown 文件链接；原始归档章节与源文件逐节比对，确认历史副本保留来源内容。

检查结果：8 份现行 HTML 已逐份核读；连同历史副本共 15 份 HTML，319 个 HTML 链接和 27 个 Markdown 链接检查通过，无重复 ID。历史三组分别 13、16、19 节，与用户源文件逐节一致。此检查验证文档内容与导航，不表示未实现的引擎契约已通过运行时测试。

## 第四组后的同步补充

本检查的初始结果反映第三组之后的状态。第四组已归档，主台账、前文正文、示例和后续入口继续按维护规则回写，最新状态以主台账为准。独立 Profile/关联 Binding/默认 Live Edit 已确认；Material 树、Manifest、静态 Fragment 和有限 Event → Intent 原则确认。下一阶段已由第四组推进至第五组。原文/当前版区分继续有效，源码细节与新增编辑上下文不因本次集成自动冻结。

## 第五组后的同步补充

第五组已归档并回写正文。此前“可选被动 Issue 接口”的未定边界由 F4/F5 扩展为已确认的校验义务、五态、Issues/有效性和 Readiness；Host 仍管理真实请求与提交，核心没有网络调度。主台账与当前文档使用第六组 Protocol 作为下一阶段入口。F1/F2 只推荐，不将 Reset/合成细节自动升格为定稿；报告/输出精确 API、Codec、AST 和执行算法继续未冻结。

## 第六组后的同步补充

第六组统一架构与原理组合验收已集成。当前正文以统一 ScopeBinder/Handle、根路径固定、递归 ValueSpec、Profile entry/Named Template、容器物料呈现与 Host 三路径为准；旧独立 repeat、fragments、view.present/dismiss 和深层 Prop 白名单只可在历史对比中出现，不能继续作为当前配置示例。下一步 Material Validation Metadata 为本轮明确发现的能力缺口，最终 Schema 与引擎运行验收尚未交付，F1/F2 与 P6 状态保持。

第六组集成后验证：21 份 HTML、526 个本地链接及章节锚点检查通过，无重复 ID；47 个纯 JSON 值解析通过，现行代码块未发现已撤换语法。第六组 32 节历史原稿与下载源文件逐节一致，当前版仅修正已注明的“命名资源”笔误；42 个 Markdown 文件链接有效。以上为文档与示例检查，不代表引擎已实现。
