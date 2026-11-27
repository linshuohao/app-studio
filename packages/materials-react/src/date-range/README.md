# date-range

确认型日期范围输入。`createDateRange(artifact)` 使用 Host 提供的不可变制品身份。

- Props：`label: string` 必填；`startLabel` / `endLabel` 可选，默认“开始日期” / “结束日期”；`disabled` 默认 false。
- 可选 `startMin` / `startMax` 为公历日期字符串，包含边界。点击任一日期框或使用键盘激活，打开锚定在该日期框上的日历浮层。日历展开时，确认弹窗保持原有尺寸。清空操作位于对应日历浮层。日历按起始边界禁用开始端超界日期，确认时再次检查范围。只约束开始日期，业务约束仍应配置在表单校验中。
- Bindings：`start`、`end`，各为 `string | null`。没有 Events、Requests 或 Slots。
- 草稿只在本地；打开日历时，Escape 先关闭日历并返回日期框。取消区间编辑时不写入。确认接受严格 `YYYY-MM-DD` 公历日期（0001–9999 年），清空转 null；Host 提供的非法日期字符串保留并展示提示，不伪造业务 Issue。允许起止倒置，交给业务 Constraint 判断。
- 编辑期间任一已呈现绑定值被外部更改，整体重读两端草稿并提示重新确认。关闭 / 卸载丢弃草稿；重新打开读取当前 Runtime。
- 确认为两个紧邻、非原子 `set`。检查 `kind` 与 `result.ok`；第一端失败不写第二端，第二端失败保留第一端更新并展示部分成功提示，重读实际值。取消不会回滚已成功的写入。
- 已发布的两端 Validation 状态和 Issues 直接展示；物料不执行完整校验、不计算天数、不发起请求。

```ts
const view = {
  material: 'date-range',
  props: { label: '出行日期' },
  bindings: {
    start: { source: 'data', path: '/travel/startDate' },
    end: { source: 'data', path: '/travel/endDate' },
  },
};
```

行为测试位于 `tests/date-range/`；真实键盘、焦点与部分写入见仓库浏览器交互验收。
