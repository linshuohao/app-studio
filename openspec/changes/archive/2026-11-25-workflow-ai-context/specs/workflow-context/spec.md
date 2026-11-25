## ADDED Requirements

### Requirement: 集中加载可追溯的生效条款

研发助手 SHALL 根据任务路径和意图从集中索引加载生效条款，并由检查发现过期生成视图。

#### Scenario: Studio 字段选择器

- **WHEN** 预检只涉及字段选择器的焦点或选择行为
- **THEN** 加载共享组件及字段选择器条款，列出 Handbook 与浏览器入口

#### Scenario: 生成视图已过期

- **WHEN** 源条款变化而生成视图仍为旧内容
- **THEN** 同步检查失败并报告对应生成文件

### Requirement: 核对包外制品消费

资产试点 SHALL 对照源登记与隔离安装后的静态 Manifest 导出。

#### Scenario: 遗漏独立资产出口

- **WHEN** 打包制品漏掉已登记的资产出口
- **THEN** 消费检查指出缺少的出口与预期资产 ID
