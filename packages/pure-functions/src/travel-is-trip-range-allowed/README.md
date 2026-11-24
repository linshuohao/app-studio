# travel.isTripRangeAllowed

有序参数：start: JSON、end: JSON、maxDays: positive safe integer。输出：boolean。

有效天数处于 1–maxDays 时 true；普通非法日期 false。maxDays 配置错误抛求值异常。

`invoke(args)` 为同步纯计算，无网络、Runtime 修改或 Promise；普通非法工作值按上述 false / null 退化，配置错误、错误参数个数或溢出抛求值错误。Missing 由 Definition 的 core.exists / core.if 显式处理。输入不修改，制品身份由对应 create 工厂的 Host 参数提供。

示例：`["2028-02-28", "2028-03-01", 30] → true`。

政策结构、费率与注册方式见[包说明](../../README.md)；Manifest 是机器契约唯一源，测试位于 tests/travel-is-trip-range-allowed/。
