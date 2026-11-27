import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import {
  validateMaterialManifest,
  validatePureFunctionManifest,
  type CompileInput,
} from '@form-engine/compiler';

type Snapshot = CompileInput['catalog'];
export type WebAssetKind = 'materials' | 'pureFunctions';
type Entry = Snapshot[WebAssetKind][string];
type SelectionPolicy = {
  kind: WebAssetKind;
  id: string;
  version: string;
  artifactDigest: string;
  policy: 'recommend' | 'retain-only';
};
const key = (kind: WebAssetKind, id: string, digest: string) => JSON.stringify([kind, id, digest]);

const kinds = ['materials', 'pureFunctions'] as const;
const artifactDigest = /^sha256:[a-f0-9]{64}$/;

export function readRetainedCatalogs(file: string | undefined): Snapshot[] {
  if (!file) return [];
  const snapshots = JSON.parse(readFileSync(file, 'utf8')) as Snapshot[];
  if (!Array.isArray(snapshots)) throw new Error('Expected an array of retained Web catalogs');
  for (const snapshot of snapshots) {
    if (!snapshot || typeof snapshot.id !== 'string' || !snapshot.id)
      throw new Error('A retained Web catalog must have an identity');
    for (const kind of kinds) {
      const entries = snapshot[kind];
      if (!entries || typeof entries !== 'object' || Array.isArray(entries))
        throw new Error(`Malformed ${kind} in retained Web catalog ${snapshot.id}`);
      const validate =
        kind === 'materials' ? validateMaterialManifest : validatePureFunctionManifest;
      for (const [id, entry] of Object.entries(entries)) {
        if (
          entry?.manifest?.id !== id ||
          typeof entry.manifest.version !== 'string' ||
          !entry.manifest.version ||
          typeof entry.artifact?.id !== 'string' ||
          !entry.artifact.id ||
          entry.artifact.platform !== 'web' ||
          !artifactDigest.test(entry.artifact.digest) ||
          !validate(entry.manifest).valid
        )
          throw new Error(`Invalid retained Web asset ${kind}/${id}`);
      }
    }
  }
  return snapshots;
}

export function readWebAssetPolicies(file: string | undefined): SelectionPolicy[] {
  if (!file) return [];
  const policies = JSON.parse(readFileSync(file, 'utf8')) as SelectionPolicy[];
  if (
    !Array.isArray(policies) ||
    policies.some(
      (entry) =>
        !entry ||
        !kinds.includes(entry.kind) ||
        typeof entry.id !== 'string' ||
        !entry.id ||
        typeof entry.version !== 'string' ||
        !entry.version ||
        !artifactDigest.test(entry.artifactDigest) ||
        (entry.policy !== 'recommend' && entry.policy !== 'retain-only'),
    )
  )
    throw new Error('Invalid Web asset selection policy');
  return policies;
}

/** Ordered deployment registry. The installed build supplies the recommendations. */
export class WebAssetCatalog {
  readonly recommended: Snapshot;
  private readonly retainOnly = new Set<string>();

  constructor(
    readonly installed: Snapshot,
    private readonly retained: readonly Snapshot[],
    policies: readonly SelectionPolicy[] = [],
  ) {
    this.recommended = policies.length
      ? {
          ...installed,
          materials: { ...installed.materials },
          pureFunctions: { ...installed.pureFunctions },
        }
      : installed;
    const manifests = new Map<string, Entry['manifest']>();
    for (const snapshot of [installed, ...retained]) {
      for (const kind of kinds) {
        for (const { manifest } of Object.values(snapshot[kind])) {
          const key = JSON.stringify([kind, manifest.id, manifest.version]);
          const previouslyRegistered = manifests.get(key);
          if (previouslyRegistered && !isDeepStrictEqual(previouslyRegistered, manifest))
            throw new Error(
              `Manifest changed without a new capability version: ${kind}/${manifest.id} @ ${manifest.version}`,
            );
          manifests.set(key, manifest);
        }
      }
    }
    const recommendations = new Set<string>();
    const recorded = new Set<string>();
    for (const { kind, id, version, artifactDigest, policy } of policies) {
      const entry = this.find(kind, id, version, artifactDigest);
      const identity = key(kind, id, artifactDigest);
      if (!entry || recorded.has(identity))
        throw new Error('Unknown or duplicate Web asset policy: ' + id);
      recorded.add(identity);
      if (policy === 'retain-only') this.retainOnly.add(identity);
      else {
        const logical = JSON.stringify([kind, id]);
        if (recommendations.has(logical)) throw new Error('Multiple Web recommendations: ' + id);
        recommendations.add(logical);
        Object.defineProperty(this.recommended[kind], id, {
          value: entry,
          enumerable: true,
          configurable: true,
        });
      }
    }
    if (policies.length) {
      for (const kind of kinds) {
        for (const [id, entry] of Object.entries(this.recommended[kind])) {
          if (!this.selectable(kind, entry)) delete this.recommended[kind][id];
        }
      }
      this.recommended.id =
        'web:' +
        createHash('sha256')
          .update(JSON.stringify([installed.id, policies]))
          .digest('hex');
    }
  }

  isInstalled(kind: WebAssetKind, entry: Entry) {
    const id = entry.manifest.id;
    return Object.hasOwn(this.installed[kind], id) && this.installed[kind][id] === entry;
  }

  selectable(kind: WebAssetKind, entry: Entry) {
    return !this.retainOnly.has(key(kind, entry.manifest.id, entry.artifact.digest));
  }

  entries(kind: WebAssetKind, allVersions = false): Entry[] {
    if (!allVersions) return Object.values(this.recommended[kind]);
    const entries = new Map<string, Entry>();
    for (const snapshot of [this.recommended, this.installed, ...this.retained]) {
      for (const entry of Object.values(snapshot[kind])) {
        const key = JSON.stringify([
          entry.manifest.id,
          entry.manifest.version,
          entry.artifact.id,
          entry.artifact.digest,
        ]);
        if (!entries.has(key)) entries.set(key, entry);
      }
    }
    return [...entries.values()];
  }

  find(kind: WebAssetKind, id: string, version?: string, digest?: string): Entry | undefined {
    const recommended = Object.hasOwn(this.recommended[kind], id)
      ? this.recommended[kind][id]
      : undefined;
    const matches = (entry: Entry) =>
      entry.manifest.id === id &&
      (version === undefined || entry.manifest.version === version) &&
      (digest === undefined || entry.artifact.digest === digest);
    if (recommended && matches(recommended)) return recommended;
    if (version === undefined && digest === undefined) return undefined;
    const candidates = this.entries(kind, true).filter(matches);
    return candidates.length === 1 ? candidates[0] : undefined;
  }
}
