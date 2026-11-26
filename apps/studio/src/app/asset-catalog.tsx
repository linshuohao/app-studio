'use client';
import { CodeBlock } from '../components/code-block';
import { StudioSelect } from '@form-engine/studio-design-components/select';

import { useEffect, useRef, useState } from 'react';
import { JsonEditor } from '../components/json/json-editor';
import { listPosition, restorePosition, writeLocation, type ListPosition } from './studio-location';
import { failureMessage, platform } from './platform-api';
import {
  MaterialDetailPreview,
  type MaterialPreview,
  type MaterialPreviewVariant,
} from './material-detail-preview';
import { Modal } from './modal';
import { MaterialCapabilities } from './material-capabilities';
import { MaterialDescription } from './material-description';
import type { MaterialManifest } from '@form-engine/protocol/capability';
import './material-detail.css';
import {
  Button,
  CardList,
  DataTable,
  Input,
  Icon,
  ListFilterBar,
  Pagination,
  type Column,
} from '@form-engine/studio-design-components';
import { assetReference, type AssetReference } from './agent-conversation';
import { MaterialCard } from './material-card';
import './function-directory.css';

export type Summary = {
  title?: string;
  description?: string;
  summary?: string;
  category?: string;
  implementation?: string;
  id: string;
  version: string;
  artifact: { id: string; digest: string };
};
import { ContractPanel, schemaType, type Schema } from '../components/catalog/contract-reference';
export type Detail = {
  preview?: MaterialPreview;
  previewVariants?: MaterialPreviewVariant[];
  documentation: {
    title?: string;
    summary?: string;
    displayTemplate?: string;
    displayLines?: string[];
    parameterLabels?: Record<string, string>;
    category?: string;
    implementation?: string;
    annotations?: Record<string, string>;
    valueExamples?: { title: string; description: string; value: unknown }[];
    callExamples?: { args: unknown[]; result: unknown; description: string }[];
    requestExamples?: Record<string, { title: string; description: string; value: unknown }[]>;
    description: string;
    source: string;
    examples: { source: string; value: unknown }[];
  } | null;
  manifest: Pick<MaterialManifest, 'events' | 'requests'> & {
    id: string;
    version: string;
    propsSchema?: Schema;
    bindings?: Record<string, { schema: Schema }>;
    slots?: string[];
    parameters?: { name: string; schema: Schema; optional?: boolean }[];
    restParameter?: { name: string; schema: Schema };
    returns?: Schema;
  };
  artifact: Summary['artifact'];
};

const materialPageSizes = [6, 9] as const;
const functionPageSizes = [5, 10, 20] as const;

export function AssetCatalog({
  kind,
  onReference,
}: {
  kind: 'materials' | 'functions';
  onReference?: (reference: AssetReference) => void;
}) {
  const [rows, setRows] = useState<Summary[]>();
  const defaults = { query: '', category: '', implementation: '' };
  const [draftFilters, setDraftFilters] = useState(defaults);
  const [{ query, category, implementation }, setFilters] = useState(defaults);
  const [materialPage, setMaterialPage] = useState(1);
  const [materialPageSize, setMaterialPageSize] = useState<number>(materialPageSizes[0]);
  const materialResults = useRef<HTMLDivElement>(null);
  const materialSearch = useRef<HTMLInputElement>(null);
  const [functionPage, setFunctionPage] = useState(1);
  const [functionPageSize, setFunctionPageSize] = useState<number>(functionPageSizes[0]);
  const functionResults = useRef<HTMLDivElement>(null);
  const functionSearch = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Summary>();
  const [lastMaterial, setLastMaterial] = useState('');
  const catalogPosition = useRef<ListPosition | undefined>(undefined);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const focusDetail = useRef(false);
  const [loadedDetail, setDetail] = useState<Detail>();
  const [detailDialog, setDetailDialog] = useState<{
    kind: 'technical' | 'types' | 'calls' | 'examples';
    trigger: HTMLElement;
  }>();
  const [error, setError] = useState('');

  const title = kind === 'materials' ? '物料目录' : '纯函数目录';
  useEffect(() => {
    const route = () => {
      const q = new URLSearchParams(location.search);
      const id = q.get('asset');
      setDetailDialog(undefined);
      setSelected(
        id
          ? {
              id,
              version: q.get('assetVersion') ?? '',
              artifact: { id: '', digest: q.get('assetDigest') ?? '' },
            }
          : undefined,
      );
    };
    route();
    window.addEventListener('popstate', route);
    return () => window.removeEventListener('popstate', route);
  }, [kind]);
  useEffect(() => {
    if (!selected && catalogPosition.current) return restorePosition(catalogPosition.current);
    if (selected && focusDetail.current) {
      focusDetail.current = false;
      detailHeading.current?.focus();
    }
  }, [kind, selected]);

  function select(row?: Summary, trigger?: HTMLButtonElement) {
    if (row) {
      const focus = (kind === 'materials' ? 'material-' : 'function-') + row.id + ':' + row.version;
      if (kind === 'materials') setLastMaterial(focus);
      catalogPosition.current = { ...listPosition(trigger), focus };
      focusDetail.current = true;
    }
    setDetailDialog(undefined);
    setSelected(row);
    writeLocation({ catalog: kind, asset: row?.id, assetVersion: row?.version });
  }
  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 目录请求切换时清除旧结果，避免将上一个目录显示为当前目录。
    setRows(undefined);
    setError('');
    void platform<Summary[]>(`/catalog/${kind}`).then(
      (result) => {
        if (active) setRows(result);
      },
      (reason) => {
        if (active) setError(failureMessage(reason));
      },
    );
    return () => {
      active = false;
    };
  }, [kind]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 详情请求切换时清除旧资产，异步响应仍由 active 守卫隔离。
    setDetail(undefined);

    setError('');
    if (!selected) return;
    let active = true;
    void platform<Detail>(
      `/catalog/${kind}/${encodeURIComponent(selected.id)}${selected.version ? `?version=${encodeURIComponent(selected.version)}` : ''}`,
    ).then(
      (result) => {
        if (!active) return;
        if (selected.artifact.digest && selected.artifact.digest !== result.artifact.digest) {
          setError('此引用的资产制品已不可用。');
          return;
        }
        setDetail(result);
      },
      (reason) => {
        if (active) setError(failureMessage(reason));
      },
    );
    return () => {
      active = false;
    };
  }, [kind, selected]);

  const visible = rows?.filter(
    (row) =>
      (!category || row.category === category) &&
      (!implementation || row.implementation === implementation) &&
      [row.id, row.title, row.description, row.summary, row.category, row.implementation]
        .join(' ')
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const detail =
    loadedDetail?.manifest.id === selected?.id &&
    (!selected?.version || loadedDetail?.manifest.version === selected.version)
      ? loadedDetail
      : undefined;
  const manifest = detail?.manifest;
  const annotations = detail?.documentation?.annotations ?? {};
  const meaning = (pointer: string) => annotations[pointer] ?? '暂未提供字段说明';
  const parameterSchema: Schema = {
    type: 'object',
    properties: Object.fromEntries((manifest?.parameters ?? []).map((p) => [p.name, p.schema])),
    required: manifest?.parameters?.filter((p) => !p.optional).map((p) => p.name),
    additionalProperties: false,
  };
  const parameterAnnotations: Record<string, string> = {};
  manifest?.parameters?.forEach((p, index) => {
    const target = `/properties/${p.name}`;
    parameterAnnotations[target] = meaning(`/parameters/${index}`);
    for (const [key, value] of Object.entries(annotations))
      if (key.startsWith(`/parameters/${index}/schema/`))
        parameterAnnotations[target + key.slice(`/parameters/${index}/schema`.length)] = value;
  });
  const bindingSchema: Schema = {
    type: 'object',
    properties: Object.fromEntries(
      Object.entries(manifest?.bindings ?? {}).map(([key, b]) => [key, b.schema]),
    ),
    required: Object.keys(manifest?.bindings ?? {}),
    additionalProperties: false,
  };
  const bindingAnnotations: Record<string, string> = {};
  for (const [key] of Object.entries(manifest?.bindings ?? {})) {
    bindingAnnotations[`/properties/${key}`] = meaning(`/bindings/${key}`);
    for (const [path, value] of Object.entries(annotations))
      if (path.startsWith(`/bindings/${key}/schema/`))
        bindingAnnotations[`/properties/${key}` + path.slice(`/bindings/${key}/schema`.length)] =
          value;
  }

  if (selected) {
    const material = kind === 'materials';
    const label = material ? '物料详情' : '纯函数详情';
    const examples = detail?.documentation?.examples ?? [];
    const dialogTitles = {
      technical: '技术信息',
      types: '类型定义与值示例',
      calls: '更多调用示例',
      examples: '配置示例',
    };
    const record = rows?.find(
      (row) => row.id === selected.id && (!selected.version || selected.version === row.version),
    );
    const category = detail?.documentation?.category ?? record?.category;
    const implementation = detail?.documentation?.implementation ?? record?.implementation;
    const summary = detail?.documentation?.summary ?? record?.summary ?? record?.description;
    return (
      <section className="material-detail" aria-label={label} data-studio-ui>
        <header className="material-detail-heading">
          <div className="material-detail-title">
            <Button
              variant="text"
              className="material-detail-back"
              aria-label={'返回' + title}
              title={'返回' + title}
              onClick={() => select()}
            >
              <Icon name="ChevronLeft" />
            </Button>
            <h1 ref={detailHeading} tabIndex={-1}>
              {detail?.documentation?.title ?? record?.title ?? selected.id}
            </h1>
            {!material && examples.length > 0 && (
              <Button
                variant="secondary"
                aria-haspopup="dialog"
                onClick={(event) =>
                  setDetailDialog({ kind: 'examples', trigger: event.currentTarget })
                }
              >
                配置示例
              </Button>
            )}
            <Button
              variant="secondary"
              aria-haspopup="dialog"
              disabled={!detail}
              onClick={(event) =>
                setDetailDialog({ kind: 'technical', trigger: event.currentTarget })
              }
            >
              技术信息
            </Button>
          </div>
          <div className="material-detail-meta">
            {summary && <p>{summary}</p>}
            <p className="material-detail-identity">
              <code translate="no">{selected.id}</code>
              {[manifest?.version || selected.version, category, implementation]
                .filter(Boolean)
                .map((value, index) => (
                  <span key={index}>{value}</span>
                ))}
            </p>
          </div>
        </header>
        <div
          key={selected.id + ':' + selected.version}
          className="material-detail-scroll"
          tabIndex={0}
          aria-label={label + '正文'}
        >
          {error && <p role="alert">{error}</p>}
          {!detail
            ? !error && <p role="status">正在加载资产详情…</p>
            : material
              ? renderMaterialDetail(detail)
              : renderFunctionDetail(detail)}
        </div>
        {detail && detailDialog && (
          <Modal
            title={dialogTitles[detailDialog.kind]}
            size="wide"
            onClose={() => setDetailDialog(undefined)}
            returnFocus={detailDialog.trigger}
          >
            {detailDialog.kind === 'technical' && renderTechnicalInfo(detail)}
            {detailDialog.kind === 'types' && renderMaterialTypes(detail)}
            {detailDialog.kind === 'calls' && (
              <div className="material-detail-dialog-content">
                {detail.documentation?.callExamples
                  ?.slice(1)
                  .map((example, index) =>
                    renderCallExample(detail.manifest.id, example, index + 1),
                  )}
                {detail.documentation?.valueExamples?.map(
                  ({ title, description, value }, index) => (
                    <section key={index}>
                      <h3>{title}</h3>
                      <p>{description}</p>
                      <JsonEditor label={title} initialMode="text" text={JSON.stringify(value)} />
                    </section>
                  ),
                )}
              </div>
            )}
            {detailDialog.kind === 'examples' && (
              <div className="material-detail-dialog-content">
                <p className="muted">
                  配置片段来自工程示例。请在目标表单中配置示例引用的数据和表达式。
                </p>
                {examples.map((example, index) => (
                  <section key={index}>
                    <p className="muted">来源：{example.source}</p>
                    <JsonEditor
                      label={`配置示例 ${index + 1}`}
                      text={JSON.stringify(example.value)}
                    />
                  </section>
                ))}
              </div>
            )}
          </Modal>
        )}
      </section>
    );
  }

  return (
    <>
      <div
        className="page-title toolbar"
        data-studio-ui
        data-material-directory-title={(kind === 'materials' && !selected) || undefined}
      >
        <div>
          <h1>{title}</h1>
          <p>
            {kind === 'materials'
              ? '查找当前 Web 表单可用的物料与属性契约。'
              : '查找表达式可用的函数、参数和返回值。'}
          </p>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {kind === 'functions' ? renderFunctionList() : renderMaterialList()}
    </>
  );

  function renderFilters() {
    return (
      <>
        <StudioSelect
          aria-label="用途分类"
          visibleLabel="分类"
          value={draftFilters.category}
          onValueChange={(category) => setDraftFilters({ ...draftFilters, category })}
        >
          <option value="">全部分类</option>
          {[...new Set(rows?.map((row) => row.category).filter(Boolean))].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </StudioSelect>
        <StudioSelect
          aria-label="实现技术"
          visibleLabel="技术"
          value={draftFilters.implementation}
          onValueChange={(implementation) => setDraftFilters({ ...draftFilters, implementation })}
        >
          <option value="">全部技术</option>
          {[...new Set(rows?.map((row) => row.implementation).filter(Boolean))].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </StudioSelect>
      </>
    );
  }

  function scrollFunctionsToTop() {
    functionResults.current?.querySelector('[data-return-scroll]')?.scrollTo({ top: 0 });
  }

  function resetListPage() {
    if (kind === 'functions') {
      setFunctionPage(1);
      scrollFunctionsToTop();
    } else {
      setMaterialPage(1);
      materialResults.current?.scrollTo(0, 0);
    }
  }

  function catalogFilters(label: string, inputRef: typeof materialSearch) {
    return (
      <ListFilterBar
        label={label}
        onApply={() => {
          setFilters(draftFilters);
          resetListPage();
        }}
        onReset={() => {
          setDraftFilters(defaults);
          setFilters(defaults);
          resetListPage();
        }}
      >
        <Input
          ref={inputRef}
          type="search"
          name="assetSearch"
          aria-label="搜索资产"
          autoComplete="off"
          placeholder="搜索名称、标识或说明…"
          value={draftFilters.query}
          onChange={(event) => setDraftFilters({ ...draftFilters, query: event.target.value })}
        />
        {renderFilters()}
      </ListFilterBar>
    );
  }

  function renderMaterialList() {
    const matching = visible ?? [];
    const page = Math.min(materialPage, Math.max(1, Math.ceil(matching.length / materialPageSize)));
    const start = (page - 1) * materialPageSize;
    return (
      <CardList
        layout="fill"
        label="物料列表"
        items={matching.slice(start, start + materialPageSize)}
        resultsRef={materialResults}
        itemKey={(row) => JSON.stringify([row.id, row.version])}
        empty={rows ? '没有匹配的物料，请调整关键词或筛选条件。' : error ? null : '正在加载目录…'}
        filters={catalogFilters('筛选物料', materialSearch)}
        pagination={
          <Pagination
            total={matching.length}
            page={page}
            pageSize={materialPageSize}
            pageSizeOptions={materialPageSizes}
            onChange={(nextPage, size) => {
              setMaterialPage(nextPage);
              setMaterialPageSize(size);
              materialResults.current?.scrollTo(0, 0);
            }}
          />
        }
        renderItem={(row) => (
          <MaterialCard
            asset={row}
            detailsAction
            selected={lastMaterial === 'material-' + row.id + ':' + row.version}
            onOpen={(trigger) => select(row, trigger)}
            onReference={
              onReference ? () => onReference(assetReference('material', row)) : undefined
            }
          />
        )}
      />
    );
  }

  function renderFunctionList() {
    const matching = visible ?? [];
    const page = Math.min(functionPage, Math.max(1, Math.ceil(matching.length / functionPageSize)));
    const start = (page - 1) * functionPageSize;
    const columns: Column<Summary>[] = [
      {
        key: 'name',
        title: '函数名称',
        render: (row) => (
          <Button
            variant="text"
            className="function-directory-name"
            aria-label={'查看 ' + row.id}
            data-return-focus={'function-' + row.id + ':' + row.version}
            onClick={(event) => select(row, event.currentTarget)}
          >
            {row.title || row.id}
          </Button>
        ),
      },
      {
        key: 'identifier',
        title: '标识',
        render: (row) => (
          <code title={row.id} translate="no">
            {row.id}
          </code>
        ),
      },
      { key: 'category', title: '用途分类', render: (row) => row.category ?? '未分类' },
      {
        key: 'summary',
        title: '说明',
        render: (row) => {
          const summary = row.summary ?? row.description?.split(/\n\s*\n/)[1]?.replace(/`/g, '');
          return (
            <span className="function-directory-summary" title={summary}>
              {summary || '暂无说明'}
            </span>
          );
        },
      },
      {
        key: 'version',
        title: '版本',
        render: (row) => <code translate="no">{row.version}</code>,
      },
      {
        key: 'technology',
        title: '技术',
        render: (row) => row.implementation ?? row.artifact.id,
      },
    ];

    if (onReference)
      columns.push({
        key: 'reference',
        title: '操作',
        render: (row) => (
          <Button
            variant="text"
            aria-label={'引用到 Agent：' + row.id}
            onClick={() => onReference(assetReference('function', row))}
          >
            引用到 Agent
          </Button>
        ),
      });
    return (
      <section className="function-directory" aria-label="纯函数目录结果" ref={functionResults}>
        <DataTable
          layout="fill"
          label="纯函数列表"
          columns={columns}
          rows={matching.slice(start, start + functionPageSize)}
          rowKey={(row) => JSON.stringify([row.id, row.version])}
          filters={catalogFilters('筛选纯函数', functionSearch)}
          empty={
            rows ? (
              '没有匹配的函数。可以更换关键词或清除筛选条件。'
            ) : error ? null : (
              <span role="status">正在加载目录…</span>
            )
          }
          pagination={
            rows && (
              <Pagination
                total={matching.length}
                page={page}
                pageSize={functionPageSize}
                pageSizeOptions={functionPageSizes}
                onChange={(nextPage, size) => {
                  setFunctionPage(nextPage);
                  setFunctionPageSize(size);
                  scrollFunctionsToTop();
                }}
              />
            )
          }
        />
      </section>
    );
  }

  function renderTechnicalInfo(asset: Detail) {
    return (
      <div className="material-detail-dialog-content">
        <dl>
          <dt>制品</dt>
          <dd>
            <code translate="no">{asset.artifact.id}</code>
          </dd>
          <dt>制品摘要</dt>
          <dd>
            <code translate="no">{asset.artifact.digest}</code>
          </dd>
          {asset.documentation && (
            <>
              <dt>来源</dt>
              <dd>{asset.documentation.source}</dd>
            </>
          )}
        </dl>
        <section>
          <h3>完整 Manifest</h3>
          <JsonEditor label="完整 Manifest" text={JSON.stringify(asset.manifest)} />
        </section>
      </div>
    );
  }

  function renderMaterialTypes(asset: Detail) {
    const { propsSchema, bindings } = asset.manifest;
    return (
      <div className="material-detail-dialog-content">
        {propsSchema !== undefined && (
          <section>
            <h3>输入属性类型</h3>
            <CodeBlock language="typescript" source={`type Props = ${schemaType(propsSchema)}`} />
          </section>
        )}
        {!!Object.keys(bindings ?? {}).length && (
          <section>
            <h3>绑定值类型</h3>
            <CodeBlock
              language="typescript"
              source={`type BindingValues = ${schemaType(bindingSchema)}`}
            />
          </section>
        )}
        {asset.documentation?.valueExamples?.map(({ title, description, value }, index) => (
          <section key={index}>
            <h3>{title}</h3>
            <p>{description}</p>
            <JsonEditor label={title} initialMode="text" text={JSON.stringify(value)} />
          </section>
        ))}
      </div>
    );
  }

  function renderMaterialDetail(asset: Detail) {
    const { manifest } = asset;
    return (
      <>
        <MaterialDetailPreview
          key={manifest.id + ':' + manifest.version}
          preview={asset.preview}
          variants={asset.previewVariants}
          examples={asset.documentation?.examples}
        />
        <section className="material-detail-section asset-api" aria-label="资产 API">
          <div className="material-contract-heading">
            <h2>物料契约</h2>
            {(manifest.propsSchema !== undefined ||
              !!Object.keys(manifest.bindings ?? {}).length ||
              !!asset.documentation?.valueExamples?.length) && (
              <Button
                variant="secondary"
                aria-haspopup="dialog"
                onClick={(event) =>
                  setDetailDialog({ kind: 'types', trigger: event.currentTarget })
                }
              >
                查看类型定义与值示例
              </Button>
            )}
          </div>
          <div className="contract-columns">
            {manifest.propsSchema !== undefined && (
              <ContractPanel
                title="输入属性 Props"
                typeName="Props"
                showType={false}
                schema={manifest.propsSchema}
                pointer="/propsSchema"
                annotations={annotations}
                headingAction={
                  <MaterialDescription
                    title="输入属性说明"
                    text="配置表达式求值后的属性。属性用于驱动物料呈现，绑定值和组件内部状态分别管理。"
                  />
                }
              />
            )}
            {Object.keys(manifest.bindings ?? {}).length > 0 && (
              <ContractPanel
                title="绑定值 Bindings"
                typeName="BindingValues"
                showType={false}
                schema={bindingSchema}
                pointer=""
                annotations={bindingAnnotations}
                headingAction={
                  <MaterialDescription
                    title="绑定值说明"
                    text="绑定值定义了绑定路径所指向的数据形状。物料如何读取和写入该值，请查看字段表中的含义。"
                  />
                }
              />
            )}
          </div>
          {manifest.slots?.length ? (
            <p className="muted">
              插槽：
              {manifest.slots.map((slot, index) => (
                <span key={slot}>
                  {index > 0 ? '；' : ''}
                  <code>{slot}</code> — {meaning(`/slots/${index}`)}
                </span>
              ))}
            </p>
          ) : null}
          {!Object.keys(manifest.bindings ?? {}).length && (
            <p className="muted">此物料没有数据绑定。</p>
          )}
        </section>
        <MaterialCapabilities
          manifest={manifest}
          configuration={asset.preview?.configuration}
          annotations={annotations}
          requestExamples={asset.documentation?.requestExamples}
        />
      </>
    );
  }

  function renderFunctionDetail(asset: Detail) {
    const { manifest, documentation } = asset;
    const parameters = (manifest.parameters ?? []).map((parameter) => {
      const type = schemaType(parameter.schema);
      return `${parameter.name}${parameter.optional ? '?' : ''}: ${type.includes('\n') ? `Parameters[${JSON.stringify(parameter.name)}]` : type}`;
    });
    const rest = manifest.restParameter;
    if (rest) {
      const type = schemaType(rest.schema);
      parameters.push(`...${rest.name}: Array<${type.includes('\n') ? 'RestParameter' : type}>`);
    }
    const returnType = schemaType(manifest.returns ?? true);
    const calls = documentation?.callExamples ?? [];
    return (
      <>
        <section className="material-detail-section">
          <h2>函数签名</h2>
          <CodeBlock
            language="typescript"
            source={`${manifest.id}(${parameters.join(', ')}): ${returnType.includes('\n') ? 'ReturnValue' : returnType}`}
          />
          <p className="muted">
            按签名顺序传入 args 数组。签名中的 Parameters、RestParameter 和 ReturnValue
            指向下方的类型定义。
          </p>
        </section>
        <section className="material-detail-section">
          <div className="material-contract-heading">
            <h2>调用示例</h2>
            {(calls.length > 1 || !!documentation?.valueExamples?.length) && (
              <Button
                variant="secondary"
                aria-haspopup="dialog"
                onClick={(event) =>
                  setDetailDialog({ kind: 'calls', trigger: event.currentTarget })
                }
              >
                更多调用示例
              </Button>
            )}
          </div>
          {calls[0] ? (
            renderCallExample(manifest.id, calls[0], 0)
          ) : (
            <p className="muted">此版本暂无调用示例。</p>
          )}
        </section>
        <section className="material-detail-section asset-api" aria-label="资产 API">
          <h2>参数与返回值</h2>
          <div
            className={`contract-columns${schemaType(parameterSchema).split('\n').length > 18 ? ' contract-columns-stacked' : ''}`}
          >
            <ContractPanel
              title="有序参数"
              typeName="Parameters"
              schema={parameterSchema}
              pointer=""
              annotations={parameterAnnotations}
            />
            <ContractPanel
              title="返回值"
              typeName="ReturnValue"
              schema={manifest.returns ?? true}
              pointer="/returns"
              annotations={annotations}
              description="同步返回，不进行网络请求。"
            />
          </div>
          {rest && (
            <ContractPanel
              title="后续可变参数"
              typeName="RestParameter"
              schema={rest.schema}
              pointer="/restParameter"
              annotations={annotations}
              description={meaning('/restParameter')}
            />
          )}
        </section>
      </>
    );
  }
}

type CallExample = NonNullable<NonNullable<Detail['documentation']>['callExamples']>[number];

function renderCallExample(id: string, example: CallExample, index: number) {
  const suffix = index ? ` ${index + 1}` : '';
  return (
    <section className="function-call-example" key={index}>
      <p>{example.description}</p>
      <div className="contract-columns">
        <div>
          <h3>传入 args</h3>
          <JsonEditor
            label={'调用参数示例' + suffix}
            initialMode="text"
            text={JSON.stringify(example.args)}
          />
        </div>
        <div>
          <h3>返回值</h3>
          <JsonEditor
            label={'返回值示例' + suffix}
            initialMode="text"
            text={JSON.stringify(example.result)}
          />
        </div>
      </div>
      <CopyExpression text={JSON.stringify({ op: id, args: example.args }, null, 2)} />
    </section>
  );
}

function CopyExpression({ text }: { text: string }) {
  const [result, setResult] = useState<'copied' | 'fallback'>();
  return (
    <div className="action-row">
      <Button
        variant="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setResult('copied');
          } catch {
            setResult('fallback');
          }
        }}
      >
        复制表达式
      </Button>
      {result && (
        <span role="status">{result === 'copied' ? '已复制' : '复制失败，请手动复制表达式。'}</span>
      )}
      {result === 'fallback' && (
        <textarea
          aria-label="表达式文本"
          readOnly
          value={text}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </div>
  );
}
