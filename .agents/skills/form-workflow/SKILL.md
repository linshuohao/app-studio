---
name: form-workflow
description: "Use when working on Assemble Studio requirements, design, confirmed documentation, implementation, debugging, review, or collaboration rules, including continuation of legacy form-* requests. Not for unrelated projects."
---

# Assemble Studio 统一工作入口

这是本项目唯一的工作流编排入口，采用 ai-co 的共同事实驱动循环：AI 在已授权范围内持续执行，人获得理解重要变化、判断取舍和验收所需的上下文。原 W1–W5 是任务类型与领域能力，不再是互相调用的五条编排链；深度审查是同一循环中的按需能力。

## 恢复任务并选择适用条款

核对用户最新目标、范围、验收与授权。读取仓库 `.agents/context/generated/charter.md`。核对 Git 基线及已有里程碑，保护其他修改。复杂变更或会话恢复按需读 [项目载体与工具适配](references/project-adapter.md)。

实现和审查按影响选择具体领域条款。用以下命令查询，结果直接包含条款文本、命中原因、消费者、检查和活动 Change 交集：

```bash
.venv-docs/bin/python tools/docs/build_contracts.py select --path packages/studio-design/components/src/tree-view.tsx
.venv-docs/bin/python tools/docs/build_contracts.py select --intent asset-packaging
```

路径可重复传入。任务开始使用计划路径和必要意图；当实际 Diff 扩大时，再以本次真实归属查询。 只为计划或实际改动的行为传入路径；仅核对、回归或保留兼容的消费者照常取证，不把它们的路径拿去扩大规则加载。 仅核对跨模块消费者时，读取实际调用、类型和测试；消费者目录的局部 AGENTS 和框架参考只在本次需要修改该目录或审查该目录规范时主动加载。宿主已经提供的适用指令按其作用域遵守。工作区可明确归属当前任务时可用 `--worktree`。纯 UI 焦点、字段选择或样式任务只取对应 UI 条款；确实改变 Agent 提交语义时再加 `--intent studio-agent-submission`。完整意图与路径见 `.agents/context/generated/index.json`。查询工具不可用时按同一索引手动读匹配文件。未匹配项须按实际代码和任务事实识别缺口，不视为自动覆盖。

只读预检和交付可引用索引返回的适用条款。仅查询组件、主题 Token、物料或函数时，直接走下方对应入口，无需先选择其他领域条款。公共行为、设计维护或真实冲突按需打开对应正文。更新源条款后按 [维护方法](references/maintenance.md) 同步生成视图。

## 组件、Token、资产与编写参考

新增、修改或审查 Studio 页面、组件、Token 或 Handbook 时，按实际路径或 `studio-component`、`studio-tokens`、`studio-handbook` 意图选择条款。先加载返回的 `read_first`，统一入口为 [Studio Design 设计准则](../../../packages/studio-design/guidelines.md)，再按 [Design Handbook](../../../packages/studio-design/handbook/studio-design-handbook.html) 查目标页、实际组件导出或 Token 真源。新增公共组件、调整公共接口或交互时同批维护独立说明、目录和真实示例。修改 Token 用途时同步手册说明。用 Handbook 检查和实际 Studio 调用方验证。

```bash
python3 tools/docs/studio_catalog.py lookup --kind component --query TreeView --limit 1
python3 tools/docs/studio_catalog.py lookup --kind component --query JsonEditor --limit 1
python3 tools/docs/studio_catalog.py lookup --kind token --query=--studio-primary --limit 1
```

物料与纯函数只按任务中的稳定 ID 读取现有资产目录，沿返回的 Manifest、README、实现和适用示例取证。未知 ID 先在相应包的 `src/manifests.ts` 或现有目录查找。修改资产签名、行为或制品时，再读 [资产规范](../../../docs/design/extension-integration.md#first-assets-organization) 和适用的工程条款。仅查资产语义时使用该资产查询。

```bash
node tools/engineering/catalog-docs.mjs --lookup text-input
node tools/engineering/catalog-docs.mjs --lookup date.inclusiveDays
```

修改或预检代码时，按实际路径选择编写参考。TypeScript 文件与类型建模、Python 编写参考按文件匹配。框架规则按相关路径和当前意图叠加：派生状态用 `react-render`，并行请求用 `react-async`，Next 服务端与客户端边界用 `next-boundary`，Nest HTTP 用 `nest-http`，FastAPI HTTP 用 `fastapi-http`，Graph 重放用 `langgraph-state`，公开声明制品用 `ts-declarations`。

```bash
.venv-docs/bin/python tools/docs/select_references.py --path packages/studio-design/components/src/tree-view.tsx --intent react-render
```

工具直接返回命中的 `.agents/` 参考原文、范围与上游版本。 已纳入的生效框架规则用版本匹配的摘录完成预检；遇到摘录没覆盖的 API 行为，再沿实际依赖核查。可用 `.agents/context/references.yaml` 手工选取。上游参考服从现行项目 Contract、工具链和任务授权。记录实际查到的组件或 Token 与加载的参考 ID。

## 一个循环选择下一项必要工作

恢复事实 → 找到阻碍当前目标的缺口 → 按需读取下表能力 → 完成一项有结果的工作 → 更新原有成果与证据 → 继续、升级或结束。

| 当前缺口 | 按需读取 | 这一项工作的结束条件 |
| --- | --- | --- |
| 目标、场景、公共行为或真实设计冲突未清楚 | [方案与契约](references/design.md) | 完整草案或有依据的判断，真正待决项明确 |
| 已明确确认的结论尚未归位 | [确认后的知识维护](references/maintenance.md) | 确认范围归档、构建和差异检查完成 |
| 已授权成果尚未实现 / 集成 | [交付与验收](references/delivery.md) | 当前行为切片有匹配证据 |
| 失败、回归或实现偏差 | [定位与修复](references/debug.md) | 根因与处理结论、原反例和必要回归证据 |
| 正确性证据或整体行为理解不足 | [理解与审查](references/review.md) | 有依据的结论与限制，或明确补证项 |
| 协作规则、skill 或验证环境需要改善 | [流程能力维护](references/improvement.md) | 最小改进与适用检查，真实效果状态明确 |

这些是选择条件，不是必跑阶段。参考文件只负责本次能力输入、约束与产出，完成后由本入口按原目标继续判断；不要再调用旧别名或重开另一套流程。一次请求可以混合能力，但只有一份目标、计划与证据。只读审查、方案咨询或仅归档本身都可以完成任务，不自动接入编码。

例如“修复旧异步结果覆盖新结果”：核对契约和复现 → 读取定位与修复 → 验证根因并补反例、修复 → 按风险审查及复验 → 交付；只有核实了公共语义缺口才读取方案能力并暂停依赖决定的部分，不先完整跑一遍 W1–W5。

## 自主推进、升级与人的理解

- 沿用项目 A / B / C 权限：A 是新增 / 改变公共 API、职责、状态所有权或执行 / 一致性语义，核对已有确认，缺失才集中交用户；B 是契约内方案，自主选择并说明重要权衡；C 是命名和局部组织，直接处理。内部队列若改变通知时机、执行顺序或错误传播，仍按 A 判断。
- 既有确认与授权不因能力或工具切换而重问。遇到未覆盖的目标 / 范围、公共行为、安全权限或无法补证的高影响风险，只暂停依赖该决定的部分，继续独立且已授权的工作。
- 重要决定前先交代整体位置和原有主路径，再说明变化、关系、影响、依据、选项及代价，最后给推荐和具体待决定事项。已有背景直接引用，小修改可简短交付；解释清楚不等于验证正确。
- 收到 Findings 先核实位置、契约、触发条件、影响和证据。实现偏差在授权内修复；未知保持未知并补证；错误意见说明不采纳依据；真实语义 / 范围变化交用户决定。意见本身不是新契约。
- 实现、契约、依赖、配置、消费者或环境变化时重验受影响证据，过期审查定向复核；仍适用的结果注明复用，项目必需门禁不能省略。一次有界调查没有新证据或同类修补持续复发时，重查根因与环境，报告阻塞，停止无依据补丁循环。

## 交付与结束

按用户请求交付成果概览（场景、前后行为、风险与待决项）、必要的设计导读（职责、状态、执行链和取舍）、证据入口（契约、准确 Diff / 源码、最终基线检查及限制）。复杂变化按理解需要展开；实现有意义地偏离此前说明时更新最终模型。

核对当前目标、最终基线、验证 / 审查与未决高影响问题。分别说明实现交付、实际测试、独立审查和人工验收；未验收可以“已交付，待验收”，不推断用户接受。交接只记录原任务中的目标、授权 / 契约来源、准确版本 / Diff、成果、证据与下一步条件，不自动开启新需求。

## 唯一入口与范围

[五流程迁移对照](references/workflow-mapping.md)说明能力保留与旧名称的替换关系。仓库只保留 `form-workflow` 一个项目工作流 skill；原六个入口及兼容目录已移除，能力保留在本目录的 references 中。历史任务提到旧名称时直接使用本入口，不尝试读取已删除路径或恢复旧路由。项目指引与 OpenSpec schema 使用同一入口；宿主发现刷新与实际自动调用仍须单独验证，第三方 skill 的触发规则不由本项目控制。

用户限定“只改 skill”时只写 `.agents/skills/`，不因归档 / 工具步骤写 AGENTS、docs、OpenSpec 或脚本；范围外说明落后时报告差异。本入口不扩大读写、安装、提交、推送、发布、共享或外部通信权限；每项操作核对当前授权与宿主规则。独立 ai-co 包不是运行依赖，不自动下载、安装或覆盖全局 / 其他项目 skill。
