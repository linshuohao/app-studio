import { child, semanticModel, type Model } from './semantic-model';

export const emptyRoot = '{"material":"section","slots":{"default":[]}}';

export function layoutName(m: Model, key: string) {
  return m.str(child(child(child(m.root, 'metadata'), 'studioLayoutNames'), key)) ?? key;
}

export function editLayout(
  m: Model,
  action: 'new' | 'copy' | 'rename',
  key: string,
  name: string,
  source: string,
) {
  if (action === 'rename' && key !== source) throw Error('修改显示名须保留原布局 key。');
  if ((action !== 'rename' && (!key.trim() || key.length > 120)) || !name.trim())
    throw Error('请填写布局名称和有效的布局 key（最多 120 字符）。');
  if (m.root.kind !== 'object') throw Error('请先在 JSON 中修复定义根对象。');
  const views = child(m.root, 'views');
  const original = child(views, source);
  if (views && (views.kind !== 'object' || m.ambiguous.has(views.path)))
    throw Error('views 结构不明确，请在 JSON 中修复。');
  let text = m.raw(m.root);
  if (action !== 'rename') {
    if (child(views, key)) throw Error('布局 key 已存在。');
    if (action === 'copy' && (!original || m.ambiguous.has(original.path)))
      throw Error('无法唯一定位要复制的布局。');
    const raw = action === 'copy' ? m.raw(original!) : emptyRoot;
    text = views
      ? m.property(views, key, raw)
      : m.property(m.root, 'views', '{' + JSON.stringify(key) + ':' + raw + '}');
  } else if (!original || m.ambiguous.has(original.path)) throw Error('无法唯一定位布局。');
  const model = action === 'rename' ? m : semanticModel(text);
  const metadata = child(model.root, 'metadata'),
    names = child(metadata, 'studioLayoutNames');
  if (names && child(names, key) && child(names, key)?.kind !== 'string')
    throw Error('显示名称含未知配置，请在 JSON 中编辑。');
  const entry = JSON.stringify({ [key]: name.trim() });
  return names
    ? model.property(names, key, JSON.stringify(name.trim()))
    : metadata
      ? model.property(metadata, 'studioLayoutNames', entry)
      : model.property(model.root, 'metadata', '{"studioLayoutNames":' + entry + '}');
}
