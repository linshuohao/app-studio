import type { CompileInput, CompileResult } from '@form-engine/compiler';
import type { QueryExecutor } from './database.js';

type Prepared = Extract<CompileResult, { success: true }>['prepared'];
type Lock = Prepared['capabilityLock'];
type Kind = keyof Lock;
type Binding = Lock[Kind][string];
type ReleaseEvidence = Pick<Prepared, 'build' | 'capabilityLock'>;
const kinds = ['materials', 'pureFunctions'] as const;

export function recoverLegacyAssetBindings(releases: readonly ReleaseEvidence[]) {
  const byProfile = new Map<string, Record<Kind, Map<string, Map<string, Binding>>>>();
  for (const { build, capabilityLock } of releases) {
    if (build.platform !== 'web') continue;
    const profile = byProfile.get(build.profile) ?? {
      materials: new Map(),
      pureFunctions: new Map(),
    };
    for (const kind of kinds) {
      for (const [id, lock] of Object.entries(capabilityLock[kind])) {
        if (lock.id !== id || lock.artifact.platform !== 'web') continue;
        const candidates = profile[kind].get(id) ?? new Map<string, Binding>();
        const identity = JSON.stringify([
          lock.version,
          lock.manifestDigest,
          lock.artifact.id,
          lock.artifact.digest,
        ]);
        candidates.set(identity, lock);
        profile[kind].set(id, candidates);
      }
    }
    byProfile.set(build.profile, profile);
  }
  return [...byProfile].map(([profile, assets]) => ({
    target: { platform: 'web', profile } satisfies NonNullable<CompileInput['target']>,
    dependencies: kinds.flatMap((kind) =>
      [...assets[kind]].map(([id, identities]) => {
        const candidates = [...identities.values()];
        return candidates.length === 1
          ? { kind, id, status: 'recoverable' as const, lock: candidates[0]! }
          : { kind, id, status: 'pending' as const, candidates };
      }),
    ),
  }));
}

export async function legacyAssetBindingEvidence(
  db: QueryExecutor,
  formId: string,
  versionId: string,
) {
  const rows = await db.many<{ prepared_text: string }>(
    'SELECT prepared_text FROM platform_releases WHERE form_id = $1 AND version_id = $2 ORDER BY release_sequence',
    [formId, versionId],
  );
  return {
    unobserved: 'pending' as const,
    profiles: recoverLegacyAssetBindings(
      rows.map(({ prepared_text }) => JSON.parse(prepared_text) as ReleaseEvidence),
    ),
  };
}
