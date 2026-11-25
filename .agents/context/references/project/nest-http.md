# Platform 的 NestJS HTTP 边界

- 先核对真实 Controller 方法的 Origin、会话、角色与资源校验顺序，再决定参数转换 / 校验在哪里做。TypeScript 类型标注描述编译期类型，运行期校验仍由现有 Pipe 或业务入口承载。
- 使用现有资源校验和身份传递函数。调整参数 Pipe 或移动校验位置时，验证错误优先级、状态码和可接受格式是否变化。公共行为变更按项目宪章确认。
- 显式 `@Res()` 路由核对由谁写头和正文，分别检查 JSON 与 SSE 分支。若 SSE 已开始，错误沿现有事件协议交给 Studio，不把新的 HTTP 状态推到已经开启的流里。
- 例如 Agent 恢复：从 `agent-conversations.controller.ts` 追到 `agent-ui-stream.ts` 与 Studio 实际调用。至少验证 Origin 或权限拒绝、合法和无效轮次、JSON 与 SSE，以及下游调用前后是否已送出响应。
