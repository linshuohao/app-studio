## ADDED Requirements

### Requirement: 在共享工作草稿编排布局

Studio SHALL 从配置页交付 docs/design/platform-studio.md#studio-layout-visual 的作者操作。

#### Scenario: 复制后修改与重开

- **WHEN** 作者复制布局，在副本内移动容器并保存工作版本
- **THEN** 重开可看到相同的节点、模板引用与非执行显示名，原布局保留原文。

#### Scenario: 带作用域的绑定与插入

- **WHEN** 作者拖入字段或移动包含局部引用的子树
- **THEN** 物料声明约束端口及目标位置，移动保持原词法声明身份，取消及拒绝均保留原稿。
