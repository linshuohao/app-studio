import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateFormController } from './create-form.controller.js';
import type { ReleaseBuild } from './release-build.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Platform CreateForm boundary', () => {
  it('rejects tool calls before reading installed assets or invoking Compiler', async () => {
    vi.stubEnv('AGENT_SERVICE_TOKEN', 'real-service');
    const capture = vi.fn();
    const endpoint = new CreateFormController({ capture } as unknown as ReleaseBuild);
    expect(() => endpoint.catalog('wrong', { kind: 'material', query: 'select' })).toThrow();
    await expect(endpoint.check('', { candidate_text: '{}' })).rejects.toThrow();
    expect(capture).not.toHaveBeenCalled();
  });
});
