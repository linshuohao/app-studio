import { compile } from '@form-engine/compiler';
import { createRuntime, type ReadonlyJson } from '@form-engine/runtime';
import { createCoreFunctions } from '@form-engine/pure-functions';
import { artifact, definitions } from '../catalog';
import { memberDefinition, ref } from './definition';
export type MemberProfile = 'desktop' | 'compact';
/** Same execution model and Runtime for both Profiles; only the selected view changes. */
export function createMemberSession(
  onSnapshot: (value: ReadonlyJson) => void,
  onResult: (message: string) => void,
) {
  const functions = createCoreFunctions(artifact);
  const catalog = {
    id: 'member-verification',
    materials: Object.fromEntries(
      definitions.map((d) => [d.contract.manifest.id, { manifest: d.contract.manifest, artifact }]),
    ),
    pureFunctions: Object.fromEntries(
      Object.entries(functions).map(([id, binding]) => [
        id,
        { manifest: binding.manifest, artifact: binding.artifact },
      ]),
    ),
  };
  const prepare = (profile: MemberProfile) => {
    const result = compile({ definition: memberDefinition, catalog, target: { profile } });
    if (!result.success) throw Error(JSON.stringify(result.diagnostics));
    return result.prepared;
  };
  const profiles = { desktop: prepare('desktop'), compact: prepare('compact') };
  let disposed = false;
  const runtime = createRuntime({
    prepared: profiles.desktop,
    functions,
    data: {
      showGuardian: true,
      insureds: [
        { name: '成人 A', age: 30, idNumber: 'TEST-A', guardianName: '监护 A' },
        { name: '儿童 B', age: 12, idNumber: 'TEST-B', guardianName: '监护 B' },
      ],
    },
    host: {
      events: {
        'members.validate': () => {
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
    runtime,
    profiles,
    dispose() {
      disposed = true;
      observation.dispose();
      runtime.dispose();
    },
  };
}
