import { expect, it } from 'vitest';
import { DiagnosticEmitter } from '../src/diagnostics/emitter.js';
const diagnostic = {
  code: 'FAIL',
  phase: 'render' as const,
  formId: 'form',
  profile: 'main',
  message: 'failure',
};
it('提交前诊断完整交付全部消费者，晚订阅不重放已交付记录', () => {
  const emitter = new DiagnosticEmitter();
  for (let i = 0; i < 101; i++) emitter.report(diagnostic);
  let host = 0,
    tool = 0,
    late = 0;
  const stopHost = emitter.subscribe(() => {
    host++;
  });
  const stopTool = emitter.subscribe(() => {
    tool++;
  });
  emitter.flushPending();
  expect(host).toBe(101);
  expect(tool).toBe(101);
  const stopLate = emitter.subscribe(() => {
    late++;
  });
  emitter.flushPending();
  expect(late).toBe(0);
  emitter.report(diagnostic);
  expect(host).toBe(102);
  expect(tool).toBe(102);
  expect(late).toBe(1);
  stopHost();
  stopTool();
  stopLate();
});
it('消费者失败隔离，交付中解除的订阅不再调用', () => {
  const emitter = new DiagnosticEmitter();
  let second = 0;
  let stopSecond: () => void = () => undefined;
  emitter.subscribe(() => {
    stopSecond();
    throw Error('host failed');
  });
  stopSecond = emitter.subscribe(() => {
    second++;
  });
  emitter.report(diagnostic);
  expect(second).toBe(0);
});
