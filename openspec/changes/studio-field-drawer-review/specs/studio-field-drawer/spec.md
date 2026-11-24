## ADDED Requirements

### Requirement: 同一工作版本提供新旧字段抽屉

Studio SHALL 从字段大纲提供独立的新旧抽屉入口，并在新版中按已确认分组配置模型。正式设计见 `docs/design/platform-studio.md#studio-schema-drawer-review`。

#### Scenario: 一次应用并撤销多个属性

- **WHEN** 作者在新版抽屉内修改标题、类型、长度、必填和高级标记后应用
- **THEN** 工作台呈现一次可撤销的更新，未触及原文保持完整

#### Scenario: 编辑所属对象的规则和子模型

- **WHEN** 作者从字段进入所属对象、配置条件分支、依赖和组合子字段后应用
- **THEN** 规则写入所属对象，作者返回原字段

#### Scenario: 切换引用并检查覆盖

- **WHEN** 作者打开引用字段并切换共享定义
- **THEN** 已有本地约束保留且可展开查看
