# field · 字段呈现

Manifest 是本目录的机器契约唯一来源。Props、Bindings、Events、Requests、Slots 见 [manifest.ts](manifest.ts)；实现和 Props 类型见 [implementation.tsx](implementation.tsx)。

静态 Binding 预期：任意 JSON；实际工作值仍须按 Adapter 的 ReadResult 读取，不能据静态契约断言合法。

label / help / requiredMark 与 default Slot 组合；value 和子控件显式绑定同一位置。消费 Runtime 已有状态和 Issues，不增加 touched 或校验状态存储。私有 Context 仅提供独立 DOM ID、标签焦点和描述关联；多个控件仍使用各自 ID。

运行装配调用 `createField(artifact)`，将返回值交给 Renderer 的 createMaterialRegistry；Compiler Catalog 使用同一 Manifest 和制品身份。编译端从 `@form-engine/materials-react/manifests` 导入契约。样式显式导入 `@form-engine/materials-react/styles.css`，不由静态入口加载。

真实输入、非法态及 Host 改值回归在 `../../tests/field/implementation.test.tsx`，浏览器验收页为 Playground 的 /materials。完整已确认契约见仓库 docs/design/extension-integration.md#first-assets-materials。
