import { compile } from '@form-engine/compiler';
import { createRuntime, type ReadonlyJson } from '@form-engine/runtime';
import { defineHostRequests } from '@form-engine/renderer-react';
import {
  remoteSelectRequests,
  type RemoteSelectSearchInput,
  type RemoteSelectSearchResult,
} from '@form-engine/materials-react';
import { artifact, definitions } from '../catalog';
import { interactionDefinition, ref } from './definition';
export interface SearchCallView {
  id: number;
  query: string;
  filterKey: string | null;
  aborted: boolean;
  settled: boolean;
}
interface PendingCall {
  id: number;
  input: RemoteSelectSearchInput;
  signal: AbortSignal;
  settled: boolean;
  resolve: (result: RemoteSelectSearchResult) => void;
  reject: (error: unknown) => void;
  abort: () => void;
}
/** Manual local Host results exercise late returns without assuming physical network cancellation. */
export function createInteractionSession(
  onSnapshot: (value: ReadonlyJson) => void,
  onCalls: (calls: SearchCallView[]) => void,
) {
  const compiled = compile({
    definition: interactionDefinition,
    catalog: {
      id: 'interaction-verification',
      materials: Object.fromEntries(
        definitions.map((d) => [
          d.contract.manifest.id,
          { manifest: d.contract.manifest, artifact },
        ]),
      ),
      pureFunctions: {},
    },
  });
  if (!compiled.success) throw Error(JSON.stringify(compiled.diagnostics));
  let disposed = false,
    nextId = 0;
  const calls: PendingCall[] = [];
  const publish = () => {
    if (!disposed)
      onCalls(
        calls.map((call) => ({
          id: call.id,
          query: call.input.query,
          filterKey: call.input.filterKey,
          aborted: call.signal.aborted,
          settled: call.settled,
        })),
      );
  };
  const requests = defineHostRequests(
    { 'travel.searchCities': remoteSelectRequests.search },
    {
      'travel.searchCities': (input, { signal }) =>
        new Promise<RemoteSelectSearchResult>((resolve, reject) => {
          const record: PendingCall = {
            id: ++nextId,
            input,
            signal,
            settled: false,
            resolve,
            reject,
            abort: publish,
          };
          calls.push(record);
          signal.addEventListener('abort', record.abort, { once: true });
          publish();
        }),
    },
  );
  const runtime = createRuntime({
    prepared: compiled.prepared,
    data: {
      birthDate: '1990-06-15',
      notes: '',
      contactMethod: 'email',
      notifications: [],
      country: 'CN',
      city: { id: 'initial', label: '初始城市' },
      start: '2028-02-28',
      endState: { end: '2028-03-01' },
      showRemote: true,
    },
  });
  const observation = runtime.observe([ref('')], () => onSnapshot(runtime.snapshot()));
  onSnapshot(runtime.snapshot());
  return {
    prepared: compiled.prepared,
    runtime,
    requests,
    complete(id: number, outcome: 'success' | 'empty' | 'failure') {
      const record = calls.find((call) => call.id === id);
      if (disposed || !record || record.settled) return;
      record.settled = true;
      record.signal.removeEventListener('abort', record.abort);
      if (outcome === 'failure') record.reject(Error('controlled Host failure'));
      else
        record.resolve({
          items:
            outcome === 'empty'
              ? []
              : [
                  {
                    id: `${record.input.filterKey ?? 'all'}:${record.input.query}`,
                    label: `${record.input.query}市`,
                  },
                ],
        });
      publish();
    },
    dispose() {
      disposed = true;
      observation.dispose();
      runtime.dispose();
      for (const record of calls) {
        record.signal.removeEventListener('abort', record.abort);
        if (!record.settled) {
          record.settled = true;
          record.resolve({ items: [] });
        }
      }
    },
  };
}
