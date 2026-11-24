import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const layoutSource = ts.transpileModule(
  readFileSync(
    new URL('../../packages/devtools/src/client/graph-layout.ts', import.meta.url),
    'utf8',
  ),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const { layoutGraph } = await import(
  'data:text/javascript;base64,' + Buffer.from(layoutSource).toString('base64')
);
import { compile } from '../../packages/compiler/dist/index.js';
import { createRuntime } from '../../packages/runtime/dist/development/index.js';
import { getDevtoolsHook } from '../../packages/runtime/dist/development/devtools/index.js';
import { createCoreFunctions } from '../../packages/pure-functions/dist/index.js';

// 已构建产物的可复现测量；不导入 UI，也不把采样内存误称进程真实峰值。
const members = Number(process.argv[2] ?? 50);
const rounds = Number(process.argv[3] ?? 10);
if (![members, rounds].every((value) => Number.isSafeInteger(value) && value > 0 && value <= 1000))
  throw Error(
    'usage: node tools/engineering/measure-observation.mjs [members 1..1000] [rounds 1..1000]',
  );
if (!process.argv[4]) {
  const runs = ['disconnected', 'subscribed', 'selected'].map((mode) => {
    const child = spawnSync(
      process.execPath,
      [process.argv[1], String(members), String(rounds), mode],
      { encoding: 'utf8' },
    );
    if (child.status !== 0) throw Error(child.stderr || child.stdout);
    return JSON.parse(child.stdout);
  });
  console.log(
    JSON.stringify(
      {
        environment: runs[0].environment,
        limitations: runs[0].limitations,
        results: runs.flatMap((run) => run.results),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
globalThis.window = globalThis;
const artifact = { id: 'observation-measure', platform: 'web', digest: `sha256:${'1'.repeat(64)}` };
const functions = createCoreFunctions(artifact);
const data = (path, scope) => ({ source: 'data', path, ...(scope ? { scope } : {}) });
const scope = { from: data('/insured'), as: 'person', mode: 'each' };
const compiled = compile({
  definition: {
    protocolVersion: 'test',
    id: 'observation-measure',
    version: '1',
    data: {
      schema: {
        type: 'object',
        properties: {
          applicant: { type: 'object', properties: { age: { type: 'number' } } },
          insured: {
            type: 'array',
            items: {
              type: 'object',
              properties: { age: { type: 'number' }, eligible: { type: 'boolean' } },
            },
          },
        },
      },
    },
    reactions: [
      {
        id: 'copy-age',
        scope,
        watch: [data('/applicant/age')],
        then: [
          {
            op: 'set',
            target: data('/age', 'person'),
            value: { $expr: { ref: data('/applicant/age') } },
          },
        ],
      },
      {
        id: 'eligibility',
        scope,
        watch: [data('/age', 'person')],
        then: [{ op: 'set', target: data('/eligible', 'person'), value: true }],
      },
    ],
    constraints: [
      {
        id: 'remote',
        scope,
        kind: 'external',
        validator: 'remote',
        target: data('/age', 'person'),
        watch: [data('/age', 'person')],
      },
    ],
    views: { main: { material: 'empty' } },
  },
  catalog: {
    id: 'measure',
    materials: { empty: { manifest: { id: 'empty', version: '1' }, artifact } },
    pureFunctions: Object.fromEntries(
      Object.entries(functions).map(([id, binding]) => [
        id,
        { manifest: binding.manifest, artifact: binding.artifact },
      ]),
    ),
  },
});
if (!compiled.success) throw Error(JSON.stringify(compiled.diagnostics));
let requestId = 0;
const query = (command) =>
  getDevtoolsHook().request({ ...command, version: 2, requestId: String(++requestId) }).result;
const results = [];
for (const mode of [process.argv[4]]) {
  const runtime = createRuntime({
    prepared: compiled.prepared,
    data: {
      applicant: { age: 20 },
      insured: Array.from({ length: members }, () => ({ age: 0, eligible: false })),
    },
    functions,
    host: { validators: { remote: () => Promise.resolve([]) } },
  });
  await runtime.flush();
  await Promise.resolve();
  await runtime.flush();
  const producer = query({ op: 'discover' }).producers.find((p) => p.kind === 'runtime').ref;
  let snapshotBytes = 0,
    eventBytes = 0,
    eventCount = 0,
    dropped = 0;
  const unsubscribe =
    mode === 'disconnected'
      ? undefined
      : getDevtoolsHook().subscribe((push) => {
          eventBytes += Buffer.byteLength(JSON.stringify(push));
          if (push.kind === 'events') {
            eventCount += push.events.length;
            dropped += push.dropped;
          }
        });
  let target, revision;
  let maxSnapshotRows = 0;
  const snapshot = () => {
    const open = query({ op: 'openObservation', producer });
    if (open.status !== 'ok') throw Error(open.status);
    target = { producer, sessionId: open.sessionId };
    revision = open.revision;
    let cursor;
    let rows = 0;
    do {
      const page = query({
        op: 'readSnapshotPage',
        ...target,
        snapshotId: open.snapshotId,
        ...(cursor ? { cursor } : {}),
      });
      if (page.status !== 'ok') throw Error(page.status);
      rows += page.rows.length;
      snapshotBytes += Buffer.byteLength(JSON.stringify(page));
      cursor = page.nextCursor;
    } while (cursor);
    maxSnapshotRows = rows;
  };
  if (mode === 'selected') snapshot();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const durations = [];
  let sampledHeapPeak = process.memoryUsage().heapUsed;
  for (let round = 0; round < rounds; round++) {
    const started = performance.now();
    runtime.dispatch({ op: 'set', target: data('/applicant/age'), value: 21 + round });
    await runtime.flush();
    await Promise.resolve();
    await runtime.flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (mode === 'selected') {
      const changes = query({ op: 'readMetadataChanges', ...target, baseRevision: revision });
      if (changes.status !== 'ok') throw Error(changes.status);
      revision = changes.revision;
      snapshotBytes += Buffer.byteLength(JSON.stringify(changes));
    }
    durations.push(performance.now() - started);
    sampledHeapPeak = Math.max(sampledHeapPeak, process.memoryUsage().heapUsed);
  }
  if (target) query({ op: 'closeObservation', ...target });
  const nodes = Array.from({ length: 120 }, (_, index) => ({
    id: String(index),
    label: String(index),
    kind: 'reaction',
    parent: `member:${Math.floor(index / 3)}`,
  }));
  const edges = nodes
    .slice(1)
    .map((node, index) => ({ from: String(index), to: node.id, kind: 'cause' }));
  const layoutDurations = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    layoutGraph(nodes, edges, false);
    layoutDurations.push(performance.now() - start);
  }
  unsubscribe?.();
  runtime.dispose();
  results.push({
    mode,
    members,
    rounds,
    durationMs: {
      mean: durations.reduce((a, b) => a + b, 0) / rounds,
      max: Math.max(...durations),
    },
    snapshotBytes,
    eventBytes,
    eventCount,
    dropped,
    sampledHeapPeakBytes: sampledHeapPeak,
    processPeakRssBytes: process.resourceUsage().maxRSS * 1024,
    maxSnapshotRows,
    layout120NodesMs: {
      mean: layoutDurations.reduce((a, b) => a + b, 0) / layoutDurations.length,
      max: Math.max(...layoutDurations),
    },
    localBudgetPassed:
      Math.max(...durations) < 1000 &&
      Math.max(...layoutDurations) < 50 &&
      process.resourceUsage().maxRSS * 1024 < 512 * 1024 * 1024 &&
      dropped === 0,
  });
}
console.log(
  JSON.stringify(
    {
      environment: {
        node: process.version,
        platform: platform(),
        arch: arch(),
        cpu: cpus()[0]?.model,
      },
      limitations: [
        '每种模式独立进程，包含启动/JIT/GC成本；本机回归预算不是跨设备保证',
        'RSS为独立进程真实高水位；heapUsed仅每轮采样；不包含浏览器进程',
        'selected模式初次快照后每轮读取版本增量；布局测量真实算法的120节点可见夹具，不含浏览器绘制',
      ],
      results,
    },
    null,
    2,
  ),
);

if (results.some((result) => !result.localBudgetPassed)) process.exitCode = 1;
