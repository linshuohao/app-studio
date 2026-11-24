import { useEffect, useState } from 'react';
import type { PureFunctionManifest } from '@form-engine/protocol/capability';
import type { Detail } from './asset-catalog';
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
  const [details, setDetails] = useState<FunctionDetail[]>([]);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    async function load() {
      const entries = await platform<{ id: string; version: string }[]>('/catalog/functions');
      const loaded = await Promise.all(
        entries.map(({ id, version }) =>
          platform<FunctionDetail>(
            '/catalog/functions/' +
              encodeURIComponent(id) +
              '?version=' +
              encodeURIComponent(version),
          ),
        ),
      );
      if (current) {
        setDetails(loaded);
        setError('');
      }
    }
    load().catch((e) => {
      if (current) setError(failureMessage(e));
    });
    return () => {
      current = false;
    };
  }, [retry]);
  return {
    manifests: details.map(({ manifest }) => manifest),
    functionDocs: new Map(
      details.flatMap(({ manifest, documentation }) =>
        documentation ? [[manifest.id, documentation] as const] : [],
      ),
    ),
    error,
    reload: () => setRetry((v) => v + 1),
  };
}
