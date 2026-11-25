# 项目的 Python 工作区

- Agent 服务以 `services/agent/pyproject.toml` 和其本机锁文件为准，使用 Python 3.12、Ruff、Pyright 和 pytest。文档工具沿既有文档运行环境与依赖。
- Agent 中归属按现有模块确定：HTTP transport 在 api，业务协调在 business，Graph 路由和节点在 agent，运行与观测各自维护，外部系统接缝归 integrations。
- Python 编写约束由同批加载的上游参考和实际工具配置提供。FastAPI HTTP 或 LangGraph 状态工作分别增加相应专题意图。
