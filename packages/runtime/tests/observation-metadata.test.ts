import { expect, it } from 'vitest';
import { metadataDifference } from '../src/devtools/observation-metadata.js';
import { sharedPreparedCatalog } from '../src/devtools/observation-definition.js';
import { prepared } from './fixtures.js';
it('重复诊断与滚动窗口保留各次现场，不与节点身份冲突', () => {
  const rows = Array.from({ length: 100 }, () => ({
    record: 'diagnostic',
    nodeId: 'same',
    code: 'ERROR',
  }));
  const first = metadataDifference([], rows);
  expect(new Set(first.order).size).toBe(100);
  expect(() =>
    metadataDifference(rows, [
      ...rows.slice(1),
      { record: 'diagnostic', nodeId: 'same', code: 'NEXT' },
    ]),
  ).not.toThrow();
});
it('共享定义按接管对象身份复用，相同业务 id 的独立产物不能合并', () => {
  const form = prepared({});
  const budget = { maxRows: 5000, maxVisits: 20000, maxDepth: 64, maxTextBytes: 200000 };
  expect(sharedPreparedCatalog(form, budget)).toBe(sharedPreparedCatalog(form, budget));
  expect(sharedPreparedCatalog(prepared({}), budget).preparedId).not.toBe(
    sharedPreparedCatalog(form, budget).preparedId,
  );
});
