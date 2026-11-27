import { isDeepStrictEqual } from 'node:util';
import type { CallExpression, Expression } from '@form-engine/protocol/definition';

function call(expression: Expression, op: string): expression is CallExpression {
  return (
    expression !== null &&
    typeof expression === 'object' &&
    'op' in expression &&
    expression.op === op &&
    expression.args.length === 2
  );
}

function numberLiteral(expression: Expression): number | undefined {
  const value =
    expression !== null && typeof expression === 'object' && 'literal' in expression
      ? expression.literal
      : expression;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

type GuardRepair = {
  expression: Expression;
  path: string;
};

/** Move the existing domain check before the division it protects. Keep all other operands in order. */
export function moveDivisionGuard(condition: Expression, path = ''): GuardRepair | undefined {
  if (!call(condition, 'core.and')) return;
  const [predicate, guard] = condition.args as [Expression, Expression];
  if (
    call(predicate, 'core.gt') &&
    numberLiteral(predicate.args[1]!) !== undefined &&
    call(predicate.args[0]!, 'core.div') &&
    call(guard, 'core.ne') &&
    numberLiteral(guard.args[1]!) === 0
  ) {
    const [numerator, denominator] = predicate.args[0]!.args as [Expression, Expression];
    if (
      numberLiteral(numerator) !== undefined &&
      denominator !== null &&
      typeof denominator === 'object' &&
      'ref' in denominator &&
      denominator.ref.source === 'data' &&
      denominator.ref.scope === undefined &&
      isDeepStrictEqual(denominator, guard.args[0])
    ) {
      const after = { ...condition, args: [guard, predicate] };
      return { expression: after, path };
    }
  }

  // Only descend through conjunctions. Moving a check across an OR or a named expression
  // would require reasoning about different execution paths or other consumers.
  for (const [index, argument] of condition.args.entries()) {
    const fix = moveDivisionGuard(argument, path + '/args/' + index);
    if (fix) {
      const args = [...condition.args];
      args[index] = fix.expression;
      return { ...fix, expression: { ...condition, args } };
    }
  }
}
