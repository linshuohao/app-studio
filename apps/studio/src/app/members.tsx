'use client';

import { PageHeading } from './page-heading';
import {
  Button,
  DataTable,
  Input,
  ListFilterBar,
  Pagination,
  Tabs,
} from '@form-engine/studio-design-components';
import { OperationRecords } from './operation-records';
import { JoinRequestsAdmin } from './join-requests';
import { useEffect, useState } from 'react';
import { Modal } from './modal';
import { platform, PlatformError, failureMessage } from './platform-api';

type Member = {
  memberId: string;
  userId: string;
  username: string | null;
  githubLogin?: string | null;
  roles: string[];
  active: boolean;
  userActive: boolean;
  revision: number;
};
const roleLabels: Record<string, string> = {
  viewer: '查看者',
  editor: '编辑者',
  publisher: '发布者',
  admin: '管理员',
};
const roleDescriptions: Record<string, string> = {
  viewer: '查看表单、历史与能力目录',
  editor: '查看并编辑、保存表单',
  publisher: '查看并发布已保存版本',
  admin: '管理表单、成员与全部内建能力',
};
export const memberPageSizes = [5, 10, 20] as const;

function memberName(member: Member) {
  return member.username ?? (member.githubLogin ? '@' + member.githubLogin : member.userId);
}

export function Members({
  currentUser,
  onAccessChange,
}: {
  currentUser: string;
  onAccessChange: () => Promise<boolean>;
}) {
  const [records, setRecords] = useState<{ member: Member; trigger: HTMLElement }>();
  const [guideTrigger, setGuideTrigger] = useState<HTMLElement>();
  const [editTrigger, setEditTrigger] = useState<HTMLElement>();
  const [openedRequests, setOpenedRequests] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(memberPageSizes[0]);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState('');
  const [rows, setRows] = useState<Member[]>();
  const [query, setQuery] = useState('');
  const [draftQuery, setDraftQuery] = useState('');
  const [tab, setTab] = useState<'members' | 'requests'>('members');
  const [editing, setEditing] = useState<Member>();
  const [chosen, setChosen] = useState<string[]>(['viewer']);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState(false);
  const [reviewLatest, setReviewLatest] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let mounted = true;
    void platform<Member[]>('/members').then(
      (value) => {
        if (!mounted) return;
        setRows(value);
        setRefreshing(false);
        setListError('');
      },
      (reason) => {
        if (!mounted) return;
        setRefreshing(false);
        setListError(failureMessage(reason));
      },
    );
    return () => {
      mounted = false;
    };
  }, [reload]);

  function refresh() {
    setRefreshing(true);
    setListError('');
    setReload((value) => value + 1);
  }

  function open(member: Member, trigger: HTMLElement) {
    setEditTrigger(trigger);
    setEditing(member);
    setChosen(member.roles);
    setActive(member.active);
    setError('');
    setConflict(false);
    setReviewLatest(false);
    setNotice('');
  }
  async function save() {
    if (!editing || busy || conflict || !changed) return;
    setBusy(true);
    setError('');
    try {
      await platform(`/members/${editing.memberId}`, {
        body: { revision: editing.revision, roles: chosen, active },
      });
      const self = editing.userId === currentUser;
      setEditing(undefined);
      setNotice('成员设置已保存。');
      if (!self || (await onAccessChange())) refresh();
    } catch (reason) {
      const stale =
        reason instanceof PlatformError &&
        reason.detail === 'Member changed; refresh before editing';
      setConflict(stale);
      if (stale) setReviewLatest(false);
      setError(
        reason instanceof PlatformError && reason.status === 409
          ? stale
            ? '其他管理员已修改此成员。你的勾选仍保留；请加载最新设置后重新决定。'
            : reason.detail === 'At least one active administrator is required'
              ? '团队必须至少保留一位有效管理员，请先指定其他管理员。'
              : '操作冲突，请刷新后重试。'
          : reason instanceof PlatformError && reason.status === 404
            ? '未找到该成员或有效内置账号。'
            : failureMessage(reason),
      );
    } finally {
      setBusy(false);
    }
  }
  const visible = rows?.filter((row) =>
    `${row.username ?? ''} ${row.githubLogin ?? ''} ${row.userId}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const total = visible?.length ?? 0;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
  const changed =
    editing &&
    (editing.active !== active ||
      editing.roles.length !== chosen.length ||
      chosen.some((role) => !editing.roles.includes(role)));
  const actionLabel =
    editing?.active === active ? '保存成员设置' : active ? '确认恢复' : '确认停用';
  return (
    <section className="studio-members" data-studio-ui>
      <PageHeading title="成员管理">
        <Button variant="secondary" onClick={(event) => setGuideTrigger(event.currentTarget)}>
          角色说明
        </Button>
      </PageHeading>
      <Tabs.Root
        className="studio-members-tabs"
        value={tab}
        onValueChange={(value) => {
          if (value === 'members') {
            refresh();
            setTab('members');
          } else {
            setOpenedRequests(true);
            setTab('requests');
          }
        }}
      >
        <Tabs.List aria-label="成员管理视图">
          <Tabs.Tab value="members">成员</Tabs.Tab>
          <Tabs.Tab value="requests">加入申请</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="members">
          {notice && <p role="status">{notice}</p>}
          {listError && <p role="alert">{listError}</p>}
          {error && !editing && <p role="alert">{error}</p>}
          <DataTable
            layout="fill"
            label="成员列表"
            rows={visible?.slice((currentPage - 1) * pageSize, currentPage * pageSize) ?? []}
            rowKey={(member) => member.memberId}
            columns={[
              {
                key: 'member',
                title: '成员',
                render: (member) => (
                  <>
                    <strong>
                      {memberName(member)}
                      {member.userId === currentUser ? '（你）' : ''}
                    </strong>
                    {member.username && member.githubLogin && <small>@{member.githubLogin}</small>}
                  </>
                ),
              },
              {
                key: 'roles',
                title: '角色',
                render: (member) => member.roles.map((role) => roleLabels[role]).join('、'),
              },
              {
                key: 'status',
                title: '状态',
                render: (member) => (
                  <span className="badge">
                    {!member.userActive ? '账号停用' : member.active ? '已启用' : '成员停用'}
                  </span>
                ),
              },
              {
                key: 'actions',
                title: '操作',
                render: (member) => (
                  <div className="action-row">
                    <Button
                      variant="text"
                      aria-label={'编辑成员 ' + memberName(member)}
                      onClick={(event) => open(member, event.currentTarget)}
                    >
                      编辑
                    </Button>
                    <Button
                      variant="text"
                      aria-label={memberName(member) + '的操作记录'}
                      onClick={(event) => setRecords({ member, trigger: event.currentTarget })}
                    >
                      操作记录
                    </Button>
                  </div>
                ),
              },
            ]}
            filters={
              <ListFilterBar
                label="筛选成员"
                layout="search"
                inlineSearch
                applyLabel="筛选"
                onApply={() => {
                  setQuery(draftQuery.trim());
                  setPage(1);
                }}
                onReset={() => {
                  setDraftQuery('');
                  setQuery('');
                  setPage(1);
                }}
                actions={
                  <Button
                    variant="secondary"
                    aria-label="刷新成员列表"
                    aria-disabled={refreshing}
                    onClick={() => {
                      if (!refreshing) refresh();
                    }}
                  >
                    {refreshing ? '刷新中…' : '刷新'}
                  </Button>
                }
              >
                <Input
                  aria-label="搜索成员"
                  name="memberSearch"
                  type="search"
                  placeholder="用户名、GitHub 或用户 ID"
                  value={draftQuery}
                  onChange={(event) => setDraftQuery(event.target.value)}
                />
              </ListFilterBar>
            }
            empty={
              !rows && !listError ? (
                <span role="status">正在加载成员…</span>
              ) : listError ? null : query ? (
                '没有匹配的成员。'
              ) : (
                '暂无成员。'
              )
            }
            pagination={
              <Pagination
                total={total}
                page={currentPage}
                pageSize={pageSize}
                pageSizeOptions={memberPageSizes}
                onChange={(next, size) => {
                  setPage(next);
                  setPageSize(size);
                }}
              />
            }
          />
        </Tabs.Panel>
        <Tabs.Panel value="requests" keepMounted>
          {openedRequests && <JoinRequestsAdmin />}
        </Tabs.Panel>
      </Tabs.Root>
      {guideTrigger && (
        <Modal
          title="内建角色"
          size="standard"
          returnFocus={guideTrigger}
          onClose={() => setGuideTrigger(undefined)}
        >
          <div className="studio-member-role-guide">
            {Object.entries(roleLabels).map(([role, label]) => (
              <div key={role}>
                <strong>{label}</strong>
                <p>{roleDescriptions[role]}</p>
              </div>
            ))}
            <p>组合角色取权限并集。团队须保留至少一位有效管理员。</p>
          </div>
        </Modal>
      )}
      {records && (
        <OperationRecords
          kind="member"
          title="成员操作记录"
          scopeLabel={memberName(records.member)}
          path={'/members/' + records.member.memberId + '/operations'}
          trigger={records.trigger}
          onClose={() => setRecords(undefined)}
        />
      )}
      {editing && (
        <Modal
          className="member-dialog"
          title="编辑成员"
          returnFocus={editTrigger}
          closeDisabled={busy}
          onClose={() => {
            setEditing(undefined);
          }}
        >
          <form
            className="authoring-fields"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="member-dialog-body">
              <p>
                <strong>{memberName(editing)}</strong>
                <br />
                <small>用户 ID · {editing.userId}</small>
              </p>
              <fieldset disabled={busy}>
                <legend>角色（可多选）</legend>
                {Object.entries(roleLabels).map(([role, label]) => (
                  <label className="role-option" key={role}>
                    <input
                      type="checkbox"
                      checked={chosen.includes(role)}
                      onChange={(e) =>
                        setChosen((current) =>
                          e.target.checked
                            ? [...current, role]
                            : current.filter((value) => value !== role),
                        )
                      }
                    />
                    <span>
                      <strong>{label}</strong>
                      <small>{roleDescriptions[role]}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              {
                <label className="role-option">
                  <input
                    type="checkbox"
                    checked={active}
                    disabled={busy}
                    onChange={(e) => setActive(e.target.checked)}
                  />
                  <span>启用成员访问</span>
                </label>
              }
              {editing.active && !active && (
                <p>
                  确认后，{memberName(editing)}
                  将立即失去团队访问权限。恢复后，未过期、未撤销的会话可继续使用。
                </p>
              )}
              {reviewLatest && (
                <p role="status">
                  最新设置：{editing.roles.map((role) => roleLabels[role]).join('、')} ·{' '}
                  {editing.active ? '已启用' : '已停用'}。请核对你保留的勾选后再保存。
                </p>
              )}
              {error && <p role="alert">{error}</p>}
              {conflict && (
                <button
                  type="button"
                  className="quiet"
                  onClick={async () => {
                    try {
                      const latest = await platform<Member[]>('/members');
                      setRows(latest);
                      const current = latest.find((row) => row.memberId === editing.memberId);
                      if (current) {
                        setEditing(current);
                        setConflict(false);
                        setReviewLatest(true);
                        setError('');
                      } else {
                        setError('该成员已不在列表中，请关闭编辑并重新选择。');
                      }
                    } catch (reason) {
                      setError(failureMessage(reason));
                    }
                  }}
                >
                  加载最新成员设置
                </button>
              )}
            </div>
            <div className="member-dialog-actions">
              <Button disabled={busy || conflict || !changed || !chosen.length} type="submit">
                {busy ? '正在保存…' : actionLabel}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
