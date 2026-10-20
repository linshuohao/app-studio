function searchKnowledge(catalog, query, filters = {}) {
  const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase();
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  const results = [];
  for (const doc of catalog.documents) {
    if (filters.type === 'current' && !['design', 'protocol'].includes(doc.type)) continue;
    if (filters.type && filters.type !== 'current' && doc.type !== filters.type) continue;
    if (filters.status && doc.status !== filters.status) continue;
    if (filters.module && !doc.modules.includes(filters.module)) continue;
    const candidates = words.length ? doc.sections : [{title: doc.title, text: doc.summary, url: doc.url}];
    for (const section of candidates) {
      const title = normalize(`${doc.title} ${doc.id}`);
      const heading = normalize(section.title);
      const body = normalize(section.text);
      const tags = normalize((doc.tags || []).join(' '));
      if (!words.every(word => `${title} ${heading} ${body} ${tags}`.includes(word))) continue;
      const score = words.reduce((total, word) => total + (title.includes(word) ? 24 : 0) + (heading.includes(word) ? 18 : 0) + (tags.includes(word) ? 7 : 0) + (body.includes(word) ? 3 : 0), 0);
      results.push({doc, section, score});
    }
  }
  return results.sort((left, right) => right.score - left.score);
}

function filterKnowledgeRecords(records, filters) {
  return records.filter(record => record.kind === filters.kind
    && (!filters.module || record.modules.includes(filters.module))
    && (!filters.severity || record.severity === filters.severity)
    && (!filters.state || record.state === filters.state)
    && (!filters.blocking || record.blocking === (filters.blocking === 'yes')));
}

if (typeof module !== 'undefined' && module.exports) module.exports = {searchKnowledge, filterKnowledgeRecords};

(() => {
  if (typeof document === 'undefined') return;
  const doc = document.documentElement;
  const sidebar = document.getElementById('sidebar');
  const mask = document.getElementById('mask');
  const menuButton = document.getElementById('menuBtn');
  const themeButton = document.getElementById('themeBtn');
  const storedTheme = (() => {
    try { return localStorage.getItem('form-engine-docs-theme') || localStorage.getItem('l1v1-theme'); }
    catch { return null; }
  })();

  function setTheme(theme) {
    doc.dataset.theme = theme;
    themeButton.textContent = theme === 'dark' ? '浅色' : '深色';
    themeButton.setAttribute('aria-label', theme === 'dark' ? '切换浅色主题' : '切换深色主题');
    try { localStorage.setItem('form-engine-docs-theme', theme); } catch {}
  }
  setTheme(storedTheme === 'dark' ? 'dark' : 'light');
  themeButton.addEventListener('click', () => setTheme(doc.dataset.theme === 'dark' ? 'light' : 'dark'));
  addEventListener('storage', event => {
    if (event.key === 'form-engine-docs-theme') setTheme(event.newValue === 'dark' ? 'dark' : 'light');
  });

  function closeMenu() {
    sidebar.classList.remove('open');
    document.getElementById('contextSidebar').classList.remove('open');
    document.getElementById('contextBtn').setAttribute('aria-expanded', 'false');
    mask.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
  }
  menuButton.addEventListener('click', () => {
    const open = sidebar.classList.toggle('open');
    mask.classList.toggle('open', open);
    menuButton.setAttribute('aria-expanded', String(open));
  });
  mask.addEventListener('click', closeMenu);
  addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
  document.getElementById('printBtn').addEventListener('click', () => window.print());
  document.querySelectorAll('.sidebar a').forEach(link => link.addEventListener('click', closeMenu));
  document.querySelectorAll('.context-sidebar a').forEach(link => link.addEventListener('click', closeMenu));
  document.getElementById('contextBtn').addEventListener('click', () => {
    const open = document.getElementById('contextSidebar').classList.toggle('open');
    mask.classList.toggle('open', open);
    document.getElementById('contextBtn').setAttribute('aria-expanded', String(open));
  });

  document.querySelectorAll('.copy').forEach(button => button.addEventListener('click', async () => {
    const raw = button.closest('.code-box').querySelector('pre code').textContent;
    try {
      await navigator.clipboard.writeText(raw);
      button.textContent = '已复制';
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = raw;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try { button.textContent = document.execCommand('copy') ? '已复制' : '复制失败'; }
      catch { button.textContent = '复制失败'; }
      textarea.remove();
    }
    setTimeout(() => { button.textContent = '复制'; }, 1400);
  }));

  const navLinks = [...document.querySelectorAll('.toc a')];
  const sections = navLinks.map(link => document.getElementById(link.dataset.to)).filter(Boolean);
  const groups = [...document.querySelectorAll('.toc-group')];
  const searchInput = document.getElementById('tocSearch');
  let activeSection;
  function openGroup(group) {
    if (!group) return;
    if (!searchInput.value.trim()) groups.forEach(other => { other.open = other === group; });
    else group.open = true;
  }
  function revealHash() {
    let anchor;
    try { anchor = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = document.getElementById(anchor);
    if (target?.tagName === 'DETAILS') target.open = true;
    for (let parent = target?.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
    const chapter = target?.closest('.protocol-chapter') || target?.querySelector('.protocol-chapter');
    const link = navLinks.find(link => link.dataset.to === (chapter?.id || anchor));
    const group = link?.closest('.toc-group');
    openGroup(group);
    return Boolean(group);
  }
  addEventListener('hashchange', revealHash);
  revealHash();
  function update() {
    const maximum = doc.scrollHeight - innerHeight;
    document.getElementById('progress').style.width = `${maximum > 0 ? Math.max(0, Math.min(100, scrollY / maximum * 100)) : 0}%`;
    let current = sections[0]?.id;
    sections.forEach(section => { if (section.getBoundingClientRect().top < 145) current = section.id; });
    navLinks.forEach(link => {
      const active = link.dataset.to === current;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    const activeLink = navLinks.find(link => link.dataset.to === current);
    groups.forEach(group => group.classList.toggle('active-group', Boolean(activeLink && group.contains(activeLink))));
    if (current !== activeSection) {
      const group = activeLink?.closest('.toc-group');
      openGroup(group);
      activeSection = current;
    }
  }
  let scheduled = false;
  addEventListener('scroll', () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { update(); scheduled = false; });
  }, { passive: true });
  addEventListener('resize', update);
  update();
  let groupStates;
  searchInput.addEventListener('input', event => {
    const query = event.target.value.trim().toLocaleLowerCase();
    if (query && !groupStates) groupStates = groups.map(group => group.open);
    navLinks.forEach(link => {
      const group = link.closest('.toc-group');
      const groupLabel = group?.querySelector('summary').textContent.toLocaleLowerCase() || '';
      const chapterLabel = `${link.textContent} ${link.title}`.toLocaleLowerCase();
      link.hidden = Boolean(query) && !chapterLabel.includes(query) && !groupLabel.includes(query);
    });
    groups.forEach((group, index) => {
      group.hidden = Boolean(query) && ![...group.querySelectorAll('a')].some(link => !link.hidden);
      if (query && !group.hidden) group.open = true;
      else if (!query && groupStates) group.open = groupStates[index];
    });
    if (!query) {
      groupStates = undefined;
      const activeGroup = navLinks.find(link => link.dataset.to === activeSection)?.closest('.toc-group');
      if (!revealHash()) openGroup(activeGroup);
    }
  });

  const catalog = window.FORM_KNOWLEDGE;
  if (!catalog) {
    document.getElementById('openSearch').disabled = true;
    document.getElementById('openSearch').textContent = '索引未生成，请重新构建';
    return;
  }
  const indexScript = document.querySelector('script[src*="/knowledge-index.js"]');
  const readingBase = new URL('../', indexScript.src);
  const urlFor = path => new URL(path, readingBase).href;
  function followRelocation() {
    const current = location.origin + location.pathname + location.hash;
    const target = catalog.redirects?.find(entry => urlFor(entry.from) === current);
    if (target) { location.replace(urlFor(target.url)); return true; }
    return false;
  }
  if (followRelocation()) return;
  addEventListener('hashchange', followRelocation);
  const make = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const option = (select, value, label) => {
    const node = make('option', label);
    node.value = value;
    select.append(node);
  };
  const modules = catalog.records.filter(record => record.kind === 'module');
  const moduleNames = new Map(modules.map(record => [record.id, record.title]));
  const stateLabel = value => catalog.stateLabels[value] || value;
  const searchDialog = document.getElementById('searchDialog');
  const globalQuery = document.getElementById('globalQuery');
  const searchType = document.getElementById('searchType');
  const searchModule = document.getElementById('searchModule');
  const searchStatus = document.getElementById('searchStatus');
  Object.entries(catalog.typeLabels).forEach(([value, label]) => option(searchType, value, label));
  modules.forEach(record => option(searchModule, record.id, record.title));
  [...new Set(catalog.documents.map(entry => entry.status))].forEach(value => option(searchStatus, value, stateLabel(value)));
  document.getElementById('searchScope').textContent = catalog.searchScope;

  function highlighted(text, query) {
    const fragment = document.createDocumentFragment();
    const words = query.trim().split(/\s+/).filter(Boolean).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!words.length) { fragment.append(document.createTextNode(text)); return fragment; }
    const regex = new RegExp(words.join('|'), 'giu');
    let position = 0;
    for (const match of text.matchAll(regex)) {
      fragment.append(document.createTextNode(text.slice(position, match.index)));
      fragment.append(make('mark', match[0]));
      position = match.index + match[0].length;
    }
    fragment.append(document.createTextNode(text.slice(position)));
    return fragment;
  }
  function runSearch() {
    const query = globalQuery.value;
    const hits = searchKnowledge(catalog, query, {type: searchType.value, module: searchModule.value, status: searchStatus.value});
    const output = document.getElementById('searchResults');
    output.replaceChildren();
    document.getElementById('searchCount').textContent = hits.length ? `${hits.length} 处匹配 · ${new Set(hits.map(hit => hit.doc.id)).size} 份文档${hits.length > 80 ? ' · 先显示最相关的 80 处，请缩小关键词或筛选' : ''}` : '没有匹配结果。可缩短关键词或清除筛选。';
    for (const {doc: entry, section} of hits.slice(0, 80)) {
      const link = make('a', undefined, 'search-result');
      link.href = urlFor(section.url);
      const title = make('strong');
      title.append(highlighted(section.title, query));
      const info = make('small', `${entry.title} · ${entry.layer} · ${catalog.typeLabels[entry.type]} · ${stateLabel(entry.status)}`);
      let text = section.text || entry.summary;
      const word = query.trim().split(/\s+/)[0];
      const at = word ? text.toLocaleLowerCase().indexOf(word.toLocaleLowerCase()) : -1;
      const start = Math.max(0, at - 45);
      text = (start ? '…' : '') + text.slice(start, start + 170) + (text.length > start + 170 ? '…' : '');
      const snippet = make('p');
      snippet.append(highlighted(text, query));
      link.append(title, info, snippet);
      link.addEventListener('click', () => searchDialog.close());
      output.append(link);
    }
  }
  function openSearch() {
    if (!searchDialog.open) searchDialog.showModal();
    runSearch();
    globalQuery.focus();
  }
  document.getElementById('openSearch').addEventListener('click', openSearch);
  document.getElementById('closeSearch').addEventListener('click', () => searchDialog.close());
  [globalQuery, searchType, searchModule, searchStatus].forEach(element => element.addEventListener(element === globalQuery ? 'input' : 'change', runSearch));
  addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') { event.preventDefault(); openSearch(); }
  });
  searchDialog.addEventListener('click', event => { if (event.target === searchDialog && event.offsetX >= searchDialog.clientWidth) searchDialog.close(); });
  const initialParams = new URLSearchParams(location.search);
  if (initialParams.has('q')) {
    globalQuery.value = initialParams.get('q');
    searchType.value = initialParams.get('type') ?? 'current';
    searchModule.value = initialParams.get('searchModule') || '';
    searchStatus.value = initialParams.get('status') || '';
    openSearch();
  }

  const overviewLayer = document.getElementById('overviewLayer');
  function renderOverview() {
    const container = document.getElementById('overviewModules');
    container.replaceChildren();
    const selection = modules.filter(entry => !overviewLayer.value || entry.layer === overviewLayer.value);
    for (const entry of selection.slice(0, 6)) {
      const card = make('article', undefined, 'module-card');
      const title = make('h3');
      const link = make('a', entry.title);
      link.href = urlFor(entry.url);
      title.append(link);
      card.append(make('span', `${entry.layer} · ${entry.state}`, 'status'), title);
      card.append(make('p', entry.fields['设计闭环判断']));
      const detail = make('a', '已有结论、未决项与实施条件 →', 'module-detail');
      detail.href = urlFor(entry.url);
      card.append(detail);
      container.append(card);
    }
    const count = make('p', `该范围共 ${selection.length} 项；概览显示前 ${Math.min(selection.length, 6)} 项，完整矩阵保留全部结论。`, 'caption');
    container.append(count);
  }
  if (overviewLayer) { overviewLayer.addEventListener('change', renderOverview); renderOverview(); }

  const recordKind = document.getElementById('recordKind');
  if (recordKind) {
    const recordModule = document.getElementById('recordModule');
    const recordSeverity = document.getElementById('recordSeverity');
    const recordBlocking = document.getElementById('recordBlocking');
    const recordState = document.getElementById('recordState');
    function fillStates() {
      recordState.replaceChildren(); option(recordState, '', '全部状态');
      [...new Set(catalog.records.filter(entry => entry.kind === recordKind.value).map(entry => entry.state))].forEach(value => option(recordState, value, stateLabel(value)));
    }
    function renderRecords(updateUrl = false) {
      document.getElementById('severityLabel').hidden = recordKind.value !== 'conflict';
      document.getElementById('moduleComparison').hidden = recordKind.value !== 'module';
      const rows = filterKnowledgeRecords(catalog.records, {kind: recordKind.value, module: recordModule.value, severity: recordKind.value === 'conflict' ? recordSeverity.value : '', blocking: recordBlocking.value, state: recordState.value});
      document.getElementById('recordCount').textContent = `${rows.length} 项匹配 · 点击原文定位可查看完整依据与来源；下方保留连续审查正文。`;
      const container = document.getElementById('recordResults'); container.replaceChildren();
      for (const entry of rows) {
        const card = make('article', undefined, 'record-card');
        card.dataset.recordId = entry.id;
        card.append(make('h3', entry.title));
        const badges = make('div', undefined, 'record-badges');
        const labels = [stateLabel(entry.state)];
        if (entry.severity) labels.push({high: '高', medium: '中', info: '差异已说明'}[entry.severity]);
        if (entry.blocking) labels.push('存在前置决策阻塞');
        if (entry.priority) labels.push(entry.priority);
        if (entry.category) labels.push(entry.category === 'A' ? '架构级问题' : '模块设计');
        labels.forEach(label => badges.append(make('span', label)));
        card.append(badges);
        const details = make('dl');
        for (const label of entry.fieldOrder || Object.keys(entry.fields || {})) {
          const value = entry.fields[label];
          if (!value || value === entry.title || label === '阅读状态') continue;
          details.append(make('dt', label), make('dd', value));
        }
        if (!entry.fieldOrder?.length && entry.text) details.append(make('dd', entry.text));
        if (entry.dependencies?.length) details.append(make('dt', '前置任务'), make('dd', entry.dependencies.join(' → ')));
        if (entry.modules.length && entry.kind !== 'module') details.append(make('dt', '涉及模块'), make('dd', entry.modules.map(key => moduleNames.get(key)).join('；')));
        card.append(details);
        const link = make('a', '查看原文定位、关联规范与来源 →'); link.href = urlFor(entry.url); card.append(link);
        container.append(card);
      }
      if (!rows.length) container.append(make('p', '没有符合当前组合的条目，可清除一个筛选条件。', 'caption'));
      if (updateUrl) {
        const current = new URL(location.href);
        for (const [key, value] of Object.entries({view: recordKind.value, module: recordModule.value, severity: recordKind.value === 'conflict' ? recordSeverity.value : '', blocking: recordBlocking.value, state: recordState.value})) {
          if (value) current.searchParams.set(key, value); else current.searchParams.delete(key);
        }
        history.replaceState(null, '', current);
      }
    }
    recordKind.value = initialParams.get('view') || 'open-decision';
    if (!recordKind.value) recordKind.value = 'open-decision';
    recordModule.value = initialParams.get('module') || '';
    recordSeverity.value = initialParams.get('severity') || '';
    recordBlocking.value = initialParams.get('blocking') || '';
    fillStates(); recordState.value = initialParams.get('state') || '';
    recordKind.addEventListener('change', () => { fillStates(); renderRecords(true); });
    [recordModule, recordSeverity, recordBlocking, recordState].forEach(select => select.addEventListener('change', () => renderRecords(true)));
    const first = document.getElementById('compareFirst'), second = document.getElementById('compareSecond');
    [first, second].forEach(select => modules.forEach(entry => option(select, entry.id, entry.title)));
    first.value = 'M09'; second.value = 'M11';
    function compare() {
      const container = document.getElementById('compareResults'); container.replaceChildren();
      if (first.value === second.value) { container.append(make('p', '请选择两个不同的模块。')); return; }
      const pair = [first.value, second.value].map(id => modules.find(entry => entry.id === id));
      const table = make('table'), head = make('thead'), row = make('tr');
      row.append(make('th', '设计维度'), ...pair.map(entry => make('th', entry.title))); head.append(row); table.append(head);
      const body = make('tbody');
      for (const key of pair[0].fieldOrder.slice(1)) {
        const next = make('tr'); next.append(make('th', key), ...pair.map(entry => make('td', entry.fields[key] || '未记录'))); body.append(next);
      }
      table.append(body); container.append(table);
    }
    first.addEventListener('change', compare); second.addEventListener('change', compare); compare(); renderRecords();
    if (initialParams.has('view')) {
      const tools = recordKind.closest('details.optional-tools');
      if (tools) { tools.open = true; tools.scrollIntoView(); }
    }
  }

  const diagramDialog = document.getElementById('diagramDialog');
  document.getElementById('closeDiagram').addEventListener('click', () => diagramDialog.close());
  document.querySelectorAll('figure.architecture-diagram').forEach(figure => {
    const button = make('button', '放大', 'btn diagram-zoom'); button.type = 'button';
    button.setAttribute('aria-label', `放大图示：${figure.querySelector('figcaption')?.textContent || '架构图'}`);
    button.addEventListener('click', () => {
      const clone = figure.cloneNode(true);
      clone.querySelectorAll('button').forEach(node => node.remove());
      // Mermaid CSS and SVG markers refer to internal IDs. Namespace the copy
      // rather than dropping IDs, which would lose styles and arrowheads.
      const nodes = [clone, ...clone.querySelectorAll('*')];
      const ids = nodes.filter(node => node.id).map(node => node.id).sort((a, b) => b.length - a.length);
      const rewrite = value => ids.reduce((text, id) => text.replaceAll('#' + id, '#zoom-' + id), value);
      nodes.forEach(node => {
        if (node.id) node.id = 'zoom-' + node.id;
        [...node.attributes].forEach(attribute => {
          if (attribute.name !== 'id') node.setAttribute(attribute.name, rewrite(attribute.value));
        });
        if (node.tagName.toLowerCase() === 'style') node.textContent = rewrite(node.textContent);
      });
      clone.classList.add('zoom-diagram'); document.getElementById('diagramContent').replaceChildren(clone); diagramDialog.showModal();
    });
    figure.append(button);
  });
  if (document.querySelector('.mermaid')) {
    const mermaid = window.mermaid;
    if (mermaid) {
      mermaid.initialize({startOnLoad: false, securityLevel: 'strict', theme: 'neutral', flowchart: {htmlLabels: false}, maxTextSize: 50000, suppressErrorRendering: true,
        secure: ['securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering', 'theme', 'themeVariables']});
      mermaid.run({querySelector: '.mermaid'}).catch(() => document.querySelectorAll('.mermaid-error').forEach(node => { node.hidden = false; }));
    } else document.querySelectorAll('.mermaid-error').forEach(node => { node.hidden = false; });
  }
})();
