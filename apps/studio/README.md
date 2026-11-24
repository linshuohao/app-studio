# Studio

首轮为单实例本地工作台。使用支持 `node:sqlite` 的 Node.js，已在 Node 24 环境验证。先按 [API 指南](../../services/api/README.md)构建、初始化并启动 API，然后在仓库根运行 `pnpm --filter @form-engine/studio dev`，打开 `http://127.0.0.1:3200`。

Studio 通过同源 `/api/platform/*` 访问 API。开发或构建时用 `PLATFORM_API_URL` 指定 API 地址，默认 `http://127.0.0.1:3001`。API 的 `PLATFORM_STUDIO_ORIGIN` 必须与浏览器地址的源一致。以生产构建验证本地链路时，依次构建 API 和 Studio，再执行 `pnpm exec playwright test --config apps/studio/playwright.config.ts`。测试独占本地 3001、3200 端口并创建临时数据库。
