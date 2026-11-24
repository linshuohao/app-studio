import type { KeyboardEvent } from 'react';
/** Keep keyboard traversal inside the open editor, including browser chrome boundaries. */
export function containTab(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') return;
  const modal = event.currentTarget;
  const controls = [
    ...modal.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]'),
  ].filter(
    (node) =>
      node.tabIndex >= 0 &&
      !node.matches(':disabled') &&
      !node.closest('[inert]') &&
      node.getClientRects().length > 0,
  );
  const first = controls[0],
    last = controls.at(-1),
    active = document.activeElement;
  if (!first || !last) {
    event.preventDefault();
    modal.focus();
    return;
  }
  if (!modal.contains(active) || active === modal) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
