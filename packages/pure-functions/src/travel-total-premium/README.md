# travel.totalPremium

有序参数：insureds: JSON、plan: JSON、days: JSON、ratePolicy: RatePolicy。输出：integer minor amount | null。

人数为 1–maxInsureds，全部成员的 age 可试算才汇总。先检查全部年龄，非法时 null，与成员顺序无关；无部分金额。复用单人算法，乘法及汇总溢出抛异常。

`invoke(args)` 为同步纯计算，无网络、Runtime 修改或 Promise；普通非法工作值按上述 false / null 退化，配置错误、错误参数个数或溢出抛求值错误。Missing 由 Definition 的 core.exists / core.if 显式处理。输入不修改，制品身份由对应 create 工厂的 Host 参数提供。

示例：`[[{age:30}, {age:12}], "basic", 2, ratePolicy] → 500（使用包 README 合成政策）`。

政策结构、费率与注册方式见[包说明](../../README.md)；Manifest 是机器契约唯一源，测试位于 tests/travel-total-premium/。
