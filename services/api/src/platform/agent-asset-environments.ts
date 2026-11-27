import { createHash } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import type { QueryExecutor } from './database.js';
import { checkEnvironment, previewInputs } from './create-form-agent.js';
import { withTravelPreviewHost } from './web-check.js';
import type { ReleaseBuild } from './release-build.js';
import { canonical, captureAssetBindings, type RevisionBindings } from './version-web-bindings.js';

export async function pinAgentAssetEnvironment(
  db: QueryExecutor,
  builds: ReleaseBuild,
  bindings: RevisionBindings,
) {
  const baseline = checkEnvironment(builds);
  if (!bindings.some(({ selections, pendingUnknown }) => selections.length || pendingUnknown))
    return baseline;
  const json = canonical(bindings);
  const id = createHash('sha256')
    .update(JSON.stringify([baseline, json]))
    .digest('hex');
  await db.execute(
    'INSERT INTO platform_agent_asset_environments(id, baseline, web_asset_bindings) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING',
    [id, baseline, json],
  );
  return id;
}

export async function readAgentAssetEnvironment(
  db: QueryExecutor,
  builds: ReleaseBuild,
  expected?: string,
) {
  const baseline = checkEnvironment(builds);
  if (expected === undefined || expected === baseline)
    return { id: baseline, bindings: [] as RevisionBindings };
  if (typeof expected === 'string' && /^[a-f0-9]{64}$/.test(expected)) {
    const row = await db.one<{ web_asset_bindings: RevisionBindings }>(
      'SELECT web_asset_bindings FROM platform_agent_asset_environments WHERE id=$1 AND baseline=$2',
      [expected, baseline],
    );
    if (row) return { id: expected, bindings: row.web_asset_bindings };
  }
  throw new ServiceUnavailableException('Requested compiler environment unavailable');
}

/** Rebind an interrupted turn's original asset selections to the installed compiler. */
export async function currentAgentAssetEnvironment(
  db: QueryExecutor,
  builds: ReleaseBuild,
  original?: string,
) {
  const baseline = checkEnvironment(builds);
  if (original && original !== baseline && /^[a-f0-9]{64}$/.test(original)) {
    const saved = await db.one<{ baseline: string; web_asset_bindings: RevisionBindings }>(
      'SELECT baseline, web_asset_bindings FROM platform_agent_asset_environments WHERE id=$1',
      [original],
    );
    if (saved) {
      const bindings = saved.web_asset_bindings;
      const id =
        saved.baseline === baseline
          ? original
          : await pinAgentAssetEnvironment(db, builds, bindings);
      return { id, bindings };
    }
  }
  // An unbound turn (including older compiler builds) used deployment defaults.
  return { id: baseline, bindings: [] as RevisionBindings };
}

export function agentCompileInputs(builds: ReleaseBuild, text: string, bindings: RevisionBindings) {
  const input = previewInputs(builds);
  if (!bindings.length) return input;
  const selected = captureAssetBindings(builds.assets, text, input.target.profile, bindings);
  return {
    ...input,
    catalog: withTravelPreviewHost(selected.catalog),
    selections: selected.selections,
  };
}
