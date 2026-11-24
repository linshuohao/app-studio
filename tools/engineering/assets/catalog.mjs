import ts from 'typescript';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { read, walk, baseFiles, baseRead } from './files.mjs';

export const packages = { material: 'materials-react', function: 'pure-functions' };
export function identity(kind, id) {
  if (
    !Object.hasOwn(packages, kind) ||
    !/^[a-z][a-zA-Z0-9]*(?:[.-][a-zA-Z][a-zA-Z0-9]*)*$/.test(id) ||
    id.startsWith('core.')
  )
    throw Error(`Invalid asset kind or ID: ${kind}/${id}`);
  const folder = id
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replaceAll('.', '-')
    .toLowerCase();
  const symbol = folder.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  return {
    kind,
    id,
    folder,
    symbol,
    title: symbol[0].toUpperCase() + symbol.slice(1),
    package: `@form-engine/${packages[kind]}`,
    dir: `packages/${packages[kind]}`,
  };
}
/** Decode a JSON literal AST, never import or execute a capability's code. */
function literal(node) {
  while (
    ts.isSatisfiesExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isParenthesizedExpression(node)
  )
    node = node.expression;
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node))
    return ts.isNumericLiteral(node) ? Number(node.text) : node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  )
    return -Number(node.operand.text);
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) {
    const object = {};
    for (const prop of node.properties) {
      if (
        !ts.isPropertyAssignment(prop) ||
        !(ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))
      )
        throw Error('Manifest must contain only JSON literal properties.');
      const key = prop.name.text;
      if (key === '__proto__' || Object.hasOwn(object, key))
        throw Error(`Duplicate or unsafe manifest key: ${key}`);
      object[key] = literal(prop.initializer);
    }
    return object;
  }
  throw Error('Manifest must be a JSON literal, not executable expressions.');
}
export function parseManifest(source) {
  const ast = ts.createSourceFile('manifest.ts', source, ts.ScriptTarget.Latest, true);
  if (ast.parseDiagnostics.length) throw Error('Invalid manifest TypeScript.');
  let declaration;
  for (const statement of ast.statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly) continue;
    if (
      !ts.isVariableStatement(statement) ||
      !statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    )
      throw Error('Manifest accepts type-only imports and an exported JSON literal.');
    for (const item of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(item.name) ||
        item.name.text !== 'manifest' ||
        !item.initializer ||
        declaration
      )
        throw Error('Expected one exported manifest literal.');
      declaration = item;
    }
  }
  if (!declaration) throw Error('Missing exported manifest literal.');
  let object = declaration.initializer;
  while (
    ts.isSatisfiesExpression(object) ||
    ts.isAsExpression(object) ||
    ts.isParenthesizedExpression(object)
  )
    object = object.expression;
  const version = object.properties?.find(
    (p) => ts.isPropertyAssignment(p) && p.name?.text === 'version',
  );
  return {
    manifest: literal(declaration.initializer),
    versionRange: version && [version.initializer.getStart(ast), version.initializer.end],
  };
}
let validators;
async function validation() {
  if (!validators) {
    const require = createRequire(import.meta.resolve('@form-engine/compiler/package.json'));
    const { default: Ajv } = await import(pathToFileURL(require.resolve('ajv/dist/2020.js')));
    // Same structural settings as Compiler; formats are not assertions here.
    const ajv = new Ajv({
      strict: true,
      allowUnionTypes: true,
      strictRequired: false,
      validateFormats: false,
      allErrors: true,
      ownProperties: true,
    });
    validators = {};
    for (const [kind, name] of [
      ['material', 'material'],
      ['function', 'pure-function'],
    ]) {
      const schema = JSON.parse(
        await readFile(
          fileURLToPath(
            import.meta.resolve(`@form-engine/protocol/schemas/${name}-manifest.schema.json`),
          ),
          'utf8',
        ),
      );
      validators[kind] = ajv.compile(schema);
    }
  }
  return validators;
}
export async function inventory(root, base) {
  const entries = [];
  const paths = base
    ? baseFiles(root, base)
    : (
        await Promise.all(Object.values(packages).map((p) => walk(root, `packages/${p}/src`)))
      ).flat();
  for (const path of paths
    .filter((p) =>
      /^packages\/(materials-react|pure-functions)\/src\/[^_/][^/]*\/manifest\.ts$/.test(p),
    )
    .sort()) {
    const source = base ? baseRead(root, base, path) : await read(root, path);
    const parsed = parseManifest(source);
    const kind = path.includes('/materials-react/') ? 'material' : 'function';
    const entry = { ...identity(kind, parsed.manifest.id), ...parsed, path, source };
    if (path !== `${entry.dir}/src/${entry.folder}/manifest.ts`)
      throw Error(`Asset directory does not match ID: ${path}`);
    if (entries.some((e) => e.id === entry.id)) throw Error(`Duplicate asset ID: ${entry.id}`);
    const validate = (await validation())[kind];
    if (!validate(entry.manifest))
      throw Error(`Invalid ${entry.id} manifest: ${JSON.stringify(validate.errors)}`);
    if (kind === 'function') {
      let optionalSeen = false;
      for (const parameter of entry.manifest.parameters) {
        if (optionalSeen && !parameter.optional)
          throw Error(`Required parameter after optional parameter: ${entry.id}`);
        optionalSeen ||= Boolean(parameter.optional);
      }
    }
    entries.push(entry);
  }
  return entries;
}
export const start = '// <generated-assets>';
export const end = '// </generated-assets>';
export function aggregate(entries, runtime = false) {
  return entries
    .map((e) =>
      runtime
        ? `export { create${e.title} } from './${e.folder}/implementation.js';`
        : `export { manifest as ${e.symbol}Manifest } from './${e.folder}/manifest.js';`,
    )
    .join('\n');
}
export function updateBlock(source, body) {
  source ??= '';
  const block = `${start}\n${body}\n${end}`;
  if (source.includes(start) || source.includes(end)) {
    const a = source.indexOf(start),
      b = source.indexOf(end);
    if (a < 0 || b < a || source.indexOf(start, a + 1) !== -1 || source.indexOf(end, b + 1) !== -1)
      throw Error('Malformed managed export block.');
    return source.slice(0, a) + block + source.slice(b + end.length);
  }
  return source.replace(/\s*$/, '') + (source.trim() ? '\n\n' : '') + block + '\n';
}
export function updateVersion(entry, version) {
  const [a, b] = entry.versionRange;
  return entry.source.slice(0, a) + `'${version}'` + entry.source.slice(b);
}
export function staticEntry(source, entries) {
  const ast = ts.createSourceFile('manifests.ts', source, ts.ScriptTarget.Latest, true);
  const allowed = new Set(entries.map((e) => `./${e.folder}/manifest.js`));
  return (
    ast.parseDiagnostics.length === 0 &&
    ast.statements.every((statement) => {
      if (ts.isImportDeclaration(statement)) return statement.importClause?.isTypeOnly;
      if (!ts.isExportDeclaration(statement)) return false;
      if (statement.isTypeOnly) return true;
      if (!statement.moduleSpecifier) return statement.exportClause?.elements?.length === 0;
      return allowed.has(statement.moduleSpecifier.text);
    })
  );
}
export const withoutBlock = (source) =>
  source?.replace(/\/\/ <generated-assets>[\s\S]*?\/\/ <\/generated-assets>/, '').trim() ?? '';
export function hasExport(source, name) {
  const ast = ts.createSourceFile('index.ts', withoutBlock(source), ts.ScriptTarget.Latest, true);
  return ast.statements.some((s) => {
    if (ts.isExportDeclaration(s))
      return s.exportClause?.elements?.some((e) => e.name.text === name);
    return (
      s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
      (s.name?.text === name || s.declarationList?.declarations.some((d) => d.name.text === name))
    );
  });
}
