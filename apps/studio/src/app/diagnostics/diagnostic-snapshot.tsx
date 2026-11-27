'use client';

import { CodeBlock } from '../../components/code-block';
import { useEffect, useState } from 'react';
import { FormRenderer, type HostRequestRegistry } from '@form-engine/renderer-react';
import { createRuntime, type FormRuntime } from '@form-engine/runtime';
import type { ReadonlyPreparedForm } from '@form-engine/protocol/prepared';
import { Feedback } from '@form-engine/studio-design-components/controls';
import { loadRelease } from '../host/load-release';
import { installedWebCapabilities } from '../web-capabilities';

type SnapshotDetail = { evidence: unknown; formId: string; versionId: string; releaseId: string };

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function DiagnosticSnapshot({ detail }: { detail: SnapshotDetail }) {
  const [config, setConfig] = useState<{ text?: string; error?: string }>();
  const [preview, setPreview] = useState<{
    prepared: ReadonlyPreparedForm;
    runtime: FormRuntime;
    requests: HostRequestRegistry;
  }>();
  const [previewError, setPreviewError] = useState('');
  const input = object(object(detail.evidence)?.input);
  const snapshot = input?.snapshot;
  const context = input?.context;
  const { formId, versionId, releaseId } = detail;

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    fetch(
      `/api/platform/forms/${encodeURIComponent(formId)}/versions/${encodeURIComponent(versionId)}`,
      { signal, cache: 'no-store' },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error('无法读取原始表单配置。');
        const result: { versionId?: string; text?: string } = await response.json();
        if (result.versionId !== versionId || typeof result.text !== 'string')
          throw new Error('配置版本与错误现场不匹配。');
        if (!signal.aborted) setConfig({ text: result.text });
      })
      .catch((error: Error) => {
        if (!signal.aborted) setConfig({ error: error.message });
      });

    let runtime: FormRuntime | undefined;
    if (snapshot !== undefined) {
      loadRelease(releaseId, signal, () => undefined)
        .then(({ prepared }) => {
          if (signal.aborted) return;
          const readOnlyPrepared = {
            ...prepared,
            definition: { ...prepared.definition, reactions: [], constraints: [] },
          };
          runtime = createRuntime({
            prepared: readOnlyPrepared,
            data: snapshot,
            context,
            functions: installedWebCapabilities.functions,
          });
          // Keep request-backed materials mounted without connecting to the original Host.
          const requests = Object.fromEntries(
            prepared.hostRequirements.requests.map(({ name }) => [
              name,
              async () => {
                throw new Error('表单快照无法执行宿主请求。');
              },
            ]),
          );
          setPreview({ prepared: readOnlyPrepared, runtime, requests });
        })
        .catch((error: Error) => {
          if (!signal.aborted) setPreviewError(error.message);
        });
    }
    return () => {
      controller.abort();
      runtime?.dispose();
    };
  }, [formId, versionId, releaseId, snapshot, context]);

  return (
    <>
      <section className="surface authoring-panel" aria-label="表单快照预览">
        <h2>表单快照预览</h2>
        <p>只读 · 使用这次异常保存的字段值</p>
        {snapshot === undefined && <p>这次异常没有可预览的表单字段快照。</p>}
        {previewError && <Feedback kind="error">{previewError}</Feedback>}
        {snapshot !== undefined && !preview && !previewError && (
          <Feedback kind="status">正在载入快照预览…</Feedback>
        )}
        {preview && (
          <div inert data-diagnostic-snapshot-canvas>
            <FormRenderer
              prepared={preview.prepared}
              runtime={preview.runtime}
              requests={preview.requests}
              materials={installedWebCapabilities.materials}
            />
          </div>
        )}
        {snapshot !== undefined && (
          <details>
            <summary>查看原始字段值</summary>
            <CodeBlock language="json" source={JSON.stringify(snapshot, null, 2)} />
          </details>
        )}
      </section>
      <section className="surface authoring-panel" aria-label="原发布配置">
        <h2>原发布配置</h2>
        <p>
          只读 · <code>{versionId}</code>
        </p>
        {!config && <Feedback kind="status">正在读取原发布配置…</Feedback>}
        {config?.error && <Feedback kind="error">{config.error}</Feedback>}
        {config?.text !== undefined && <CodeBlock language="json" source={config.text} />}
      </section>
    </>
  );
}
