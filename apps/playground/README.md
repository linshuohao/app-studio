# Playground

在仓库根执行 `pnpm dev`，从首页 `/` 选择场景。Demo 使用正式物料库的 Manifest、公共工厂和共用 Adapter；本地 Host 提供模拟服务，未连接真实保险、持久化或提交接口。

| 路由 | 场景 | 主要能力 |
| --- | --- | --- |
| `/demos/basic` | 基础资料 | 普通输入、未知选项、字段校验、快照交付 |
| `/demos/members` | 家庭成员 | Scope / Template、增删移动、条件、平铺与摘要弹层 |
| `/demos/interactions` | 日期与城市 | 日期确认、可控搜索、取消 / 迟到结果 |
| `/demos/travel` | 家庭出行 | 全部首批物料、业务函数、试算、资格校验与模拟提交 |

`src/app` 只保留首页、布局与薄路由；`src/demos/scenarios.ts` 是首页导航配置。每个场景的 `demo.tsx` 管理页面，`definition.ts` 保存协议定义，`session.ts` 装配 Compiler / Runtime 与本地 Host。`catalog.tsx` 统一装配正式物料，旅行场景的合成政策与初值位于 `travel/policy.ts`。导航配置不导入 Runtime 或组件实现。

Next 配置显式关闭 cacheComponents，避免 Activity 保留已经清理的 Runtime 会话。离开场景时释放会话，重新进入从示例数据开始；同一场景内切换 Profile 仍复用 Runtime。草稿与模拟提交只保留在当前会话，不跨路由持久化。

旧 `/l4` 专用物料 Demo 与首页脚手架输入示例已移除；原 `/materials*` 页面迁入上述场景，不保留第二套入口。SDK 错误边界 / 生命周期继续由 renderer-react 包测试覆盖，正式场景的 UI 回归位于 `tests/e2e`，DevTools 扩展联验使用 `/demos/travel` 与 `/demos/observation`。后者是独立的 36 人压力场景：修改投保人姓名，24 名未成年成员串联两级 Reaction 与异步校验，12 名成人跳过条件分支；可手动返回、拒绝、失败和删除成员。原家庭出行规则不变。

新增 Demo 时先复用现有正式物料与函数：增加场景目录、薄路由与导航项，再补有实际行为价值的集成 / 浏览器检查。缺少物料或函数契约时先讨论该能力，不在 Demo 中另建临时 Adapter 或业务 Store。
