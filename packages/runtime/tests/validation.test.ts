import { expect, it } from 'vitest';
import { createRuntime } from '../src/index.js';
import { data, functions, prepared } from './fixtures.js';
import type { ValidatorIssue } from '../src/types.js';

it('非法任务结构仍处理已经取得的Promise拒绝，不产生未处理拒绝', async () => {
  const unhandled: unknown[] = [];
  const listener = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', listener);
  const runtime = createRuntime({
    prepared: prepared({
      constraints: [
        {
          id: 'bad',
          kind: 'external',
          validator: 'bad',
          target: data('/age'),
          watch: [data('/age')],
        },
      ],
    }),
    data: { age: 20 },
    host: {
      validators: {
        bad: () => ({ result: Promise.reject(Error('bad task rejection')), cancel: 42 }) as never,
      },
    },
  });
  try {
    expect((await runtime.validate()).status).toBe('incomplete');
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(unhandled).toEqual([]);
  } finally {
    runtime.dispose();
    process.off('unhandledRejection', listener);
  }
});

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
  watch: [data('/name')],
  target: data('/name'),
};

it('校验在整个 Flush 后启动；根 Schema 不修改输入，独立校验不等待网络', async () => {
  const seen: unknown[] = [],
    task = deferred();
  const runtime = createRuntime({
    prepared: prepared({
      reactions: [
        {
          id: 'r',
          watch: [data('/age')],
          then: [{ op: 'set', target: data('/name'), value: 'final' }],
        },
      ],
      constraints: [
        remote,
        {
          id: 'sync',
          kind: 'internal',
          assert: false,
          issue: { target: data('/age'), code: 'business' },
        },
      ],
    }),
    data: { name: '', age: 1 },
    functions,
    host: {
      validators: {
        check: (input) => {
          seen.push(input.snapshot);
          return task;
        },
      },
    },
  });
  runtime.dispatch({ op: 'set', target: data('/age'), value: 2 });
  expect(seen).toEqual([]);
  await runtime.flush();
  expect(seen).toEqual([{ name: 'final', age: 2 }]);
  expect(runtime.getValidation(data('/name')).status).toBe('pending');
  expect(runtime.getValidation(data('/age')).issues.map((i) => i.code)).toContain('business');
  task.resolve([]);
  await Promise.resolve();
  await runtime.flush();
  expect(runtime.getValidation(data('/name')).status).toBe('valid');
  runtime.dispose();
});
it('前置在后也按本轮重排，业务失败阻断后置，独立规则继续；完整结论 invalid', async () => {
  let calls = 0;
  const runtime = createRuntime({
    prepared: prepared({
      constraints: [
        { ...remote, requires: [{ kind: 'field', target: data('/name'), phase: 'sync' }] },
        {
          id: 'gate',
          kind: 'internal',
          assert: { ref: data('/flag') },
          issue: { target: data('/name'), code: 'gate' },
        },
        {
          id: 'other',
          kind: 'internal',
          assert: false,
          issue: { target: data('/age'), code: 'independent' },
        },
      ],
    }),
    data: { name: 'A', flag: false, age: 2 },
    functions,
    host: {
      validators: {
        check: () => {
          calls++;
          return { result: Promise.resolve([]) };
        },
      },
    },
  });
  const result = await runtime.validate();
  expect(result.status).toBe('invalid');
  expect(calls).toBe(0);
  expect(result.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['gate', 'independent']));
  expect(result.coverage.find((c) => c.ruleId === 'remote')?.status).toBe('blocked');
  runtime.dispatch({ op: 'set', target: data('/flag'), value: true });
  await runtime.flush();
  await Promise.resolve();
  expect(calls).toBe(1);
  runtime.dispose();
});
it('A→B→A 拒绝旧结果；无关字段不撤销独立任务；旧成功与旧异常均无效', async () => {
  const tasks: ReturnType<typeof deferred>[] = [],
    cancelled: number[] = [];
  const runtime = createRuntime({
    prepared: prepared({ constraints: [remote] }),
    data: { name: 'A', age: 1 },
    functions,
    host: {
      validators: {
        check: () => {
          const task = deferred(),
            index = tasks.length;
          tasks.push(task);
          return {
            result: task.result,
            cancel: () => {
              cancelled.push(index);
            },
          };
        },
      },
    },
  });
  await runtime.flush();
  runtime.dispatch({ op: 'set', target: data('/age'), value: 2 });
  await runtime.flush();
  expect(tasks).toHaveLength(1);
  expect(cancelled).toEqual([]);
  for (const name of ['B', 'A']) {
    runtime.dispatch({ op: 'set', target: data('/name'), value: name });
    await runtime.flush();
  }
  expect(tasks).toHaveLength(3);
  expect(cancelled).toEqual([0, 1]);
  tasks[0]!.resolve([{ code: 'old' }]);
  tasks[1]!.reject(Error('old failure'));
  tasks[2]!.resolve([{ code: 'current' }]);
  await Promise.resolve();
  await runtime.flush();
  expect(runtime.getValidation(data('/name')).issues.map((i) => i.code)).toEqual(['current']);
  expect(runtime.diagnostics().some((d) => d.kind === 'validator.error')).toBe(false);
  runtime.dispose();
});
it('完整校验等待全部适用异步任务，编辑使旧调用立即 stale，交付快照不追赶', async () => {
  const tasks: ReturnType<typeof deferred>[] = [];
  const runtime = createRuntime({
    prepared: prepared({ constraints: [remote] }),
    data: { name: 'A' },
    functions,
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
  const full = runtime.validate();
  runtime.dispatch({ op: 'set', target: data('/name'), value: 'B' });
  expect(await full).toMatchObject({ status: 'stale', snapshot: { name: 'A' } });
  await runtime.flush();
  tasks.at(-1)!.resolve([]);
  await Promise.resolve();
  const next = runtime.validate();
  tasks.at(-1)!.resolve([]);
  expect(await next).toMatchObject({ status: 'valid', snapshot: { name: 'B' } });
  runtime.dispose();
});
it('缺少 Validator / 求值异常为 incomplete，Schema 与业务错误保留独立来源', async () => {
  const runtime = createRuntime({
    prepared: prepared({
      constraints: [
        remote,
        {
          id: 'internal',
          kind: 'internal',
          assert: false,
          issue: { target: data('/name'), code: 'rule' },
        },
      ],
    }),
    data: { name: '' },
    functions,
  });
  const result = await runtime.validate();
  expect(result.status).toBe('incomplete');
  expect(result.issues.map((i) => i.source)).toEqual(
    expect.arrayContaining(['schema', expect.stringContaining('internal')]),
  );
  runtime.dispose();
});
it('Context 替换撤销旧资格，调用始终读取捕获的 Context；销毁后不发布迟到结果', async () => {
  const calls: Array<{ context: unknown; task: ReturnType<typeof deferred> }> = [];
  const runtime = createRuntime({
    prepared: prepared({ constraints: [remote] }),
    data: { name: 'A' },
    context: { region: 'JP' },
    functions,
    host: {
      validators: {
        check: (input) => {
          const task = deferred();
          calls.push({ context: input.context, task });
          return task;
        },
      },
    },
  });
  await runtime.flush();
  runtime.replaceContext({ region: 'SG' });
  await runtime.flush();
  expect(calls.map((c) => c.context)).toEqual([{ region: 'JP' }, { region: 'SG' }]);
  calls[0]!.task.resolve([{ code: 'old-context' }]);
  calls[1]!.task.resolve([]);
  await Promise.resolve();
  expect(runtime.getValidation(data('/name')).status).toBe('valid');
  const full = runtime.validate();
  runtime.dispose();
  expect((await full).status).toBe('stale');
  calls.at(-1)!.task.reject(Error('late'));
  await Promise.resolve();
});
it('逐结果一致发布，issues 未变但 status 改变触发显式 Validation Reaction', async () => {
  const task = deferred(),
    events: unknown[] = [];
  const watch = { source: 'validation' as const, field: data('/name'), observe: 'status' as const };
  const runtime = createRuntime({
    prepared: prepared({
      constraints: [remote],
      reactions: [
        {
          id: 'ready',
          watch: [watch],
          when: { op: 'core.eq', args: [{ ref: watch }, 'valid'] },
          then: [{ type: 'host.emit', event: 'ready', payload: { $expr: { ref: watch } } }],
        },
      ],
    }),
    data: { name: 'A' },
    functions,
    host: {
      validators: { check: () => task },
      events: {
        ready: (input) => {
          events.push(input.payload);
        },
      },
    },
  });
  const issues: unknown[] = [],
    statuses: unknown[] = [];
  runtime.observe([{ ...watch, observe: 'issues' }], () => {
    issues.push(runtime.getValidation(data('/name')));
  });
  runtime.observe([watch], () => {
    statuses.push(runtime.getValidation(data('/name')).status);
  });
  await runtime.flush();
  task.resolve([]);
  await Promise.resolve();
  await runtime.flush();
  expect(issues).toEqual([]);
  expect(statuses).toEqual(['pending', 'valid']);
  expect(events).toEqual(['valid']);
  runtime.dispose();
});
it('pending 发布回调同步写回后，旧任务不启动，新输入仍完成本轮校验', async () => {
  const names: unknown[] = [];
  const runtime = createRuntime({
    prepared: prepared({ constraints: [remote] }),
    data: { name: 'A' },
    functions,
    host: {
      validators: {
        check: (input) => {
          names.push(input.read(data('/name')).value);
          return { result: Promise.resolve([]) };
        },
      },
    },
  });
  let changed = false;
  runtime.observe([{ source: 'validation', field: data('/name'), observe: 'status' }], () => {
    if (!changed && runtime.getValidation(data('/name')).status === 'pending') {
      changed = true;
      runtime.dispatch({ op: 'set', target: data('/name'), value: 'B' });
    }
  });
  await runtime.flush();
  await Promise.resolve();
  await runtime.flush();
  expect(names).toEqual(['B']);
  expect(runtime.getValidation(data('/name')).status).toBe('valid');
  runtime.dispose();
});
it('前置规则别名不同仍绑定同一稳定成员；移动后异步读取旧快照，Issue 跟随成员', async () => {
  const inputs: Array<{ read: () => unknown; task: ReturnType<typeof deferred> }> = [];
  const runtime = createRuntime({
    prepared: prepared({
      constraints: [
        {
          id: 'gate',
          kind: 'internal',
          scope: { from: data('/rows'), as: 'person', mode: 'each' },
          assert: { op: 'core.gte', args: [{ ref: data('/age', 'person') }, 18] },
          issue: { target: data('/name', 'person'), code: 'age' },
        },
        {
          id: 'remote',
          kind: 'external',
          validator: 'check',
          scope: { from: data('/rows'), as: 'row', mode: 'each' },
          watch: [data('/name', 'row')],
          target: data('/name', 'row'),
          requires: [{ kind: 'constraint', constraintId: 'gate' }],
        },
      ],
    }),
    data: {
      rows: [
        { age: 20, name: 'A' },
        { age: 10, name: 'B' },
      ],
    },
    functions,
    host: {
      validators: {
        check: (input) => {
          const task = deferred();
          inputs.push({ read: () => input.read(data('/name', 'row')).value, task });
          return task;
        },
      },
    },
  });
  await runtime.flush();
  expect(inputs).toHaveLength(1);
  const [a] = runtime.bind({ from: data('/rows'), as: 'row', mode: 'each' });
  runtime.dispatch(
    {
      op: 'array.move',
      target: data('/rows'),
      item: { $scope: 'row' },
      position: { kind: 'index', index: 1 },
    },
    a,
  );
  await runtime.flush();
  expect(inputs).toHaveLength(1);
  expect(inputs[0]!.read()).toBe('A');
  inputs[0]!.task.resolve([{ code: 'remote-A' }]);
  await Promise.resolve();
  expect(runtime.getValidation(data('/rows/1/name')).issues.map((i) => i.code)).toEqual([
    'remote-A',
  ]);
  expect(runtime.getValidation(data('/rows/0/name')).issues.map((i) => i.code)).toEqual(['age']);
  runtime.dispose();
});
it('前置错误在另一个字段时，后置字段被阻断而非通过；stale 证据不混入新输入的问题', async () => {
  const task = deferred();
  const runtime = createRuntime({
    prepared: prepared({
      constraints: [
        {
          id: 'gate',
          kind: 'internal',
          assert: { ref: data('/flag') },
          issue: { target: data('/age'), code: 'gate' },
        },
        { ...remote, requires: [{ kind: 'constraint', constraintId: 'gate' }] },
      ],
    }),
    data: { name: 'A', age: 1, flag: false },
    functions,
    host: { validators: { check: () => task } },
  });
  await runtime.flush();
  expect(runtime.getValidation(data('/name')).status).toBe('blocked');
  runtime.dispose();
  const next = createRuntime({
    prepared: prepared({ constraints: [remote] }),
    data: { name: 'A' },
    functions,
    host: { validators: { check: () => task } },
  });
  const full = next.validate();
  next.dispatch({ op: 'set', target: data('/name'), value: '' });
  await next.flush();
  const result = await full;
  expect(result.status).toBe('stale');
  expect(result.issues).toEqual([]); // The empty new name was never part of the captured input.
  next.dispose();
  task.resolve([]);
});

it('新输入状态通知中发起完整校验，不再被上一条 Command 后续失效撤销', async () => {
  const tasks: ReturnType<typeof deferred>[] = [];
  const runtime = createRuntime({
    prepared: prepared({ constraints: [remote] }),
    data: { name: 'A' },
    functions,
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
  tasks[0]!.resolve([]);
  await Promise.resolve();
  let proof: ReturnType<typeof runtime.validate> | undefined,
    started = false;
  runtime.observe([{ source: 'validation', field: data('/name'), observe: 'status' }], () => {
    if (!started && runtime.getValidation(data('/name')).status === 'unverified') {
      started = true;
      proof = runtime.validate();
    }
  });
  runtime.dispatch({ op: 'set', target: data('/name'), value: 'B' });
  await runtime.flush();
  expect(tasks).toHaveLength(2);
  tasks[1]!.resolve([]);
  expect((await proof!).status).toBe('valid');
  runtime.dispose();
});

it('取消回调同步写回后，不再用取消前捕获的旧输入启动 Validator', async () => {
  const names: unknown[] = [];
  let changed = false;
  const runtime: ReturnType<typeof createRuntime> = createRuntime({
    prepared: prepared({ constraints: [remote] }),
    data: { name: 'A' },
    functions,
    host: {
      validators: {
        check: (input) => {
          names.push(input.read(data('/name')).value);
          return {
            result: new Promise(() => {}),
            cancel: () => {
              if (!changed) {
                changed = true;
                runtime.dispatch({ op: 'set', target: data('/name'), value: 'B' });
              }
            },
          };
        },
      },
    },
  });
  await runtime.flush();
  const proof = runtime.validate();
  runtime.dispatch({ op: 'set', target: data('/name'), value: 'intermediate' });
  expect((await proof).status).toBe('stale');
  await runtime.flush();
  expect(names).toEqual(['A', 'B']);
  runtime.dispose();
});
