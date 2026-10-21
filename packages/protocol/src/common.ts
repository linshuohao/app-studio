/** 可交换的 JSON 基础值。Missing 不属于 JSON，不能以 undefined / NaN 代替。 */
export type JsonPrimitive = string | number | boolean | null;
/** 原样业务 JSON；其中恰好出现 $expr 等键，也不会自动成为表达式。 */
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
/** 允许任意业务属性名的 JSON 对象，不适用协议节点的未知字段拒绝规则。 */
export interface JsonObject {
  [key: string]: JsonValue;
}
/**
 * 嵌入的 JSON Schema 2020-12。TS 保留 JSON 形态，派生 Schema 引用标准 meta-schema 检查关键字语法。
 * 它既不代表某份业务数据已经合法，也不证明两个 Schema 能静态兼容；后者由 Compiler 判断。
 */
export type JsonSchema = boolean | JsonObject;
/** 展示文案或由 Host 解析的资源键；消息缺失不能吞掉错误，消息覆盖不能改变校验结论。 */
export type MessageSpec = { text: string } | { key: string };
/**
 * 含算法前缀的不可变内容摘要。十六进制长度由生成的 Schema 检查，TS 模板类型只约束前缀。
 * @pattern ^sha256:[a-f0-9]{64}$
 */
export type ContentDigest = `sha256:${string}`;
/** 确定的实现制品身份，可被多个能力共用；下载地址不替代该身份。 */
export interface ArtifactIdentity {
  /** 制品或不可变应用构建的身份，不是 Material / Pure Function 的逻辑 ID。 */
  id: string;
  /** 该实现适用的平台，由装载边界与编译目标核对。 */
  platform: string;
  /** 实际交付制品字节的摘要；不等同于 Manifest 的契约摘要。 */
  digest: ContentDigest;
}
/** Definition 与 Prepared 语义完全相同的数字目的位置；锚点位置仍由各自领域声明。 */
export interface ArrayIndexPosition {
  kind: 'index';
  /**
   * 插入时为执行时数组的 0..length；移动时为移动后的最终下标 0..length-1。
   * Schema 检查非负整数，当前数组的实际边界由 Runtime 在执行时检查，不自动夹取或追加。
   * @minimum 0
   * @asType integer
   */
  index: number;
}
