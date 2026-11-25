# Studio Design Handbook

[Studio Design](../README.md) 的组件与 Token 手册。新增或修改内容遵循 [Studio Design 设计准则](../guidelines.md)。

从仓库根运行 `pnpm build` 或先构建示例依赖，然后用 `pnpm handbook:build` 生成完整手册。打开 `dist/studio-design-handbook.html` 浏览所有页面。也可运行 `pnpm handbook:check:tree` 在临时目录构建并复验交互。

目录、独立页面与编辑示例在本包内维护。示例引用真实组件与 Token，并在需要时使用本地数据替代服务请求。`dist/` 承载生成后的页面、示例包和资源。
