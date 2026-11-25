import type { CompileInput, CompileResult } from '../types.js';
import { PREPARED_FORMAT_VERSION } from '../types.js';
import { Diagnostics } from '../diagnostics/collector.js';
import { at } from '../common/pointer.js';
import { own } from '../common/object.js';
import { receive } from '../input/receive.js';
import { normalize } from '../input/normalize.js';
import { createCapabilityCatalog } from '../capability/catalog.js';
import { SchemaModel } from '../analysis/schema/model.js';
import { ReferenceAnalyzer, rootEnvironment } from '../analysis/reference/environment.js';
import { ExpressionAnalyzer } from '../analysis/expression/analyze.js';
import { ValueCompiler } from '../analysis/value/compile.js';
import { compileRules } from '../rules/compile.js';
import { checkMessages } from '../rules/messages.js';
import { compileView } from '../view/compile.js';
import { TemplateCompiler } from '../view/templates.js';
import { InteractionCompiler } from '../view/interactions.js';
import { assemblePrepared } from '../output/assemble.js';
import { executableDataSchema } from './data-schema.js';

/**
 * 输入检查 → 规范化 → 共享引用 / 表达式分析 → 规则与视图准备 → Prepared 装配。
 * 规则和动态 Props 共用分析事实；订阅、求值和真实 Scope 身份留在运行端。
 * 任一阶段有错误都不交付 Prepared，避免运行端消费缺少语义的半成品。
 */
export function compile(input: CompileInput): CompileResult {
  const diagnostics = new Diagnostics();
  const fail = (): CompileResult => ({ success: false, diagnostics: diagnostics.list() });
  // 先得到独立 JSON 快照，再规范化；后续阶段不会修改调用者的对象。
  const received = receive(input, diagnostics);
  if (!received) return fail();
  const { definition, source } = normalize(received.definition, diagnostics);
  const { target = {}, catalog } = received;
  // 单视图开箱即用；存在多个视图时才要求明确选择。platform 始终可省略。
  const profiles = Object.keys(definition.views);
  const profile = target.profile ?? (profiles.length === 1 ? profiles[0] : undefined);
  if (profile === undefined)
    diagnostics.error(
      'PROFILE_AMBIGUOUS',
      '/views',
      'Select a profile when the definition does not have exactly one view.',
    );
  else if (!own(definition.views, profile))
    diagnostics.error('PROFILE_NOT_FOUND', '/views', `Unknown view profile ${profile}.`);
  if (
    target.preparedFormatVersion !== undefined &&
    target.preparedFormatVersion !== PREPARED_FORMAT_VERSION
  )
    diagnostics.error(
      'PREPARED_FORMAT_UNSUPPORTED',
      '',
      `Only ${PREPARED_FORMAT_VERSION} is supported.`,
    );
  if (diagnostics.failed || profile === undefined) return fail();
  // Schema 模型供静态 Props 校验和 Binding 类型连接共用，不绑定运行时 Scope。
  const models = new SchemaModel(
    definition.data.schema,
    received.schemaResources ?? {},
    diagnostics,
  );
  const capabilities = createCapabilityCatalog(catalog, target, diagnostics, source);
  const references = new ReferenceAnalyzer(models, diagnostics, source);
  const expressions = new ExpressionAnalyzer(
    references,
    definition.expressions ?? {},
    capabilities,
    diagnostics,
    source,
  );
  const values = new ValueCompiler(expressions);
  expressions.checkDeclarations();
  const interactions = new InteractionCompiler(values, catalog.host);
  const rules = compileRules(definition, values, catalog.host, (intent, env, pointer) =>
    interactions.emit(intent, env, pointer),
  );
  checkMessages(definition.validationMessages ?? [], expressions);
  const context = {
    definitionId: definition.id,
    catalogSnapshotId: catalog.id,
    models,
    diagnostics,
    material: capabilities.material,
    values,
    source,
    interactions,
  };
  const templates: TemplateCompiler = new TemplateCompiler(
    definition.viewTemplates ?? {},
    expressions,
    (node, pointer, env) => compileView(node, pointer, { ...context, env, templates }),
  );
  const view = compileView(definition.views[profile]!, at('/views', profile), {
    ...context,
    templates,
    env: rootEnvironment(),
  });
  if (diagnostics.failed || !view) return fail();
  // 只在所选视图检查通过后组装产物，携带实际引用的资源和能力锁。
  const schemas = models.resources();
  if (!executableDataSchema(definition.data.schema, schemas, diagnostics)) return fail();
  const prepared = assemblePrepared(
    {
      definition,
      profile,
      platform: target.platform,
      catalogSnapshotId: catalog.id,
      view,
      schemas,
      capabilityLock: capabilities.locks(),
      constraints: rules.constraints,
      reactions: rules.reactions,
      validators: rules.validators,
      templates: templates.result(),
      interactions: interactions.result(),
    },
    diagnostics,
  );
  return diagnostics.failed ? fail() : { success: true, prepared, diagnostics: diagnostics.list() };
}
