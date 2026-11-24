## 权威依据与确认

采用已评审的 ActionEditor 单列交互与现有 ReactionAction 类型。对应正文为 docs/design/platform-studio.md#studio-action-editor。

## 内部方案与影响

ActionEditor 暂存原文，按语义节点替换已编辑片段。批量子动作共享根草稿，保留命令次序与重复项。旧复合 ValueSpec 在其包含动态子项时逐项呈现表达式。页面维护导航保护、撤销和编译检查，并用编辑实例与版本身份拦截过期的异步返回。正式手册直接导入生产组件。
