'use client';
import { useEffect, useState } from 'react';
import { Button, DataTable, type Column } from '@form-engine/studio-design-components';
import { Feedback } from '@form-engine/studio-design-components/controls';
import type { PreparedViewNode, PreparedHostRequestIntent } from '@form-engine/protocol/prepared';
import { JsonEditor } from '../../components/json/json-editor';
import { ContractPanel, type Schema } from '../../components/catalog/contract-reference';
import { readDelivery, type LoadedRelease } from './read-delivery';
import { Modal } from '../modal';

type Registrations = { requests: string[]; events: string[]; validators: string[] };
function sites(p: LoadedRelease) {
  const requests: { name: string; path: string; intent: PreparedHostRequestIntent }[] = [];
  const events: { name: string; path: string; hasPayload: boolean }[] = [];
  function walk(node: PreparedViewNode, path: string) {
    if ('node' in node) {
      walk(node.node, path + ' / 作用域');
      return;
    }
    if (!('material' in node)) return;
    const title = node.props?.label ?? node.props?.title;
    const location = path + ' / ' + (typeof title === 'string' ? title : node.material);
    for (const [local, intent] of Object.entries(node.requests ?? {}))
      requests.push({ name: intent.request, path: location + ' / ' + local, intent });
    for (const [local, intent] of Object.entries(node.on ?? {}))
      if (intent.type === 'host.emit')
        events.push({
          name: intent.event,
          path: location + ' / ' + local,
          hasPayload: intent.payload !== undefined,
        });
    for (const [slot, children] of Object.entries(node.slots ?? {}))
      children.forEach((n, i) => walk(n, location + ' / ' + slot + '[' + i + ']'));
  }
  for (const [key, view] of Object.entries(p.definition.views)) walk(view, key);
  for (const [key, t] of Object.entries(p.definition.viewTemplates ?? {}))
    walk(t.node, '模板 ' + key);
  for (const reaction of p.definition.reactions ?? [])
    for (const step of reaction.then)
      if ('type' in step && step.type === 'host.emit')
        events.push({
          name: step.event,
          path: '联动 / ' + reaction.id,
          hasPayload: step.payload !== undefined,
        });
  return { requests, events };
}
function schema(p: LoadedRelease, ref: string) {
  const prefix = '#/resources/requestSchemas/';
  if (!ref.startsWith(prefix)) return;
  try {
    const key = decodeURIComponent(ref.slice(prefix.length))
      .replaceAll('~1', '/')
      .replaceAll('~0', '~');
    if (Object.hasOwn(p.resources.requestSchemas, key))
      return p.resources.requestSchemas[key] as Schema;
  } catch {
    return;
  }
}
const sharedInput =
  'snapshot: JsonValue  // 调用时的数据快照\ncontext: JsonValue   // 宿主上下文\nscope: Record<string, { member?: string; path: string }>  // 作用域位置\nread(reference: DataReference): ReadResult  // 从同一快照读取字段';
type Capability = {
  type: '请求' | '动作' | '校验';
  name: string;
  qualifier?: string;
  locations: string[];
  contract: React.ReactNode;
};

function capabilityRows(prepared: LoadedRelease): Capability[] {
  const where = sites(prepared);
  const requirements = prepared.hostRequirements;
  return [
    ...requirements.requests.map(({ name }): Capability => {
      const uses = where.requests.filter((site) => site.name === name);
      return {
        type: '请求',
        name,
        locations: uses.map((site) => site.path),
        contract: uses.length ? (
          uses.map(({ path, intent }, index) => (
            <section key={index}>
              <p>使用位置 · {path}</p>
              {(['传入', '返回值'] as const).map((title, index) => {
                const ref = index
                  ? (intent.hostResultSchemaRef ?? intent.resultSchemaRef)
                  : (intent.hostPayloadSchemaRef ?? intent.payloadSchemaRef);
                if (!index && intent.payload !== undefined && !intent.hostPayloadSchemaRef)
                  return (
                    <p key={title}>此处会转换请求参数。该发布未记录转换后的 Host 输入契约。</p>
                  );
                const spec = schema(prepared, ref);
                return spec === undefined ? (
                  <p key={title}>{title}结构未记录。</p>
                ) : (
                  <section key={title}>
                    <ContractPanel
                      title={title}
                      typeName={index ? 'Result' : 'Input'}
                      schema={spec}
                      pointer=""
                      annotations={{}}
                    />
                    <details>
                      <summary>{title} Schema 原文</summary>
                      <JsonEditor text={JSON.stringify(spec)} label={title + ' Schema'} />
                    </details>
                  </section>
                );
              })}
              <p className="muted">
                调用选项包含 signal（取消信号）。处理函数可直接返回结果或返回 Promise。
              </p>
            </section>
          ))
        ) : (
          <p>该发布未记录请求映射与结构。</p>
        ),
      };
    }),
    ...requirements.events.map((event): Capability => ({
      type: '动作',
      name: event.name,
      qualifier: event.optional ? '可选' : '必需',
      locations: where.events
        .filter((site) => site.name === event.name)
        .map(
          (site) =>
            site.path +
            (site.hasPayload ? '（配置求值，未冻结业务参数 Schema）' : '（无业务参数）'),
        ),
      contract: (
        <pre>
          {sharedInput +
            '\nevent: string  // 动作名\npayload?: JsonValue   // 配置求值后的参数\n返回 void'}
        </pre>
      ),
    })),
    ...requirements.validators.map((validator): Capability => ({
      type: '校验',
      name: validator.name,
      qualifier: validator.contractVersion && '契约 ' + validator.contractVersion,
      locations: validator.constraintIds,
      contract: (
        <>
          <pre>
            {sharedInput +
              '\nruleId: string  // 规则标识\ntarget: DataReference  // 校验目标\n返回 { result: Promise<Array<{ code: string; message?: string; target?: DataReference }>>; cancel?: () => void }'}
          </pre>
          <p>result 返回问题列表，空数组表示通过。cancel 可取消尚未完成的工作。</p>
        </>
      ),
    })),
  ];
}

function CapabilityTable({ rows }: { rows: Capability[] }) {
  const [selected, setSelected] = useState<{
    kind: 'locations' | 'contract';
    row: Capability;
    trigger: HTMLButtonElement;
  }>();
  const columns: Column<Capability>[] = [
    { key: 'type', title: '类型', render: (row) => row.type },
    { key: 'name', title: '能力标识', render: (row) => <code translate="no">{row.name}</code> },
    {
      key: 'locations',
      title: '使用位置',
      render: (row) => (
        <Button
          variant="secondary"
          aria-label={`查看位置 ${row.name}`}
          aria-haspopup="dialog"
          onClick={(event) => setSelected({ kind: 'locations', row, trigger: event.currentTarget })}
        >
          查看位置
        </Button>
      ),
    },
    {
      key: 'contract',
      title: '接入契约',
      render: (row) => (
        <Button
          variant="secondary"
          aria-label={`查看契约 ${row.name}`}
          aria-haspopup="dialog"
          onClick={(event) => setSelected({ kind: 'contract', row, trigger: event.currentTarget })}
        >
          查看契约
        </Button>
      ),
    },
  ];
  return (
    <div className="release-capability-table">
      <DataTable
        label="所需宿主能力"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.type + ':' + row.name}
        empty="这个发布没有声明宿主能力。"
      />
      {selected && (
        <Modal
          title={`${selected.kind === 'locations' ? '使用位置' : '接入契约'} · ${selected.row.name}`}
          size={selected.kind === 'locations' ? 'standard' : 'wide'}
          className="release-contract-modal"
          returnFocus={selected.trigger}
          onClose={() => setSelected(undefined)}
        >
          {selected.kind === 'contract' ? (
            selected.row.contract
          ) : (
            <div className="release-capability-locations">
              {selected.row.qualifier && <p className="muted">{selected.row.qualifier}</p>}
              {selected.row.locations.length ? (
                <ul aria-label={selected.row.type === '校验' ? '校验规则' : '使用位置'}>
                  {selected.row.locations.map((location, index) => (
                    <li key={index}>{location}</li>
                  ))}
                </ul>
              ) : (
                <p>该发布未记录使用位置。</p>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

export function Requirements({
  prepared,
  available,
  layout = 'details',
}: {
  prepared: LoadedRelease;
  available?: Registrations;
  layout?: 'details' | 'table';
}) {
  const rows = capabilityRows(prepared);
  if (layout === 'table') return <CapabilityTable rows={rows} />;

  return (
    <section className="host-contracts">
      <h3>所需宿主能力</h3>
      {!rows.length && <p>这个发布没有声明宿主能力。</p>}
      {rows.map((row) => {
        const group =
          row.type === '请求' ? 'requests' : row.type === '动作' ? 'events' : 'validators';
        return (
          <details key={group + ':' + row.name}>
            <summary>
              {row.type} · {row.name}
              {row.type === '动作' && ' · ' + row.qualifier}
              {available && (available[group].includes(row.name) ? ' · 已注册' : ' · 未提供')}
            </summary>
            {row.type !== '请求' && (
              <p>
                {row.type === '动作' ? '使用位置 · ' : '校验规则 · '}
                {row.locations.join('、') || '未记录'}
                {row.type === '校验' && row.qualifier && ' · ' + row.qualifier}
              </p>
            )}
            {row.contract}
          </details>
        );
      })}
    </section>
  );
}

function hostExample(releaseId: string) {
  return `'use client';

import { useEffect, useState } from 'react';
import { FormRenderer } from '@form-engine/renderer-react';
import { loadRelease, startRelease } from './load-release';

const releaseId = ${JSON.stringify(releaseId)};
export default function HostDemo() {
  const [loaded, setLoaded] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let instance;

    // 按发布 ID 获取 Prepared 制品，校验摘要、目标和能力版本。
    async function mount() {
      try {
        const { prepared, capabilities } = await loadRelease(releaseId, controller.signal, () => {});
        if (controller.signal.aborted) return;
        // 注册请求、动作和校验器，创建独立的运行实例。
        instance = startRelease(prepared, capabilities, setMessage, () => {}, () => {});
        setLoaded({ prepared, instance });
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : '装载发布失败');
      }
    }

    void mount();
    return () => {
      controller.abort();
      instance?.dispose();
    };
  }, []);

  if (error) return <p role="alert">{error}</p>;
  if (!loaded) return <p role="status">正在装载发布…</p>;
  const { prepared, instance } = loaded;

  return (
    <>
      <FormRenderer
        prepared={prepared}
        runtime={instance.runtime}
        materials={instance.materials}
        requests={instance.requests}
        onDiagnostic={instance.diagnostic}
      />
      {message && <p role="status">{message}</p>}
    </>
  );
}`;
}

export function ReleaseHostExample({ releaseId }: { releaseId: string }) {
  const [message, setMessage] = useState('');
  const code = hostExample(releaseId);
  return (
    <section className="release-host-example">
      <div className="action-row">
        <h2>React Host 接入示例</h2>
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setMessage('已复制');
            } catch {
              setMessage('复制失败，请选中示例代码手动复制。');
            }
          }}
        >
          复制 JSX
        </Button>
      </div>
      <p>
        示例使用仓库的 <code>host/load-release.ts</code>。业务 Host
        按「所需宿主能力」页签中的契约实现请求、动作和校验。
      </p>
      {message && <Feedback kind="status">{message}</Feedback>}
      <pre tabIndex={0} aria-label="Host 接入 JSX">
        <code>{code}</code>
      </pre>
    </section>
  );
}

export function ReleaseIntegration({
  releaseId,
  layout = 'combined',
}: {
  releaseId: string;
  layout?: 'combined' | 'capabilities';
}) {
  const [retry, setRetry] = useState(0);
  const [response, setResponse] = useState<{
    id: string;
    prepared?: LoadedRelease;
    error?: string;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    void readDelivery(releaseId, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setResponse({ id: releaseId, prepared: result.prepared });
      },
      (error) => {
        if (!controller.signal.aborted)
          setResponse({
            id: releaseId,
            error: error instanceof Error ? error.message : '读取失败',
          });
      },
    );
    return () => controller.abort();
  }, [retry, releaseId]);
  const current = response?.id === releaseId ? response : undefined;
  if (current?.error)
    return (
      <div className="action-row">
        <Feedback kind="error">{current.error}</Feedback>
        <Button
          variant="secondary"
          onClick={() => {
            setResponse(undefined);
            setRetry((count) => count + 1);
          }}
        >
          重新读取
        </Button>
      </div>
    );
  if (!current?.prepared) return <Feedback kind="status">正在读取发布契约…</Feedback>;
  if (layout === 'capabilities') return <Requirements prepared={current.prepared} layout="table" />;
  return (
    <div className="host-integration">
      <Requirements prepared={current.prepared} />
      <details>
        <summary>React Host 接入示例</summary>
        <p>
          <a
            href={'/host?releaseId=' + encodeURIComponent(releaseId)}
            target="_blank"
            rel="noreferrer"
          >
            用此发布运行示例 Host
          </a>
        </p>
        <ReleaseHostExample releaseId={releaseId} />
      </details>
    </div>
  );
}
