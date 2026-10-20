/** Upgrade only the draft-07 constructs emitted by our TS generator, traversing schema positions.
 * Literal annotations (const/default/examples) must never be rewritten as schemas.
 */
export function toDraft2020(input) {
  const schema = structuredClone(input);
  const maps = ['properties', 'patternProperties', 'dependentSchemas', '$defs'];
  const singles = [
    'additionalProperties',
    'propertyNames',
    'contains',
    'not',
    'if',
    'then',
    'else',
    'unevaluatedProperties',
    'unevaluatedItems',
  ];
  function visit(node) {
    if (typeof node === 'boolean') return;
    if (!node || typeof node !== 'object' || Array.isArray(node))
      throw new Error('Expected a generated schema object');
    if (node.definitions) {
      if (node.$defs) throw new Error('Ambiguous generated definitions');
      node.$defs = node.definitions;
      delete node.definitions;
    }
    if (typeof node.$ref === 'string')
      node.$ref = node.$ref.replace(/^#\/definitions\//, '#/$defs/');
    if (Array.isArray(node.items)) {
      node.prefixItems = node.items;
      node.items = node.additionalItems ?? true;
      delete node.additionalItems;
    } else if ('additionalItems' in node) {
      // In draft-07 this keyword is ignored without tuple-form items.
      delete node.additionalItems;
    }
    for (const keyword of maps)
      for (const child of Object.values(node[keyword] ?? {})) visit(child);
    for (const keyword of singles) if (keyword in node) visit(node[keyword]);
    for (const keyword of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
      for (const child of node[keyword] ?? []) visit(child);
    }
    if ('items' in node) visit(node.items);
    if ('dependencies' in node) throw new Error('Unexpected generator keyword: dependencies');
  }
  visit(schema);
  schema.$schema = 'https://json-schema.org/draft/2020-12/schema';
  return schema;
}
