## Implementation
配置版本使用 nullable version_name 增量迁移；名字与保存快照冻结，非空名字参与请求指纹，空名称保留旧指纹。显示顺序为名称、备注、保存时间；完整标识按需展开与复制。发布记录沿用已授权 name。

Manifest 和执行制品不可变：直接补运行 Manifest 字段并同版本重建会改变 Manifest / artifact digest，使旧 Prepared 无法匹配。因此字段含义存入资产包 catalog-docs.json 的 annotations，JSON Pointer 指向真实 Manifest；生成器检查版本、路径及必须覆盖项，API 按版本匹配附加，Studio 从 Schema 解析类型和约束。此为契约内展示元数据，不更改 Compiler / Runtime 校验规则。

StudioSelect 复用已有 Base UI；列表使用自定义 Popup，原生 dialog 内的 Portal 留在 dialog，避免被 top layer 隔离。运行物料包没有重建。卡片高度按内容自适应，预览最小高度降为 112px，复杂物料自然撑高。

## Review
独立 reviewer 只读复核迁移/幂等/保存快照、Portal 和说明兼容路径；修复默认 concurrency 文案（缺省即 latest），补 Host 请求字段说明覆盖检查。旧发布在真实浏览器成功装载。原库只读备份迁移、原摘要不变。
