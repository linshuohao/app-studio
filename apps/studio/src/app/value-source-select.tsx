import { StudioSelect } from '@form-engine/studio-design-components/select';

export type ValueSource = 'literal' | 'field' | 'expression' | 'quoted';
export function ValueSourceSelect({
  label,
  value,
  canReadField,
  onChange,
}: {
  label: string;
  value: ValueSource;
  canReadField: boolean;
  onChange: (value: ValueSource) => void;
}) {
  return (
    <div className="layout-value-source">
      <span>取值方式</span>
      <StudioSelect
        aria-label={label + '来源'}
        value={value}
        onValueChange={(next) => onChange(next as ValueSource)}
      >
        <option value="literal">固定值</option>
        <option value="field" disabled={!canReadField}>
          读取字段
        </option>
        <option value="expression">表达式</option>
        <option value="quoted">JSON 字面量</option>
      </StudioSelect>
    </div>
  );
}
