## 1. 自定义校验编辑

- [x] 1.1 规则清单、内部断言与外部义务、范围和归属接入共享草稿。
- [x] 1.2 Compiler 前置候选与变更影响预览。
- [x] 1.3 当轮交付范围的浏览器、Compiler 和 Runtime 验收及独立审查。

## 验收结果

Chrome 使用实际配置 API 和临时 PostgreSQL。自定义校验 3 项和联动 5 项通过，覆盖保存重开、撤销、Compiler 诊断和逐成员 Host 配置。Compiler 30 项和 Runtime 校验 14 项通过。独立审查发现的问题已修复并复核。

`reaction-guard.spec.ts` 已改用现有数组字段选择器。Chrome 事件探针显示旧手势在重复动作行触发 `dragstart`，改为在源行内启动拖动后，同一实现正确排序并支持撤销。真实业务 Host 和人工验收待进行。
