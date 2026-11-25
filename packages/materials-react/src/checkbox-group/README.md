# checkbox-group · 多选组

适用于少量可同时勾选的选项。用 `field` 提供组标签与校验提示。

- Props `options` 是 `{id, label}` 数组，选项 ID 须唯一。可配置 `disabled`。
- Binding `value` 是去重的选项 ID 数组，取消最后一个选项写 `[]`。
- Host 提供的未知选项显示不可用提示。切换已知选项时保留未知字符串 ID，避免候选项变化导致数据被静默删除。“清空多选”可明确将所有值清为 `[]`。
