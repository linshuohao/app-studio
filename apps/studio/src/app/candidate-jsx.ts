import type { JsonValue } from '@form-engine/protocol';
import type { ReadonlyPreparedForm } from '@form-engine/protocol/prepared';

const passportValidator = 'travel.checkPassportDuplicates';
const previewSubmit = 'travel.previewUnderwritingSubmit';
const cityRequest = 'travel.searchCities';

export function candidateContextPaths(prepared: ReadonlyPreparedForm) {
  const paths = new Set<string>();
  function visit(value: unknown) {
    if (!value || typeof value !== 'object') return;
    if (
      'source' in value &&
      value.source === 'context' &&
      'path' in value &&
      typeof value.path === 'string'
    )
      paths.add(value.path);
    for (const child of Object.values(value)) visit(child);
  }
  visit(prepared.definition);
  return [...paths].sort();
}

// Only provide synthetic values for fields the candidate actually declares.
function sampleObject(schema: unknown, sample: Record<string, JsonValue>) {
  if (!schema || typeof schema !== 'object' || !('properties' in schema)) return {};
  const fields = schema.properties;
  if (!fields || typeof fields !== 'object') return {};
  return Object.fromEntries(Object.entries(sample).filter(([key]) => Object.hasOwn(fields, key)));
}

export function candidateSample(prepared: ReadonlyPreparedForm) {
  const schema = prepared.definition.data.schema;
  if (!prepared.hostRequirements.events.some(({ name }) => name === previewSubmit)) return {};
  if (typeof schema !== 'object' || !schema.properties || typeof schema.properties !== 'object')
    return {};
  const properties = schema.properties as Readonly<Record<string, unknown>>;
  const { applicant, travel, insureds } = properties;
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const date = tomorrow.toISOString().slice(0, 10);
  const person = sampleObject(applicant, {
    name: '张三',
    surname: 'ZHANG',
    givenName: 'SAN',
    birthDate: '1987-02-01',
    passportNumber: 'E00000001',
    passportExpiry: `${tomorrow.getUTCFullYear() + 3}-01-01`,
    phone: '13800000000',
    mobile: '13800000000',
    email: 'demo@example.com',
  });
  const plan = sampleObject(travel, {
    country: 'JP',
    countryCode: 'JP',
    plan: 'basic',
    startDate: date,
    endDate: date,
    destinationCountry: 'JP',
  });
  // Allow schema defaults and initial reactions to create the self row when declared.
  return sampleObject(schema, {
    ...(travel ? { travel: plan } : {}),
    ...(applicant ? { applicant: person } : {}),
    ...(insureds &&
    typeof insureds === 'object' &&
    !('default' in insureds) &&
    'items' in insureds &&
    insureds.items &&
    !Array.isArray(insureds.items)
      ? {
          insureds: [
            sampleObject(insureds.items, {
              ...person,
              relationship: 'self',
              personId: 'self',
              memberId: 'self',
            }),
          ],
        }
      : {}),
    confirmed: false,
  });
}

function purchaseLineLimit(prepared: ReadonlyPreparedForm) {
  const schema = prepared.definition.data.schema;
  const fields = typeof schema === 'object' && schema.properties;
  if (!fields || typeof fields !== 'object' || !('budgetMinor' in fields) || !('items' in fields))
    return;
  const rows = fields.items;
  if (
    !rows ||
    typeof rows !== 'object' ||
    !('maxItems' in rows) ||
    !('items' in rows) ||
    typeof rows.maxItems !== 'number'
  )
    return;
  const item = rows.items;
  const line = item && typeof item === 'object' && 'properties' in item && item.properties;
  if (
    line &&
    typeof line === 'object' &&
    'lineId' in line &&
    'quantity' in line &&
    'unitPriceMinor' in line &&
    prepared.definition.constraints?.some(({ id }) => id === 'budget-within-limit')
  )
    return rows.maxItems;
}

const purchaseTypes = `
const purchaseItems = { source: 'data', path: '/items' };

/**
 * @typedef {{ lineId: string, sku?: string, description?: string,
 *   category?: 'office' | 'equipment' | 'service', quantity?: number,
 *   unitPriceMinor?: number, comparisonNo?: string, serviceScope?: string }} PurchaseLineDraft
 * @typedef {{ items: readonly Readonly<PurchaseLineDraft>[], index: number }} NewPurchaseLineInput
 * @typedef {{ department: string, requester: string, costCenter: string,
 *   urgency: 'normal' | 'urgent', neededBy: string, businessPurpose: string,
 *   budgetMinor: number, emergencyReason?: string, confirmed: true,
 *   items: readonly Readonly<Required<Pick<PurchaseLineDraft, 'lineId' | 'sku' |
 *     'description' | 'category' | 'quantity' | 'unitPriceMinor'>> &
 *     Pick<PurchaseLineDraft, 'comparisonNo' | 'serviceScope'>>[] }} ValidatedPurchase
 * @typedef {{ receiptId: string }} PurchaseReceipt
 * @typedef {{
 *   createPurchaseLine?: (input: NewPurchaseLineInput) => PurchaseLineDraft,
 *   submitPurchaseRequest?: (input: { snapshot: Readonly<ValidatedPurchase> }) => Promise<PurchaseReceipt>
 * }} PurchaseIntegration
 *
 * createPurchaseLine: 生成稳定且唯一的 lineId，返回新行初值。
 * submitPurchaseRequest: 从校验快照投影送审字段，移除内部状态和不适用字段，
 * 按整数分重算小计与整单合计，以业务幂等键提交并返回采购回执。失败时拒绝 Promise。
 */
`;

function hostHandlers(
  names: readonly { name: string; optional?: boolean }[],
  registry: 'validators' | 'events' | 'requests',
) {
  const signatures = {
    validators: [
      'input',
      "@param {import('@form-engine/runtime').ValidatorInput} input",
      "@returns {import('@form-engine/runtime').ValidatorTask}",
    ],
    events: [
      'input',
      "@param {import('@form-engine/runtime').HostEventInput} input",
      '@returns {void}',
    ],
    requests: [
      'payload, options',
      "@param {import('@form-engine/protocol').JsonValue} payload @param {{ signal: AbortSignal }} options",
      "@returns {import('@form-engine/protocol').JsonValue | Promise<import('@form-engine/protocol').JsonValue>}",
    ],
  };
  const [parameters, input, output] = signatures[registry];
  return names
    .map(({ name, optional }) => {
      const key = JSON.stringify(name);
      const fail = `new Error(${JSON.stringify(`待接入 ${registry}.${name}`)})`;
      const missing =
        registry === 'validators'
          ? `return { result: Promise.reject(${fail}) };`
          : optional
            ? 'return;'
            : `throw ${fail};`;
      return `        /**
         * ${input}
         * ${output}
         */
        [${key}]: (${parameters}) => {
          const registry = hostInputs.current.handlers.${registry};
          const handler = registry && Object.hasOwn(registry, ${key}) ? registry[${key}] : undefined;
          if (typeof handler !== 'function') ${missing}
          return handler(${parameters});
        },`;
    })
    .join('\n');
}

export function candidateExample(prepared: ReadonlyPreparedForm, exampleCode?: string | null) {
  const { requests, events, validators } = prepared.hostRequirements;
  const purchaseLimit = purchaseLineLimit(prepared);
  const purchase = purchaseLimit !== undefined;
  const customValidators = validators.filter(({ name }) => name !== passportValidator);
  const customEvents = events.filter(
    ({ name }) => ![previewSubmit, 'travel.submit', 'travel.saveDraft'].includes(name),
  );
  const customRequests = requests.filter(({ name }) => name !== cityRequest);
  const unsupported = [
    ...customRequests,
    ...customEvents.filter(({ optional }) => !optional),
    ...customValidators,
  ].map(({ name }) => name);
  const sample = candidateSample(prepared);
  const usesPassport = validators.some(({ name }) => name === passportValidator);
  const usesCities = requests.some(({ name }) => name === cityRequest);
  const underwriting = events.some(({ name }) => name === previewSubmit);
  const travelSubmit = events.some(({ name }) => name === 'travel.submit');
  const manualCheck = !underwriting && !travelSubmit;
  const useHandlers = !!(customRequests.length || customEvents.length || customValidators.length);
  const requestRegistry = customRequests.length ? 'requestHandlers' : usesCities ? 'requests' : '';
  // Treat model output as line comments, including Unicode line separators.
  const modelNotes = exampleCode
    ? [
        '// 本次候选的 Host 接入伪代码（模型生成）',
        ...exampleCode.split(/[\r\n\u2028\u2029]+/u).map((line) => '//   ' + line),
        '',
      ].join('\n')
    : '';
  const save = events.some(({ name }) => name === 'travel.saveDraft');
  const jsx = `'use client';

import { useEffect, useRef, useState } from 'react';
import { createRuntime } from '@form-engine/runtime';
import { ${usesCities ? 'defineHostRequests, ' : ''}FormRenderer } from '@form-engine/renderer-react';
${usesCities ? "import { remoteSelectRequests } from '@form-engine/materials-react';\n" : ''}import '@form-engine/materials-react/styles.css';
import { installedWebCapabilities } from './web-capabilities';
${usesPassport ? "import { checkPassportDuplicates } from './host/passport-validator';\n" : ''}${underwriting ? "import { projectUnderwritingSubmission } from './host/underwriting-projection';\n" : ''}import prepared from './prepared.json';
import initialData from './sample-data.json';

const { materials, functions } = installedWebCapabilities;
${modelNotes}
${useHandlers ? 'const emptyHandlers = {};\n' : ''}${purchase ? purchaseTypes : ''}${
    usesCities
      ? `
const requests = defineHostRequests({ '${cityRequest}': remoteSelectRequests.search }, {
  '${cityRequest}': ({ query, filterKey }, { signal }) => {
    signal.throwIfAborted();
    const term = query.trim();
    return Promise.resolve({
      items: term ? [{ id: filterKey + ':' + term, label: term + '市（模拟）' }] : [],
    });
  },
});
`
      : ''
  }
${purchase ? '/** @param {{ context?: object, data?: object, integration?: PurchaseIntegration' + (useHandlers ? ', host?: object' : '') + ' }} props */\n' : ''}export default function CandidateForm({ context: hostContext, data = initialData${useHandlers ? ', host: handlers = emptyHandlers' : ''}${purchase ? ', integration' : ''} } = {}) {
  // Mount with a different React key to start an independent form with new initial data.
  const initialValues = useRef(data);
  const hostInputs = useRef({ hostContext${useHandlers ? ', handlers' : ''}${purchase ? ', integration' : ''} });
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState('');
${purchase ? '  const [lineCount, setLineCount] = useState(0);\n  const [submitting, setSubmitting] = useState(false);\n' : ''}
  useEffect(() => {
    hostInputs.current = { hostContext${useHandlers ? ', handlers' : ''}${purchase ? ', integration' : ''} };
  }, [hostContext${useHandlers ? ', handlers' : ''}${purchase ? ', integration' : ''}]);

  useEffect(() => {
    let active = true;
    let attempt = 0;
${purchase ? '    let sending = false;\n    setSubmitting(false);\n' : ''}    let context = hostInputs.current.hostContext;
    const today = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Shanghai',
    }).format(new Date());
${
  validators.length || events.length
    ? `    const host = {
${
  validators.length
    ? `      validators: {
${usesPassport ? `        ['${passportValidator}']: checkPassportDuplicates,\n` : ''}${customValidators.length ? hostHandlers(customValidators, 'validators') + '\n' : ''}      },
`
    : ''
}${
        events.length
          ? `      events: {
${underwriting ? `        ['${previewSubmit}']: () => void check(true),\n` : ''}${travelSubmit ? "        ['travel.submit']: () => void check(),\n" : ''}${save ? "        ['travel.saveDraft']: () => setStatus('已模拟保存草稿。'),\n" : ''}${customEvents.length ? hostHandlers(customEvents, 'events') + '\n' : ''}      },
`
          : ''
      }    };
`
    : ''
}${
    customRequests.length
      ? `    const requestHandlers = {
${usesCities ? '        ...requests,\n' : ''}${hostHandlers(customRequests, 'requests')}
    };
`
      : ''
  }    const instance = createRuntime({
      prepared,
      functions,
      data: initialValues.current,
      context: { today, ...context },
${validators.length || events.length ? '      host,\n' : ''}    });
${
  purchase
    ? `
    const updateLineCount = () => setLineCount(instance.snapshot().items?.length ?? 0);
    const lineObservation = instance.observe([purchaseItems], updateLineCount);
    updateLineCount();

    function addPurchaseLine() {
      const items = instance.snapshot().items;
      if (!Array.isArray(items) || items.length >= ${purchaseLimit}) return;
      const { integration } = hostInputs.current;
      if (!integration?.createPurchaseLine) {
        setStatus('请接入 createPurchaseLine 以新增采购明细。');
        return;
      }
      try {
        const value = integration.createPurchaseLine({ items, index: items.length });
        if (!value?.lineId?.trim() || items.some(({ lineId }) => lineId === value.lineId)) {
          setStatus('新采购明细需要唯一的 lineId。');
          return;
        }
        const result = instance.dispatch({
          op: 'array.insert',
          target: purchaseItems,
          position: { kind: 'index', index: items.length },
          value: { $literal: value },
        });
        setStatus(result.ok ? '' : '新增采购明细失败。');
      } catch {
        setStatus('新增采购明细失败。');
      }
    }
`
    : ''
}
    async function check(${purchase ? 'submitToHost = false' : underwriting ? 'project = false' : ''}) {
${purchase ? '      if (sending) return;\n      let startedSending = false;\n' : ''}      const current = ++attempt;
      setStatus('正在执行整单校验。');
      try {
        const flush = await instance.flush();
        if (!active || current !== attempt) return;
        const proof = flush.status === 'settled' ? await instance.validate() : null;
        if (!active || current !== attempt) return;
        if (proof?.status !== 'valid' || proof.snapshot !== instance.snapshot()) {
          setStatus('整单校验未通过。');
          return;
        }
${
  purchase
    ? `        if (submitToHost) {
          const { integration } = hostInputs.current;
          if (!integration?.submitPurchaseRequest) {
            setStatus('整单校验通过。请接入 submitPurchaseRequest 以送审。');
            return;
          }
          sending = true;
          startedSending = true;
          setSubmitting(true);
          const receipt = await integration.submitPurchaseRequest({ snapshot: proof.snapshot });
          if (active) setStatus('采购回执 ' + receipt.receiptId);
          return;
        }
        setStatus('整单校验通过。');`
    : underwriting
      ? `        if (project) {
          const submission = projectUnderwritingSubmission(proof.snapshot);
          setStatus(submission
            ? '本地校验与投影通过，渠道核保待接入。'
            : '投保数据投影未通过。');
          return;
        }
        setStatus('模拟提交校验通过。');`
      : `        setStatus('${travelSubmit ? '模拟提交校验通过。' : '整单校验通过。'}');`
}
      } catch {
        if (active && current === attempt) setStatus(${purchase ? "startedSending ? '送审失败，工作值已保留。' : " : ''}'整单校验未通过。');
      }${
        purchase
          ? ` finally {
        if (startedSending) {
          sending = false;
          if (active) setSubmitting(false);
        }
      }`
          : ''
      }
    }

    function updateContext(next) {
      if (next === context) return;
      context = next;
      instance.replaceContext({ today, ...context });
    }

    setSession({ runtime: instance, check, updateContext${purchase ? ', addPurchaseLine' : ''}${customRequests.length ? ', requestHandlers' : ''} });
    return () => {
      active = false;
${purchase ? '      lineObservation.dispose();\n' : ''}      instance.dispose();
    };
  }, []);

  useEffect(() => {
    session?.updateContext(hostContext);
  }, [session, hostContext]);

  if (!session) return <p role="status">正在装载表单…</p>;
  return (
    <>
${
  purchase
    ? `      <button type="button" onClick={session.addPurchaseLine} disabled={lineCount >= ${purchaseLimit}}>
        新增采购明细
      </button>
`
    : ''
}      <FormRenderer prepared={prepared} runtime={session.runtime} materials={materials}${requestRegistry ? ' requests={' + (customRequests.length ? 'session.' : '') + requestRegistry + '}' : ''} />
${manualCheck ? '      <button type="button" onClick={() => void session.check()}>校验表单</button>\n' : ''}${
    purchase
      ? `      <button type="button" onClick={() => void session.check(true)} disabled={submitting}>送审</button>
`
      : ''
  }      {status && <p role="status">{status}</p>}
    </>
  );
}
`;
  return { unsupported, sample, jsx, purchase };
}
