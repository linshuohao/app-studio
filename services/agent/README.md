# Studio Agent

现行设计见 [首期创建契约](../../docs/design/platform-studio.md#agent-create-contract)和[六类职责](../../docs/design/platform-studio.md#agent-roles-harness)。

## 调用链

Platform 鉴权后通过 `POST /internal/v1/conversations/{id}/turns` 转发本轮用户消息、稳定的 turnId、期望修订号与业务目标。Agent 在自己的 PostgreSQL 读取会话、历史和任务事实，调用同一张 Graph。服务认证和已认证用户、空间身份同时校验。普通及流式调用接收公开对话和可选的独立交付。

| 统一 Graph 节点 | 职责 |
| --- | --- |
| `load_context`、`route` | 恢复可复用的需求与失败候选、核对证据适用条件并决定下一步 |
| `lookup`、`chat` | 查询所需协议或目录，结合会话回答提问 |
| `understand`、`compose` | 整理需求，生成或修改候选，提交待检查的全文 |
| `check`、`repair` | Compiler 检查确切候选，模型基于失败回执提出一次修复 |
| `observe`、`deliver` | 合并本轮动作结果，交付消息、澄清、受阻报告或已通过检查的候选 |

编译证据、待答问题、需求与修复状态保存在 Agent 数据库。只读插问保留正在进行的任务。每轮执行以 PostgreSQL 会话锁串行，网络调用期间不持有业务事务。发送消息先记录本次输入，成功时在同一个事务提交私有结果、公开轮次、任务状态和可重放的交付。相同 turnId 与输入再次到达会复用已提交结果，失败请求可重试。并发执行和过期修订返回冲突。

Agent 在 `agent_conversations` 保存所有者、空间、会话版本、编辑上下文和任务事实，在 `agent_conversation_turns` 保存输入、执行状态、公开消息、私有结果及交付。删除会话清除这些内容并保留无内容的身份墓碑。Platform 通过独立交付收据管理业务草稿，已接受的草稿可以独立于会话继续使用。

| 位置 | 职责 |
| --- | --- |
| `api/conversations.py` | 会话列表、读取、删除、轮次、交付重放及公开的进度事件 |
| `conversations/model.py`、`conversations/store.py` | 权威会话事实、工作稿与证据恢复、所有权校验、幂等提交 |
| `agent_turn.py`、`turn_routing.py`、`turn_state.py` | 本轮执行图、动作选择、只读缓存和候选验证 |
| `create_form/nodes/`、`create_form/tools/` | 需求理解、配置创作、定点修复及工具适配 |
| `integrations/` | 读取已发布协议手册、目标目录及真实 Compiler 回执 |

### 整份 Markdown 与配置映射

调用方可随消息提供 Markdown 正文 `document`。Agent 记录原文并建立稳定的来源引用。理解节点读取整份正文，校验每条结构化需求的引文确实来自本轮正文、用户消息或可识别的用户历史。结果的 `requirements_trace` 提供版本、标准化记录及由同一记录渲染的 Markdown。

文档模式下，业务事实和假设统一进入 standard。有 ask_user 项时返回相应问题；look_up_source 项随 standard 交给创作节点核对。Agent 跨轮恢复同版本文档及其关联的用户原文。创作节点接收 standard 和可选的引用候选。需求明确后，创作节点使用标准化记录、整份协议手册和目标目录。调用 Compiler 前须登记覆盖每条需求的就绪映射，候选或能力澄清返回已登记的映射。Compiler 回执继续绑定确切候选文本。原始 Markdown 只在理解阶段整份传给模型，创作阶段可从标准需求的来源引用定位证据。需求索引和手册分片留待后续评估。

## 后续 Agent 职责

`roles/` 内每个文件声明最小输入、输出和异步调用协议，供后续讨论接线。目前入口接入问答和配置创作；独立需求分析、诊断修复、验证评估、填写辅助和运行诊断均处于接口草案阶段。首期需求澄清留在 CreateForm 内。

| 接口文件 | 输入 → 输出 | 预留调用边界 |
| --- | --- | --- |
| `roles/requirements.py` | 用户消息、历史及来源 → 需求、假设和问题 | CreateForm 内先做需求澄清，独立角色后续接入 |
| `roles/repair.py` | 确定配置基线与诊断 → 修订候选及依据 | 复用目录和 Compiler；运行诊断可交接已定位的配置问题 |
| `roles/verification.py` | 确切候选和场景引用 → 执行证据及覆盖缺口 | 接受执行器真实结果；可作为修复后的验证步骤 |
| `roles/fill_assistance.py` | Host 授权的实例快照与输入 → 带来源的字段建议或问题 | Host 确认及写入 |
| `roles/runtime_diagnostics.py` | 发布引用、现象、授权证据 → 原因说明与证据缺口 | 可向修复接口交接配置问题，其余问题由对应责任方处理 |

## 发布与装配协议手册

手册源文件为 [createform-l1-2026-11-22.2.md](knowledge/createform-l1-2026-11-22.2.md)。在已配置独立 Agent PostgreSQL 连接的环境中运行：

```sh
uv run --project services/agent alembic -c services/agent/alembic.ini upgrade head
uv run --project services/agent python -m form_agent.publish_protocol \
  createform-l1-2026-11-22.2 services/agent/knowledge/createform-l1-2026-11-22.2.md
```

发布命令读取 `AGENT_DATABASE_URL`，按原始 UTF-8 字节计算 SHA-256。相同版本与内容可重复发布，改内容须发新版本。只有发布步骤读取 Markdown 文件。

装配 `CreateFormTools(read_protocol=PostgresProtocolReader(dsn), ...)`，Platform 在内部请求的 `context.knowledge_version` 固定版本。创作节点的 `read_protocol` 返回该版本的完整手册；版本不存在时报错。部署入口从环境配置装配模型和 Platform 工具。

## 接线前待讨论

- **Platform 工具**：新版直接调用下的授权上下文、目录查询和 Compiler 回执 DTO、请求关联与失败重试语义。
- **模型和阶段**：供应方、Prompt、需求字段和能力映射的细度，以及 Host 接入清单的正式字段。
- **后续 Agent**：已授权的调用入口、工具范围与交接证据；接口草案随各专题确认。

使用 `uv run --project services/agent pytest -q` 运行骨架测试。设置 `AGENT_TEST_DATABASE_URL` 指向已迁移的独立测试数据库可一并运行手册入库和读取用例。测试走 FastAPI 和 Deep Agents，模型、知识查询、目录及 Compiler 由测试替身提供。


## 本地开发与 Cursor

在仓库根运行：

```sh
uv sync --locked --project services/agent
pnpm dev:agent
```

Studio 使用 Platform 的已认证会话代理和独立草稿服务。Platform 回调目标目录和 Compiler 固定在 `/internal/agent-tools/catalog`、`/internal/agent-tools/check`。系统部署前使用独立 Agent 数据库运行 Alembic 迁移。


| 进程 | 必需环境配置 |
| --- | --- |
| Platform | `CREATE_FORM_AGENT_URL`（例如 http://127.0.0.1:8100）、`AGENT_SERVICE_TOKEN`，可指定 `CREATE_FORM_KNOWLEDGE_VERSION`，默认上述 .2 版 |
| Agent | `CREATE_FORM_PLATFORM_URL`（例如 http://127.0.0.1:3001）、同一服务令牌、`AGENT_DATABASE_URL`、`CREATE_FORM_MODEL` |

部署使用 `uv run uvicorn form_agent.server:create_configured_app --factory`。模型通过 LangChain 的 `provider:model` 标识选择，安装匹配的 provider 包并设置其服务凭据。OpenAI API 部署可执行 `uv sync --locked --extra openai` 并配置 `OPENAI_API_KEY`。本机 ChatGPT 联调可选择 `local-chatgpt:gpt-6.2-sol`，使用已登录的 Codex CLI。它仅负责输出工具调用，使用临时空目录并忽略用户配置；Deep Agents 执行创作工具，CreateForm Graph 驱动修复与复验。

如果开发进程没有继承 Codex CLI 路径，在 Agent 的本地 `.env.local` 设置 `CODEX_CLI_DIR` 为包含 `codex` 的目录。开发工厂在启动时将该目录放到 Agent 的 `PATH` 前面。修改配置后重启 Agent。

`pnpm dev:all` 启动开发进程。缺少模型配置时开发 Agent 返回 503。正式装配使用 PostgreSQL 中已发布的手册版本、Platform 已安装的 Web 目录和真实 Compiler。Host 查询提供当前 Web 预览的城市搜索签名。编译结果中的 HostRequirements 是接入义务，业务 Host 实际注册另行验证。

Cursor 工作区使用 `services/agent/.venv`、Cursor Pyright 和 Ruff。命令行可从 Agent 目录执行 `uv run --locked pyright`、`uv run --locked ruff check .` 和 `uv run --locked ruff format --check .`。
