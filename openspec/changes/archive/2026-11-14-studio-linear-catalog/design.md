## 实施
目录只读 API GET /api/platform/catalog/:kind 与 /:kind/:id?version=；kind=materials/functions。要求当前 form:view。未知目录/资产/版本404，未登录401，无查看权限403。
数据由 ReleaseBuild.capture 的已安装制品与 webCatalog 生成，清单与检查、发布、Host 的注册范围相同；预览的模拟制品身份不冒充发布制品身份。
目录文档由 tools/engineering/catalog-docs.mjs 从资产 README 和 Playground Definition 生成到 API 内置数据；按 manifest 版本匹配，无文档或示例明确显示缺失。示例是需要上下文的原始片段，不保证可独立发布，不执行其中 Host 请求。
