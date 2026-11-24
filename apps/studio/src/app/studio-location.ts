export function studioUrl(values: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) query.set(key, value);
  return '/' + (query.size ? '?' + query.toString() : '');
}
export function writeLocation(values: Record<string, string | undefined>, replace = false) {
  const url = studioUrl(values);
  if (window.location.pathname + window.location.search !== url)
    window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
}

export type ListPosition = {
  focus?: string;
  top: number;
  dialogTop?: number;
  resultLeft?: number;
  resultTop?: number;
};
export function listPosition(trigger?: HTMLElement): ListPosition {
  const el = trigger ?? (document.activeElement as HTMLElement | null);
  const results = el?.closest('[data-return-scroll]');
  return {
    focus: el?.dataset.returnFocus,
    top: window.scrollY,
    dialogTop: el?.closest('dialog')?.scrollTop,
    resultLeft: results?.scrollLeft,
    resultTop: results?.scrollTop,
  };
}
export function restorePosition(position: ListPosition) {
  const apply = () => {
    const el = position.focus
      ? document.querySelector<HTMLElement>(
          '[data-return-focus="' + CSS.escape(position.focus) + '"]',
        )
      : undefined;
    if (position.focus && (!el || !el.getClientRects().length)) return false;
    window.scrollTo(0, position.top);
    const dialog = el?.closest('dialog');
    if (dialog && position.dialogTop !== undefined) dialog.scrollTop = position.dialogTop;
    const results = el?.closest('[data-return-scroll]');
    if (results && position.resultLeft !== undefined) results.scrollLeft = position.resultLeft;
    if (results && position.resultTop !== undefined) results.scrollTop = position.resultTop;
    if (el) {
      el.focus({ preventScroll: true });
      const rect = el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight) el.scrollIntoView({ block: 'nearest' });
    }
    return true;
  };
  let observer: MutationObserver | undefined;
  const frame = requestAnimationFrame(() => {
    if (apply()) return;
    observer = new MutationObserver(() => {
      if (apply()) observer?.disconnect();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
  });
  return () => {
    cancelAnimationFrame(frame);
    observer?.disconnect();
  };
}
