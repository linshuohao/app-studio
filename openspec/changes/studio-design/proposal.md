## Why

Studio Design 的可用组件、主题 Token 和 Handbook 需要统一入口。依据 `docs/design/platform-studio.md#studio-ui-components` 和 `#studio-ui-context`。

## What Changes

- Studio 使用独立 workspace 组件包和 Token 包。Handbook 迁入 Studio Design 并按需构建。
- Studio 页面、组件、Token 和 Handbook 的工作流统一加载包内设计准则。

## Impact

影响 Studio 源码导入、Handbook 构建、设计目录和 AI 条款路由。
