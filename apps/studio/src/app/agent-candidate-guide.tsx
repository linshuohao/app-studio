'use client';

import { CodeBlock } from '../components/code-block';
import { useEffect, useId, useRef, useState, type MouseEventHandler, type ReactNode } from 'react';
import type { ReadonlyPreparedForm } from '@form-engine/protocol/prepared';
import { Button } from '@form-engine/studio-design-components';
import type { CandidateGuide, CandidatePendingItem } from './agent-conversation';
import { AgentCandidateCard } from './agent-reply';
import { candidateContextPaths, candidateExample } from './candidate-jsx';
import { failureMessage, platform, PlatformError } from './platform-api';

const hostNotes: Record<string, string> = {
  'travel.checkPassportDuplicates': '归一化护照号后查重，冲突定位到对应人员，本人只计一次。',
  'travel.previewUnderwritingSubmit': '触发本地整单校验和投保资料投影。渠道核保待接入。',
  'travel.searchCities': '接收搜索词 query 和筛选键 filterKey，返回候选项 items。',
  'travel.saveDraft': '接收保存草稿动作通知。',
  'travel.submit': '触发本地整单校验。',
};

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PendingItems({ items, label }: { items: CandidatePendingItem[]; label: string }) {
  return items.map(({ title, details, requirementIds }) => (
    <details key={title} className="agent-guide-item">
      <summary>
        <span>{title}</span>
        <span className="agent-guide-pending">{label}</span>
      </summary>
      <ul>
        {details.map((detail) => (
          <li key={detail}>{detail}</li>
        ))}
      </ul>
      {!!requirementIds.length && <p>需求 {requirementIds.join('、')}</p>}
    </details>
  ));
}

export function AgentCandidateGuide({
  guide,
  conversationId,
  turnId,
  draftLink,
  onOpenDraft,
  name,
  children,
  workingPrepared,
  pendingApplication,
}: {
  draftLink?: string;
  onOpenDraft?: MouseEventHandler<HTMLAnchorElement>;
  name?: string;
  children?: ReactNode;
} & (
  | {
      guide: CandidateGuide;
      conversationId: string;
      turnId: string;
      workingPrepared?: never;
      pendingApplication?: boolean;
    }
  | {
      workingPrepared: ReadonlyPreparedForm;
      guide?: never;
      conversationId?: never;
      turnId?: never;
      pendingApplication?: never;
    }
)) {
  const sectionId = useId();
  const snippet = useRef<HTMLDetailsElement>(null);
  const snippetHeading = useRef<HTMLElement>(null);
  const loading = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [prepared, setPrepared] = useState(workingPrepared);
  const [regenerated, setRegenerated] = useState(false);
  const [showData, setShowData] = useState(false);
  const exampleCode = regenerated ? undefined : guide?.exampleCode;
  const example = prepared && candidateExample(prepared, exampleCode);
  const contextPaths = prepared && candidateContextPaths(prepared);
  const {
    validators = [],
    events = [],
    requests = [],
  } = prepared?.hostRequirements ?? guide?.hostRequirements ?? {};
  const requirements = [
    ...validators.map(({ name, contractVersion }) => ({
      name,
      key: 'host.validators',
      contract: contractVersion,
    })),
    ...events.map(({ name, contractVersion }) => ({
      name,
      key: 'host.events',
      contract: contractVersion,
    })),
    ...requests.map(({ name }) => ({ name, key: 'requests', contract: undefined })),
  ];
  const locks = prepared && [
    ...Object.values(prepared.capabilityLock.materials),
    ...Object.values(prepared.capabilityLock.pureFunctions),
  ];

  useEffect(() => {
    if (!prepared || !snippet.current?.open) return;
    const frame = requestAnimationFrame(() => {
      snippetHeading.current?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [prepared]);

  async function loadExample(view: 'code' | 'data') {
    if (view === 'data') setShowData(true);
    if (snippet.current) snippet.current.open = true;
    if (loading.current || prepared || !guide) return;
    loading.current = true;
    setPending(true);
    setError('');
    try {
      const result = await platform<{
        candidateDigest: string;
        prepared: ReadonlyPreparedForm;
        regenerated: boolean;
      }>(
        `/agent-conversations/${encodeURIComponent(conversationId)}/deliveries/${encodeURIComponent(turnId)}/integration`,
      );
      if (result.candidateDigest !== guide.candidateDigest) {
        setError('接入制品与这条候选回复不一致。');
        return;
      }
      setRegenerated(result.regenerated);
      setPrepared(result.prepared);
    } catch (reason) {
      setError(
        reason instanceof PlatformError && reason.status === 409 && reason.detail
          ? reason.detail
          : failureMessage(reason),
      );
    } finally {
      loading.current = false;
      setPending(false);
    }
  }

  function revealExample(view: 'code' | 'data') {
    void loadExample(view);
    snippetHeading.current?.scrollIntoView({ block: 'start' });
  }

  async function copy(jsx: string) {
    try {
      await navigator.clipboard.writeText(jsx);
      setCopyStatus('已复制完整 JSX。');
    } catch {
      setCopyStatus('复制失败，请选中代码后手动复制。');
    }
  }

  return (
    <AgentCandidateCard>
      <div className="agent-guide-header">
        <div className="agent-guide-title">
          <strong>{name || guide?.title || '表单候选'}</strong>
          <span>{workingPrepared ? '当前工作稿编译通过' : '候选编译通过'}</span>
        </div>
        {events.some(({ name }) => name === 'travel.previewUnderwritingSubmit') && (
          <p>可试填投保人与被保人名单，执行本地整单校验与投保资料投影。</p>
        )}
        <div className="agent-candidate-actions">
          {draftLink && (
            <a
              href={draftLink}
              target={onOpenDraft ? undefined : '_blank'}
              rel={onOpenDraft ? undefined : 'noopener'}
              onClick={onOpenDraft}
              className="agent-guide-draft"
            >
              前往草稿
            </a>
          )}
          <Button
            variant="secondary"
            onClick={() => revealExample('code')}
            aria-controls={sectionId}
          >
            查看 JSX
          </Button>
          <Button
            variant="secondary"
            onClick={() => revealExample('data')}
            aria-controls={sectionId}
          >
            查看试填数据
          </Button>
        </div>
        {pendingApplication && <p>候选尚未应用。前往草稿后可对比并应用。</p>}
        {children}
      </div>
      <details className="agent-guide-section" open={workingPrepared ? true : undefined}>
        <summary>接入说明</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">配置项</th>
              <th scope="col">{workingPrepared ? '当前工作稿' : '本次候选'}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">引擎依赖</th>
              <td>
                <code>@form-engine/runtime</code>、<code>@form-engine/renderer-react</code>
                ，以及配套 Web 物料和纯函数。
                {locks && (
                  <details>
                    <summary>查看锁定能力与版本</summary>
                    <ul>
                      {locks.map((lock) => (
                        <li key={`${lock.artifact.id}:${lock.id}`}>
                          <code>{lock.id}</code> {lock.version}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </td>
            </tr>
            <tr>
              <th scope="row">制品和初值</th>
              <td>
                <code>prepared.json</code> 作为编译制品，<code>sample-data.json</code> 作为 Runtime
                初始数据。
              </td>
            </tr>
            <tr>
              <th scope="row">Host 上下文</th>
              <td>
                示例提供北京时间的 <code>context.today</code>。业务上下文可通过 <code>context</code>{' '}
                参数传入。
                {!!contextPaths?.length && (
                  <ul>
                    {contextPaths.map((path) => (
                      <li key={path}>
                        <code>{path || '/'}</code>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
            {requirements.map(({ name, key, contract }) => (
              <tr key={`${key}:${name}`}>
                <th scope="row">{key}</th>
                <td>
                  <code>{name}</code>
                  {contract && ` · 契约 ${contract}`}
                  {hostNotes[name] && <p>{hostNotes[name]}</p>}
                </td>
              </tr>
            ))}
            <tr>
              <th scope="row">渲染入参</th>
              <td>
                <code>prepared</code>、<code>runtime</code>、<code>materials</code>
                {!!requests.length && (
                  <>
                    、<code>requests</code>
                  </>
                )}
                。
              </td>
            </tr>
          </tbody>
        </table>
      </details>
      <details
        className="agent-guide-section"
        ref={snippet}
        id={sectionId}
        onToggle={(event) => {
          if (event.currentTarget.open && !error) void loadExample('code');
        }}
      >
        <summary ref={snippetHeading}>完整 JSX</summary>
        {pending && <p role="status">正在准备此版候选的接入示例…</p>}
        {error && (
          <p role="alert">
            {error}{' '}
            <Button variant="text" onClick={() => void loadExample('code')}>
              重试
            </Button>
          </p>
        )}
        {prepared && example && (
          <>
            <p>
              在同版本的 Studio workspace 中，将下面文件放在 <code>apps/studio/src/app</code>，通过
              React 页面挂载 <code>CandidateForm</code>。
            </p>
            <div className="agent-candidate-actions">
              <Button variant="secondary" onClick={() => downloadJson('prepared.json', prepared)}>
                下载 prepared.json
              </Button>
              <Button
                variant="secondary"
                onClick={() => downloadJson('sample-data.json', example.sample)}
              >
                下载试填数据
              </Button>
            </div>
            {showData && (
              <CodeBlock
                language="json"
                label="试填数据"
                source={JSON.stringify(example.sample, null, 2)}
              />
            )}
            {regenerated && <p>已在当前编译环境重新检查原候选，并生成接入示例。</p>}
            {exampleCode && <p>JSX 注释包含模型为本次候选生成的 Host 接入伪代码。</p>}
            {!regenerated && guide?.exampleUnavailable && (
              <p>本轮模型接入示例生成失败，下面提供基础接入代码。</p>
            )}
            {example.purchase && (
              <p>
                在 <code>integration</code> 传入 <code>createPurchaseLine</code> 和{' '}
                <code>submitPurchaseRequest</code>。代码包含签名和接入步骤。
              </p>
            )}
            {!!example.unsupported.length && (
              <p>
                通过 <code>host</code> 提供这些业务处理函数：{example.unsupported.join('、')}。
              </p>
            )}
            <div className="agent-guide-code">
              <div>
                <code>CandidateForm.jsx</code>
                <Button variant="secondary" onClick={() => void copy(example.jsx)}>
                  复制 JSX
                </Button>
              </div>
              <CodeBlock language="jsx" label="JSX 接入示例" source={example.jsx} />
            </div>
            {copyStatus && <p role="status">{copyStatus}</p>}
          </>
        )}
      </details>
      {guide && !!(guide.hostPending.length || guide.previewPending.length) && (
        <details className="agent-guide-section">
          <summary>待接入与待验证</summary>
          <PendingItems items={guide.hostPending} label="待 Host 接入" />
          <PendingItems items={guide.previewPending} label="待试填验证" />
        </details>
      )}
    </AgentCandidateCard>
  );
}
