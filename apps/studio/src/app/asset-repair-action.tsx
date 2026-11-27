'use client';

import { useState } from 'react';
import { Button, Feedback } from '@form-engine/studio-design-components/controls';
import { StudioSelect } from '@form-engine/studio-design-components/select';
import type { AssetRepairReview } from './agent-conversation';
import { Modal } from './modal';
import { failureMessage, platform } from './platform-api';
import { studioUrl } from './studio-location';

export function AssetRepairAction({ diagnosticId, candidates }: AssetRepairReview) {
  const [trigger, setTrigger] = useState<HTMLElement>();
  const [selected, setSelected] = useState('');
  const [task, setTask] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const target = selected === '' ? undefined : candidates[Number(selected)];

  async function create() {
    if (!target || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await platform<{ id: string }>(
        '/diagnostics/events/' + encodeURIComponent(diagnosticId) + '/asset-repairs',
        { body: { kind: target.kind, assetId: target.lock.id } },
      );
      setTask(result.id);
      setTrigger(undefined);
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  if (!candidates.length) return null;
  if (task) return <a href={studioUrl({ page: 'asset-repairs', task })}>打开资产修复任务</a>;
  return (
    <>
      <Button
        variant="secondary"
        onClick={(event) => {
          setSelected(candidates.length === 1 ? '0' : '');
          setError('');
          setTrigger(event.currentTarget);
        }}
      >
        创建资产修复任务
      </Button>
      {trigger && (
        <Modal
          title="创建资产修复任务"
          size="standard"
          returnFocus={trigger}
          closeDisabled={busy}
          onClose={() => setTrigger(undefined)}
          actions={
            <Button variant="primary" disabled={!target || busy} onClick={() => void create()}>
              确认创建任务
            </Button>
          }
        >
          <p>选择需要开发核查的原发布资产。</p>
          <StudioSelect
            aria-label="选择关联资产"
            value={selected}
            onValueChange={setSelected}
            disabled={busy}
          >
            <option value="">选择资产</option>
            {candidates.map(({ kind, lock }, index) => (
              <option key={kind + ':' + lock.id} value={String(index)}>
                {lock.id} · {lock.version}
              </option>
            ))}
          </StudioSelect>
          {target && (
            <p>
              <code>{target.lock.artifact.digest}</code>
            </p>
          )}
          {error && <Feedback kind="error">{error}</Feedback>}
        </Modal>
      )}
    </>
  );
}
