# CreateForm PRD 示例

30 组示例按完整 PRD（`complete.md`）的 UTF-8 文件大小从小到大编号，同等大小按目录名称排序。字节数表示输入规模，复杂度单独标注业务规则与 Host 接入的难度。

每组有完整 PRD、有问题的 PRD 和期望生成的 L1 FormDefinition JSON。评测有问题的版本时，先单独发送该 PRD，再根据 Agent 的提问提供对应的完整口径。

JSON 的 `metadata.hostIntegration` 记录初始数据、Context、接入能力和交付转换。涉及目录、异步校验、业务事件或提交的样例，预览和交付依赖对应的 Host 装配。远程选择的工作值是 `{id, label}`，只交付编码的例子由 Host 从已校验快照取值。

| 序号 | 完整 PRD 字节数 | 复杂度 | 场景 | 完整 PRD | 有问题的 PRD | 协议 JSON | 核心验收口径 |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| 01 | 207 | 1/10 | 字段校验 | [完整](01-field-validation/complete.md) | [有问题](01-field-validation/needs-material.md) | [JSON](01-field-validation/expected.form.json) | 姓名必填，长度 1–40 个字符。 |
| 02 | 301 | 1/10 | 枚举存值 | [完整](02-enum-values/complete.md) | [有问题](02-enum-values/needs-material.md) | [JSON](02-enum-values/expected.form.json) | 中国保存 CN，日本保存 JP。 |
| 03 | 383 | 3/10 | 条件显示 | [完整](03-conditional-display/complete.md) | [有问题](03-conditional-display/needs-material.md) | [JSON](03-conditional-display/expected.form.json) | 选定国家后才显示城市备注。 |
| 04 | 437 | 5/10 | 远程城市搜索 · 编码交付 | [完整](04-city-search-code/complete.md) | [有问题](04-city-search-code/needs-material.md) | [JSON](04-city-search-code/expected.form.json) | city 只交付编码，列表和选中结果都显示名称。 |
| 05 | 459 | 3/10 | 切换清空 | [完整](05-clear-on-change/complete.md) | [有问题](05-clear-on-change/needs-material.md) | [JSON](05-clear-on-change/expected.form.json) | 换国家时将 cityNote 置为 null。 |
| 06 | 477 | 2/10 | 旅险意向登记 | [完整](06-registration/complete.md) | [有问题](06-registration/needs-material.md) | [JSON](06-registration/expected.form.json) | 人数 1–20，必须是整数。 |
| 07 | 570 | 4/10 | 旅险同行人数 | [完整](07-family-count/complete.md) | [有问题](07-family-count/needs-material.md) | [JSON](07-family-count/expected.form.json) | 无儿童时清除儿童数，提交省略该字段。 |
| 08 | 709 | 5/10 | 远程城市搜索 · 对象交付 | [完整](08-city-search-object/complete.md) | [有问题](08-city-search-object/needs-material.md) | [JSON](08-city-search-object/expected.form.json) | city 保存包含 id 和 label 的选项对象。 |
| 09 | 844 | 6/10 | 旅行险预登记与渠道核验 | [完整](09-runtime-dependency/complete.md) | [有问题](09-runtime-dependency/needs-material.md) | [JSON](09-runtime-dependency/expected.form.json) | 业务日期后的第 1–90 天均可起保。 |
| 10 | 942 | 3/10 | 旅客联系偏好登记 | [完整](10-contact-preference/complete.md) | [有问题](10-contact-preference/needs-material.md) | [JSON](10-contact-preference/expected.form.json) | 切换渠道立即清除旧联系方式，切回时重新填写。 |
| 11 | 944 | 5/10 | 目的地服务网点预约 | [完整](11-outlet-appointment/complete.md) | [有问题](11-outlet-appointment/needs-material.md) | [JSON](11-outlet-appointment/expected.form.json) | 换城市后即使返回同一网点编号，也要重新选择。 |
| 12 | 1,062 | 4/10 | 门店回访任务派单 | [完整](12-task-assignment/complete.md) | [有问题](12-task-assignment/needs-material.md) | [JSON](12-task-assignment/expected.form.json) | 顾问显示姓名和工号，交付只存员工编号。 |
| 13 | 1,201 | 6/10 | 家庭出行人员申报 | [完整](13-household-roster/complete.md) | [有问题](13-household-roster/needs-material.md) | [JSON](13-household-roster/expected.form.json) | 删除或改类被引用的成人时，清除所有受影响儿童的监护人。 |
| 14 | 1,362 | 8/10 | 家庭旅行险报价 | [完整](14-family-quote/complete.md) | [有问题](14-family-quote/needs-material.md) | [JSON](14-family-quote/expected.form.json) | 仅更正姓名也会使旧报价失效。 |
| 15 | 1,997 | 2/10 | 门店旅险咨询回访登记 | [完整](15-callback/complete.md) | [有问题](15-callback/needs-material.md) | [JSON](15-callback/expected.form.json) | 上午交付 morning，下午交付 afternoon。 |
| 16 | 3,270 | 5/10 | 物业临时进场审批登记 | [完整](16-facility-exception/complete.md) | [有问题](16-facility-exception/needs-material.md) | [JSON](16-facility-exception/expected.form.json) | 普通开放时段为 08:00 至 18:00，开始与结束分别允许正好等于这两个边界。 |
| 17 | 3,399 | 5/10 | 培训设备借用与交还 | [完整](17-equipment-loan/complete.md) | [有问题](17-equipment-loan/needs-material.md) | [JSON](17-equipment-loan/expected.form.json) | 交付方式改回库房自取时，立即清除现场地址、签收联系人和手机号。 |
| 18 | 3,750 | 7/10 | 食品配送批次收货与隔离 | [完整](18-bulk-food-receipt/complete.md) | [有问题](18-bulk-food-receipt/needs-material.md) | [JSON](18-bulk-food-receipt/expected.form.json) | 冷冻批次测温恰好 −18.0 ℃ 视为合格，高于 −18.0 ℃ 须隔离。 |
| 19 | 3,797 | 7/10 | 学校学生资助批次申请 | [完整](19-education-grant/complete.md) | [有问题](19-education-grant/needs-material.md) | [JSON](19-education-grant/expected.form.json) | 类别额度上限为交通 600 元、学习用品 1,000 元、住宿 3,000 元，等于上限可通过。 |
| 20 | 3,936 | 7/10 | 部门采购预算与比价送审 | [完整](20-purchase-request/complete.md) | [有问题](20-purchase-request/needs-material.md) | [JSON](20-purchase-request/expected.form.json) | 一行预计小计达到 500,000 分时须填写比价记录编号，恰好达到门槛也需要。 |
| 21 | 4,169 | 8/10 | 跨城市差旅费用报销 | [完整](21-expense-claim/complete.md) | [有问题](21-expense-claim/needs-material.md) | [JSON](21-expense-claim/expected.form.json) | 住宿标准是每晚 45,000 分，超过标准时允许申请，但必须填写超标准说明。 |
| 22 | 4,550 | 8/10 | 退回商品质检与库存分流 | [完整](22-return-inspection/complete.md) | [有问题](22-return-inspection/needs-material.md) | [JSON](22-return-inspection/expected.form.json) | 同一原交易明细只允许提交一行，不能拆成两行分别受理。 |
| 23 | 4,844 | 7/10 | 家庭投保资料登记 | [完整](23-underwriting-roster/complete.md) | [有问题](23-underwriting-roster/needs-material.md) | [JSON](23-underwriting-roster/expected.form.json) | 整单最多登记一名配偶。 |
| 24 | 5,489 | 7/10 | 柜台双区身份更正 | [完整](24-identity-correction/complete.md) | [有问题](24-identity-correction/needs-material.md) | [JSON](24-identity-correction/expected.form.json) | 清空任一处后另一处同步清空。 |
| 25 | 7,181 | 9/10 | 展会多会场议程与值岗确认 | [完整](25-conference-program/complete.md) | [有问题](25-conference-program/needs-material.md) | [JSON](25-conference-program/expected.form.json) | 同一房间、同一天的两场议程可首尾相接，上一场 10:30 结束且下一场 10:30 开始视为无冲突。 |
| 26 | 7,718 | 10/10 | 多站点库存调拨和额度确认 | [完整](26-inventory-allocation/complete.md) | [有问题](26-inventory-allocation/needs-material.md) | [JSON](26-inventory-allocation/expected.form.json) | 删除仍被调拨行引用的站点时允许删除，必须清空所有受影响行的目标站点，保留物品编号、批次和数量。 |
| 27 | 7,884 | 8/10 | 家庭投保资格预检 | [完整](27-eligibility-precheck/complete.md) | [有问题](27-eligibility-precheck/needs-material.md) | [JSON](27-eligibility-precheck/expected.form.json) | 闰日出生者在非闰年按 2 月 28 日过生日。 |
| 28 | 8,182 | 9/10 | 家庭投保渠道名单初核 | [完整](28-channel-screening/complete.md) | [有问题](28-channel-screening/needs-material.md) | [JSON](28-channel-screening/expected.form.json) | 漏回任一人结果时保留资料并允许重试。 |
| 29 | 8,963 | 10/10 | 家庭境外旅行险投保 | [完整](29-family-underwriting/complete.md) | [有问题](29-family-underwriting/needs-material.md) | [JSON](29-family-underwriting/expected.form.json) | 全员通过且结果仍匹配当前送检快照，才能正式提交。 |
| 30 | 10,807 | 10/10 | 供应商月度对账与部分结算 | [完整](30-supplier-settlement/complete.md) | [有问题](30-supplier-settlement/needs-material.md) | [JSON](30-supplier-settlement/expected.form.json) | 部分结算时，有争议凭证及指向它的冲销行一起留待复核，并从本次净额及入账明细剔除。 |

## 完整投保回归

完整投保样例保留原版全部业务规则。对照协议时优先验证双区编辑与清空、名单增删后按人定位、护照号归一化查重、18 岁和 70 岁分类临界点，以及核保结果过期后禁止提交。原版运行记录可在 Git 中追溯原 `create-form/05-family-travel/expected.md`。
