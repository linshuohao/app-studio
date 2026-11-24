// Local records let the filter and table specimens share one observable result.
const records = [
  ['旅险投保', '保险', '草稿', 3],
  ['境外医疗', '保险', '已发布', 8],
  ['费用报销', '财务', '已发布', 4],
  ['差旅申请', '行政', '草稿', 2],
  ['团体旅险', '保险', '已发布', 6],
  ['付款申请', '财务', '草稿', 1],
  ['办公采购', '行政', '已发布', 5],
  ['交通报销', '财务', '草稿', 7],
];
const filterForm = document.querySelector('#filter-form');
function createPager(id, refresh) {
  const host = document.getElementById(id);
  host.append(document.getElementById('pager-template').content.cloneNode(true));
  const part = (name) => host.querySelector('[data-part="' + name + '"]');
  const size = part('page-size');
  const previous = part('previous');
  const next = part('next');
  let page = 1;
  function reset() {
    page = 1;
    refresh();
  }
  size.onchange = reset;
  previous.onclick = () => {
    page--;
    refresh();
  };
  next.onclick = () => {
    page++;
    refresh();
  };
  return {
    reset,
    range(total) {
      const limit = Number(size.value);
      const pages = Math.ceil(total / limit);
      page = Math.max(1, Math.min(page, pages));
      part('page-count').textContent = pages
        ? '第 ' + page + ' / ' + pages + ' 页，共 ' + total + ' 条'
        : '共 0 条';
      previous.disabled = page === 1;
      next.disabled = page >= pages;
      return [(page - 1) * limit, page * limit];
    },
  };
}
if (filterForm) {
  const tablePager = createPager('table-pager', renderResults);
  const toggleStatus = document.querySelector('#show-status');
  const sortButton = document.querySelector('#sort-version');
  let sortOrder = 'none';
  let conditions = new FormData(filterForm);
  function renderResults() {
    const query = conditions.get('keyword').trim();
    const category = conditions.get('category');
    const status = conditions.get('status');
    const matches = records.filter(
      ([name, group, state]) =>
        name.includes(query) && (!category || category === group) && (!status || status === state),
    );
    if (sortOrder !== 'none') {
      const direction = sortOrder === 'ascending' ? 1 : -1;
      matches.sort((a, b) => direction * (a[3] - b[3]));
    }
    const range = tablePager.range(matches.length);
    const body = document.querySelector('#result-rows');
    body.replaceChildren();
    for (const record of matches.slice(...range)) {
      const row = body.insertRow();
      record.forEach((value, index) => {
        const cell = row.insertCell();
        cell.textContent = index === 3 ? 'v' + value : value;
        if (index === 2) cell.hidden = !toggleStatus.checked;
      });
    }
    if (!matches.length) {
      const cell = body.insertRow().insertCell();
      cell.colSpan = toggleStatus.checked ? 4 : 3;
      cell.textContent = '没有匹配的表单，可调整或清除筛选条件。';
    }
    document.querySelector('#status-column').hidden = !toggleStatus.checked;
    sortButton.parentElement.setAttribute('aria-sort', sortOrder);
    for (const icon of sortButton.querySelectorAll('[data-sort-icon]')) {
      icon.hidden = icon.dataset.sortIcon !== sortOrder;
    }
    const filters = [query && '名称含「' + query + '」', category, status].filter(Boolean);
    document.querySelector('#filter-summary').textContent =
      (filters.join(' · ') || '全部条件') + '，匹配 ' + matches.length + ' 条';
  }
  function applyConditions() {
    conditions = new FormData(filterForm);
    tablePager.reset();
  }
  filterForm.addEventListener('submit', (event) => {
    event.preventDefault();
    applyConditions();
  });
  filterForm.querySelector('[type=button]').onclick = () => {
    filterForm.reset();
    applyConditions();
  };
  sortButton.onclick = () => {
    sortOrder = { none: 'ascending', ascending: 'descending', descending: 'none' }[sortOrder];
    tablePager.reset();
  };
  toggleStatus.onchange = renderResults;

  renderResults();
}
if (document.querySelector('#grid-density')) {
  document.querySelector('#grid-density').onchange = (event) => {
    document.querySelector('#grid-sample').dataset.density = event.target.value;
    document.querySelector('#grid-metrics').textContent =
      event.target.value === 'dense'
        ? '内边距 16 px · 行距与列距 12 px'
        : '内边距 24 px · 行距与列距 16 px';
  };
}
if (document.querySelector('#cards-pager')) {
  const cardItems = [...document.querySelectorAll('.sample-cards li')];
  const cardsPager = createPager('cards-pager', renderCards);
  function renderCards() {
    const [start, end] = cardsPager.range(cardItems.length);
    cardItems.forEach((item, index) => {
      item.hidden = index < start || index >= end;
    });
  }
  renderCards();
  const materialDialog = document.getElementById('material-example');
  for (const item of cardItems) {
    const open = item.querySelector('.card-open');
    open.onclick = () => {
      materialDialog.querySelector('h2').textContent = item.querySelector('b').textContent;
      materialDialog.querySelector('code').textContent = open.dataset.id;
      materialDialog.querySelector('p').textContent = item.querySelector('p').textContent;
      materialDialog.showModal();
    };
  }
}
if (document.querySelector('#standalone-pager')) {
  const standalone = createPager('standalone-pager', () => standalone.range(24));
  standalone.range(24);
}
