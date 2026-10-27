# Form Engine DevTools

独立、只读的开发工具包。业务应用不导入本包、不添加调试组件、不传诊断展示开关。Runtime / Renderer 的开发条件入口自动登记实例；默认生产入口没有注册能力。工具关闭或异常不改变业务写入、校验、Flush、组件身份及请求资格。

## 使用浏览器扩展

1. 在仓库运行 `pnpm --filter @form-engine/devtools build`。
2. 在 Chromium / Chrome / Edge 的扩展管理页开启开发者模式，选择“加载已解压的扩展程序”，目录为本包的 `dist/extension`。
3. 启动应用的开发模式，例如根目录 `pnpm dev`，打开 Playground `/l4` 并点击“打开验证”。
4. 打开浏览器开发者工具，选择 **Form Engine** 面板。先看到实例目录，点击运行实例 / 视图 / 物料才读取当前状态。

这是本地解压扩展，没有发布浏览器商店。当前桥接检查主 frame；iframe 与 Firefox / Safari 扩展适配未验收。面板没有编辑、重新执行或时间旅行入口。

生产构建会显示“等待支持开发观测的页面”。扩展不创建引擎标记，也不能靠页面上的同名标记启用生产采集。安装包提供 `development` 条件的编译产物，工作区使用源码；构建器须正确区分开发与默认条件，不能在生产构建中强制使用 development 条件。

## 模块与状态

```text
src/
  client/client.ts           # 可复用只读客户端，100 条事件缓存，disconnect 清空
  bridge/types.ts            # poll / inspect / disconnect，不含业务指令
  bridge/page-request.ts     # 页面世界自包含桥接，每个面板独立租约
  extension/transport.ts    # inspectedWindow.eval 的连接适配
  extension/panel.ts        # 扩展界面生命周期入口
  ui/mount.ts               # 界面、轮询、选择与释放
  ui/source-list.ts         # 实例树导航，只传元数据
  ui/snapshot-view.ts       # 只读副本呈现与截断提示
  ui/event-list.ts          # 有界轨迹呈现
extension/                  # MV3 manifest、DevTools 入口、面板外壳及样式
```

业务权威状态继续归 Runtime；物料快照来自 Projection 已有缓存，工具读取不额外求值纯函数。Runtime、view、material 使用独立 ID 与 parentId；相同定义可以同时有多个 Runtime，也可以有多份引擎包。销毁父实例注销整个工具子树，React Strict Mode 重连允许重新登记同一关联。

工具连接与查询通过 `@form-engine/runtime/devtools` 的版本 1 观测接口：`list / read / subscribe`。注册接缝只服务生命周期与事实发布，不属于 L1 JSON 协议。Symbol 注册能力供同页引擎副本互通，不提供 Runtime 或业务写入函数。

- `connectDevtools(hook)` 返回 list / inspect / events / dropped / disconnect；不连接时返回 undefined。连接只取目录，inspect 才复制值；断开后旧客户端不能查询。
- `mountDevtools(root, transport)` 返回 destroy；工具自己的计时器每秒查询页面，业务组件不参与。关闭通知丢失时页面连接在 15 秒后过期；最多 8 个页面面板连接。
- 页面连接与独立客户端各自最多保存 100 条事件；引擎通知队列最多 200 条。开发目录另外保存每个视图最近 100 条诊断，按根身份弱关联，模拟重连不丢失初始错误；Renderer 的发布器不保存这份历史。丢弃数量和展示副本的 truncated 均明确呈现。查询副本限深度 16、节点约 5000、字符预算约 100000、每容器 256 项、单字符串 8192 字符；不是完整数据导出或复现格式。
- Runtime 默认轨迹仅执行元数据，物料请求只发布名称 / 调用编号 / pending、success、error、discarded；不广播请求参数 / 结果或整份异常输入。必要异常完整现场继续走 Runtime 原诊断出口，工具展示副本不能替代原报告。
- 当前状态只在明确选择后读取，不持久化到 local storage / 网络。连接前的历史、已截断轨迹不保证完整；事件序号区分顺序，不推断缺失因果关系。

## 验证

`pnpm --filter @form-engine/devtools test` 覆盖晚连接、查询、事件容量、断开、页面协议、自包含桥接、租约、只读 UI 和文本安全；Runtime / Renderer 测试覆盖发现、释放、失败隔离及请求不受工具影响。`pnpm test:e2e:devtools` 使用真实 Chromium MV3 面板验证自动发现、只读状态 / 请求轨迹、断开重连和业务继续填写；常规 `pnpm test:e2e` 另检默认生产页面无发现标记。隔离打包消费者分别验证默认关闭与 development 条件自动发现，不能外推其他浏览器兼容。
