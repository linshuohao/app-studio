# Assemble Studio 研发工作流

项目把研发组织成四个部分：宪章定义决策与证据原则，SDLC 串起需求到交付，领域 Contract 明确每项工作的约束，Harness 提供可调用的工具、验证环境和反馈。人对需要取舍的公共行为作决定，AI 在确认范围内实现、验证并维护知识。

## 设计理念与方法

- **通过行为理解设计。** 从目标场景、失败和反例出发，说明状态由谁拥有、边界如何协作，以及调用者最终能观察到什么。
- **按证据推进。** 每个切片从设计意图和 Contract 走到代码、真实执行与验收。类型和静态规则覆盖可机械判定的约束，浏览器、HTTP、历史数据和打包消费者覆盖真实行为。
- **渐进式上下文。** 人读设计在 `docs/` 和 Handbook。AI 的宪章、领域条款、索引和方法集中在 `.agents/`。生成视图直给短条款，附源位置供维护与追溯。任务需要新领域时从同一入口扩大加载。
- **单一规范来源。** 已确认条款写入所属现行主题，生成 AI 视图。人读页面保留理由、图和例子。单次变更沿用当前任务、PR 或 OpenSpec。

## 一个需求如何推进

| 环节             | 交付结果                                                       |
| ---------------- | -------------------------------------------------------------- |
| 澄清与设计       | 确认当前行为、目标、消费者及正反例。按 A/B/C 处理真实取舍      |
| 归档与预检       | 经过确认的规范归位，AI 条款同步；切片、基线、检查和缺口清楚    |
| 实现与验证       | 从正常入口交付行为，随 Diff 扩大更新上下文、消费者和实际证据   |
| 审查与交付       | 核对最终基线、必要独立审查、文档同步及真实验收，按实际授权交付 |
| 发布、观察和回流 | 对适用制品或环境记录生效、迁移、回退及观察，按原 Change 归档   |

自然语言需求进入 [项目 Skill](.agents/skills/form-workflow/SKILL.md)。根 [AGENTS.md](AGENTS.md) 引导宿主加载。需要设计、调试或审查时由同一 Skill 选择对应方法；轻量任务可以在当前对话或 PR 完成，复杂变更使用原 OpenSpec Change。

## 具体设计与分工

| 载体                                     | 作用                                                             | 何时使用                                                 |
| ---------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| 现行主题里的 `contract` 块               | 维护条款身份、状态、范围、要求和检查引用。与人读图文共用语义来源 | 确认或修订规范时更新                                     |
| `.agents/context/routes.yaml` 与生成视图 | 集中登记意图、路径、消费者与条款。按需读取短宪章和适用条款       | 开始、预检、恢复、实际 Diff 扩大、审查                   |
| `form-workflow` 及其方法                 | 恢复任务，选择设计、归档、交付、调试、审查或流程改进             | 按当前缺口调用                                           |
| 规则、脚本、浏览器和包外消费者           | 对照实际执行检查依赖、交互、Schema、制品或兼容语义               | 切片交付、合入、归档或发布，各自按适用范围执行           |
| OpenSpec 及现有收据                      | 保存复杂变更的范围、单一任务清单和验收结果                       | 有独立恢复或跨层影响的复杂变更；输入变化后重验受影响范围 |

任务从路径和意图加载条款，沿真实入口核对消费者，再选择检查。规则来源地址供审查与维护追溯。路由覆盖不到的路径、仅根据主题推得的交集、以及实际运行结果，在交付时分别说明。

[Studio Design 设计准则](packages/studio-design/guidelines.md) 是 Studio 页面、组件、Token 和手册任务的统一首读入口。[Studio Design Handbook](packages/studio-design/handbook/studio-design-handbook.html) 连接组件、代码和主题 Token。物料与纯函数沿用 Studio 资产目录，查询直接读取资产源码和既有说明。[按任务选择参考](.agents/context/references/README.md)说明领域写法与验证入口，[form-workflow 的方法参考](.agents/skills/form-workflow/references/README.md)说明研发步骤，[项目 Skill 清单](.agents/skills/README.md)记录已纳入的上游 Skill。

## 执行与维护

```bash
.venv-docs/bin/python tools/docs/build_contracts.py --check
.venv-docs/bin/python tools/docs/build_contracts.py select --intent studio-component
.venv-docs/bin/python tools/docs/build_contracts.py select --intent asset-packaging
.venv-docs/bin/python tools/docs/studio_catalog.py lookup --kind component --query TreeView --limit 1
.venv-docs/bin/python tools/docs/studio_catalog.py lookup --kind token --query=--studio-space-8
node tools/engineering/catalog-docs.mjs --lookup text-input
node tools/engineering/catalog-docs.mjs --lookup date.inclusiveDays
.venv-docs/bin/python tools/docs/select_references.py --path packages/studio-design/components/src/tree-view.tsx --intent react-render
pnpm docs:check
```

Studio 试点使用 `pnpm handbook:check:tree`，在临时目录构建并运行 Handbook 实例。资产试点先构建包，再跑 `pnpm packages:check`，对照单资产 Manifest 和独立安装的制品。离线包检查需要已缓存的锁定依赖。

说明与图文变化按原来源维护。生效条款变化要重建 AI 视图并复核规则和消费者。改变一类需求的责任人、执行时点、必需证据或继续条件时，同步 SDLC。交付记录说明实际验证的环境和范围，扩大门禁以实测覆盖为依据。

- [现行宪章、完整 SDLC 与 Harness 设计](docs/design/workflows.md#engineering-charter)
- [文档与 AI 上下文维护手册](docs/README.md#maintain-ai-context)
- [Rules 更新与工程门禁](docs/design/engineering.md#engineering-rule-maintenance)
- [OpenSpec、变更恢复和证据适配](docs/design/workflows.md#workflow-openspec)
