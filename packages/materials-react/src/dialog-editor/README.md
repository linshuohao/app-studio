# dialog-editor · 成员编辑弹层

Props：title 必填、triggerLabel=编辑、disabled=false；Slots：summary / content；无 Binding、Event 或 Request。

原生 dialog 经 Portal 呈现内容，浏览器管理模态焦点。输入实时写 Runtime；完成、关闭和 Escape 只关闭视图，不回滚业务值。关闭后聚焦仍在文档中的原触发按钮；成员删除、整数组替换、Profile 更换和卸载清理 Portal。disabled 保护打开按钮，已打开视图仍可关闭。

Manifest 是机器契约唯一来源，见 [manifest.ts](manifest.ts)；实现和 Props 类型见 [implementation.tsx](implementation.tsx)。调用 `createDialogEditor(artifact)` 装配到 Renderer。静态契约从 `@form-engine/materials-react/manifests` 消费，样式显式导入 `@form-engine/materials-react/styles.css`。

回归位于 `../../tests/dialog-editor/`。真实 Compiler / Runtime、Typed Template 与成员组合在 tests/dialog-editor/members.test.tsx；Playground `/demos/members` 用同一 Runtime 切换平铺与摘要弹层，浏览器另验证焦点、Scope 和窄屏。jsdom 的原生弹层桩不证明真实焦点 / inert 行为。

物料只调用自身 Adapter；Slots 由 Renderer 构造，内部无另一份业务 Store。权威设计为 docs/design/extension-integration.md#first-assets-materials。
