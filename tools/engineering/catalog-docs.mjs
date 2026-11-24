// Generate read-only catalog documentation from asset-owned README files and runnable demos.
import { registerHooks, createRequire } from 'node:module';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const require = createRequire(resolve(root, 'services/api/package.json'));
const { transformSync } = require('@swc/core');
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && context.parentURL) {
        for (const suffix of ['.ts', '/index.ts']) {
          const candidate = new URL(specifier.replace(/\.js$/, '') + suffix, context.parentURL);
          if (existsSync(candidate)) return next(candidate.href, context);
        }
      }
      throw error;
    }
  },
  load(url, context, next) {
    if (url.startsWith('file:') && url.endsWith('.ts'))
      return {
        format: 'module',
        shortCircuit: true,
        source: transformSync(readFileSync(new URL(url), 'utf8'), {
          jsc: { parser: { syntax: 'typescript' }, target: 'es2023' },
          module: { type: 'es6' },
        }).code,
      };
    return next(url, context);
  },
});
const docs = {};
const contracts = {};
for (const pkg of ['materials-react', 'pure-functions']) {
  const base = resolve(root, 'packages', pkg, 'src');
  for (const dir of readdirSync(base)) {
    const manifest = resolve(base, dir, 'manifest.ts'),
      readme = resolve(base, dir, 'README.md');
    if (!existsSync(manifest) || !existsSync(readme)) continue;
    const { manifest: contract } = await import(pathToFileURL(manifest));
    contracts[contract.id] = contract;
    docs[contract.id] = {
      version: contract.version,
      description: readFileSync(readme, 'utf8'),
      implementation: pkg === 'materials-react' ? 'React' : 'JavaScript',
      source: relative(root, readme),
      examples: [],
    };
  }
}
function visit(value, source) {
  if (!value || typeof value !== 'object') return;
  const id = value.material ?? value.op;
  if (typeof id === 'string') {
    // Keep a genuine fragment with its context; never invent required bindings or arguments.
    if (!docs[id] && id.startsWith('core.'))
      docs[id] = {
        version: '1',
        description: '内建函数。参数与返回契约由当前安装包提供；以下片段来自工程示例。',
        source: 'packages/pure-functions/src/index.ts',
        examples: [],
      };
    if (docs[id] && docs[id].examples.length === 0) docs[id].examples.push({ source, value });
  }
  for (const child of Object.values(value)) visit(child, source);
}
for (const scenario of ['travel', 'interactions', 'members', 'basic']) {
  const source = `apps/playground/src/demos/${scenario}/definition.ts`;
  const entries = await import(pathToFileURL(resolve(root, source)));
  for (const value of Object.values(entries)) if (typeof value === 'object') visit(value, source);
}
const coreSource = 'packages/pure-functions/catalog-docs.json';
for (const [id, doc] of Object.entries(
  JSON.parse(readFileSync(resolve(root, coreSource), 'utf8')),
)) {
  if (!Object.hasOwn(doc, 'example')) {
    if (!docs[id]) throw new Error(`Unknown catalog metadata: ${id}`);
    Object.assign(docs[id], doc);
    continue;
  }
  docs[id] = {
    version: '1',
    title: doc.title,
    displayTemplate: doc.displayTemplate,
    displayLines: doc.displayLines,
    parameterLabels: doc.parameterLabels,
    annotations: doc.annotations,
    callExamples: doc.callExamples,
    description: `# ${doc.title}\n\n${doc.description}`,
    source: coreSource,
    examples: [{ source: coreSource, value: doc.example }],
  };
}
const materialMetadata = JSON.parse(
  readFileSync(resolve(root, 'packages/materials-react/catalog-docs.json'), 'utf8'),
);
for (const [id, doc] of Object.entries(docs)) {
  if (materialMetadata[id]) Object.assign(doc, materialMetadata[id]);
  else {
    doc.implementation ??= 'JavaScript';
    doc.category ??=
      doc.implementation === 'React'
        ? '未分类'
        : id.startsWith('core.')
          ? '基础运算'
          : id.startsWith('date.')
            ? '日期'
            : id.startsWith('text.')
              ? '文本'
              : '业务规则';
  }
}
const { createCoreFunctions } = await import(
  pathToFileURL(resolve(root, 'packages/pure-functions/src/index.ts'))
);
for (const binding of Object.values(
  createCoreFunctions({ id: 'documentation-check', digest: 'documentation-check' }),
))
  contracts[binding.manifest.id] = binding.manifest;
for (const [id, doc] of Object.entries(docs)) {
  const contract = contracts[id];
  if (!contract || contract.version !== doc.version)
    throw new Error(`Catalog documentation version mismatch: ${id}`);
  for (const [pointer, description] of Object.entries(doc.annotations ?? {})) {
    const target = pointer
      .split('/')
      .slice(1)
      .reduce((value, key) => value?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], contract);
    if (
      !pointer.startsWith('/') ||
      target === undefined ||
      typeof description !== 'string' ||
      !description.trim()
    )
      throw new Error(`Invalid catalog annotation: ${id}${pointer}`);
  }
  if (doc.displayTemplate !== undefined) {
    const template = doc.displayTemplate;
    const names = contract.parameters?.map((parameter) => parameter.name) ?? [];
    const slots =
      typeof template === 'string'
        ? [...template.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1])
        : [];
    if (
      typeof template !== 'string' ||
      !template.trim() ||
      /[{}]/.test(template.replace(/\{[^{}]+\}/g, '')) ||
      contract.restParameter ||
      slots.some((slot) => !names.includes(slot)) ||
      names.some((name) => !slots.includes(name))
    )
      throw new Error(`Invalid display template for ${id}: expected slots ${names.join(', ')}`);
  }
  if (contract.parameters) {
    const names = contract.parameters.map(({ name }) => name);
    const parameters = contract.restParameter ? [...names, contract.restParameter.name] : names;
    if (
      parameters.some((name) => !Object.hasOwn(doc.parameterLabels ?? {}, name)) ||
      Object.entries(doc.parameterLabels ?? {}).some(
        ([name, label]) => !parameters.includes(name) || typeof label !== 'string' || !label.trim(),
      )
    )
      throw new Error(`Invalid catalog parameter labels: ${id}`);
    if (doc.displayLines !== undefined) {
      const lines = doc.displayLines;
      const slots = Array.isArray(lines)
        ? lines.flatMap((line) =>
            typeof line === 'string'
              ? [...line.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1])
              : [],
          )
        : [];
      if (
        !Array.isArray(lines) ||
        !lines.length ||
        contract.restParameter ||
        lines.some(
          (line) =>
            typeof line !== 'string' ||
            !line.trim() ||
            /[{}]/.test(line.replace(/\{[^{}]+\}/g, '')),
        ) ||
        slots.some((slot) => !names.includes(slot)) ||
        names.some((name) => !slots.includes(name))
      )
        throw new Error(`Invalid catalog display lines: ${id}`);
    }
  }
  const required = [
    ...Object.keys(contract.propsSchema?.properties ?? {}).map(
      (key) => `/propsSchema/properties/${key}`,
    ),
    ...Object.keys(contract.bindings ?? {}).map((key) => `/bindings/${key}`),
    ...(contract.parameters ?? []).map((_, index) => `/parameters/${index}`),
    ...(contract.returns === undefined ? [] : ['/returns']),
    ...(contract.restParameter === undefined ? [] : ['/restParameter']),
  ];
  function requireFields(schema, pointer) {
    if (!schema || typeof schema !== 'object') return;
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      const at = `${pointer}/properties/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
      required.push(at);
      requireFields(child, at);
    }
    if (schema.items) requireFields(schema.items, `${pointer}/items`);
    for (const union of ['anyOf', 'oneOf', 'allOf'])
      schema[union]?.forEach((child, i) => requireFields(child, `${pointer}/${union}/${i}`));
  }
  requireFields(contract.propsSchema, '/propsSchema');
  for (const [name, binding] of Object.entries(contract.bindings ?? {}))
    requireFields(binding.schema, `/bindings/${name}/schema`);
  (contract.parameters ?? []).forEach((parameter, index) =>
    requireFields(parameter.schema, `/parameters/${index}/schema`),
  );
  requireFields(contract.returns, '/returns');
  (contract.slots ?? []).forEach((_, index) => required.push(`/slots/${index}`));
  for (const [name, event] of Object.entries(contract.events ?? {})) {
    required.push(`/events/${name}`);
    requireFields(event.payloadSchema, `/events/${name}/payloadSchema`);
  }
  if (contract.parameters && !doc.callExamples?.length)
    throw new Error(`Missing function call example: ${id}`);
  if (contract.propsSchema && !doc.valueExamples?.length)
    throw new Error(`Missing material value example: ${id}`);
  if (!doc.examples.length) throw new Error(`Missing configuration example: ${id}`);
  for (const [name, request] of Object.entries(contract.requests ?? {})) {
    const at = `/requests/${name}`;
    required.push(at);
    requireFields(request.payloadSchema, `${at}/payloadSchema`);
    requireFields(request.resultSchema, `${at}/resultSchema`);
  }
  for (const pointer of required)
    if (!doc.annotations?.[pointer]) throw new Error(`Missing catalog annotation: ${id}${pointer}`);
}
const output =
  '// Generated by tools/engineering/catalog-docs.mjs. Do not edit.\nexport const catalogDocumentation: Record<string, { version: string; description: string; source: string; title?: string; summary?: string; displayTemplate?: string; displayLines?: string[]; parameterLabels?: Record<string, string>; annotations?: Record<string, string>; valueExamples?: { title: string; description: string; value: unknown }[]; callExamples?: { args: unknown[]; result: unknown; description: string }[]; requestExamples?: Record<string, { title: string; description: string; value: unknown }[]>; category: string; implementation: string; examples: { source: string; value: unknown }[] }> = ' +
  JSON.stringify(docs, null, 2) +
  ';\n';
const target = resolve(root, 'services/api/src/platform/catalog-documentation.ts');
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== output) throw new Error('Catalog documentation is stale');
} else writeFileSync(target, output);
console.log(`Catalog documentation: ${Object.keys(docs).length} entries`);
