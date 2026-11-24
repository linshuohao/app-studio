'use client';

import { useEffect, useState } from 'react';
import type { ReadonlyPreparedForm } from '@form-engine/protocol/prepared';
import { compactJson } from '../components/json/format';
import { failureMessage, platform } from './platform-api';
import { PreviewRuntime } from './preview-runtime';

type PreviewResult = {
  prepared?: ReadonlyPreparedForm;
  diagnostics: { severity: string; message: string; sourcePointer: string }[];
};

export function LayoutLivePreview({
  formPath,
  text,
  profile,
}: {
  formPath: string;
  text: string;
  profile: string;
}) {
  const [result, setResult] = useState<{
    formPath: string;
    text: string;
    profile: string;
    preview?: PreviewResult;
    error?: string;
  }>();
  const [retry, setRetry] = useState(0);
  const [prepared, setPrepared] = useState<ReadonlyPreparedForm>();
  useEffect(() => {
    const controller = new AbortController();
    const input = { formPath, text, profile };
    const timer = setTimeout(async () => {
      try {
        const preview = await platform<PreviewResult>(formPath + '/preview', {
          body: { text: compactJson(text), profile },
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setResult({ ...input, preview });
          if (preview.prepared) setPrepared(preview.prepared);
        }
      } catch (error) {
        if (!controller.signal.aborted) setResult({ ...input, error: failureMessage(error) });
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [formPath, text, profile, retry]);

  const current =
    result?.formPath === formPath && result.text === text && result.profile === profile;
  const diagnostic = current
    ? result.preview?.diagnostics.find((d) => d.severity === 'error')
    : undefined;
  return (
    <>
      {!current && (
        <p className="layout-preview-message" role="status">
          正在准备预览…
        </p>
      )}
      {current && !result.preview?.prepared && (
        <div className="layout-preview-message">
          <p role="alert">
            {result.error ??
              (diagnostic
                ? [diagnostic.sourcePointer, diagnostic.message].filter(Boolean).join(' · ')
                : '当前草稿无法预览。')}
            {prepared && ' 保留上次可用预览。'}
          </p>
          {result.error && (
            <button type="button" className="quiet" onClick={() => setRetry(retry + 1)}>
              重试
            </button>
          )}
        </div>
      )}
      {prepared && <PreviewRuntime prepared={prepared} preserveData />}
    </>
  );
}
