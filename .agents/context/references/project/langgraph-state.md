# 项目的 LangGraph 状态与重放

- 明确 Graph state、轮次输入、执行 journal、对话持久化和公开事件的所有者。用现有轮次与会话身份查找真实执行记录。
- 节点重放与业务幂等都按项目现有接缝核对，需要单独判断副作用是否已经完成以及迟到结果是否有资格投影。
- 调整节点顺序、状态归属或公开输出时核对错误、重试、旧记录与实际 API / Studio 消费路径。机制背景见上游 LangGraph persistence，项目接口以仓库实现与已确认 Contract 为准。

## 当前恢复实现的预检

- `agent/graph.py` 调用 `graph.compile()`，轮次恢复由项目的 `execution_scope`、`TurnJournal` 和会话存储负责。按实际持久化与重放入口验证，对 LangGraph checkpointer、`thread_id` 或原生断点恢复的建议需要单独设计。
- `step()` 以步骤序号和节点名查已完成输出；`call()` 在步骤下使用调用种类、请求摘要和出现次数定位同一次调用。读取成功持久化的旧结果时走解码分支。调用返回与成功回执落库之间存在失败窗口，须区分本地记录重用和外部系统幂等。
- 先验证 `test_execution_replay.py` 与 `test_conversations.py`，再沿接口的进度和终态投影核对消费者。消费者只是查证对象时，路径保持在实现预检中；Contract 选择只传入计划改动的位置。
