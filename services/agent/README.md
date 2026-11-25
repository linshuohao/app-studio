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
| `agent/graph.py`、`agent/routing.py`、`agent/state.py` | 统一轮次 Graph、动作选择与本轮状态 |
| `agent/nodes/`、`agent/tools/`、`agent/middleware/` | 节点实现、工具绑定、节点及模型工具调用包装 |
| `business/conversations/`、`business/form_authoring/` | 会话所有权与幂等提交、需求、候选证据和创作续办事实 |
| `api/` | Agent FastAPI 路由、HTTP 响应及公开事件投影 |
| `execution/`、`observability/` | 步骤与调用回放、追踪与原始事件归档 |
| `integrations/`、`server.py` | 模型、协议手册、目录及 Compiler 适配与服务装配 |

### 整份 Markdown 与配置映射

调用方可随消息提供 Markdown 正文 `document`。Agent 记录原文并建立稳定的来源引用。理解节点读取整份正文，校验每条结构化需求的引文确实来自本轮正文、用户消息或可识别的用户历史。结果的 `requirements_trace` 提供版本、标准化记录及由同一记录渲染的 Markdown。

文档模式下，业务事实和假设统一进入 standard。有 ask_user 项时返回相应问题；look_up_source 项随 standard 交给创作节点核对。Agent 跨轮恢复同版本文档及其关联的用户原文。创作节点接收 standard 和可选的引用候选。需求明确后，创作节点使用标准化记录、整份协议手册和目标目录。调用 Compiler 前须登记覆盖每条需求的就绪映射，候选或能力澄清返回已登记的映射。Compiler 回执继续绑定确切候选文本。原始 Markdown 只在理解阶段整份传给模型，创作阶段可从标准需求的来源引用定位证据。需求索引和手册分片留待后续评估。

## 后续 Agent 职责

`business/roles/` 内每个文件声明最小输入、输出和异步调用协议，供后续讨论接线。目前入口接入问答和配置创作；独立需求分析、诊断修复、验证评估、填写辅助和运行诊断均处于接口草案阶段。首期需求澄清留在创作流程内。

| 接口文件 | 输入 → 输出 | 预留调用边界 |
| --- | --- | --- |
| `business/roles/requirements.py` | 用户消息、历史及来源 → 需求、假设和问题 | 创作流程内先做需求澄清，独立角色后续接入 |
| `business/roles/repair.py` | 确定配置基线与诊断 → 修订候选及依据 | 复用目录和 Compiler；运行诊断可交接已定位的配置问题 |
| `business/roles/verification.py` | 确切候选和场景引用 → 执行证据及覆盖缺口 | 接受执行器真实结果；可作为修复后的验证步骤 |
| `business/roles/fill_assistance.py` | Host 授权的实例快照与输入 → 带来源的字段建议或问题 | Host 确认及写入 |
| `business/roles/runtime_diagnostics.py` | 发布引用、现象、授权证据 → 原因说明与证据缺口 | 可向修复接口交接配置问题，其余问题由对应责任方处理 |

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

### Langfuse 评测追踪

对隔离的 Agent 评测实例安装 `uv sync --locked --project services/agent --extra observability`。锁定的 Python SDK 5 连接 Langfuse 4。启动时显式设置 `CREATE_FORM_LANGFUSE_EVAL=1`、`LANGFUSE_BASE_URL`、`LANGFUSE_PUBLIC_KEY` 和 `LANGFUSE_SECRET_KEY`。开关默认关闭。评测实例全量采样并发送框架捕获的输入和输出，使用合成用例与独立 Langfuse 项目。

使用对应会话 ID 查找 `AgentTurn`，用 `turn_id`、`creation_trace_id`、`resume` 关联轮次和当次执行。查看 `route` 输出与后续节点核对流转。检查真实 Compiler 调用用 `platform.check_candidate`，已保存步骤的恢复用 `journal.replay`，实际模型消耗看 generation。仅返回已经完成轮次的 HTTP 幂等请求不会执行 Graph。框架只统计模型适配器返回的用量，缺失字段按未知处理。

隔离评测实例同时把 LangChain 保有的所有回调参数逐条追加到本地 `.langfuse-evaluation/raw/{creation_trace_id}.events.jsonl`，包括未纳入评分的事件、流式增量、工具结果、错误和回放。可通过 `CREATE_FORM_EVAL_ARCHIVE_DIR` 指定目录。文件默认只允许当前用户读写，执行指标和 UI 过滤不会删减原始事件。框架没有提供的供应商内部数据无从记录。

用 `uv run --locked --project services/agent --extra observability pytest services/agent/tests/test_observability.py -q` 验证实际 SDK 的导出内容。该检查使用内存 exporter，验证 Graph 与 SDK 的接入。部署验收再使用合成样例在指定 Langfuse 服务中读回 trace。

在在线用例的 **Tracing** 里展开 `AgentTurn`，选中 `compose`、具体模型调用或工具节点，在 **Preview → Formatted** 查看该次输入输出。切换 **Raw** 可以查看原始结构；该视图持续加载时，可直接读取本地原始事件档案。离线基线导入的 trace 只有实验和评分记录。`experiment-item-task` 有历史评分任务的数据，原始 Agent 节点只能从实际在线记录查看。

### 跑 CreateForm 评测并查看原生看板

在仓库根启动本机 Langfuse，首次启动会下载官方镜像：

```sh
python3 services/agent/evaluation/langfuse-local.py
uv sync --locked --project services/agent --extra observability
```

看板在 [本机 CreateForm Evaluation](http://localhost:3300/project/createform-evaluation)。本地帐号及 SDK 凭证由启动脚本写入 `services/agent/.langfuse-evaluation/langfuse.env`，该目录不提交。登录使用其中的 `LANGFUSE_INIT_USER_EMAIL` 和 `LANGFUSE_INIT_USER_PASSWORD`。团队已有 Langfuse 4 项目时，可以直接提供该项目的 `LANGFUSE_BASE_URL`、`LANGFUSE_PUBLIC_KEY`、`LANGFUSE_SECRET_KEY`。

准备 Node workspace 依赖与本次代码对应的 Compiler、Runtime、物料及纯函数构建。如需重建，运行 `pnpm --filter '@form-engine/compiler...' --filter '@form-engine/runtime...' --filter '@form-engine/materials-react...' --filter '@form-engine/pure-functions...' build`。用当前模型执行现行 Graph 的基线：

```sh
uv run --locked --project services/agent --extra observability \
  python services/agent/evaluation/run.py \
  --name compose-baseline \
  --env-file services/agent/.langfuse-evaluation/langfuse.env \
  --env-file services/agent/.env.local \
  --repeat 3 \
  --output services/agent/.langfuse-evaluation/compose-baseline.json
```

模型由 `CREATE_FORM_MODEL` 指定。给候选版换一个运行名和输出文件，保持评测集、用例筛选、重复次数、模型、分数和环境一致。Runner 使用同一 Graph 和会话需求更新规则，配套本地 Web Compiler、Runtime 与受控目录。报告记录代码提交、工作差异摘要、评测集、协议、模型和工具环境。该路径测 Graph，不经过 Studio、Platform 的 HTTP 接口或持久化层。

首次试跑可用 `--repeat 1 --case contact-length`。做正式对比时保留完整报告的 `dataset_digest`、`scorer` 和 `capture_version`，用相同口径对齐两次运行。运行未通过时报告仍写盘，退出码为 1。

Runner 在线和离线都会在报告旁写 `.events.jsonl`。逐条记录 Graph 框架事件、评测输入和结果，以及本地 Compiler / Runtime 子进程的请求、输出、错误输出和耗时。进程输出的原始字节以 Base64 保存；其余结构化回调参数保留为 JSON。在线文件的 `trace_id` 可关联到 Langfuse，`case_id` 和 `trial` 可关联到报告。

想先验收评测器和看板，可以把参数换为 `--mode reference` 和 `--mode reference-broken`，各用不同运行名与输出文件，重复次数相同。这两种模式执行真实 Compiler 与 Runtime，不调用模型。后者故意移除「换国家清空城市备注」联动，预期返回非零退出码，并报告 Compiler 通过、Runtime 失败。`--offline` 仅输出 JSON，不连接 Langfuse。`--case` 可重复指定用例 ID。

| 怎么看 | 在 Langfuse 原生界面做什么 |
| --- | --- |
| 业务是否合格 | 打开 **Experiments**，进入 Runner 打印的实验链接。看 `business_success` 和 `business_disposition`，选失败用例，在输出中查看 `runtime_assertions` 的期望、实际与状态。`not_run` 表示缺少前置证据。 |
| 卡在哪一步 | 查看 `failure_at` 和该用例的 Compiler 诊断、轮次结果与节点顺序。`failure_at` 是发现失败的阶段。进入 trace 看 `route`、`compose`、`platform.check_candidate` 和 `repair` 的输入与输出，可继续追溯原因。 |
| Agent 能力和效率 | 在 **Experiments** 看 `route_valid`、`compiler_executed`、首次与最终编译通过、重编次数、修复次数、`agent_ms` 和 `elapsed_ms`。在关联 **Tracing** 中查看 generation 的实际用量与节点耗时。 |
| 基线与候选比较 | 在 **Experiments** 选择同一评测集的两次运行，点 **Compare**。先看回归用例，再比较用量与耗时。首次和最终编译通过数只包含已编译用例，另看 `compiler_executed` 核实覆盖。参考配置实验用于验证评分，Agent 实验用于比较模型与流程。 |

首批用例见 [评测集](evaluation/cases.json)。覆盖字段边界、枚举、澄清续办、联动和远程城市的工作值与 Host 请求契约。澄清相关性首期采用显式关键词断言。远程请求的浏览器交互、复杂旅险成员 Scope 和真实 Host 后端另有验收范围。效率目前展示实际分布，阈值以多次 Agent 基线记录为依据。

如果开发进程没有继承 Codex CLI 路径，在 Agent 的本地 `.env.local` 设置 `CODEX_CLI_DIR` 为包含 `codex` 的目录。开发工厂在启动时将该目录放到 Agent 的 `PATH` 前面。修改配置后重启 Agent。

`pnpm dev:all` 启动开发进程。缺少模型配置时开发 Agent 返回 503。正式装配使用 PostgreSQL 中已发布的手册版本、Platform 已安装的 Web 目录和真实 Compiler。Host 查询提供当前 Web 预览的城市搜索签名。编译结果中的 HostRequirements 是接入义务，业务 Host 实际注册另行验证。

Cursor 工作区使用 `services/agent/.venv`、Cursor Pyright 和 Ruff。命令行可从 Agent 目录执行 `uv run --locked pyright`、`uv run --locked ruff check .` 和 `uv run --locked ruff format --check .`。
