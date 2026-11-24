import { compactJson } from '../components/json/format';
import { reactionNames } from './reaction-fields';
import { platform } from './platform-api';
import { child, semanticModel } from './semantic-model';

type Result = {
  success: boolean;
  diagnostics: { severity: string; message: string; sourcePointer: string }[];
};

// Check the actual definition first. An unfinished neighbouring rule or layout can prevent
// the Compiler from reaching this rule. In that case retain its data schema and named environment.
export async function checkReaction(formPath: string, profile: string, text: string, path: string) {
  const check = (source: string, profile?: string) =>
    platform<Result>(formPath + '/check', {
      body: { text: compactJson(source), ...(profile && { profile }) },
    });
  const full = await check(text, profile);
  if (full.success) return;
  const localError = full.diagnostics.find(
    (d) =>
      d.severity === 'error' &&
      (d.sourcePointer === path || d.sourcePointer.startsWith(path + '/')),
  );
  if (localError) throw Error(localError.sourcePointer + ' · ' + localError.message);
  const m = semanticModel(text);
  const selected = m.byPath.get(path);
  if (!selected) throw Error('待检查的规则已变化。');
  const data = child(m.root, 'data');
  const expressions = child(m.root, 'expressions');
  const environment = expressions && JSON.parse(m.raw(expressions));
  const names = reactionNames(JSON.parse(m.raw(selected)), environment);
  const dependencies = (expressions?.children ?? [])
    .filter((n) => names.has(n.key!))
    .map((n) => JSON.stringify(n.key) + ':' + m.raw(n));
  const shared = [
    '"data":' + (data ? m.raw(data) : '{"schema":{"type":"object","additionalProperties":false}}'),
    '"expressions":{' + dependencies.join(',') + '}',
  ];
  const source = [
    '"protocolVersion":"1"',
    '"id":"studio-reaction-check"',
    '"version":"draft"',
    '"views":{"entry":{"material":"section"}}',
    ...shared,
    '"reactions":[' + m.raw(selected) + ']',
  ].join(',');
  const local = await check('{' + source + '}', 'entry');
  if (!local.success) {
    const diagnostic = local.diagnostics.find((d) => d.severity === 'error');
    throw Error(
      diagnostic
        ? diagnostic.sourcePointer.replace(/^\/reactions\/0(?=\/|$)/, path) +
            ' · ' +
            diagnostic.message
        : '无法核验联动规则。',
    );
  }
}
