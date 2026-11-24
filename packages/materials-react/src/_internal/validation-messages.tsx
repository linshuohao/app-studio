import type { ValueValidation } from './types.js';
const statuses = {
  unverified: '尚未校验',
  pending: '校验中',
  valid: '当前字段有效',
  invalid: '请检查当前字段',
  incomplete: '校验未完成',
  blocked: '前置条件未满足',
};
/** Render the Adapter's already published projection; never starts or owns validation. */
export function ValidationMessages({
  validation,
  issuesLabel,
}: {
  validation: ValueValidation;
  issuesLabel: string;
}) {
  return (
    <>
      <p className="fe-status" role="status">
        {statuses[validation.status]}
      </p>
      {validation.issues.length ? (
        <ul className="fe-issues" aria-label={issuesLabel}>
          {validation.issues.map((issue, i) => (
            <li key={`${issue.source}:${issue.code}:${i}`}>{issue.message || '此项未通过校验'}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
