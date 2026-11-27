import type { RendererDiagnostic } from '@form-engine/renderer-react';
import type { createDiagnosticUpload } from './diagnostic-upload';
import { checkPassportDuplicates, travelPassportValidator } from './passport-validator';
import { travelEligibilityValidator } from './validator-registration';
import { remoteSelectRequests } from '@form-engine/materials-react';
import { readDelivery, type LoadedRelease } from './read-delivery';
export type { LoadedRelease } from './read-delivery';
import type { JsonValue } from '@form-engine/protocol';
import { defineHostRequests } from '@form-engine/renderer-react';
import { type createRuntime, type RuntimeOptions } from '@form-engine/runtime';
import { goldenData } from '../../../../playground/src/demos/travel/policy';
import { releaseWebCapabilities } from './available-capabilities';
import { resolvePreparedWebCapabilities } from './resolve-capabilities';

export const stages = [
  '获取发布',
  '校验摘要与目标',
  '匹配物料与函数制品',
  '检查宿主能力',
  '创建运行实例',
] as const;
export async function loadRelease(
  releaseId: string,
  signal: AbortSignal,
  stage: (index: number, release?: Awaited<ReturnType<typeof readDelivery>>) => void,
) {
  const release = await readDelivery(releaseId, signal, () => stage(1));
  stage(2, release);
  const capabilities = await resolvePreparedWebCapabilities(
    release.prepared,
    releaseWebCapabilities,
  );
  signal.throwIfAborted();
  return { ...release, capabilities };
}
const cities = ['北京', '上海', '广州', '深圳', '成都'];
export function startRelease(
  prepared: LoadedRelease,
  {
    materials,
    functions,
    runtime: engine,
  }: Awaited<ReturnType<typeof resolvePreparedWebCapabilities>>,
  show: (message: string) => void,
  onCreate: () => void,
  onRegistrations: (available: {
    requests: string[];
    events: string[];
    validators: string[];
  }) => void,
  upload?: ReturnType<typeof createDiagnosticUpload>,
) {
  const calls = { requests: 0, events: 0, validators: 0 };
  const requests = defineHostRequests(
    { 'travel.searchCities': remoteSelectRequests.search },
    {
      'travel.searchCities': async ({ query }) => {
        calls.requests++;
        return {
          items: cities
            .filter((city) => city.includes(query.trim()))
            .map((city) => ({ id: city, label: city })),
        };
      },
    },
  );
  let attempt = 0;
  let disposed = false;
  let savedDraft: ReturnType<ReturnType<typeof createRuntime>['snapshot']> | undefined;
  const host: NonNullable<RuntimeOptions['host']> = {
    validators: {
      [travelPassportValidator]: checkPassportDuplicates,
      [travelEligibilityValidator]: ({ read, target }) => {
        calls.validators++;
        const document = read(target);
        const denied = document.kind === 'value' && document.value === 'TEST-BLOCKED';
        return {
          result: Promise.resolve(
            denied
              ? [{ code: 'EXAMPLE_INELIGIBLE', message: '示例 Host 的本地资格校验未通过。' }]
              : [],
          ),
        };
      },
    },
    events: {
      'travel.saveDraft': () => {
        calls.events++;
        queueMicrotask(() => {
          if (disposed || !runtime) return;
          void runtime.flush().then(
            () => {
              if (disposed) return;
              savedDraft = runtime.snapshot();
              show('已保存在当前 Host 实例。');
            },
            () => {
              if (!disposed) show('无法保存当前草稿。');
            },
          );
        });
      },
      'travel.submit': () => {
        calls.events++;
        const current = ++attempt;
        void (async () => {
          try {
            await Promise.resolve();
            if (disposed || current !== attempt || !runtime) return;
            const flush = await runtime.flush();
            if (disposed || current !== attempt) return;
            const proof = flush.status === 'settled' ? await runtime.validate() : null;
            if (current === attempt) {
              show(
                proof?.status === 'valid' && proof.snapshot === runtime.snapshot()
                  ? '示例 Host 已接收填写结果。'
                  : '当前填写结果未通过校验。',
              );
            }
          } catch {
            if (current === attempt) show('无法验证当前填写结果。');
          }
        })();
      },
    },
  };
  const available = {
    requests: Object.keys(requests),
    events: Object.keys(host.events ?? {}),
    validators: Object.keys(host.validators ?? {}),
  };
  onRegistrations(available);
  const requirements = prepared.hostRequirements;
  const missing = [
    ...requirements.events.filter(
      ({ name, optional }) => !optional && !Object.hasOwn(host.events ?? {}, name),
    ),
    ...requirements.validators.filter(({ name }) => !Object.hasOwn(host.validators ?? {}, name)),
    ...requirements.requests.filter(({ name }) => !Object.hasOwn(requests, name)),
  ];
  if (missing.length)
    throw new Error('示例 Host 缺少必要能力：' + missing.map(({ name }) => name).join('、'));
  onCreate();
  const errors: string[] = [];
  function recordError(code: string) {
    errors.push(code.slice(0, 120));
    if (errors.length > 20) errors.shift();
  }
  let runtime: ReturnType<typeof createRuntime>;
  try {
    runtime = engine.create({
      prepared,
      functions,
      captureErrorTrace: upload !== undefined,
      onDiagnostic: (report) => {
        upload?.runtime(report);
        const entries = report.kind === 'runtime' ? [report.entry] : report.entries;
        for (const entry of entries)
          if (entry.kind.endsWith('.error') || entry.kind.endsWith('.abort'))
            recordError(entry.kind);
      },
      data: prepared.definition.id === 'family-travel' ? goldenData() : {},
      host,
    });
  } catch {
    throw new Error('发布制品与当前运行时或函数不兼容。');
  }
  return {
    runtime,
    calls,
    available,
    errors,
    diagnostic: (report: RendererDiagnostic) => {
      recordError(report.phase + ' · ' + report.code);
      upload?.renderer(report);
    },
    materials,
    requests,
    restoreDraft() {
      if (savedDraft !== undefined) {
        runtime.dispatch({
          op: 'set',
          target: { source: 'data', path: '' },
          value: { $literal: JSON.parse(JSON.stringify(savedDraft)) as JsonValue },
        });
        show('已恢复当前实例的草稿。');
      } else show('当前实例尚未保存草稿。');
    },
    dispose() {
      disposed = true;
      ++attempt;
      runtime.dispose();
    },
  };
}
