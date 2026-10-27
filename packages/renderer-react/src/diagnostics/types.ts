import type { ScopeBinding } from '@form-engine/runtime';
export interface RendererDiagnostic {
  readonly code: string;
  readonly phase: 'assembly' | 'projection' | 'render' | 'interaction' | 'request';
  readonly formId: string;
  readonly profile: string;
  readonly nodeId?: string;
  readonly occurrence?: string;
  readonly material?: string;
  readonly scope?: ScopeBinding;
  readonly request?: string;
  readonly message: string;
}
