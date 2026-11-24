# CreateForm PRD 难度顺序

按生成正确表单所需处理的规则排序。先看字段及显示与存值，再看本地联动、外部数据依赖、多人一致性、异步结果失效和最终提交。难度用 1–10 表示，同分可并列。序号是建议试测顺序，文件夹编号仅用于定位。完整与缺材料两条路径最终需要生成同一份业务配置，因此并排展示。

| 顺序 | 难度 | Demo | 联动 | Host | PRD 与验收材料 | 评测者补充或首轮预期 |
|---|---|---|---|---|---|---|
| 1 | 1/10 | 字段校验 | 无 | 无 | [完整 PRD](paired/01/complete.md) · [缺材料 PRD](paired/01/needs-material.md) · [参考配置](paired/01/expected.form.json) | 长度 1 至 40 个字符，包含边界。 |
| 2 | 1/10 | 枚举存值 | 无 | 无 | [完整 PRD](paired/02/complete.md) · [缺材料 PRD](paired/02/needs-material.md) · [参考配置](paired/02/expected.form.json) | 中国保存 CN，日本保存 JP。 |
| 3 | 2/10 | 意向登记 | 无 | 无 | [01 意向登记](01-registration/prd.md) · [预期](01-registration/expected.md) | 候选 |
| 4 | 2/10 | 门店旅险咨询回访登记 | 无 | 无 | [完整 PRD](production/01-callback/complete.md) · [缺材料 PRD](production/01-callback/needs-material.md) · [参考表单 JSON](production/01-callback/expected.form.json) | 上午交付 morning，下午交付 afternoon。 |
| 5 | 3/10 | 条件显示 | 有 | 无 | [完整 PRD](paired/03/complete.md) · [缺材料 PRD](paired/03/needs-material.md) · [参考配置](paired/03/expected.form.json) | 选定国家后才显示城市备注。 |
| 6 | 3/10 | 切换清空 | 有 | 无 | [完整 PRD](paired/04/complete.md) · [缺材料 PRD](paired/04/needs-material.md) · [参考配置](paired/04/expected.form.json) | 清空原备注，将 cityNote 置为 null。 |
| 7 | 3/10 | 旅客联系偏好登记 | 有 | 无 | [完整 PRD](production/02-contact/complete.md) · [缺材料 PRD](production/02-contact/needs-material.md) | 切换渠道立即清空原渠道的联系方式，切回也要重新填写。 |
| 8 | 3/10 | 同行人数 | 有 | 无 | [02 同行人数](02-family-count/prd.md) · [预期](02-family-count/expected.md) | 候选 |
| 9 | 4/10 | 门店回访任务派单 | 无 | 有 | [完整 PRD](production/03-assignment/complete.md) · [缺材料 PRD](production/03-assignment/needs-material.md) | 交班数据只存 assigneeId，取目录返回的员工编号；工号和姓名仅供展示。 |
| 10 | 5/10 | 远程搜索 | 有 | 有 | [完整 PRD](paired/05/complete.md) · [缺材料 PRD](paired/05/needs-material.md) · [参考配置](paired/05/expected.form.json) | city 保存完整选项对象，其中 id 是编码，label 是名称。 |
| 11 | 5/10 | 城市搜索 | 有 | 有 | [03 城市搜索](03-city-lookup/prd.md) · [预期](03-city-lookup/expected.md) | 澄清 |
| 12 | 5/10 | 目的地服务网点预约 | 有 | 有 | [完整 PRD](production/04-appointment/complete.md) · [缺材料 PRD](production/04-appointment/needs-material.md) | 换城市立即清空已选网点，即使新城市目录也返回同一编号，仍须重新选择。 |
| 13 | 5/10 | 运行时依赖 | 有 | 有 | [04 运行时依赖](04-runtime-dependency/prd.md) · [预期](04-runtime-dependency/expected.md) | 本地候选 |
| 14 | 6/10 | 家庭出行人员申报 | 有 | 无 | [完整 PRD](production/05-household/complete.md) · [缺材料 PRD](production/05-household/needs-material.md) | 允许删除或改类已被引用的成人。立即清空所有受影响儿童的 guardianId，逐人提示重选，全部补齐前不能提交。 |
| 15 | 6/10 | 家庭投保资料登记 | 有 | 有 | [完整 PRD](production/07a-roster/complete.md) · [缺材料 PRD](production/07a-roster/needs-material.md) | 整单最多一名配偶。 |
| 16 | 7/10 | 柜台双区身份更正 | 有 | 有 | [完整 PRD](production/07b-identity/complete.md) · [缺材料 PRD](production/07b-identity/needs-material.md) | 清空也要同步，旧值不能自动回填。 |
| 17 | 7/10 | 家庭旅行险报价 | 有 | 有 | [完整 PRD](production/06-quote/complete.md) · [缺材料 PRD](production/06-quote/needs-material.md) | 仅更正姓名也使原报价失效，须手动重新报价后才能确认。 |
| 18 | 8/10 | 家庭投保资格预检 | 有 | 有 | [完整 PRD](production/07c-eligibility/complete.md) · [缺材料 PRD](production/07c-eligibility/needs-material.md) | 2 月 29 日出生的人，在非闰年按 2 月 28 日到达生日。 |
| 19 | 9/10 | 家庭投保渠道名单初核 | 有 | 有 | [完整 PRD](production/07d-screening/complete.md) · [缺材料 PRD](production/07d-screening/needs-material.md) | 超时或缺少任何人的结果时保留资料，允许重试。 |
| 20 | 10/10 | 远行安心·家庭境外旅行险投保单 | 有 | 有 | [完整 PRD](production/07-underwriting/complete.md) · [缺材料 PRD](production/07-underwriting/needs-material.md) | 2 月 29 日出生的人，在非闰年按 2 月 28 日到达生日。 |
| 21 | 10/10 | 家庭境外旅行险（原版回归） | 有 | 有 | [05 家庭境外旅行险](05-family-travel/prd.md) · [预期](05-family-travel/expected.md) | 候选，或精确报告当前确实缺少的本地能力 |

每份输入单独开启新会话，先只发送 PRD；等 Agent 提问后再提供对应补充。验收时核对最终候选 JSON、Compiler 诊断和试填结果。完整投保的原版回归与生产完整版使用相同业务需求，原版另附历史验收记录。
