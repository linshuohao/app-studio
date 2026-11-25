import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checkDataSchema } from '@form-engine/compiler';
import * as business from '@form-engine/pure-functions';
import { createRuntime } from '@form-engine/runtime';
import {
  compileWebConfig,
  webCatalog,
  webTarget,
  withTravelPreviewHost,
} from '../../services/api/src/platform/web-check.ts';

const artifact = { id: 'createform-eval-web', platform: 'web', digest: `sha256:${'5'.repeat(64)}` };
const catalog = withTravelPreviewHost(webCatalog(artifact.id, artifact, artifact));
const request = JSON.parse(readFileSync(0, 'utf8'));
const ref = (path) => ({ source: 'data', path });

function capabilities(kind, query) {
  if (kind === 'host') return catalog.host;
  const entries = kind === 'material' ? catalog.materials : catalog.pureFunctions;
  const words = query.toLowerCase().split(/[^\w.-]+/);
  const matches = Object.entries(entries).filter(([id]) => words.includes(id.toLowerCase()));
  return matches.length ? matches.map(([, entry]) => entry.manifest) : Object.keys(entries);
}

async function assertBehavior(prepared, assertion) {
  if (assertion.request)
    return prepared.hostRequirements.requests.some(({ name }) => name === assertion.request);
  const functions = { ...business.createCoreFunctions(artifact) };
  for (const name of Object.keys(business)) {
    if (!name.startsWith('create') || name === 'createCoreFunctions') continue;
    const binding = business[name](artifact);
    if (binding?.manifest) functions[binding.manifest.id] = binding;
  }
  const runtime = createRuntime({ prepared, data: assertion.data, functions });
  try {
    for (const step of assertion.steps ?? []) {
      const dispatch = runtime.dispatch({ op: 'set', target: ref(step.path), value: step.value });
      if (!dispatch.ok) return { commandErrors: dispatch.errors };
    }
    const flush = await runtime.flush();
    if (flush.status !== 'settled') return { flush: flush.status };
    if (assertion.path) return runtime.read(ref(assertion.path));
    return (await runtime.validate()).status;
  } finally {
    runtime.dispose();
  }
}

async function run() {
  if (request.operation === 'catalog') return capabilities(request.kind, request.query);
  if (request.operation === 'check-schema') {
    const check = checkDataSchema(JSON.parse(request.schema), {}, request.cases);
    return {
      check_id: randomUUID(),
      check_environment: catalog.id,
      candidate_digest: 'sha256:' + createHash('sha256').update(request.schema).digest('hex'),
      success: check.valid,
      diagnostics: check.diagnostics,
    };
  }
  const check = compileWebConfig(request.candidate, { catalog, target: webTarget(undefined) });
  if (request.operation === 'check') {
    return {
      check_id: randomUUID(),
      check_environment: catalog.id,
      candidate_digest: 'sha256:' + createHash('sha256').update(request.candidate).digest('hex'),
      success: check.success,
      diagnostics: check.diagnostics,
      host_requirements: check.success ? check.prepared.hostRequirements : {},
    };
  }
  if (request.operation !== 'runtime') throw Error('Unknown evaluation operation');
  if (!check.success) return { diagnostics: check.diagnostics };
  const assertions = [];
  for (const assertion of request.assertions) {
    assertions.push({ id: assertion.id, actual: await assertBehavior(check.prepared, assertion) });
  }
  return { assertions };
}

process.stdout.write(JSON.stringify(await run()));
