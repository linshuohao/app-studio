// Shared by the field rail and every data-reference input in the layout prototype.
function createFieldPicker({ schema, fields, types, scopeLabel }) {
  const byPath = new Map(fields.map((f) => [f.path, f]));
  const element = (tag, text, cls) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  };
  function branch(shape, path, key) {
    const children = Object.entries(shape.properties || {}).map(([k, v]) =>
      branch(v, path + '/' + k.replaceAll('~', '~0').replaceAll('/', '~1'), k),
    );
    if (shape.items) children.push(branch(shape.items, path + '/*', '[]'));
    return { shape, path, key, field: byPath.get(path), children };
  }
  const root = branch(schema, '', '');
  function caption(f) {
    if (!f) return '选择字段';
    const trail = f.scope ? f.trail.slice(f.path.split('/').lastIndexOf('*')) : f.trail;
    return [scopeLabel(f.scope), ...trail].join(' › ');
  }
  function tree(host, { query = '', closed, selected, reason, choose, decorate }) {
    host.replaceChildren();
    const term = query.trim().toLowerCase();
    function visit(n, inheritedMatch) {
      const match =
        inheritedMatch || [n.shape.title, n.path].join(' ').toLowerCase().includes(term);
      const children = n.children.map((c) => visit(c, match)).filter(Boolean);
      if (!match && !children.length) return null;
      const wrap = element('li'),
        row = element('div', undefined, 'fp-row');
      const kids = element('ul');
      if (children.length) {
        const open = term || !closed.has(n.path);
        const toggle = element('button', open ? '▾' : '▸', 'fp-toggle');
        toggle.type = 'button';
        toggle.setAttribute('aria-label', '展开或收起' + n.shape.title);
        toggle.setAttribute('aria-expanded', String(!!open));
        kids.hidden = !open;
        toggle.onclick = () => {
          kids.hidden = !kids.hidden;
          toggle.textContent = kids.hidden ? '▸' : '▾';
          toggle.setAttribute('aria-expanded', String(!kids.hidden));
          if (!term) {
            if (kids.hidden) closed.add(n.path);
            else closed.delete(n.path);
          }
        };
        row.append(toggle);
        kids.append(...children);
      } else row.append(element('span', '', 'fp-spacer'));
      const f = n.field,
        why = reason(f),
        item = element('button', undefined, 'fp-item');
      item.type = 'button';
      item.disabled = !!why;
      item.dataset.fieldPath = n.path;
      const title = n.shape.title || n.key;
      item.setAttribute(
        'aria-label',
        title + ' · ' + types[n.shape.type] + (why ? ' · ' + why : ''),
      );
      item.title = [caption(f), n.path, why].filter(Boolean).join('\n');
      item.append(element('span', title), element('small', types[n.shape.type] || n.shape.type));
      if (why && f) item.append(element('small', why, 'fp-reason'));
      if (!why) {
        item.setAttribute('aria-pressed', String(f.path === selected));
        item.onclick = () => choose(f);
        decorate?.(item, f);
      }
      row.append(item);
      wrap.append(row);
      if (children.length) wrap.append(kids);
      return wrap;
    }
    const list = element('ul', undefined, 'fp-tree'),
      nodes = root.children.map((n) => visit(n, false)).filter(Boolean);
    if (nodes.length) {
      list.append(...nodes);
      host.append(list);
    } else host.append(element('p', '没有匹配的字段。', 'subtle'));
  }
  function input({ label, available, value = '', scope, expected = '当前配置所需的类型' }) {
    const choices = new Set(available.map((f) => f.path)),
      lookup = (k) => fields.find((f) => f.key === k);
    const trigger = element('button', undefined, 'fp-trigger');
    trigger.type = 'button';
    trigger.value = value;
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-label', label);
    const paint = () => {
      trigger.textContent = caption(lookup(trigger.value));
    };
    paint();
    trigger.onclick = () => {
      const dialog = element('dialog', undefined, 'fp-dialog');
      dialog.setAttribute('aria-label', label + ' · 选择字段');
      const header = element('header'),
        close = element('button', '取消');
      close.type = 'button';
      close.onclick = () => dialog.close();
      header.append(element('h2', label), close);
      const location = element(
        'p',
        '当前范围 · ' + scopeLabel(scope) + '　｜　需要' + expected,
        'fp-location',
      );
      const search = element('input');
      search.type = 'search';
      search.placeholder = '搜索字段名称或路径';
      search.setAttribute('aria-label', search.placeholder);
      const host = element('div', undefined, 'fp-scroll'),
        footer = element('footer'),
        detail = element('div'),
        apply = element('button', '使用字段', 'primary');
      let pending = lookup(trigger.value);
      const closed = new Set();
      function draw() {
        tree(host, {
          query: search.value,
          closed,
          selected: pending?.path,
          reason: (f) =>
            !f
              ? '结构节点'
              : f.scope && f.scope !== scope
                ? '超出范围'
                : !choices.has(f.path)
                  ? '类型不符'
                  : '',
          choose: (f) => {
            pending = f;
            const top = host.scrollTop;
            draw();
            host.scrollTop = top;
            host.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
          },
        });
        detail.replaceChildren(
          element('strong', caption(pending)),
          element('code', pending?.path || ''),
        );
        apply.disabled = !pending || !choices.has(pending.path);
      }
      apply.type = 'button';
      apply.onclick = () => {
        trigger.value = pending.key;
        paint();
        dialog.close();
        trigger.dispatchEvent(new Event('change', { bubbles: true }));
      };
      search.oninput = draw;
      footer.append(detail, apply);
      dialog.append(header, location, search, host, footer);
      document.body.append(dialog);
      dialog.addEventListener(
        'close',
        () => {
          dialog.remove();
          if (trigger.isConnected) trigger.focus();
        },
        { once: true },
      );
      draw();
      dialog.showModal();
      host.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' });
      search.focus({ preventScroll: true });
    };
    return trigger;
  }
  return { input, tree };
}
