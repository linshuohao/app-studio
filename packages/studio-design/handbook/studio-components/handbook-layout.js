/* global document, getComputedStyle, ResizeObserver, window */
// Each example owns two sibling frames. Only its editor can update its sandboxed preview.
(() => {
  const frames = [...document.querySelectorAll('iframe.component-playground')];
  if (!frames.length) {
    if (window.parent !== window) {
      const main = document.querySelector('main');
      new ResizeObserver(() =>
        window.parent.postMessage(
          {
            type: 'handbook-page-height',
            height: main.getBoundingClientRect().bottom + window.scrollY,
          },
          '*',
        ),
      ).observe(main);
    }
    return;
  }

  const pairs = new Map();
  for (const preview of frames.filter((frame) =>
    frame.parentElement.matches('.handbook-preview'),
  )) {
    const editor = preview.parentElement.nextElementSibling.querySelector('iframe');
    const pair = { preview, editor };
    pairs.set(preview, pair);
    pairs.set(editor, pair);
  }
  function resize(frame, height) {
    if (!Number.isFinite(height) || height < 0) return;
    const style = getComputedStyle(frame);
    frame.style.height =
      Math.ceil(height + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)) +
      'px';
  }
  function resizePreview(pair) {
    if (pair.measurement)
      resize(
        pair.preview,
        Math.max(pair.measurement.height, pair.measurement.overlay ? window.innerHeight : 0),
      );
  }
  window.addEventListener('resize', () => new Set(pairs.values()).forEach(resizePreview));
  window.addEventListener('message', (event) => {
    const frame = frames.find((frame) => frame.contentWindow === event.source);
    const data = event.data;
    if (!frame || !data) return;
    const pair = pairs.get(frame);
    if (data.type === 'handbook-page-height' && frame !== pair?.preview) resize(frame, data.height);
    if (!pair) return;
    if (frame === pair.editor && data.type === 'handbook-run') {
      pair.run = data;
      if (pair.ready) pair.preview.contentWindow.postMessage(data, '*');
    }
    if (frame !== pair.preview) return;
    if (data.type === 'handbook-ready') {
      pair.ready = true;
      if (pair.run) frame.contentWindow.postMessage(pair.run, '*');
    }
    if (data.type === 'handbook-height') {
      pair.measurement = data;
      resizePreview(pair);
    }
    if (data.type === 'handbook-result' || data.type === 'handbook-event-error')
      pair.editor.contentWindow.postMessage(data, '*');
  });
})();
