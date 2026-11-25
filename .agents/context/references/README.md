# 按任务选择参考

这里的内容回答「在项目里怎么做这类改动」。Contract 负责已确认行为，参考负责写法、例子和验证线索。普通执行从此目录按任务取用，设计来源留给变更评审和条款维护。

| 任务 | 加载内容 | 直接使用方式 |
| --- | --- | --- |
| TS 文件和类型 | [项目 TS 文件约定](project/typescript-files.md)与 [Microsoft 类型建模](upstream/microsoft-typescript/strict-modeling.md) | 传入要改的 `.ts` 或 `.tsx` |
| 公共声明与包导出 | [Microsoft 包外声明消费](upstream/microsoft-typescript/packed-declarations.md)；必要时显式调用完整 Skill | 对 `packages/` 使用 `ts-declarations` |
| Python 编写 | [项目 Python 约定](project/python-project.md)与[上游常见反例](upstream/python-development/python-anti-patterns.md) | 传入要改的 `.py` |
| React 渲染或并发 | [派生状态](upstream/vercel-react/rerender-derived-state-no-effect.md)、[并行等待](upstream/vercel-react/async-parallel.md) | UI 路径选 `react-render` 或 `react-async` |
| Next 路由和渲染边界 | [Next 16.4.5 服务端与客户端](upstream/next/server-client.md)和 [Studio 项目落点](project/next-studio.md) | Studio／Playground 路径选 `next-boundary` |
| Nest HTTP 参数与响应 | [Nest Controller 参考](upstream/nestjs/controllers.md)和 [Platform HTTP 边界](project/nest-http.md) | `services/api/src/` 路径选 `nest-http` |
| FastAPI 请求或返回 | [官方返回模型摘录](upstream/fastapi/responses.md)与 [Agent HTTP 边界](project/fastapi-transport.md) | Agent API 路径选 `fastapi-http`，更广的 FastAPI 任务显式调用完整 Skill |
| Agent Graph 续跑 | [日志、重放与验收](project/langgraph-state.md) | Agent 对应路径选 `langgraph-state`，再核对恢复 Contract |

查出现规则缺口时记录具体任务、误读或缺少的约束、实际命令和反例。项目要求写到拥有它的条款或项目参考。上游规则优先选原文，保留来源、版本和许可。添加路由后跑 `.venv-docs/bin/python tools/docs/select_references.py --check`，再验证正向命中和无关任务没有误加载。
