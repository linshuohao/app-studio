import { expect, it } from 'vitest';
import { createRuntime, type ValidatorIssue } from '../src/index.js';
import { data, functions, prepared } from './fixtures.js';

function deferred() {
  let resolve!: (issues: readonly ValidatorIssue[]) => void;
  let reject!: (error: unknown) => void;
  const result = new Promise<readonly ValidatorIssue[]>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { result, resolve, reject };
}
const remote = {
  id: 'remote',
  kind: 'external' as const,
  validator: 'check',
  target: data('/name'),
  watch: [data('/name')],
};
const tick = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

it('失败状态通知中修改数据，旧调用stale仍保留已经发生的完整错误现场', async () => {
  const tasks: ReturnType<typeof deferred>[] = [];
  const runtime = createRuntime({
    prepared: prepared({ constraints: [remote] }),
    data: { name: 'A' },
    host: {
      validators: {
        check: () => {
          const task = deferred();
          tasks.push(task);
          return task;
        },
      },
    },
  });
  let changed = false;
  runtime.observe([{ source: 'validation', field: data('/name'), observe: 'status' }], () => {
    if (!changed && runtime.getValidation(data('/name')).status === 'incomplete') {
      changed = true;
      runtime.dispatch({ op: 'set', target: data('/name'), value: 'B' });
    }
  });
  const full = runtime.validate();
  tasks[0]!.reject(Error('failure before edit'));
  const result = await full;
  expect(result.status).toBe('stale');
  expect(
    result.diagnostics.find((entry) => entry.kind === 'validator.error')?.evidence?.input.snapshot,
  ).toEqual({ name: 'A' });
  await runtime.flush();
  tasks.at(-1)!.resolve([]);
  await tick();
  runtime.dispose();
});

it('Schema通知写回新数据后，先检查新Schema再启动队列中的独立外部校验', async () => {
  const schemaSeen: string[][] = [];
  const runtime = createRuntime({
    prepared: prepared({ constraints: [remote] }),
    data: { name: 'A', age: 20 },
    host: {
      validators: {
        check: () => {
          schemaSeen.push(runtime.getValidation(data('/age')).issues.map((issue) => issue.code));
          return { result: Promise.resolve([]) };
        },
      },
    },
  });
  let changed = false;
  runtime.observe([{ source: 'validation', field: data('/age'), observe: 'status' }], () => {
    if (!changed && runtime.getValidation(data('/age')).status === 'valid') {
      changed = true;
      runtime.dispatch({ op: 'set', target: data('/age'), value: 'bad' });
    }
  });
  await runtime.flush();
  await tick();
  expect(schemaSeen).toEqual([['schema.type']]);
  runtime.dispose();
});

it('连续20次完整调用保持单个请求与单个pending通知，最后一次等待独立完成', async () => {
  const task = deferred();
  let requests = 0,
    cancelled = 0,
    pendingNotices = 0;
  const runtime = createRuntime({
    prepared: prepared({ constraints: [remote] }),
    data: { name: 'A' },
    host: {
      validators: {
        check: () => {
          requests++;
          return { result: task.result, cancel: () => cancelled++ };
        },
      },
    },
  });
  runtime.observe([{ source: 'validation', field: data('/name'), observe: 'status' }], () => {
    if (runtime.getValidation(data('/name')).status === 'pending') pendingNotices++;
  });
  await runtime.flush();
  const proofs = Array.from({ length: 20 }, () => runtime.validate());
  expect(requests).toBe(1);
  expect(cancelled).toBe(0);
  expect(pendingNotices).toBe(1);
  task.resolve([]);
  const results = await Promise.all(proofs);
  expect(results.slice(0, -1).every((result) => result.status === 'stale')).toBe(true);
  expect(results.at(-1)?.status).toBe('valid');
  runtime.dispose();
});

it('已完成结果发布中的回调主动重试，不复用正在封存的失败结果', async () => {
  const tasks: ReturnType<typeof deferred>[] = [];
  const runtime = createRuntime({
    prepared: prepared({ constraints: [remote] }),
    data: { name: 'A' },
    host: {
      validators: {
        check: () => {
          const task = deferred();
          tasks.push(task);
          return task;
        },
      },
    },
  });
  await runtime.flush();
  let retry: ReturnType<typeof runtime.validate> | undefined,
    started = false;
  runtime.observe([{ source: 'validation', field: data('/name'), observe: 'status' }], () => {
    if (!started && runtime.getValidation(data('/name')).status === 'invalid') {
      started = true;
      retry = runtime.validate();
    }
  });
  tasks[0]!.resolve([{ code: 'RETRY' }]);
  await tick();
  expect(tasks).toHaveLength(2);
  tasks[1]!.resolve([]);
  expect((await retry!).status).toBe('valid');
  runtime.dispose();
});

it('另一个请求仍在途时，新完整调用重试已完成的外部来源并复用未完成来源', async () => {
  const tasks: Array<{ name: string; task: ReturnType<typeof deferred> }> = [];
  const runtime = createRuntime({
    prepared: prepared({
      constraints: [
        remote,
        { ...remote, id: 'other', validator: 'other', target: data('/age'), watch: [data('/age')] },
      ],
    }),
    data: { name: 'A', age: 20 },
    host: {
      validators: Object.fromEntries(
        ['check', 'other'].map((name) => [
          name,
          () => {
            const task = deferred();
            tasks.push({ name, task });
            return task;
          },
        ]),
      ),
    },
  });
  const first = runtime.validate();
  tasks[0]!.task.resolve([{ code: 'RETRY' }]);
  await tick();
  const second = runtime.validate();
  expect((await first).status).toBe('stale');
  expect(tasks.map((entry) => entry.name)).toEqual(['check', 'other', 'check']);
  tasks[1]!.task.resolve([]);
  tasks[2]!.task.resolve([]);
  expect((await second).status).toBe('valid');
  runtime.dispose();
});

it('Schema发布通知中重入完整调用，最新调用等待补入队列的Schema工作', async () => {
  const runtime = createRuntime({ prepared: prepared(), data: { name: 'A' } });
  let nested: ReturnType<typeof runtime.validate> | undefined,
    started = false;
  runtime.observe([{ source: 'validation', field: data('/name'), observe: 'status' }], () => {
    if (!started && runtime.getValidation(data('/name')).status === 'valid') {
      started = true;
      nested = runtime.validate();
    }
  });
  const first = runtime.validate();
  expect((await first).status).toBe('stale');
  expect((await nested!).status).toBe('valid');
  expect((await runtime.flush()).status).toBe('settled');
  runtime.dispose();
});

it('已在途的不同成员分别复用，删除成员使完整调用stale且旧错误不能回写', async () => {
  const tasks: ReturnType<typeof deferred>[] = [];
  const scope = { from: data('/rows'), as: 'row', mode: 'each' as const };
  const runtime = createRuntime({
    prepared: prepared({
      constraints: [
        { ...remote, scope, watch: [data('/name', 'row')], target: data('/name', 'row') },
      ],
    }),
    data: { rows: [{ name: 'A' }, { name: 'B' }] },
    host: {
      validators: {
        check: () => {
          const task = deferred();
          tasks.push(task);
          return task;
        },
      },
    },
  });
  await runtime.flush();
  const full = runtime.validate();
  expect(tasks).toHaveLength(2);
  const [row] = runtime.bind(scope);
  runtime.dispatch({ op: 'array.remove', target: data('/rows'), item: { $scope: 'row' } }, row);
  expect((await full).status).toBe('stale');
  tasks[0]!.resolve([{ code: 'OLD' }]);
  tasks[1]!.resolve([]);
  await tick();
  expect(runtime.getValidation(data('/rows/0/name')).issues).toEqual([]);
  runtime.dispose();
});

it('自动校验与连续完整调用共享一个在途请求，旧调用stale且不取消共享任务', async () => {
  const task = deferred();
  let calls = 0,
    cancels = 0;
  const runtime = createRuntime({
    prepared: prepared({ constraints: [remote] }),
    data: { name: 'A' },
    host: {
      validators: {
        check: () => {
          calls++;
          return { result: task.result, cancel: () => cancels++ };
        },
      },
    },
  });
  await runtime.flush();
  const first = runtime.validate(),
    second = runtime.validate();
  expect((await first).status).toBe('stale');
  expect(calls).toBe(1);
  expect(cancels).toBe(0);
  task.resolve([]);
  expect((await second).status).toBe('valid');
  runtime.dispose();
});

it('pending通知重入只扩充统一队列，两个规则各启动一次并等待完整覆盖', async () => {
  const tasks: Array<{ name: string; task: ReturnType<typeof deferred> }> = [];
  let cancels = 0,
    nested: ReturnType<ReturnType<typeof createRuntime>['validate']> | undefined;
  const runtime = createRuntime({
    prepared: prepared({
      constraints: [
        remote,
        { ...remote, id: 'other', validator: 'other', target: data('/age'), watch: [data('/age')] },
      ],
    }),
    data: { name: 'A', age: 20 },
    host: {
      validators: Object.fromEntries(
        ['check', 'other'].map((name) => [
          name,
          () => {
            const task = deferred();
            tasks.push({ name, task });
            return { result: task.result, cancel: () => cancels++ };
          },
        ]),
      ),
    },
  });
  let triggered = false;
  runtime.observe([{ source: 'validation', field: data('/name'), observe: 'status' }], () => {
    if (!triggered && runtime.getValidation(data('/name')).status === 'pending') {
      triggered = true;
      nested = runtime.validate();
    }
  });
  const original = runtime.validate();
  expect((await original).status).toBe('stale');
  await runtime.flush();
  expect(tasks.map((entry) => entry.name)).toEqual(['check', 'other']);
  expect(cancels).toBe(0);
  let returned = false;
  void nested!.then(() => {
    returned = true;
  });
  tasks[0]!.task.resolve([]);
  await tick();
  expect(returned).toBe(false);
  tasks[1]!.task.resolve([]);
  expect((await nested!).status).toBe('valid');
  runtime.dispose();
});

it('复用旧启动任务的异常进入最新完整调用，保留启动输入及来源', async () => {
  const task = deferred();
  const runtime = createRuntime({
    prepared: prepared({ constraints: [remote] }),
    data: { name: 'A' },
    traceCapacity: 0,
    host: { validators: { check: () => task } },
  });
  const launched = await runtime.flush();
  const full = runtime.validate();
  task.reject(Error('shared failure'));
  const result = await full;
  expect(result.status).toBe('incomplete');
  const error = result.diagnostics.find((entry) => entry.kind === 'validator.error');
  expect(error?.origin?.round).toBe(launched.round);
  expect(error?.relatedCalls).toContain(result.call);
  expect(error?.evidence?.input.snapshot).toEqual({ name: 'A' });
  runtime.dispose();
});

it('完整调用不缓存已完成的外部结果，重复调用可重试并保留独立规则', async () => {
  const tasks: ReturnType<typeof deferred>[] = [];
  const runtime = createRuntime({
    prepared: prepared({ constraints: [remote] }),
    data: { name: 'A' },
    host: {
      validators: {
        check: () => {
          const task = deferred();
          tasks.push(task);
          return task;
        },
      },
    },
  });
  const first = runtime.validate();
  tasks[0]!.resolve([{ code: 'RETRY' }]);
  expect((await first).status).toBe('invalid');
  const second = runtime.validate();
  expect(tasks).toHaveLength(2);
  tasks[1]!.resolve([]);
  expect((await second).status).toBe('valid');
  runtime.dispose();
});

it('复用在途任务不跳过最新前置检查，新输入使旧完整调用过期', async () => {
  const tasks: ReturnType<typeof deferred>[] = [];
  const runtime = createRuntime({
    prepared: prepared({
      constraints: [
        {
          id: 'gate',
          kind: 'internal',
          assert: { ref: data('/flag') },
          issue: { target: data('/name'), code: 'GATE' },
        },
        { ...remote, requires: [{ kind: 'constraint', constraintId: 'gate' }] },
      ],
    }),
    functions,
    data: { name: 'A', flag: true },
    host: {
      validators: {
        check: () => {
          const task = deferred();
          tasks.push(task);
          return task;
        },
      },
    },
  });
  await runtime.flush();
  const full = runtime.validate();
  expect(tasks).toHaveLength(1);
  runtime.dispatch({ op: 'set', target: data('/flag'), value: false });
  expect((await full).status).toBe('stale');
  await runtime.flush();
  expect(tasks).toHaveLength(1);
  tasks[0]!.resolve([{ code: 'OLD' }]);
  await tick();
  expect(runtime.getValidation(data('/name')).issues.map((issue) => issue.code)).toEqual(['GATE']);
  runtime.dispose();
});
