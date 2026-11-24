## Why

将已确认的布局原型交互接入 Studio 工作版本。作者需要从同一字段树选择字段，配置容器重复和显示条件，并在移动前看到作用域限制。

## What Changes

复用配置工作台的共享草稿、撤销、检查和保存。交互与验收依据见 docs/design/platform-studio.md#studio-layout-visual。

## Impact

涉及布局编辑器、字段选择器、正式 ViewNode 及 Compiler 检查链。沿用现行数据模型与 Runtime 协议。
