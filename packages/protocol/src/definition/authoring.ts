import type { FormDefinition } from './form.js';
import type { JsonPointer } from './reference.js';
import type { MaterialNode, ScopeNode, TemplateDataParam, TemplateUse } from './view.js';
/** Intended Compiler input for shorthand normalization; this package does not implement normalization. */
export interface AuthoringMaterialNode extends Omit<MaterialNode, 'slots'> {
  bind?: JsonPointer;
  children?: AuthoringViewNode[];
  slots?: Record<string, AuthoringViewNode[]>;
}
export interface AuthoringScopeNode extends Omit<ScopeNode, 'node'> {
  node: AuthoringViewNode;
}
export type AuthoringViewNode = AuthoringMaterialNode | AuthoringScopeNode | TemplateUse;
export interface AuthoringViewTemplate {
  params?: Record<string, TemplateDataParam>;
  node: AuthoringViewNode;
}
/** Conflicting shorthand/canonical fields require a Compiler diagnostic, not silent precedence. */
export interface AuthoringFormDefinition extends Omit<FormDefinition, 'views' | 'viewTemplates'> {
  views: Record<string, AuthoringViewNode>;
  viewTemplates?: Record<string, AuthoringViewTemplate>;
}
