'use client';

import Link from 'next/link';
import { FormRenderer } from '@form-engine/renderer-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createDiagnosticUpload, resumeDiagnosticUploads } from './diagnostic-upload';
import { loadRelease, startRelease, stages, type LoadedRelease } from './load-release';

import { Requirements } from './requirements';
import { Modal } from '../modal';
type Trace = {
  id: string;
  stage: number;
  failure?: string;
  prepared?: LoadedRelease;
  name?: string;
  available?: Instance['available'];
  instance?: Instance;
};
type Instance = ReturnType<typeof startRelease>;
type Loaded = {
  instanceId: number;
  releaseId: string;
  name?: string;
  prepared: LoadedRelease;
  instance: Instance;
};

export function ReleaseHost({
  initialId,
  diagnosticOwner,
}: {
  initialId: string;
  diagnosticOwner?: string;
}) {
  const [releaseId, setReleaseId] = useState(initialId);
  const [instances, setInstances] = useState<Loaded[]>([]);
  const [messages, setMessages] = useState<Record<number, string>>({});
  const [trace, setTrace] = useState<Trace>();
  const [diagnosing, setDiagnosing] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const next = useRef(0);
  const loaded = useRef<Loaded[]>([]);
  const [currentId, setCurrentId] = useState<number>();
  const [notice, setNotice] = useState('');
  const pending = useRef<AbortController | null>(null);
  const active = useRef(new Map<number, Instance>());

  const load = useCallback(
    async (id: string, duplicate = false) => {
      if (!id) return;
      pending.current?.abort();
      pending.current = null;
      setLoading(false);
      setError('');
      const existing = loaded.current.find((item) => item.releaseId === id);
      if (existing && !duplicate) {
        setTrace({
          id,
          stage: stages.length,
          prepared: existing.prepared,
          name: existing.name,
          available: existing.instance.available,
          instance: existing.instance,
        });
        setCurrentId(existing.instanceId);
        setNotice(`已切换到实例 ${existing.instanceId}，保留当前填写内容。`);
        history.replaceState(null, '', `/host?releaseId=${encodeURIComponent(id)}`);
        document
          .getElementById(`host-instance-${existing.instanceId}`)
          ?.scrollIntoView({ block: 'start' });
        return;
      }
      setNotice('');
      const request = new AbortController();
      pending.current = request;
      setError('');
      setLoading(true);
      let progress: Trace = { id, stage: 0 };
      function advance(stage: number, extra: Partial<Trace> = {}) {
        progress = { ...progress, ...extra, stage };
        if (!request.signal.aborted) setTrace(progress);
      }
      advance(0);
      try {
        const { prepared, name, capabilities } = await loadRelease(id, request.signal, advance);
        if (request.signal.aborted) return;
        advance(3, { prepared, name });
        const instanceId = ++next.current;
        const instance = startRelease(
          prepared,
          capabilities,
          (message) => {
            if (active.current.has(instanceId))
              setMessages((current) => ({ ...current, [instanceId]: message }));
          },
          () => advance(4),
          (available) => advance(3, { available }),
          diagnosticOwner ? createDiagnosticUpload(id, diagnosticOwner) : undefined,
        );
        advance(stages.length, { instance });
        active.current.set(instanceId, instance);
        loaded.current = [
          ...loaded.current,
          { instanceId, releaseId: id, prepared, instance, name },
        ];
        setInstances(loaded.current);
        setCurrentId(instanceId);
        history.replaceState(null, '', `/host?releaseId=${encodeURIComponent(id)}`);
      } catch (reason) {
        if (!request.signal.aborted) {
          const failure = reason instanceof Error ? reason.message : '无法装载发布。';
          setError(failure);
          advance(progress.stage, { failure });
        }
      } finally {
        if (pending.current === request) {
          pending.current = null;
          setLoading(false);
        }
      }
    },
    [diagnosticOwner],
  );

  useEffect(() => {
    const mounted = active.current;
    if (diagnosticOwner) resumeDiagnosticUploads();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 按 URL 装载外部 release，load 同时管理加载状态与取消。
    if (initialId) void load(initialId);
    return () => {
      pending.current?.abort();
      pending.current = null;
      mounted.forEach((instance) => instance.dispose());
      mounted.clear();
      loaded.current = [];
    };
  }, [initialId, load, diagnosticOwner]);

  return (
    <main className="host-page">
      <Link href="/">返回表单 Studio</Link>
      <section className="surface authoring-panel" aria-label="装载发布">
        <h1>示例 Host</h1>
        <form
          className="action-row"
          onSubmit={(event) => {
            event.preventDefault();
            void load(releaseId.trim());
          }}
        >
          <label htmlFor="release-id">发布 ID</label>
          <input
            id="release-id"
            name="releaseId"
            autoComplete="off"
            spellCheck={false}
            translate="no"
            value={releaseId}
            required
            onChange={(event) => setReleaseId(event.target.value)}
          />
          <button type="submit" disabled={!releaseId.trim()}>
            装载发布
          </button>
          <button
            type="button"
            className="quiet"
            disabled={!releaseId.trim()}
            onClick={() => void load(releaseId.trim(), true)}
          >
            新建独立实例
          </button>
        </form>
        {notice && <p role="status">{notice}</p>}
        {loading && <p role="status">正在装载发布</p>}
        {error && <p role="alert">{error}</p>}
        {trace && (
          <button className="quiet" onClick={() => setDiagnosing(true)}>
            查看诊断
          </button>
        )}
        {diagnosing && trace && (
          <Modal wide title="Host 装载诊断" onClose={() => setDiagnosing(false)}>
            <strong>{trace.name || trace.prepared?.definition.id || '发布'}</strong>
            <p className="host-release-id">发布 ID · {trace.id}</p>
            <ol className="host-stages">
              {stages.map((label, i) => (
                <li key={label}>
                  <span>{label}</span>
                  <strong>
                    {i < trace.stage
                      ? '通过'
                      : i === trace.stage
                        ? trace.failure
                          ? '失败'
                          : '进行中'
                        : '未检查'}
                  </strong>
                </li>
              ))}
            </ol>
            {trace.failure && (
              <p>
                {trace.failure}{' '}
                {
                  [
                    '核对发布 ID 与访问地址。',
                    '重新获取该发布并核对完整内容与目标。',
                    '安装与此发布锁一致的物料和函数。',
                    '注册缺少的处理函数后重新装载。',
                    '核对运行时与初始化配置。',
                  ][trace.stage]
                }
              </p>
            )}
            {trace.prepared && (
              <Requirements prepared={trace.prepared} available={trace.available} />
            )}
            <h3>运行记录</h3>
            {trace.instance ? (
              <>
                <button className="text-button" onClick={() => setTrace({ ...trace })}>
                  刷新运行记录
                </button>
                <p>
                  示例 Host 调用 · 请求 {trace.instance.calls.requests} · 动作{' '}
                  {trace.instance.calls.events} · 校验 {trace.instance.calls.validators}
                </p>
                {trace.instance.errors.length ? (
                  <ul>
                    {trace.instance.errors.map((code, i) => (
                      <li key={i}>{code}</li>
                    ))}
                  </ul>
                ) : (
                  <p>尚未记录运行错误。</p>
                )}
              </>
            ) : (
              <p>未创建实例。</p>
            )}
          </Modal>
        )}
      </section>
      {instances.map(({ instanceId, releaseId: id, prepared, instance, name }) => (
        <section
          className="surface authoring-panel"
          aria-label="已装载实例"
          id={`host-instance-${instanceId}`}
          key={instanceId}
        >
          <h2>
            实例 {instanceId} · {name || prepared.definition.id} · {prepared.build.profile}
            {currentId === instanceId ? ' · 当前' : ''}
          </h2>
          <details>
            <summary>发布标识 {id.slice(0, 8)}</summary>
            <code>{id}</code>
          </details>
          <div className="action-row">
            <button type="button" onClick={() => instance.restoreDraft()}>
              恢复草稿
            </button>
            <button
              type="button"
              onClick={() => {
                active.current.delete(instanceId);
                instance.dispose();
                if (trace?.instance === instance) setTrace(undefined);
                loaded.current = loaded.current.filter((item) => item.instanceId !== instanceId);
                setInstances(loaded.current);
                if (currentId === instanceId) {
                  const remaining = loaded.current.at(-1);
                  setCurrentId(remaining?.instanceId);
                  setReleaseId(remaining?.releaseId ?? '');
                  history.replaceState(
                    null,
                    '',
                    remaining
                      ? `/host?releaseId=${encodeURIComponent(remaining.releaseId)}`
                      : '/host',
                  );
                }
                setMessages((previous) => {
                  const remaining = { ...previous };
                  delete remaining[instanceId];
                  return remaining;
                });
              }}
            >
              关闭实例
            </button>
          </div>
          {messages[instanceId] && <p role="status">{messages[instanceId]}</p>}
          <FormRenderer
            prepared={prepared}
            runtime={instance.runtime}
            materials={instance.materials}
            onDiagnostic={instance.diagnostic}
            requests={instance.requests}
          />
        </section>
      ))}
    </main>
  );
}
