'use client';

import { useRef, useState } from 'react';
import { Button, Feedback } from '@form-engine/studio-design-components/controls';
import { StudioSelect } from '@form-engine/studio-design-components/select';
import type { DiagnosticRepairReview } from './agent-conversation';
import { Modal } from './modal';
import { failureMessage, platform, PlatformError } from './platform-api';
import { studioUrl } from './studio-location';

type Work = { id: string; name: string; head: string | null; published: boolean };

export function AgentDiagnosticRepair({ candidate }: { candidate: DiagnosticRepairReview }) {
  const [returnFocus, setReturnFocus] = useState<HTMLElement>();
  const requestKey = useRef('');
  const [works, setWorks] = useState<Work[]>();
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [savedWork, setSavedWork] = useState<string>();
  const target = works?.find((work) => work.id === selected);
  const form = '/forms/' + encodeURIComponent(candidate.formId);

  async function open(trigger: HTMLElement) {
    setBusy(true);
    setError('');
    try {
      const rows = await platform<Work[]>(form + '/work');
      setReturnFocus(trigger);
      setWorks(rows.filter((work) => !work.published));
      setSelected('');
      setConflict(false);
      requestKey.current = crypto.randomUUID();
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!target || busy || conflict) return;
    setBusy(true);
    setError('');
    try {
      await platform(
        '/diagnostics/events/' + encodeURIComponent(candidate.diagnosticId) + '/apply-repair',
        {
          key: requestKey.current,
          body: {
            workId: target.id,
            expectedHead: target.head,
            releaseId: candidate.releaseId,
            versionId: candidate.versionId,
            candidateDigest: candidate.candidateDigest,
          },
        },
      );
      setSavedWork(target.id);
      setWorks(undefined);
    } catch (reason) {
      const changed = reason instanceof PlatformError && reason.status === 409;
      setConflict(changed);
      setError(changed ? (reason.detail ?? failureMessage(reason)) : failureMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="action-row">
      {savedWork ? (
        <>
          <Feedback kind="status">已保存修复修订。</Feedback>
          <a href={studioUrl({ form: candidate.formId, work: savedWork })}>打开工作版本</a>
        </>
      ) : (
        <Button
          variant="secondary"
          onClick={(event) => void open(event.currentTarget)}
          disabled={busy}
        >
          应用到工作版本
        </Button>
      )}
      {error && !works && <Feedback kind="error">{error}</Feedback>}
      {works && (
        <Modal
          title="应用配置修复"
          size="standard"
          onClose={() => setWorks(undefined)}
          closeDisabled={busy}
          returnFocus={returnFocus}
          actions={
            <Button
              variant="primary"
              disabled={!target || busy || conflict}
              onClick={() => void apply()}
            >
              确认并保存修订
            </Button>
          }
        >
          <p>选择仍使用原配置的工作版本。确认后会新增一条修订。</p>
          {works.length ? (
            <StudioSelect
              aria-label="选择工作版本"
              value={selected}
              onValueChange={(id) => {
                setSelected(id);
                requestKey.current = crypto.randomUUID();
                setConflict(false);
                setError('');
              }}
              disabled={busy}
            >
              <option value="">选择工作版本</option>
              {works.map((work) => (
                <option key={work.id} value={work.id}>
                  {work.name}
                </option>
              ))}
            </StudioSelect>
          ) : (
            <Feedback kind="status">
              请先从原配置创建可编辑的工作版本。{' '}
              <a href={studioUrl({ form: candidate.formId })}>打开表单</a>
            </Feedback>
          )}
          {error && <Feedback kind="error">{error}</Feedback>}
        </Modal>
      )}
    </div>
  );
}
