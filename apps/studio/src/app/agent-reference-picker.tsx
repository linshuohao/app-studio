'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Button,
  CardList,
  DataTable,
  Input,
  Pagination,
  type Column,
} from '@form-engine/studio-design-components';
import { Feedback } from '@form-engine/studio-design-components/controls';
import { StudioSelect } from '@form-engine/studio-design-components/select';
import { referenceId, type DiagnosticReference, type MessageReference } from './agent-conversation';
import { Modal } from './modal';

export type ReferenceOption = {
  reference: MessageReference;
  keywords: string;
  category?: string;
  description?: string;
  occurredAt?: string;
};

type DiagnosticPage = { items: Array<DiagnosticReference & { occurredAt: string }>; total: number };

const pageSizes = [8, 16, 32];
const savedTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
const evidenceStatus: Record<string, string> = {
  captured: '现场可用',
  expired: '现场已过期',
  missing: '无现场',
  too_large: '现场超出上报限制',
  serialization_failed: '现场保存失败',
};

export function AgentReferencePicker({
  kind,
  label,
  search,
  options,
  error,
  onSearch,
  onSelect,
  onClose,
}: {
  kind: 'form' | 'function' | 'material' | 'diagnostic';
  label: string;
  search: string;
  options?: readonly ReferenceOption[];
  error: string;
  onSearch: (value: string) => void;
  onSelect: (reference: MessageReference) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(pageSizes[0]!);
  const input = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const diagnostic = kind === 'diagnostic';
  const material = kind === 'material';
  const query = search.trim();
  const requestKey = new URLSearchParams({
    q: query,
    page: String(page),
    limit: String(pageSize),
  }).toString();
  const [remote, setRemote] = useState<{
    key: string;
    query: string;
    result?: DiagnosticPage;
    error?: string;
  }>();
  useEffect(() => {
    if (!diagnostic) return;
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        void fetch('/api/platform/diagnostics/references?' + requestKey, {
          cache: 'no-store',
          signal: controller.signal,
        })
          .then(async (response) => {
            if (response.status === 401 || response.status === 403)
              throw new Error('当前账号无权查看错误记录。');
            if (!response.ok) throw new Error('无法读取错误记录。');
            const result: DiagnosticPage = await response.json();
            if (controller.signal.aborted) return;
            setRemote({ key: requestKey, query, result });
            const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
            if (page > lastPage) setPage(lastPage);
          })
          .catch((reason: Error) => {
            if (!controller.signal.aborted)
              setRemote({ key: requestKey, query, error: reason.message });
          });
      },
      query ? 150 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [diagnostic, requestKey, query, page, pageSize]);
  const categoryLabel = kind === 'form' ? '表单状态' : '用途分类';
  const categories = [...new Set(options?.flatMap((row) => (row.category ? [row.category] : [])))];
  const words = search.trim().toLocaleLowerCase().split(/\s+/u);
  const matches = options?.filter(
    ({ category: value, keywords }) =>
      (!category || category === value) &&
      words.every((word) => keywords.toLocaleLowerCase().includes(word)),
  );
  const currentRemote = remote?.key === requestKey ? remote : undefined;
  const total = diagnostic
    ? remote?.query === query
      ? (remote.result?.total ?? 0)
      : 0
    : (matches?.length ?? 0);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
  const rows: ReferenceOption[] = diagnostic
    ? (currentRemote?.result?.items.map((reference) => ({
        reference,
        keywords: reference.diagnosticId,
        description: reference.diagnosticId,
        occurredAt: reference.occurredAt,
      })) ?? [])
    : (matches?.slice((currentPage - 1) * pageSize, currentPage * pageSize) ?? []);
  const loadError = error || currentRemote?.error;
  const loading = diagnostic ? !currentRemote : !options;
  const empty = loadError || loading ? null : '没有匹配的可引用记录。';
  const pagination =
    total > 0 ? (
      <Pagination
        total={total}
        page={currentPage}
        pageSize={pageSize}
        pageSizeOptions={pageSizes}
        onChange={(nextPage, size) => {
          setPage(nextPage);
          setPageSize(size);
          scrollToStart();
        }}
      />
    ) : undefined;

  useEffect(() => {
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  function buttons() {
    return Array.from(
      results.current?.querySelectorAll<HTMLButtonElement>('[data-reference-option]') ?? [],
    );
  }

  function scrollToStart() {
    results.current?.querySelector('[data-return-scroll]')?.scrollTo({ top: 0 });
  }

  const columns: Column<ReferenceOption>[] = [
    {
      key: 'name',
      title: kind === 'diagnostic' ? '表单' : label,
      render: ({ reference, description }) => (
        <div className="agent-reference-cell">
          <Button
            variant="text"
            className="agent-reference-row-trigger"
            data-reference-option=""
            aria-label={`引用 ${reference.name}`}
            onClick={() => onSelect(reference)}
          >
            {reference.name}
          </Button>
          {description && <small title={description}>{description}</small>}
        </div>
      ),
    },
    {
      key: 'category',
      title: diagnostic ? '错误' : kind === 'form' ? '状态' : categoryLabel,
      render: ({ reference, category: value }) =>
        'kind' in reference && reference.kind === 'diagnostic' ? (
          <div className="agent-reference-cell">
            <code>{reference.errorCode}</code>
            <small>{reference.phase}</small>
          </div>
        ) : kind === 'form' ? (
          <span className="form-list-badge">{value}</span>
        ) : (
          value || '未分类'
        ),
    },
    {
      key: 'version',
      title: diagnostic ? '发生情况' : '引用版本',
      render: ({ reference, occurredAt }) => {
        if (!('kind' in reference))
          return (
            <div className="agent-reference-cell">
              <time dateTime={reference.savedAt}>
                {savedTime.format(new Date(reference.savedAt))}
              </time>
              <small>
                <code title={reference.versionId}>{reference.versionId.slice(0, 8)}</code>
              </small>
            </div>
          );
        if (reference.kind === 'diagnostic')
          return (
            <div className="agent-reference-cell">
              {occurredAt && (
                <time dateTime={occurredAt}>{savedTime.format(new Date(occurredAt))}</time>
              )}
              <small>{evidenceStatus[reference.evidenceStatus] ?? reference.evidenceStatus}</small>
            </div>
          );
        return <code>v{reference.assetVersion}</code>;
      },
    },
  ];

  return (
    <Modal
      title={'引用' + label}
      size="wide"
      className="agent-reference-dialog agent-reference-dialog-list"
      onClose={onClose}
      toolbar={
        <div className="agent-reference-filters" role="search" aria-label={`${label}筛选`}>
          <Input
            type="search"
            ref={input}
            aria-label={'搜索' + label}
            placeholder={diagnostic ? '搜索表单名称、错误码或错误 ID' : '搜索名称、标识或说明'}
            maxLength={diagnostic ? 200 : undefined}
            value={search}
            onChange={(event) => {
              setPage(1);
              onSearch(event.currentTarget.value);
              scrollToStart();
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (event.key === 'ArrowDown' || event.key === 'Enter') {
                event.preventDefault();
                const first = buttons()[0];
                if (event.key === 'ArrowDown') first?.focus();
                else first?.click();
              }
            }}
          />
          {!diagnostic && (
            <StudioSelect
              aria-label={categoryLabel}
              visibleLabel={categoryLabel}
              value={category}
              onValueChange={(value) => {
                setCategory(value);
                setPage(1);
                scrollToStart();
              }}
            >
              <option value="">{kind === 'form' ? '全部状态' : '全部分类'}</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </StudioSelect>
          )}
          {(search || category) && (
            <Button
              variant="text"
              onClick={() => {
                setCategory('');
                setPage(1);
                onSearch('');
                scrollToStart();
                input.current?.focus();
              }}
            >
              重置
            </Button>
          )}
        </div>
      }
    >
      <div
        className={material ? 'agent-reference-card-results' : 'agent-reference-table'}
        ref={results}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          const items = buttons();
          const index = items.indexOf(event.target as HTMLButtonElement);
          if (index < 0) return;
          event.preventDefault();
          if (event.key === 'ArrowUp' && index === 0) input.current?.focus();
          else items[index + (event.key === 'ArrowDown' ? 1 : -1)]?.focus();
        }}
      >
        {loadError && <Feedback kind="error">{loadError}</Feedback>}
        {!loadError && loading && <Feedback kind="status">正在加载…</Feedback>}
        {material ? (
          <CardList
            layout="fill"
            label="可引用物料"
            items={rows}
            itemKey={({ reference }) => referenceId(reference)}
            empty={empty}
            pagination={pagination}
            renderItem={({ reference, category: value, description }) => (
              <Button
                variant="secondary"
                data-reference-option=""
                className="agent-reference-card"
                aria-label={`引用 ${reference.name}`}
                aria-description={[description, value].filter(Boolean).join('，')}
                onClick={() => onSelect(reference)}
              >
                <strong>{reference.name}</strong>
                {description && (
                  <span className="agent-reference-card-description">{description}</span>
                )}
                <span className="agent-reference-card-meta">
                  {value && <span className="form-list-badge">{value}</span>}
                  {'kind' in reference && reference.kind === 'material' && (
                    <code>v{reference.assetVersion}</code>
                  )}
                </span>
              </Button>
            )}
          />
        ) : (
          <DataTable
            label={'可引用' + label}
            layout="fill"
            rows={rows}
            columns={columns}
            rowKey={({ reference }) => referenceId(reference)}
            empty={empty}
            pagination={pagination}
          />
        )}
      </div>
    </Modal>
  );
}
