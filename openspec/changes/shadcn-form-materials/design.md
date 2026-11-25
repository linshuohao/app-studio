# 实施设计

## 权威依据与确认

[基于 Shadcn 的常用表单控件](../../../docs/design/extension-integration.md#first-assets-materials) 维护物料行为和数据值。

## 内部方案与影响

内部日期控件共用 Shadcn Calendar 和 Base UI。单日期使用 Popover，位于原生模态窗口时将浮层放在该窗口内。日期范围在确认面板内展开当前端点的日历，共用其既有草稿与两个写入端口。

Calendar 用 UTC 表示公历日，持久值为日期字符串。Renderer 通过 Adapter 读写 Runtime，格式错误和确认前草稿由物料维护。静态 Manifest 继续从独立入口加载，Studio 和 Playground 分别注册同一套运行实现。

## 变更与恢复

验证切片按日期、选项及文本、Studio 与 Playground 集成顺序组织。以构建、物料测试、隔离制品和浏览器交互结果核对当前基线。
