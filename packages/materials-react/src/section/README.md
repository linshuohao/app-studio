# section · 章节容器

Props：title / description / collapsible=false / defaultExpanded=true；Slots：default / actions；无 Binding、Event 或 Request。

只在当前挂载时读取 defaultExpanded。收起时卸载内容 Slot，保留 Runtime 数据、规则与已发布校验；actions 保持可见。collapsible=false 始终显示内容，不向 Data 写默认值。

Manifest 是机器契约唯一来源，见 [manifest.ts](manifest.ts)；实现和 Props 类型见 [implementation.tsx](implementation.tsx)。调用 `createSection(artifact)` 装配到 Renderer。静态契约从 `@form-engine/materials-react/manifests` 消费，样式显式导入 `@form-engine/materials-react/styles.css`。

回归位于 `../../tests/section/`。真实 Compiler / Runtime、Typed Template 与成员组合在 tests/dialog-editor/members.test.tsx；Playground `/demos/members` 用同一 Runtime 切换平铺与摘要弹层，浏览器另验证焦点、Scope 和窄屏。jsdom 的原生弹层桩不证明真实焦点 / inert 行为。

物料只调用自身 Adapter；Slots 由 Renderer 构造，内部无另一份业务 Store。权威设计为 docs/design/extension-integration.md#first-assets-materials。
