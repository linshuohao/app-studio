# textarea · 多行文本

适用于备注、地址补充和情况说明。用 `field` 提供标签与校验提示。

- Binding `value` 为字符串或 `null`。编辑保留换行和空白，清空写空字符串。
- `rows` 默认 3，可配置正整数。支持 `maxLength`、`placeholder`、`disabled`、`readOnly`。
- 沿用 `text-input` 的输入法提交策略，组合输入结束后提交，Host 改值覆盖旧草稿。
