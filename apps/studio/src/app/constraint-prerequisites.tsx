import type { ValidationPrerequisite } from '@form-engine/protocol/definition';
import type { JsonNode } from '../components/json/model';
import { StudioSelect } from '../components/ui/select';
import { addPrerequisite } from './constraint-model';
import { child, type Model } from './semantic-model';

export function ConstraintPrerequisites({
  model,
  node,
  current,
  apply,
  disabled,
}: {
  model: Model;
  node: JsonNode;
  current: ValidationPrerequisite[];
  apply: (text: string) => void;
  disabled: boolean;
}) {
  const used = new Set(
    current.flatMap((entry) => (entry.kind === 'constraint' ? [entry.constraintId] : [])),
  );
  const nodes = child(model.root, 'constraints')?.children ?? [];
  const candidates = nodes.flatMap((candidate) => {
    const id = model.str(child(candidate, 'id'));
    if (
      candidate === node ||
      !id ||
      used.has(id) ||
      model.str(child(candidate, 'kind')) !== 'internal'
    )
      return [];
    return [id];
  });
  return (
    <StudioSelect
      aria-label="添加需先通过的内部规则"
      aria-describedby="constraint-prerequisite-help"
      value=""
      disabled={disabled || !candidates.length}
      onValueChange={(id) => {
        if (candidates.includes(id))
          apply(addPrerequisite(model, node, { kind: 'constraint', constraintId: id }));
      }}
    >
      <option value="" disabled>
        {candidates.length ? '添加内部规则' : '暂无可添加的内部规则'}
      </option>
      {candidates.map((id) => (
        <option key={id} value={id}>
          {id}
        </option>
      ))}
    </StudioSelect>
  );
}
