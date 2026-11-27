import { BadRequestException } from '@nestjs/common';
import { webAssetCompatibility } from '@form-engine/materials-react/web-asset-compatibility';
import { createHash } from 'node:crypto';
import type { CapabilityReference, CompileInput, CompileResult } from '@form-engine/compiler';
import type { QueryExecutor } from './database.js';
import { legacyAssetBindingEvidence } from './asset-binding-evidence.js';
import type { WebAssetCatalog, WebAssetKind } from './web-asset-catalog.js';
import {
  compileWebConfig,
  webTarget,
  withTravelPreviewHost,
  type ConfigCheck,
} from './web-check.js';

type Catalog = CompileInput['catalog'];
type Lock = Extract<
  CompileResult,
  { success: true }
>['prepared']['capabilityLock'][WebAssetKind][string];
type Asset = Catalog[WebAssetKind][string];
type Selection = { kind: WebAssetKind; id: string; lock: Lock | null };
type Profile = { profile: string; selections: Selection[]; pendingUnknown?: true };
export type RevisionBindings = Profile[];
export type AssetChoice = {
  profile: string;
  kind: WebAssetKind;
  id: string;
  version: string;
  artifactDigest: string;
};

const keyOf = ({ kind, id }: Pick<Selection, 'kind' | 'id'>) => JSON.stringify([kind, id]);
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return (
      '{' +
      Object.keys(object)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + canonical(object[key]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value);
}

function assetLock(entry: Asset): Lock {
  return {
    id: entry.manifest.id,
    version: entry.manifest.version,
    manifestDigest: `sha256:${hash(canonical(entry.manifest))}`,
    artifact: entry.artifact,
  };
}

export function assetChoices(value: unknown): AssetChoice[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 512)
    throw new BadRequestException('Invalid Web asset choices');
  const choices: AssetChoice[] = value.map((entry: unknown) => {
    if (entry === null || typeof entry !== 'object')
      throw new BadRequestException('Invalid Web asset choice');
    const { profile, kind, id, version, artifactDigest } = entry as Partial<AssetChoice>;
    if (
      typeof profile !== 'string' ||
      !profile ||
      profile.length > 120 ||
      (kind !== 'materials' && kind !== 'pureFunctions') ||
      typeof id !== 'string' ||
      !id ||
      id.length > 200 ||
      typeof version !== 'string' ||
      !version ||
      version.length > 200 ||
      typeof artifactDigest !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/.test(artifactDigest)
    )
      throw new BadRequestException('Invalid Web asset choice');
    return { profile, kind, id, version, artifactDigest };
  });
  if (
    new Set(choices.map((choice) => JSON.stringify([choice.profile, keyOf(choice)]))).size !==
    choices.length
  )
    throw new BadRequestException('Duplicate Web asset choice');
  return choices;
}

function viewProfiles(text: string): string[] {
  try {
    const views: unknown = JSON.parse(text)?.views;
    return views && typeof views === 'object' && !Array.isArray(views) ? Object.keys(views) : [];
  } catch {
    return [];
  }
}

function resolveChoices(assets: WebAssetCatalog, choices: readonly AssetChoice[]) {
  return choices.map(({ profile, kind, id, version, artifactDigest }) => {
    const entry = assets.find(kind, id, version, artifactDigest);
    if (!entry || !assets.selectable(kind, entry))
      throw new BadRequestException(`Web asset is unavailable: ${id} @ ${version}`);
    return { profile, kind, id, lock: assetLock(entry) };
  });
}

export function deployedAsset(assets: WebAssetCatalog, kind: WebAssetKind, id: string, lock: Lock) {
  const entry = assets.find(kind, id, lock.version, lock.artifact.digest);
  return entry && canonical(assetLock(entry)) === canonical(lock) ? entry : undefined;
}

function resolvedCatalog(assets: WebAssetCatalog, selections: readonly Selection[]) {
  if (!selections.length) return assets.recommended;
  const catalog: Catalog = {
    ...assets.recommended,
    materials: { ...assets.recommended.materials },
    pureFunctions: { ...assets.recommended.pureFunctions },
  };
  for (const { kind, id, lock } of selections) {
    const entry = lock && deployedAsset(assets, kind, id, lock);
    if (!entry) {
      delete catalog[kind][id];
      continue;
    }
    // Each entry is resolved from the matching kind's registry.
    if (kind === 'materials')
      Object.defineProperty(catalog.materials, id, {
        value: entry,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    else
      Object.defineProperty(catalog.pureFunctions, id, {
        value: entry,
        enumerable: true,
        configurable: true,
        writable: true,
      });
  }
  catalog.id =
    'web:' +
    hash(canonical({ materials: catalog.materials, pureFunctions: catalog.pureFunctions }));
  return catalog;
}

function observed(text: string, catalog: Catalog, profile: string) {
  const references = new Map<string, CapabilityReference>();
  const result = compileWebConfig(
    text,
    { catalog, target: { platform: 'web', profile } },
    (reference) => {
      references.set(keyOf(reference), reference);
    },
  );
  return { references, incomplete: !result.success };
}

export async function loadRevisionBindings(
  db: QueryExecutor,
  assets: WebAssetCatalog,
  formId: string,
  versionId: string,
  text: string,
  stored: RevisionBindings | null,
): Promise<RevisionBindings> {
  if (stored !== null) return stored;
  const evidence = await legacyAssetBindingEvidence(db, formId, versionId);
  const profiles = viewProfiles(text);
  if (!profiles.length) return [{ profile: '', selections: [], pendingUnknown: true }];
  return profiles.map((profile) => {
    const publications =
      evidence.profiles.find((item) => item.target.profile === profile)?.dependencies ?? [];
    const unique = new Map(
      publications.map((item) => [keyOf(item), item.status === 'recoverable' ? item.lock : null]),
    );
    const recovered = publications.map(({ kind, id }) => ({
      kind,
      id,
      lock: unique.get(keyOf({ kind, id })) ?? null,
    }));
    const { references, incomplete } = observed(text, assets.recommended, profile);
    for (const item of recovered)
      if (!references.has(keyOf(item)))
        references.set(keyOf(item), { kind: item.kind, id: item.id, sourcePointer: '' });
    return {
      profile,
      ...(incomplete && { pendingUnknown: true as const }),
      selections: [...references].map(([key, { kind, id }]) => ({
        kind,
        id,
        lock: unique.get(key) ?? null,
      })),
    };
  });
}

export function reviseAssetBindings(
  assets: WebAssetCatalog,
  text: string,
  inherited: RevisionBindings,
  choices: readonly AssetChoice[],
): RevisionBindings {
  const overrides = resolveChoices(assets, choices);
  const profiles = viewProfiles(text);
  for (const choice of overrides) {
    if (!profiles.includes(choice.profile))
      throw new BadRequestException('Unknown Web profile for asset choice');
  }
  if (!profiles.length) return inherited;
  return profiles.map((profile) => {
    const parent = inherited.find((item) => item.profile === profile);
    const pendingUnknown =
      parent?.pendingUnknown ?? inherited.find((item) => item.profile === '')?.pendingUnknown;
    const original = parent?.selections ?? [];
    const merged = new Map(original.map((item) => [keyOf(item), item]));
    for (const { profile: target, ...choice } of overrides)
      if (target === profile) merged.set(keyOf(choice), choice);
    const catalog = resolvedCatalog(assets, [...merged.values()]);
    const { references, incomplete } = observed(text, catalog, profile);
    if (incomplete) {
      for (const [key, reference] of observed(text, assets.recommended, profile).references)
        references.set(key, reference);
    }
    // A structurally invalid draft may not reach capability lookup. Preserve explicit and inherited choices.
    for (const [key, { kind, id }] of references) {
      if (merged.has(key)) continue;
      const entry = Object.hasOwn(catalog[kind], id) ? catalog[kind][id] : undefined;
      merged.set(key, { kind, id, lock: entry && !pendingUnknown ? assetLock(entry) : null });
    }
    return {
      profile,
      selections: [...merged.values()].filter(
        (selection) => incomplete || references.has(keyOf(selection)),
      ),
      ...(pendingUnknown && incomplete && { pendingUnknown: true as const }),
    };
  });
}

export function captureAssetBindings(
  assets: WebAssetCatalog,
  text: string,
  profile: string | undefined,
  bindings: RevisionBindings,
) {
  const profiles = viewProfiles(text);
  const selected = profile ?? (profiles.length === 1 ? profiles[0] : undefined);
  const selections = bindings.find((item) => item.profile === selected)?.selections ?? [];
  return { catalog: resolvedCatalog(assets, selections), selections };
}

export function checkAssetBindings(
  text: string,
  catalog: Catalog,
  target: ReturnType<typeof webTarget>,
  selections: readonly Selection[],
  travelHost = false,
): ConfigCheck {
  const unavailable = new Map(
    selections
      .filter(({ kind, id }) => !Object.hasOwn(catalog[kind], id))
      .map((item) => [keyOf(item), item]),
  );
  const pointers = new Map<string, Selection>();
  const checked = compileWebConfig(
    text,
    { catalog: travelHost ? withTravelPreviewHost(catalog) : catalog, target },
    (reference) => {
      const item = unavailable.get(keyOf(reference));
      if (item) pointers.set(reference.sourcePointer, item);
    },
  );
  if (checked.success) {
    const conflict = webAssetCompatibility(checked.prepared);
    if (conflict)
      return {
        success: false,
        catalogId: checked.catalogId,
        target: checked.target,
        diagnostics: [...checked.diagnostics, { ...conflict, severity: 'error' }],
      };
  }
  return {
    ...checked,
    diagnostics: checked.diagnostics.map((diagnostic) => {
      const item = pointers.get(diagnostic.sourcePointer);
      if (
        !item ||
        (diagnostic.code !== 'MATERIAL_NOT_FOUND' && diagnostic.code !== 'FUNCTION_NOT_FOUND')
      )
        return diagnostic;
      return {
        ...diagnostic,
        code: item.lock ? 'ASSET_ARTIFACT_UNAVAILABLE' : 'ASSET_BINDING_PENDING',
        message: item.lock
          ? `锁定制品不可用：${item.id} @ ${item.lock.version}（${item.lock.artifact.digest}）`
          : `请绑定 Web 资产版本：${item.id}`,
      };
    }),
  };
}

export function describeAssetBindings(
  assets: WebAssetCatalog,
  text: string,
  bindings: RevisionBindings,
) {
  const options = {
    materials: assets.entries('materials', true),
    pureFunctions: assets.entries('pureFunctions', true),
  };
  return viewProfiles(text).map((profile) => {
    const { catalog, selections } = captureAssetBindings(assets, text, profile, bindings);
    const locks = new Map(selections.map((selection) => [keyOf(selection), selection.lock]));
    const references = new Map<
      string,
      { kind: WebAssetKind; id: string; locations: Set<string> }
    >();
    compileWebConfig(text, { catalog, target: { platform: 'web', profile } }, (reference) => {
      const key = keyOf(reference);
      const item = references.get(key) ?? {
        kind: reference.kind,
        id: reference.id,
        locations: new Set<string>(),
      };
      item.locations.add(reference.sourcePointer);
      references.set(key, item);
    });
    return {
      profile,
      dependencies: [...references].map(([key, { kind, id, locations }]) => {
        const lock = locks.get(key) ?? null;
        const candidates = options[kind]
          .filter((entry) => entry.manifest.id === id && assets.selectable(kind, entry))
          .map((entry) => ({
            lock: assetLock(entry),
            recommended: assets.find(kind, id) === entry,
            ...(lock && {
              contractChanged: assetLock(entry).manifestDigest !== lock.manifestDigest,
            }),
          }));
        const material =
          kind === 'materials' && Object.hasOwn(catalog.materials, id)
            ? catalog.materials[id]
            : undefined;
        return {
          kind,
          id,
          lock,
          available: Object.hasOwn(catalog[kind], id),
          ...(material && { slots: material.manifest.slots ?? [] }),
          locations: [...locations],
          candidates,
        };
      }),
    };
  });
}
