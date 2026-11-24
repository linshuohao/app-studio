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
    <label className="layout-value-source">
      <span>取值方式</span>
      <select
        aria-label={label + '来源'}
        value={value}
        onChange={(e) => onChange(e.target.value as ValueSource)}
      >
        <option value="literal">固定值</option>
        <option value="field" disabled={!canReadField}>
          读取字段
        </option>
        <option value="expression">表达式</option>
        <option value="quoted">JSON 字面量</option>
      </select>
    </label>
  );
}
