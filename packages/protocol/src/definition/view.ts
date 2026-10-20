import type { Command } from './command.js';
import type { ValueSpec } from './expression.js';
import type { DataReference, ScopeBinder } from './reference.js';
export interface CommandIntent {
  type: 'form.command';
  command: Command;
}
export interface HostEventIntent {
  type: 'host.emit';
  event: string;
  payload?: ValueSpec;
}
export type InteractionIntent = CommandIntent | HostEventIntent;
export interface MaterialNode {
  material: string;
  props?: Record<string, ValueSpec>;
  /** Names and expected data types are declared by the material. No read/write permissions. */
  bindings?: Record<string, DataReference>;
  slots?: Record<string, ViewNode[]>;
  on?: Record<string, InteractionIntent>;
}
export interface ScopeNode {
  scope: ScopeBinder;
  node: ViewNode;
}
export interface TemplateUse {
  $use: string;
  with?: Record<string, DataReference>;
}
export type ViewNode = MaterialNode | ScopeNode | TemplateUse;
export interface TemplateDataParam {
  schemaRef: string;
}
export interface ViewTemplate {
  params?: Record<string, TemplateDataParam>;
  node: ViewNode;
}
