# radio-group · 单选组

适用于少量互斥选项。用 `field` 提供组标签与校验提示。

- Props `options` 是 `{id, label}` 数组，选项 ID 须唯一。可配置 `disabled`。
- Binding `value` 是一个选项 ID 或 `null`，未选显示为空。用户通过点击或方向键选择后写入 ID。
- Host 的未知选项显示不可用提示，保留原值直到用户重新选择。
