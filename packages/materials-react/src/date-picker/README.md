# date-picker · 日期选择

选择单个公历日期。用 `field` 为控件提供字段标签和校验提示。

- Binding `value` 接受严格的 `YYYY-MM-DD` 公历日期字符串或 `null`；清空写 `null`。
- 日期框点击或键盘激活后打开锚定日历。选中日期即提交，清空操作位于日历浮层。Escape 或点外部关闭浮层，Host 提供的无效值会显示提示。
- `min` / `max` 是包含边界的可选日期，约束可选日期。`disabled`、`readOnly` 阻止编辑，`placeholder` 默认为「选择日期」。
- 显示和提交公历日，不经过浏览器所在时区；显示始终跟随 Runtime 当前值。字段业务校验继续由表单配置负责。
