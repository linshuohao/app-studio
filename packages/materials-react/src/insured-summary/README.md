# insured-summary · 被保人摘要

Props：premiumMinor 为安全非负整数分或 null，必填；emptyName=未填写姓名。Binding：insured:object；无 Event、Request 或 Slot。

读取 name / age 与当前成员子树 Issues，格式化传入的试算金额；不计算保费、不判断承保年龄、不修改成员。空白姓名使用 emptyName，无法显示的值占位，不输出对象技术 JSON。聚合状态不等于成员或整单完整证明。

Manifest 是机器契约唯一来源，见 [manifest.ts](manifest.ts)；实现和 Props 类型见 [implementation.tsx](implementation.tsx)。调用 `createInsuredSummary(artifact)` 装配到 Renderer。静态契约从 `@form-engine/materials-react/manifests` 消费，样式显式导入 `@form-engine/materials-react/styles.css`。

回归位于 `../../tests/insured-summary/`。真实 Compiler / Runtime、Typed Template 与成员组合在 tests/dialog-editor/members.test.tsx；Playground `/demos/members` 用同一 Runtime 切换平铺与摘要弹层，浏览器另验证焦点、Scope 和窄屏。jsdom 的原生弹层桩不证明真实焦点 / inert 行为。

物料只调用自身 Adapter；Slots 由 Renderer 构造，内部无另一份业务 Store。权威设计为 docs/design/extension-integration.md#first-assets-materials。
