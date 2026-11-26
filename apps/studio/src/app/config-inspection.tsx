'use client';

import type { ReadonlyPreparedForm } from '@form-engine/protocol/prepared';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { failureMessage, platform } from './platform-api';
import { Modal } from './modal';
import { StudioSelect } from '@form-engine/studio-design-components/select';
import { PreviewRuntime } from './preview-runtime';
import { Button } from '@form-engine/studio-design-components/controls';

import type { AssetChoice } from './asset-binding-editor';

type CheckResult = {
  success: boolean;
  catalogId: string;
  recommendedCatalog?: string;
  target: { platform: string; profile?: string };
  diagnostics: {
    code: string;
    severity: string;
    sourcePointer: string;
    message: string;
    location?: { offset: number; length: number; line: number; column: number };
  }[];
  prepared?: ReadonlyPreparedForm;
};

export type InspectionInput =
  { text: string; basedOnVersionId?: string; assetChoices?: AssetChoice[] } | { versionId: string };

export function ConfigInspection({
  path,
  input,
  confirmTrial,
  canCheck,
  autoCheck,
  disabled,
  profile,
  onProfile,
  sourceText,
  onLocate,
  onInspected,
}: {
  path: string;
  input: InspectionInput;
  confirmTrial?: (text: string) => void;
  canCheck: boolean;
  autoCheck?: boolean;
  disabled: boolean;
  sourceText: string;
  profile: string;
  onProfile: (profile: string) => void;
  onLocate?: (path: string) => void;
  onInspected?: (source: InspectionInput, catalog: string) => void;
}) {
  const [request, setRequest] = useState<{
    id: number;
    source: InspectionInput;
    mode: 'check' | 'preview';
    result?: CheckResult;
    error?: string;
  }>();
  const sequence = useRef(0);
  const [trialError, setTrialError] = useState('');
  const reportDiagnostic = useCallback(
    (d: { code: string; message: string }) => setTrialError(d.code + ' · ' + d.message),
    [],
  );
  const [ready, setReady] = useState(false);
  const runtimeReady = useCallback(() => setReady(true), []);
  const runtimeFailed = useCallback(() => setReady(false), []);
  useEffect(
    () => () => {
      ++sequence.current;
    },
    [],
  );

  const [choosing, setChoosing] = useState<'check' | 'preview'>();
  let profiles: string[] = [];
  try {
    const views = JSON.parse(sourceText)?.views;
    if (views && typeof views === 'object' && !Array.isArray(views)) profiles = Object.keys(views);
  } catch {
    /* The check reports malformed source. */
  }

  function start(mode: 'check' | 'preview') {
    if (profiles.length > 1) setChoosing(mode);
    else void run(mode, profiles[0]);
  }

  async function run(mode: 'check' | 'preview', target?: string) {
    setReady(false);
    setTrialError('');
    const id = ++sequence.current;
    setRequest({ id, source: input, mode });
    try {
      const result = await platform<CheckResult>(`${path}/${mode}`, {
        body: {
          ...input,
          ...(confirmTrial && { simulateTravelHost: true }),
          ...(target && { profile: target }),
        },
      });
      if (sequence.current === id) {
        setRequest({ id, source: input, mode, result });
        if (result.recommendedCatalog) onInspected?.(input, result.recommendedCatalog);
      }
    } catch (error) {
      if (sequence.current === id)
        setRequest({ id, source: input, mode, error: failureMessage(error) });
    }
  }

  const checkInserted = useEffectEvent(() => {
    void run(
      'check',
      profiles.includes(profile) ? profile : profiles.length === 1 ? profiles[0] : undefined,
    );
  });
  useEffect(() => {
    if (autoCheck) checkInserted();
  }, [autoCheck]);

  function clear() {
    ++sequence.current;
    setRequest(undefined);
  }

  const result = request?.result;
  return (
    <section className="design-inspection" aria-label="检查与预览">
      <div className="authoring-fields">
        {canCheck && (
          <Button
            variant="secondary"
            type="button"

            disabled={disabled}
            onClick={() => start('check')}
          >
            检查配置
          </Button>
        )}
        <Button
          variant="secondary"

          type="button"
          disabled={disabled}
          onClick={() => start('preview')}
        >
          预览配置
        </Button>
      </div>
      {choosing && (
        <Modal title="选择 Web 视图" onClose={() => setChoosing(undefined)}>
          <label htmlFor="preview-profile">Web 视图</label>
          <StudioSelect
            id="preview-profile"
            value={profiles.includes(profile) ? profile : profiles[0]}
            onValueChange={onProfile}
          >
            {profiles.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </StudioSelect>
          <button
            onClick={() => {
              void run(choosing, profiles.includes(profile) ? profile : profiles[0]);
              setChoosing(undefined);
            }}
          >
            {choosing === 'check' ? '开始检查' : '打开预览'}
          </button>
        </Modal>
      )}
      {request && (
        <Modal
          wide
          title={request.mode === 'preview' ? '配置预览' : '配置检查'}
          closeLabel={request.mode === 'preview' ? '关闭预览' : '关闭检查'}
          onClose={clear}
        >
          <div aria-live="polite">
            {request && !result && !request.error && (
              <p>正在{request.mode === 'preview' ? '准备预览' : '检查配置'}。</p>
            )}
            {request?.error && <p role="alert">{request.error}</p>}
            {result && (
              <>
                <p>
                  {result.success ? '配置检查通过' : '配置检查未通过'} · {result.target.platform}
                  {result.target.profile && ` / ${result.target.profile}`}
                </p>
                {result.diagnostics.length > 0 && (
                  <ul className="diagnostics">
                    {result.diagnostics.map((diagnostic, index) => (
                      <li key={index}>
                        <code>{diagnostic.code}</code>{' '}
                        {diagnostic.sourcePointer
                          ? `路径 ${diagnostic.sourcePointer}`
                          : diagnostic.location
                            ? `第 ${diagnostic.location.line} 行，第 ${diagnostic.location.column} 列`
                            : diagnostic.sourcePointer}{' '}
                        {diagnostic.message}
                        {onLocate && (
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => {
                              clear();
                              onLocate(diagnostic.sourcePointer);
                            }}
                          >
                            定位节点
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          {request && result?.prepared && (
            <div role="region" aria-label="受控预览" className="inline-form-preview">
              <section className="preview">
                <p>试填使用模拟数据与模拟交互。</p>
                <PreviewRuntime
                  key={request.id}
                  prepared={result.prepared}
                  onDiagnostic={reportDiagnostic}
                  onReady={runtimeReady}
                  onFailure={runtimeFailed}
                />
                {trialError && <p role="alert">{trialError}</p>}
                {confirmTrial && request.mode === 'preview' && 'text' in request.source && (
                  <button
                    disabled={!ready || !!trialError}
                    onClick={() => {
                      if ('text' in request.source) {
                        confirmTrial(request.source.text);
                        clear();
                      }
                    }}
                  >
                    确认此版试填结果
                  </button>
                )}
              </section>
            </div>
          )}
        </Modal>
      )}
    </section>
  );
}
