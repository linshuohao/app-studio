import { describe, expect, it, vi } from 'vitest';
import type { ArtifactIdentity } from '@form-engine/protocol';
import { createWebCapabilities } from '../../apps/studio/src/app/web-capabilities';
import { resolveWebCapabilities } from '../../apps/studio/src/app/host/resolve-capabilities';
import { canonical, digest } from '../../apps/studio/src/app/host/read-delivery';

vi.hoisted(() => {
  vi.stubEnv('RELEASE_MATERIAL_DIGEST', 'sha256:' + '0'.repeat(64));
  vi.stubEnv('RELEASE_FUNCTION_DIGEST', 'sha256:' + '1'.repeat(64));
});

const artifact = (id: string, byte: string): ArtifactIdentity => ({
  id,
  platform: 'web',
  digest: `sha256:${byte.repeat(64)}`,
});

describe('Web capability assembly after an asset update', () => {
  const old = createWebCapabilities(
    artifact('materials-react', 'a'),
    artifact('pure-functions', 'b'),
  );
  const current = createWebCapabilities(
    artifact('materials-react', 'c'),
    artifact('pure-functions', 'd'),
  );

  async function lockFor(capabilities: typeof old) {
    const material = capabilities.materials['text-input']!;
    const fn = capabilities.functions['date.inclusiveDays']!;
    return {
      materials: {
        'text-input': {
          id: 'text-input',
          version: material.contract.manifest.version,
          manifestDigest: await digest(canonical(material.contract.manifest)),
          artifact: material.artifact,
        },
      },
      pureFunctions: {
        'date.inclusiveDays': {
          id: 'date.inclusiveDays',
          version: fn.manifest.version,
          manifestDigest: await digest(canonical(fn.manifest)),
          artifact: fn.artifact,
        },
      },
    };
  }

  it('selects the original build of each release even when the manifest version is identical', async () => {
    for (const expected of [old, current]) {
      const selected = await resolveWebCapabilities(await lockFor(expected), [current, old]);
      expect(selected.materials['text-input']).toBe(expected.materials['text-input']);
      expect(selected.functions['date.inclusiveDays']).toBe(
        expected.functions['date.inclusiveDays'],
      );
      expect(Object.keys(selected.materials)).toEqual(['text-input']);
    }
  });

  it('refuses to substitute the current version or a mismatched manifest', async () => {
    const lock = await lockFor(old);
    await expect(resolveWebCapabilities(lock, [current])).rejects.toThrow('text-input');
    lock.materials['text-input'].manifestDigest = artifact('materials-react', 'e').digest;
    await expect(resolveWebCapabilities(lock, [old, current])).rejects.toThrow('text-input');
  });

  it('rejects an archived core binding incompatible with the selected Runtime before mount', async () => {
    const bound = old.functions['core.add']!;
    const lock = {
      materials: {},
      pureFunctions: {
        'core.add': {
          id: 'core.add',
          version: bound.manifest.version,
          manifestDigest: await digest(canonical(bound.manifest)),
          artifact: bound.artifact,
        },
      },
    };
    await expect(resolveWebCapabilities(lock, [old])).resolves.toMatchObject({
      functions: { 'core.add': bound },
    });
    const unrecognized = { materials: {}, functions: { 'core.add': { ...bound } } };
    await expect(resolveWebCapabilities(lock, [unrecognized])).rejects.toThrow(
      '当前 Runtime 无法执行发布锁定的内置函数',
    );
  });
});

describe('Web Host opens and runs publications in one upgraded assembly', () => {
  it('renders each retained component and evaluates the function locked to its release', async () => {
    const { compile } = await import('@form-engine/compiler');
    const { createRuntime } = await import('@form-engine/runtime');
    const { FormRenderer, defineMaterial, defineMaterialContract, useMaterialAdapter } =
      await import('../../packages/renderer-react/src/index');
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');

    function build(version: string, mark: string, marker: string, value: number) {
      const material = artifact('materials-react', mark);
      const functions = artifact('pure-functions', marker);
      const contract = defineMaterialContract<{ result: number }>({
        id: 'result',
        version,
        propsSchema: { type: 'object', properties: { result: { type: 'integer' } } },
      });
      const component = defineMaterial(contract, material, () =>
        createElement('output', null, version + ':' + useMaterialAdapter(contract).props.result),
      );
      const binding = {
        manifest: {
          id: 'example.calculate',
          version,
          parameters: [],
          returns: { type: 'integer' } as const,
        },
        artifact: functions,
        invoke: () => value,
      };
      const published = compile({
        target: { platform: 'web' },
        definition: {
          id: 'example',
          protocolVersion: 'tests',
          version: '1',
          data: { schema: { type: 'object' } },
          views: {
            main: {
              material: 'result',
              props: { result: { $expr: { op: 'example.calculate', args: [] } } },
            },
          },
        },
        catalog: {
          id: version,
          materials: { result: { manifest: contract.manifest, artifact: material } },
          pureFunctions: {
            'example.calculate': { manifest: binding.manifest, artifact: functions },
          },
        },
      });
      if (!published.success) throw new Error(JSON.stringify(published.diagnostics));
      return {
        prepared: published.prepared,
        bindings: { materials: { result: component }, functions: { 'example.calculate': binding } },
      };
    }

    const older = build('1.0.0', 'a', 'b', 12);
    const newer = build('2.0.0', 'c', 'd', 24);
    const afterUpgrade = [newer.bindings, older.bindings];

    for (const [release, expected] of [
      [older, '1.0.0:12'],
      [newer, '2.0.0:24'],
    ] as const) {
      const { materials, functions } = await resolveWebCapabilities(
        release.prepared.capabilityLock,
        afterUpgrade,
      );
      const runtime = createRuntime({ prepared: release.prepared, data: {}, functions });
      try {
        const rendered = renderToStaticMarkup(
          createElement(FormRenderer, { prepared: release.prepared, runtime, materials }),
        );
        expect(rendered).toContain('<output>' + expected + '</output>');
      } finally {
        runtime.dispose();
      }
    }
  });
});
