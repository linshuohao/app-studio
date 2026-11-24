# travel.personPremium

有序参数：age: JSON、plan: JSON、days: JSON、ratePolicy: RatePolicy。输出：integer minor amount | null。

basic / plus，年龄、天数均可试算才返回 CNY 整数分。普通非法输入 null；不校验姓名、证件或外部资格。零日费率合法；金额溢出抛异常。

`invoke(args)` 为同步纯计算，无网络、Runtime 修改或 Promise；普通非法工作值按上述 false / null 退化，配置错误、错误参数个数或溢出抛求值错误。Missing 由 Definition 的 core.exists / core.if 显式处理。输入不修改，制品身份由对应 create 工厂的 Host 参数提供。

示例：`[30, "basic", 2, ratePolicy] → 200（使用包 README 合成政策）`。

政策结构、费率与注册方式见[包说明](../../README.md)；Manifest 是机器契约唯一源，测试位于 tests/travel-person-premium/。
