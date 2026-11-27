'use client';

import { PageHeading } from './page-heading';
import {
  DataTable,
  Icon,
  ListFilterBar,
  Menu,
  Pagination,
  type Column,
} from '@form-engine/studio-design-components';
import {
  IconButton,
  Button,
  Feedback,
  Input,
} from '@form-engine/studio-design-components/controls';
import { Field, FormLayout } from '@form-engine/studio-design-components/form-layout';
import { useEffect, useId, useRef, useState } from 'react';
import { StudioSelect } from '@form-engine/studio-design-components/select';
import { FormEditor } from './form-editor';
import type { ConversationLink, FormReference } from './agent-conversation';
import {
  platform,
  failureMessage,
  type Version,
  type VersionSummary,
  type FormSummary,
  type OpenForm,
  type ReleaseResult,
} from './platform-api';
import { Modal } from './modal';
import { ReleaseWorkspace, type ReleaseListView } from './release-workspace';
import { FormManagement, CopyForm } from './form-management';
import { OperationRecords, type RecordFilters } from './operation-records';
import { ConfigDiff } from './config-diff';
import {
  studioUrl,
  writeLocation,
  listPosition,
  restorePosition,
  type ListPosition,
} from './studio-location';

type Row = { id: string; name: string; updated: string; head: string | null; published: boolean };
type Detail = Row & {
  source?: string | null;
  text: string;
  version: Version | null;
  history: VersionSummary[];
};
const versionPageSizes = [10, 20, 50];
const defaultVersionPageSize = 20;
export function WorkingVersions(props: {
  userId: string;
  spaceId: string;
  form: OpenForm;
  continuation?: { key: string; conversation: ConversationLink };
  canEdit: boolean;
  canPublish: boolean;
  canManage: boolean;
  navigating: boolean;
  parkedSearch?: string;
  refreshRoute: () => void;
  onMetadata: (form: FormSummary) => void;
  onReference: (reference: FormReference) => void;
  pickingReference: boolean;
  onBack: () => void;
  onAccessLost: () => void;
  onRefreshAccess: () => Promise<void>;
}) {
  const publishFormId = useId();
  const manageFormId = useId();
  const { form } = props,
    path = '/forms/' + form.formId;
  const query = new URLSearchParams(props.parkedSearch ?? window.location.search);
  const work = query.get('work'),
    snapshot =
      query.get('snapshot') ?? (query.get('tab') === 'history' ? query.get('version') : null);
  const release = query.get('release'),
    releases = query.get('tab') === 'releases';
  const [formNotice, setFormNotice] = useState('');
  const [lastPublished, setLastPublished] = useState<{ work: string; release: string }>();
  const [rows, setRows] = useState<Row[]>([]),
    [detail, setDetail] = useState<{ key: string; data: Detail }>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [refresh, reload] = useState(0);
  const [modal, setModal] = useState<
      | 'new'
      | 'history'
      | 'publish'
      | 'edit'
      | 'copy'
      | 'archive'
      | 'restore'
      | 'records'
      | 'compare'
    >(),
    [selected, select] = useState<Detail>(),
    [name, setName] = useState(''),
    [profile, setProfile] = useState(''),
    [profiles, setProfiles] = useState<string[]>([]),
    [compareRelease, setCompareRelease] = useState(false),
    [key, setKey] = useState(''),
    [modalTrigger, setModalTrigger] = useState<HTMLButtonElement>(),
    [filter, setFilter] = useState(''),
    [draftFilter, setDraftFilter] = useState('');
  const [versionPage, setVersionPage] = useState(1);
  const [versionPageSize, setVersionPageSize] = useState(defaultVersionPageSize);
  const versionPanel = useRef<HTMLElement>(null);
  const filteredVersions = rows.filter((row) => row.name.includes(filter));
  const currentVersionPage = Math.min(
    versionPage,
    Math.max(1, Math.ceil(filteredVersions.length / versionPageSize)),
  );
  const firstVersion = (currentVersionPage - 1) * versionPageSize;
  function changeVersionPage(page: number, size: number) {
    setVersionPage(page);
    setVersionPageSize(size);
    const results = versionPanel.current?.querySelector('[data-return-scroll]');
    if (results) results.scrollTop = 0;
  }

  function referenceVersion(version: Pick<VersionSummary, 'versionId' | 'savedAt' | 'name'>) {
    props.onReference({
      formId: form.formId,
      name: form.name,
      versionId: version.versionId,
      versionName: version.name,
      savedAt: version.savedAt,
    });
  }
  const locator = work ? 'work/' + work : snapshot ? 'versions/' + snapshot : '';
  const edit = props.canEdit && !form.archived;
  type ReturnView = {
    position: ListPosition;
    filter: string;
    page?: number;
    pageSize?: number;
    releaseList?: ReleaseListView;
    modal?: 'records' | 'history';
    workId?: string;
    records?: RecordFilters;
  };
  const [recordFilters, setRecordFilters] = useState<RecordFilters>();
  const [restoring, setRestoring] = useState<ReturnView>();
  const historyKey = history.state?.studioViewKey;
  const here = query.toString();
  useEffect(() => {
    const saved = window.history.state?.studioList as ReturnView | undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 浏览器历史条目拥有返回位置，前进与后退时同步弹窗和筛选。
    setModal(undefined);
    setRestoring(saved);
    if (saved) {
      setFilter(saved.filter);
      setDraftFilter(saved.filter);
      setVersionPage(saved.page ?? 1);
      setVersionPageSize(saved.pageSize ?? defaultVersionPageSize);
      setRecordFilters(saved.records);
      if (saved.modal === 'records') setModal('records');
      else if (saved.modal === 'history' && saved.workId) {
        let active = true;
        platform<Detail>(path + '/work/' + saved.workId).then(
          (data) => {
            if (active) {
              select(data);
              setModal('history');
            }
          },
          (e) => {
            if (active) setError(failureMessage(e));
          },
        );
        return () => {
          active = false;
        };
      }
    }
  }, [here, path, historyKey]);
  useEffect(() => {
    if (restoring) return restorePosition(restoring.position);
  }, [restoring]);
  function visit(
    values: Record<string, string | undefined>,
    origin: string,
    records?: RecordFilters,
    trigger?: HTMLElement,
    releaseList?: ReleaseListView,
  ) {
    const view: ReturnView = {
      position: listPosition(trigger),
      filter,
      page: currentVersionPage,
      pageSize: versionPageSize,
      releaseList,
      modal: modal === 'records' || modal === 'history' ? modal : undefined,
      workId: selected?.id,
      records,
    };
    history.replaceState({ ...history.state, studioList: view }, '');
    const before = window.location.href;
    go(values);
    if (before === window.location.href) history.pushState(null, '', before);
    history.replaceState(
      { ...history.state, studioOrigin: origin, studioViewKey: crypto.randomUUID() },
      '',
    );
  }
  const origin = history.state?.studioOrigin as string | undefined;
  function back() {
    if (origin) history.back();
    else go();
  }
  function go(values: Record<string, string | undefined> = {}) {
    setDetail(undefined);
    setModal(undefined);
    setCompareRelease(false);
    setError('');
    writeLocation({ form: form.formId, ...values });
    props.refreshRoute();
  }
  useEffect(() => {
    let active = true;
    async function load() {
      if (work) {
        const data = await platform<Detail>(path + '/work/' + encodeURIComponent(work));
        if (active) setDetail({ key: locator, data });
      } else if (snapshot) {
        const v = await platform<Version>(path + '/versions/' + encodeURIComponent(snapshot));
        if (active)
          setDetail({
            key: locator,
            data: {
              id: v.versionId,
              name: v.name ?? '保存快照',
              text: v.text,
              version: v,
              history: [v],
              head: v.versionId,
              published: true,
              updated: v.savedAt,
            },
          });
      } else {
        const list = await platform<Row[]>(path + '/work');
        if (active) setRows(list);
      }
    }
    load().catch((e) => {
      if (active) setError(failureMessage(e));
    });
    return () => {
      active = false;
    };
  }, [path, locator, work, snapshot, refresh]);
  async function open(
    action: 'new' | 'history' | 'publish',
    trigger: HTMLButtonElement,
    row?: Row,
  ) {
    setBusy(true);
    setError('');
    try {
      const data = row ? await platform<Detail>(path + '/work/' + row.id) : undefined;
      select(data);
      setName(action === 'publish' ? row!.name : row ? row.name + ' · 新版' : '');
      setKey(crypto.randomUUID());
      let views: string[] = [];
      try {
        views = Object.keys(JSON.parse(data?.text ?? '{}').views ?? {});
      } catch {
        /* A draft can contain an incomplete configuration. */
      }
      setProfiles(views);
      setCompareRelease(false);
      setProfile(views.length === 1 ? views[0] : '');
      setModalTrigger(trigger);
      setModal(action);
    } catch (e) {
      setError(failureMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    setBusy(true);
    setError('');
    try {
      if (modal === 'new') {
        const r = await platform<{ id: string }>(path + '/work', {
          key,
          body: {
            name,
            ...(selected?.head
              ? { source: selected.head }
              : selected
                ? { text: selected.text }
                : {}),
          },
        });
        go({ work: r.id });
      } else if (modal === 'publish' && selected) {
        const r = await platform<ReleaseResult>(path + '/releases', {
          key,
          body: { versionId: selected.head, name, profile: profile || undefined },
        });
        if (!r.success) {
          setError(r.diagnostics.map((d) => d.message).join('；'));
          return;
        }
        setLastPublished({ work: selected.id, release: r.releaseId });
        setModal(undefined);
        reload((n) => n + 1);
      }
    } catch (e) {
      setError(failureMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function closeFormAction() {
    setModal(undefined);
    setError('');
  }

  function openFormAction(action: 'edit' | 'copy' | 'archive' | 'restore') {
    const trigger = document.getElementById(manageFormId);
    if (trigger instanceof HTMLButtonElement) setModalTrigger(trigger);
    setError('');
    setModal(action);
  }

  async function changeArchiveState(action: 'archive' | 'restore') {
    setBusy(true);
    setError('');
    try {
      props.onMetadata(await platform<FormSummary>(path + '/' + action, {}));
      closeFormAction();
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const returnLabel = origin && releases ? '返回' + origin : '返回表单列表';
  const current = detail?.key === locator ? detail.data : undefined;
  if (locator && current)
    return (
      <FormEditor
        key={locator}
        userId={props.userId}
        spaceId={props.spaceId}
        continuation={props.continuation}
        canEdit={props.canEdit}
        navigating={props.navigating}
        onAccessLost={props.onAccessLost}
        onRefreshAccess={props.onRefreshAccess}
        parked={props.parkedSearch !== undefined}
        form={{ ...form, text: current.text, version: current.version }}
        working={{
          id: current.id,
          name: current.name,
          source: current.source,
          history: current.history,
          readOnly: !!snapshot || current.published,
        }}
        backLabel={origin ? '返回' + origin : '返回版本列表'}
        onBack={back}
        pickingReference={props.pickingReference}
        onObjectReference={props.onReference}
        referencePointer={snapshot ? (query.get('object') ?? undefined) : undefined}
        onReference={
          props.canEdit && (snapshot || current.published) && current.version
            ? () => referenceVersion(current.version!)
            : undefined
        }
      />
    );
  if (locator)
    return (
      <section>
        <IconButton
          icon="ChevronLeft"
          aria-label={origin ? '返回' + origin : '返回版本列表'}
          title={origin ? '返回' + origin : '返回版本列表'}
          onClick={back}
        />
        <p>{error || '正在载入配置…'}</p>
      </section>
    );
  const nameInput = {
    required: true,
    maxLength: 80,
    value: name,
    onChange(event: React.ChangeEvent<HTMLInputElement>) {
      setKey(crypto.randomUUID());
      setName(event.target.value);
    },
  };
  const versionColumns: Column<Row>[] = [
    {
      key: 'name',
      title: '版本名称',
      render: (row) => (
        <Button
          variant="text"
          className="working-version-name"
          title={row.name}
          data-return-focus={'work-name-' + row.id}
          disabled={busy || props.navigating}
          onClick={(event) => visit({ work: row.id }, '版本列表', undefined, event.currentTarget)}
        >
          {row.name}
        </Button>
      ),
    },
    {
      key: 'status',
      title: '状态',
      render: (row) => (
        <span
          className="form-list-badge"
          data-version-status={row.published ? 'published' : row.head ? 'unpublished' : 'draft'}
        >
          {row.published && <Icon name="Check" />}
          {row.published ? '已发布' : row.head ? '未发布' : '草稿'}
        </span>
      ),
    },
    {
      key: 'updated',
      title: '最近更新',
      render: (row) => (
        <time dateTime={row.updated}>{new Date(row.updated).toLocaleString('zh-CN')}</time>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      render: (row) => {
        if (!row.head && !edit && lastPublished?.work !== row.id) return '—';
        const menuId = 'work-menu-' + row.id;
        const trigger = () => document.getElementById(menuId);
        const openAction = (action: 'new' | 'history' | 'publish') => {
          const button = trigger();
          if (button instanceof HTMLButtonElement) void open(action, button, row);
        };
        return (
          <Menu.Root>
            <Menu.Trigger
              id={menuId}
              aria-label={`操作 ${row.name}`}
              data-return-focus={'work-' + row.id}
              disabled={busy || props.navigating}
            >
              操作 <Icon name="ChevronDown" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner align="end">
                <Menu.Popup>
                  {lastPublished?.work === row.id && (
                    <Menu.Item
                      onClick={() =>
                        visit(
                          { tab: 'releases', release: lastPublished.release },
                          '版本列表',
                          undefined,
                          trigger() ?? undefined,
                        )
                      }
                    >
                      查看本次发布
                    </Menu.Item>
                  )}
                  {row.head && (
                    <Menu.Item onClick={() => openAction('history')}>保存历史</Menu.Item>
                  )}
                  {edit && (
                    <Menu.Item onClick={() => openAction('new')}>基于此版创建新版</Menu.Item>
                  )}
                  {row.head && !row.published && !form.archived && props.canPublish && (
                    <Menu.Item onClick={() => openAction('publish')}>发布</Menu.Item>
                  )}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        );
      },
    },
  ];
  return (
    <div className="studio-version-workspace">
      {!(releases && release) && (
        <>
          <PageHeading
            data-studio-ui={!releases || undefined}
            title={form.name}
            back={{ label: returnLabel, onClick: origin && releases ? back : props.onBack }}
            rename={
              edit
                ? {
                    label: '表单名称',
                    disabled: busy || props.navigating,
                    onSave: async (name) => {
                      setBusy(true);
                      try {
                        props.onMetadata(
                          await platform<FormSummary>(path + '/metadata', {
                            body: { name, description: form.description, revision: form.revision },
                          }),
                        );
                      } finally {
                        setBusy(false);
                      }
                    },
                  }
                : undefined
            }
          >
            {props.canEdit && form.version && (
              <Button variant="secondary" onClick={() => referenceVersion(form.version!)}>
                引用到 Agent
              </Button>
            )}
            {(edit || props.canManage) && (
              <Menu.Root>
                <Menu.Trigger id={manageFormId} disabled={busy || props.navigating}>
                  管理表单 <Icon name="ChevronDown" />
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Positioner align="end">
                    <Menu.Popup>
                      {edit && (
                        <Menu.Item onClick={() => openFormAction('edit')}>编辑名称与说明</Menu.Item>
                      )}
                      {form.version && edit && (
                        <Menu.Item onClick={() => openFormAction('copy')}>复制为新表单</Menu.Item>
                      )}
                      {props.canManage && (
                        <Menu.Item
                          onClick={() => openFormAction(form.archived ? 'restore' : 'archive')}
                        >
                          {form.archived ? '恢复表单' : '归档表单'}
                        </Menu.Item>
                      )}
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            )}
            {props.canManage && (
              <Button
                variant="secondary"
                onClick={() => {
                  setRecordFilters(undefined);
                  setModal('records');
                }}
              >
                操作记录
              </Button>
            )}
            {edit && (
              <Button disabled={busy} onClick={(event) => void open('new', event.currentTarget)}>
                新建草稿
              </Button>
            )}
          </PageHeading>
          {formNotice && <Feedback kind="status">{formNotice}</Feedback>}
          <nav className="workbench-tabs" aria-label="表单版本视图">
            <Button aria-current={!releases ? 'page' : undefined} onClick={() => go()}>
              版本列表
            </Button>
            <Button
              aria-current={releases ? 'page' : undefined}
              onClick={() => go({ tab: 'releases' })}
            >
              发布记录
            </Button>
          </nav>
        </>
      )}
      {props.pickingReference && (
        <Feedback kind="status">打开配置版本后，可以点选字段、控件、校验规则或联动规则。</Feedback>
      )}
      {releases ? (
        <ReleaseWorkspace
          path={path}
          releaseId={release ?? undefined}
          onReference={
            props.canEdit
              ? (version) => props.onReference({ ...version, name: form.name, formId: form.formId })
              : undefined
          }
          releaseHref={(releaseId) =>
            studioUrl({
              form: form.formId,
              tab: 'releases',
              release: releaseId,
            })
          }
          initialList={(history.state?.studioList as ReturnView | undefined)?.releaseList}
          onSelect={(id, list, trigger) =>
            visit({ tab: 'releases', release: id }, '发布记录', undefined, trigger, list)
          }
          backLabel={origin ? '返回' + origin : '返回发布记录'}
          onBack={() => (origin ? back() : go({ tab: 'releases' }))}
          onVersion={(id) => visit({ tab: 'history', version: id }, '发布记录')}
        />
      ) : (
        <section ref={versionPanel} className="studio-working-versions" aria-label="工作版本">
          <DataTable
            layout="fill"
            label="版本列表"
            rows={filteredVersions.slice(firstVersion, firstVersion + versionPageSize)}
            rowKey={(row) => row.id}
            columns={versionColumns}
            empty={filter ? '没有匹配的版本。' : '暂无版本。'}
            filters={
              <ListFilterBar
                label="版本筛选"
                layout="search"
                onApply={() => {
                  setFilter(draftFilter);
                  changeVersionPage(1, versionPageSize);
                }}
                onReset={() => {
                  setDraftFilter('');
                  setFilter('');
                  changeVersionPage(1, versionPageSize);
                }}
              >
                <Input
                  type="search"
                  aria-label="搜索版本"
                  placeholder="搜索版本名称"
                  value={draftFilter}
                  onChange={(event) => setDraftFilter(event.target.value)}
                />
              </ListFilterBar>
            }
            pagination={
              <Pagination
                total={filteredVersions.length}
                page={currentVersionPage}
                pageSize={versionPageSize}
                pageSizeOptions={versionPageSizes}
                onChange={changeVersionPage}
              />
            }
          />
        </section>
      )}
      {error && !modal && <Feedback kind="error">{error}</Feedback>}
      {(modal === 'new' || modal === 'publish') && (
        <Modal
          title={modal === 'new' ? '创建草稿版本' : '发布版本'}
          onClose={() => setModal(undefined)}
          closeDisabled={busy}
          returnFocus={modalTrigger}
          size="standard"
          actions={
            modal === 'publish' && (
              <>
                {selected?.head && (
                  <Button variant="secondary" onClick={() => setCompareRelease(true)}>
                    与上次发布对比
                  </Button>
                )}
                <Button type="submit" form={publishFormId} disabled={busy || !profile}>
                  {busy ? '正在提交…' : '确认发布'}
                </Button>
              </>
            )
          }
        >
          <form
            id={modal === 'publish' ? publishFormId : undefined}
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {modal === 'publish' ? (
              <FormLayout
                intro={<p>发布「{selected?.name}」当前保存的配置，成功后此版本只读。</p>}
                feedback={error && <Feedback kind="error">{error}</Feedback>}
              >
                <Field label="发布名称">{(control) => <Input {...nameInput} {...control} />}</Field>
                <Field label="Web 视图">
                  {(control) => (
                    <StudioSelect
                      {...control}
                      value={profile}
                      onValueChange={(v) => {
                        setProfile(v);
                        setKey(crypto.randomUUID());
                      }}
                    >
                      <option value="">选择视图</option>
                      {profiles.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </StudioSelect>
                  )}
                </Field>
              </FormLayout>
            ) : (
              <FormLayout
                feedback={error && <Feedback kind="error">{error}</Feedback>}
                actions={
                  <Button type="submit" disabled={busy}>
                    {busy ? '正在提交…' : '创建并编辑'}
                  </Button>
                }
              >
                <Field label="版本名称">{(control) => <Input {...nameInput} {...control} />}</Field>
              </FormLayout>
            )}
          </form>
        </Modal>
      )}
      {modal === 'publish' && compareRelease && selected?.head && (
        <ConfigDiff
          split
          path={path}
          initialLeft="latest-release"
          initialRight={selected.head}
          draft={selected.text}
          versions={selected.history}
          choose={false}
          onClose={() => setCompareRelease(false)}
        />
      )}
      {modal === 'history' && selected && (
        <Modal title="保存历史" onClose={() => setModal(undefined)} returnFocus={modalTrigger}>
          <h3>{selected.name}</h3>
          {selected.history.map((v, i) => (
            <article key={v.versionId} className="working-version">
              <div>
                <strong>第 {selected.history.length - i} 次保存</strong>
                <small>
                  {new Date(v.savedAt).toLocaleString('zh-CN')} · {v.note || v.name || '无备注'}
                </small>
              </div>
              <Button
                variant="secondary"
                data-return-focus={'snapshot-' + v.versionId}
                onClick={() => visit({ tab: 'history', version: v.versionId }, '保存历史')}
              >
                查看快照
              </Button>
            </article>
          ))}
          {selected.history.length > 1 && (
            <Button onClick={() => setModal('compare')}>对比快照</Button>
          )}
        </Modal>
      )}
      {modal === 'compare' && selected && (
        <ConfigDiff
          split
          path={path}
          initialLeft={selected.history[1].versionId}
          initialRight={selected.history[0].versionId}
          versions={selected.history}
          draft={selected.text}
          choose
          onClose={() => setModal('history')}
        />
      )}
      {modal === 'edit' && (
        <Modal
          title="编辑名称与说明"
          size="standard"
          returnFocus={modalTrigger}
          closeDisabled={busy}
          onClose={closeFormAction}
        >
          <FormManagement
            form={form}
            path={path}
            editable={edit}
            disabled={props.navigating}
            onMetadata={props.onMetadata}
            onEditClose={closeFormAction}
            onBusyChange={setBusy}
          />
        </Modal>
      )}
      {modal === 'copy' && form.version && (
        <Modal
          title="复制为新表单"
          size="standard"
          returnFocus={modalTrigger}
          closeDisabled={busy}
          onClose={closeFormAction}
        >
          <CopyForm
            path={path}
            versionId={form.version.versionId}
            disabled={props.navigating}
            allowNew={edit}
            onBusyChange={setBusy}
            onClose={(copiedName) => {
              closeFormAction();
              if (copiedName) setFormNotice(`已创建「${copiedName}」，可在表单列表中打开。`);
            }}
          />
        </Modal>
      )}
      {(modal === 'archive' || modal === 'restore') && (
        <Modal
          title={modal === 'archive' ? '归档表单' : '恢复表单'}
          size="standard"
          returnFocus={modalTrigger}
          closeDisabled={busy}
          onClose={closeFormAction}
          actions={
            <Button
              disabled={busy || !props.canManage || props.navigating}
              onClick={() => void changeArchiveState(modal)}
            >
              {modal === 'archive' ? '确认归档' : '确认恢复'}
            </Button>
          }
        >
          <p>
            {modal === 'archive'
              ? `归档「${form.name}」后将停止编辑和新发布，已有发布仍可装载。`
              : `将「${form.name}」恢复到使用中列表。`}
          </p>
          {error && <Feedback kind="error">{error}</Feedback>}
        </Modal>
      )}
      {modal === 'records' && props.canManage && (
        <OperationRecords
          kind="form"
          title="表单操作记录"
          path={path + '/operations'}
          onClose={() => setModal(undefined)}
          initialFilters={recordFilters}
          onVersion={(id, filters) => visit({ tab: 'history', version: id }, '操作记录', filters)}
          onRelease={(id, filters) => visit({ tab: 'releases', release: id }, '操作记录', filters)}
        />
      )}
    </div>
  );
}
