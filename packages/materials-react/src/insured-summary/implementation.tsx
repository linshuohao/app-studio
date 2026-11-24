'use client';
import type { ArtifactIdentity } from '@form-engine/protocol';
import {
  defineMaterial,
  defineMaterialContract,
  useMaterialAdapter,
} from '@form-engine/renderer-react';
import { formatValue } from '../_internal/display-value.js';
import { manifest } from './manifest.js';
export interface InsuredSummaryProps {
  premiumMinor: number | null;
  emptyName?: string;
}
const contract = defineMaterialContract<
  InsuredSummaryProps,
  'insured',
  Record<string, never>,
  Record<string, never>
>(manifest);
const statuses = {
  unverified: '尚未校验',
  pending: '校验中',
  valid: '当前字段聚合有效',
  invalid: '请检查成员字段',
  incomplete: '校验未完成',
  blocked: '前置条件未满足',
};
function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function InsuredSummary() {
  const a = useMaterialAdapter(contract),
    read = a.values.insured,
    validation = a.validation.insured;
  const value = read.kind === 'value' && isObject(read.value) ? read.value : undefined;
  const name =
    typeof value?.name === 'string' && value.name.trim().length
      ? value.name
      : (a.props.emptyName ?? '未填写姓名');
  const age =
    typeof value?.age === 'string' || typeof value?.age === 'number' ? String(value.age) : '—';
  const premium = a.props.premiumMinor;
  return (
    <article className="fe-insured-summary" aria-label={`被保人 ${name}`}>
      <h3>{name}</h3>
      {!value ? <p className="fe-feedback">成员信息尚未提供或格式无效</p> : null}
      <dl>
        <div>
          <dt>年龄</dt>
          <dd>{age}</dd>
        </div>
        <div>
          <dt>试算金额</dt>
          <dd>
            {formatValue({
              value: premium !== null && premium < 0 ? null : premium,
              format: 'moneyMinor',
            })}
          </dd>
        </div>
      </dl>
      <p className="fe-status" role="status">
        {statuses[validation.status]}
      </p>
      {validation.issues.length ? (
        <ul className="fe-issues" aria-label="成员问题">
          {validation.issues.map((issue, i) => (
            <li key={`${issue.source}:${issue.code}:${i}`}>{issue.message || '此项未通过校验'}</li>
          ))}
        </ul>
      ) : null}
      <p className="fe-help">汇总当前字段问题，最终结果以完整校验为准</p>
    </article>
  );
}
export function createInsuredSummary(artifact: ArtifactIdentity) {
  return defineMaterial(contract, artifact, InsuredSummary);
}
