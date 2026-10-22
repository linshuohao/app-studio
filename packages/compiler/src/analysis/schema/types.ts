import type { JsonSchema } from '@form-engine/protocol';

/** 一个 $id 资源；external 保留它所属输入资源的检索键，便于交付原资源闭包。 */
export interface SchemaDocument {
  schema: JsonSchema;
  uri: string;
  sourcePointer: string;
  sourceId?: string;
  external?: string;
}
/** document 确定引用基址，pointer 是相对该资源根的位置，而非数据字段路径。 */
export interface SchemaNode {
  schema: JsonSchema;
  document: SchemaDocument;
  pointer: string;
}
/** 无法证明与已知不兼容分别诊断；当前 Binding 使用点都不会据此放行。 */
export interface Connection {
  kind: 'compatible' | 'incompatible' | 'unproven';
  reason: string;
}
