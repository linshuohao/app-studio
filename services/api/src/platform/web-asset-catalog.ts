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

/** Ordered deployment registry. The installed build supplies the recommendations. */
export class WebAssetCatalog {
  constructor(
    readonly recommended: Snapshot,
    private readonly retained: readonly Snapshot[],
  ) {
    const manifests = new Map<string, Entry['manifest']>();
    for (const snapshot of [recommended, ...retained]) {
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
  }

  entries(kind: WebAssetKind, allVersions = false): Entry[] {
    if (!allVersions) return Object.values(this.recommended[kind]);
    const entries = new Map<string, Entry>();
    for (const snapshot of [this.recommended, ...this.retained]) {
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
