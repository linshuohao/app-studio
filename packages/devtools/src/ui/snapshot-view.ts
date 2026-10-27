import type { DevtoolsSnapshot } from '@form-engine/runtime/devtools';
/** 只渲染脱离业务引用的工具副本。textContent 避免配置 / 错误文本变成 HTML。 */
export function snapshotView(document: Document, snapshot?: DevtoolsSnapshot): HTMLElement {
  const section = document.createElement('section');
  const label = document.createElement('h2');
  label.textContent = '当前状态';
  section.append(label);
  const note = document.createElement('p');
  note.className = 'muted';
  note.textContent = snapshot
    ? snapshot.truncated
      ? '展示副本已截断，不能作为完整复现证据。'
      : '只读当前状态；业务数据仅在选择实例后读取。'
    : '选择左侧实例查看；连接前的历史不保证完整。';
  const pre = document.createElement('pre');
  pre.dataset.testid = 'devtools-snapshot';
  pre.textContent = snapshot ? JSON.stringify(snapshot.value, null, 2) : '';
  section.append(note, pre);
  return section;
}
