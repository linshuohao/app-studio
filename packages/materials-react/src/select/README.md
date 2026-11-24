# select · 固定选项

Manifest 是本目录的机器契约唯一来源。Props、Bindings、Events、Requests、Slots 见 [manifest.ts](manifest.ts)；实现和 Props 类型见 [implementation.tsx](implementation.tsx)。

静态 Binding 预期：字符串 ID 或 null；实际工作值仍须按 Adapter 的 ReadResult 读取，不能据静态契约断言合法。

只在用户选择时交付 ID，清空为 null；未知 ID 显示选项不可用并保留数据。DOM 索引与业务 ID 分开，空字符串 ID 可以使用。重复 ID 应由配置方避免。

运行装配调用 `createSelect(artifact)`，将返回值交给 Renderer 的 createMaterialRegistry；Compiler Catalog 使用同一 Manifest 和制品身份。编译端从 `@form-engine/materials-react/manifests` 导入契约。样式显式导入 `@form-engine/materials-react/styles.css`，不由静态入口加载。

真实输入、非法态及 Host 改值回归在 `../../tests/select/implementation.test.tsx`，浏览器验收页为 Playground 的 /materials。完整已确认契约见仓库 docs/design/extension-integration.md#first-assets-materials。
