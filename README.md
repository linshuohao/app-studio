# 复杂动态表单与数据录入引擎

当前处于核心契约细化与工程落地阶段。首期采用 Web/TypeScript + React；pnpm / Turborepo 工作区、六包、Next.js 轻量 Playground、NestJS 服务及测试 / 质量配置已初始化。工程示例不代表生产表单 Runtime 已实现。目录及包边界见[应用与工程架构](docs/reading/architecture.html#application-engineering)，安装、命令、实际版本与验收见[工程方案](docs/reading/engineering.html#engineering-implementation)。

开发模式通过包名直接消费工作区源码，无需预构建库；生产构建和打包验证继续消费 dist。

日常使用：`pnpm install --frozen-lockfile`、`pnpm dev`、`pnpm dev:api`、`pnpm check`。浏览器测试先运行 `pnpm build`，再运行 `pnpm test:e2e`；新环境先安装 Playwright 浏览器。文档环境按下方维护入口准备。

设计者按以下顺序阅读：

1. [整体架构](docs/reading/architecture.html)：目标、完整层级图、责任边界与交互主线。
2. [纵向与横向能力图谱](docs/reading/capability-map.html)：看清四层和跨层能力，再选择主题。
3. 各层具体设计：[L1 协议](docs/reading/l1-definition-protocol.html)、[L2 编译](docs/reading/l2-preparation.html)、[L3 执行](docs/reading/l3-reactive-engine.html)与[校验](docs/reading/l3-validation.html)、[L4 呈现](docs/reading/l4-renderer.html)。

后续工作统一维护在[设计进展与待讨论事项](docs/reading/governance.html)，包含每层缺口，以及尚未展开的 [Platform / Studio](docs/reading/platform-studio.html)。历史取舍在[设计演进](docs/reading/design-history.html)和独立 ADR 按需查看，不穿插在设计主线。原始 V0.* 等标签只用于追溯讨论来源，不是文档或引擎版本。

Markdown 是唯一正文，HTML、导航、索引和关联均自动生成。安装依赖后运行 `.venv-docs/bin/python tools/docs/serve.py --build`，打开[本地阅读系统](http://127.0.0.1:8765/docs/reading/architecture.html)。[安装、构建及维护说明](docs/README.md)，[协作约定](AGENTS.md)。
