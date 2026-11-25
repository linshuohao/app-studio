'use client';
import { useMemo, useState } from 'react';
import { Button, Feedback } from '@form-engine/studio-design-components/controls';
import { Modal } from './modal';
import { compareAgentDraft } from './agent-merge-model';
import { displayJson } from './format-json';
import './agent-merge.css';

type Props = {
  base: string;
  current: string;
  candidate: string;
  onApply: (text: string) => void;
  onClose: () => void;
};

const labels = {
  current: '保留手工修改',
  candidate: '采用候选改动',
  both: '双方修改一致',
  conflict: '需要选择',
};

export function AgentMerge({ base, current, candidate, onApply, onClose }: Props) {
  const result = useMemo(() => {
    try {
      return { plan: compareAgentDraft(base, current, candidate) };
    } catch (e) {
      return {
        error:
          e instanceof RangeError
            ? e.message
            : '无法可靠对比配置。请检查 JSON 是否有效，并移除重复属性。',
      };
    }
  }, [base, current, candidate]);
  type Choices = Map<string, 'current' | 'candidate'>;
  const [selection, setSelection] = useState<{ result: typeof result; choices: Choices }>();
  const choices = selection?.result === result ? selection.choices : new Map();
  const plan = result.plan;
  const unresolved = plan?.rows.filter(
    (row) => row.status === 'conflict' && !choices.has(row.path),
  ).length;
  return (
    <Modal
      title="对比候选与当前工作稿"
      size="wide"
      onClose={onClose}
      actions={
        <Button
          disabled={!plan || !!unresolved}
          onClick={() => plan && onApply(plan.apply(choices))}
        >
          应用到当前工作稿
        </Button>
      }
    >
      {!plan ? (
        <Feedback kind="error">{result.error}</Feedback>
      ) : (
        <>
          <p role="status">
            {plan.rows.length
              ? '配置差异 ' + plan.rows.length + ' 项，待选择 ' + unresolved + ' 项。'
              : '候选与工作稿配置一致。'}
          </p>
          {plan.rows.map((row) => (
            <section className="agent-merge-row" key={row.path} aria-label={row.path || '整份配置'}>
              <strong>{row.path || '整份配置'}</strong> · {labels[row.status]}
              <dl>
                {[
                  ['共同起点', row.base],
                  ['当前工作稿', row.current],
                  ['Agent 候选', row.candidate],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>
                      <pre>{value === undefined ? '（无此项）' : displayJson(value).trimEnd()}</pre>
                    </dd>
                  </div>
                ))}
              </dl>
              {row.status === 'conflict' && (
                <fieldset>
                  <legend>选择应用值</legend>
                  {(['current', 'candidate'] as const).map((branch) => (
                    <label key={branch}>
                      <input
                        type="radio"
                        name={'merge' + row.path}
                        checked={choices.get(row.path) === branch}
                        onChange={() =>
                          setSelection({ result, choices: new Map(choices).set(row.path, branch) })
                        }
                      />
                      {branch === 'current' ? '保留手工值' : '采用候选值'}
                    </label>
                  ))}
                </fieldset>
              )}
            </section>
          ))}
        </>
      )}
    </Modal>
  );
}
