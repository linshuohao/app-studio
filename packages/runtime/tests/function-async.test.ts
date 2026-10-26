import { expect, it } from 'vitest';
import { runSourceProcess } from './helpers/source-process.js';

it('误返回 Promise / thenable 同步报错，后续拒绝不泄漏到全局或终止进程', () => {
  const script = `
    import { runInNewContext } from 'node:vm';
    const { Evaluator } = await import(${JSON.stringify(new URL('../src/expression/evaluator.ts', import.meta.url).href)});
    const { DataStore } = await import(${JSON.stringify(new URL('../src/data/store.ts', import.meta.url).href)});
    let returned;
    const evaluator = new Evaluator({}, {
      'app.bad': {
        artifact: { id: 'test', platform: 'web', digest: 'sha256:' + '0'.repeat(64) },
        manifest: { id: 'app.bad', version: '1', parameters: [], returns: true },
        invoke: () => returned,
      },
    });
    const frame = { view: new DataStore({}).capture(), context: {}, scope: {} };
    const evaluate = () => {
      try { return { kind: 'value', value: evaluator.expression({ op: 'app.bad', args: [] }, frame) }; }
      catch (error) { return { kind: 'error', error: String(error) }; }
    };
    const results = [];
    for (const create of [
      () => Promise.resolve(1),
      () => Promise.reject(Error('already rejected')),
      () => new Promise((_, reject) => setImmediate(() => reject(Error('later rejected')))),
      async () => { throw Error('async function failed'); },
      () => runInNewContext('Promise.reject(new Error("foreign rejection"))'),
      () => ({ then(resolve) { resolve(1); } }),
      () => ({ then(_, reject) { reject(Error('thenable rejected')); } }),
      () => ({ then() { throw Error('thenable failed'); } }),
    ]) {
      returned = create();
      results.push(evaluate());
    }
    returned = { then: 1, value: 2 };
    const normal = evaluate();
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    console.log(JSON.stringify({ results, normal }));
  `;
  const child = runSourceProcess(script);
  expect(child.error).toBeUndefined();
  expect(child.status, child.stderr).toBe(0);
  expect(child.stderr).toBe('');
  const output = JSON.parse(child.stdout) as { results: unknown[]; normal: unknown };
  expect(output.results).toEqual(
    Array.from({ length: 8 }, () => ({
      kind: 'error',
      error: 'Error: expression: pure function must return JSON synchronously',
    })),
  );
  expect(output.normal).toEqual({ kind: 'value', value: { then: 1, value: 2 } });
});
