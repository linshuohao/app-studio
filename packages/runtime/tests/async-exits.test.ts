import { expect, it } from 'vitest';
import { prepared, data } from './fixtures.js';
import { runSourceProcess } from './helpers/source-process.js';

const forms = {
  plain: prepared(),
  event: prepared({
    reactions: [
      { id: 'event', watch: [data('/age')], then: [{ type: 'host.emit', event: 'evt' }] },
    ],
  }),
  external: prepared({
    constraints: [
      {
        id: 'check',
        kind: 'external',
        validator: 'check',
        watch: [data('/age')],
        target: data('/age'),
      },
    ],
  }),
};

const script = `
  import fs from 'node:fs';
  import { runInNewContext } from 'node:vm';
  const { createRuntime } = await import(${JSON.stringify(new URL('../src/index.ts', import.meta.url).href)});
  const { forms, mode } = JSON.parse(fs.readFileSync(0, 'utf8'));
  const field = path => ({ source: 'data', path });
  const rejected = () => mode.includes('foreign')
    ? runInNewContext('Promise.reject(new Error("callback failed"))')
    : mode.includes('thenable')
      ? { then(_, reject) { reject(Error('callback failed')); } }
      : Promise.reject(Error('callback failed'));
  const turns = async () => {
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
  };
  let runtime, status, rejectLate, sinkCalls = 0;
  if (mode.startsWith('observer')) {
    runtime = createRuntime({ prepared: forms.plain, data: { age: 1 } });
    runtime.observe([field('/age')], () => mode.includes('late')
      ? new Promise((_, reject) => { rejectLate = reject; }) : rejected());
    runtime.dispatch({ op: 'set', target: field('/age'), value: 2 });
  } else if (mode.startsWith('event')) {
    runtime = createRuntime({ prepared: forms.event, data: { age: 1 }, host: { events: {
      evt: () => mode.includes('late') ? new Promise((_, reject) => { rejectLate = reject; }) : rejected(),
    } } });
    runtime.dispatch({ op: 'set', target: field('/age'), value: 2 });
  } else if (mode.startsWith('sink')) {
    runtime = createRuntime({ prepared: forms.plain, data: {}, onDiagnostic: () => { sinkCalls++; return rejected(); } });
  } else if (mode.startsWith('cancel')) {
    let changed = false;
    runtime = createRuntime({ prepared: forms.external, data: { age: 1 }, host: { validators: {
      check: () => {
        if (mode === 'cancel-after-reentry') {
          if (!changed) {
            changed = true;
            runtime.dispatch({ op: 'set', target: field('/age'), value: 2 });
            return { result: Promise.resolve([]), cancel: rejected };
          }
          return { result: Promise.resolve([]) };
        }
        return { result: new Promise(() => {}), cancel: () => mode.includes('late')
          ? new Promise((_, reject) => { rejectLate = reject; }) : rejected() };
      },
    } } });
    await runtime.flush();
    if (mode.includes('late')) {
      runtime.dispose();
      rejectLate(Error('late cancellation'));
    } else if (mode !== 'cancel-after-reentry') runtime.dispatch({ op: 'set', target: field('/age'), value: 2 });
  } else {
    runtime = createRuntime({ prepared: forms.external, data: { age: 1 }, host: { validators: {
      check: () => {
        if (mode.startsWith('task-')) return mode.endsWith('resolve') ? Promise.resolve(1) : rejected();
        return {
        result: mode === 'result-foreign-valid' ? runInNewContext('Promise.resolve([])')
          : mode === 'result-thenable-valid' ? { then(resolve) { resolve([]); } } : rejected(),
        ...(mode === 'result-foreign-invalid-cancel' ? { cancel: 42 } : {}),
        };
      },
    } } });
    status = (await runtime.validate()).status;
  }
  const flush = await runtime.flush();
  if ((mode.startsWith('observer') || mode.startsWith('event')) && mode.includes('late')) {
    runtime.dispose();
    rejectLate(Error('late callback'));
  }
  await turns();
  const errors = runtime.diagnostics().filter(entry => entry.kind.endsWith('.error'));
  console.log(JSON.stringify({ status, flush: flush.status, errors, sinkCalls, snapshot: mode.includes('late') ? null : runtime.snapshot() }));
  runtime.dispose();
  await turns();
`;

it.each([
  ['observer-native', 'observer.error'],
  ['observer-foreign', 'observer.error'],
  ['observer-thenable', 'observer.error'],
  ['event-native', 'host.event.error'],
  ['event-foreign', 'host.event.error'],
  ['event-thenable', 'host.event.error'],
  ['sink-native', 'diagnostic.output.error'],
  ['sink-foreign', 'diagnostic.output.error'],
  ['cancel-native', 'validator.cancel.error'],
  ['cancel-foreign', 'validator.cancel.error'],
  ['cancel-after-reentry', 'validator.cancel.error'],
  ['result-foreign-reject', 'validator.error'],
  ['result-foreign-invalid-cancel', 'validator.error'],
  ['task-native-reject', 'validator.error'],
  ['task-foreign-reject', 'validator.error'],
  ['task-native-resolve', 'validator.error'],
])('%s 隔离拒绝并保留对应诊断', (mode, kind) => {
  const child = runSourceProcess(script, { forms, mode });
  expect(child.error).toBeUndefined();
  expect(child.status, child.stderr).toBe(0);
  expect(child.stderr).toBe('');
  const result = JSON.parse(child.stdout) as {
    errors: Array<{
      kind: string;
      evidence?: { input: { snapshot: unknown }; error: { name: string; stack?: string } };
    }>;
    sinkCalls: number;
    status?: string;
  };
  expect(result.errors.map((entry) => entry.kind)).toContain(kind);
  if (mode.startsWith('observer') || mode.startsWith('event')) {
    const error = result.errors.find((entry) => entry.kind === kind)!;
    expect(error.evidence?.input.snapshot).toEqual({ age: 2 });
  }
  if (mode.includes('foreign') && !mode.startsWith('sink')) {
    const error = result.errors.find((entry) => entry.kind === kind)!;
    expect(error.evidence?.error.name).toBe('Error');
    expect(error.evidence?.error.stack).toEqual(expect.any(String));
  }
  if (mode.startsWith('sink')) expect(result.sinkCalls).toBeLessThan(10);
  if (mode.startsWith('result') || mode.startsWith('task'))
    expect(result.status).toBe('incomplete');
});

it.each(['result-foreign-valid', 'result-thenable-valid'])('%s 正常完成完整校验', (mode) => {
  const child = runSourceProcess(script, { forms, mode });
  expect(child.status, child.stderr).toBe(0);
  const result = JSON.parse(child.stdout) as { status: string; errors: unknown[] };
  expect(result.status).toBe('valid');
  expect(result.errors).toEqual([]);
});

it.each(['observer-late', 'event-late', 'cancel-late'])(
  '%s 销毁后只消费拒绝，不发布迟到诊断',
  (mode) => {
    const child = runSourceProcess(script, { forms, mode });
    expect(child.status, child.stderr).toBe(0);
    expect((JSON.parse(child.stdout) as { errors: unknown[] }).errors).toEqual([]);
  },
);
