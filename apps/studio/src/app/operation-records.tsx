'use client';
import { useEffect, useState } from 'react';
import { Button, CardList, Input, ListFilterBar } from '@form-engine/studio-design-components';
import { Feedback } from '@form-engine/studio-design-components/controls';
import { Field } from '@form-engine/studio-design-components/form-layout';
import { StudioSelect } from '@form-engine/studio-design-components/select';
import { platform, failureMessage } from './platform-api';
import { Modal } from './modal';

const actions = {
  create: '创建表单',
  archive: '归档表单',
  restore: '恢复表单',
  publish: '发布表单',
  roles: '变更角色',
  activate: '恢复成员',
  deactivate: '停用成员',
  'member-update': '更新成员',
  'reject-join-request': '驳回加入',
  'approve-join-request': '批准加入',
  'create-account-and-member': '创建成员账号',
  'associate-member': '添加成员',
  'change-password': '修改密码',
  'setup-password': '设置密码',
  'github-bind': '绑定 GitHub',
  'github-unbind': '解绑 GitHub',
};
const groups = {
  form: ['create', 'archive', 'restore', 'publish'],
  member: [
    'roles',
    'activate',
    'deactivate',
    'member-update',
    'approve-join-request',
    'reject-join-request',
    'create-account-and-member',
    'associate-member',
  ],
  security: ['github-bind', 'github-unbind', 'change-password', 'setup-password'],
} as const;
const roles: Record<string, string> = {
  viewer: '查看者',
  editor: '编辑者',
  publisher: '发布者',
  admin: '管理员',
};
type Row = {
  id: string;
  at: string | null;
  actor: string | null;
  action: keyof typeof actions;
  object: string | null;
  result: string | null;
  detail: {
    releaseId?: string;
    versionId?: string;
    versionName?: string;
    beforeRoles?: string[];
    afterRoles?: string[];
    beforeActive?: boolean;
    afterActive?: boolean;
  };
};
type Page = { rows: Row[]; next: string | null };
const outcome = (r: string | null) =>
  r === 'success' ? '成功' : r === 'failure' ? '失败' : '未记录';
function dateBound(day: string, next = false) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d + Number(next)).toISOString();
}
export type RecordFilters = {
  action: string;
  result: string;
  start: string;
  end: string;
  cursor: string;
  expanded: string;
};
export function OperationRecords({
  kind,
  path,
  title,
  scopeLabel,
  trigger,
  onClose,
  onVersion,
  onRelease,
  initialFilters,
}: {
  kind: keyof typeof groups;
  path: string;
  title: string;
  scopeLabel?: string;
  trigger?: HTMLElement;
  onClose: () => void;
  initialFilters?: RecordFilters;
  onVersion?: (id: string, filters: RecordFilters) => void;
  onRelease?: (id: string, filters: RecordFilters) => void;
}) {
  const [returnFocus] = useState(() => {
    if (typeof document === 'undefined') return undefined;
    const active = document.activeElement;
    return active instanceof HTMLElement && active !== document.body ? active : undefined;
  });
  const defaults = { action: 'all', result: 'all', start: '', end: '' };
  const [applied, setApplied] = useState(() => ({
    action: initialFilters?.action ?? defaults.action,
    result: initialFilters?.result ?? defaults.result,
    start: initialFilters?.start ?? defaults.start,
    end: initialFilters?.end ?? defaults.end,
  }));
  const { action, result, start, end } = applied;
  const [draft, setDraft] = useState(applied);
  const [cursor, paginate] = useState(initialFilters?.cursor ?? ''),
    [expanded, expand] = useState(initialFilters?.expanded ?? ''),
    [retry, setRetry] = useState(0);
  const q = new URLSearchParams();
  if (action !== 'all') q.set('action', action);
  if (result !== 'all') q.set('result', result);
  if (start) q.set('from', dateBound(start));
  if (end) q.set('until', dateBound(end, true));
  if (cursor) q.set('cursor', cursor);
  const url = path + '?' + q.toString();
  const invalid = !!start && !!end && start > end;
  const [response, setResponse] = useState<{ url: string; page?: Page; error?: string }>();
  useEffect(() => {
    if (invalid) return;
    let active = true;
    platform<Page>(url).then(
      (page) => {
        if (active) setResponse({ url, page });
      },
      (e) => {
        if (active) setResponse({ url, error: failureMessage(e) });
      },
    );
    return () => {
      active = false;
    };
  }, [url, invalid, retry]);
  const current = !invalid && response?.url === url ? response : undefined;
  function applyFilters(next: typeof applied) {
    setApplied(next);
    paginate('');
    expand('');
  }
  return (
    <Modal
      title={title}
      onClose={onClose}
      returnFocus={trigger ?? returnFocus}
      size="wide"
      className="operation-records"
      actions={
        (cursor || current?.page?.next) && (
          <>
            {cursor && (
              <Button
                variant="secondary"
                onClick={() => {
                  paginate('');
                  expand('');
                }}
              >
                返回首页
              </Button>
            )}
            {current?.page?.next && (
              <Button
                variant="secondary"
                onClick={() => {
                  paginate(current.page!.next!);
                  expand('');
                }}
              >
                下一页
              </Button>
            )}
          </>
        )
      }
    >
      {scopeLabel && <p className="operation-scope">{scopeLabel}</p>}
      <ListFilterBar
        label="操作记录筛选"
        layout="query"
        onApply={() => applyFilters(draft)}
        onReset={() => {
          setDraft(defaults);
          applyFilters(defaults);
        }}
      >
        <Field label="开始日期">
          {(control) => (
            <Input
              {...control}
              type="date"
              value={draft.start}
              onChange={(event) => setDraft({ ...draft, start: event.target.value })}
            />
          )}
        </Field>
        <Field label="结束日期">
          {(control) => (
            <Input
              {...control}
              type="date"
              value={draft.end}
              onChange={(event) => setDraft({ ...draft, end: event.target.value })}
            />
          )}
        </Field>
        <Field label="动作">
          {(control) => (
            <StudioSelect
              {...control}
              aria-label="筛选动作"
              value={draft.action}
              onValueChange={(value) => setDraft({ ...draft, action: value })}
            >
              <option value="all">全部动作</option>
              {groups[kind].map((key) => (
                <option key={key} value={key}>
                  {actions[key]}
                </option>
              ))}
            </StudioSelect>
          )}
        </Field>
        <Field label="结果">
          {(control) => (
            <StudioSelect
              {...control}
              aria-label="筛选结果"
              value={draft.result}
              onValueChange={(value) => setDraft({ ...draft, result: value })}
            >
              <option value="all">全部结果</option>
              <option value="success">成功</option>
              <option value="failure">失败</option>
            </StudioSelect>
          )}
        </Field>
      </ListFilterBar>
      {invalid ? (
        <Feedback kind="error">结束日期须晚于或等于开始日期。</Feedback>
      ) : current?.error ? (
        <div className="action-row">
          <Feedback kind="error">{current.error}</Feedback>
          <Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>
            重试
          </Button>
        </div>
      ) : !current?.page ? (
        <Feedback kind="status">正在加载记录…</Feedback>
      ) : (
        <CardList
          label="记录列表"
          items={current.page.rows}
          itemKey={(row) => row.id}
          empty="没有符合条件的记录。"
          renderItem={(row) => {
            const d = row.detail,
              open = expanded === row.id;
            return (
              <article className="operation-item">
                <Button
                  className="operation-line"
                  variant="text"
                  type="button"
                  aria-expanded={open}
                  onClick={() => expand(open ? '' : row.id)}
                >
                  <time>
                    {row.at
                      ? new Date(row.at).toLocaleString('zh-CN', { hour12: false })
                      : '时间未记录'}
                  </time>
                  <span>{row.actor ?? '操作者未记录'}</span>
                  <strong>{actions[row.action]}</strong>
                  <span>
                    {row.object ?? '名称未记录'}
                    {row.action === 'publish' &&
                      d.releaseId &&
                      current.page!.rows.some(
                        (other) =>
                          other.id !== row.id &&
                          other.action === 'publish' &&
                          other.object === row.object,
                      ) && (
                        <small className="operation-source">
                          {d.versionName ?? '发布 ' + d.releaseId.slice(0, 8)}
                        </small>
                      )}
                  </span>
                  <small>{outcome(row.result)}</small>
                </Button>
                {open && (
                  <div className="operation-detail">
                    <p>
                      记录 ID <code>{row.id}</code>
                    </p>
                    {d.afterRoles && (
                      <p>
                        角色 · {d.beforeRoles?.map((r) => roles[r] ?? r).join('、') ?? '未记录'} →{' '}
                        {d.afterRoles.map((r) => roles[r] ?? r).join('、')}
                      </p>
                    )}
                    {typeof d.afterActive === 'boolean' && (
                      <p>
                        成员状态 ·{' '}
                        {typeof d.beforeActive === 'boolean'
                          ? d.beforeActive
                            ? '使用中'
                            : '已停用'
                          : '未记录'}{' '}
                        → {d.afterActive ? '使用中' : '已停用'}
                      </p>
                    )}
                    {d.versionId && (
                      <p>
                        源配置 · {d.versionName ?? '名称未记录'} <code>{d.versionId}</code>
                      </p>
                    )}
                    {d.releaseId && (
                      <p>
                        发布 ID <code>{d.releaseId}</code>
                      </p>
                    )}
                    <div className="action-row">
                      {d.versionId && onVersion && (
                        <Button
                          variant="secondary"
                          data-return-focus={'op-version-' + row.id}
                          onClick={() =>
                            onVersion?.(d.versionId!, {
                              action,
                              result,
                              start,
                              end,
                              cursor,
                              expanded,
                            })
                          }
                        >
                          打开配置版本
                        </Button>
                      )}
                      {d.releaseId && onRelease && (
                        <Button
                          variant="secondary"
                          data-return-focus={'op-release-' + row.id}
                          onClick={() =>
                            onRelease?.(d.releaseId!, {
                              action,
                              result,
                              start,
                              end,
                              cursor,
                              expanded,
                            })
                          }
                        >
                          打开发布详情
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          }}
        />
      )}
    </Modal>
  );
}
