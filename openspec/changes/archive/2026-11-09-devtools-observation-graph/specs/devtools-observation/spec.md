## ADDED Requirements

### Requirement: 新观测协议与只读隔离

权威来源：[通用契约](../../../../../docs/design/l3-observability.md#observation-contract)、[技术契约](../../../../../docs/design/l3-observability.md#observation-technical)及 OBS-A01 至 OBS-A17；此处仅为本变更验收，不同步到 openspec/specs。
The system SHALL 精确校验新协议版本，拒绝旧协议且不提供降级；连接自动订阅目录与执行事实，值按需检查，工具失败不改变业务执行。

#### Scenario: 旧协议与生产页面

- **WHEN** 面板连接旧版本生产者，或页面没有开发发现入口
- **THEN** 前者明确 incompatible 并提示升级，不尝试旧 read / subscribe；后者 waiting，不开启生产采集。

#### Scenario: 元数据与值分离

- **WHEN** 选择 Runtime 并持续读取元数据更新
- **THEN** 不持续复制整份 Data / Context，不重算表达式 / 校验；只有显式 inspectValue 返回带真实版本的受限值预览。

#### Scenario: 工具生命周期和故障

- **WHEN** 对比无工具、自动订阅未选择、已选择、工具抛错、断开和缓冲溢出
- **THEN** 相同业务输入保持数据、校验结论、执行顺序及请求资格一致；对应 OBS-A15 / A17。

### Requirement: 稳定身份与跨对象关系

The system SHALL 区分定义、完整绑定实例、排队项和执行身份，保留模板 / 实例及潜在 / 实际关系差异。

#### Scenario: 成员生命周期

- **WHEN** 移动或 set 现有成员对象，再删除插入或 set 整个数组
- **THEN** 前两者保留行身份，后两者的新成员不复用旧身份；历史实体不串项，完整 ScopeBinding 定位跨对象规则；对应 OBS-A02 / A03。

#### Scenario: 根 Schema 与动态目标

- **WHEN** 根 Schema 一次校验产生多个字段 Issue，或声明目标不可解析
- **THEN** 不伪造逐字段执行；未知目标明确 unresolved，潜在关系不充当执行证据；对应 OBS-A10 / A17。

### Requirement: 固定快照与可靠增量

The system SHALL 提供固定版本分页及独立交付游标，缺口显式报告，重复交付幂等。

#### Scenario: 分页、重入和过期

- **WHEN** 分页过程中发生修改、生产者处于内部协调中或快照过期
- **THEN** 页仍属于固定版本，重入只给明确上一一致切点或 busy；过期要求重读，不拼接新旧页，Renderer 滞后明确显示；对应 OBS-A12。

#### Scenario: 回复丢失和事件回收

- **WHEN** 同一游标重试或缓冲超预算回收事件
- **THEN** 重复 EventRef 不重复计数，已丢失窗口通过 gap 标记；S@c 加无缺口增量 (c,d] 对齐 d 状态，当前刷新不能补造历史；对应 OBS-A11。

### Requirement: 连接订阅边界

The system SHALL 让每个连接自动订阅事实，开始不补造过去，断开立即结束交付且不取消业务任务。

#### Scenario: 多面板与在途任务

- **WHEN** 两连接同时订阅，连接前已有 Work，并断开其中一个
- **THEN** 已有工作标注启动记录缺失，断开边界后终态保持未知；另一会话和业务任务继续，不伪造完整路径；对应 OBS-A11 / A15。

### Requirement: Reaction 的真实因果与动作结果

The system SHALL 在实际时点记录合并原因、条件、动作结果和有效 Change，区分实例图循环与多次执行。

#### Scenario: 合流与执行中再入队

- **WHEN** 两操作共同触发一次执行，执行中又使同实例失效
- **THEN** 首次排队保留多根原因且只计一次执行，再入队分配新的排队项 / 执行；对应 OBS-A04 / A07。

#### Scenario: 分支和部分失败

- **WHEN** when=false、when 抛错、前动作成功后动作失败或命令无变化
- **THEN** 分支、诊断、实际 Change 和未执行原因分别可定位；连接前未观测不标为跳过，缺终结不补为成功；对应 OBS-A05 / A06。

### Requirement: 校验共享工作与异步资格

The system SHALL 分别记录 Source、Work、Call，区分返回、资格、发布 / 丢弃和业务结论，不改变现有复用与封存语义。

#### Scenario: 共享工作和 stale 调用

- **WHEN** 多个完整 Call 等待同一 Work，其中一个 stale
- **THEN** Work 不重复启动，origin 不改写，Call 结束解除消费关联且不取消共享任务；对应 OBS-A09。

#### Scenario: 逆序返回与撤销资格

- **WHEN** 输入变化或成员移除后旧请求返回
- **THEN** 撤销、cancel 尝试、返回和丢弃分别表达，旧结果不更新当前 Source，不追加旧 Flush Journal；对应 OBS-A08。

#### Scenario: 异常现场与工具截断

- **WHEN** 轨迹缺失或工具副本截断但业务执行发生技术异常
- **THEN** 原出口仍交付完整现场；工具引用不可取回时如实说明，不用当前输入冒充启动输入；对应 OBS-A16。

### Requirement: 四视图与折叠投影

The system SHALL 从同一 Store 派生四视图，保持同一实体 / 执行选择并保留跨对象实际路径。

#### Scenario: 连锁联动与查看流程

- **WHEN** 修改投保人，多个被保人连锁执行 Reaction / 条件 / 异步校验，并切换关系、执行、状态、诊断
- **THEN** 可按同一引用定位并逐步高亮真实路径；当前状态与历史结果分开，已删除实体明确标识；对应 OBS-A01 / A13。

#### Scenario: 大数组与折叠聚焦

- **WHEN** 数十成员折叠、分页只加载部分成员，选择规则查看直接上下游或完整影响链
- **THEN** 跨容器聚合边保留原始引用，镜像实例去重；未完整覆盖显示下界 / 未知，不能按可见页统计全量；状态高亮不引发全图重排；对应 OBS-A14。
