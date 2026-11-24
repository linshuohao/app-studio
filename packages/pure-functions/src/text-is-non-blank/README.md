# text.isNonBlank

同步判断字符串是否包含 ECMAScript String.prototype.trim 空白集合以外的内容。
不转换类型、不改写原值，不读取环境或执行 I/O。

| 输入 | 返回 |
| --- | --- |
| `"Alice"`、`"  张三  "`、`"0"` | true |
| 空串、空格、换行、不换行空格、全角空格 | false |
| null、数字、boolean、数组、对象 | false |
| 零宽空格 U+200B | true，不属于所选 trim 空白集合 |

Manifest 参数 schema:true，返回 boolean。Missing 不属于 JSON，表达式调用方须
使用 core.exists / core.if 明确处理。直接 invoke 缺参数或多参数抛错。

通过 createTextIsNonBlank(artifact) 显式注册；artifact 必须来自确定构建并匹配
Compiler 能力锁。createCoreFunctions 不自动加载本函数，既有 core 身份不变。
