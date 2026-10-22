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

export function compile(input: CompileInput): CompileResult {
  const diagnostics = new Diagnostics();
  const fail = (): CompileResult => ({ success: false, diagnostics: diagnostics.list() });
  const received = receive(input, diagnostics);
  if (!received) return fail();
  const { definition, source } = normalize(received.definition, diagnostics);
  const { target = {}, catalog } = received;
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
  const unsupported = (pointer: string, description: string) =>
    diagnostics.error(
      'FEATURE_NOT_IMPLEMENTED',
      source(pointer),
      `${description} is not implemented in the current compiler slice.`,
    );
  for (const key of ['expressions', 'constraints', 'reactions', 'validationMessages'] as const)
    if (definition[key] && Object.keys(definition[key]).length) unsupported(at('', key), key);

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
