import { compactJson } from '../components/json/format';
import { ancestorBinders } from './layout-bindings';
import { platform } from './platform-api';
import { child, semanticModel } from './semantic-model';

type Diagnostic = { severity: string; code: string; sourcePointer: string; message: string };
type Result = { success: boolean; diagnostics: Diagnostic[] };

// An unrelated structural error can stop the Compiler before it analyses any view. When that
// happens, check the edited subtree under its real lexical binders and shared declarations.
export function layoutCheckDefinition(source: string, nodePath: string) {
  const m = semanticModel(source);
  const node = m.byPath.get(nodePath);
  if (!node || m.ambiguous.has(node.path)) throw Error('无法唯一定位待检查节点。');
  let view = m.raw(node);
  for (const binder of ancestorBinders(m, node).reverse()) {
    if (m.ambiguous.has(binder.path)) throw Error('作用域声明含重复属性，请在 JSON 中核对。');
    view = '{"scope":' + m.raw(binder) + ',"node":' + view + '}';
  }
  const shared = ['data', 'expressions', 'viewTemplates'].flatMap((k) => {
    const n = child(m.root, k);
    if (n && m.ambiguous.has(n.path)) throw Error('共享声明含重复属性，请在 JSON 中核对。');
    if (!n && k === 'data')
      return ['"data":{"schema":{"type":"object","additionalProperties":false}}'];
    return n ? [JSON.stringify(k) + ':' + m.raw(n)] : [];
  });
  return (
    '{"protocolVersion":"1","id":"studio-layout-check","version":"draft","views":{"entry":' +
    view +
    '}' +
    (shared.length ? ',' + shared.join(',') : '') +
    '}'
  );
}

export async function verifyLayoutEdit(
  formPath: string,
  profile: string,
  before: string,
  after: string,
  nodePath: string,
) {
  const run = (text: string, profile: string) =>
    platform<Result>(formPath + '/check', { body: { text: compactJson(text), profile } });
  const checked = await run(after, profile);
  if (checked.success) return;
  const errors = (r: Result) => r.diagnostics.filter((d) => d.severity === 'error');
  const describe = (d?: Diagnostic) =>
    d ? d.sourcePointer + ' · ' + d.message : '无法核验所选控件。';
  const signature = (d: Diagnostic) => JSON.stringify([d.code, d.sourcePointer, d.message]);
  const original = await run(before, profile);
  const known = new Set(errors(original).map(signature));
  const added = errors(checked).find((d) => !known.has(signature(d)));
  if (added) throw Error(describe(added));
  const local = await run(layoutCheckDefinition(after, nodePath), 'entry');
  if (!local.success) throw Error('控件未通过检查：' + describe(errors(local)[0]));
}
