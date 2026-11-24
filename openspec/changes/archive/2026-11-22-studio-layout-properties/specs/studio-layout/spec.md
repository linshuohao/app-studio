## ADDED Requirements

### Requirement: 原位编辑属性并试看真实布局

Studio SHALL 依照 docs/design/platform-studio.md#studio-layout-visual 在布局检查器编辑常用属性和固定选项，并使用真实 Web Renderer 预览暂存结果。

#### Scenario: 编辑旅险出行方案

- **WHEN** 作者原位修改并调序出行方案选项，同时在右栏修改提示文字
- **THEN** 中间的真实表单读取暂存修改，已有试填选择保持，应用后可以用一次撤销恢复两项属性，并在保存重开后读到已应用配置。

#### Scenario: 放弃仍在检查的修改

- **WHEN** 作者提交属性检查后在回包前确认放弃输入
- **THEN** 检查结果不提交共享草稿。
