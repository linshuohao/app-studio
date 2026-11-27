'use client';

import { addPreviewExpense } from './host/expense-preview';
import { checkPassportDuplicates, travelPassportValidator } from './host/passport-validator';
import { projectUnderwritingSubmission } from './host/underwriting-projection';
import { travelEligibilityValidator } from './host/validator-registration';
import { remoteSelectRequests } from '@form-engine/materials-react';
import type { ReadonlyPreparedForm } from '@form-engine/protocol/prepared';
import type { JsonValue } from '@form-engine/protocol';
import { defineHostRequests, FormRenderer } from '@form-engine/renderer-react';
import { type FormRuntime, type RuntimeOptions } from '@form-engine/runtime';
import { useEffect, useRef, useState } from 'react';
import { goldenData } from '../../../playground/src/demos/travel/policy';
import { previewWebCapabilities } from './host/available-capabilities';
import { resolvePreparedWebCapabilities, type WebCapabilities } from './host/resolve-capabilities';

function simulate<T>(value: T) {
  let settle: (value: T) => void;
  const result = new Promise<T>((resolve) => {
    settle = resolve;
  });
  const timer = setTimeout(() => settle(value), 180);
  return {
    result,
    cancel() {
      clearTimeout(timer);
      settle(value);
    },
  };
}

const requests = defineHostRequests(
  { 'travel.searchCities': remoteSelectRequests.search },
  {
    'travel.searchCities': ({ query, filterKey }, { signal }) => {
      const work = simulate({
        items: query.trim() ? [{ id: `${filterKey}:${query}`, label: `${query}市（模拟）` }] : [],
      });
      if (signal.aborted) work.cancel();
      else signal.addEventListener('abort', work.cancel, { once: true });
      return work.result.finally(() => signal.removeEventListener('abort', work.cancel));
    },
  },
);

export function PreviewRuntime({
  prepared,
  data,
  preserveData = false,
  capabilities,
  onReady,
  onFailure,
  onDiagnostic,
}: {
  prepared: ReadonlyPreparedForm;
  data?: JsonValue;
  preserveData?: boolean;
  capabilities?: WebCapabilities;
  onDiagnostic?: React.ComponentProps<typeof FormRenderer>['onDiagnostic'];
  onFailure?: (reason: string) => void;
  onReady?: (r: FormRuntime) => void;
}) {
  const [session, setSession] = useState<{
    prepared: ReadonlyPreparedForm;
    runtime: FormRuntime;
    materials: WebCapabilities['materials'];
  }>();
  const previewData = useRef<JsonValue | undefined>(undefined);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    let submitAttempt = 0;
    let instance: FormRuntime | undefined;
    queueMicrotask(async () => {
      if (!active) return;
      setMessage('');
      const show = (value: string) => {
        if (active) setMessage(value);
      };
      const submit = (underwriting: boolean) => {
        const runtime = instance;
        if (!active || !runtime) return;
        const attempt = ++submitAttempt;
        show('正在模拟提交校验。');
        void (async () => {
          try {
            const flush = await runtime.flush();
            if (!active || attempt !== submitAttempt) return;
            const proof = flush.status === 'settled' ? await runtime.validate() : null;
            if (!active || attempt !== submitAttempt) return;
            const valid = proof?.status === 'valid' && proof.snapshot === runtime.snapshot();
            if (valid && underwriting) {
              show(
                projectUnderwritingSubmission(proof.snapshot)
                  ? '模拟提交校验与投保数据投影通过，渠道核保待接入。'
                  : '模拟投保数据投影未通过。',
              );
            } else {
              show(valid ? '模拟提交校验通过。' : '模拟提交未通过校验。');
            }
          } catch {
            if (attempt === submitAttempt) show('模拟提交未通过校验。');
          }
        })();
      };
      const host: NonNullable<RuntimeOptions['host']> = {
        validators: {
          [travelPassportValidator]: checkPassportDuplicates,
          [travelEligibilityValidator]: () => simulate([]),
        },
        events: {
          'travel.saveDraft': () => show('模拟保存草稿完成。'),
          'travel.submit': () => submit(false),
          'travel.previewUnderwritingSubmit': () => submit(true),
          'business.addExpense': () => {
            if (active && instance) show(addPreviewExpense(instance));
          },
        },
      };
      const requirements = prepared.hostRequirements;
      const unsupported = [
        ...requirements.events.filter(
          ({ name, optional }) => !optional && !Object.hasOwn(host.events ?? {}, name),
        ),
        ...requirements.validators.filter(
          ({ name }) => !Object.hasOwn(host.validators ?? {}, name),
        ),
        ...requirements.requests.filter(({ name }) => !Object.hasOwn(requests, name)),
      ];
      if (unsupported.length) {
        setSession(undefined);
        onFailure?.('缺少模拟能力 · ' + unsupported.map((r) => r.name).join('、'));
        show(
          `当前 Web 预览未配置这些模拟能力：${unsupported.map(({ name }) => name).join('、')}。`,
        );
        return;
      }
      setSession(undefined);
      try {
        const {
          materials,
          functions,
          runtime: engine,
        } = await resolvePreparedWebCapabilities(
          prepared,
          capabilities ? [capabilities] : previewWebCapabilities,
        );
        if (!active) return;
        instance = engine.create({
          prepared,
          functions,
          data:
            preserveData && previewData.current !== undefined
              ? structuredClone(previewData.current)
              : data !== undefined
                ? structuredClone(data)
                : prepared.definition.id === 'family-travel'
                  ? goldenData()
                  : {},
          context: {
            today: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(
              new Date(),
            ),
          },
          host,
        });
        setSession({ prepared, runtime: instance, materials });
        onReady?.(instance);
      } catch (error) {
        if (!active) return;
        const reason =
          error instanceof Error ? '无法启动预览实例：' + error.message : '无法启动预览实例。';
        setSession(undefined);
        onFailure?.(reason);
        show(reason);
      }
    });
    return () => {
      active = false;
      if (instance && preserveData)
        previewData.current = structuredClone(instance.snapshot()) as JsonValue;
      instance?.dispose();
    };
  }, [prepared, data, onReady, onFailure, preserveData, capabilities]);

  return (
    <>
      {message && <p aria-live="polite">{message}</p>}
      {session?.prepared === prepared && (
        <FormRenderer
          onDiagnostic={onDiagnostic}
          prepared={session.prepared}
          runtime={session.runtime}
          materials={session.materials}
          requests={requests}
        />
      )}
    </>
  );
}
