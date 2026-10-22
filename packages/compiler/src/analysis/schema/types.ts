import type { JsonSchema } from '@form-engine/protocol';

export interface SchemaDocument {
  schema: JsonSchema;
  uri: string;
  sourcePointer: string;
  sourceId?: string;
  external?: string;
}
export interface SchemaNode {
  schema: JsonSchema;
  document: SchemaDocument;
  pointer: string;
}
export interface Connection {
  kind: 'compatible' | 'incompatible' | 'unproven';
  reason: string;
}
