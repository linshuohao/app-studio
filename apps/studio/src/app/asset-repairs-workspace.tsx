'use client';

import { PageHeading } from './page-heading';

import { useEffect, useState } from 'react';
import {
  DataTable,
  ListFilterBar,
  Pagination,
  Tabs,
  type Column,
} from '@form-engine/studio-design-components';
import { Button, Feedback, Input } from '@form-engine/studio-design-components/controls';
import { StudioSelect } from '@form-engine/studio-design-components/select';
import type { DiagnosticAssetCandidate } from './agent-conversation';
import { failureMessage, platform, type Access } from './platform-api';
import { studioUrl } from './studio-location';
import { diagnosticExplanation } from './diagnostics/diagnostic-explanation';
import './asset-repairs.css';

const statusLabel = {
  open: '待认领',
  in_progress: '处理中',
  in_review: '待人工审查',
  changes_requested: '待修改',
  approved: '人工审查已通过',
};
const githubStatusLabel = {
  open: '开启',
  draft: '草稿',
  closed: '已关闭',
  merged: '已合并',
  unavailable: '暂不可用',
};

type PullRequest = { url: string };
type Task = {
  id: string;
  formId: string;
  formName: string;
  releaseId: string;
  versionId: string;
  asset: DiagnosticAssetCandidate['lock'];
  kind: DiagnosticAssetCandidate['kind'];
  status: keyof typeof statusLabel;
  pullRequest: PullRequest | null;
  githubStatus?: keyof typeof githubStatusLabel;
};
type Detail = Task & {
  repository: string | null;
  occurrences: {
    diagnosticId: string;
    errorCode: string | null;
  }[];
};
const root = '/asset-repairs';
export type AssetRepairView = 'tasks' | 'reviews';
type Reviews = { rows: Task[]; repository: string | null };
type Filters = { query: string; status: string; githubStatus: string };
const defaultFilters: Filters = { query: '', status: '', githubStatus: '' };
const pageSizes = [10, 20, 50];
const defaultList = { filters: defaultFilters, draft: defaultFilters, page: 1, pageSize: 10 };

function pullRequestLink(pr: PullRequest | null, repository: string | null) {
  const match = pr && /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/[1-9][0-9]*$/.exec(pr.url);
  return repository && match?.[1]?.toLowerCase() === repository.toLowerCase() ? pr?.url : undefined;
}

export function AssetRepairsWorkspace({
  taskId,
  view,
  access,
  onNavigate,
}: {
  taskId?: string;
  view: AssetRepairView;
  access: Access;
  onNavigate: (view: AssetRepairView, id?: string) => void;
}) {
  const [result, setResult] = useState<{
    path: string;
    rows?: Task[];
    reviews?: Reviews;
    detail?: Detail;
    error?: string;
  }>();
  const [refresh, setRefresh] = useState(0);
  const reviewing = view === 'reviews';
  const [lists, setLists] = useState({ tasks: defaultList, reviews: defaultList });
  const list = lists[view];
  function updateList(changes: Partial<typeof defaultList>) {
    setLists((current) => ({
      ...current,
      [view]: { ...current[view], ...changes },
    }));
  }
  const path = taskId
    ? root + '/' + encodeURIComponent(taskId)
    : reviewing
      ? root + '/reviews'
      : root;
  useEffect(() => {
    const controller = new AbortController();
    const load = taskId
      ? platform<Detail>(path).then((detail) => ({ path, detail }))
      : reviewing
        ? platform<Reviews>(path).then((reviews) => ({ path, reviews }))
        : platform<Task[]>(path).then((rows) => ({ path, rows }));
    void load.then(
      (value) => {
        if (!controller.signal.aborted) setResult(value);
      },
      (reason: unknown) => {
        if (!controller.signal.aborted) setResult({ path, error: failureMessage(reason) });
      },
    );
    return () => controller.abort();
  }, [path, taskId, reviewing, refresh]);
  const current = result?.path === path ? result : undefined;
  const reload = () => setRefresh((value) => value + 1);
  const repository = current?.reviews?.repository ?? null;
  const rows = reviewing
    ? current?.reviews?.rows.filter(({ pullRequest }) => pullRequestLink(pullRequest, repository))
    : current?.rows;
  const { filters, draft, pageSize } = list;
  const query = filters.query.trim().toLowerCase();
  const matching = (rows ?? []).filter((task) => {
    const pr = reviewing ? pullRequestLink(task.pullRequest, repository)?.split('/').at(-1) : null;
    const searchText = [task.asset.id, task.asset.version, task.formName, pr && '#' + pr]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return (
      (!query || searchText.includes(query)) &&
      (!filters.status || task.status === filters.status) &&
      (!reviewing ||
        !filters.githubStatus ||
        (task.githubStatus ?? 'unavailable') === filters.githubStatus)
    );
  });
  const page = Math.min(list.page, Math.max(1, Math.ceil(matching.length / pageSize)));
  const label = reviewing ? 'PR 审查列表' : '资产修复任务列表';
  const columns: Column<Task>[] = [
    { key: 'asset', title: '资产', render: ({ asset }) => asset.id + ' · ' + asset.version },
    { key: 'form', title: '表单', render: ({ formName }) => formName },
    ...(reviewing
      ? [
          {
            key: 'pr',
            title: 'PR',
            render: ({ pullRequest }: Task) => {
              const href = pullRequestLink(pullRequest, repository);
              return href ? (
                <a href={href} target="_blank" rel="noreferrer">
                  #{href.split('/').at(-1)}
                </a>
              ) : null;
            },
          },
          {
            key: 'github-status',
            title: 'GitHub 状态',
            render: ({ githubStatus }: Task) => githubStatusLabel[githubStatus ?? 'unavailable'],
          },
        ]
      : [{ key: 'status', title: '任务状态', render: ({ status }: Task) => statusLabel[status] }]),
    {
      key: 'open',
      title: '操作',
      render: (task) => (
        <Button
          variant="secondary"
          aria-label={'打开资产修复任务 ' + task.asset.id}
          onClick={() => onNavigate(view, task.id)}
        >
          查看任务
        </Button>
      ),
    },
  ];
  return (
    <>
      <PageHeading
        title={taskId ? '资产修复任务' : '资产修复'}
        className={taskId ? undefined : 'form-list-heading'}
        back={
          taskId
            ? {
                label: reviewing ? '返回 PR 审查列表' : '返回任务列表',
                onClick: () => onNavigate(view),
              }
            : undefined
        }
      >
        <Button variant="secondary" onClick={reload}>
          刷新
        </Button>
      </PageHeading>
      {current?.error && <Feedback kind="error">{current.error}</Feedback>}
      {!current && <Feedback kind="status">正在读取资产修复任务…</Feedback>}
      {!taskId && (
        <Tabs.Root
          className="asset-repair-lists"
          value={view}
          onValueChange={(value) => onNavigate(value === 'reviews' ? 'reviews' : 'tasks')}
        >
          <Tabs.List aria-label="资产修复列表">
            <Tabs.Tab value="tasks">任务列表</Tabs.Tab>
            <Tabs.Tab value="reviews">PR 审查</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel key={view} value={view}>
            {reviewing && current?.reviews && !repository && (
              <Feedback kind="status">尚未配置资产代码仓库。</Feedback>
            )}
            {rows && (
              <DataTable
                layout="fill"
                label={label}
                columns={columns}
                rows={matching.slice((page - 1) * pageSize, page * pageSize)}
                rowKey={(task) => task.id}
                empty={
                  rows.length
                    ? '没有匹配的结果。可以更换关键词或重置筛选。'
                    : reviewing
                      ? '暂无关联的 GitHub PR。'
                      : '暂无资产修复任务。'
                }
                filters={
                  <ListFilterBar
                    label={'筛选' + label}
                    onApply={() => updateList({ filters: draft, page: 1 })}
                    onReset={() =>
                      updateList({ filters: defaultFilters, draft: defaultFilters, page: 1 })
                    }
                  >
                    <Input
                      aria-label={reviewing ? '搜索资产、表单或 PR' : '搜索资产或表单'}
                      type="search"
                      placeholder={reviewing ? '搜索资产、表单或 PR 编号…' : '搜索资产或表单…'}
                      value={draft.query}
                      onChange={(event) =>
                        updateList({ draft: { ...draft, query: event.target.value } })
                      }
                    />
                    <StudioSelect
                      visibleLabel="任务状态"
                      value={draft.status}
                      onValueChange={(status) => updateList({ draft: { ...draft, status } })}
                    >
                      <option value="">全部任务状态</option>
                      {Object.entries(statusLabel).map(([value, text]) => (
                        <option key={value} value={value}>
                          {text}
                        </option>
                      ))}
                    </StudioSelect>
                    {reviewing && (
                      <StudioSelect
                        visibleLabel="GitHub 状态"
                        value={draft.githubStatus}
                        onValueChange={(githubStatus) =>
                          updateList({ draft: { ...draft, githubStatus } })
                        }
                      >
                        <option value="">全部 GitHub 状态</option>
                        {Object.entries(githubStatusLabel).map(([value, text]) => (
                          <option key={value} value={value}>
                            {text}
                          </option>
                        ))}
                      </StudioSelect>
                    )}
                  </ListFilterBar>
                }
                pagination={
                  <Pagination
                    total={matching.length}
                    page={page}
                    pageSize={pageSize}
                    pageSizeOptions={pageSizes}
                    onChange={(nextPage, size) => updateList({ page: nextPage, pageSize: size })}
                  />
                }
              />
            )}
          </Tabs.Panel>
        </Tabs.Root>
      )}
      {current?.detail && (
        <AssetRepairDetail
          task={current.detail}
          canViewDiagnostic={access.permissions.includes('diagnostic:view')}
        />
      )}
    </>
  );
}

function AssetRepairDetail({
  task,
  canViewDiagnostic,
}: {
  task: Detail;
  canViewDiagnostic: boolean;
}) {
  const prUrl = pullRequestLink(task.pullRequest, task.repository);
  const waitingForPR = task.pullRequest && !prUrl;

  return (
    <section className="surface authoring-panel asset-repair-detail" aria-label="资产修复详情">
      <div className="asset-repair-heading">
        <h2>
          {task.asset.id} · {task.asset.version}
        </h2>
        {!prUrl && (
          <span
            className="asset-repair-status"
            data-status={waitingForPR ? undefined : task.status}
          >
            {waitingForPR ? '待关联 PR' : statusLabel[task.status]}
          </span>
        )}
      </div>
      <dl className="asset-repair-locks">
        <div>
          <dt>原制品</dt>
          <dd>
            <code title={task.asset.artifact.digest}>{task.asset.artifact.digest}</code>
          </dd>
        </div>
        <div>
          <dt>原契约</dt>
          <dd>
            <code title={task.asset.manifestDigest}>{task.asset.manifestDigest}</code>
          </dd>
        </div>
      </dl>
      <div className="asset-repair-references">
        <div>
          <span>原发布</span>
          <a
            href={studioUrl({ form: task.formId, tab: 'releases', release: task.releaseId })}
            title={task.releaseId}
          >
            {task.formName}
          </a>
        </div>
        {task.occurrences.length > 0 && (
          <div>
            <span>关联错误</span>
            <ul aria-label="关联错误">
              {task.occurrences.map(({ diagnosticId, errorCode }) => {
                const label = errorCode
                  ? diagnosticExplanation(errorCode).title
                  : '错误 ' + diagnosticId.slice(0, 8);
                return (
                  <li key={diagnosticId}>
                    {canViewDiagnostic ? (
                      <a
                        href={'/diagnostics?event=' + encodeURIComponent(diagnosticId)}
                        title={diagnosticId}
                      >
                        {label}
                      </a>
                    ) : (
                      label
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <div aria-label="关联 PR">
          <span>关联 PR</span>
          {prUrl ? (
            <>
              <a href={prUrl} target="_blank" rel="noreferrer">
                PR #{prUrl.split('/').at(-1)}
              </a>
              <span className="asset-repair-muted">
                {githubStatusLabel[task.githubStatus ?? 'unavailable']}
              </span>
            </>
          ) : (
            <span className="asset-repair-muted">暂无关联的 GitHub PR</span>
          )}
        </div>
      </div>
    </section>
  );
}
