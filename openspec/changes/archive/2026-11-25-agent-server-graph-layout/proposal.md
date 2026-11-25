## Why

将统一助手的 Graph 组织与现行 Agent Server 职责对齐。

## What Changes

将 Python Agent Server 从按创建流程散布的模块改为按统一 Graph 职责组织。用户确认目录和命名草案后授权实施，并要求重构前后业务行为一致。范围限 Agent Server 及其测试、评测入口和文档。

## 权威依据

- [Agent Server 目录与执行边界](../../../docs/design/platform-studio.md#agent-server-layout)
- [统一助手 Graph](../../../docs/design/platform-studio.md#agent-turn-graph)
- [消息、执行步骤与中断恢复](../../../docs/design/platform-studio.md#agent-turn-recovery)
