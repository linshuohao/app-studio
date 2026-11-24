# condition · 条件呈现

Props：visible:boolean 必填；Slot：default；无 Binding、Event 或 Request。

visible=false 不挂载内容；已写业务数据保留，业务规则不会随隐藏自动关闭。重新显示时读取 Runtime 当前值，不恢复旧输入缓存。

Manifest 是机器契约唯一来源，见 [manifest.ts](manifest.ts)；实现和 Props 类型见 [implementation.tsx](implementation.tsx)。调用 `createCondition(artifact)` 装配到 Renderer。静态契约从 `@form-engine/materials-react/manifests` 消费，样式显式导入 `@form-engine/materials-react/styles.css`。

回归位于 `../../tests/condition/`。真实 Compiler / Runtime、Typed Template 与成员组合在 tests/dialog-editor/members.test.tsx；Playground `/demos/members` 用同一 Runtime 切换平铺与摘要弹层，浏览器另验证焦点、Scope 和窄屏。jsdom 的原生弹层桩不证明真实焦点 / inert 行为。

物料只调用自身 Adapter；Slots 由 Renderer 构造，内部无另一份业务 Store。权威设计为 docs/design/extension-integration.md#first-assets-materials。
