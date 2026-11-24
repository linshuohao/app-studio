# 实施设计

## 权威依据与确认

以 [proposal](proposal.md#权威与确认) 引用的现行主题为准，完整设计不在本目录复制。已确认直接破坏性升级、按需观测、会话录制与固定版本分页；proposal 完成后用户要求继续，当前进入 W3 首个内部切片；OpenSpec ready 本身不作为业务实现或验收证据。

## 内部方案与影响

| 切片  | 实施落点                                                                                       | 保持的不变量 / 消费者                                                              |
| ----- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| OBS-0 | runtime/src/devtools 的新 DTO、版本检查和操作判别；devtools 的客户端 / bridge / transport 类型 | 旧协议拒绝，无兼容层；业务 API 和 Prepared ABI 不变                                |
| OBS-1 | Runtime / Renderer 元数据适配、固定快照、分页和值检查；工具实体与关系 Store                    | 元数据不复制全量值，不注册业务 observe；同版本分页、稳定成员身份                   |
| OBS-2 | runtime.ts、commands、reactions、diagnostics 的采集接缝；registry、桥接游标确认、工具因果索引  | 原调度顺序 / Flush 保护不变；同步固定最小事实，异步交付；录制不影响业务            |
| OBS-3 | validation/manager.ts、work.ts、Renderer requests / diagnostics                                | Source / Work / Call 分责，settling 和发布资格保留；晚返回只更新历史；异常现场独立 |
| OBS-4 | devtools Store / projection / UI / extension；测试夹具和 E2E                                   | 共用选择、折叠保留跨组边、统计去重、当前 / 历史分开；无工具时业务等价              |

实现组织沿现有包及开发子入口，不新增依赖倒置。图模型用纯 TypeScript，SVG 连线加 DOM 节点，布局与投影分离；仅拓扑 / 折叠变化触发布局。定义模板与绑定实例分层，生产者 DTO 不包含可执行对象。

技术处理必须沿现行契约：queueEntryId 区分一次待执行与再次入队；事件身份和交付游标分离；缺口控制信息有界且不伪称完整；snapshot S@c 加无缺口增量 (c,d] 对齐终点 d。删除后新建 / 整数组替换与 set 现有成员对象分别验收。

已有代码只作为迁移基线，不把当前 reaction.execute、命令字符串或读取即清空的桥接当成满足新事实契约。移除旧路径时核对 Runtime、Renderer、客户端、扩展及测试调用方，不能只改类型。各端同步升级指可用协议切片一致，不要求一次大提交完成所有 OBS 阶段。

## 验证与风险控制

specs 仅声明本次验收增量，tasks 为唯一执行清单。阶段先补捕获真实反例的测试，再实现；失败路径和跨层时序安排独立上下文审查。验证覆盖协议拒绝、元数据 / 值隔离、快照重入、录制租约、因果合流、异步资格、事件重试及 UI 完整操作，不用 Runtime Command 测试替代扩展 UI E2E。

workflow.json 列出后续完整变更门禁，不在 proposal 阶段运行它们或生成执行收据。实施中先确定命令可用性和测试覆盖，生成 / 格式化在 verify 前完成。容量 / 租期 / 性能默认值由测量固化，若暴露新的可观察行为选择再按 A 级确认。

## 变更与恢复

- 初始基线为 fd96b3c 加当前混合工作区；项目现有 docs、代码和未跟踪资产有其他工作，不纳入本变更所有权。首次实现前重新记录 HEAD、暂存 / 未暂存 / 未跟踪范围及相关调用方。
- 本变更从建立时即采用 breaking change，原渐进兼容不进入实现任务。具体用户修订依据见 ADR-FE-025，不再次要求确认已定原则。
- 需求 / 现行契约 / 生产者与消费者结构实质变化后更新本文件和 tasks，运行 `python3 tools/engineering/workflow.py invalidate devtools-observation-graph`，重开受影响项并使旧审查过期；保留仍适用的证据。
- 恢复使用 `python3 tools/engineering/workflow.py resume devtools-observation-graph`，先复核契约、Git、未关闭发现和任务，不直接从聊天假定实现完成。
- 完成实现后维护权威正文实际状态、独立审查和修复复验，再运行项目 verify / archive。禁止默认 sync；无 P0/P1 未关闭、必需检查通过、非空任务全完成才可成功归档。不自动推送 / 合并 / 发布。

## W3 预检与当前证据（2026-11-08）

基线仍为 `fd96b3c`，工作区有大量其他设计、物料、应用与流程改动。本轮开始时已在 `/private/tmp/devtools-implementation-baseline/` 保存 git status、相关包、DevTools 测试与本变更目录，用于隔离增量；它是本机复核副本，不是发布依赖。代码范围为下列会话内核和后续传输接缝；未修改旧生产 Hook 行为、Runtime 调度、Renderer 或业务组件。Runtime devtools/index.ts 仅增加新协议类型导出，未导出或安装可调用的新 Gateway。

预检依据为 observation-technical / observation-query-contract / observation-snapshot-protocol / ADR-FE-025。现有 Hook 的 list / read / subscribe 同时被 Runtime、Renderer、bridge、client、panel 与测试消费，必须同步切换；目前不能只更改版本号或把旧快照翻译为新事实。数组既有成员 set 保留身份、整数组 set 重建身份；校验 Source / Work / Call、Flush 封存与必要异常现场均继续遵循现行契约。

内部会话切片及反例关联：

| 实施位置                                                | 已有行为与验证                                                                                                   | 未覆盖范围                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `packages/runtime/src/devtools/observation-protocol.ts` | 独立版本、producer / epoch、失败判别、元数据版本与 Data / Context 输入版本分离                                   | 完整 Reaction / Work 事件联合与页面请求信封待补齐                            |
| `packages/runtime/src/devtools/observation-session.ts`  | 固定有界元数据快照、稳定分页重试、游标确认与 gap、会话租约、录制边界 / 连续录制 / 隔离、按版本取值、销毁清理     | 尚未接入发现 Hook / 实际业务生产者；capture 仅边界，既有工作摘要待采集层补齐 |
| `packages/runtime/tests/observation-session.test.ts`    | 20 项正反例：旧版本拒绝、跨会话引用、页间修改、超限 / 过期、确认不吞新事件、元数据与录制分开、重入及平台失败释放 | 不能替代真实业务、跨端和四视图验收                                           |

契约内 B 级选择：核心注入可信平台时钟、唯一令牌和异步定时器，不引入 DOM / Node 依赖；启动新窗口携带前一 captureId 作为比较前置条件，保存最新控制收据即可拒绝过期重试，无“一会话只能录一次”限制；分页令牌按页缓存，最多有界快照行数，随快照到期清理。所有容量与租期由构造参数传入，测试值不作为正式性能预算。以上不变更业务调度或公共业务 API。

独立审查范围为这三个新文件（基线为 HEAD + 当前工作区）。审查发现并修复了快照重入绕过会话上限、误用元数据版本校验业务值、停止后无法再次录制、inspect 内关闭后遗留租约、返回版本借用可变引用、定时器创建 / 续租失败未完整回滚；另补快照多页复读反例。最终独立复核 20 / 20 通过，限定范围无未关闭实质问题；该结论不覆盖旧 Hook / 跨端迁移。

当前进度：仅 1.1 预检完整完成；1.2 / 1.3 / 2.1 / 2.2 / 3.2 / 3.3 有内部核心、调用链接缝及定义 / 拓扑适配，但各完整任务仍未完成。已补齐 Prepared 规则 / Schema 和真实 DataStore 拓扑的内部适配；运行实例 / 校验 / Renderer 的当前目录与 owner 生命周期已补齐（见后续实施记录）；接下来需补完整生命周期增量及事件 DTO，再统一接入 Hook 与面板，不能发布新旧双协议。四视图、扩展 E2E、成本测量、完整变更门禁与归档均未完成。

首个会话切片执行结果：`pnpm --filter @form-engine/runtime test`：16 个文件 / 159 项通过（含新增 20 项）；`pnpm --filter @form-engine/runtime typecheck`：通过；新增三个文件的 `pnpm exec eslint … --max-warnings 0`：通过；`OPENSPEC_TELEMETRY=0 openspec validate devtools-observation-graph --strict`：通过。与预检副本比较，Runtime / Renderer / DevTools 的既有文件无本轮改动。当前仅更新 OpenSpec 实施记录，未修改 docs/design 正文或生成阅读页，因此本切片不重建文档。未运行全仓 check、扩展 E2E、成本测量或 workflow verify，不生成全变更执行收据。

### 内部请求与传输接缝的后续实施

恢复时 `workflow.py resume devtools-observation-graph` 返回 19 项任务、1 项完成；HEAD 仍为 `fd96b3c`。本次修改前的相关源码与变更记录另保存于 `/private/tmp/devtools-gateway-baseline/`，只用作增量复核，不覆盖上一切片证据。

- `observation-protocol.ts` 增加版本 / requestId 信封、声明操作判别联合、能力目录与回复类型；`observation-gateway.ts` 负责多个生产者路由、epoch / 会话归属、参数和可选能力检查。只接受已声明只读 / 会话操作；未知操作、字段、非法位置 / 版本被拒绝，getter 不执行。构造时显式给定生产者上限，没有把测试预算当正式默认值。
- Gateway 注册句柄退出时释放该生产者会话；旧发布句柄不会影响后来注册的生产者。`observation-session.ts` 仅补内部 `hasSession`，不读取生产者、不续租。生产者必须使用新的 epoch 表示新生命周期。
- `packages/devtools/src/bridge/observation-request.ts` 是自包含的新版转发接缝；不安装 Hook、不另存桥接会话、不隐式读取 Data / Context，也不调用旧 read / subscribe。`client/observation-client.ts` 固定请求与发送副本，以同一 requestId / 游标显式重试；无自动轮询或自动重试。`client/observation-reply.ts` 验证回复对应关系、状态、操作结构、producer / epoch、取值输入版本及停止录制的 captureId。
- 真实注册能力目前仅声明 metadata / values / capture-boundaries；不伪称已有完整执行事件、在途工作摘要或异常证据取回。locateEvidence 明确返回 unsupported。现有生产全局 Hook 与面板仍消费旧入口，新接缝未被安装或单独发布，因此并非新旧双协议兼容层，也不算完成同步迁移。

新增 `packages/runtime/tests/observation-gateway.test.ts` 6 项；`tests/integration/observation-transport.test.ts` 8 项通过序列化、自包含页面执行调用真实 Gateway / Sessions，覆盖发现不取值、固定分页、显式录制、回复丢失后原游标重试、跨生产者及旧 epoch 拒绝、请求副本固定和伪回复拒绝。后一文件是未发布内部接缝联合测试，局部解释性豁免 source-import lint，未修改全局规则、未为了测试提前公开内部工厂；正式公共入口与扩展 E2E 仍待同步切换，不能由此测试代替。

独立 reviewer 从源码及反例发现并复核关闭：prepare 浅冻结导致嵌套请求可变、客户端接受未知 status、取值回复输入版本未匹配请求、stop 回复 captureId 未匹配请求。最终独立执行 Runtime 会话 / Gateway 26 项与传输 8 项均通过，限定范围无未关闭实质问题。

本次最终验证：Runtime 全量 17 文件 / 165 项、DevTools 既有 2 文件 / 6 项、内部传输联合 8 项通过；两个包 typecheck、根 `tsconfig.tests.json`、本次 9 个源码 / 测试文件 ESLint、`pnpm boundaries`（299 模块 / 882 依赖）及 Runtime / DevTools build 通过。构建仅证明现有公开入口可打包，不证明未安装的新接缝已在生产页面运行。未运行扩展 E2E、全仓 check、成本测量或 workflow verify；仅更新本变更实施记录，未改权威设计正文，无新 ADR 或文档阅读页重建。

### 定义与真实数据拓扑适配

本次基线仍为 `fd96b3c`；开始前源码副本保存在 `/private/tmp/devtools-metadata-baseline/`。新增 3 个内部源文件及对应 3 个测试文件；与副本比较，Runtime / Renderer 既有源码没有修改。没有向生产 Hook 安装新的生产者，不能把本批的真实 DataStore 联合测试称作 Runtime 生命周期接线完成。

| 源码                                             | 实际能力                                                                                                                                                                                                       | 对应反例 / 限制                                                                                                                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runtime/src/devtools/observation-definition.ts` | 从真实 Compiler Prepared 提取 Reaction / Constraint / Schema 定义；分开 watches、invalidatedBy、mayRead、mayWrite、requires、reportsTo；保留编译推导的 field 前置 constraintIds；Schema 包含关系和闭合资源引用 | 10 项测试；不求值 AST、不把 literal 当表达式，不把 Schema 子节点当真实校验任务；递归 $ref 仅连边，动态 / 未解析引用保留原因，条件未执行；View 定义未接入                      |
| `runtime/src/devtools/observation-topology.ts`   | 从固定 ReadView 输出对象 / 数组 / 字段类型、包含、位置及成员数量；成员 ID 完全复用 ScopeIndex，字段按 Root / 稳定成员 + 相对 Pointer 定位                                                                      | 4 项测试；40 成员和嵌套数组、移动、两类 set、删除再建、根标量 / 数组及转义属性；目录不复制字段值。位置 ID 不是 Reaction / Source 实例生命周期 ID                              |
| `runtime/src/devtools/observation-runtime.ts`    | 将定义与拓扑组合为 ObservationProducer 元数据页，按显式位置读取值；发现不执行 capture，协调期间返回 busy；同一生产者缓存静态定义目录                                                                           | 1 项真实 Prepared + DataStore + Gateway 分页联合测试；页间替换数组仍读取旧固定页，过期输入版本拒绝取值，适配器预算失败返回 budget-exceeded。实际生产者生命周期 / 增量仍未接线 |

快照头部标记 definitions=partial、ruleTemplates / schemaStructure 的覆盖，以及 viewTemplates / instances / validation / renderer / updates=not-collected；references 按是否存在 unresolved 标记 complete / partial。没有当前实例或完整增量证据时不能以静态图替代实际执行，也不能将固定页与空事件流推断为最新状态。`metadataRevision` 必须由实际状态所有者推进，覆盖目录、Data / Context 与相关状态变化；不能在后续接线中仅以 Data revision 替代它。跨生产者共享 Prepared 身份缓存、实际规则完整 ScopeBinding 目录和生命周期墓碑仍待实现，因此 2.1 / 2.2 不勾选。

预算分别约束目录行数、访问数、深度与文本；查询超限失败，不返回伪完整目录。独立审查实际复现并关闭两个遗漏：规则预索引先全量构建才检查预算、Schema URI 在计费前解析 / 保留。现在预索引先核对数量并逐项计费，$id / $ref / $anchor / 资源 URI 在解析 / 保存前计费；另以真实 Gateway 反例修正预算错误映射。预算仅由参数给定，夹具数值不是正式性能默认值。

最终独立复核 15 / 15 通过，限定范围无未关闭实质问题。本批实际验证：`pnpm --filter @form-engine/runtime test` 20 文件 / 180 项通过；Runtime typecheck、新增 6 文件 ESLint、`pnpm boundaries`（302 模块 / 894 依赖）、`git diff --check` 通过。本批没有修改包导出或公共生产接线，未重复构建既有入口、未运行扩展 E2E / 全仓 verify / 成本测量；没有新 ADR，权威设计语义未变，未改 docs/design 或生成阅读页。

### 运行实例、校验与 Renderer 生命周期接线（2026-11-09）

本轮沿用 `fd96b3c` 与混合工作区，修改前相关源码 / 记录保存于 `/private/tmp/devtools-lifecycle-baseline/`。范围为 Runtime / ValidationManager / Renderer 实际 owner 到内部元数据生产者，不安装新全局 Hook，也不修改业务调度语义。

- `runtime.ts` 从实际 ReactionInstance 分配弱对象身份并输出完整 ScopeBinding，复用真实 Data / Context 输入版本；协调阶段查询 busy。`validation/manager.ts#inspectMetadata` 输出当前 Source / Work / Call 及 Issue 的稳定字段引用，不复制业务输入或 Issue 消息，不触发校验。
- `observation-lifecycle.ts` 建立弱 owner 目录，允许子 effect 先于父 effect 注册；删除父级递归撤销后代。旧映射在释放回调前删除，重入注册得到新引用；旧句柄不能销毁新生命周期。目录预算在复制前检查，连接配置复制冻结；生产默认不注册，目录与 Schema resolver 延迟初始化。
- `observation-reader.ts` 有界冻结当前元数据，按查询所见目录和输入版本变化推进 revision；不宣称已采集历史更新。Renderer 无 InputVersion 时返回 unsupported，不伪造版本。
- Renderer `inspection.ts` 注册 view，`projection.ts` 注册 material 并只读缓存投影，关联真实 Runtime / view 引用、绑定及当前请求。`requests/bridge.ts#inspect` 增加复制前容量检查。stop / unmount / Runtime dispose 清理目录，Strict Mode 重挂载产生新引用。
- `ObservationProducer.onDispose` 仅为内部可信资源清理接缝；Gateway 订阅后在 owner 退出时立即删除路由、关闭会话并清理计时器，不向页面交付同步事件回调。注册 / 释放异常不改变业务创建与写入。

新增 Runtime 生命周期测试 9 项、Renderer 2 项，覆盖移动与两类 set、完整多重 ScopeBinding、对象删除再激活、异步校验 stale 与迟到返回、Issue 隐私、协调重入、弱引用平台故障、预算与配置副本、Gateway 会话立即释放、释放回调内重注册、Strict Mode 与共享 Runtime 的独立 Renderer 子树。独立 reviewer 从源码和反例复现并复核关闭故障隔离、虚构输入版本、会话延迟释放、复制前预算和重入注册问题；最终限定范围无未关闭实质发现，不代表完整四视图审查完成。

实际命令与结果：`pnpm --filter @form-engine/runtime test` 21 文件 / 189 项；Renderer 同命令 10 文件 / 68 项；DevTools 2 文件 / 6 项；`pnpm exec vitest run tests/integration/observation-transport.test.ts` 8 项，全部通过。Runtime / Renderer typecheck、变更源码与测试 ESLint、`pnpm boundaries`（304 模块 / 906 依赖）、`git diff --check` 通过；Runtime / Renderer / DevTools build 通过。

`pnpm packages:check` 的打包完成，但临时消费者离线安装报 `ERR_PNPM_NO_OFFLINE_META`，缺少 `@noble/hashes@1.8.0`。以 `npm_config_store_dir=/Users/samuel/Library/pnpm/store pnpm --store-dir /Users/samuel/Library/pnpm/store packages:check` 重试仍失败。此门禁未通过，不建议合并；没有通过修改依赖或跳过检查掩盖失败。

同步现行主题、入口及治理实施状态，无新 ADR；协议样例未改。当前任务仍仅 1.1 完整完成，其余大任务包含尚未交付的完整增量 / 事件、公开协议 / Store / 四视图等内容，不提前勾选。未运行扩展 E2E、全仓 check、成本测量或 workflow verify / archive。

文档收尾实际执行 `.venv-docs/bin/python tools/docs/build_docs.py` 及 `--check` 通过：57 个阅读页、57 个 Markdown ID、104 条类型记录、59 个 HTML / 8605 个本地链接与资源；`OPENSPEC_TELEMETRY=0 openspec validate devtools-observation-graph --strict` 与 `git diff --check` 通过。已对照本轮修改前副本检查三个正文文件的增量；无布局改动，未执行浏览器渲染验收，未修改协议样例。

### 真实 Reaction 录制通道与条件 / 终态（2026-11-09）

W3 恢复仍为 HEAD `fd96b3c`、19 项任务仅 1.1 完成。修改前相关源码、测试、现行主题 / 治理与变更记录保存在 `/private/tmp/devtools-reaction-feed-baseline/`。依据 observation-instrumentation / observation-snapshot-protocol / observation-breaking-upgrade，先贯通真实 Reaction 事实到会话和客户端；不改变业务 API、队列顺序、when 求值或 Host 动作执行，未安装新公开 Hook。范围外其他工作保留。

源码推导的当前执行链：Runtime.#runReaction 在事实发生处构造最小 started / condition / finished → observation-lifecycle 为同一生产者分配 EventRef → Gateway 连接内部 Sessions → 各会话按录制兴趣有界固定 DTO → readUpdates 的独立确认游标 → 客户端按具体事件判别校验。这里只连接引擎内部会话核，不开放页面 / Host 同步订阅回调。业务输入和错误消息不随事件复制。

| 契约 / 行为                          | 实施位置                                                               | 反例与边界                                                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 实例与执行身份分离；多次执行不能合并 | Runtime.#runReaction / observation-lifecycle.observedEntityId          | 当前目录共用弱对象身份，执行复用 trace.ref.id；自失效再入队产生两个执行。排队原因尚未采集                                       |
| 条件是真实结果，未记录不是跳过       | ObservationPayloads / Runtime.#runReaction                             | true / false / absent / error；error 明确 diagnostic=not-collected，finished.completed 仅表示返回，actionCoverage=not-collected |
| 录制与业务独立；中途开始不补历史     | observation-lifecycle.emitObservedEvent / Sessions.interested / append | 无兴趣不构造 DTO；Host 动作中开启录制仍收到随后终态；停止一会话不影响其他会话；平台故障撤销对应会话以免恢复后静默漏采           |
| 事实序号与会话游标分离               | Producer.eventSequence / nextEventRef、Gateway 与 Sessions             | 两个 Gateway 共用同一 EventRef；原内部 publish 与 feed 也共用序号；固定快照前后按统一事件序号拒绝重入切点                       |
| 有界与缺口可见                       | Sessions.append / readUpdates                                          | DTO 构造失败、字节 / 条数容量回收计入 dropped；客户端重试不吞事实；租约 / 销毁沿用实际释放                                      |
| 不接受不完整 typed DTO               | devtools/client/observation-reply.ts                                   | 验证 instance 命名空间、executionId、输入版本与 outcome 必需字段；错误分支缺诊断缺失说明被拒绝                                  |

新增 runtime/tests/observation-reaction.test.ts 7 项、observation-feed.test.ts 4 项、内部传输联合增加 1 项。开始先见真实事件缺失导致两项反例失败；客户端伪造 payload 反例也先复现错误接受。独立 reviewer 从原始源码复现并复核关闭：发布口序号混用、快照切点仍读旧本地序号、单连接时钟故障影响其他连接、append 第二次时钟故障静默缺口、中途录制受其他面板影响以及客户端缺必需字段仍接受。其独立临时探针在 `/private/tmp/reaction-feed-review/`，不作为发布依赖；最终 5 文件 / 46 项定向测试、9 项传输及 Runtime / DevTools typecheck 通过，限定范围无未关闭实质发现。

本轮实际验证：`pnpm --filter @form-engine/runtime test` 23 文件 / 200 项、Renderer 10 文件 / 68 项、DevTools 2 文件 / 6 项、`pnpm exec vitest run tests/integration/observation-transport.test.ts` 9 项通过。Runtime / DevTools typecheck、`pnpm exec tsc -p tsconfig.tests.json --noEmit`、变更 10 个源码 / 测试文件 ESLint、`pnpm boundaries`（304 模块 / 907 依赖）与 Runtime / Renderer / DevTools build 通过；改动文件已格式化，`git diff --check` 通过。最初从根配置运行包内测试未发现文件，随后使用包内 Vitest 正确运行，不将错误入口计入通过结果。

以 `npm_config_store_dir=/Users/samuel/Library/pnpm/store pnpm --store-dir /Users/samuel/Library/pnpm/store packages:check` 重试，依然在消费者离线安装阶段报 `ERR_PNPM_NO_OFFLINE_META`（@noble/hashes@1.8.0）。日志 `/private/tmp/devtools-reaction-packages-check.log`；没有跳过安装或更改依赖以规避门禁，暂不建议合并。

本批属于契约内实现细化，无新 ADR。现行观测主题与治理同步本地实施边界；不勾选整个 3.1 / 3.3 或完整审查任务。下一步仍需 operation / 入队合并 / 动作 / Change、生命周期增量与异步校验历史；之后统一公开 Hook / Store / 四视图切换。当前 boundary-only 表示录制边界响应尚无在途摘要，不代表完整历史覆盖；未运行扩展 E2E、成本测量、全仓 check 或 workflow verify / archive。

文档收尾：`.venv-docs/bin/python tools/docs/build_docs.py` 及 `--check` 通过（57 个阅读页、57 个 Markdown ID、104 条类型记录、59 个 HTML / 8605 个本地链接与资源）；OpenSpec strict 与 `git diff --check` 通过。已对照本轮前副本检查现行主题与治理增量，无新语义决策 / ADR、无协议样例或布局变更，未执行浏览器渲染验收。

### 操作、入队合并与命令 / 动作事实（2026-11-09）

基线仍为 HEAD `fd96b3c` 与混合工作区，本轮副本在 `/private/tmp/devtools-causal-baseline/`。依据 observation-instrumentation / observation-events / observation-snapshot-protocol，沿用已确认所有权与通知顺序，不新增公开业务 API，也不安装新 Hook。审查单元为 Runtime 调用链、ReactionScheduler 队列身份、ObservationPayloads、客户端判别及两组测试，共 6 个源码 / 测试文件；现行主题、治理、任务记录与生成页同步实际边界。

源码与实际轨迹共同验证：dispatch.started → 叶命令提交 Data / Scope → data.changed → 原通知范围内按 DiagnosticTrigger.sequence 精确关联 queued / queue-merged → dispatch.returned → dequeue 的 reaction.started → command.finished / action.finished → reaction.finished。操作返回仅表示入口返回。ScopeIndex.locate 复用修改前稳定定位，路径和版本固定在有效提交后、观察通知前，不复制业务值或从命令字符串反推变化。

真实 pending Map 为队列项分配身份，同键合并保持身份与插入顺序，执行前删除，再入队分配新身份。每次触发独立记录原因，不在 Runtime 无限积累因果列表；仅在诊断触发编号与当前 Change 一致时关联 EventRef，其余为 null。多个操作可关联同一执行，不把未知来源补成最近操作。取消 / 熔断未执行队列项终态仍未采集，不能将未见执行解释为成功或明确跳过。

CommandExecution 只增加内部关联和中断记录。叶结果区分 changed / no-change / error / partial-error / not-executed；batch 不伪造一次叶执行。动作按 command / host.emit 判别：Command 保留 changed 和同步结果 / interrupted，Host 为 returned / error，均不表示异步 Promise 终结。actionCoverage=executed-only，未执行动作逐项事件待补；data.changed 的 detail=target-only 不代表逐字段或数组项完整 diff。

反例覆盖两次操作合并及两条真实原因、执行中再次入队、无变化不生成 Change、batch 部分失败、移动后稳定成员定位、null 非法命令错误数不增加、通知反馈熔断下部分修改和未执行叶。传输测试覆盖新 DTO、跨生产者原因、不可能动作判别及非法位置拒绝。旧 Reaction 子集测试按种类选择，完整轨迹由新测试单独核对，容量测试按新实际总数更新 gap 断言。

独立 reviewer 对照副本及未修改调用方，复核关闭 null 命令 finally 重复抛错、动作判别组合过宽与 batch 中断误报。独立运行 Runtime 定向 5 文件 / 66 项、传输 10 项、Runtime / DevTools typecheck；`/private/tmp/causal-review/` 两项实际探针覆盖 null 与真实重入熔断，最终通过，对应长期反例已纳入仓库。限定范围无未关闭实质发现，不代替完整 OBS-2 审查。

最终实际执行：Runtime 全量 23 文件 / 205 项，Renderer 10 文件 / 68 项，DevTools 2 文件 / 6 项，`pnpm exec vitest run tests/integration/observation-transport.test.ts` 10 项，全部通过。Runtime / DevTools typecheck、根 tsconfig.tests.json、6 个变更文件 ESLint、`pnpm boundaries`（304 模块 / 907 依赖）及三个包构建通过。联合测试最初 optional nextCursor 类型收窄失败，已使用 events 判别正确区分更新回复并复验，未降低断言。

使用既有 store 重试 `packages:check`，仍在离线消费者安装报 `ERR_PNPM_NO_OFFLINE_META`（@noble/hashes@1.8.0），日志 `/private/tmp/devtools-causal-packages-check.log`；未通过门禁，不建议合并。无新 ADR / 协议样例变化。3.1 仍不勾选：Context / 完整校验入口、队列取消终态、未执行动作逐项事实尚未完成；生命周期增量、异步历史、公开 Hook / Store / 四视图、扩展 E2E、成本测量未完成，不执行 workflow verify / archive。

文档最终构建及 --check、OpenSpec strict、git diff --check 均通过：57 个阅读页、57 个 Markdown ID、104 条类型记录、59 个 HTML / 8605 个本地链接与资源。已对照修改前副本复核正文与治理增量；本批无布局改动，未做浏览器渲染验收。

### 公开新版协议、异步事实与四视图接线（2026-11-09）

本轮用户明确要求在没有真实确认项时持续推进。沿用已确认 breaking change 和 W3，基线 HEAD `fd96b3c`，相关修改前副本在 `/private/tmp/devtools-complete-baseline/`；工作区仍混合其他任务，未提交、推送、合并或归档。

**最终行为链：**Runtime / Renderer 真实 owner → 有界生产者会话 → v2 Hook request → 自包含页面桥接 / typed Client → 工具 Store → 四视图。连接只发现目录；选择后读取固定元数据页；录制显式开启；值与异常现场可用性按需查询。旧 registry/types/snapshot/diagnostic-history、旧 client/page-request/types 和旧三列 UI 已删除，全部调用方及打包消费者迁移，不保留旧协议回退。

**本轮实现：**ValidationManager 发出 Source / Work / Call 的真实失效、代次、复用、settling、资格撤销、cancel 尝试及返回、异步实际返回 / 丢弃与发布事件；Runtime 增补 replaceContext / validate 操作和队列取消。Renderer request 区分返回事实与交付决定，固定当次 producer/runtime/view 引用。start / stop 收据附有界在途摘要，控制重入 busy，重试不重取。locateEvidence 只查询原 Runtime 最近诊断中的完整现场是否仍可定位，最多保留 2,000 个诊断序号，并有界扫描；不延长业务输入保留期、不宣称 Host 已持久化。默认诊断消息不再广播 message / evidence。

**消费者：**Store 固定当前快照，事件独立有界保留、按命名空间去重，缺口独立累计；刷新不补造历史。关系图按类型解析 Data / Context / 字段校验引用，规则同名时按模板类型区分；上下游分别沿有向边遍历，不沿共同上游误亮旁支。对象 / 数组折叠保留跨容器边、原始端点和去重成员集合。执行图有显式原因缺失占位、queue / execution / Call 归属与 Work 顺序边；实体选择不自动挑第一条执行，显式定位跨页跳转，旧选中事件不会覆盖新实体。图 120 节点 / 页，状态 200 行 / 页，跨页连线未绘制明确说明。诊断能定位事件并查询现场可用性。

**独立审查及关闭项：**reviewer 先独立取证，复现并修正重连未重建 session、validation/context 引用串线、模板同名混淆、旧 selectedEvent 残留、Call 跨命名空间串联、诊断跨页定位、capture 控制重入、同 Projection 新 epoch 被旧请求污染、locator 全量 Trace 扫描。最后针对定位 / 会话 / Gateway 36 项、Renderer request 11 项、client 2 项独立复验通过；图部分审查不代表完整布局 / 性能验收。取消后 resolved / rejected 与旧 epoch 反例由实现侧补齐复验。最终整体方案与未完边界同步到权威实施章节，没有新增 ADR 或用户语义决策。

**实际验证：**

- `pnpm --filter @form-engine/runtime test`：24 文件 / 210 项；Renderer：10 文件 / 70 项；DevTools：2 文件 / 11 项；`pnpm exec vitest run tests/integration/observation-transport.test.ts`：10 项，均通过。
- `pnpm typecheck`：9 包及根联合测试类型检查通过；相关 Runtime / Renderer / DevTools 源码测试与测量脚本 ESLint、`pnpm boundaries`、`git diff --check` 通过。
- `pnpm exec turbo run build --filter='./packages/*'`：7 包构建通过。既有打包消费者曾因 pnpm 离线元数据缺失受阻；在 `/private/tmp/form-engine-cache-warm` 用既有版本补齐缓存后，`npm_config_store_dir=/Users/samuel/Library/pnpm/store pnpm --store-dir /Users/samuel/Library/pnpm/store packages:check` 通过默认与 development 两种条件。未修改工作区依赖或降低门禁。
- `pnpm test:e2e:devtools`：真实 Chromium MV3 基础流程通过。首次因本地监听权限、缺少匹配浏览器失败，经自动审批运行本地服务并安装已采用 Playwright 的匹配 Chromium 后复验；不是新框架安装。包含明确选择、四视图、显式录制 / 步进、断开重连和业务填写继续。
- 文档 `build_docs.py` 与 `--check` 通过：57 个阅读页、57 Markdown ID、104 typed records、59 HTML / 8605 链接。协议样例未修改。全变更 workflow verify / archive 未执行。

**部分成本实测：**`node tools/engineering/measure-observation.mjs 50 10`，Apple M5 / darwin arm64 / Node v24.22.0，50 个数组成员、两级 Reaction、外部异步校验，10 轮修改。未连接 / 元数据 / 录制平均每轮 2.79 / 2.31 / 9.23 ms；最大 5.85 / 3.25 / 10.76 ms；元数据快照约 73,924 bytes，录制交付 4,080,056 bytes、12,730 事实、0 dropped。采样 heapUsed 最大分别约 23.4 / 34.4 / 54.4 MB，非真实峰值；顺序运行受 JIT / GC 影响。元数据模式尚无完整增量、不含扩展布局，不固定最终性能门槛、不关闭 5.4。

**仍未完成：**当前快照更新仍由手动刷新承担；完整生命周期增量 / 墓碑、跨生产者共享 Prepared 定义与完整 View 模板、未执行动作逐项事实、完整操作 / 成员 / Work 泳道与潜在 / 实际影响成员统计、数十成员浏览器布局验收和完整成本门禁。任务仅按本轮可核验范围勾选，未将四个入口已有当作全部四视图验收。后续继续这些已授权实施项，无待用户确认的新语义。

最终补验：根 `pnpm exec vitest run` 11 文件 / 46 项通过；DevTools 新增 130 事件跨页诊断定位和 40 成员聚合引用 / 去重成员测试后为 11 项通过。独立审查最后发现会话到期保留旧 captureId 导致刷新后不能重新录制，现已清理全部录制收据，并以真实 Hook + 时钟跳转→到期→刷新→再录制反例复验通过。扩展 E2E 又补真实实体选择→四视图保留选择，最终 1 项通过。

### 面板下拉框被轮询关闭的修复（2026-11-09）

用户实测下拉框快速自动收起。反例证实原 enqueue 每秒无条件 render → root.replaceChildren 导致 select 被重新创建、焦点丢失；不是 Runtime 业务监听主动关闭控件。修改前源码保存于 `/private/tmp/devtools-mount-refresh-before.ts`。

本次固定 shell / header / select / nav 节点；目录内容和选择没有变化时不修改 options，select 聚焦期间延后目录变化并在 blur 后应用。状态文字独立更新，main 按当前视图消费的数据失效，关系视图不因后台执行事件重建；必要视图重建保留图滚动和诊断展开。后台接收与展示更新分离，不改变 Runtime 调度或事件契约。

先运行反例失败（select 对象身份已替换），修复后 DevTools 12 项、typecheck、相关 ESLint、build、git diff --check 通过。真实 Chromium 扩展在持续 2.2 秒轮询后验证 select 标记 / 焦点仍保留，并跑通已有四视图 / 录制 / 断开重连流程；为保留用户正在看的 Playground，使用 `/private/tmp/devtools-refresh.config.ts` 复用 3217 服务。独立 reviewer 在固定源码范围未发现新增缺陷，补测聚焦时实际新增 producer→失焦更新 options。未声称 jsdom 能证明原生弹出层视觉状态。

用户同时明确修订为“DevTools 接入后自动上报并由工具监听”，不再手动开启录制。这一目标已接收，但本次没有将轮询包装为推送，也没有通过自动点击 startCapture 冒充完整改造。原手动录制任务证据仅对旧目标有效，自动订阅 / 推送及契约同步仍待实施；本节不把尚未实现行为记为完成。

## 2026-11-09 自动订阅与视觉一致性修订

用户已确认自动推送替代手动录制，要求不轮询、接收与刷新解耦，样式沿用原 demo。权威契约、ADR-FE-025、来源与治理已同步；以前录制语义和测试仅作历史追溯。

实现：ObservationStreams 由真实订阅计数控制，业务内只固定不可变有界 DTO，独立任务批量交付。Hook-ready、producer 目录新增 / 销毁主动通知。Chrome content script 静态注册桥监听，仅面板 Port 接入后订阅；页面桥一批在途、ACK 后继续、有界积压、10 秒无确认释放并通知 Port 断开。主 frame / HTTP(S) 已验收，无后台轮询，无业务执行 API。openObservation / readUpdates 保留显式查询和恢复，startCapture / stopCapture / captureId 删除。

工具所有生产者历史与去重索引都有界（条数和总字节）；选择对象只读取快照 / 值，事件及目录变化合并刷新选中快照。UI 接收先写副本，视图独立调度并保持稳定 header/nav/picker。查询过期最多自动重开一次，值仍核对原输入版本；在途和排队查询同时校验连接 / 状态代次。视觉参数、侧栏、标题、点阵图、详情卡和窄面板排列复用原 demo 设计；关系图按三列分别紧凑排布，不据此声称完整图布局已验收。

独立审查 / 反例：修复关闭消息早于eval的孤儿订阅（无ACK自动释放）、通过索引无界、闲置过期查询、在途快照及排队刷新跨断开提交、ACK超时静默掉线。最后隔离探针 reads=1 且保持 disconnected；DevTools16项与Runtime stream3项复验通过，审查范围内无残余P1/P2。

本轮命令与证据（基线 fd96b3c + 本任务前已有混合工作区；增量快照 /private/tmp/devtools-subscription-before）：

- pnpm --filter @form-engine/runtime test：208；renderer-react test：70；devtools test：16；pnpm exec vitest run：45。
- pnpm typecheck：9工作区与根联合类型通过；相关runtime/devtools lint、pnpm boundaries、包构建通过。
- pnpm --store-dir /Users/samuel/Library/pnpm/store packages:check：隔离打包检查通过。
- pnpm exec playwright test --config /private/tmp/devtools-refresh.config.ts：真实Chromium MV3 1项通过，配置仅复用3217已运行服务；含自动接收、四视图、下拉框焦点、断开 / 重连、导航和视觉参数。保存实际面板DOM，另渲染1440/480宽截图作视觉检查；截图是保存DOM的复现，不冒充完整Chrome宿主截图。
- node tools/engineering/measure-observation.mjs 50 10：自动订阅模式已更新，结果和局限见权威实施段；最终成本任务不关闭。

完整元数据增量、生命周期墓碑、共享定义、复杂泳道 / 实际成员统计及最终布局成本仍未闭环；本轮没有推送、合并或整体archive。

## 2026-11-09 全功能补齐与最终验收

本轮只读预检沿用 fd96b3c 加混合工作区，修改前副本在 `/private/tmp/devtools-final-scope-before`。只完成已授权 OBS-0 至 OBS-4，不更改表单业务调度或引入兼容层。权威当前状态已同步 l3-observability 与治理；无新增 A 级决策或 ADR。

- Runtime：共享 Prepared / View 定义目录；固定分页独立于 metadata baseline，readMetadataChanges 以 revision 确认，重试固定 offer、删除键与顺序；初始化 / 新成员原因、实体生命周期与逐动作未执行结果。
- Renderer：投影缓存实际更新才发布目录失效；请求按旧挂载代次采集。stop 的 stopping guard 防止 Host abort 同步重入覆盖注销句柄，取消终态仍先于注销。
- DevTools：有界墓碑覆盖瞬时删除；直接 / 完整链、折叠聚合、多 Scope 成员、操作选择、Work / Call / 实例泳道、潜在与已观测关系、Renderer 显式请求归属；顺序边不传播因果。聚焦原生下拉时暂缓后台 DOM 替换，主动 change 立即更新；图拓扑不变复用布局，选择后滚入可见位置。
- 独立 demo `/demos/observation` 复用正式 Compiler / Runtime / Renderer 和物料，36 人跨对象条件链 + 可控异步校验。用户操作经真实 MV3 Hook → 页面桥 → Port → Store → 四视图；没有使用直接 Runtime Command 代替 UI 联验。
- 默认事件窗口由 2000 / 2 MB 调整为 10000 / 8 MB：原窗口不足以容纳 36 人初始化，仍有硬预算、ACK 背压、缺口计数和生命周期清理。Prepared 每对象最多缓存 8 个预算版本，目录不会成为无界配置缓存。

独立审查发现并关闭：重复 Renderer diagnostic key 冲突；stop 时 abort→start 泄漏；新 Source 缺少已知原因；共享 Work 顺序串入另一操作；主视图重建关闭下拉；多 Scope 聚合遗漏成员；瞬时实体墓碑遗漏；Renderer 请求缺生命周期边。新增正式反例在 runtime/tests/observation-metadata、observation-validation、renderer-react/tests/requests、devtools/tests/graph、ui。扩展打包复验还发现 runtime/devtools 裸导入，已通过扩展自包含构建修复。

实际验证：Runtime 213、Renderer 71、DevTools 22、根级联合 45 全通过；9 包 typecheck 通过；真实 Chromium MV3 的原家庭出行与 36 人场景通过。宽屏 / 窄屏视觉检查来自真实扩展 DOM 的独立渲染，不能冒充 Chrome 外壳截图。真实面板切到执行视图用两帧测量，预算 1500 ms，结果保存 Playwright render-cost.json。完整 workflow verify 已通过：包含 pnpm check（资产、Schema、格式、lint、边界、构建、类型、包测试、PostgreSQL 集成、打包消费者、文档）、根级联合测试、真实扩展 E2E 与文档同步检查。之后补充真实 UI 的 24 人字段联动、异步拒绝诊断和删除成员历史断言，专项复验通过；最终收据以该最终基线重建。

成本命令 `node tools/engineering/measure-observation.mjs 36 10`：每模式独立进程，Apple M5 / Node v24.22.0，均值 3.26 / 7.50 / 15.60 ms，订阅各 9202 事件且 0 丢失；RSS 高水位约 168 / 176 / 229 MiB，120 节点真实布局最大 0.99 ms。初始选中目录 283 行；固定页 / 基线 / 待确认目录 / 增量结果各 8 MB，最坏四份 DTO 合计 32 MB/会话（不计对象开销），30 秒租约与关闭释放。宽松本机回归预算为单轮 1000 ms、布局 50 ms、RSS 512 MiB、无丢失；脚本失败返回非零，不外推生产设备保证。

workflow scope 明确到源码 / 测试 / 配置与生成阅读页，排除 node_modules、dist、.next 等安装和构建缓存，避免目录摘要读取依赖符号链接或因构建缓存变动失效。发布声明采用标准 Changeset major 三包同步升级；仅声明，未执行版本发布。保留其他并行改动，无推送 / 合并 / 发布。

最终补充 E2E 已通过：投保人姓名修改后恰有 24 名成员的证件字段沿两级 Reaction 改变；手动拒绝后原表单呈现结果且 DevTools 显示 source.result-published；删除选中成员后目录减少、历史详情仍标记已删除。字段 Issue 可能在摘要 / 字段 / 汇总多处呈现，不使用错误 DOM 数量冒充成员统计。
