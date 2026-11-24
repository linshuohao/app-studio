import { compile } from '@form-engine/compiler';
import { createRuntime, type ReadonlyJson, type ValidatorIssue } from '@form-engine/runtime';
import { defineHostRequests } from '@form-engine/renderer-react';
import { remoteSelectRequests } from '@form-engine/materials-react';
import {
  createCoreFunctions,
  createTextIsNonBlank,
  createDateInclusiveDays,
  createTravelIsEligibleAge,
  createTravelRequiresGuardian,
  createTravelIsTripRangeAllowed,
  createTravelPersonPremium,
  createTravelTotalPremium,
} from '@form-engine/pure-functions';
import { artifact, definitions } from '../catalog';
import { travelDefinition, ref } from './definition';
import { blankData, goldenData } from './policy';
import { observationDefinition, observationData } from '../observation/scenario';
export type TravelProfile = 'desktop' | 'compact';
export type ValidationMode = 'pass' | 'reject' | 'failure' | 'manual';
export interface Delivery {
  draft: ReadonlyJson | null;
  submission: ReadonlyJson | null;
  submitStatus: 'idle' | 'pending' | 'valid' | 'invalid' | 'incomplete' | 'stale';
}
export interface EligibilityCall {
  id: number;
  member: string;
  cancelled: boolean;
  settled: boolean;
}
interface Work extends EligibilityCall {
  resolve: (issues: readonly ValidatorIssue[]) => void;
  reject: (reason: Error) => void;
}
/** Local acceptance Host only: no real eligibility, insurance pricing, persistence or submission. */
export function createTravelSession(
  onSnapshot: (value: ReadonlyJson) => void,
  onDelivery: (value: Delivery) => void,
  onCalls: (value: EligibilityCall[]) => void,
  observationScenario = false,
) {
  const business = [
    createTextIsNonBlank,
    createDateInclusiveDays,
    createTravelIsEligibleAge,
    createTravelRequiresGuardian,
    createTravelIsTripRangeAllowed,
    createTravelPersonPremium,
    createTravelTotalPremium,
  ].map((create) => create(artifact));
  const functions = {
    ...createCoreFunctions(artifact),
    ...Object.fromEntries(business.map((binding) => [binding.manifest.id, binding])),
  };
  const catalog = {
    id: 'travel-acceptance',
    materials: Object.fromEntries(
      definitions.map((d) => [d.contract.manifest.id, { manifest: d.contract.manifest, artifact }]),
    ),
    pureFunctions: Object.fromEntries(
      Object.entries(functions).map(([id, b]) => [
        id,
        { manifest: b.manifest, artifact: b.artifact },
      ]),
    ),
  };
  const definition = observationScenario ? observationDefinition() : travelDefinition;
  const initialData = observationScenario ? observationData : goldenData;
  const prepare = (profile: TravelProfile) => {
    const result = compile({ definition, catalog, target: { profile } });
    if (!result.success) throw Error(JSON.stringify(result.diagnostics));
    return result.prepared;
  };
  const profiles = { desktop: prepare('desktop'), compact: prepare('compact') };
  let disposed = false,
    mode: ValidationMode = 'pass',
    nextId = 0,
    attempt = 0;
  let delivery: Delivery = { draft: null, submission: null, submitStatus: 'idle' };
  const calls: Work[] = [];
  const publishCalls = () => {
    if (!disposed)
      onCalls(
        calls.map(({ id, member, cancelled, settled }) => ({ id, member, cancelled, settled })),
      );
  };
  const update = (patch: Partial<Delivery>) => {
    if (!disposed) {
      delivery = { ...delivery, ...patch };
      onDelivery(delivery);
    }
  };
  const finish = (work: Work, outcome: Exclude<ValidationMode, 'manual'>) => {
    if (work.settled) return;
    work.settled = true;
    if (outcome === 'failure') work.reject(Error('controlled eligibility failure'));
    else
      work.resolve(
        outcome === 'reject'
          ? [{ code: 'ELIGIBILITY_REJECTED', message: '本地资格核验未通过' }]
          : [],
      );
    publishCalls();
  };
  const requests = defineHostRequests(
    { 'travel.searchCities': remoteSelectRequests.search },
    {
      'travel.searchCities': ({ query, filterKey }) =>
        Promise.resolve({
          items: query.trim() ? [{ id: `${filterKey}:${query}`, label: `${query}市` }] : [],
        }),
    },
  );
  const submit = async () => {
    const current = ++attempt;
    update({ submission: null, submitStatus: 'pending' });
    try {
      const flush = await runtime.flush();
      if (disposed || current !== attempt) return;
      if (flush.status !== 'settled') {
        update({ submitStatus: 'incomplete' });
        return;
      }
      const proof = await runtime.validate();
      if (disposed || current !== attempt) return;
      // No async work between this eligibility check and the local handoff. A real service must recheck its own conditions.
      const status =
        proof.status === 'valid' && !Object.is(proof.snapshot, runtime.snapshot())
          ? 'stale'
          : proof.status;
      update({ submitStatus: status, submission: status === 'valid' ? proof.snapshot : null });
    } catch {
      if (!disposed && current === attempt)
        update({ submitStatus: 'incomplete', submission: null });
    }
  };
  const saveDraft = async () => {
    try {
      await runtime.flush();
      if (!disposed) update({ draft: runtime.snapshot() });
    } catch {
      /* Disposal revokes the local handoff. */
    }
  };
  const runtime = createRuntime({
    prepared: profiles.desktop,
    functions,
    data: initialData(),
    host: {
      validators: {
        'travel.checkEligibility': (input) => {
          const value = input.read(ref('/name', 'person'));
          const work: Work = {
            id: ++nextId,
            member:
              value.kind === 'value' && typeof value.value === 'string'
                ? value.value
                : '未命名成员',
            cancelled: false,
            settled: false,
            resolve: () => {},
            reject: () => {},
          };
          const result = new Promise<readonly ValidatorIssue[]>((resolve, reject) => {
            work.resolve = resolve;
            work.reject = reject;
          });
          calls.push(work);
          publishCalls();
          if (mode !== 'manual') {
            const outcome = mode;
            if (observationScenario)
              setTimeout(() => {
                if (!disposed) finish(work, outcome);
              }, 350);
            else finish(work, outcome);
          }
          return {
            result,
            cancel: () => {
              work.cancelled = true;
              publishCalls();
            },
          };
        },
      },
      events: {
        'travel.submit': () => {
          void submit();
        },
        'travel.saveDraft': () => {
          void saveDraft();
        },
        'travel.blank': () => {
          runtime.dispatch({ op: 'set', target: ref(''), value: blankData() });
        },
        'travel.golden': () => {
          runtime.dispatch({ op: 'set', target: ref(''), value: initialData() });
        },
        'travel.wrongTotal': () => {
          runtime.dispatch({ op: 'set', target: ref('/estimatedTotalMinor'), value: 999 });
        },
      },
    },
  });
  const observation = runtime.observe([ref('')], () => {
    if (!disposed) onSnapshot(runtime.snapshot());
  });
  onSnapshot(runtime.snapshot());
  onDelivery(delivery);
  return {
    runtime,
    profiles,
    requests,
    setValidationMode(value: ValidationMode) {
      mode = value;
    },
    completeValidations(outcome: Exclude<ValidationMode, 'manual'>) {
      for (const work of calls) finish(work, outcome);
    },
    dispose() {
      disposed = true;
      attempt++;
      observation.dispose();
      runtime.dispose();
      for (const work of calls)
        if (!work.settled) {
          work.settled = true;
          work.resolve([]);
        }
    },
  };
}
