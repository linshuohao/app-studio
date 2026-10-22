// 按子 Schema 的存放形状遍历；能扫描资源不等于 connection 能证明该关键字的兼容性。
// default / examples 等携带普通数据的字段不在这里，避免把数据误当 Schema。
export const mapKeywords = [
  'properties',
  'patternProperties',
  '$defs',
  'definitions',
  'dependentSchemas',
];
export const arrayKeywords = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];
export const singleKeywords = [
  'items',
  'additionalProperties',
  'unevaluatedProperties',
  'unevaluatedItems',
  'contains',
  'not',
  'if',
  'then',
  'else',
  'propertyNames',
  'contentSchema',
];
