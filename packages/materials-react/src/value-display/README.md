# value-display · 只读展示

Manifest 是本目录的机器契约唯一来源。Props、Bindings、Events、Requests、Slots 见 [manifest.ts](manifest.ts)；实现和 Props 类型见 [implementation.tsx](implementation.tsx)。

静态 Binding 预期：无 Binding，value 在 Props 中；实际工作值仍须按 Adapter 的 ReadResult 读取，不能据静态契约断言合法。

text 显示标量，integer 显示安全整数，moneyMinor 将 CNY 安全整数分显示为元和两位小数。空值或不适用类型显示 emptyText，默认 —；对象不输出技术 JSON。

运行装配调用 `createValueDisplay(artifact)`，将返回值交给 Renderer 的 createMaterialRegistry；Compiler Catalog 使用同一 Manifest 和制品身份。编译端从 `@form-engine/materials-react/manifests` 导入契约。样式显式导入 `@form-engine/materials-react/styles.css`，不由静态入口加载。

真实输入、非法态及 Host 改值回归在 `../../tests/value-display/implementation.test.tsx`，浏览器验收页为 Playground 的 /materials。完整已确认契约见仓库 docs/design/extension-integration.md#first-assets-materials。
