import { expect, it } from 'vitest';
import { createRuntime, type RuntimeDiagnosticReport } from '../src/index.js';
import { data, functions, prepared } from './fixtures.js';
import { Journal } from '../src/diagnostics/journal.js';

const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

it('观察回调写回后抛错保留回调入口，通知熔断记录实际停止时输入', async () => {
  const runtime = createRuntime({
    prepared: prepared(),
    data: { age: 0, total: 0 },
    maxExecutions: 2,
  });
  await runtime.flush();
  runtime.observe([data('/age')], () => {
    runtime.dispatch({ op: 'set', target: data('/total'), value: 2 });
    throw Error('observer failed');
  });
  runtime.dispatch({ op: 'set', target: data('/age'), value: 1 });
  expect(
    runtime.diagnostics().find((e) => e.kind === 'observer.error')?.evidence?.input.snapshot,
  ).toEqual({ age: 1, total: 0 });
  runtime.dispose();
  const looping = createRuntime({ prepared: prepared(), data: { age: 0 }, maxExecutions: 2 });
  await looping.flush();
  looping.observe([data('/age')], () =>
    looping.dispatch({
      op: 'set',
      target: data('/age'),
      value: (looping.snapshot() as { age: number }).age + 1,
    }),
  );
  looping.dispatch({ op: 'set', target: data('/age'), value: 1 });
  expect(
    looping.diagnostics().find((e) => e.kind === 'notification.aborted')?.evidence?.input.snapshot,
  ).toEqual(looping.snapshot());
  looping.dispose();
});

it('前置内部规则异常不继承后置外部规则的Validator身份', async () => {
  const runtime = createRuntime({
    prepared: prepared({
      constraints: [
        {
          id: 'remote',
          kind: 'external',
          validator: 'check',
          watch: [data('/age')],
          target: data('/age'),
          requires: [{ kind: 'constraint', constraintId: 'gate' }],
        },
        {
          id: 'gate',
          kind: 'internal',
          assert: { op: 'core.gt', args: [{ ref: data('/age') }, 0] },
          issue: { target: data('/age'), code: 'gate' },
        },
      ],
    }),
    data: { age: '-' },
    functions,
  });
  const result = await runtime.validate();
  const error = result.diagnostics.find((entry) => entry.kind === 'validation.error');
  expect(error?.evidence?.execution.ruleId).toBe('gate');
  expect(error?.evidence?.execution.validator).toBeUndefined();
  expect(result.status).toBe('incomplete');
  runtime.dispose();
});

it('Trace关闭后熔断仍有完整现场，且诊断出口失败可查询', async () => {
  const reports: RuntimeDiagnosticReport[] = [];
  const runtime = createRuntime({
    prepared: prepared({
      reactions: [
        { id: 'loop', watch: [data('/age')], then: [{ type: 'host.emit', event: 'loop' }] },
      ],
    }),
    data: { age: 0 },
    functions,
    traceCapacity: 0,
    maxExecutions: 2,
    host: {
      events: {
        loop: () =>
          runtime.dispatch({
            op: 'set',
            target: data('/age'),
            value: (runtime.snapshot() as { age: number }).age + 1,
          }),
      },
    },
    onDiagnostic: (report) => reports.push(report),
  });
  await runtime.flush();
  runtime.dispatch({ op: 'set', target: data('/age'), value: 1 });
  expect((await runtime.flush()).status).toBe('aborted');
  await tick();
  expect(
    reports.some(
      (r) =>
        r.kind === 'runtime' &&
        r.entry.kind === 'flush.aborted' &&
        r.entry.evidence?.input.snapshot,
    ),
  ).toBe(true);
  runtime.dispose();
  const failing = createRuntime({
    prepared: prepared(),
    data: {},
    functions,
    traceCapacity: 0,
    onDiagnostic: () => {
      throw Error('sink failed');
    },
  });
  failing.dispatch({ op: 'set', target: data('/absent/child'), value: 1 });
  await tick();
  expect(failing.diagnostics().some((e) => e.kind === 'diagnostic.output.error')).toBe(true);
  failing.dispose();
});

it('Host同步失败记录前序动作后的输入及实际通知参数', async () => {
  const runtime = createRuntime({
    prepared: prepared({
      reactions: [
        {
          id: 'send',
          watch: [data('/age')],
          then: [
            { op: 'set', target: data('/total'), value: 2 },
            {
              type: 'host.emit',
              event: 'send',
              payload: { total: { $expr: { ref: data('/total') } } },
            },
          ],
        },
      ],
    }),
    data: { age: 0, total: 0 },
    functions,
    host: {
      events: {
        send: () => {
          throw Error('send failed');
        },
      },
    },
  });
  await runtime.flush();
  runtime.dispatch({ op: 'set', target: data('/age'), value: 1 });
  await runtime.flush();
  expect(
    runtime.diagnostics().find((e) => e.kind === 'reaction.action.error')?.evidence,
  ).toMatchObject({
    input: { snapshot: { age: 1, total: 2 } },
    parameters: { event: 'send', payload: { total: 2 } },
  });
  runtime.dispose();
});

it('关闭辅助Trace仍交付完整Reaction错误现场，包含成员、配置和触发输入', async () => {
  const reports: RuntimeDiagnosticReport[] = [];
  const runtime = createRuntime({
    prepared: prepared({
      reactions: [
        {
          id: 'guard',
          scope: { from: data('/rows'), as: 'row', mode: 'each' },
          watch: [data('/age', 'row')],
          when: { op: 'core.gt', args: [{ ref: data('/age', 'row') }, 0] },
          then: [{ op: 'set', target: data('/total', 'row'), value: 1 }],
        },
      ],
    }),
    functions,
    data: { name: 'whole form', rows: [{ age: 20, total: 0 }] },
    context: { permission: 1 },
    traceCapacity: 0,
    onDiagnostic: (report) => reports.push(report),
  });
  await runtime.flush();
  const [row] = runtime.bind({ from: data('/rows'), as: 'row', mode: 'each' });
  runtime.dispatch({ op: 'set', target: data('/age', 'row'), value: '-' }, row);
  await runtime.flush();
  await tick();
  const error = reports
    .flatMap((r) => (r.kind === 'runtime' ? [r.entry] : []))
    .find((e) => e.kind === 'reaction.error');
  expect(error?.evidence).toMatchObject({
    phase: 'when',
    execution: { ruleId: 'guard' },
    input: {
      snapshot: { name: 'whole form', rows: [{ age: '-', total: 0 }] },
      context: { permission: 1 },
      scope: row,
      scopePaths: { row: '/rows/0' },
    },
    prepared: { definition: { id: 'runtime-cases' } },
  });
  expect(error?.evidence?.triggers.length).toBeGreaterThan(0);
  runtime.dispatch({ op: 'set', target: data('/name'), value: 'later' });
  expect(error?.evidence?.input.snapshot).toMatchObject({ name: 'whole form' });
  expect(runtime.diagnostics()).toEqual([]);
  runtime.dispose();
});

it('异步Validator失败使用调用时完整输入，错误报告带独立能力名', async () => {
  const reports: RuntimeDiagnosticReport[] = [];
  let reject!: (error: Error) => void;
  const result = new Promise<readonly []>((_resolve, fail) => {
    reject = fail;
  });
  const runtime = createRuntime({
    prepared: prepared({
      constraints: [
        {
          id: 'remote-rule',
          kind: 'external',
          validator: 'registered-check',
          target: data('/age'),
          watch: [data('/age')],
        },
      ],
    }),
    data: { age: 20, name: 'before' },
    context: { permission: 1 },
    traceCapacity: 0,
    host: { validators: { 'registered-check': () => ({ result }) } },
    onDiagnostic: (r) => reports.push(r),
  });
  await runtime.flush();
  runtime.dispatch({ op: 'set', target: data('/name'), value: 'after' });
  await runtime.flush();
  reject(Error('offline'));
  await tick();
  await tick();
  const error = reports
    .flatMap((r) => (r.kind === 'runtime' ? [r.entry] : []))
    .find((e) => e.kind === 'validator.error');
  expect(error?.evidence).toMatchObject({
    execution: { ruleId: 'remote-rule', validator: 'registered-check' },
    input: { snapshot: { age: 20, name: 'before' }, context: { permission: 1 } },
    error: { name: 'Error', message: 'offline' },
  });
  expect(runtime.getValidation(data('/age')).status).toBe('incomplete');
  runtime.dispose();
});

it('完整校验只关联本次诊断，不附上之前失败命令的实例尾部', async () => {
  const runtime = createRuntime({ prepared: prepared(), data: { age: 20 } });
  await runtime.flush();
  runtime.dispatch({ op: 'set', target: data('/absent/child'), value: 1 });
  expect(runtime.diagnostics().some((e) => e.kind === 'command.error')).toBe(true);
  const result = await runtime.validate();
  expect(result.status).toBe('valid');
  expect(result.diagnostics.some((e) => e.kind === 'command.error')).toBe(false);
  runtime.dispose();
});

it('完整调用复用旧任务，不触发取消副作用', async () => {
  let calls = 0,
    cancels = 0,
    finish!: (issues: readonly []) => void;
  const result = new Promise<readonly []>((resolve) => {
    finish = resolve;
  });
  const runtime = createRuntime({
    prepared: prepared({
      constraints: [
        {
          id: 'remote',
          kind: 'external',
          validator: 'check',
          target: data('/age'),
          watch: [data('/age')],
        },
      ],
    }),
    data: { age: 20 },
    host: {
      validators: {
        check: () => {
          calls++;
          return {
            result,
            cancel: () => {
              cancels++;
              throw Error('cancel failed');
            },
          };
        },
      },
    },
  });
  await runtime.flush();
  const full = runtime.validate();
  expect(calls).toBe(1);
  expect(cancels).toBe(0);
  finish([]);
  const proof = await full;
  expect(proof.status).toBe('valid');
  expect(proof.diagnostics.some((entry) => entry.kind === 'validator.cancel.error')).toBe(false);
  runtime.dispose();
});

it('Reaction部分命令成功后的错误保留失败动作输入和整次调用入口', async () => {
  const reports: RuntimeDiagnosticReport[] = [];
  const runtime = createRuntime({
    prepared: prepared({
      reactions: [
        {
          id: 'mixed',
          watch: [data('/age')],
          then: [
            { op: 'set', target: data('/total'), value: 2 },
            { op: 'set', target: data('/absent/child'), value: 3 },
          ],
        },
      ],
    }),
    data: { age: 1, total: 0 },
    onDiagnostic: (r) => reports.push(r),
  });
  await runtime.flush();
  runtime.dispatch({ op: 'set', target: data('/age'), value: 2 });
  await runtime.flush();
  await tick();
  const error = reports
    .flatMap((r) => (r.kind === 'runtime' ? [r.entry] : []))
    .find((e) => e.kind === 'command.error');
  expect(error?.evidence).toMatchObject({
    execution: { ruleId: 'mixed' },
    input: { snapshot: { age: 2, total: 2 } },
    invocationInput: { snapshot: { age: 2, total: 0 } },
    action: { op: 'set', target: { path: '/absent/child' } },
  });
  runtime.dispose();
});

it('轮次 Journal 只能封存一次，封存后的报告与来源均只读', () => {
  const source = Object.freeze({ sequence: 1, kind: 'data.change' });
  const journal = new Journal(2, [source]);
  journal.record(Object.freeze({ sequence: 2, kind: 'flush.start', round: 1 }));
  const report = journal.finish({ round: 1, status: 'settled', executions: 0 });
  expect(report.triggeredBy).toEqual([{ sequence: 1 }]);
  expect(report.entries).toEqual([source, { sequence: 2, kind: 'flush.start', round: 1 }]);
  expect(Object.isFrozen(report.outcome)).toBe(true);
  expect(Object.isFrozen(report.triggeredBy[0])).toBe(true);
  expect(() => journal.record(source)).toThrow('closed');
  expect(() => journal.finish(report.outcome)).toThrow('closed');
});

it('开始前销毁不产生虚假轮次，执行中销毁仍报告真实轮次及执行次数', async () => {
  const beforeReports: RuntimeDiagnosticReport[] = [];
  const before = createRuntime({
    prepared: prepared(),
    data: {},
    functions,
    onDiagnostic: (r) => beforeReports.push(r),
  });
  before.dispose();
  expect((await before.flush()).status).toBe('disposed');
  await tick();
  expect(beforeReports.some((r) => r.kind === 'flush')).toBe(false);

  const duringReports: RuntimeDiagnosticReport[] = [];
  const during = createRuntime({
    prepared: prepared({
      reactions: [
        { id: 'stop', watch: [data('/age')], then: [{ type: 'host.emit', event: 'stop' }] },
      ],
    }),
    data: { age: 0 },
    functions,
    host: { events: { stop: () => during.dispose() } },
    onDiagnostic: (r) => duringReports.push(r),
  });
  await during.flush();
  during.dispatch({ op: 'set', target: data('/age'), value: 1 });
  const outcome = await during.flush();
  await tick();
  expect(outcome).toMatchObject({ round: 2, status: 'disposed', executions: 1 });
  expect(
    duringReports.some(
      (r) => r.kind === 'flush' && r.outcome.round === 2 && r.outcome.status === 'disposed',
    ),
  ).toBe(true);
});

it('未触发联动的异步校验事件不冒充以后其他交互的调度来源', async () => {
  const reports: RuntimeDiagnosticReport[] = [];
  let finish!: (issues: readonly []) => void;
  const result = new Promise<readonly []>((resolve) => {
    finish = resolve;
  });
  const runtime = createRuntime({
    prepared: prepared({
      constraints: [
        {
          id: 'remote',
          kind: 'external',
          validator: 'check',
          target: data('/age'),
          watch: [data('/age')],
        },
      ],
    }),
    data: { age: 1 },
    functions,
    host: { validators: { check: () => ({ result }) } },
    onDiagnostic: (r) => reports.push(r),
  });
  await runtime.flush();
  finish([]);
  await tick();
  const asynchronousChange = runtime
    .diagnostics()
    .find((e) => e.kind === 'validation.change' && e.origin);
  expect(asynchronousChange).toBeDefined();
  runtime.dispatch({ op: 'set', target: data('/name'), value: 'next' });
  const outcome = await runtime.flush();
  await tick();
  const next = reports.find((r) => r.kind === 'flush' && r.outcome.round === outcome.round);
  expect(
    next?.kind === 'flush' &&
      next.triggeredBy.some((origin) => origin.sequence === asynchronousChange!.sequence),
  ).toBe(false);
  runtime.dispose();
});

it('取消旧校验失败仍关联旧任务，而不是新轮次', async () => {
  const runtime = createRuntime({
    prepared: prepared({
      constraints: [
        {
          id: 'remote',
          kind: 'external',
          validator: 'check',
          target: data('/age'),
          watch: [data('/age')],
        },
      ],
    }),
    data: { age: 1 },
    functions,
    host: {
      validators: {
        check: () => ({
          result: new Promise(() => {}),
          cancel: () => {
            throw Error('cancel failed');
          },
        }),
      },
    },
  });
  const launched = await runtime.flush();
  runtime.dispatch({ op: 'set', target: data('/age'), value: 2 });
  await runtime.flush();
  const error = runtime.diagnostics().find((e) => e.kind === 'validator.cancel.error');
  expect(error?.round).toBeUndefined();
  expect(error?.origin?.round).toBe(launched.round);
  runtime.dispose();
});

it('异步报告出口拒绝不会形成未处理拒绝或改变业务结果', async () => {
  const runtime = createRuntime({
    prepared: prepared(),
    data: { age: 1 },
    functions,
    onDiagnostic: async () => {
      throw Error('async diagnostic failure');
    },
  });
  expect((await runtime.flush()).status).toBe('settled');
  await tick();
  expect(runtime.diagnostics().some((e) => e.kind === 'diagnostic.output.error')).toBe(true);
  expect(runtime.snapshot()).toEqual({ age: 1 });
  runtime.dispose();
});

it('每轮独立报告，携带调度前来源；完成报告不会随之后的调度改变', async () => {
  const reports: RuntimeDiagnosticReport[] = [];
  const runtime = createRuntime({
    prepared: prepared({
      reactions: [
        {
          id: 'copy',
          watch: [data('/age')],
          then: [{ op: 'set', target: data('/total'), value: 2 }],
        },
      ],
    }),
    data: { age: 0, total: 0 },
    functions,
    onDiagnostic: (report) => reports.push(report),
  });
  await runtime.flush();
  runtime.dispatch({ op: 'set', target: data('/age'), value: 1 });
  runtime.dispatch({ op: 'set', target: data('/age'), value: 2 });
  const second = await runtime.flush();
  await tick();
  const round = reports.find(
    (report) => report.kind === 'flush' && report.outcome.round === second.round,
  );
  expect(round?.kind).toBe('flush');
  if (round?.kind !== 'flush') throw Error('missing flush report');
  const dataTriggers = round.triggeredBy.filter((origin) =>
    round.entries.some(
      (entry) => entry.sequence === origin.sequence && entry.kind === 'data.change',
    ),
  );
  expect(dataTriggers).toHaveLength(2);
  expect(
    round.entries.some(
      (entry) => entry.kind === 'reaction.execute' && entry.round === second.round,
    ),
  ).toBe(true);
  expect(round.entries.filter((entry) => entry.kind === 'flush.start')).toHaveLength(1);
  const snapshot = JSON.stringify(round);
  runtime.dispatch({ op: 'set', target: data('/age'), value: 3 });
  await runtime.flush();
  await tick();
  expect(JSON.stringify(round)).toBe(snapshot);
  expect(Object.isFrozen(round)).toBe(true);
  expect(Object.isFrozen(round.entries)).toBe(true);
  expect(reports.filter((report) => report.kind === 'flush')).toHaveLength(3);
  runtime.dispose();
});

it('轮次外命令错误仍能诊断，不被误归入后续轮次', async () => {
  const reports: RuntimeDiagnosticReport[] = [];
  const runtime = createRuntime({
    prepared: prepared(),
    data: { age: 1 },
    functions,
    onDiagnostic: (r) => reports.push(r),
  });
  await runtime.flush();
  runtime.dispatch({ op: 'set', target: data('/absent/child'), value: 1 });
  runtime.dispatch({ op: 'set', target: data('/age'), value: 2 });
  const outcome = await runtime.flush();
  await tick();
  const error = runtime.diagnostics().find((entry) => entry.kind === 'command.error');
  expect(error).toBeDefined();
  expect(error?.round).toBeUndefined();
  expect(reports.some((report) => report.kind === 'runtime' && report.entry === error)).toBe(true);
  const report = reports.find((r) => r.kind === 'flush' && r.outcome.round === outcome.round);
  expect(report?.kind === 'flush' && report.entries.includes(error!)).toBe(false);
  runtime.dispose();
});

it('Host 迟到异常只关联启动事件，不修改已结束轮次或混入下一轮', async () => {
  const reports: RuntimeDiagnosticReport[] = [];
  let reject!: (reason: Error) => void;
  const result = new Promise<void>((_resolve, fail) => {
    reject = fail;
  });
  const runtime = createRuntime({
    prepared: prepared({
      reactions: [
        { id: 'notify', watch: [data('/age')], then: [{ type: 'host.emit', event: 'quote' }] },
      ],
    }),
    data: { age: 0 },
    functions,
    host: { events: { quote: () => result } },
    onDiagnostic: (r) => reports.push(r),
  });
  await runtime.flush();
  runtime.dispatch({ op: 'set', target: data('/age'), value: 1 });
  const launch = await runtime.flush();
  await tick();
  const launchedReport = reports.find(
    (r) => r.kind === 'flush' && r.outcome.round === launch.round,
  );
  const before = JSON.stringify(launchedReport);
  runtime.dispatch({ op: 'set', target: data('/name'), value: 'new' });
  const next = await runtime.flush();
  reject(Error('late host failure'));
  await tick();
  await tick();
  const error = runtime.diagnostics().find((entry) => entry.kind === 'host.event.error');
  expect(error?.round).toBeUndefined();
  expect(error?.origin?.round).toBe(launch.round);
  expect(error?.origin?.sequence).toBeDefined();
  expect(JSON.stringify(launchedReport)).toBe(before);
  expect(
    reports
      .filter((r) => r.kind === 'flush' && r.outcome.round === next.round)
      .every(
        (r) => r.kind === 'flush' && r.entries.every((entry) => entry.sequence !== error?.sequence),
      ),
  ).toBe(true);
  runtime.dispose();
});

it('外部校验异步结果触发新轮次，保留原任务来源且不延长启动轮次', async () => {
  const reports: RuntimeDiagnosticReport[] = [];
  let finish!: (issues: readonly []) => void;
  const result = new Promise<readonly []>((resolve) => {
    finish = resolve;
  });
  const runtime = createRuntime({
    prepared: prepared({
      constraints: [
        {
          id: 'remote',
          kind: 'external',
          validator: 'check',
          target: data('/age'),
          watch: [data('/age')],
        },
      ],
      reactions: [
        {
          id: 'valid',
          watch: [{ source: 'validation', field: data('/age'), observe: 'status' }],
          when: {
            op: 'core.eq',
            args: [
              { ref: { source: 'validation', field: data('/age'), observe: 'status' } },
              'valid',
            ],
          },
          then: [{ op: 'set', target: data('/total'), value: 1 }],
        },
      ],
    }),
    data: { age: 1, total: 0 },
    functions,
    host: { validators: { check: () => ({ result }) } },
    onDiagnostic: (r) => reports.push(r),
  });
  const launch = await runtime.flush();
  expect(runtime.getValidation(data('/age')).status).toBe('pending');
  finish([]);
  await tick();
  await runtime.flush();
  await tick();
  const next = reports.find(
    (r) =>
      r.kind === 'flush' &&
      r.outcome.round > launch.round &&
      r.entries.some((e) => e.kind === 'reaction.execute'),
  );
  expect(next?.kind).toBe('flush');
  if (next?.kind !== 'flush') throw Error('missing feedback report');
  expect(
    next.entries.some((e) => e.kind === 'validation.change' && e.origin?.round === launch.round),
  ).toBe(true);
  expect(runtime.snapshot()).toEqual({ age: 1, total: 1 });
  runtime.dispose();
});

it('报告回调异常和关闭采集不改变熔断预算及后续交互', async () => {
  for (const traceCapacity of [0, 2]) {
    const reports: RuntimeDiagnosticReport[] = [];
    const runtime = createRuntime({
      prepared: prepared({
        reactions: [
          {
            id: 'loop',
            watch: [data('/age')],
            then: [
              {
                op: 'set',
                target: data('/age'),
                value: { $expr: { op: 'core.add', args: [{ ref: data('/age') }, 1] } },
              },
            ],
          },
        ],
      }),
      data: { age: 0 },
      functions,
      traceCapacity,
      maxExecutions: 3,
      onDiagnostic: (r) => {
        reports.push(r);
        throw Error('diagnostic consumer');
      },
    });
    await runtime.flush();
    runtime.dispatch({ op: 'set', target: data('/age'), value: 1 });
    expect(await runtime.flush()).toMatchObject({ status: 'aborted', executions: 3 });
    await tick();
    const aborted = reports.find((r) => r.kind === 'flush' && r.outcome.status === 'aborted');
    expect(aborted?.kind === 'flush' && aborted.truncated).toBe(true);
    if (aborted?.kind === 'flush')
      expect(aborted.entries.length).toBeLessThanOrEqual(traceCapacity);
    runtime.dispatch({ op: 'set', target: data('/age'), value: 10 });
    expect(await runtime.flush()).toMatchObject({ status: 'aborted', executions: 3 });
    runtime.dispose();
  }
});

it('异常链路从实际触发到失败，保留先成功的动作和当时输入，排除无关命令', async () => {
  const runtime = createRuntime({
    prepared: prepared({
      reactions: [
        {
          id: 'compute',
          watch: [data('/age')],
          then: [
            { op: 'set', target: data('/total'), value: 42 },
            { type: 'host.emit', event: 'fail' },
          ],
        },
      ],
    }),
    data: { age: 0, total: 0, unrelated: 0 },
    functions,
    captureErrorTrace: true,
    host: {
      events: {
        fail: () => {
          throw Error('host failure');
        },
      },
    },
  });
  await runtime.flush();
  runtime.dispatch({ op: 'set', target: data('/unrelated'), value: 1 });
  runtime.dispatch({ op: 'set', target: data('/age'), value: 1 });
  await runtime.flush();
  const trace = runtime.diagnostics().find((entry) => entry.kind === 'reaction.action.error')
    ?.evidence?.trace;
  expect(trace?.status).toBe('complete');
  expect(trace?.steps.at(-1)?.kind).toBe('reaction.action.error');
  expect(
    trace?.steps.filter(({ kind }) => kind === 'data.change').map(({ action }) => action),
  ).toEqual([
    { op: 'set', target: data('/age'), value: 1 },
    { op: 'set', target: data('/total'), value: 42 },
  ]);
  expect(trace?.steps.at(-1)?.input?.snapshot).toMatchObject({ age: 1, total: 42 });
  runtime.dispose();
});
