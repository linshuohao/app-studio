'use client';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Button, DataTable, Pagination } from '@form-engine/studio-design-components';
import { StudioSelect } from '@form-engine/studio-design-components/select';
import { Modal } from './modal';
import { failureMessage, outcomeUnknown, platform, PlatformError } from './platform-api';

export type JoinRequest = {
  requestId: string;
  userId: string;
  spaceId: string;
  username: string | null;
  githubLogin: string | null;
  explanation: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  revision: number;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  reason: string | null;
  roles: string[];
};
type RequestPage = { items: JoinRequest[]; total: number; offset: number; limit: number };
const statusLabels = {
  pending: '待审批',
  approved: '已批准',
  rejected: '已拒绝',
  withdrawn: '已撤回',
};
const presets: Record<string, string[]> = {
  viewer: ['viewer'],
  editor: ['editor'],
  publisher: ['publisher'],
  'editor-publisher': ['editor', 'publisher'],
  admin: ['admin'],
};
const labels: Record<string, string> = {
  viewer: '查看者',
  editor: '编辑者',
  publisher: '发布者',
  'editor-publisher': '编辑＋发布',
  admin: '管理员',
};
function identity(request: JoinRequest) {
  return request.username ?? (request.githubLogin ? '@' + request.githubLogin : request.userId);
}
function requestError(reason: unknown) {
  return reason instanceof PlatformError && reason.status === 429
    ? '申请次数过多，请稍后再试。'
    : reason instanceof PlatformError && reason.status === 409
      ? '申请状态已变化，已保留你的输入，请刷新后查看最新结果。'
      : failureMessage(reason);
}

export function JoinApplication({
  onRefresh,
  onSessionLost,
}: {
  onRefresh: () => Promise<void>;
  onSessionLost: () => void;
}) {
  const mounted = useRef(false);
  const operation = useRef(0);
  const [request, setRequest] = useState<JoinRequest | null>();
  const [explanation, setExplanation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const expireSession = useEffectEvent(onSessionLost);
  useEffect(() => {
    let active = true;
    mounted.current = true;
    void platform<{ request: JoinRequest | null }>('/join-requests/mine').then(
      (result) => {
        if (active) setRequest(result.request);
      },
      (reason) => {
        if (active) {
          if (reason instanceof PlatformError && reason.status === 401) expireSession();
          else setError(requestError(reason));
        }
      },
    );
    return () => {
      active = false;
      mounted.current = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Invalidate the latest operation on unmount, including logout and account replacement.
      ++operation.current;
    };
  }, []);
  async function run(action: (current: () => boolean) => Promise<void>) {
    if (busy || !mounted.current) return;
    const id = ++operation.current;
    const current = () => mounted.current && operation.current === id;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action(current);
    } catch (reason) {
      if (!current()) return;
      if (reason instanceof PlatformError && reason.status === 401) onSessionLost();
      else setError(requestError(reason));
    } finally {
      if (current()) setBusy(false);
    }
  }
  return (
    <div className="authoring-fields">
      {request === undefined && !error && <p role="status">正在读取申请状态…</p>}
      {request && (
        <>
          <h3>加入申请：{statusLabels[request.status]}</h3>
          <p>申请说明：{request.explanation}</p>
          {request.reason && <p>拒绝原因：{request.reason}</p>}
          {request.status === 'pending' && (
            <>
              <p>管理员正在处理你的申请。批准后刷新团队状态即可进入工作台，无需重新登录。</p>
              <button
                type="button"
                className="quiet"
                disabled={busy}
                onClick={() =>
                  void run(async (current) => {
                    const result = await platform<JoinRequest>(
                      `/join-requests/${request.requestId}/withdraw`,
                      {
                        body: { revision: request.revision },
                      },
                    );
                    if (!current()) return;
                    setRequest(result);
                    setNotice('申请已撤回，可以重新提交。');
                  })
                }
              >
                撤回申请
              </button>
            </>
          )}
          {request.status === 'approved' && <p>申请已批准，请刷新团队状态进入工作台。</p>}
        </>
      )}
      {request !== undefined &&
        (!request || request.status === 'rejected' || request.status === 'withdrawn') && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(async (current) => {
                let result: JoinRequest;
                try {
                  result = await platform<JoinRequest>('/join-requests', { body: { explanation } });
                } catch (failure) {
                  if (!current()) return;
                  if (!outcomeUnknown(failure)) throw failure;
                  const latest = (
                    await platform<{ request: JoinRequest | null }>('/join-requests/mine')
                  ).request;
                  if (!latest || latest.status !== 'pending') throw failure;
                  result = latest;
                }
                if (!current()) return;
                setRequest(result);
                setExplanation('');
                setNotice('申请已提交，等待管理员审批。');
              });
            }}
          >
            <label htmlFor="join-explanation">申请说明</label>
            <textarea
              id="join-explanation"
              name="explanation"
              value={explanation}
              maxLength={1000}
              required
              disabled={busy}
              onChange={(event) => setExplanation(event.target.value)}
            />
            <p className="muted">请说明你的加入目的，最多1000字。由管理员审批并分配角色。</p>
            <button type="submit" disabled={busy || !explanation.trim()}>
              {request ? '重新申请加入团队' : '申请加入团队'}
            </button>
          </form>
        )}
      <button
        type="button"
        className="quiet"
        disabled={busy}
        onClick={() =>
          void run(async (current) => {
            if (!current()) return;
            await onRefresh();
            if (!current()) return;
            const latest = await platform<{ request: JoinRequest | null }>('/join-requests/mine');
            if (current()) setRequest(latest.request);
          })
        }
      >
        刷新团队状态
      </button>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

const requestPageSizes = [5, 10, 20] as const;

export function JoinRequestsAdmin() {
  const [filter, setFilter] = useState('pending');
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState<number>(requestPageSizes[0]);
  const [loading, setLoading] = useState(true);
  const [editTrigger, setEditTrigger] = useState<HTMLElement>();
  const refreshTrigger = useRef<HTMLButtonElement>(null);
  const shouldRestoreFocus = useRef(false);
  const list = useRef<HTMLDivElement>(null);
  const [reload, setReload] = useState(0);
  const [page, setPage] = useState<RequestPage>();
  const [editing, setEditing] = useState<JoinRequest>();
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [role, setRole] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    void platform<RequestPage>(
      `/join-requests?status=${filter}&offset=${offset}&limit=${pageSize}`,
    ).then(
      (result) => {
        if (active) {
          const lastOffset = Math.max(0, Math.ceil(result.total / pageSize) - 1) * pageSize;
          if (offset > lastOffset) {
            setOffset(lastOffset);
            return;
          }
          setPage(result);
          setListError('');
          setLoading(false);
        }
      },
      (reason) => {
        if (active) {
          setListError(requestError(reason));
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [filter, offset, pageSize, reload]);
  useEffect(() => {
    if (loading || !shouldRestoreFocus.current) return;
    shouldRestoreFocus.current = false;
    if (
      document.activeElement !== document.body &&
      document.activeElement !== refreshTrigger.current &&
      document.activeElement !== editTrigger
    )
      return;
    const next = list.current?.querySelector<HTMLElement>('[data-request-review]');
    (next ?? refreshTrigger.current)?.focus();
  }, [editTrigger, loading]);
  function refresh() {
    setLoading(true);
    setListError('');
    setReload((value) => value + 1);
  }
  function complete(message: string) {
    shouldRestoreFocus.current = true;
    setNotice(message);
    setEditing(undefined);
    refresh();
  }
  function open(row: JoinRequest, trigger: HTMLElement) {
    setEditTrigger(trigger);
    setEditing(row);
    setDecision('approve');
    setRole('');
    setReason('');
    setConflict(false);
    setError('');
    setNotice('');
  }
  async function submit() {
    if (!editing || busy || conflict) return;
    setBusy(true);
    setError('');
    try {
      await platform<JoinRequest>(`/join-requests/${editing.requestId}/decision`, {
        body: {
          revision: editing.revision,
          decision,
          ...(decision === 'approve' ? { roles: presets[role] } : { reason }),
        },
      });
      complete(
        decision === 'approve'
          ? '申请已批准，成员权限已生效。'
          : '申请已拒绝，申请人可查看原因后重新申请。',
      );
    } catch (failure) {
      if (outcomeUnknown(failure)) {
        try {
          const latest = await platform<JoinRequest>(`/join-requests/${editing.requestId}`);
          const expected = decision === 'approve' ? 'approved' : 'rejected';
          const matches =
            latest.status === expected &&
            (decision === 'approve'
              ? [...latest.roles].sort().join() === [...presets[role]!].sort().join()
              : latest.reason === reason.trim());
          if (matches) {
            complete('已确认申请处理结果：' + statusLabels[latest.status] + '。');
            return;
          }
        } catch {
          /* Preserve original failure; the refresh action can recover later. */
        }
      }
      setConflict(
        outcomeUnknown(failure) || (failure instanceof PlatformError && failure.status === 409),
      );
      setError(
        outcomeUnknown(failure)
          ? '提交结果待确认。已保留输入，请读取最新申请状态。'
          : requestError(failure),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {listError && <p role="alert">{listError}</p>}
      {notice && <p role="status">{notice}</p>}
      {error && !editing && <p role="alert">{error}</p>}
      <div className="studio-member-requests" ref={list} aria-busy={loading}>
        <DataTable
          label="加入申请列表"
          layout="fill"
          rows={page?.items ?? []}
          rowKey={(row) => row.requestId}
          columns={[
            {
              key: 'identity',
              title: '申请人',
              render: (row) => (
                <>
                  <strong>{identity(row)}</strong>
                  {row.username && row.githubLogin && <small>@{row.githubLogin}</small>}
                </>
              ),
            },
            { key: 'explanation', title: '申请说明', render: (row) => row.explanation },
            {
              key: 'status',
              title: '状态',
              render: (row) => (
                <>
                  {statusLabels[row.status]}
                  {row.reason && <small>拒绝原因：{row.reason}</small>}
                </>
              ),
            },
            {
              key: 'submitted',
              title: '提交时间',
              render: (row) => (
                <time dateTime={row.createdAt}>
                  {new Date(row.createdAt).toLocaleString('zh-CN')}
                </time>
              ),
            },
            {
              key: 'actions',
              title: '操作',
              render: (row) =>
                row.status === 'pending' && (
                  <Button
                    variant="text"
                    data-request-review
                    aria-label={'审批申请 ' + identity(row)}
                    aria-disabled={loading}
                    onClick={(event) => {
                      if (!loading) open(row, event.currentTarget);
                    }}
                  >
                    审批
                  </Button>
                ),
            },
          ]}
          filters={
            <div className="toolbar studio-member-request-filters">
              <label>
                申请状态
                <StudioSelect
                  aria-label="申请状态"
                  value={filter}
                  onValueChange={(value) => {
                    if (value === filter) return;
                    setFilter(value);
                    setOffset(0);
                    setPage(undefined);
                    setListError('');
                    setLoading(true);
                  }}
                >
                  <option value="pending">待审批</option>
                  <option value="approved">已批准</option>
                  <option value="rejected">已拒绝</option>
                  <option value="withdrawn">已撤回</option>
                  <option value="all">全部申请</option>
                </StudioSelect>
              </label>
              <Button
                ref={refreshTrigger}
                variant="secondary"
                aria-label="刷新申请列表"
                aria-disabled={loading || busy}
                onClick={() => {
                  if (!loading && !busy) refresh();
                }}
              >
                {loading ? '刷新中…' : '刷新'}
              </Button>
            </div>
          }
          empty={
            loading ? (
              <span role="status">正在加载申请…</span>
            ) : listError ? null : filter === 'pending' ? (
              '当前没有待审批申请。'
            ) : (
              '当前没有匹配的加入申请。'
            )
          }
          pagination={
            <Pagination
              total={page?.total ?? 0}
              page={Math.floor((page?.offset ?? offset) / pageSize) + 1}
              pageSize={pageSize}
              pageSizeOptions={requestPageSizes}
              onChange={(next, size) => {
                if (loading || (next === Math.floor(offset / pageSize) + 1 && size === pageSize))
                  return;
                setPageSize(size);
                setOffset((next - 1) * size);
                setPage(undefined);
                setListError('');
                setLoading(true);
              }}
            />
          }
        />
      </div>
      {editing && (
        <Modal
          className="member-dialog"
          title="审批加入申请"
          returnFocus={editTrigger}
          closeDisabled={busy}
          onClose={() => {
            setEditing(undefined);
            setError('');
          }}
        >
          <form
            className="authoring-fields"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="member-dialog-body">
              <p>申请人：{identity(editing)}</p>
              <p>申请说明：{editing.explanation}</p>
              <p>提交时间：{new Date(editing.createdAt).toLocaleString('zh-CN')}</p>
              <fieldset disabled={busy || conflict}>
                <legend>审批决定</legend>
                <label>
                  <input
                    type="radio"
                    name="decision"
                    checked={decision === 'approve'}
                    onChange={() => setDecision('approve')}
                  />
                  批准
                </label>
                <label>
                  <input
                    type="radio"
                    name="decision"
                    checked={decision === 'reject'}
                    onChange={() => setDecision('reject')}
                  />
                  拒绝
                </label>
              </fieldset>
              {decision === 'approve' ? (
                <>
                  <label htmlFor="approval-role">授予角色</label>
                  <StudioSelect
                    id="approval-role"
                    value={role}
                    onValueChange={setRole}
                    required
                    disabled={busy || conflict}
                  >
                    <option value="" disabled>
                      请选择角色
                    </option>
                    {Object.entries(labels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </StudioSelect>
                  <p className="muted">
                    编辑与发布相互独立；编辑＋发布授予两种角色。管理员可管理团队成员与全部能力。
                  </p>
                </>
              ) : (
                <>
                  <label htmlFor="rejection-reason">拒绝原因</label>
                  <textarea
                    id="rejection-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    required
                    maxLength={1000}
                    disabled={busy || conflict}
                  />
                  <p className="muted">请说明原因，申请人可查看并重新申请，最多1000字。</p>
                </>
              )}
              {error && <p role="alert">{error}</p>}
              {conflict && (
                <>
                  <p>你的选择与原因仍保留。请读取最新状态，已处理的申请不能再次提交。</p>
                  <button
                    type="button"
                    className="quiet"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const latest = await platform<JoinRequest>(
                          `/join-requests/${editing.requestId}`,
                        );
                        setEditing(latest);
                        setConflict(latest.status !== 'pending');
                        setError(
                          '最新状态：' +
                            statusLabels[latest.status] +
                            (latest.status === 'pending'
                              ? '，请重新确认后提交。'
                              : '，请关闭面板查看列表。'),
                        );
                        refresh();
                      } catch (failure) {
                        setError(requestError(failure));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    读取最新申请状态
                  </button>
                </>
              )}
            </div>
            <div className="member-dialog-actions">
              <button
                type="submit"
                disabled={busy || conflict || (decision === 'approve' ? !role : !reason.trim())}
              >
                {busy ? '正在提交…' : decision === 'approve' ? '批准并授予角色' : '确认拒绝'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
