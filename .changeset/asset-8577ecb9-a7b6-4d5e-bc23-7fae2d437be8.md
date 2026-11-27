---
'@form-engine/pure-functions': minor
---

新增报销单内票号归一化计数，可定位全部重复费用行，既有数组计数资产语义不变。

```capability-changes
{
  "schemaVersion": 1,
  "assets": [
    {
      "id": "expense.countInvoiceMatches",
      "kind": "function",
      "bump": "minor"
    }
  ],
  "noRelease": [],
  "noReleasePackages": []
}
```
