---
name: form-design-maintenance
description: 在动态表单引擎完整专题明确确认后，或明确授权维护现行知识时使用；未确认建议不进入现行规范。
---

# 确认归档

从仓库根读 `docs/README.md#incremental-maintenance` 与 `docs/design/workflows.md#workflow-maintenance`，执行既有统一维护程序，不另建台账。

- 核对会话确认范围与授权，已有确认继续有效，不重复询问；部分确认不扩大，候选保留身份，审查发现和验证通过不自动成为设计决策。
- 修改前核对暂存、未暂存、未跟踪和既有改动，必要时保存快照区分本轮增量。分类知识变化，检查必要上下游，仅改受影响 Markdown / 样本源及派生物。
- 保留设计意图、行为 / 不变量及验收关联，按影响同步 ADR、演进、治理、术语和来源。普通澄清不强建 ADR，搬迁遵循 relocated_sections 与保留检查；契约调整涉及既有实现时列出后续验证需求，不凭归档关闭代码缺陷。
- 优先用 `.venv-docs/bin/python` 执行 `tools/docs/build_docs.py` 和 `--check`；协议样例变化另跑 `docs/validation/run_validation.py`。呈现变化做实际渲染检查，未执行不得称通过。
- 核对最终差异和基线，保护既有内容、稳定 ID 及其他工作。按 README 报告真实文件、ADR / 一致性 / 状态、实际结果及未完成项，区分规范确认与实现证据；无知识变化就报告无变化，不创建空报告。

归档不自动授权编码、修复或外部发布。用户同时要求实现时衔接 `../form-delivery/SKILL.md` 的只读预检与验收；契约内细化不重开架构讨论。
