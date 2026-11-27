import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateFormController } from './create-form.controller.js';
import { configText } from './forms.js';
import type { PlatformDatabase } from './database.js';
import type { ReleaseBuild } from './release-build.js';

const database = { executor: {} } as PlatformDatabase;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Platform CreateForm boundary', () => {
  it('uses the same UTF-8 size limit for candidate checks and stored configuration', async () => {
    vi.stubEnv('AGENT_SERVICE_TOKEN', 'real-service');
    const compile = vi.fn().mockResolvedValue({
      success: true,
      prepared: { hostRequirements: {} },
      diagnostics: [],
    });
    const capture = () => ({
      compiler: 'test',
      target: {},
      schemaResources: {},
      catalog: {
        id: 'fixed',
        materials: {
          'remote-select': {
            manifest: { requests: { search: { payloadSchema: {}, resultSchema: {} } } },
          },
        },
      },
    });
    const endpoint = new CreateFormController(
      { capture, compile } as unknown as ReleaseBuild,
      database,
    );
    const candidate = '{"title":"' + '保'.repeat(21841) + 'x"}';
    expect(Buffer.byteLength(candidate)).toBe(65536);
    expect(configText(candidate)).toBe(candidate);
    await expect(
      endpoint.check('real-service', { candidate_text: candidate }),
    ).resolves.toMatchObject({
      success: true,
    });
    const oversized = candidate + ' ';
    expect(() => configText(oversized)).toThrow('64 KiB');
    await expect(
      endpoint.check('real-service', { candidate_text: oversized }),
    ).resolves.toMatchObject({
      success: false,
      diagnostics: [expect.objectContaining({ code: 'CONFIG_TEXT_TOO_LARGE' })],
    });
    expect(compile).toHaveBeenCalledTimes(1);
  });

  it('rejects tool calls before reading installed assets or invoking Compiler', async () => {
    vi.stubEnv('AGENT_SERVICE_TOKEN', 'real-service');
    const capture = vi.fn();
    const endpoint = new CreateFormController({ capture } as unknown as ReleaseBuild, database);
    await expect(
      endpoint.catalog('wrong', { kind: 'material', query: 'select' }),
    ).rejects.toThrow();
    await expect(endpoint.checkSchema('wrong', { schema_text: '{}', cases: [] })).rejects.toThrow();
    await expect(endpoint.check('', { candidate_text: '{}' })).rejects.toThrow();
    expect(capture).not.toHaveBeenCalled();
  });

  it('checks an exact Data Schema and returns case diagnostics under the pinned target', async () => {
    vi.stubEnv('AGENT_SERVICE_TOKEN', 'real-service');
    const capture = () => ({
      compiler: 'test',
      target: {},
      schemaResources: {},
      catalog: {
        id: 'fixed',
        materials: {
          'remote-select': {
            manifest: { requests: { search: { payloadSchema: {}, resultSchema: {} } } },
          },
        },
      },
    });
    const endpoint = new CreateFormController({ capture } as unknown as ReleaseBuild, database);
    const result = await endpoint.checkSchema('real-service', {
      schema_text: '{"type":"object","required":["age"]}',
      cases: [{ name: 'required age', data: {}, valid: true }],
    });
    expect(result).toMatchObject({
      success: false,
      candidate_digest: expect.stringMatching(/^sha256:/),
      diagnostics: [expect.objectContaining({ code: 'DATA_SCHEMA_CASE_MISMATCH' })],
    });
    await expect(
      endpoint.checkSchema('real-service', {
        schema_text: '{}',
        cases: [],
        check_environment: 'outdated',
      }),
    ).rejects.toThrow('Requested compiler environment unavailable');
  });

  it('returns selected material behavior notes only for the installed version', async () => {
    vi.stubEnv('AGENT_SERVICE_TOKEN', 'real-service');
    const fixture = (version: string) =>
      ({
        capture: () => ({
          compiler: 'test',
          target: {},
          schemaResources: {},
          catalog: {
            id: 'fixed',
            materials: {
              'remote-select': {
                manifest: {
                  id: 'remote-select',
                  version,
                  requests: { search: { payloadSchema: {}, resultSchema: {} } },
                },
              },
            },
          },
        }),
      }) as unknown as ReleaseBuild;
    const exact = new CreateFormController(fixture('0.1.0'), database);
    const query = { kind: 'material', query: 'remote-select' };
    expect(await exact.catalog('real-service', query)).toMatchObject([
      { id: 'remote-select', description: expect.stringContaining('候选和当前选择都展示') },
    ]);
    expect(await exact.catalog('real-service', { ...query, query: '' })).toEqual(['remote-select']);
    const different = new CreateFormController(fixture('0.0.0'), database);
    expect(await different.catalog('real-service', query)).not.toMatchObject([
      { description: expect.any(String) },
    ]);
  });
});
