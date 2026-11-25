# Studio 的 Next.js 落点

- 根布局在 `apps/studio/src/app/layout.tsx`，承担 document、现有 metadata、共享样式和页面 children。需要浏览器事件、状态或 DOM 时，将交互放入对应的 Client Component。修改布局前核对工作台、Host 和帮助页是否共用它。
- 读取浏览器状态的首屏先给稳定的服务端快照，交由客户端订阅后更新。处理在线／离线等外部状态时，连同事件取消监听、焦点及水合失败场景检查。
- 当前 Next 约定可见 `apps/studio/AGENTS.md`。需要查本项目版本的框架行为时核对已安装的 Next 文档。若提示只供根布局使用，维持应用私有模块，复用 Studio Token。
- 独立试验用 `STUDIO_DIST_DIR` 和独立端口。验收至少覆盖实际路由的 HTML 标题与语言、变更后的用户行为，以及控制台是否报水合错误。确认试验构建未遗留 tsconfig 的临时类型路径。
