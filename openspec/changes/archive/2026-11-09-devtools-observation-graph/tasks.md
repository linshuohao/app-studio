# 任务

proposal 后进入 W3；勾选须有对应实际证据，部分内部实现不等于整个任务完成。唯一权威及范围见 proposal，技术契约引用 docs/design，不另建计划。

## 1. OBS-0：基线与同步协议切换

- [x] 1.1 执行 W3 只读预检，固定 HEAD 与混合工作区归属、消费者、契约、正反例及验证入口；验证：git status / diff 和现行 observation-technical / ADR-FE-025 对照，记录 design.md 的本轮基线。
- [x] 1.2 实现新协议 DTO / 判别联合、命名空间、版本检查；补旧版本拒绝及无效会话 / epoch / 游标反例；验证：`pnpm --filter @form-engine/runtime test`、`pnpm --filter @form-engine/devtools test`。
- [x] 1.3 同步迁移 Runtime / Renderer 注册接缝、桥接、客户端和面板，删除旧入口与适配路径；验证：`pnpm typecheck`、`pnpm boundaries`、`pnpm packages:check`，检查所有旧接口调用方，旧页面不得触发旧 read / subscribe。

## 2. OBS-1：结构和当前状态纵切

- [x] 2.1 实现 Prepared 定义模板、完整绑定 / 成员目录与关系适配，覆盖两类 set、移动 / 删除 / 再激活、根 Schema 和 unresolved；验证：`pnpm --filter @form-engine/runtime test`、`pnpm --filter @form-engine/devtools test`，对应 OBS-A02 / A03 / A10。
- [x] 2.2 实现固定元数据快照、分页、busy / 过期 / 预算失败与 inspectValue 版本检查；验证：上述 Runtime / DevTools 单测，包含 S@c + 增量到 d、重入及页间修改反例，对应 OBS-A12。
- [x] 2.3 接入 Renderer 元数据与 Store 当前状态 / 关系，读取不重算、不校验、不持续复制全量值；验证：`pnpm --filter @form-engine/renderer-react test`、`pnpm --filter @form-engine/devtools test`。

## 3. OBS-2：Reaction 路径与自动订阅

- [x] 3.1 补 operation、排队 / 合并 / 再入队、when、动作与真实 Change / 终结采集；验证：`pnpm --filter @form-engine/runtime test`，覆盖 OBS-A04–A07，先让反例证明旧事件不足。
- [x] 3.2 实现自动订阅 / 推送、连接边界、多连接隔离和独立于业务的有界交付；验证：Runtime / DevTools 单测及 MV3 E2E，无选中也采集、空闲存活、晚加载 / 导航、断开不等网络、溢出与视图刷新隔离。
- [x] 3.3 实现 readUpdates 游标确认、重试去重、gap、因果索引和执行步进；验证：`pnpm --filter @form-engine/devtools test`，对应 OBS-A11，缺终结不得标成功、当前刷新不补历史。

## 4. OBS-3：异步校验与诊断纵切

- [x] 4.1 采集 Source / Work / Call、settling、复用 / 消费关联与资格撤销；验证：`pnpm --filter @form-engine/runtime test`，对应 OBS-A08 / A09，共享 Work 不重复执行，stale 不取消工作。
- [x] 4.2 补异步返回 / 发布 / 丢弃、Renderer 请求来源和跨生产者定位，保留旧 Flush 封存；验证：Runtime / Renderer 单测与 `pnpm exec vitest run`，覆盖逆序、删除、销毁与重入时序。
- [x] 4.3 接入诊断与 locateEvidence 可用性，保持必要完整现场独立交付；验证：Runtime / DevTools 单测，对应 OBS-A16，工具截断、引用失效和当前 / 历史输入反例。

## 5. OBS-4：四视图与整体验收

- [x] 5.1 实现共用 Selection、四视图定位与当前 / 历史区分；验证：`pnpm --filter @form-engine/devtools test`、`pnpm test:e2e:devtools`，对应 OBS-A13，至少覆盖关系→执行→状态→诊断的实际点击流程。
- [x] 5.2 实现容器折叠、聚合边、上下游 / 完整链、布局稳定性与分页下界统计；验证：DevTools 单测与扩展 E2E，对应 OBS-A01 / A03 / A14，包含数十成员跨对象联动。
- [x] 5.3 完成版本拒绝、默认生产无发现、Strict Mode / 租约释放和故障隔离回归；验证：`pnpm test:e2e:devtools`、`pnpm packages:check`，对应 OBS-A15 / A17。
- [x] 5.4 建立可复现成本测量，比较无连接 / 自动订阅未选择 / 自动订阅并读取选中元数据下耗时、消息字节、峰值内存、快照保留及布局延迟；验证：记录实际夹具、设备、命令和结果后固化预算；测量前不得虚构门槛或勾选。

## 6. 审查、证据与收口

- [x] 6.1 按 form-deep-review 独立审查高风险时序及跨层消费路径，修复后复验并关闭 P0/P1；验证：记录最终基线、实质发现和对应测试，基线变化重开受影响结论。
- [x] 6.2 维护实际交付状态与必要 docs / ADR / 治理，生成文档；验证：`.venv-docs/bin/python tools/docs/build_docs.py`、`.venv-docs/bin/python tools/docs/build_docs.py --check`，必要实际浏览器检查；协议样例若变化另跑验证。
- [x] 6.3 检查范围及证据完整性，完成格式化 / 生成后执行最终门禁；验证：`OPENSPEC_TELEMETRY=0 python3 tools/engineering/workflow.py verify devtools-observation-graph`，通过才生成执行收据。

## Workflow follow-up

所有任务完成、知识维护及审查通过后，按项目授权隔离本任务补丁，不混入其他工作；使用 `python3 tools/engineering/workflow.py archive devtools-observation-graph` 成功归档，禁止默认 sync，不向 openspec/specs 写主规格。OBS-0 至 OBS-4 已完成本地功能与专项验证，详细依据见 design.md 最新实施记录。6.3 已通过完整工作流；最终收据按当前源码和清单重建后归档，不以专项测试替代完整门禁。

2026-11-09 用户新增修订：取消手动开启录制，DevTools 接入后自动上报 / 监听。3.2 重新打开，原显式录制验收只能保留为历史证据；需要统一自动订阅生命周期、真正推送传输与 UI 控制，再更新权威契约和相关验收。面板轮询替换整棵 DOM 的缺陷已独立修复并回归，不等于自动上报已完成。

2026-11-09 自动订阅修订完成：3.2 以真实 Hook → 页面桥 → content Port → 面板 Store 链路重新验收，移除定时发现 / 拉取与公开手动录制。Runtime 208、Renderer 70、DevTools 16、根级联合 45 项通过，真实 MV3 覆盖导航 / 重连及稳定下拉框。独立审查问题均修复并复验；视觉参数、导航、图画布和详情栏对齐原 demo。该阶段当时仍保留元数据 delta / 墓碑、布局与统计、成本任务未勾选；后续完整补齐见下段。

2026-11-09 完整功能补齐验收：元数据确认式增量 / 墓碑、共享 Prepared / View 目录、初始化和新 Source 因果、全部声明动作结果、共享 Work 操作范围、真实与潜在关系、成员摘要 / 展开、循环布局、主动选择与后台刷新隔离均已落地。Runtime 213、Renderer 71、DevTools 22、根级联合 45 项通过；真实 MV3 36 人场景及布局绘制预算通过。独立审查反例修复并复验，完整门禁与收据以 6.3 为准。

最终完整工作流已通过一次并生成收据；补充真实 UI 的 24 人联动数据、异步拒绝诊断及成员删除历史断言后，再按当前清单 / 源码重建收据，随后执行归档。
