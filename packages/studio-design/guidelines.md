# Studio Design 设计准则

本页是 Studio 页面、组件、Token 与 Handbook 的统一维护入口。新增、调整和审查从本页、相关 Handbook 页和真实调用方起步。页面中的业务规则沿用所属领域契约。

## 组件与 Token

- 基础组件从 `@form-engine/studio-design-components` 的公共入口选取。优先复用已有组件或 Base UI 原语，缺少能力时核对输入输出、焦点、禁用、错误和原生表单行为，再考虑封装。
- 可跨页面复用的交互由组件承担。页面拥有业务状态、权限、提交和反馈。应用内部的业务组件由 Studio 维护，Handbook 可以用隔离数据展示它的真实交互。
- 主题、类型、颜色、间距、圆角和控件尺寸使用 [Token 真源](tokens/tokens.css)。新 Token 的说明应包含用途、适用范围和使用示例。组件内部临时计算留在其样式作用域。
- 使用公共 `Icon` 与 `IconName` 表达图标语义。图标按钮提供可访问名称，装饰图标随文字颜色。

## 交互和页面

- 覆盖正常、禁用、错误及适用的只读状态。键盘验收核对 Tab、Shift+Tab、Enter、Space、适用方向键与 Escape，以及浮层关闭和页面返回后的焦点恢复。
- 使用实际 PC 浏览器，在常规桌面窗口及收窄面板中检查入口可达、焦点可见、对齐和滚动。字段、导航、筛选和弹窗的具体密度与行为见 [Studio 交互与布局规范](../../docs/design/platform-studio.md#studio-ui-layout)。

## 同批维护与验收

1. 开始前按工作区路径或 `studio-component`、`studio-tokens`、`studio-handbook` 意图查询适用条款，核对公共导出、Token 和现有实例。
2. 新增公共组件时交付独立 Handbook 页并从目录链接。更新公共接口、行为或 Token 用途时，同批更新对应页。组件页说明用途、输入输出、主要状态、键盘交互，并运行实际组件。
3. 用 `python3 tools/docs/studio_catalog.py check` 校验组件页和 Token 引用，用 `pnpm handbook:check:tree` 验证手册构建与浏览器交互。应用页面改动另复验实际消费者。
4. 示例和文档源码随包维护，页面构建产物写入 Handbook 的 `dist/`。变更这些规则时更新本页与适用的项目条款及检查入口。
