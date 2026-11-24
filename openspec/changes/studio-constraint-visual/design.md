## Approach

复用 Schema 字段树、作用域选择器与纯函数表达式编辑器。可视修改替换所选 JSON 节点。前置候选使用完整草稿的检查接口验证；范围、方式和删除预览使用 Compiler 产出的前置绑定和诊断。Studio 的示例 Host 能力名由预览、创作和示例发布 Host 共同使用。

## Verification

浏览器验证配置入口和共享草稿。Compiler 用例覆盖绑定歧义与环路。Runtime 用例覆盖实例身份、条件和结果归属。
