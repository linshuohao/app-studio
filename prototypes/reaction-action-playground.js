import { compile } from '@form-engine/compiler';
import { createRuntime } from '@form-engine/runtime';
import * as materials from '../packages/materials-react/src/manifests.ts';
import {
  createCoreFunctions,
  createDateInclusiveDays,
  createTextIsNonBlank,
  createTravelIsEligibleAge,
  createTravelIsTripRangeAllowed,
  createTravelRequiresGuardian,
  createTravelPersonPremium,
  createTravelTotalPremium,
} from '@form-engine/pure-functions';
import { travelDefinition } from '../apps/playground/src/demos/travel/definition.ts';
import { goldenData, ratePolicy } from '../apps/playground/src/demos/travel/policy.ts';

const artifact = {
  id: 'travel-actions-preview',
  platform: 'web',
  digest: 'sha256:' + '5'.repeat(64),
};
const functions = {
  ...createCoreFunctions(artifact),
  ...Object.fromEntries(
    [
      createDateInclusiveDays,
      createTextIsNonBlank,
      createTravelIsEligibleAge,
      createTravelIsTripRangeAllowed,
      createTravelRequiresGuardian,
      createTravelPersonPremium,
      createTravelTotalPremium,
    ]
      .map((create) => create(artifact))
      .map((entry) => [entry.manifest.id, entry]),
  ),
};
const catalog = {
  id: 'travel-actions-preview',
  materials: Object.fromEntries(
    Object.values(materials).map((manifest) => [manifest.id, { manifest, artifact }]),
  ),
  pureFunctions: Object.fromEntries(
    Object.entries(functions).map(([id, { manifest }]) => [id, { manifest, artifact }]),
  ),
};
const groups = [
  [
    '修改数据',
    [
      ['set', '写入值', '整体替换目标字段的值'],
      ['patch', '更新对象属性', '只写入列出的对象属性'],
      ['remove', '删除属性', '移除对象中的属性'],
    ],
  ],
  [
    '操作数组',
    [
      ['array.insert', '插入成员', '把新值插入目标列表'],
      ['array.remove', '删除成员', '删除指定作用域的成员'],
      ['array.move', '移动成员', '把指定成员移到新位置'],
    ],
  ],
  ['通知宿主', [['host.emit', '发送 Host 事件', '把求值后的参数交给宿主']]],
  ['高级', [['batch', '批量命令', '把已有数据命令组织为一个动作']]],
];
const titles = new Map(
  groups.flatMap(([, options]) => options.map(([key, title]) => [key, title])),
);
const notes = {
  set: '用固定值、字段或表达式的结果替换目标字段。写入对象时会替换整个对象。',
  patch: '只更新列出的属性。对某个嵌套属性写入值时，会替换该属性的整个值。',
  remove: '从对象中删除指定属性。将属性的值设为空可使用「写入值」并填写 null。',
  'array.insert': '在指定位置插入一个新成员。下标从 0 开始，运行时会检查实际数组边界。',
  'array.remove': '通过当前成员的稳定身份删除。此前即使调整过顺序，也仍指向同一个成员。',
  'array.move': '通过当前成员的稳定身份移动。填写的下标是移动后的最终位置。',
  'host.emit':
    '运行到此处才读取参数，因此可以读到前序动作刚写出的值。示例事件由本地模拟 Host 接收。',
  batch: '按顺序执行一组数据命令。后续命令失败时，前面成功的修改仍会保留。',
};
const fieldNotes = {
  target: '从旅险数据模型选择动作目标。',
  mode: '决定这一步执行时从哪里得到写入值。',
  read: '执行时读取这个字段的当前值。',
  fn: '按函数签名填写下方参数。',
  item: '来自规则的 insured 作用域。',
  position: '第 1 位对应协议下标 0。',
  event: '选择本次原型登记的宿主事件。',
  payload: '使用 /estimatedTotalMinor 在发送时的值。',
  people: '表单根的被保人数组。',
  plan: '表单根的当前出行方案。',
  days: '由模板的出发日期和返回日期计算。',
  rates: '使用模板自带的示例费率。',
};
const fields = {
  premium: ['试算总保费（分）', '/estimatedTotalMinor'],
  plan: ['出行方案', '/plan'],
  applicant: ['投保人', '/applicant'],
  travel: ['出行信息', '/travel'],
  name: ['投保人姓名', '/applicant/name'],
  phone: ['联系电话', '/applicant/phone'],
  insureds: ['被保人列表', '/insureds'],
  age: ['当前被保人年龄', '/age', 'insured'],
};
const ref = (key) => {
  const [, path, scope] = fields[key];
  return { source: 'data', path, ...(scope && { scope }) };
};
const toField = (value) =>
  Object.keys(fields).find(
    (key) =>
      Object.entries(ref(key)).every(([k, v]) => value?.[k] === v) &&
      ref(key).scope === value?.scope,
  );
const rule = (then) => ({
  id: 'preview-insured-actions',
  scope: { from: ref('insureds'), as: 'insured', mode: 'each' },
  watch: [ref('age')],
  then,
});
const pretty = (value) => JSON.stringify(value, null, 2);
const $ = (id) => document.getElementById(id);
const select = (label, name, options, value = '') =>
  '<label>' +
  label +
  '<select name="' +
  name +
  '" aria-label="' +
  label +
  '"' +
  (fieldNotes[name] ? ' aria-describedby="hint-' + name + '"' : '') +
  ' required><option value="">请选择</option>' +
  options
    .map(
      ([key, title]) =>
        '<option value="' +
        key +
        '"' +
        (key === value ? ' selected' : '') +
        '>' +
        title +
        '</option>',
    )
    .join('') +
  '</select>' +
  (fieldNotes[name] ? '<small id="hint-' + name + '">' + fieldNotes[name] + '</small>' : '') +
  '</label>';
const target = (keys, value, label = '目标字段', name = 'target') =>
  select(
    label,
    name,
    keys.map((key) => [key, fields[key][0] + ' · ' + fields[key][1]]),
    value,
  );
const text = (label, name) =>
  '<label class="full-field">' +
  label +
  '<textarea name="' +
  name +
  '" spellcheck="false" required></textarea></label>';
const tabs = [];
let active;
let nextId = 1;
let kind;
let editingValue;
let jsonMode = 'rule';
const demoEvent = 'quote.updated';
const committed = () => tabs.filter((tab) => tab.action).map((tab) => tab.action);
const pendingChanges = () => tabs.some((tab) => tab.dirty);
function selectTab(tab) {
  if (active === tab) return;
  if (active) {
    active.fields = Array.from($('fields').children);
    active.error = $('error').textContent;
  }
  active = tab;
  if (!tab) {
    kind = undefined;
    $('builder').hidden = true;
    jsonMode = 'rule';
  } else {
    if (tab.fields) {
      kind = tab.kind;
      editingValue = tab.action;
      $('builder').hidden = false;
      $('builder-title').textContent = titles.get(kind);
      $('action-description').textContent = notes[kind];
      $('fields').replaceChildren(...tab.fields);
      $('error').textContent = tab.error;
    } else openEditor(tab.kind, tab.action);
    jsonMode = 'action';
  }
  renderActions();
}
function addAction(kind) {
  const tab = { id: nextId++, kind, dirty: true };
  tabs.push(tab);
  $('chooser').close();
  selectTab(tab);
  $('fields').querySelector('select, textarea, input')?.focus();
}
for (const [group, choices] of groups) {
  const section = document.createElement('section');
  section.className = 'group';
  section.innerHTML = '<h3>' + group + '</h3><div class="choices"></div>';
  for (const [id, title, description] of choices) {
    const button = document.createElement('button');
    button.innerHTML = '<span>' + title + '</span><small>' + description + '</small>';
    button.onclick = () => addAction(id);
    section.lastElementChild.append(button);
  }
  $('kinds').append(section);
}

function openEditor(next, original) {
  kind = next;
  editingValue = original;
  $('builder').hidden = false;
  $('builder-title').textContent = titles.get(kind);
  $('action-description').textContent = notes[kind];
  $('error').textContent = '';
  const selected = toField(original?.target);
  const member = select(
    '要操作的成员',
    'item',
    [['insured', '当前被保人 · insured']],
    original?.item?.$scope,
  );
  const position =
    select(
      kind === 'array.insert' ? '插入到' : '移动到',
      'position',
      [
        ['first', '第 1 位'],
        ['index', '指定下标'],
      ],
      original?.position?.index === 0 ? 'first' : original?.position ? 'index' : '',
    ) +
    '<label id="position-index" hidden>下标（从 0 开始）<input type="number" name="index" min="0" step="1"></label>';
  switch (kind) {
    case 'set':
      $('fields').innerHTML =
        target(['premium', 'plan', 'name', 'phone', 'age'], selected, '写入目标') +
        select(
          '取值方式',
          'mode',
          [
            ['literal', '固定值'],
            ['field', '读取字段'],
            ['function', '计算表达式'],
          ],
          original?.value?.$expr?.op
            ? 'function'
            : original?.value?.$expr?.ref
              ? 'field'
              : original
                ? 'literal'
                : '',
        ) +
        '<div id="value-editor"></div>';
      drawValue();
      break;
    case 'patch':
    case 'remove':
      $('fields').innerHTML =
        target(
          kind === 'patch' ? ['applicant', 'travel'] : ['name', 'phone'],
          selected,
          '操作对象',
        ) + (kind === 'patch' ? text('更新内容（ValueSpec 对象）', 'value') : '');
      break;
    case 'array.insert':
    case 'array.remove':
    case 'array.move':
      $('fields').innerHTML =
        target(['insureds'], selected, '目标数组') +
        (kind !== 'array.insert' ? member : '') +
        (kind !== 'array.remove' ? position : '') +
        (kind === 'array.insert' ? text('新成员（ValueSpec JSON）', 'value') : '');
      if (kind !== 'array.remove') {
        $('editor').elements.index.value = original?.position?.index ?? '';
        drawPosition();
      }
      break;
    case 'host.emit':
      $('fields').innerHTML =
        select(
          'Host 事件',
          'event',
          [[demoEvent, '报价已更新 · quote.updated（模拟）']],
          original?.event,
        ) +
        select(
          'Payload · 保费（分）',
          'payload',
          [['premium', '读取试算总保费 · /estimatedTotalMinor']],
          original ? 'premium' : '',
        );
      break;
    case 'batch':
      $('fields').innerHTML = text('数据命令列表（JSON）', 'value');
  }
  if ($('editor').elements.value && original)
    $('editor').elements.value.value = pretty(original.value ?? original.commands);
  renderJSON();
}
function drawValue() {
  const wrapper = $('value-editor');
  const mode = $('editor').elements.mode.value;
  const original = editingValue?.value;
  if (mode === 'literal') {
    wrapper.innerHTML = text('写入值（JSON）', 'value');
    if (original !== undefined && !original?.$expr)
      $('editor').elements.value.value = pretty(original);
  } else if (mode === 'field') {
    wrapper.innerHTML = target(
      ['premium', 'plan', 'name', 'phone', 'age'],
      toField(original?.$expr?.ref),
      '读取字段',
      'read',
    );
  } else if (mode === 'function') {
    const existing = original?.$expr?.op === 'travel.totalPremium';
    wrapper.innerHTML =
      select(
        '纯函数',
        'fn',
        [['travel.totalPremium', '计算试算总保费 · travel.totalPremium']],
        existing ? 'travel.totalPremium' : '',
      ) + '<div id="arguments" class="params" hidden></div>';
    drawArguments(existing);
  } else wrapper.replaceChildren();
}
function drawArguments(existing = false) {
  const wrapper = $('arguments');
  const chosen = $('editor').elements.fn.value;
  wrapper.hidden = !chosen;
  wrapper.innerHTML = chosen
    ? [
        select(
          '参数 1 · 被保人',
          'people',
          [['insureds', '读取被保人列表 · /insureds']],
          existing ? 'insureds' : '',
        ),
        select(
          '参数 2 · 出行方案',
          'plan',
          [['plan', '读取出行方案 · /plan']],
          existing ? 'plan' : '',
        ),
        select(
          '参数 3 · 出行天数',
          'days',
          [['tripDays', '使用具名表达式 · tripDays']],
          existing ? 'tripDays' : '',
        ),
        select(
          '参数 4 · 费率',
          'rates',
          [['sample', '固定值 · 旅险模板示例费率']],
          existing ? 'sample' : '',
        ),
      ].join('')
    : '';
}
function drawPosition() {
  const form = $('editor').elements;
  $('position-index').hidden = form.position.value !== 'index';
  form.index.required = !$('position-index').hidden;
}
function draft() {
  if (!kind) return;
  const values = new FormData($('editor'));
  const get = (name) => values.get(name);
  const guarded = (name) => {
    const v = get(name);
    if (!v) throw Error('请补齐当前动作的参数。');
    return v;
  };
  if (kind === 'host.emit') {
    return {
      type: kind,
      event: guarded('event'),
      payload: { premiumMinor: { $expr: { ref: ref(guarded('payload')) } } },
    };
  }
  if (kind === 'batch') {
    const commands = JSON.parse(guarded('value'));
    if (!Array.isArray(commands) || commands.some((command) => !command?.op))
      throw Error('请填写数据命令数组。');
    return { op: kind, commands };
  }
  const result = { op: kind, target: ref(guarded('target')) };
  if (kind === 'set') {
    if (get('mode') === 'field') result.value = { $expr: { ref: ref(guarded('read')) } };
    else if (get('mode') === 'function') {
      if (guarded('rates') !== 'sample') throw Error('请选择费率。');
      result.value = {
        $expr: {
          op: guarded('fn'),
          args: [
            { ref: ref(guarded('people')) },
            { ref: ref(guarded('plan')) },
            { use: guarded('days') },
            { literal: ratePolicy },
          ],
        },
      };
    } else result.value = JSON.parse(guarded('value'));
  }
  if (kind === 'patch' || kind === 'array.insert') result.value = JSON.parse(guarded('value'));
  if (kind === 'array.move' || kind === 'array.remove') result.item = { $scope: guarded('item') };
  if (kind === 'array.move' || kind === 'array.insert') {
    const index = guarded('position') === 'first' ? 0 : Number(guarded('index'));
    if (!Number.isSafeInteger(index) || index < 0) throw Error('下标须为非负整数。');
    result.position = { kind: 'index', index };
  }
  return result;
}
function renderJSON() {
  $('action-json').disabled = !active;
  $('action-json').setAttribute('aria-pressed', String(jsonMode === 'action'));
  $('rule-json').setAttribute('aria-pressed', String(jsonMode === 'rule'));
  if (jsonMode === 'rule') {
    $('json-label').textContent = '已应用规则 · reactions[]';
    $('json').textContent = pretty(rule(committed()));
    return;
  }
  try {
    $('json').textContent = pretty(draft());
    $('json-label').textContent = active.dirty
      ? '待应用动作 · reactions[].then[]'
      : '当前动作 · reactions[].then[]';
  } catch {
    $('json-label').textContent = '当前动作 · reactions[].then[]';
    $('json').textContent = '填齐当前动作的参数后显示协议 JSON。';
  }
}
function renderStatus() {
  $('run').disabled = !committed().length || pendingChanges();
  $('run').title = pendingChanges() ? '先应用或移除未完成的动作' : '';
  $('up').disabled = tabs.indexOf(active) < 1;
  $('down').disabled = tabs.indexOf(active) < 0 || tabs.indexOf(active) === tabs.length - 1;
  $('action-status').textContent = active?.dirty ? '待应用' : active ? '已应用' : '';
  $('editor').querySelector('button[type="submit"]').disabled = !active?.dirty;
}
function renderActions() {
  $('empty').hidden = !!tabs.length;
  $('count').textContent = tabs.length ? tabs.length + ' 项' : '';
  $('actions').replaceChildren();
  tabs.forEach((tab, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'action-tab-' + tab.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', 'builder');
    button.setAttribute('aria-selected', String(active === tab));
    button.setAttribute('aria-description', notes[tab.kind]);
    button.tabIndex = active === tab ? 0 : -1;
    const index = document.createElement('span');
    index.className = 'tab-index';
    index.textContent = String(i + 1);
    const title = document.createElement('span');
    title.textContent = titles.get(tab.kind);
    const detail = document.createElement('small');
    detail.className = 'tab-detail';
    detail.textContent = tab.dirty
      ? '待应用'
      : (tab.action?.event ?? tab.action?.target?.path ?? '已应用');
    title.append(detail);
    button.append(index, title);
    button.onclick = () => {
      selectTab(tab);
      document.getElementById(button.id)?.focus();
    };
    button.onkeydown = (event) => {
      const step = { ArrowUp: -1, ArrowDown: 1 }[event.key];
      if (step === undefined) return;
      event.preventDefault();
      const other = tabs[(i + step + tabs.length) % tabs.length];
      selectTab(other);
      $('action-tab-' + other.id)?.focus();
    };
    $('actions').append(button);
  });
  if (active) $('builder').setAttribute('aria-labelledby', 'action-tab-' + active.id);
  renderStatus();
  renderJSON();
}
function check(then) {
  const result = compile({
    definition: { ...travelDefinition, reactions: [rule(then)] },
    catalog,
    target: { profile: 'desktop' },
  });
  if (!result.success)
    throw Error(
      result.diagnostics
        .filter(({ severity }) => severity === 'error')
        .map(({ message }) => message)
        .join(' · '),
    );
  return result.prepared;
}
$('add').onclick = () => $('chooser').showModal();
$('cancel').onclick = () => $('chooser').close();
function reorder(step) {
  const index = tabs.indexOf(active);
  const other = index + step;
  if (!tabs[other]) return;
  [tabs[index], tabs[other]] = [tabs[other], tabs[index]];
  renderActions();
}
$('up').onclick = () => reorder(-1);
$('down').onclick = () => reorder(1);
$('remove').onclick = () => {
  const index = tabs.indexOf(active);
  tabs.splice(index, 1);
  selectTab(tabs[index] ?? tabs[index - 1]);
};
$('action-json').onclick = () => {
  jsonMode = 'action';
  renderJSON();
};
$('rule-json').onclick = () => {
  jsonMode = 'rule';
  renderJSON();
};
function markDirty() {
  if (!active) return;
  if (!active.dirty) {
    active.dirty = true;
    renderActions();
  }
  $('error').textContent = '';
  jsonMode = 'action';
  renderJSON();
}
$('editor').onchange = (event) => {
  if (event.target.name === 'mode') drawValue();
  if (event.target.name === 'fn') drawArguments();
  if (event.target.name === 'position') drawPosition();
  markDirty();
};
$('editor').oninput = markDirty;
$('editor').onsubmit = (event) => {
  event.preventDefault();
  try {
    const next = draft();
    const then = tabs.map((tab) => (tab === active ? next : tab.action)).filter(Boolean);
    check(then);
    active.action = next;
    active.dirty = false;
    editingValue = next;
    $('error').textContent = '';
    renderActions();
  } catch (error) {
    $('error').textContent = error.message;
  }
};
$('copy').onclick = async () => {
  await navigator.clipboard.writeText(pretty(rule(committed())));
  $('copy').textContent = '已复制';
};
function result(label, content) {
  const box = document.createElement('div');
  const title = document.createElement('h3');
  title.textContent = label;
  const body = document.createElement('pre');
  body.textContent = typeof content === 'string' ? content : pretty(content);
  box.append(title, body);
  return box;
}
$('run').onclick = async () => {
  $('run').disabled = true;
  $('results').hidden = false;
  $('results').replaceChildren();
  let runtime;
  try {
    const prepared = check(committed());
    const sample = goldenData();
    const member = Number($('member').value);
    const calls = [];
    runtime = createRuntime({
      prepared,
      functions,
      data: sample,
      host: {
        validators: {
          'travel.checkEligibility': () => ({ result: Promise.resolve([]), cancel() {} }),
        },
        events: {
          [demoEvent]: ({ payload }) => calls.push(payload),
          'travel.saveDraft': () => {},
          'travel.submit': () => {},
        },
      },
    });
    const changed = runtime.dispatch({
      op: 'set',
      target: { source: 'data', path: '/insureds/' + member + '/age' },
      value: sample.insureds[member].age + 1,
    });
    if (!changed.ok) throw Error('样例年龄修改失败。');
    const flush = await runtime.flush();
    if (flush.status !== 'settled') throw Error('试算未完成：' + flush.status);
    const snapshot = runtime.snapshot();
    const lastResult = {
      member: sample.insureds[member].name,
      premium: snapshot.estimatedTotalMinor,
      order: snapshot.insureds.map(({ name }) => name),
      calls,
    };
    $('results').append(
      result('触发', lastResult.member + ' · 年龄增加 1 岁'),
      result('写回保费（分）', String(lastResult.premium ?? '尚无')),
      result('被保人顺序', lastResult.order.join(' → ')),
      result('模拟 Host 收到的 Payload', lastResult.calls.length ? lastResult.calls : '没有发送'),
    );
  } catch (error) {
    $('results').append(result('试算失败', error.message));
  } finally {
    runtime?.dispose();
    renderStatus();
  }
};
renderActions();
