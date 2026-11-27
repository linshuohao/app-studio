import type { ReadonlyPreparedForm } from '@form-engine/protocol/prepared';

const fieldControls = new Set([
  'checkbox',
  'checkbox-group',
  'date-picker',
  'number-input',
  'radio-group',
  'remote-select',
  'select',
  'text-input',
  'textarea',
]);
const artifactKey = (artifact: { id: string; digest: string }) =>
  JSON.stringify([artifact.id, artifact.digest]);
type View = ReadonlyPreparedForm['definition']['views'][string];

/** Shipped Web package boundaries that must remain coherent within a mounted instance. */
export function webAssetCompatibility(prepared: ReadonlyPreparedForm) {
  const locks = prepared.capabilityLock;
  const corePackages = new Set(
    Object.values(locks.pureFunctions)
      .filter(({ id }) => id.startsWith('core.'))
      .map(({ artifact }) => artifactKey(artifact)),
  );
  if (corePackages.size > 1) {
    return {
      code: 'WEB_CORE_ARTIFACT_CONFLICT',
      message: '同一 Web 视图的内置函数必须由同一 Runtime 对应的函数制品提供。',
      sourcePointer: '/expressions',
    };
  }

  const templates = prepared.definition.viewTemplates ?? {};
  const expanded = new Set<string>();
  function check(node: View, fieldArtifact?: string): string | undefined {
    if ('node' in node) return check(node.node, fieldArtifact);
    if ('$use' in node) {
      const key = JSON.stringify([node.$use, fieldArtifact]);
      if (expanded.has(key) || !Object.hasOwn(templates, node.$use)) return;
      expanded.add(key);
      return check(templates[node.$use]!.node, fieldArtifact);
    }
    const binding = Object.hasOwn(locks.materials, node.material)
      ? locks.materials[node.material]
      : undefined;
    if (binding?.artifact.id === 'materials-react') {
      const current = artifactKey(binding.artifact);
      if (node.material === 'field') fieldArtifact = current;
      else if (fieldArtifact && fieldControls.has(node.material) && current !== fieldArtifact)
        return node.material;
    }
    for (const children of Object.values(node.slots ?? {})) {
      for (const child of children) {
        const conflict = check(child, fieldArtifact);
        if (conflict) return conflict;
      }
    }
  }
  for (const [profile, node] of Object.entries(prepared.definition.views)) {
    const conflict = check(node);
    if (conflict)
      return {
        code: 'WEB_FIELD_ARTIFACT_CONFLICT',
        message: `字段容器和它的 ${conflict} 控件必须来自同一物料制品。请选择匹配版本并一起保存。`,
        sourcePointer: '/views/' + profile.replaceAll('~', '~0').replaceAll('/', '~1'),
      };
  }
}
