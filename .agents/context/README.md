# AI 上下文库

这里放试点 Contract 与按任务使用的编写参考。Studio 组件与 Token 从 Handbook 和当前源码查询，物料与纯函数从现有资产目录查询。入口是根目录的 `AGENTS.md` 和 `form-workflow`。普通任务按计划改动的路径、意图查询，结果带条款正文、适用原因、消费者及检查入口。

| 位置 | 内容 | 维护方式 |
| --- | --- | --- |
| `routes.yaml` | 任务路径、意图、Contract 和验证入口的关系 | 增改适用范围时手工调整 |
| `generated/charter.md`、`generated/contracts/` | 项目宪章和已确认的领域约束 | 修改现行设计正文中的源条款，再运行生成器 |
| `generated/index.json` | 运行时条款索引，记录路径、条款、来源及校验信息 | 由 Contract 生成器维护 |
| `references.yaml`、`references/` | 按文件和意图选取的项目约定、框架参考、上游摘录及许可 | 补齐适用范围、用法、验证入口与出处 |

## 一个实际入口

```bash
.venv-docs/bin/python tools/docs/build_contracts.py select --path apps/studio/src/app/layout.tsx
.venv-docs/bin/python tools/docs/select_references.py --path apps/studio/src/app/layout.tsx --intent next-boundary
.venv-docs/bin/python tools/docs/studio_catalog.py lookup --kind token --query=--studio-warning-bg --limit 1
```

第一条回答本次要守哪些约束，第二条补充如何按当前 TS 与 Next.js 写法实现，第三条查可以复用的设计资产。仅供查证的消费者可以阅读其调用与测试，计划修改或审核该消费者时再为它加载适用规范。

要查所有参考分工，打开 [按任务选择参考](references/README.md)。要看实现、调试、审查怎么走，打开 [工作流方法参考](../skills/form-workflow/references/README.md)。独立上游 Skill 的调用说明见 [Skill 清单](../skills/README.md)。
