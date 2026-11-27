'use client';

import { useEffect, useState } from 'react';
import { Button, DataTable, type Column } from '@form-engine/studio-design-components';
import { Feedback } from '@form-engine/studio-design-components/controls';
import { JsonEditor } from '../../components/json/json-editor';
import { Modal } from '../modal';
import { PageHeading } from '../page-heading';
import { restorePosition, type ListPosition } from '../studio-location';
import { DiagnosticChain, DiagnosticSummary } from './diagnostic-chain';
import { DiagnosticSnapshot } from './diagnostic-snapshot';
import './diagnostics.css';

type Group = {
  releaseId: string;
  formName: string;
  fingerprint: string;
  source: string;
  phase: string;
  errorCode: string;
  targetId: string | null;
  count: number;
  firstReceivedAt: string;
  lastReceivedAt: string;
};
type Occurrence = { diagnosticId: string; occurredAt: string; evidenceStatus: string };
type Detail = Occurrence & {
  versionId: string;
  formId: string;
  releaseId: string;
  errorCode: string;
  phase: string;
  targetId: string | null;
  evidence: unknown;
};

const diagnosticIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const evidenceStatus: Record<string, string> = {
  expired: '现场已过期',
  missing: '无现场',
  too_large: '现场超出上报限制',
  serialization_failed: '现场保存失败',
};

async function read<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch('/api/platform/diagnostics/' + path, { cache: 'no-store', signal });
  if (response.status === 401 || response.status === 403)
    throw new Error('当前账号无权查看错误记录。');
  if (response.status === 404) throw new Error('该错误记录已不可用。');
  if (!response.ok) throw new Error('无法读取错误记录。');
  return response.json();
}

function useDiagnosticQuery<T>(path: string | undefined, refresh = 0) {
  const [result, setResult] = useState<{
    path: string;
    refresh: number;
    rows?: T;
    error?: string;
  }>();
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    read<T>(path, controller.signal).then(
      (rows) => {
        if (!controller.signal.aborted) setResult({ path, refresh, rows });
      },
      (error: Error) => {
        if (!controller.signal.aborted) setResult({ path, refresh, error: error.message });
      },
    );
    return () => controller.abort();
  }, [path, refresh]);
  return result?.path === path && result?.refresh === refresh ? result : undefined;
}

const keyOf = (group: Group) => `${group.releaseId}/${group.fingerprint}`;
const formatTime = (value: string) => new Date(value).toLocaleString();

export function DiagnosticsWorkspace({
  event,
  group,
  view,
  returnPosition,
  onNavigate,
}: {
  event?: string;
  group?: string;
  view?: string;
  returnPosition?: ListPosition;
  onNavigate: (location: Record<string, string | undefined>, trigger?: HTMLElement) => void;
}) {
  const [refresh, setRefresh] = useState(0);
  const [dialog, setDialog] = useState<{
    kind: 'occurrences' | 'evidence';
    id: string;
    trigger: HTMLElement;
  }>();
  const closeDialog = () => setDialog(undefined);
  const [releaseId, fingerprint] = group?.split('/') ?? [];
  const groupKey =
    releaseId &&
    fingerprint &&
    diagnosticIdPattern.test(releaseId) &&
    /^[a-f0-9]{64}$/.test(fingerprint)
      ? `${releaseId}/${fingerprint}`
      : undefined;
  const subpage = Boolean(event || group);
  const snapshot = view === 'snapshot';
  const list = useDiagnosticQuery<Group[]>(
    groupKey ? `groups?releaseId=${releaseId}` : subpage ? undefined : 'groups',
    refresh,
  );
  const occurrences = useDiagnosticQuery<Occurrence[]>(groupKey && `groups/${groupKey}`);
  const selectedEvent =
    event && diagnosticIdPattern.test(event) ? event : occurrences?.rows?.[0]?.diagnosticId;
  const eventResult = useDiagnosticQuery<Detail>(selectedEvent && `events/${selectedEvent}`);
  const selection = list?.rows?.find((row) => keyOf(row) === groupKey);
  const detail = eventResult?.rows;
  const listReady = Boolean(list);
  useEffect(() => {
    if (subpage || !returnPosition || !listReady) return;
    const key = returnPosition.focus;
    const original = key && document.querySelector('[data-return-focus="' + CSS.escape(key) + '"]');
    return restorePosition(
      original ? returnPosition : { ...returnPosition, focus: 'diagnostic-refresh' },
    );
  }, [listReady, returnPosition, subpage]);

  const navigate = (params: Record<string, string | undefined> = {}, trigger?: HTMLElement) => {
    closeDialog();
    onNavigate({ page: 'diagnostics', ...params }, trigger);
  };
  const openGroup = (row: Group, trigger: HTMLElement, nextView?: string) =>
    navigate({ group: keyOf(row), view: nextView }, trigger);

  if (subpage) {
    return (
      <>
        <PageHeading
          data-studio-ui
          title={snapshot ? '表单快照' : '错误详情'}
          description={selection && <p>{selection.formName}</p>}
          back={{ label: '返回错误列表', onClick: () => navigate() }}
        >
          {groupKey && (
            <Button
              variant="secondary"
              aria-haspopup="dialog"
              onClick={(event) =>
                setDialog({ kind: 'occurrences', id: groupKey, trigger: event.currentTarget })
              }
            >
              发生记录{selection ? `（${selection.count}）` : ''}
            </Button>
          )}
          {detail && !snapshot && (
            <>
              {detail.evidence != null && (
                <Button
                  variant="secondary"
                  aria-haspopup="dialog"
                  onClick={(event) =>
                    setDialog({
                      kind: 'evidence',
                      id: detail.diagnosticId,
                      trigger: event.currentTarget,
                    })
                  }
                >
                  查看原始现场
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() =>
                  navigate({ group: groupKey, event: detail.diagnosticId, view: 'snapshot' })
                }
              >
                查看表单快照
              </Button>
            </>
          )}
        </PageHeading>
        <div className="diagnostic-detail-layout" data-studio-ui>
          {eventResult?.error && <Feedback kind="error">{eventResult.error}</Feedback>}
          {selectedEvent && !eventResult && <Feedback kind="status">正在读取错误现场…</Feedback>}
          {!groupKey && !selectedEvent && <Feedback kind="error">该错误记录已不可用。</Feedback>}
          {detail &&
            (snapshot ? (
              <DiagnosticSnapshot key={detail.diagnosticId} detail={detail} />
            ) : (
              <>
                <DiagnosticSummary detail={detail} />
                <div className="surface authoring-panel">
                  <DiagnosticChain detail={detail} />
                </div>
              </>
            ))}
        </div>
        {groupKey && dialog?.kind === 'occurrences' && dialog.id === groupKey && (
          <Modal title="发生记录" size="wide" onClose={closeDialog} returnFocus={dialog.trigger}>
            {selection && (
              <div className="diagnostic-group-summary">
                <span>{selection.count} 次发生</span>
                <span>
                  首次接收{' '}
                  <time dateTime={selection.firstReceivedAt}>
                    {formatTime(selection.firstReceivedAt)}
                  </time>
                </span>
                <span>
                  最近接收{' '}
                  <time dateTime={selection.lastReceivedAt}>
                    {formatTime(selection.lastReceivedAt)}
                  </time>
                </span>
              </div>
            )}
            {occurrences?.error && <Feedback kind="error">{occurrences.error}</Feedback>}
            {!occurrences && <Feedback kind="status">正在读取发生记录…</Feedback>}
            {occurrences?.rows && (
              <DataTable
                label="错误发生记录"
                rows={occurrences.rows}
                rowKey={(row) => row.diagnosticId}
                columns={[
                  {
                    key: 'time',
                    title: '发生时间',
                    render: (row) => (
                      <time dateTime={row.occurredAt}>{formatTime(row.occurredAt)}</time>
                    ),
                  },
                  {
                    key: 'evidence',
                    title: '现场状态',
                    render: (row) => evidenceStatus[row.evidenceStatus] ?? '—',
                  },
                  {
                    key: 'actions',
                    title: '查看记录',
                    render: (row) =>
                      selectedEvent === row.diagnosticId ? (
                        <span aria-current="true">当前查看</span>
                      ) : (
                        <Button
                          variant="secondary"
                          onClick={() =>
                            navigate({ group: groupKey, event: row.diagnosticId, view })
                          }
                        >
                          {snapshot ? '切换快照' : '切换到此记录'}
                        </Button>
                      ),
                  },
                ]}
              />
            )}
          </Modal>
        )}
        {detail &&
          !snapshot &&
          detail.evidence != null &&
          dialog?.kind === 'evidence' &&
          dialog.id === detail.diagnosticId && (
            <Modal
              title="原始现场"
              size="wide"
              className="diagnostic-evidence-dialog"
              onClose={closeDialog}
              returnFocus={dialog.trigger}
            >
              <JsonEditor
                label="现场 JSON"
                text={JSON.stringify(detail.evidence)}
                readOnly
                size="compact"
              />
            </Modal>
          )}
      </>
    );
  }

  const columns: Column<Group>[] = [
    {
      key: 'form',
      title: '表单',
      render: (row) => (
        <div className="diagnostic-cell">
          <Button
            className="diagnostic-cell-link"
            variant="text"
            data-return-focus={'diagnostic-form-' + keyOf(row)}
            onClick={(event) => openGroup(row, event.currentTarget, 'snapshot')}
          >
            {row.formName}
          </Button>
          <small>
            发布 <code title={row.releaseId}>{row.releaseId.slice(0, 8)}</code>
          </small>
        </div>
      ),
    },
    {
      key: 'error',
      title: '错误',
      render: (row) => (
        <div className="diagnostic-cell">
          <Button
            className="diagnostic-cell-link"
            variant="text"
            data-return-focus={'diagnostic-error-' + keyOf(row)}
            onClick={(event) => openGroup(row, event.currentTarget)}
          >
            <code>{row.errorCode}</code>
          </Button>
          <small className="diagnostic-error-meta">
            <span>
              {row.source === 'runtime'
                ? '运行时'
                : row.source === 'renderer'
                  ? '渲染器'
                  : row.source}
            </span>
            <code>{row.phase}</code>
            {row.targetId && <code>{row.targetId}</code>}
          </small>
        </div>
      ),
    },
    {
      key: 'occurrences',
      title: '发生情况',
      render: (row) => (
        <div className="diagnostic-cell">
          <span className="diagnostic-number">{row.count} 次</span>
          <small>
            最近 <time dateTime={row.lastReceivedAt}>{formatTime(row.lastReceivedAt)}</time>
          </small>
        </div>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      render: (row) => (
        <Button
          variant="secondary"
          aria-label={`查看详情 ${row.formName} ${row.errorCode} ${row.targetId ?? row.phase}`}
          data-return-focus={'diagnostic-details-' + keyOf(row)}
          onClick={(event) => openGroup(row, event.currentTarget)}
        >
          查看详情
        </Button>
      ),
    },
  ];
  return (
    <>
      <PageHeading title="表单错误" className="form-list-heading" data-studio-ui>
        <Button
          variant="secondary"
          disabled={!list}
          data-return-focus="diagnostic-refresh"
          onClick={() => setRefresh((value) => value + 1)}
        >
          刷新
        </Button>
      </PageHeading>
      {list?.error && <Feedback kind="error">{list.error}</Feedback>}
      {!list && <Feedback kind="status">正在读取错误记录…</Feedback>}
      <DataTable
        layout="fill"
        label="表单错误列表"
        panelClassName="diagnostic-results"
        rows={list?.rows ?? []}
        columns={columns}
        rowKey={keyOf}
        empty={list?.rows ? '暂无上报的表单错误。' : null}
      />
    </>
  );
}
