import type { FormRuntime } from '@form-engine/runtime';

const expenses = { source: 'data', path: '/expenses' } as const;

export function addPreviewExpense(runtime: FormRuntime) {
  const current = runtime.read(expenses);
  if (current.kind === 'error') return '无法读取报销明细。';
  const rows = current.kind === 'missing' ? [] : current.value;
  if (!Array.isArray(rows)) return '无法新增报销明细：expenses 不是数组。';
  const length = rows.length;
  if (length >= 40) return '报销明细最多 40 条。';

  const row = { expenseId: crypto.randomUUID() };
  const result = runtime.dispatch(
    current.kind === 'missing'
      ? { op: 'set', target: expenses, value: { $literal: [row] } }
      : {
          op: 'array.insert',
          target: expenses,
          position: { kind: 'index', index: length },
          value: { $literal: row },
        },
  );
  return result.ok && result.changed ? '' : '无法新增报销明细。';
}
