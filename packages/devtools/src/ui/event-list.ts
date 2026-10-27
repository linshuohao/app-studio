import type { DevtoolsEvent } from '@form-engine/runtime/devtools';
/** 只显示连接后的有界元数据轨迹；不推导缺失的执行历史，也不执行事件。 */
export function eventList(
  document: Document,
  events: readonly DevtoolsEvent[],
  dropped: number,
): HTMLElement {
  const section = document.createElement('section');
  const heading = document.createElement('h2');
  heading.textContent = '连接后的轨迹';
  section.append(heading);
  const note = document.createElement('p');
  note.className = 'muted';
  note.textContent = `最近 ${events.length} 条 · 丢弃 ${dropped} 条；刷新页面前及连接前的历史可能缺失。`;
  section.append(note);
  for (const event of [...events].reverse()) {
    const details = document.createElement('details');
    const title = document.createElement('summary');
    title.textContent = `#${event.sequence} · ${event.sourceId} · ${event.kind}`;
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(event.payload ?? {}, null, 2);
    details.append(title, pre);
    section.append(details);
  }
  return section;
}
