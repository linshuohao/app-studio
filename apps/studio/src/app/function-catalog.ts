import { useContext, useEffect, useState } from 'react';
import type { PureFunctionManifest } from '@form-engine/protocol/capability';
import type { Detail } from './asset-catalog';
import { catalogAssetPath, useAssetBindingProfiles } from './asset-binding-editor';
import { FormAssetScope } from './form-asset-scope';
import { platform, failureMessage } from './platform-api';

export type FunctionDocumentation = NonNullable<Detail['documentation']>;
export function functionTitle(id: string, doc?: FunctionDocumentation) {
  return doc?.title || doc?.description?.match(/^# ([^\n]+)/)?.[1]?.trim() || id;
}
type FunctionDetail = {
  manifest: PureFunctionManifest;
  documentation?: FunctionDocumentation | null;
};

export function useFunctionCatalog() {
  const scope = useContext(FormAssetScope);
  const scopedInput = scope?.input;
  const selectedInput =
    scopedInput &&
    ('versionId' in scopedInput || scopedInput.basedOnVersionId || scopedInput.assetChoices?.length)
      ? scopedInput
      : undefined;
  const bindings = useAssetBindingProfiles(scope?.formPath, selectedInput);
  const waiting = selectedInput !== undefined && !bindings;
  const bindingError = bindings?.error;
  const scopedFunctions = bindings?.profiles
    ?.find(({ profile }) => profile === scope?.profile)
    ?.dependencies.filter(({ kind }) => kind === 'pureFunctions');
  const choices = JSON.stringify(scopedFunctions ?? []);
  const [catalog, setCatalog] = useState<{ choices: string; details: FunctionDetail[] }>();
  const details = !waiting && catalog?.choices === choices ? catalog.details : [];
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (waiting || bindingError) return;
    let current = true;
    async function load() {
      const recommended = await platform<{ id: string; version: string }[]>('/catalog/functions');
      const selected = JSON.parse(choices) as {
        id: string;
        available: boolean;
        lock: { version: string; artifact: { digest: string } } | null;
      }[];
      const paths = [
        ...recommended
          .filter(({ id }) => !selected.some((binding) => binding.id === id))
          .map(({ id, version }) => catalogAssetPath('functions', id, version)),
        ...selected
          .filter(({ available, lock }) => available && lock)
          .map(({ id, lock }) =>
            catalogAssetPath('functions', id, lock!.version, lock!.artifact.digest),
          ),
      ];
      const loaded = await Promise.all(paths.map((path) => platform<FunctionDetail>(path)));
      if (current) {
        setCatalog({ choices, details: loaded });
        setError('');
      }
    }
    load().catch((e) => {
      if (current) setError(failureMessage(e));
    });
    return () => {
      current = false;
    };
  }, [retry, choices, waiting, bindingError]);
  return {
    manifests: details.map(({ manifest }) => manifest),
    functionDocs: new Map(
      details.flatMap(({ manifest, documentation }) =>
        documentation ? [[manifest.id, documentation] as const] : [],
      ),
    ),
    error: bindingError ?? error,
    reload: () => setRetry((v) => v + 1),
  };
}
