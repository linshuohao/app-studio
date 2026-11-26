import { createHash } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import type { QueryExecutor } from './database.js';
import { checkEnvironment } from './create-form-agent.js';
import type { ReleaseBuild } from './release-build.js';
import type { RevisionBindings } from './version-web-bindings.js';

export async function pinAgentAssetEnvironment(
  db: QueryExecutor,
  builds: ReleaseBuild,
  bindings: RevisionBindings,
) {
  const baseline = checkEnvironment(builds);
  if (!bindings.some(({ selections, pendingUnknown }) => selections.length || pendingUnknown))
    return baseline;
  const json = JSON.stringify(bindings);
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
