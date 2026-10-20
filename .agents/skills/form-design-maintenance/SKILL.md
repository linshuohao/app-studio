---
name: form-design-maintenance
description: 在动态表单引擎完整专题明确确认后，统一维护现行主题、必要 ADR、治理及来源并构建检查；也用于明确授权的现行知识维护，不将建议写成共识。
---

# 确认归档

从仓库根读取 `docs/README.md#incremental-maintenance` 与 `docs/design/workflows.md#workflow-maintenance`，执行既有统一维护程序，不另复制台账。

- 核对会话中的确认范围与授权；已有确认继续有效，不重复索要归档授权；部分确认不扩为全体确认，候选保留身份。
- 修改前检查工作区和已有改动。分类知识变化，核对必要上下游，仅增量修改受影响 Markdown / 样本源及关联。
- 按实际影响同步 ADR / 演进 / 治理 / 术语 / 来源；普通澄清不强建 ADR，文字增加不提升模块状态。搬迁遵循 relocated_sections 与保留检查。
- 优先用 `.venv-docs/bin/python` 执行 `tools/docs/build_docs.py` 和 `--check`；协议样例变化另跑 `docs/validation/run_validation.py`。呈现变化做实际渲染检查，未执行不得称通过。
- 审查本轮差异，保护已有工作；必要时与修改前快照比较。按 README 收尾报告实际结果；无知识变化则报告无变化，不创建空报告。

归档不自动授权编码或外部发布。用户同时要求实现时，完成相关准备后读取 `../form-delivery/SKILL.md` 继续。
