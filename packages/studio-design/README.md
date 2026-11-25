# Studio Design

Studio Design 是 Studio 的设计系统。Studio 应用和 Handbook 使用同一套公共组件与设计 Token。

| 入口 | 职责 |
| --- | --- |
| [设计准则](guidelines.md) | 新增或修改 Studio 页面、组件、Token 和 Handbook 时的统一规则 |
| [组件包](components/package.json) | `@form-engine/studio-design-components` 的公共 React 组件和组件样式 |
| [Token 包](tokens/tokens.css) | `@form-engine/studio-design-tokens/tokens.css` 的主题变量 |
| [Handbook](handbook/README.md) | 组件与 Token 文档、真实示例、目录和本地验收 |

Studio 负责页面编排、业务状态、权限和应用特有样式。Handbook 的业务示例可接入实际 Studio 组件与本地数据。组件包和 Token 包的依赖方向不经过 Handbook 或 Studio 应用。

从仓库根执行 `pnpm handbook:build` 并打开 `handbook/dist/studio-design-handbook.html`。运行 `pnpm handbook:check:tree` 验证执行结果。
