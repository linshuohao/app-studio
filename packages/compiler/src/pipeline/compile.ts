import type { CompileInput, CompileResult } from '../types.js';
import { PREPARED_FORMAT_VERSION } from '../types.js';
import { Diagnostics } from '../diagnostics/collector.js';
import { at } from '../common/pointer.js';
import { own } from '../common/object.js';
import { receive } from '../input/receive.js';
import { normalize } from '../input/normalize.js';
import { createMaterialCatalog } from '../capability/catalog.js';
import { SchemaModel } from '../analysis/schema/model.js';
import { compileView } from '../view/compile.js';
import { assemblePrepared } from '../output/assemble.js';

/**
 * 当前只编译 I01 静态视图：输入检查 → 规范化 → 物料 / Schema 检查 → Prepared 装配。
 * 表达式依赖、watch、规则和模板编译尚未接入；遇到这些语义会明确失败。
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
  // 这是当前批次的拒绝边界，并非已经实现的表达式 / 规则分析器。
  const unsupported = (pointer: string, description: string) =>
    diagnostics.error(
      'FEATURE_NOT_IMPLEMENTED',
      source(pointer),
      `${description} is not implemented in the current compiler slice.`,
    );
  for (const key of ['expressions', 'constraints', 'reactions', 'validationMessages'] as const)
    if (definition[key] && Object.keys(definition[key]).length) unsupported(at('', key), key);

  // Schema 模型供静态 Props 校验和 Binding 类型连接共用，不绑定运行时 Scope。
  const models = new SchemaModel(
    definition.data.schema,
    received.schemaResources ?? {},
    diagnostics,
  );
  const materials = createMaterialCatalog(catalog, target, diagnostics, source);
  const view = compileView(definition.views[profile]!, at('/views', profile), {
    definitionId: definition.id,
    catalogSnapshotId: catalog.id,
    models,
    diagnostics,
    material: materials.material,
    source,
    unsupported,
  });
  if (diagnostics.failed || !view) return fail();
  // 只在所选视图检查通过后组装产物，携带实际引用的资源和能力锁。
  const prepared = assemblePrepared(
    {
      definition,
      profile,
      platform: target.platform,
      catalogSnapshotId: catalog.id,
      view,
      schemas: models.resources(),
      materials: materials.locks(),
    },
    diagnostics,
  );
  return diagnostics.failed ? fail() : { success: true, prepared, diagnostics: diagnostics.list() };
}
