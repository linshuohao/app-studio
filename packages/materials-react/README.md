# materials-react

本地已交付 14 个正式物料：text-input、number-input、checkbox、select、button、field、value-display，以及 section、grid、condition、dialog-editor、insured-summary、date-range、remote-select。完整业务纵切属于后续批次。运行组件只通过共用 Material Adapter 接入，业务值和校验归 Runtime。

```ts
import { createTextInput, createField } from '@form-engine/materials-react';
import { textInputManifest, fieldManifest } from '@form-engine/materials-react/manifests';
import '@form-engine/materials-react/styles.css';
```

create 工厂接收已确定的 artifact，并把返回值交给 Renderer 的 createMaterialRegistry。Compiler Catalog 使用对应静态 Manifest 和相同 artifact。`/manifests` 不加载 React、Renderer、Runtime 或样式；样式入口显式导入。不要把已注册组件直接嵌入另一个物料并复用其挂载上下文。

各资产目录含实现 / Props 类型、manifest.ts 和 README；测试在 tests 镜像目录。生成和版本命令见 [资产工具](../../tools/engineering/assets/README.md)，权威职责见 [首批设计](../../docs/design/extension-integration.md#first-assets)。

从仓库根运行 `node tools/engineering/catalog-docs.mjs --lookup text-input`，按物料 ID 从当前资产目录读取签名、说明、实现和示例。

包内测试使用真实 Compiler / Runtime 及 DOM 输入。Playground 的 `/demos/basic` 提供基础输入验收，`/demos/members` 以同一 Runtime 切换 Profile，验证成员、模板、条件、弹层和数组操作；`/demos/interactions` 使用可控 Host 验证日期确认、部分写入、搜索取消和迟到结果；首页统一导航到四个正式物料场景，旧 `/l4` 夹具已移除。这些页面还没有真实查询、核保或提交服务，不作为完整目标投保单验收。

`/demos/travel` 进一步装配全部 14 个物料与 7 个业务纯函数，使用本地可控 Host 验收完整家庭出行表单、动态试算、外部资格校验和对应快照交付；真实保险规则、服务、持久化与提交仍未接入。
