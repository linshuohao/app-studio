import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import * as manifests from '@form-engine/materials-react/manifests';

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && !specifier.endsWith('.ts'))
        return next(specifier + '.ts', context);
      throw error;
    }
  },
});
const { semanticModel } = await import('../src/app/semantic-model.ts');
const {
  bindingCandidates,
  bindingCoverage,
  layoutFields,
  layoutFieldsLimited,
  layoutPositions,
  insertLayoutNode,
  insertedLayoutPath,
  moveLayoutNode,
  movedLayoutPath,
  planLayoutMaterialReplacement,
  removeLayoutNode,
  replaceLayoutMaterial,
} = await import('../src/app/layout-structure.ts');
const { checkWebConfig } = await import('../../../services/api/src/platform/web-check.ts');
const { travelDefinition } = await import('../../playground/src/demos/travel/definition.ts');
const slots = new Map(Object.values(manifests).map((m) => [m.id, m.slots ?? []]));
const main = '/views/main',
  direct = main + '/slots/default',
  pos = (parent, index = 0, slot = 'default') => ({ parent, index, slot });
const ref = (path, scope) => ({ source: 'data', path, ...(scope && { scope }) });
const section = (...nodes) => ({ material: 'section', slots: { default: nodes } });
const input = (path, scope) => ({ material: 'text-input', bindings: { value: ref(path, scope) } });
const persons = { type: 'array', items: { $ref: '#/$defs/Person' } };
const schema = {
  type: 'object',
  properties: { left: persons, right: persons, name: { type: 'string' }, read: { type: 'string' } },
  $defs: { Person: { type: 'object', properties: { name: { type: 'string' } } } },
};
const each = (key, ...children) => ({
  scope: { as: 'row', from: ref('/' + key), mode: 'each' },
  node: section(...children),
});
const form = (...nodes) => ({
  protocolVersion: '1',
  version: '1',
  id: 'layout-fixture',
  data: { schema },
  views: { main: section(...nodes), second: section(input('/read')) },
});
function verified(text, profile = 'main') {
  const result = checkWebConfig(text, profile);
  assert.ok(result.success, JSON.stringify(result.diagnostics));
  return result.prepared;
}
test('scope candidates and template coverage use the actual collection and only count bound ports', () => {
  const def = form(
    each('left', { $use: 'name', with: { person: ref('', 'row') } }),
    each('right'),
    { material: 'section', props: { title: { $expr: { ref: ref('/read') } } } },
  );
  def.viewTemplates = {
    name: { params: { person: { schemaRef: '#/$defs/Person' } }, node: input('/name', 'person') },
  };
  const text = JSON.stringify(def),
    m = semanticModel(text),
    root = m.byPath.get(main),
    fields = layoutFields(m);
  const schemaPath = (path) => fields.find((f) => f.path === path).schemaPath;
  verified(text);
  assert.deepEqual([...bindingCoverage(m, root)], [schemaPath('/left[]/name')]);
  const scoped = bindingCandidates(m, m.byPath.get(direct + '/0/node')).filter((f) => f.ref.scope);
  assert.deepEqual(
    scoped.map((f) => f.ref),
    [ref('', 'row'), ref('/name', 'row')],
  );
  assert.equal(scoped[1].schemaPath, schemaPath('/left[]/name'));
  assert.ok(!bindingCandidates(m, root).some((f) => f.schemaPath === schemaPath('/left[]/name')));
  assert.deepEqual([...bindingCoverage(m, m.byPath.get('/views/second'))], [schemaPath('/read')]);
});
test('moves compare lexical bindings even when both aliases and Compiler data types match', () => {
  const def = form(
    each('left', input('/name', 'row'), { material: 'grid' }),
    each('right'),
    section(),
  );
  const text = JSON.stringify(def),
    m = semanticModel(text),
    inner = direct + '/0/node',
    source = inner + '/slots/default/0';
  verified(text);
  assert.throws(() => moveLayoutNode(m, source, pos(direct + '/1/node'), slots), /作用域/);
  assert.throws(() => moveLayoutNode(m, source, pos(main), slots), /作用域/);
  assert.throws(() => moveLayoutNode(m, direct + '/0', pos(direct + '/1/node'), slots), /同名/);
  assert.throws(() => moveLayoutNode(m, direct + '/0', pos(inner), slots), /后代/);
  assert.throws(() => moveLayoutNode(m, source, pos('/views/second'), slots), /当前布局/);
  assert.throws(() => moveLayoutNode(m, source, pos(inner, 0, 'unknown'), slots), /插槽/);
  const moved = moveLayoutNode(m, source, pos(inner + '/slots/default/1'), slots);
  verified(moved);
  assert.deepEqual(
    JSON.parse(moved).views.main.slots.default[0].node.slots.default[0].slots.default,
    [input('/name', 'row')],
  );
});
test('scope checks read command handles, nested values, bindings in shorthand children and template arguments; literals never capture', () => {
  const reads = [
    { $use: 'nested', with: { person: ref('', 'row') } },
    {
      material: 'button',
      on: {
        activate: {
          type: 'form.command',
          command: {
            op: 'array.move',
            target: ref('/left'),
            item: { $scope: 'row' },
            position: { kind: 'index', index: 0 },
          },
        },
      },
    },
    {
      material: 'section',
      props: {
        title: { $expr: { op: 'core.if', args: [true, { ref: ref('/name', 'row') }, ''] } },
      },
    },
    { material: 'section', children: [input('/name', 'row')] },
    {
      material: 'remote-select',
      requests: {
        search: {
          type: 'host.request',
          request: 'search',
          payload: { key: { $expr: { ref: ref('/name', 'row') } } },
        },
      },
    },
  ];
  for (const node of reads) {
    const m = semanticModel(JSON.stringify(form(each('left', section(node)), each('right'))));
    assert.throws(
      () => moveLayoutNode(m, direct + '/0/node/slots/default/0', pos(direct + '/1/node'), slots),
      /作用域/,
    );
  }
  const literal = {
    material: 'section',
    props: { value: { $literal: { $expr: { ref: ref('/name', 'row') } } } },
  };
  const m = semanticModel(JSON.stringify(form(each('left', literal), each('right'))));
  assert.deepEqual(
    JSON.parse(
      moveLayoutNode(m, direct + '/0/node/slots/default/0', pos(direct + '/1/node'), slots),
    ).views.main.slots.default[1].node.slots.default,
    [literal],
  );
});
test('raw tokens survive cross-container moves, sibling renumbering, reorder, empty and absent slots', () => {
  const raw =
    '{"material":"section","unknown":{"dup":9007199254740993, "dup":-0.00,"escaped":"\\u0061"}}';
  const source =
    ' \n' +
    JSON.stringify(form('replace', { material: 'grid' }, section())).replace('"replace"', raw) +
    '\n ';
  const m = semanticModel(source);
  const next = moveLayoutNode(m, direct + '/0', pos(direct + '/1'), slots);
  assert.ok(next.includes(raw));
  assert.ok(next.startsWith(' \n'));
  assert.ok(next.endsWith('\n '));
  const inserted = insertLayoutNode(semanticModel(next), pos(main, 1), raw, slots);
  assert.equal(inserted.split(raw).length - 1, 2);
  const reordered = moveLayoutNode(semanticModel(inserted), direct + '/1', pos(main, 3), slots);
  const controls = JSON.parse(reordered).views.main.slots.default;
  assert.deepEqual(
    controls.map((c) => c.material),
    ['grid', 'section', 'section'],
  );
  assert.equal(controls[2].unknown.escaped, 'a');
  assert.deepEqual(JSON.parse(reordered).views.second, JSON.parse(source).views.second);
  const named = insertLayoutNode(semanticModel(reordered), pos(main, 0, 'actions'), raw, slots);
  assert.equal(JSON.parse(named).views.main.slots.actions.length, 1);
});
test('shorthand binding counts, ambiguous scope moves and conflicting default slot writes are rejected', () => {
  const def = form(each('left', input('/name', 'row')), {
    material: 'section',
    children: [{ material: 'text-input', bind: '/read' }],
    slots: { default: [] },
  });
  const text = JSON.stringify(def).replace('"scope":"row"', '"scope":"absent","scope":"row"');
  const m = semanticModel(text);
  assert.throws(
    () => moveLayoutNode(m, direct + '/0/node/slots/default/0', pos(main), slots),
    /重复/,
  );
  assert.ok(
    !layoutPositions(m, m.byPath.get(main), slots).some(
      (p) => p.parent === direct + '/1' && p.slot === 'default',
    ),
  );
  const unambiguous = semanticModel(text.replace(',"slots":{"default":[]}', ''));
  assert.ok(
    bindingCoverage(unambiguous, unambiguous.byPath.get(main)).has('/data/schema/properties/read'),
  );
});
test('real travel Catalog compiles both profiles after moving a container without expanding template uses', () => {
  const text = JSON.stringify(travelDefinition),
    m = semanticModel(text),
    root = m.byPath.get('/views/desktop');
  const source = root.path + '/slots/default/0';
  const moved = moveLayoutNode(
    m,
    source,
    pos(
      root.path,
      root.children.find((c) => c.key === 'slots').children.find((c) => c.key === 'default')
        .children.length,
    ),
    slots,
  );
  verified(moved, 'desktop');
  verified(moved, 'compact');
  const before = JSON.parse(text),
    after = JSON.parse(moved);
  assert.deepEqual(after.views.compact, before.views.compact);
  assert.deepEqual(after.viewTemplates, before.viewTemplates);
  assert.deepEqual(after.views.desktop.slots.default.at(-1), before.views.desktop.slots.default[0]);
});

test('moved pointer tracks same list gaps, renumbered parents and escaped layout and slot keys', () => {
  const root = '/views/a~1b~0';
  const list = root + '/slots/s~1x~0';
  assert.equal(movedLayoutPath(list + '/1', pos(root, 4, 's/x~')), list + '/3');
  assert.equal(movedLayoutPath(list + '/3', pos(root, 1, 's/x~')), list + '/1');
  assert.equal(
    movedLayoutPath(list + '/0', pos(list + '/2/node', 1, 'x/y')),
    list + '/1/node/slots/x~1y/1',
  );
  assert.equal(movedLayoutPath(list + '/0', pos(root, 2, 'other')), root + '/slots/other/2');
});
test('nested $id resolves a local fragment within its own resource and tuple members remain outline-only', () => {
  const def = form();
  def.data.schema = {
    type: 'object',
    $defs: { Shape: { type: 'object', properties: { wrong: { type: 'string' } } } },
    properties: {
      nested: {
        $id: 'https://example.invalid/child',
        type: 'object',
        $defs: { Shape: { type: 'object', properties: { right: { type: 'string' } } } },
        properties: { shape: { $ref: '#/$defs/Shape' } },
      },
      tuple: { type: 'array', prefixItems: [{ type: 'string' }], items: false },
    },
  };
  const m = semanticModel(JSON.stringify(def));
  assert.ok(layoutFields(m).some((f) => f.path === '/tuple/0'));
  const paths = bindingCandidates(m, m.byPath.get(main)).map((f) => f.ref.path);
  assert.ok(paths.includes('/nested/shape/right'));
  assert.ok(!paths.includes('/nested/shape/wrong'));
  assert.ok(!paths.includes('/tuple/0'));
});

test('a compact shared-schema DAG retains later root fields and explicitly marks partial coverage', () => {
  const defs = { N0: { type: 'string' } };
  for (let i = 1; i <= 13; i++) {
    const previous = { $ref: '#/$defs/N' + (i - 1) };
    defs['N' + i] = { type: 'object', properties: { left: previous, right: previous } };
  }
  const def = form(input('/tail'));
  def.data.schema = {
    type: 'object',
    $defs: defs,
    properties: { first: { $ref: '#/$defs/N13' }, tail: { type: 'string' } },
  };
  const text = JSON.stringify(def);
  assert.ok(Buffer.byteLength(text) < 16384);
  const m = semanticModel(text);
  assert.ok(layoutFields(m).some((f) => f.path === '/tail'));
  assert.equal(layoutFieldsLimited(m), true);
  assert.ok(bindingCandidates(m, m.byPath.get(main)).some((f) => f.ref.path === '/tail'));
  assert.equal(layoutFieldsLimited(semanticModel(JSON.stringify(form()))), false);
});

test('shorthand children appear in the outline with their original source paths', () => {
  const m = semanticModel(
    JSON.stringify({
      views: {
        web: {
          material: 'section',
          children: [{ material: 'field', children: [{ material: 'remote-select' }] }],
        },
      },
    }),
  );
  assert.deepEqual(
    m.items.filter((i) => i.group === '视图控件').map((i) => i.node.path),
    ['/views/web', '/views/web/children/0', '/views/web/children/0/children/0'],
  );
});

test('deletes a scoped component and its wrapper without touching neighbouring raw tokens', () => {
  const source =
    '{"views":{"main":{"material":"section","children":[{"material":"grid","props":{"columns":1e0}},' +
    JSON.stringify(each('left', input('/name', 'row'))) +
    ',{"$use":"summary"}]},"second":{"material":"section"}},"data":{"schema":{"type":"object"}}}';
  const m = semanticModel(source);
  const next = removeLayoutNode(m, m.byPath.get('/views/main/children/1/node'));
  assert.equal(next, source.replace(JSON.stringify(each('left', input('/name', 'row'))) + ',', ''));
  const remaining = semanticModel(next);
  const last = removeLayoutNode(remaining, remaining.byPath.get('/views/main/children/1'));
  assert.deepEqual(JSON.parse(last).views.main.children, [
    { material: 'grid', props: { columns: 1 } },
  ]);
});

test('preserves shorthand children and named slot contents when replacing a container', () => {
  const original =
    '{ "views":{"web":{"material":"section","children":[{"material":"grid"}],"slots":{"actions":[{"material":"button","props":{"label":"\\u0061"}}]}}}}';
  const m = semanticModel(original);
  const root = m.byPath.get('/views/web');
  const position = pos(root.path, 1);
  const inserted = insertLayoutNode(m, position, '{"material":"section"}', slots);
  assert.equal(insertedLayoutPath(m, position), '/views/web/children/1');
  assert.ok(inserted.includes('{"material":"grid"},{"material":"section"}'));
  assert.ok(inserted.includes('"label":"\\u0061"'));
  const replacement =
    '{"material":"dialog-editor","props":{"title":"详情"},"slots":{"summary":[],"content":[]}}';
  const plan = planLayoutMaterialReplacement(m, root, ['summary', 'content']);
  assert.equal(plan.removed, 0);
  assert.deepEqual(plan.moves, [
    { from: 'default', to: 'content' },
    { from: 'actions', to: 'content' },
  ]);
  const replaced = replaceLayoutMaterial(m, root, replacement, false);
  assert.ok(replaced.includes('"label":"\\u0061"'));
  assert.deepEqual(JSON.parse(replaced).views.web.slots, {
    summary: [],
    content: [{ material: 'grid' }, { material: 'button', props: { label: 'a' } }],
  });
  const leaf = '{"material":"button","props":{"label":"替换后"}}';
  assert.equal(planLayoutMaterialReplacement(m, root, []).removed, 2);
  assert.throws(() => replaceLayoutMaterial(m, root, leaf, false), /确认清空/);
  assert.deepEqual(
    JSON.parse(replaceLayoutMaterial(m, root, leaf, true)).views.web,
    JSON.parse(leaf),
  );
});
