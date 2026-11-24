# Asset tooling

权威契约：[工程方案](../../../docs/design/engineering.md#asset-tooling)、
[首批正式资产](../../../docs/design/extension-integration.md#first-assets)。

生成器使用仓库模板，源码在包内平铺，测试放 tests 镜像，集中导出只更新受控区块。
它不会覆盖已有目录或导出。模板明确未实现，TODO 测试须替换；release:plan 会拒绝未完成资产。

```bash
pnpm asset:new material --id date-range --dry-run
pnpm asset:new function --id text.isNonBlank
pnpm asset:change --id text.isNonBlank --bump minor --summary '说明行为与兼容影响'
pnpm assets:check --base <commit-or-tag>
pnpm release:plan --base <commit-or-tag> --output /private/tmp/new-release-plan.json
pnpm release:check --plan /private/tmp/new-release-plan.json
pnpm release:apply --plan /private/tmp/new-release-plan.json
pnpm release:check --plan /private/tmp/new-release-plan.json
```

以上 ID 仅演示命令：已有资产不能再生成。所有命令支持 --root；输出计划拒绝覆盖已有文件。
change 可用 --no-release --summary 表达经审查无公开影响的资产修改，不可用于跳过契约变更。
包级变更可用 `asset:change --package @form-engine/materials-react --bump minor --summary '说明'`，
或继续用标准 Changesets 声明；资产记录附在同一 .changeset 正文中。`--id` 和 `--package` 二选一。
包内无公开影响的源码整理可用 `--package NAME --no-release --summary '理由'`，
但公开 exports / 依赖 / 引擎要求变化仍须声明包升级；共享资产实现仍须逐资产明确覆盖。

assets:check 默认检查工作树相对 HEAD；完整分支检查显式传 --base 或设置 ASSET_BASE_REF。
CI 使用 PR base / push before 的 SHA，远端 CI 尚未运行；无有效历史基线时明确报错。
release:plan 必须显式指定基线，优先采用上次交付对应的确定提交 / 标签，不猜 latest。

计划包含所有相关输入摘要、目标文件前后内容和自身摘要。计划生成后改代码、测试、配置或
声明都会使其过期；重新生成一个新计划再应用。apply 先复算 Changesets 计划，结果一致才写入，
不在真实仓库中探索性执行 Changesets version。生成 / 声明 / 应用互斥；可恢复异常会回滚本次写入。
进程硬中断留下锁时，先检查锁中 PID 和计划的文件前后内容再处理，不能盲删其他进程的锁。

release:check 分别返回 ready / applied；同计划再次 apply 明确拒绝，不二次加版本。
被消费的声明从指定 Git 基线读取，用于核对版本准备提交。版本应用只处理元数据和日志，
制品字节摘要由后续真实构建交付产生；不计算假摘要、不提交、不打标签、不 push / publish。

版本准备应先保存代码与待发布声明的 Git 提交。`release:plan --base` 用上次交付基线计算影响；
应用后的 `assets:check --base` 用包含待发布声明的版本准备前提交核对消费结果（默认 HEAD 适用于尚未提交版本应用的工作树）。
当前 CI 按 PR base / push before 比较，因此建议将版本准备作为后续独立变更，基线中保留声明；
工具不会从更早基线或任意历史自动重建已被消费的声明。未提交声明的演练应保留计划作为恢复依据。

Manifest 按 TypeScript AST 读取 JSON 字面量并用 protocol Schema 校验，不执行资产代码。
保守检查会要求显式覆盖共享 _internal 修改及无法证明兼容的签名变化；不能证明任意行为兼容。
当前工具面向两个已确认资产包，既有 core 不重编号；Prerelease、多版本共存及自动资产删除迁移未启用。

```bash
pnpm exec vitest run tests/integration/assets-tooling.test.ts tests/integration/business-functions.test.ts
```
