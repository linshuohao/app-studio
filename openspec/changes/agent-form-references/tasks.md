## 1. 首批交付

- [x] 1.1 归档确认范围并验证阅读页。
- [x] 1.2 验证输入、入口、版本与轮次边界。浏览器通过斜杠补全、焦点回归、两个页面入口、失效引用拒绝及待发输入保留；独立审查核对同轮重试与会话隔离。
- [x] 1.3 隔离浏览器验证引用 A 生成 B。`pnpm --filter @form-engine/studio exec node tests/run-agent-ownership.mjs --live --form-references` 通过。A 更新后，真实模型以先前选定的版本生成独立 B 草稿，Compiler 预览通过，刷新历史可见该版本的链接。

## 2. 资产和页面对象

- [x] 2.1 归档第二批契约并实现三条指令、两个目录入口和页面点选。
- [x] 2.2 浏览器验收资产、字段、控件和规则的选择、读取与回链。`pnpm --filter @form-engine/studio exec node tests/run-agent-ownership.mjs --live --asset-references` 通过，含错误制品摘要拒绝、真实 Agent 读取与历史原文定位。
