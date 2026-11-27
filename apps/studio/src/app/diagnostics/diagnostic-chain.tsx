import { CodeBlock } from '../../components/code-block';
import type { ReactNode } from 'react';
import type { DiagnosticTraceStep } from '@form-engine/runtime';
import { diagnosticExplanation } from './diagnostic-explanation';

type ChainDetail = {
  releaseId: string;
  versionId: string;
  errorCode: string;
  phase: string;
  targetId: string | null;
  evidence: unknown;
};

function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  return value as Record<string, unknown>;
}

function fact(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

function Evidence({ label, value }: { label: string; value: unknown }) {
  if (value === undefined) return null;
  return (
    <details className="diagnostic-chain-evidence">
      <summary>{label}</summary>
      <CodeBlock language="json" source={JSON.stringify(value, null, 2)} />
    </details>
  );
}

function Facts({ values }: { values: ReadonlyArray<readonly [string, ReactNode]> }) {
  return (
    <dl className="diagnostic-chain-facts">
      {values.map(
        ([label, value]) =>
          value != null && (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ),
      )}
    </dl>
  );
}

export function DiagnosticSummary({ detail }: { detail: ChainDetail }) {
  const evidence = record(detail.evidence);
  const message = fact(record(evidence?.error)?.message) ?? fact(evidence?.message);
  const { title, next } = diagnosticExplanation(detail.errorCode);
  return (
    <section className="surface authoring-panel diagnostic-summary" aria-label="错误摘要">
      <h2>{title}</h2>
      <Facts
        values={[
          ['错误码', detail.errorCode],
          ['失败阶段', detail.phase],
          ['配置目标', detail.targetId],
          ['异常原文', message],
        ]}
      />
      {!message && (
        <p className="diagnostic-chain-note">本次上报没有记录异常原文，具体原因仍需确认。</p>
      )}
      <p>
        <strong>排查建议</strong> · {next}
      </p>
    </section>
  );
}

export function DiagnosticChain({ detail }: { detail: ChainDetail }) {
  const evidence = record(detail.evidence);
  const execution = record(evidence?.execution);
  const error = record(evidence?.error);
  const prepared = record(evidence?.prepared);
  const triggers: unknown[] = Array.isArray(evidence?.triggers) ? evidence.triggers : [];
  const trace = record(evidence?.trace);
  const steps =
    trace?.version === 1 && Array.isArray(trace.steps)
      ? trace.steps.filter(
          (step): step is DiagnosticTraceStep =>
            typeof record(step)?.kind === 'string' && typeof record(step)?.sequence === 'number',
        )
      : undefined;

  return (
    <section aria-label="执行链路">
      <h2>执行链路</h2>
      <p className="diagnostic-chain-note">
        {steps
          ? trace?.status === 'complete'
            ? '本次错误的触发与执行记录。'
            : '本次链路有缺失或超过采集上限。'
          : evidence
            ? '以下是本次上报记录的证据。完整 Trace 未采集。'
            : '本次错误没有可查看的现场，当前仅显示发布和错误索引。'}
      </p>
      <Facts
        values={[
          ['原发布', detail.releaseId],
          ['配置版本', detail.versionId],
        ]}
      />
      <Evidence
        label="查看构建与能力锁"
        value={prepared && { build: prepared.build, capabilityLock: prepared.capabilityLock }}
      />
      {steps && steps.length > 0 ? (
        <ol className="diagnostic-chain">
          {steps.map((step) => (
            <li key={step.sequence} className={step.error ? 'diagnostic-chain-failure' : undefined}>
              <h3>
                <code>
                  #{step.sequence} {step.kind}
                </code>
              </h3>
              <Facts
                values={[
                  ['轮次', fact(step.round)],
                  ['阶段', fact(step.phase)],
                  ['配置目标', fact(step.execution?.ruleId)],
                  ['启动事件', fact(step.origin?.sequence)],
                  ['异常信息', fact(step.error?.message)],
                ]}
              />
              <Evidence label="查看步骤详情" value={step} />
            </li>
          ))}
        </ol>
      ) : (
        <ol className="diagnostic-chain">
          {evidence && (
            <li>
              <h3>触发来源</h3>
              {triggers.length === 0 && <p>现场未记录触发事件。</p>}
              {triggers.map((value, index) => {
                const trigger = record(value);
                const origin = record(trigger?.origin);
                const sequence = fact(origin?.sequence);
                const round = fact(origin?.round);
                return (
                  <Evidence
                    key={index}
                    label={
                      sequence === undefined
                        ? `触发现场 ${index + 1}`
                        : `事件 #${sequence}${round === undefined ? '' : ` · 轮次 ${round}`}`
                    }
                    value={trigger?.input ?? value}
                  />
                );
              })}
            </li>
          )}
          {evidence &&
            (execution ||
              evidence.input !== undefined ||
              evidence.invocationInput !== undefined) && (
              <li>
                <h3>实际执行</h3>
                <Facts
                  values={[
                    ['执行类别', fact(execution?.kind)],
                    ['执行编号', fact(execution?.id)],
                    ['父执行编号', fact(execution?.parentId)],
                    ['校验调用编号', fact(execution?.callId)],
                    ['配置目标', fact(execution?.ruleId) ?? detail.targetId],
                    ['Host 校验器', fact(execution?.validator)],
                  ]}
                />
                <Evidence label="查看执行输入" value={evidence.input} />
                <Evidence label="查看实际调用输入" value={evidence.invocationInput} />
                <Evidence label="查看失败动作" value={evidence.action} />
                <Evidence label="查看调用参数或结果" value={evidence.parameters} />
              </li>
            )}
          <li className="diagnostic-chain-failure">
            <h3>发生异常</h3>
            <Facts
              values={[
                ['错误码', detail.errorCode],
                ['失败阶段', detail.phase],
                ['异常信息', fact(error?.message) ?? fact(evidence?.message)],
              ]}
            />
            <Evidence label="查看调用栈" value={error?.stack} />
          </li>
        </ol>
      )}
    </section>
  );
}
