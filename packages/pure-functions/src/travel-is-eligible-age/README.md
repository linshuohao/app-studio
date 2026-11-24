# travel.isEligibleAge

有序参数：age: JSON、agePolicy: AgePolicy。输出：boolean。

年龄为覆盖范围内的安全整数才返回 true。0 可以合法；字符串不转换。

`invoke(args)` 为同步纯计算，无网络、Runtime 修改或 Promise；普通非法工作值按上述 false / null 退化，配置错误、错误参数个数或溢出抛求值错误。Missing 由 Definition 的 core.exists / core.if 显式处理。输入不修改，制品身份由对应 create 工厂的 Host 参数提供。

示例：`[0, {minAge:0,maxAge:80,adultAge:18}] → true`。

政策结构、费率与注册方式见[包说明](../../README.md)；Manifest 是机器契约唯一源，测试位于 tests/travel-is-eligible-age/。
