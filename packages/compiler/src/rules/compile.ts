import type { Constraint, FormDefinition } from '@form-engine/protocol/definition';
import type {
  PreparedConstraint,
  PreparedReaction,
  PreparedPrerequisite,
  DataWatch,
  HostValidatorRequirement,
} from '@form-engine/protocol/prepared';
import type { HostContract } from '@form-engine/protocol/capability';
import { rootEnvironment, type LexicalEnvironment } from '../analysis/reference/environment.js';
import { mergeWatch } from '../analysis/reference/watch.js';
import { ValueCompiler } from '../analysis/value/compile.js';
import { at } from '../common/pointer.js';
import { own } from '../common/object.js';
import { checkCommand } from './command.js';

interface RuleEntry {
  rule: Constraint;
  env: LexicalEnvironment;
  prepared: PreparedConstraint;
  pointer: string;
}

/** 规则只解释共享的类型 / 读取事实；前置关系用于静态传递，不输出执行 DAG。 */
export function compileRules(
  definition: FormDefinition,
  values: ValueCompiler,
  host?: HostContract,
) {
  const { expressions } = values;
  const { references, diagnostics, source } = expressions;
  const entries: RuleEntry[] = [];
  const byId = new Map<string, RuleEntry>();
  const ids = new Set<string>();
  const validators = new Map<string, HostValidatorRequirement>();
  const duplicate = (id: string, pointer: string) => {
    if (ids.has(id))
      diagnostics.error('RULE_ID_DUPLICATE', source(pointer), `Duplicate rule id ${id}.`);
    ids.add(id);
  };
  for (const [index, rule] of (definition.constraints ?? []).entries()) {
    const pointer = at('/constraints', index);
    duplicate(rule.id, at(pointer, 'id'));
    const { scope, ...shared } = rule;
    const bound = references.bind(scope, rootEnvironment(), at(pointer, 'scope'));
    const reads = expressions.boolean(rule.when, bound.env, at(pointer, 'when'));
    let watch: DataWatch[];
    if (rule.kind === 'internal') {
      references.resolve(rule.issue.target, bound.env, at(at(pointer, 'issue'), 'target'));
      watch = mergeWatch(reads, expressions.boolean(rule.assert, bound.env, at(pointer, 'assert')));
    } else {
      references.resolve(rule.target, bound.env, at(pointer, 'target'));
      rule.watch.forEach((item, i) =>
        references.resolve(item, bound.env, at(at(pointer, 'watch'), i)),
      );
      watch = mergeWatch(rule.watch, reads);
      const contract =
        host?.validators && own(host.validators, rule.validator)
          ? host.validators[rule.validator]
          : undefined;
      if (host && !contract)
        diagnostics.error(
          'HOST_VALIDATOR_NOT_FOUND',
          source(at(pointer, 'validator')),
          `No Host validator ${rule.validator}.`,
        );
      const requirement = validators.get(rule.validator) ?? {
        name: rule.validator,
        constraintIds: [],
        ...(contract ? { contractVersion: contract.contractVersion } : {}),
      };
      requirement.constraintIds.push(rule.id);
      validators.set(rule.validator, requirement);
    }
    const prepared = {
      ...shared,
      ...(bound.scope ? { scope: bound.scope } : {}),
      watch,
    } as PreparedConstraint;
    const entry = { rule, env: bound.env, prepared, pointer };
    entries.push(entry);
    if (!byId.has(rule.id)) byId.set(rule.id, entry);
  }

  // 把目标规则局部别名映射到消费方同一实例模式；缺少模式意味着不能唯一绑定。
  function translate(
    reference: DataWatch,
    target: RuleEntry,
    consumer: RuleEntry,
    pointer: string,
  ): DataWatch | undefined {
    if (reference.scope === undefined) return reference;
    const address = JSON.parse(references.identity(reference, target.env)) as unknown[];
    const candidates: Array<{ alias?: string; path: unknown[] }> = [...consumer.env.scopes].map(
      ([alias, binding]) => ({ alias, path: JSON.parse(binding.identity) as unknown[] }),
    );
    candidates.push({ path: [] });
    candidates.sort((a, b) => b.path.length - a.path.length);
    for (const candidate of candidates)
      if (candidate.path.every((part, i) => JSON.stringify(part) === JSON.stringify(address[i]))) {
        const suffix = address.slice(candidate.path.length);
        if (suffix.every((part): part is string => typeof part === 'string')) {
          const shared = { ...reference };
          delete shared.scope;
          return {
            ...shared,
            path: suffix
              .map((part) => '/' + part.replaceAll('~', '~0').replaceAll('/', '~1'))
              .join(''),
            ...(candidate.alias !== undefined ? { scope: candidate.alias } : {}),
          };
        }
      }
    diagnostics.error(
      'PREREQUISITE_SCOPE_AMBIGUOUS',
      source(pointer),
      `Cannot bind ${target.rule.id} in the current Scope.`,
    );
    return undefined;
  }
  function uniquelyBound(target: RuleEntry, consumer: RuleEntry, pointer: string): boolean {
    for (const [alias] of target.env.scopes)
      if (!translate({ source: 'data', scope: alias, path: '' }, target, consumer, pointer))
        return false;
    return true;
  }
  const active = new Set<string>(),
    completed = new Set<string>();
  function prepare(entry: RuleEntry): void {
    if (completed.has(entry.rule.id)) return;
    if (active.has(entry.rule.id)) {
      diagnostics.error(
        'PREREQUISITE_CYCLE',
        source(at(entry.pointer, 'requires')),
        `Prerequisite cycle through ${entry.rule.id}.`,
      );
      return;
    }
    if (active.size >= 128) {
      diagnostics.error(
        'PREREQUISITE_BUDGET_EXCEEDED',
        source(entry.pointer),
        'Prerequisite chain exceeds the analysis depth budget.',
      );
      return;
    }
    active.add(entry.rule.id);
    const inherited: DataWatch[] = [];
    const requires: PreparedPrerequisite[] = [];
    for (const [index, requirement] of (entry.rule.requires ?? []).entries()) {
      const location = at(at(entry.pointer, 'requires'), index);
      const targets: RuleEntry[] = [];
      if (requirement.kind === 'constraint') {
        const target = byId.get(requirement.constraintId);
        if (!target)
          diagnostics.error(
            'PREREQUISITE_NOT_FOUND',
            source(location),
            `Unknown constraint ${requirement.constraintId}.`,
          );
        else targets.push(target);
        requires.push(requirement);
      } else {
        references.resolve(requirement.target, entry.env, at(location, 'target'));
        const targetIdentity = references.identity(requirement.target, entry.env);
        const targetAddress = JSON.parse(targetIdentity) as unknown[];
        for (const candidate of entries) {
          if (candidate.rule.kind !== 'internal') continue;
          const identity = references.identity(candidate.rule.issue.target, candidate.env);
          if (identity === targetIdentity) targets.push(candidate);
          else {
            // 静态下标可能落在 each 规则上，不能漏掉该规则后伪装成“没有 Internal 前置”。
            const pattern = JSON.parse(identity) as unknown[];
            if (
              pattern.length === targetAddress.length &&
              pattern.every(
                (part, i) =>
                  JSON.stringify(part) === JSON.stringify(targetAddress[i]) ||
                  (typeof part === 'object' &&
                    part !== null &&
                    typeof targetAddress[i] === 'string' &&
                    /^(0|[1-9]\d*)$/.test(targetAddress[i] as string)),
              )
            )
              diagnostics.error(
                'PREREQUISITE_SCOPE_AMBIGUOUS',
                source(location),
                'A fixed array index cannot bind an each rule to a stable member instance.',
              );
          }
        }
        requires.push({
          ...requirement,
          constraintIds: targets.map((item) => item.rule.id).sort(),
        });
        // 局部断言可观察目标字段；跨字段条件 / 未知影响回退根域，仍保留完整根校验。
        inherited.push(
          expressions.models.fieldChecksAreLocal()
            ? requirement.target
            : { source: 'data', path: '' },
        );
      }
      for (const target of targets) {
        if (target.rule.kind !== 'internal') {
          diagnostics.error(
            'PREREQUISITE_EXTERNAL',
            source(location),
            'A synchronous prerequisite cannot target an External Constraint.',
          );
          continue;
        }
        if (!uniquelyBound(target, entry, location)) continue;
        prepare(target);
        for (const item of target.prepared.watch) {
          const mapped = translate(item, target, entry, location);
          if (mapped) inherited.push(mapped);
        }
      }
    }
    if (entry.rule.requires !== undefined) entry.prepared.requires = requires;
    entry.prepared.watch = mergeWatch(entry.prepared.watch, inherited);
    active.delete(entry.rule.id);
    completed.add(entry.rule.id);
  }
  entries.forEach(prepare);
  const reactions: PreparedReaction[] = (definition.reactions ?? []).map((rule, index) => {
    const pointer = at('/reactions', index);
    duplicate(rule.id, at(pointer, 'id'));
    const { scope, ...shared } = rule;
    const bound = references.bind(scope, rootEnvironment(), at(pointer, 'scope'));
    rule.watch.forEach((item, i) =>
      references.resolve(item, bound.env, at(at(pointer, 'watch'), i)),
    );
    expressions.boolean(rule.when, bound.env, at(pointer, 'when'));
    rule.then.forEach((command, i) =>
      checkCommand(command, bound.env, at(at(pointer, 'then'), i), values),
    );
    return {
      ...shared,
      ...(bound.scope ? { scope: bound.scope } : {}),
      runOnActivate: rule.runOnActivate ?? false,
      watch: rule.watch,
    };
  });
  return {
    constraints: entries.map((entry) => entry.prepared),
    reactions,
    validators: [...validators.values()]
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map((item) => ({ ...item, constraintIds: item.constraintIds.sort() })),
  };
}
