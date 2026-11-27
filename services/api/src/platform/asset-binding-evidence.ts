import { createHash } from 'node:crypto';
import { capturePreparedForm } from '@form-engine/protocol/internal/prepared';
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
  const rows = await db.many<{ target: string; prepared_text: string; digest: string }>(
    'SELECT target, prepared_text, digest FROM platform_releases WHERE form_id = $1 AND version_id = $2 ORDER BY release_sequence',
    [formId, versionId],
  );
  const evidence: ReleaseEvidence[] = [];
  const incompleteProfiles = new Set<string>();
  for (const row of rows) {
    let target: { platform?: unknown; profile?: unknown } | null;
    try {
      target = JSON.parse(row.target);
    } catch {
      target = null;
    }
    if (typeof target?.platform !== 'string' || !target.platform)
      return { unobserved: 'pending' as const, profiles: [] };
    if (target.platform !== 'web') continue;
    if (typeof target.profile !== 'string' || !target.profile)
      return { unobserved: 'pending' as const, profiles: [] };
    try {
      const digest = 'sha256:' + createHash('sha256').update(row.prepared_text).digest('hex');
      if (digest !== row.digest) {
        incompleteProfiles.add(target.profile);
        continue;
      }
      const prepared = capturePreparedForm(JSON.parse(row.prepared_text));
      if (
        prepared.build.platform !== target.platform ||
        prepared.build.profile !== target.profile
      ) {
        incompleteProfiles.add(target.profile);
        continue;
      }
      evidence.push(prepared);
    } catch {
      // The SQLite importer intentionally preserves historical release bytes, including opaque payloads.
      incompleteProfiles.add(target.profile);
    }
  }
  return {
    unobserved: 'pending' as const,
    profiles: recoverLegacyAssetBindings(evidence).filter(
      ({ target }) => !incompleteProfiles.has(target.profile!),
    ),
  };
}
