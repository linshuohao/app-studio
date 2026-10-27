import type { DevtoolsSourceInfo } from '@form-engine/runtime/devtools';
/** 实例导航只接收元数据。点击时才请求选中对象的值；不扫描 DOM / React 私有树。 */
export function sourceList(
  document: Document,
  sources: readonly DevtoolsSourceInfo[],
  selectedId: string | undefined,
  inspect: (id: string) => void,
): HTMLElement {
  const list = document.createElement('nav');
  list.setAttribute('aria-label', '引擎实例');
  const names = { runtime: '运行实例', view: '视图', material: '物料' };
  for (const source of sources) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${names[source.kind]} · ${source.label}`;
    button.title = [source.id, source.nodeId, source.occurrence].filter(Boolean).join(' / ');
    button.setAttribute('aria-pressed', String(source.id === selectedId));
    let current = source,
      depth = 0;
    while (current.parentId && depth < 8) {
      const parent = sources.find((item) => item.id === current.parentId);
      if (!parent) break;
      depth++;
      current = parent;
    }
    button.style.paddingInlineStart = `${12 + depth * 14}px`;
    button.addEventListener('click', () => inspect(source.id));
    list.append(button);
  }
  return list;
}
