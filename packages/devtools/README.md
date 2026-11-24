# Form Engine DevTools

独立、只读的开发工具包。业务应用不导入本包、不添加调试组件、不传诊断展示开关。Runtime / Renderer 的开发条件入口自动登记实例；默认生产入口没有注册能力。工具关闭或异常不改变业务写入、校验、Flush、组件身份及请求资格。

## 使用浏览器扩展

1. 在仓库运行 `pnpm --filter @form-engine/devtools build`。
2. 在 Chromium / Chrome / Edge 的扩展管理页开启开发者模式，选择“加载已解压的扩展程序”，目录为本包的 `dist/extension`。
3. 启动应用的开发模式，例如根目录 `pnpm dev`，打开 Playground `/demos/travel` 并点击“打开完整表单”。
4. 打开浏览器开发者工具，选择 **Form Engine** 面板。连接后自动接收各运行实例 / 视图 / 物料的执行事实，无需开启录制。选择对象读取元数据，在关系、执行、状态、诊断之间切换；业务值需要点击“检查值”。

这是本地解压扩展，没有发布浏览器商店。当前桥接检查主 frame；iframe 与 Firefox / Safari 扩展适配未验收。面板没有编辑、重新执行或时间旅行入口。

生产构建会显示“等待支持开发观测的页面”。扩展不创建引擎标记，也不能靠页面上的同名标记启用生产采集。安装包提供 `development` 条件的编译产物，工作区使用源码；构建器须正确区分开发与默认条件，不能在生产构建中强制使用 development 条件。

## 模块与状态

```text
src/
  client/observation-client.ts  # 新版请求信封、只读传输与回复验证
  client/observation-reply.ts   # DTO 判别与身份校验
  client/observation-store.ts   # 有界元数据 / 事实副本、关系和执行图投影
  bridge/observation-request.ts # 页面世界自包含的版本化只读桥接
  bridge/observation-subscribe.ts # 页面世界订阅、有界队列与 ACK
  extension/content.ts         # 页面消息与面板 Port 桥接
  extension/transport.ts       # 单次查询 eval + tabs.connect 推送通道
  extension/panel.ts           # 扩展生命周期入口
  ui/mount.ts                  # 四视图、自动接收 / 按需查询、分页与释放
extension/                     # MV3 manifest 与面板外壳
```

业务权威状态继续归 Runtime；Renderer 查询来自当前目录与 Projection 缓存，不额外求值。Runtime / view / material 使用生产者命名空间和 epoch，父级退出释放后代会话；Strict Mode 重挂获得新身份，旧请求迟到事实不能进入新代次。

页面 Hook 使用版本 2 的 `request` / `subscribe`。旧 list / read / 旧版 subscribe 与 startCapture / stopCapture 均不兼容。`createObservationClient(transport, token)` 提供 prepare / send / query / subscribe；请求结果和推送 DTO 都在进入 Store 前校验。查询游标保留显式恢复能力，不用于定时拉取。

`mountDevtools(root, transport)` 返回 destroy。真实连接即开始所有生产者的有界事实采集，不需要选择对象；工具先打开时等待 Hook-ready 事件，新注册 / 销毁生产者主动推送目录。Chrome 主 frame 通过静态 content script 与面板 Port 通信；桥仅在面板连接时订阅。页面导航重建连接，断开释放且清空工具副本。HTTP / HTTPS 的 content script 声明用于通信桥，不增加业务执行能力；iframe、其他浏览器和后台页适配未验收。

- 业务同步路径只固定最小 DTO；监听回调在独立任务批量交付。传输一批在途，ACK 前缓存最多 2,000 条 / 2 MB，超限明确 dropped；无 ACK 10 秒释放迟到注入等孤儿订阅。没有定时 discover / readUpdates / 快照查询。
- 选中对象后读取固定元数据快照；对应执行事实及目录变动合并触发刷新。完整 metadata delta / 墓碑仍待交付，当前状态采用标注版本的固定快照重取，历史不由当前值补造。快照 / 查询租约分别 15 / 30 秒；空闲连接订阅不依赖查询租约，值与现场查询过期后最多重开并重试一次，仍核对原输入版本。
- 每 Gateway 最多 8 个连接、每连接事件窗口最多 2,000 条 / 2 MB；查询每生产者最多 8 会话、快照最多 8 MB、每页最多 200 行。工具全生产者历史及去重命名空间都有界；超出保留窗口的身份不保证永久重放去重。这些是实现保护值，不是最终性能门槛。
- 事件接收与视图刷新解耦；header、导航及下拉框保持 DOM 身份，聚焦期间延后目录选项更新，四视图按依赖差异更新。视觉延续已确认 demo：浅灰背景、紫色选择态、侧栏导航、点阵图与详情卡片，窄面板改为纵向布局。
- 关系图支持对象 / 数组折叠、跨容器聚合边及原始引用 / 去重成员集合、直接上下游和有向完整链；Data、Context、字段校验状态分开。执行图只消费真实事实，缺失来源保留占位，Call 关联与 Work 顺序边区分。图按 120 节点分页，跨页连线明确未绘制；状态按 200 行分页。潜在 / 实际影响模式、完整泳道与统计仍待补齐。
- 四视图保留实体选择，具体事件需显式选择；状态或诊断可定位执行 / 关系，刷新当前状态不补造历史。诊断现场查询只报告原 Runtime 诊断引用的当前可用性，不复制整份输入或宣称 Host 已持久化；Trace 已淘汰、未采集或定位预算不足如实反馈。
- 默认事件不广播命令值、诊断 message、请求参数 / 结果或完整异常输入。必要异常现场继续走原 Host 出口；工具断开、过期、预算与查询失败不改变业务。工具不持久化到 local storage / 网络。

## 验证

`pnpm --filter @form-engine/devtools test` 覆盖晚连接、查询、事件容量、断开、页面协议、自包含桥接、租约、只读 UI 和文本安全；Runtime / Renderer 测试覆盖发现、释放、失败隔离及请求不受工具影响。`pnpm test:e2e:devtools` 使用真实 Chromium MV3 面板验证自动发现、只读状态 / 请求轨迹、断开重连和业务继续填写；常规 `pnpm test:e2e` 另检默认生产页面无发现标记。隔离打包消费者分别验证默认关闭与 development 条件自动发现，不能外推其他浏览器兼容。


成本测量：先构建 packages，再运行 `node tools/engineering/measure-observation.mjs 50 10`。输出未连接 / 自动订阅未选中 / 自动订阅并读取当前元数据的每轮时长、消息字节、事实数量与缺失、采样堆内存；不包含扩展布局，也不把采样值称为真实内存峰值。详细实施证据与剩余项见 `openspec/changes/devtools-observation-graph/`。
