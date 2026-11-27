# array.sumProducts

按顺序传入行数组、左因子属性名和右因子属性名。对每行两个非负安全整数相乘后求和，空数组得到 0。每行都重新计算，不依赖已存小计或当前画面显示的行。

行、属性值非法或乘加超出安全整数区间时返回 null，避免把缺失值当作零或部分统计冒充总额。参数个数错误或属性名为空时抛错。属性名是直接键，不是 JSON Pointer。函数不修改输入。

## 用全量合计校验预算

`core.lte` 的两个参数都必须是数值。在同一个短路 `core.and` 中，先用 `core.ne` 判断合计非 null，再将结构相同的合计表达式传给 `core.lte`。编译器会按这个顺序收窄类型。写在约束 `when` 中的守卫只决定规则是否适用，收窄范围到 `when` 为止。

以下是采购预算约束的 `assert`。约束的 `when` 应在预算缺失或合计为 null 时跳过规则，由字段校验处理缺失值；`issue.target` 指向 `/budgetMinor`。

```json
{
  "op": "core.and",
  "args": [
    {
      "op": "core.ne",
      "args": [
        {
          "op": "array.sumProducts",
          "args": [{ "ref": { "source": "data", "path": "/items" } }, "quantity", "unitPriceMinor"]
        },
        null
      ]
    },
    {
      "op": "core.lte",
      "args": [
        {
          "op": "array.sumProducts",
          "args": [{ "ref": { "source": "data", "path": "/items" } }, "quantity", "unitPriceMinor"]
        },
        { "ref": { "source": "data", "path": "/budgetMinor" } }
      ]
    }
  ]
}
```
