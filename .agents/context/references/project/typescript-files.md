# 项目的 TypeScript 文件与入口

- 沿用所在工作区的目录、文件名与测试邻接方式。纯逻辑、契约和服务使用 `.ts`，带 JSX 的呈现使用 `.tsx`。组件公开符号用 PascalCase，当前模块内命名与同级文件一致。
- core 包的结构与构建由现有 package exports、依赖边界检查及 tsdown 配置共同约束。跨包使用公开入口，区分类型导入与运行时导入。新增导出时确认包外消费者和相应测试。
- Studio 与 Playground 的 Next 文件按框架路由约定落位。Nest 现有模块内区分 HTTP Controller、应用流与依赖实现，沿用现有后缀与归属。
- 项目已使用 strict、noUncheckedIndexedAccess、verbatimModuleSyntax、ESLint 与 Prettier。类型修复和公开声明按需添加 `ts-typing` 或 `ts-declarations`。
