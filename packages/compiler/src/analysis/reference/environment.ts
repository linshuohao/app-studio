import type { DataReference, Reference, ScopeDeclaration } from '@form-engine/protocol/definition';
import type { PreparedScopeDeclaration, PreparedScopeBinder } from '@form-engine/protocol/prepared';
import type { SchemaNode } from '../schema/types.js';
import { SchemaModel } from '../schema/model.js';
import { Diagnostics } from '../../diagnostics/collector.js';
import { at } from '../../common/pointer.js';

export interface ScopeBinding {
  model: SchemaNode;
  /** 编译内比较实例模式的语义路径；不输出、不编号，也不用于绑定真实 Scope ID。 */
  identity: string;
  from?: DataReference;
  collection?: string;
  member: boolean;
}
export interface LexicalEnvironment {
  scopes: ReadonlyMap<string, ScopeBinding>;
  event?: SchemaNode;
  /** Validation reads are on-demand in Reaction conditions / actions only. */
  validation?: boolean;
}
export const rootEnvironment = (): LexicalEnvironment => ({ scopes: new Map() });

/** 只处理静态词法环境；输出仍保留别名，绝不分配 Runtime Scope ID。 */
export class ReferenceAnalyzer {
  constructor(
    readonly models: SchemaModel,
    private readonly diagnostics: Diagnostics,
    private readonly source: (pointer: string) => string,
  ) {}

  /** 比较静态数据位置；one 别名透明，each 成员模式保留，不包含真实成员身份。 */
  identity(reference: DataReference, env: LexicalEnvironment): string {
    const parent = reference.scope === undefined ? '[]' : env.scopes.get(reference.scope)?.identity;
    return JSON.stringify([
      ...(parent ? (JSON.parse(parent) as unknown[]) : ['unknown:' + reference.scope]),
      ...reference.path
        .split('/')
        .slice(1)
        .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~')),
    ]);
  }

  resolve(reference: Reference, env: LexicalEnvironment, pointer: string): SchemaNode | undefined {
    const location = this.source(pointer);
    if (reference.source === 'validation') {
      if (!env.validation) {
        this.diagnostics.error(
          'VALIDATION_NOT_AVAILABLE',
          location,
          'Validation references are available in Reaction conditions and actions only.',
        );
        return undefined;
      }
      if (!this.resolve(reference.field, env, at(pointer, 'field'))) return undefined;
      // The wire reference selects a public projection, never internal runner state.
      // Concrete Issue fields / status values remain the Runtime SDK contract.
      const issues = { type: 'array', items: true } as const;
      const status = { type: 'string' } as const;
      const schema =
        reference.observe === 'issues'
          ? issues
          : reference.observe === 'status'
            ? status
            : {
                type: 'object',
                properties: { issues, status },
                required: ['issues', 'status'],
                additionalProperties: true,
              };
      return this.models.addRoot(
        schema,
        'https://form-engine.invalid/validation/' + reference.observe,
        location,
      );
    }
    if (reference.source === 'context')
      return this.models.addRoot(true, 'https://form-engine.invalid/context/unknown', location);
    if (reference.source === 'event') {
      if (env.event) return this.models.project(env.event, reference.path, location);
      this.diagnostics.error(
        'EVENT_NOT_AVAILABLE',
        location,
        'Event payload is only available in its event/request mapping.',
      );
      return undefined;
    }
    if (reference.scope === undefined) return this.models.dataReference(reference.path, location);
    const binding = env.scopes.get(reference.scope);
    if (binding) return this.models.project(binding.model, reference.path, location);
    this.diagnostics.error('SCOPE_NOT_VISIBLE', location, `No visible Scope ${reference.scope}.`);
    return undefined;
  }

  bind(
    declaration: ScopeDeclaration | undefined,
    parent: LexicalEnvironment,
    pointer: string,
  ): {
    env: LexicalEnvironment;
    scope?: PreparedScopeDeclaration;
  } {
    if (!declaration) return { env: parent };
    const scopes = new Map(parent.scopes);
    const env = { ...parent, scopes };
    const binders = Array.isArray(declaration) ? declaration : [declaration];
    const prepared: PreparedScopeBinder[] = binders.map((binder, index) => {
      const location = Array.isArray(declaration) ? at(pointer, index) : pointer;
      const mode = binder.mode ?? 'one';
      const from = this.resolve(binder.from, env, at(location, 'from'));
      const model =
        from && (mode === 'each' ? this.models.arrayItem(from, this.source(location)) : from);
      if (scopes.has(binder.as))
        this.diagnostics.error(
          'SCOPE_SHADOWING',
          this.source(at(location, 'as')),
          `Scope ${binder.as} is already visible.`,
        );
      else if (model) {
        const collection = this.identity(binder.from, env);
        const identity =
          mode === 'each'
            ? JSON.stringify([...(JSON.parse(collection) as unknown[]), { each: true }])
            : collection;
        scopes.set(binder.as, {
          model,
          identity,
          collection,
          from: binder.from,
          member: mode === 'each',
        });
      }
      return { ...binder, mode };
    });
    return {
      env,
      scope: Array.isArray(declaration)
        ? (prepared as [PreparedScopeBinder, ...PreparedScopeBinder[]])
        : prepared[0]!,
    };
  }
}
