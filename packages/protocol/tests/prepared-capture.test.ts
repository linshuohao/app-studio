import { expect, it, vi } from 'vitest';
import {
  capturePreparedForm,
  isCapturedPreparedForm,
  PreparedStructureError,
} from '../src/internal/prepared.js';

const input = () => ({
  preparedFormatVersion: 'test',
  build: { compilerVersion: 'test', catalogSnapshotId: 'catalog', profile: 'only' },
  definition: {
    protocolVersion: 'test',
    id: 'form',
    version: '1',
    data: { schema: true },
    views: { only: { id: 'node', material: 'input' } },
  },
  resources: { schemas: {}, requestSchemas: {} },
  capabilityLock: { pureFunctions: {}, materials: {} },
  hostRequirements: { validators: [], events: [], requests: [] },
});
it('只复用检查入口产生的深度只读产物，外部克隆与冻结不携带凭据', () => {
  const source = input();
  const captured = capturePreparedForm(source);
  expect(captured).not.toBe(source);
  expect(isCapturedPreparedForm(source)).toBe(false);
  expect(isCapturedPreparedForm(captured)).toBe(true);
  expect(capturePreparedForm(captured)).toBe(captured);
  expect(Object.isFrozen(source.definition)).toBe(false);
  expect(Object.isFrozen(captured.definition.views)).toBe(true);
  source.definition.id = 'changed';
  expect(captured.definition.id).toBe('form');
  const clone = Object.freeze(structuredClone(captured));
  expect(isCapturedPreparedForm(clone)).toBe(false);
  expect(capturePreparedForm(clone)).not.toBe(clone);
});
it('非法结构或带访问器的伪制品不登记，getter 不被执行', () => {
  const getter = vi.fn(() => 'form');
  const malformed = input();
  Object.defineProperty(malformed.definition, 'id', { get: getter, enumerable: true });
  expect(() => capturePreparedForm(malformed)).toThrow('accessor');
  expect(getter).not.toHaveBeenCalled();
  expect(isCapturedPreparedForm(malformed)).toBe(false);
  const invalid = { ...input(), trusted: true };
  expect(() => capturePreparedForm(invalid)).toThrow(PreparedStructureError);
  expect(isCapturedPreparedForm(invalid)).toBe(false);
});
