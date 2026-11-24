## ADDED Requirements

### Requirement: 原文草稿的数据模型编辑

Studio SHALL 在现有工作版本中局部编辑数据模型并复用 JSON 撤销与保存链路。

#### Scenario: 编辑模型后保存并重开

- **WHEN** 作者修改 Schema 内单个值，切换 JSON，撤销或保存并重新打开
- **THEN** 未触及的数字、转义、重复键和其他模块原文 token 得以保留。

#### Scenario: 结构和规则定位

- **WHEN** 作者编辑数组子字段、共享定义或字段所属对象的条件
- **THEN** 写入正确声明位置，删除字段与必填同步，动态引用和歧义保留原文定位。
