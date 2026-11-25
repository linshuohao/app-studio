import Ajv2020 from 'ajv/dist/2020';
import definitionSchema from '@form-engine/protocol/schemas/form-definition.schema.json';
import type { Constraint, ValidationPrerequisite } from '@form-engine/protocol/definition';
import type { PreparedConstraint } from '@form-engine/protocol/prepared';
import { compactJson } from '../components/json/format';
import type { JsonNode } from '../components/json/model';
import { appendItems } from './reaction-model';
import { platform } from './platform-api';
import { child, semanticModel, type Model } from './semantic-model';

const ajv = new Ajv2020({ strict: false, validateFormats: false });
ajv.addSchema(definitionSchema);
const validate = ajv.getSchema<Constraint>(definitionSchema.$id + '#/$defs/Constraint')!;

export function readConstraint(raw: string): Constraint {
  if (semanticModel(raw).ambiguous.size) throw Error('规则有重复属性，请在 JSON 中修复。');
  const value: unknown = JSON.parse(raw);
  if (!validate(value)) throw Error('规则结构需要修复：' + ajv.errorsText(validate.errors));
  return value as Constraint;
}

export function addPrerequisite(model: Model, node: JsonNode, value: ValidationPrerequisite) {
  const list = child(node, 'requires');
  const raw = JSON.stringify(value);
  return list ? appendItems(model, list, [raw]) : model.property(node, 'requires', '[' + raw + ']');
}

export type ConstraintDiagnostic = { code: string; message: string; sourcePointer: string };
export async function checkConstraints(
  formPath: string,
  profile: string,
  text: string,
  signal?: AbortSignal,
) {
  const result = await platform<{
    diagnostics: (ConstraintDiagnostic & { severity: string })[];
  }>(formPath + '/check', {
    signal,
    body: { text: compactJson(text), ...(profile && { profile }) },
  });
  return result.diagnostics.filter((item) => item.severity === 'error');
}

export async function checkConstraintChange(
  formPath: string,
  profile: string,
  before: string,
  next: string,
  accepts: (item: ConstraintDiagnostic) => boolean,
  signal?: AbortSignal,
) {
  const candidate = (await checkConstraints(formPath, profile, next, signal)).filter(accepts);
  if (!candidate.length) return [];
  const diagnosisKey = (model: Model, { code, message, sourcePointer }: ConstraintDiagnostic) => {
    const owner = sourcePointer.match(/^(\/constraints\/\d+)(.*)$/);
    const rule = owner && model.byPath.get(owner[1]!);
    const id = rule && model.str(child(rule, 'id'));
    // A removed rule shifts subsequent indices. Match the surviving owner and relative path.
    return JSON.stringify([code, message, id ? [id, owner![2]] : sourcePointer]);
  };
  const beforeModel = semanticModel(before);
  const afterModel = semanticModel(next);
  const baseline = (await checkConstraints(formPath, profile, before, signal))
    .filter(accepts)
    .map((item) => diagnosisKey(beforeModel, item));
  return candidate.filter((item) => {
    const index = baseline.indexOf(diagnosisKey(afterModel, item));
    if (index < 0) return true;
    baseline.splice(index, 1);
    return false;
  });
}

export function referencingRules(model: Model, id: string) {
  return (child(model.root, 'constraints')?.children ?? []).flatMap((rule) =>
    (child(rule, 'requires')?.children ?? []).flatMap((req) =>
      model.str(child(req, 'kind')) === 'constraint' && model.str(child(req, 'constraintId')) === id
        ? [{ path: req.path, id: model.str(child(rule, 'id')) ?? rule.path }]
        : [],
    ),
  );
}

export async function previewConstraintChange(
  formPath: string,
  profile: string,
  before: string,
  next: string,
) {
  const preview = (text: string) =>
    platform<{
      diagnostics: (ConstraintDiagnostic & { severity: string })[];
      prepared?: { definition: { constraints?: PreparedConstraint[] } };
    }>(formPath + '/preview', {
      body: { text: compactJson(text), ...(profile && { profile }) },
    });
  const candidate = await preview(next);
  const diagnostics = candidate.diagnostics.filter((item) => item.severity === 'error');
  if (!candidate.prepared) return { diagnostics, bindingChanges: [] };
  const baseline = await preview(before);
  const prior = new Map(
    baseline.prepared?.definition.constraints?.map((rule) => [rule.id, rule.requires]),
  );
  const bindingChanges = (candidate.prepared.definition.constraints ?? []).flatMap((rule) =>
    prior.has(rule.id) && JSON.stringify(prior.get(rule.id)) !== JSON.stringify(rule.requires)
      ? [rule.id]
      : [],
  );
  return { diagnostics, bindingChanges };
}
