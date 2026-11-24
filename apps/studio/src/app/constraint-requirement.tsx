import type { DataReference, Expression } from '@form-engine/protocol/definition';
import { FieldPickerControl, fieldReferenceId, referenceFieldRows } from './field-picker';
import { type ReactionField, watchLabel } from './reaction-fields';
import { StudioSelect } from '../components/ui/select';

function dataField(expr?: Expression) {
  return expr && typeof expr === 'object' && 'ref' in expr && expr.ref.source === 'data'
    ? expr.ref
    : undefined;
}

function call(expr: Expression | undefined, name: string) {
  return expr && typeof expr === 'object' && 'op' in expr && expr.op === name
    ? expr.args
    : undefined;
}

function operands(expr: Expression) {
  const required = dataField(call(expr, 'text.isNonBlank')?.[0]);
  if (required) return { field: required };
  const args = call(expr, 'core.ne');
  const dates = args?.[1] === null && call(args[0], 'date.inclusiveDays');
  if (!dates) return;
  const other = dataField(dates[0]),
    field = dataField(dates[1]);
  if (other && field) return { field, other };
}

export function commonRequirement(expr: Expression, fields: ReactionField[]) {
  const rule = operands(expr);
  if (!rule) return;
  const label = (ref: DataReference) =>
    fields.find((f) => fieldReferenceId(f.ref) === fieldReferenceId(ref))?.title ?? watchLabel(ref);
  return label(rule.field) + (rule.other ? ' 不早于 ' + label(rule.other) : '必须填写');
}

export function ConstraintRequirement({
  expr,
  fields,
  change,
  custom,
}: {
  expr: Expression;
  fields: ReactionField[];
  change: (expr: Expression) => void;
  custom: () => void;
}) {
  const current = operands(expr);
  const strings = fields.filter(
    (f) =>
      f.schema && typeof f.schema === 'object' && 'type' in f.schema && f.schema.type === 'string',
  );
  const dates = strings.filter(
    (f) =>
      f.schema &&
      typeof f.schema === 'object' &&
      'format' in f.schema &&
      f.schema.format === 'date',
  );
  function write(field: DataReference, other?: DataReference) {
    change(
      other
        ? {
            op: 'core.ne',
            args: [{ op: 'date.inclusiveDays', args: [{ ref: other }, { ref: field }] }, null],
          }
        : { op: 'text.isNonBlank', args: [{ ref: field }] },
    );
  }
  function picker(
    label: string,
    choices: ReactionField[],
    ref: DataReference,
    select: (r: DataReference) => void,
  ) {
    return (
      <FieldPickerControl
        label={label}
        rows={referenceFieldRows(choices)}
        value={fieldReferenceId(ref)}
        valueLabel={watchLabel(ref)}
        onChange={(id) => {
          const chosen = choices.find((f) => fieldReferenceId(f.ref) === id);
          if (chosen) select(chosen.ref);
        }}
      />
    );
  }
  return (
    <div className="constraint-requirement">
      <label>
        校验要求
        <StudioSelect
          aria-label="校验要求"
          value={current ? (current.other ? 'dates' : 'required') : 'custom'}
          onValueChange={(value) => {
            if (value === 'custom') custom();
            else if (value === 'dates' && dates.length >= 2) write(dates[1]!.ref, dates[0]!.ref);
            else if (strings[0]) write(strings[0].ref);
          }}
        >
          <option value="custom">自定义表达式</option>
          <option value="required" disabled={!strings.length}>
            文本必填
          </option>
          <option value="dates" disabled={dates.length < 2}>
            结束日期不早于开始日期
          </option>
        </StudioSelect>
      </label>
      <small>
        {current
          ? current.other
            ? '两个日期都有效，且结束日期等于或晚于开始日期时通过。'
            : '所选字段包含至少一个非空白字符时通过。'
          : '表达式的结果为真时通过。'}
      </small>
      {current &&
        picker(
          current.other ? '结束日期' : '必填字段',
          current.other
            ? dates.filter((f) => fieldReferenceId(f.ref) !== fieldReferenceId(current.other!))
            : strings,
          current.field,
          (r) => write(r, current.other),
        )}
      {current?.other &&
        picker(
          '开始日期',
          dates.filter((f) => fieldReferenceId(f.ref) !== fieldReferenceId(current.field)),
          current.other,
          (r) => write(current.field, r),
        )}
    </div>
  );
}
