import { compile } from '@form-engine/compiler';
import { createRuntime, type ReadonlyJson } from '@form-engine/runtime';
import { artifact, definitions } from '../catalog';
import { basicDefinition, ref } from './definition';
/** A controlled local Host for batch-1 verification, without real service requests. */
export function createMaterialSession(
  onSnapshot: (snapshot: ReadonlyJson) => void,
  onResult: (message: string) => void,
) {
  const result = compile({
    definition: basicDefinition,
    catalog: {
      id: 'first-materials',
      materials: Object.fromEntries(
        definitions.map((d) => [
          d.contract.manifest.id,
          { manifest: d.contract.manifest, artifact },
        ]),
      ),
      pureFunctions: {},
    },
  });
  if (!result.success) throw Error(JSON.stringify(result.diagnostics));
  let disposed = false;
  const runtime = createRuntime({
    prepared: result.prepared,
    data: { name: 'Alice', age: 18, plan: 'legacy', acknowledged: false },
    host: {
      events: {
        'verification.fill': () => {
          runtime.dispatch({
            op: 'batch',
            commands: [
              { op: 'set', target: ref('/name'), value: 'Host 姓名' },
              { op: 'set', target: ref('/age'), value: 0 },
              { op: 'set', target: ref('/plan'), value: 'basic' },
              { op: 'set', target: ref('/acknowledged'), value: true },
            ],
          });
        },
        'verification.validate': () => {
          onResult('校验中');
          void runtime.validate().then((result) => {
            if (!disposed)
              onResult(result.status === 'valid' ? JSON.stringify(result.snapshot) : result.status);
          });
        },
      },
    },
  });
  const observation = runtime.observe([ref('')], () => onSnapshot(runtime.snapshot()));
  onSnapshot(runtime.snapshot());
  return {
    prepared: result.prepared,
    runtime,
    dispose() {
      disposed = true;
      observation.dispose();
      runtime.dispose();
    },
  };
}
