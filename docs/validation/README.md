# 验证附件维护

[协议样例](index.html) 展示完整 Definition、结构关系、变化流程和验证记录；页面内的 [复现与来源](index.html#reproduce) 已包含运行入口与来源链接。本目录是验证附件，不增加架构决策层级，设计依据见 [L1 协议正文](../design/l1/README.md)。

## 生成源

- `build_cases.py` 构造 01–05；其中保险基线直接读取 [示例正文](../design/l1/07-examples.md#sample) 的 JSON 代码块。
- `extend_cases.py` 在基线上补充 06–08 及测试契约；修改样本时编辑生成源，不直接修改 cases / fixtures。
- `create_report.py` 用完整样本、报告和覆盖表生成展示；阅读外壳与其他现行文档共用，卡片和图示布局补充在 `../reading/assets/examples.css`。
- `walkthroughs.json` 是手工维护的跨层契约说明源，供图鉴生成使用；实例 / 稳定快照与 Host 业务基准 / Dirty / 恢复意图按现行职责分别说明，不是生成的 cases 或正式 L1 字段。

## 复现 {#reproduce}

Python 3.9+，项目根目录执行：

```bash
python3 -m pip install -r docs/validation/requirements.txt
python3 docs/validation/run_validation.py
```

入口依次重建样本、候选 Schema、静态与负向检查、有界探针、覆盖表和样例页，并核对原包摘要、01–05 的确定迁移及 Fixture 一致性。仅调整展示时运行 `python3 tools/docs/build_docs.py` 即可使用现有报告生成页面；追加 `--check` 检查同步。

## 证据边界

[report.json](report.json) 保存实际结果，[coverage.json](coverage.json) 按文件和 JSON Pointer 记录能力及证据；[walkthroughs.json](walkthroughs.json) 是跨层契约图解，不能作为 Definition 字段使用。

- 候选 Schema、静态检查和有效 Fixture 不是正式 L2；有界 FIFO 探针不冻结生产 L3 调度。
- V0.6 的 [25 项来源记录与现行处理](../design/l3-reactive-engine.md#l3-v06-decisions)、[16 个修订后场景](../design/l3-reactive-engine.md#l3-v06-acceptance) 及 [B01–B08 边界验收](../design/l3-reactive-engine.md#l3-runtime-host-boundary) 均不计入已有通过数。后续用户已撤回 Runtime 自动业务基准 / Reset 重算，业务 Baseline / Dirty / Reset 归 Host。候选 Schema 尚未固化 runOnActivate，探针未实现真实前后 ScopeReadView、Trie / 模板索引、稳定 snapshot 与新实例激活、独立执行事件；不能把现有通过统计当成这些契约已验收。
- 现行 External Constraint 使用 `watch`，候选 Schema 拒绝旧 `dependsOn` 与双字段混用。when 的读取合并、Dependency Plan、按状态来源匹配、真实订阅 / 挂载及调度仍属于 [跨层设计验收](../design/dependency-reactivity.md#dependency-acceptance)，现有通过计数不证明这些行为已实现。
- V0.7 的 [19 项校验决策与 V01–V16](../design/l3-validation.md#validation-decisions) 属于设计归档。现有探针未实现根 Schema Adapter 缓存、本轮前置整理、Source / 字段聚合或完整校验 API；requires / validationMessages 未加入候选 Schema。旧五态图仅解释正确性概念，不要求 UI 暴露每源状态机，也不把无 Issue 当作通过。
- 生命周期、校验五态、Readiness、竞态 / ABA、Field State、输出和交付图解不代表 Runtime 已实现。现行 batch 默认有序即时生效、不整体回滚；有界抽测未验收不可变 Snapshot、Reaction pending 合并、Prepared 唯一入口、真实 Flush、可隔离 Command 错误继续、整体熔断与再触发、Trace、跨重排身份、完整异步失效、真实提交或 Web / Flutter 渲染。新的 C01–C18 见 [L3 设计验收](../design/l3-reactive-engine.md#l3-acceptance)，V0.5 的 [22 项来源决策与 12 个跨层场景](../design/dependency-reactivity.md#dependency-v05-decisions) 同样属于设计，未计入已有通过统计。
- `array.insert` / `array.move` 位置语法未固化，样本仅展示确认字段，探针拒绝执行；结构通过不代表完整可执行。
- 日期地区 `demo-A` / `demo-B` 与版本化 Pure Function 是合成测试契约，不代表真实法规或正式内置纯函数。

测试纯函数契约保存在 `manifests/pure-functions.json`，条目键为 `pureFunctions`；06 的说明性 metadata 使用 `testPureFunctions`。这只是验证附件术语同步，正式 PureFunctionManifest、`core.*` 别名规范化与发布锁尚未实现，设计边界见 [L2 能力契约](../design/l2-preparation.md#l2-manifests)。

## 来源

[原始 ZIP](../history/l1-protocol-validation-source.zip) 完整保留，文件摘要见 [source-manifest.json](source-manifest.json)。01–05 的 Definition 仅做 `views.<profile>.entry` 确定扁平化和 External `dependsOn` → `watch` 等值字段迁移，引用内容不变，Fixture 与来源一致；原始下载源未修改。当前尚无已发布正式协议版本，样本保留原候选 protocolVersion，不能将测试迁移当成正式兼容策略；版本识别与迁移工具待固化。具体检查结果以本次生成报告为准，不在说明中重复维护统计数字。
