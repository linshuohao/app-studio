import { parseJson, type JsonNode } from '../components/json/model';
import { child, escapeKey } from './semantic-model';

export type SchemaItem = {
  node: JsonNode;
  label: string;
  group: 'structure' | 'definitions';
  role: 'root' | 'field' | 'definition' | 'items';
  depth: number;
  owner?: string;
  required: boolean;
};

const schemaPath = '/data/schema';
const parentPath = (path: string) => path.slice(0, path.lastIndexOf('/'));
const within = (path: string, ancestor: string) =>
  path === ancestor || path.startsWith(ancestor + '/');
const mapKeywords = new Set([
  'properties',
  'patternProperties',
  '$defs',
  'definitions',
  'dependentSchemas',
]);
const arrayKeywords = new Set(['prefixItems', 'oneOf', 'allOf', 'anyOf']);
const schemaKeywords = new Set([
  'items',
  'contains',
  'additionalProperties',
  'unevaluatedProperties',
  'unevaluatedItems',
  'propertyNames',
  'contentSchema',
  'if',
  'then',
  'else',
  'not',
]);

// Only protocol-defined expression, reference and ValueSpec positions can read data.
// An ordinary property value or a literal expression may itself look exactly like a DataReference.
function dataReferences(root: JsonNode, str: (node?: JsonNode) => string | undefined) {
  const references: { node: JsonNode; pointer?: string; scoped: boolean }[] = [];
  const literals: string[] = [];
  function literal(n: JsonNode, key: string) {
    const payload = child(n, key);
    if (payload) literals.push(payload.path);
    return !!payload;
  }
  function ref(n?: JsonNode) {
    if (!n) return;
    if (str(child(n, 'source')) === 'data')
      references.push({ node: n, pointer: str(child(n, 'path')), scoped: !!child(n, 'scope') });
    else if (str(child(n, 'source')) === 'validation') ref(child(n, 'field'));
  }
  function expr(n?: JsonNode) {
    if (!n || literal(n, 'literal')) return;
    ref(child(n, 'ref'));
    child(n, 'args')?.children?.forEach(expr);
  }
  function value(n?: JsonNode) {
    if (!n || literal(n, '$literal')) return;
    const expression = child(n, '$expr');
    if (expression) expr(expression);
    else n.children?.forEach(value);
  }
  function action(n: JsonNode) {
    ref(child(n, 'target'));
    if (str(child(n, 'op')) === 'patch') child(n, 'value')?.children?.forEach(value);
    else value(child(n, 'value'));
    value(child(n, 'payload'));
    const command = child(n, 'command');
    if (command) action(command);
    child(n, 'commands')?.children?.forEach(action);
  }
  function scope(n?: JsonNode) {
    if (n?.kind === 'array') n.children?.forEach(scope);
    else ref(child(n, 'from'));
  }
  function view(n?: JsonNode) {
    if (!n) return;
    scope(child(n, 'scope'));
    view(child(n, 'node'));
    child(n, 'children')?.children?.forEach(view);
    const bind = child(n, 'bind');
    if (bind) references.push({ node: bind, pointer: str(bind), scoped: false });
    for (const key of ['bindings', 'with']) child(n, key)?.children?.forEach(ref);
    for (const key of ['on', 'requests']) child(n, key)?.children?.forEach(action);
    child(n, 'props')?.children?.forEach(value);
    for (const slot of child(n, 'slots')?.children ?? []) slot.children?.forEach(view);
  }
  child(root, 'expressions')?.children?.forEach(expr);
  child(root, 'views')?.children?.forEach(view);
  for (const template of child(root, 'viewTemplates')?.children ?? [])
    view(child(template, 'node'));
  for (const section of ['reactions', 'constraints'])
    for (const rule of child(root, section)?.children ?? []) {
      scope(child(rule, 'scope'));
      expr(child(rule, 'when'));
      expr(child(rule, 'assert'));
      ref(child(rule, 'target'));
      ref(child(child(rule, 'issue'), 'target'));
      child(rule, 'watch')?.children?.forEach(ref);
      child(rule, 'then')?.children?.forEach(action);
      for (const prerequisite of child(rule, 'requires')?.children ?? [])
        ref(child(prerequisite, 'target'));
    }
  return { references, literals };
}

export function dataSchemaModel(text: string) {
  const { root, tokens } = parseJson(text);
  const starts: number[] = [];
  let offset = 0;
  for (const token of tokens) {
    offset = text.indexOf(token, offset);
    starts.push(offset);
    offset += token.length;
  }
  function raw(node: JsonNode) {
    return text.slice(starts[node.start], starts[node.end - 1] + tokens[node.end - 1].length);
  }
  const str = (node?: JsonNode): string | undefined =>
    node?.kind === 'string' ? JSON.parse(tokens[node.start]) : undefined;
  const byPath = new Map<string, JsonNode>();
  const ambiguous = new Set<string>();
  function index(node: JsonNode, inherited: boolean) {
    byPath.set(node.path, node);
    if (inherited) ambiguous.add(node.path);
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const n of node.children ?? []) {
      if (seen.has(n.key!)) duplicates.add(n.key!);
      seen.add(n.key!);
    }
    for (const n of node.children ?? []) index(n, inherited || duplicates.has(n.key!));
  }
  index(root, false);
  function unique(path: string) {
    if (!within(path, schemaPath)) throw Error('只能修改数据模型。');
    if (ambiguous.has(path)) throw Error('路径含重复属性，请在 JSON 中定位。');
    const node = byPath.get(path);
    if (!node) throw Error('目标已变化，请重新选择。');
    return node;
  }
  function splice(start: number, end: number, value: string) {
    const from = starts[start];
    const to = start === end ? from : starts[end - 1] + tokens[end - 1].length;
    return text.slice(0, from) + value + text.slice(to);
  }
  function replace(path: string, value: string) {
    const node = unique(path);
    if (node.children?.length) {
      const replacement = parseJson(value);
      // Replacing a card may remove referenced descendants or move a referenced tuple member.
      function compare(before: JsonNode, after: JsonNode) {
        const children = new Map(after.children?.map((n) => [n.key, n]));
        for (const previous of before.children ?? []) {
          const current = children.get(previous.key);
          if (!current || before.kind !== after.kind) protectRemoved(previous, false);
          else if (
            before.kind === 'array' &&
            tokens.slice(previous.start, previous.end).join('') !==
              replacement.tokens.slice(current.start, current.end).join('')
          )
            protectRemoved(previous, false);
          else compare(previous, current);
        }
      }
      compare(node, replacement.root);
    } else JSON.parse(value);
    return splice(node.start, node.end, value);
  }
  function set(path: string, key: string, value: string) {
    const parent = unique(path);
    if (parent.kind !== 'object') throw Error('请选择对象，或在 JSON 中修复此位置。');
    const existing = child(parent, key);
    if (existing) return replace(existing.path, value);
    JSON.parse(value);
    return insertProperty(parent, key, value);
  }
  function insertProperty(parent: JsonNode, key: string, value: string) {
    const insert = (parent.children?.length ? ',' : '') + JSON.stringify(key) + ':' + value;
    return splice(parent.end - 1, parent.end - 1, insert);
  }
  function append(path: string, value: string) {
    const array = unique(path);
    if (array.kind !== 'array') throw Error('请选择数组。');
    JSON.parse(value);
    return splice(array.end - 1, array.end - 1, (array.children?.length ? ',' : '') + value);
  }
  function protectRemoved(n: JsonNode, shiftSiblings: boolean) {
    const path = n.path;
    const parent = byPath.get(parentPath(path))!;
    const affected = (target: string) => {
      if (within(target, path)) return true;
      if (!shiftSiblings || parent.kind !== 'array' || !target.startsWith(parent.path + '/'))
        return false;
      const index = target.slice(parent.path.length + 1).split('/')[0];
      return /^(0|[1-9]\d*)$/.test(index) && Number(index) > Number(n.key);
    };
    if (
      uncertainDeclarationRef ||
      unknownPointers.some((source) => !within(source, path)) ||
      localPointers.some((ref) => !within(ref.source, path) && affected(ref.target)) ||
      declarationRefs.some(
        (ref) =>
          affected(ref.target) ||
          (ref.keyword !== undefined && affected(ref.target + '/' + escapeKey(ref.keyword))),
      )
    ) {
      throw Error('移除此节点会影响 Schema 引用或文案位置，请在 JSON 中核对。');
    }
  }
  function remove(path: string) {
    const n = unique(path);
    if (path === schemaPath) throw Error('请保留根模型。');
    protectRemoved(n, true);
    let start = n.keyIndex ?? n.start,
      end = n.end;
    if (tokens[end] === ',') end++;
    else if (tokens[start - 1] === ',') start--;
    return splice(start, end, '');
  }

  const schema = byPath.get(schemaPath);
  function createSchema() {
    const data = byPath.get('/data');
    if (schema || ambiguous.has('/data'))
      throw Error('数据模型已存在或 data 含重复属性，请在 JSON 中定位。');
    if (root.kind !== 'object' || (data && data.kind !== 'object'))
      throw Error('请在 JSON 中修复表单定义或 data 对象。');
    const objectSchema = '{"type":"object"}';
    return data
      ? insertProperty(data, 'schema', objectSchema)
      : insertProperty(root, 'data', '{"schema":' + objectSchema + '}');
  }
  const nodes: SchemaItem[] = [];
  const definitions: SchemaItem[] = [];
  const schemaNodes: JsonNode[] = [];
  type Location = { domain: string; keys: (string | null)[] };
  const locations = new Map<string, Location>();
  function traverse(node: JsonNode, location: Location, row?: SchemaItem) {
    locations.set(node.path, location);
    schemaNodes.push(node);
    if (row) {
      nodes.push(row);
      if (row.role === 'definition') definitions.push(row);
    }
    for (const group of node.children ?? []) {
      const keyword = group.key!;
      const isMap = mapKeywords.has(keyword) && group.kind === 'object';
      const isList = arrayKeywords.has(keyword) && group.kind === 'array';
      const children =
        isMap || isList ? group.children : schemaKeywords.has(keyword) ? [group] : [];
      for (const n of children ?? []) {
        const definition = keyword === '$defs' && node === schema;
        const named = keyword === 'properties';
        const element = keyword === 'items' || keyword === 'prefixItems';
        const pattern = keyword === 'patternProperties';
        const structural = row && (named || element || pattern);
        const title = str(child(n, 'title'));
        const key = n.key!;
        const entry: SchemaItem | undefined =
          definition || structural
            ? {
                node: n,
                label:
                  title ||
                  (keyword === 'items'
                    ? '数组元素'
                    : keyword === 'prefixItems'
                      ? '第 ' + (Number(key) + 1) + ' 项'
                      : key),
                role: definition ? 'definition' : named ? 'field' : 'items',
                group: definition ? 'definitions' : row!.group,
                depth: definition ? 0 : row!.depth + 1,
                owner: node.path,
                required: named && !!child(node, 'required')?.children?.some((r) => str(r) === key),
              }
            : undefined;
        let next = location;
        if (keyword === '$defs' || keyword === 'definitions') next = { domain: n.path, keys: [] };
        else if (
          named ||
          element ||
          pattern ||
          [
            'contains',
            'additionalProperties',
            'unevaluatedProperties',
            'unevaluatedItems',
          ].includes(keyword)
        ) {
          const part = named || keyword === 'prefixItems' ? key : null;
          next = { domain: location.domain, keys: [...location.keys, part] };
        }
        traverse(n, next, entry);
      }
    }
  }
  if (schema)
    traverse(
      schema,
      { domain: '', keys: [] },
      {
        node: schema,
        label: str(child(schema, 'title')) || '根模型',
        role: 'root',
        group: 'structure',
        depth: 0,
        required: false,
      },
    );

  const refs = new Map<string, string[]>();
  const byRef = new Map(definitions.map((d) => ['#/$defs/' + escapeKey(d.node.key!), d.node]));
  function refTarget(node: JsonNode) {
    const value = str(child(node, '$ref'));
    if (value?.startsWith('#/')) {
      try {
        return byRef.get(decodeURIComponent(value));
      } catch {
        return undefined;
      }
    }
  }
  function resourceIsLocal(path: string) {
    // A nested schema resource changes the base URI for fragment-only references.
    return !schemaNodes.some((n) => n !== schema && within(path, n.path) && child(n, '$id'));
  }
  function localRef(path: string) {
    const node = byPath.get(path);
    if (
      !node ||
      node.kind !== 'object' ||
      ambiguous.has(path) ||
      !resourceIsLocal(path) ||
      child(node, '$dynamicRef')
    )
      return false;
    const reference = child(node, '$ref');
    const target = refTarget(node);
    return (
      !reference || (!ambiguous.has(reference.path) && !!target && !ambiguous.has(target.path))
    );
  }
  function effectiveType(node: JsonNode): unknown {
    const own = child(node, 'type');
    const inherited =
      !own && child(node, '$ref') && localRef(node.path)
        ? child(refTarget(node), 'type')
        : undefined;
    const type = own ?? inherited;
    return type ? JSON.parse(raw(type)) : undefined;
  }
  function childActions(node: JsonNode) {
    const type = effectiveType(node);
    const accepts = (kind: string) =>
      !type || type === kind || (Array.isArray(type) && type.includes(kind));
    return {
      field: node.kind === 'object' && (accepts('object') || !!child(node, 'properties')),
      items: node.kind === 'object' && accepts('array') && !child(node, 'items'),
    };
  }
  let uncertain = [...ambiguous].some(
    (path) => within(path, schemaPath) || within(path, '/validationMessages'),
  );
  const localPointers: { source: string; target: string }[] = [];
  const unknownPointers: string[] = [];
  for (const node of schemaNodes) {
    for (const keyword of ['$ref', '$dynamicRef', '$recursiveRef']) {
      const source = child(node, keyword);
      if (!source) continue;
      const reference = str(source);
      if (
        keyword === '$ref' &&
        reference?.startsWith('#/') &&
        !ambiguous.has(source.path) &&
        resourceIsLocal(node.path)
      ) {
        try {
          localPointers.push({
            source: source.path,
            target: schemaPath + decodeURIComponent(reference.slice(1)),
          });
        } catch {
          unknownPointers.push(source.path);
        }
      } else if (keyword !== '$ref' || reference !== '#' || !resourceIsLocal(node.path))
        unknownPointers.push(source.path);
    }
    if (ambiguous.has(node.path) || child(node, '$dynamicRef') || child(node, '$recursiveRef'))
      uncertain = true;
    if (!child(node, '$ref')) continue;
    const target = refTarget(node);
    if (!target || !localRef(node.path) || ambiguous.has(target.path)) {
      uncertain = true;
      continue;
    }
    const list = refs.get(target.path) ?? [];
    list.push(node.path);
    refs.set(target.path, list);
  }
  // A typed template parameter consumes its declared schema (including child properties).
  // A validation message instead names one exact schema location and keyword.
  let uncertainDeclarationRef = [...ambiguous].some((path) => within(path, '/validationMessages'));
  const declarationRefs: { target: string; source: string; template: boolean; keyword?: string }[] =
    [];
  function declarationRef(holder: JsonNode, template: boolean) {
    const reference = child(holder, 'schemaRef');
    const value = str(reference);
    if (
      !reference ||
      ambiguous.has(reference.path) ||
      !value ||
      (value !== '#' && !value.startsWith('#/'))
    ) {
      uncertainDeclarationRef = true;
      return;
    }
    try {
      const target = schemaPath + decodeURIComponent(value.slice(1));
      if (ambiguous.has(target) || /~(?![01])/.test(target)) uncertainDeclarationRef = true;
      else
        declarationRefs.push({
          target,
          source: reference.path,
          template,
          keyword: template ? undefined : str(child(holder, 'keyword')),
        });
    } catch {
      uncertainDeclarationRef = true;
    }
  }
  for (const message of child(root, 'validationMessages')?.children ?? [])
    declarationRef(message, false);
  for (const templates of root.children?.filter((n) => n.key === 'viewTemplates') ?? []) {
    for (const template of templates.children ?? []) {
      for (const params of template.children?.filter((n) => n.key === 'params') ?? []) {
        if (ambiguous.has(params.path) || params.kind !== 'object') uncertainDeclarationRef = true;
        for (const param of params.children ?? []) declarationRef(param, true);
      }
    }
  }
  function definitionOf(path: string) {
    return definitions.find((d) => within(path, d.node.path));
  }
  const { references: executableRefs, literals } = dataReferences(root, str);
  const executable = new Set(['views', 'viewTemplates', 'expressions', 'constraints', 'reactions']);
  const ambiguousExecutables = [...ambiguous].some(
    (path) => executable.has(path.split('/')[1]) && !literals.some((p) => within(path, p)),
  );
  function impacts(path: string) {
    const usages = new Set<string>();
    let unknown = uncertain || uncertainDeclarationRef;
    const definition = definitionOf(path);
    // Follow reverse edges between declarations once, including recursive definitions.
    if (definition) {
      const queue = [definition.node.path],
        seen = new Set(queue);
      for (const target of queue)
        for (const use of refs.get(target) ?? []) {
          const owner = definitionOf(use);
          usages.add(use);
          if (owner && !seen.has(owner.node.path)) {
            seen.add(owner.node.path);
            queue.push(owner.node.path);
          }
        }
    }
    const affectedSchemas = [path, ...usages];
    for (const ref of declarationRefs) {
      if (
        within(ref.target, path) ||
        (ref.template && affectedSchemas.some((p) => within(p, ref.target)))
      ) {
        usages.add(ref.source);
      }
    }
    const row = nodes.find((entry) => entry.node.path === path);
    const location = locations.get(path);
    const compatible = (a: (string | null)[], b: (string | null)[]) =>
      a.slice(0, b.length).every((k, i) => k === null || b[i] === null || k === b[i]);

    if (row?.role === 'field') {
      const key = row.node.key!,
        required = child(byPath.get(row.owner!), 'required');
      // A condition on an ancestor may descend through properties/items and constrain this field.
      const owner = locations.get(row.owner!)!;
      for (const n of schemaNodes) {
        const other = locations.get(n.path)!;
        if (other.domain !== owner.domain || !compatible(other.keys, owner.keys)) continue;
        if (other.keys.length <= owner.keys.length && child(n, '$ref')) {
          // A constraint inherited from a shared definition can also name this property.
          unknown = true;
        }
        if (other.keys.length !== owner.keys.length) continue;
        for (const literal of [child(n, 'const'), ...(child(n, 'enum')?.children ?? [])]) {
          if (literal?.kind === 'object' && child(literal, key)) usages.add(literal.path);
        }
        for (const keyword of [
          'required',
          'dependentRequired',
          'dependentSchemas',
          'properties',
          'dependencies',
        ]) {
          const group = child(n, keyword);
          if (!group || group === required || (keyword === 'properties' && n.path === row.owner))
            continue;
          if (keyword === 'required' && group.children?.some((item) => str(item) === key))
            usages.add(group.path);
          if (keyword !== 'required' && child(group, key)) usages.add(child(group, key)!.path);
          if (keyword === 'dependentRequired' || keyword === 'dependencies') {
            for (const dep of group.children ?? [])
              if (dep.children?.some((item) => str(item) === key)) usages.add(dep.path);
          }
        }
      }
    }
    if (row && location?.domain === '') {
      if (ambiguousExecutables) unknown = true;
      for (const { node: n, pointer: ref, scoped } of executableRefs) {
        if (scoped || ref === undefined || (ref !== '' && !ref.startsWith('/'))) {
          unknown = true;
          continue;
        }
        const segments =
          ref === ''
            ? []
            : ref
                .slice(1)
                .split('/')
                .map((s) => s.replaceAll('~1', '/').replaceAll('~0', '~'));
        if (compatible(location.keys, segments)) usages.add(n.path);
      }
    }
    return { paths: [...usages], unknown };
  }

  function addNamed(path: string, keyword: string, name: string, value: string) {
    if (!name.trim()) throw Error('请输入名称。');
    JSON.parse(value);
    const parent = unique(path);
    const holder = child(parent, keyword);
    if (!holder) return set(path, keyword, '{' + JSON.stringify(name) + ':' + value + '}');
    if (child(holder, name)) throw Error('已有同名字段或定义。');
    return set(holder.path, name, value);
  }
  const addField = (owner: string, name: string, value: string) =>
    addNamed(owner, 'properties', name, value);
  const addDefinition = (name: string, value: string) => addNamed(schemaPath, '$defs', name, value);
  function insertSibling(path: string, name: string, value: string) {
    const node = unique(path);
    const holder = unique(parentPath(path));
    if (holder.kind !== 'object' || (holder.key !== 'properties' && holder.key !== '$defs'))
      throw Error('请选择命名字段或共享定义。');
    if (!name.trim()) throw Error('请输入名称。');
    if (child(holder, name)) throw Error('已有同名字段或定义。');
    JSON.parse(value);
    return splice(node.end, node.end, ',' + JSON.stringify(name) + ':' + value);
  }
  function requiredEntry(field: JsonNode) {
    const owner = unique(parentPath(parentPath(field.path)));
    const required = child(owner, 'required');
    if (!required) return { owner };
    unique(required.path);
    const values = required.children?.map((n) => str(n));
    if (
      required.kind !== 'array' ||
      !values ||
      values.includes(undefined) ||
      new Set(values).size !== values.length
    )
      throw Error('必填列表含重复或无效项，请在 JSON 中修复。');
    return { owner, required, entry: required.children?.find((n) => str(n) === field.key) };
  }
  function setRequired(path: string, on: boolean) {
    const field = unique(path);
    if (!nodes.some((n) => n.node.path === path && n.role === 'field'))
      throw Error('请选择命名字段。');
    const { owner, required, entry } = requiredEntry(field);
    if (!!entry === on) return text;
    if (entry && required)
      return remove(required.children!.length === 1 ? required.path : entry.path);
    const value = JSON.stringify(field.key);
    return required ? append(required.path, value) : set(owner.path, 'required', '[' + value + ']');
  }
  function named(path: string) {
    const node = unique(path);
    const row = nodes.find((n) => n.node === node);
    if (!row || row.role === 'root') throw Error('请选择字段、数组元素或共享定义。');
    const uses = impacts(path);
    if (uses.unknown || uses.paths.length)
      throw Error('存在引用、条件或无法确定的使用位置，请在 JSON 中核对。');
    return row;
  }
  function deleteNamed(path: string) {
    const row = named(path);
    const next = row.role === 'field' ? setRequired(path, false) : text;
    if (row.role === 'items' && row.node.key === 'items' && row.owner === parentPath(path))
      return remove(path);
    const holder = unique(parentPath(path));
    const target = holder.children!.length === 1 ? holder.path : path;
    return next === text ? remove(target) : dataSchemaModel(next).remove(target);
  }
  function renameNamed(path: string, name: string) {
    const row = named(path),
      holder = unique(parentPath(path));
    if (row.node.key === name) return text;
    if (!name.trim() || child(holder, name)) throw Error('请输入尚未使用的名称。');
    if (row.role === 'items') throw Error('请选择命名字段或共享定义。');
    const { required, entry } = row.role === 'field' ? requiredEntry(row.node) : {};
    if (required?.children?.some((n) => str(n) === name)) throw Error('新名称已在必填列表中。');
    // Keep the declaration in place and change only its key and matching required entry.
    const keyIndex = row.node.keyIndex!;
    const renamed = splice(keyIndex, keyIndex + 1, JSON.stringify(name));
    const next = entry
      ? dataSchemaModel(renamed).replace(entry.path, JSON.stringify(name))
      : renamed;
    // Rules may already use the destination name even if its field was undeclared.
    const destination = dataSchemaModel(next).impacts(holder.path + '/' + escapeKey(name));
    if (destination.unknown || destination.paths.length)
      throw Error('新名称存在使用位置，请在 JSON 中核对。');
    return next;
  }
  return {
    schema,
    createSchema,
    byPath,
    ambiguous,
    nodes,
    definitions,
    raw,
    str,
    replace,
    set,
    append,
    remove,
    addField,
    addDefinition,
    insertSibling,
    setRequired,
    deleteNamed,
    renameNamed,
    impacts,
    localRef,
    effectiveType,
    childActions,
  };
}
export type DataSchemaModel = ReturnType<typeof dataSchemaModel>;
