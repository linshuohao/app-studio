import Ajv2020 from 'ajv/dist/2020';
import definitionSchema from '@form-engine/protocol/schemas/form-definition.schema.json';
import type { Reaction, ReactionAction, ReactionWatch } from '@form-engine/protocol/definition';
import { reactionReads, watchLabel, scopeBinders } from './reaction-fields';
import { semanticModel, type Model } from './semantic-model';
export { removeLayoutMember as removeItem } from './layout-material-value';
import type { JsonNode } from '../components/json/model';

const validator = new Ajv2020({ strict: false, validateFormats: false });
validator.addSchema(definitionSchema);
const ruleSchema = validator.getSchema<Reaction>(definitionSchema.$id + '#/$defs/Reaction')!;

const actionSchema = validator.getSchema<ReactionAction>(
  definitionSchema.$id + '#/$defs/ReactionAction',
)!;
export function readAction(raw: string): ReactionAction {
  if (semanticModel(raw).ambiguous.size) throw Error('动作含重复属性，请打开原文修复。');
  const action: unknown = JSON.parse(raw);
  if (!actionSchema(action))
    throw Error('动作配置不完整：' + validator.errorsText(actionSchema.errors));
  return action as ReactionAction;
}

export function readRule(raw: string): Reaction {
  const model = semanticModel(raw);
  if (model.ambiguous.size) throw Error('规则含重复属性，请打开原文修复。');
  const rule: unknown = JSON.parse(raw);
  if (!ruleSchema(rule)) throw Error('规则结构无效：' + validator.errorsText(ruleSchema.errors));
  const checked = rule as Reaction;
  if (!checked.id.trim()) throw Error('请填写规则名称。');
  return checked;
}

export function appendItems(m: Model, list: JsonNode, items: string[]) {
  if (list.kind !== 'array') throw Error('目标必须为数组。');
  return m.replace(
    list,
    m.raw(list).slice(0, -1) + (list.children?.length ? ',' : '') + items.join(',') + ']',
  );
}

export function reorder(m: Model, list: JsonNode, from: number, to: number) {
  const nodes = list.children ?? [];
  if (!nodes[from] || !nodes[to]) throw Error('动作位置已变化。');
  const items = nodes.map((n) => m.raw(n));
  items.splice(to, 0, ...items.splice(from, 1));
  // Replace only value spans. The separators and whitespace belong to the array.
  const raw = m.raw(list);
  let cursor = 0;
  const fragments = nodes.map((node, i) => {
    const original = m.raw(node);
    const start = raw.indexOf(original, cursor);
    const separator = raw.slice(cursor, start);
    cursor = start + original.length;
    return separator + items[i];
  });
  return m.replace(list, fragments.join('') + raw.slice(cursor));
}

export function searchableRule(rule: Reaction, named: unknown) {
  const terms = [rule.id];
  const add = (ref: ReactionWatch) => terms.push(watchLabel(ref));
  scopeBinders(rule.scope).forEach((b) => {
    add(b.from);
    terms.push(b.as);
  });
  rule.watch.forEach(add);
  reactionReads(rule.when, 'expression', named).forEach(add);
  function targets(action: ReactionAction) {
    if ('target' in action) add(action.target);
    if ('op' in action && action.op === 'batch') action.commands.forEach(targets);
  }
  rule.then.forEach((a) => {
    targets(a);
    reactionReads(a, 'action', named).forEach(add);
  });
  return terms.join(' ').toLocaleLowerCase();
}
