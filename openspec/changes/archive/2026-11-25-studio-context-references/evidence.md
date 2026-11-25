# 查询试点实测

本轮使用本机 Codex CLI 和仓库工作区启动三个独立只读会话。自然语言提示描述任务和目标路径，未点名 Skill 或查询器。三轮均成功读取项目 Skill 并完成，规范和参考读取集中在 `.agents/`，工具命令未打开 `docs/` 的设计正文。

| 会话                   | 查询和加载结果                                                                                                                                                                                                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Studio TreeView        | 查到公开入口 `apps/studio/src/components/ui/index.ts`、`density`、`singleLine`、`isExpanded`、`onToggle` 和 Handbook 的 `?run#treeview` 示例；从 CSS 索引取到 `--studio-space-8 = 8px`。加载 `STUDIO-COMPONENT-001`、`STUDIO-FIELD-PICKER-001` 以及 `project-typescript-files`、`microsoft-typescript-modeling`、`react-derived-state`。 |
| 物料包 TypeScript 导出 | 加载 `ASSET-PACKAGING-001`、`project-typescript-files`、`microsoft-typescript-modeling` 和 `microsoft-packed-types`，核对公开入口、包外声明消费和聚合出口。                                                                                                                                                                              |
| Agent FastAPI          | 加载 `PLATFORM-AGENT-API-001`、`project-python`、`python-writing-patterns`、`fastapi-response-models`、`project-fastapi-transport`，识别既有 JSON 与 NDJSON 输出和调用方约束。                                                                                                                                                           |

索引包含 74 个组件条目，其中 24 个有可确认的公开入口，及 55 个实际 CSS Token。参考清单有 12 项，含 8 项带来源与许可的上游参考。6 项定向测试、索引与参考校验、原 AI Contract 检查、阅读页生成与同步检查通过。三个会话均为预检，产品行为与其他框架的完整实现流程未在会话中执行。新增入口未加入 CI。
