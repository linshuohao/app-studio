import { BadRequestException, NotFoundException } from '@nestjs/common';
import { parseTree, type Node, type ParseError } from 'jsonc-parser';
import { catalogDocumentation } from './catalog-documentation.js';
import { resourceId } from './form-drafts.js';
import type { PlatformForms } from './forms.js';
import type { ReleaseBuild } from './release-build.js';

type FormKey = { formId: string; versionId: string; pointer?: string };
type AssetKey = {
  kind: 'function' | 'material';
  assetId: string;
  assetVersion: string;
  artifactDigest: string;
};
export type DiagnosticKey = { kind: 'diagnostic'; diagnosticId: string };
export type ReferenceKey = FormKey | AssetKey | DiagnosticKey;

function token(value: unknown) {
  if (typeof value !== 'string' || !value.length || value.length > 200)
    throw new BadRequestException('无效的资产引用。');
  return value;
}

export function referenceKey(raw: unknown): ReferenceKey {
  if (!raw || typeof raw !== 'object') throw new BadRequestException('无效的引用。');
  const item = raw as Record<string, unknown>;
  if (item.kind === 'diagnostic')
    return { kind: 'diagnostic', diagnosticId: resourceId(item.diagnosticId).toLowerCase() };
  if (item.kind === 'function' || item.kind === 'material')
    return {
      kind: item.kind,
      assetId: token(item.assetId),
      assetVersion: token(item.assetVersion),
      artifactDigest: token(item.artifactDigest),
    };
  if (item.kind !== undefined) throw new BadRequestException('未知的引用类型。');
  const formId = resourceId(item.formId).toLowerCase();
  const versionId = resourceId(item.versionId).toLowerCase();
  if (item.pointer === undefined) return { formId, versionId };
  if (
    typeof item.pointer !== 'string' ||
    item.pointer.length > 2048 ||
    !item.pointer.startsWith('/') ||
    /~(?![01])/u.test(item.pointer)
  )
    throw new BadRequestException('无效的配置对象路径。');
  return { formId, versionId, pointer: item.pointer };
}

export function referenceIdentity(key: ReferenceKey) {
  if ('kind' in key)
    return key.kind === 'diagnostic'
      ? [key.kind, key.diagnosticId]
      : [key.kind, key.assetId, key.assetVersion, key.artifactDigest];
  return key.pointer === undefined
    ? [key.formId, key.versionId]
    : [key.formId, key.versionId, key.pointer];
}

const index = /^(?:0|[1-9][0-9]*)$/u;
function objectKind(parts: string[]) {
  if (
    (parts[0] === 'constraints' || parts[0] === 'reactions') &&
    parts.length === 2 &&
    index.test(parts[1]!)
  )
    return parts[0] === 'constraints' ? '校验规则' : '联动规则';
  if (parts[0] === 'data' && parts[1] === 'schema' && parts.length > 2) {
    let i = 2;
    while (i < parts.length) {
      const key = parts[i++];
      if (
        key === 'items' ||
        key === 'additionalProperties' ||
        key === 'contains' ||
        key === 'unevaluatedProperties' ||
        key === 'unevaluatedItems' ||
        key === 'propertyNames' ||
        key === 'contentSchema' ||
        key === 'not' ||
        key === 'if' ||
        key === 'then' ||
        key === 'else'
      )
        continue;
      if (
        key === 'properties' ||
        key === '$defs' ||
        key === 'definitions' ||
        key === 'patternProperties' ||
        key === 'dependentSchemas'
      ) {
        if (i++ >= parts.length) return;
      } else if (key === 'prefixItems' || key === 'allOf' || key === 'anyOf' || key === 'oneOf') {
        if (!index.test(parts[i++] ?? '')) return;
      } else return;
    }
    return '字段';
  }
  let i =
    parts[0] === 'views' && parts.length >= 2
      ? 2
      : parts[0] === 'viewTemplates' && parts[2] === 'node'
        ? 3
        : -1;
  if (i < 0) return;
  while (i < parts.length) {
    const segment = parts[i++];
    if (segment === 'node') continue;
    if (segment === 'slots' && i++ >= parts.length) return;
    if ((segment !== 'slots' && segment !== 'children') || !index.test(parts[i++] ?? '')) return;
  }
  return '控件';
}

function property(node: Node, key: string) {
  const matches = node.children?.filter((entry) => entry.children?.[0]?.value === key);
  return matches?.length === 1 ? matches[0]?.children?.[1] : undefined;
}

function formObject(text: string, pointer: string) {
  const parts = pointer
    .slice(1)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
  const kind = objectKind(parts);
  const errors: ParseError[] = [];
  let node = parseTree(text, errors, { disallowComments: true });
  for (const part of parts) {
    if (node?.type === 'object') node = property(node, part);
    else if (node?.type === 'array' && index.test(part)) node = node.children?.[Number(part)];
    else node = undefined;
  }
  if (
    errors.length ||
    !kind ||
    !node ||
    (node.type !== 'object' && !(kind === '字段' && node.type === 'boolean'))
  )
    throw new NotFoundException('所选对象在固定配置版本中不可用，请重新选择。');
  const props = property(node, 'props');
  const name = [
    property(node, 'id')?.value,
    property(node, 'title')?.value,
    props && property(props, 'label')?.value,
    props && property(props, 'title')?.value,
    kind === '字段' ? parts.at(-1) : property(node, 'material')?.value,
  ].find((value) => typeof value === 'string' && value.trim());
  return {
    objectLabel: kind + ' · ' + String(name ?? parts.at(-1)),
    text: text.slice(node.offset, node.offset + node.length),
  };
}

export async function resolveReference(
  key: FormKey | AssetKey,
  spaceId: string,
  forms: PlatformForms,
  builds: ReleaseBuild,
) {
  if ('kind' in key) {
    const entry = builds.assets.find(
      key.kind === 'material' ? 'materials' : 'pureFunctions',
      key.assetId,
      key.assetVersion,
      key.artifactDigest,
    );
    if (!entry) throw new NotFoundException('引用的资产版本已不可用，请移除或重新选择。');
    const doc = Object.hasOwn(catalogDocumentation, key.assetId)
      ? catalogDocumentation[key.assetId]
      : undefined;
    const documentation = doc?.version === key.assetVersion ? doc : undefined;
    return {
      ...key,
      name: documentation?.title || key.assetId,
      text: JSON.stringify({ manifest: entry.manifest, description: documentation?.description }),
    };
  }
  let form, version;
  try {
    form = await forms.findForm(spaceId, key.formId);
    version = await forms.readVersion(spaceId, key.formId, key.versionId);
  } catch (error) {
    if (error instanceof NotFoundException)
      throw new NotFoundException('引用的表单版本已不可用，请移除或重新选择。');
    throw error;
  }
  return {
    ...key,
    name: form.name,
    versionName: version.name,
    savedAt: version.savedAt,
    ...(key.pointer ? formObject(version.text, key.pointer) : { text: version.text }),
  };
}
