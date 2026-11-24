'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Button,
  DataTable,
  IconButton,
  Input,
  ListFilterBar,
  Pagination,
  Tabs,
  type Column,
} from '../components/ui';
import { Feedback } from '../components/ui/controls';
import { ReleaseHostExample, ReleaseIntegration } from './host/requirements';
import { Modal } from './modal';
import {
  failureMessage,
  platform,
  type VersionSummary,
  type Release,
  type ReleaseDiagnostic,
} from './platform-api';
import { releaseLabel, versionLabel } from './record-labels';
import './release-workspace.css';

const pageSizes = [10, 20, 50];
const defaultList = { search: '', page: 1, pageSize: 20 };
const timestamp = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });

export type ReleaseListView = typeof defaultList;

function targetLabel(release: Release) {
  return [
    release.target.platform === 'web' ? 'Web' : release.target.platform,
    release.target.profile,
  ].join(' / ');
}

function ReleaseTime({ release }: { release: Release }) {
  return release.publishedAt ? (
    <time dateTime={release.publishedAt}>{timestamp.format(new Date(release.publishedAt))}</time>
  ) : (
    '未记录'
  );
}

function ReleaseList({
  rows,
  releaseHref,
  versionName,
  initial,
  onSelect,
}: {
  rows: Release[];
  releaseHref: (id: string) => string;
  versionName: (id: string) => string;
  initial?: ReleaseListView;
  onSelect: (id: string, view: ReleaseListView, trigger: HTMLElement) => void;
}) {
  const [list, setList] = useState(initial ?? defaultList);
  const [draftSearch, setDraftSearch] = useState(list.search);
  const panel = useRef<HTMLElement>(null);
  const search = list.search.toLocaleLowerCase();
  const filtered = rows.filter((record) =>
    [releaseLabel(record), versionName(record.versionId)].some((value) =>
      value.toLocaleLowerCase().includes(search),
    ),
  );
  const page = Math.min(list.page, Math.max(1, Math.ceil(filtered.length / list.pageSize)));
  const first = (page - 1) * list.pageSize;
  function update(next: ReleaseListView) {
    setList(next);
    const results = panel.current?.querySelector('[data-return-scroll]');
    if (results) results.scrollTop = 0;
  }
  const columns: Column<Release>[] = [
    {
      key: 'name',
      title: '发布名称',
      render: (record) => (
        <a
          className="studio-button release-row-name"
          data-variant="text"
          href={releaseHref(record.releaseId)}
          title={releaseLabel(record)}
          data-return-focus={'release-row-' + record.releaseId}
          onClick={(event) => {
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.altKey ||
              event.shiftKey
            )
              return;
            event.preventDefault();
            onSelect(record.releaseId, { ...list, page }, event.currentTarget);
          }}
        >
          {releaseLabel(record)}
        </a>
      ),
    },
    {
      key: 'version',
      title: '配置版本',
      render: (record) => <span title={record.versionId}>{versionName(record.versionId)}</span>,
    },
    { key: 'target', title: '发布目标', render: targetLabel },
    { key: 'time', title: '发布时间', render: (release) => <ReleaseTime release={release} /> },
    {
      key: 'actor',
      title: '发布人',
      render: (record) =>
        record.publishedBy ? (
          <code className="release-actor" title={record.publishedBy}>
            {record.publishedBy}
          </code>
        ) : (
          '未记录'
        ),
    },
  ];
  return (
    <section ref={panel} className="studio-release-list" aria-label="发布记录">
      <DataTable
        layout="fill"
        label="发布记录列表"
        columns={columns}
        rows={filtered.slice(first, first + list.pageSize)}
        rowKey={(record) => record.releaseId}
        empty={list.search ? '没有符合条件的发布记录。' : '暂无发布记录。'}
        filters={
          <ListFilterBar
            label="发布记录筛选"
            layout="search"
            onApply={() => update({ ...list, search: draftSearch.trim(), page: 1 })}
            onReset={() => {
              setDraftSearch('');
              update({ ...list, search: '', page: 1 });
            }}
          >
            <Input
              type="search"
              aria-label="搜索发布记录"
              placeholder="搜索发布名称或配置版本"
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
            />
          </ListFilterBar>
        }
        pagination={
          <Pagination
            total={filtered.length}
            page={page}
            pageSize={list.pageSize}
            pageSizeOptions={pageSizes}
            onChange={(nextPage, pageSize) => update({ ...list, page: nextPage, pageSize })}
          />
        }
      />
    </section>
  );
}

const diagnosisColumns: Column<ReleaseDiagnostic>[] = [
  { key: 'code', title: '诊断代码', render: (row) => <code>{row.code}</code> },
  { key: 'pointer', title: '配置路径', render: (row) => <code>{row.sourcePointer || '—'}</code> },
  { key: 'message', title: '说明', render: (row) => row.message },
];

function ReleaseDetail({
  release,
  versionName,
  onBack,
  backLabel,
  onVersion,
}: {
  release: Release;
  versionName: string;
  onBack: () => void;
  backLabel: string;
  onVersion: (id: string) => void;
}) {
  const [diagnosticsTrigger, showDiagnostics] = useState<HTMLButtonElement>();
  const [copyStatus, setCopyStatus] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (document.activeElement === document.body && !history.state?.studioList?.position?.focus)
      heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section className="studio-release-detail" aria-label="发布详情">
      <header className="studio-release-heading">
        <IconButton icon="ChevronLeft" aria-label={backLabel} title={backLabel} onClick={onBack} />
        <div className="toolbar page-title">
          <h1 ref={heading} tabIndex={-1}>
            {releaseLabel(release)}
          </h1>
          <div className="action-row">
            <Button variant="secondary" onClick={(event) => showDiagnostics(event.currentTarget)}>
              发布诊断（{release.diagnostics.length}）
            </Button>
            <a
              className="studio-button release-host-link"
              data-variant="primary"
              href={'/host?releaseId=' + encodeURIComponent(release.releaseId)}
              target="_blank"
              rel="noreferrer"
            >
              在示例 Host 中打开
            </a>
          </div>
        </div>
      </header>
      <Tabs.Root defaultValue="info" bordered className="studio-release-tabs">
        <Tabs.List aria-label="发布详情视图">
          <Tabs.Tab value="info">发布信息</Tabs.Tab>
          <Tabs.Tab value="integration">Host 接入</Tabs.Tab>
          <Tabs.Tab value="capabilities">所需宿主能力</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="info" data-return-scroll>
          <dl className="release-facts">
            <div>
              <dt>配置版本</dt>
              <dd>
                <Button
                  variant="text"
                  data-return-focus={'release-version-' + release.releaseId}
                  aria-label={'查看配置版本 ' + release.versionId}
                  onClick={() => onVersion(release.versionId)}
                >
                  {versionName}
                </Button>
              </dd>
            </div>
            <div>
              <dt>发布目标</dt>
              <dd>{targetLabel(release)}</dd>
            </div>
            <div>
              <dt>发布时间</dt>
              <dd>
                <ReleaseTime release={release} />
              </dd>
            </div>
            <div>
              <dt>发布人</dt>
              <dd>{release.publishedBy ? <code>{release.publishedBy}</code> : '未记录'}</dd>
            </div>
            <div className="release-identity">
              <dt>发布标识</dt>
              <dd className="action-row">
                <code translate="no">{release.releaseId}</code>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(release.releaseId);
                      setCopyStatus('已复制');
                    } catch {
                      setCopyStatus('复制失败，请选择标识手动复制。');
                    }
                  }}
                >
                  复制 ID
                </Button>
                <span role="status">{copyStatus}</span>
              </dd>
            </div>
          </dl>
        </Tabs.Panel>
        <Tabs.Panel value="integration">
          <ReleaseHostExample releaseId={release.releaseId} />
        </Tabs.Panel>
        <Tabs.Panel value="capabilities">
          <ReleaseIntegration releaseId={release.releaseId} layout="capabilities" />
        </Tabs.Panel>
      </Tabs.Root>
      {diagnosticsTrigger && (
        <Modal
          title="发布诊断"
          size="wide"
          returnFocus={diagnosticsTrigger}
          onClose={() => showDiagnostics(undefined)}
        >
          <div className="release-diagnostics-table">
            <DataTable
              label="发布诊断列表"
              columns={diagnosisColumns}
              rows={release.diagnostics.map((diagnostic, index) => ({ ...diagnostic, index }))}
              rowKey={(row) => row.index}
              empty="此次发布没有诊断记录。"
            />
          </div>
        </Modal>
      )}
    </section>
  );
}

export function ReleaseWorkspace({
  path,
  releaseId,
  releaseHref,
  initialList,
  onSelect,
  onBack,
  backLabel,
  onVersion,
}: {
  path: string;
  releaseId?: string;
  releaseHref: (id: string) => string;
  initialList?: ReleaseListView;
  onSelect: (id: string, view: ReleaseListView, trigger: HTMLElement) => void;
  onBack: () => void;
  backLabel: string;
  onVersion: (id: string) => void;
}) {
  const [response, setResponse] = useState<{ rows: Release[]; versions: VersionSummary[] }>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void Promise.all([
      platform<Release[]>(path + '/releases'),
      platform<VersionSummary[]>(path + '/versions').catch(() => []),
    ]).then(
      ([rows, versions]) => {
        if (active) setResponse({ rows, versions });
      },
      (reason) => {
        if (active) setError(failureMessage(reason));
      },
    );
    return () => {
      active = false;
    };
  }, [path, retry]);
  const selected = releaseId && response?.rows.find((release) => release.releaseId === releaseId);
  function versionName(id: string) {
    const version = response?.versions.find((item) => item.versionId === id);
    return version ? versionLabel(version) : '配置 · ' + id.slice(0, 8);
  }
  if (selected)
    return (
      <ReleaseDetail
        key={selected.releaseId}
        release={selected}
        versionName={versionName(selected.versionId)}
        onBack={onBack}
        backLabel={backLabel}
        onVersion={onVersion}
      />
    );
  if (response && !releaseId)
    return (
      <ReleaseList
        rows={response.rows}
        releaseHref={releaseHref}
        versionName={versionName}
        initial={initialList}
        onSelect={onSelect}
      />
    );

  return (
    <section className="studio-release-load">
      {releaseId && (
        <IconButton icon="ChevronLeft" aria-label={backLabel} title={backLabel} onClick={onBack} />
      )}
      {error ? (
        <div className="action-row">
          <Feedback kind="error">{error}</Feedback>
          <Button
            variant="secondary"
            onClick={() => {
              setError('');
              setRetry((count) => count + 1);
            }}
          >
            重试
          </Button>
        </div>
      ) : response ? (
        <Feedback kind="error">找不到指定发布记录，请选择其他记录。</Feedback>
      ) : (
        <Feedback kind="status">正在载入发布记录…</Feedback>
      )}
    </section>
  );
}
