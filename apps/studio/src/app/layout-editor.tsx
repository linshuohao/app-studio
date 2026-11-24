'use client';
import { JsonEditor } from '../components/json/json-editor';
import { type CSSProperties, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Drawer, Field, Icon, Input, Tabs } from '../components/ui';
import { StudioSelect } from '../components/ui/select';
import * as manifests from '@form-engine/materials-react/manifests';
import { compactJson } from '../components/json/format';
import type { JsonNode } from '../components/json/model';
import { verifyLayoutEdit } from './layout-check';
import { failureMessage, PlatformError } from './platform-api';
import { child, semanticModel, escapeKey, type Model } from './semantic-model';
import { emptyRoot, editLayout, layoutName } from './layout-keys';
import {
  bindingCandidates,
  bindingCoverage,
  layoutFields,
  layoutFieldsLimited,
  layoutPositions,
  insertLayoutNode,
  moveLayoutNode,
  movedLayoutPath,
  moveProblem,
  type LayoutPosition,
} from './layout-structure';
import {
  LayoutMaterialInspector,
  LayoutMaterialPicker,
  useLayoutMaterial,
} from './layout-material';
import { SearchableFieldTree, LayoutFieldStructure } from './layout-field-picker';
import { layoutExpressionContext } from './layout-expression';
import { LayoutScopeInspector } from './layout-scope-inspector';
import { LayoutLivePreview } from './layout-live-preview';
import { useSchemaNavigation } from './schema-navigation';
import './layout-editor.css';

// The Platform Compiler builds its Web Catalog from the same installed manifest entry point.
const slots = new Map<string, readonly string[]>(
  Object.values(manifests).map((m) => [m.id, 'slots' in m ? (m.slots ?? []) : []]),
);
type Props = {
  text: string;
  readOnly?: boolean;
  apply: (next: string) => void;
  locate: (path: string) => void;
  repair: () => void;
  formPath: string;
  profile: string;
  onProfile: (key: string) => void;
};
type Picker = { source: string; root?: boolean; position?: LayoutPosition; preferred?: string };
const nodeName = (m: Model, n: JsonNode) =>
  m.str(child(child(n, 'props'), 'title')) ??
  m.str(child(child(n, 'props'), 'label')) ??
  m.str(child(n, 'material')) ??
  m.str(child(n, '$use')) ??
  m.str(child(child(n, 'scope'), 'as')) ??
  '未知节点';
function errorText(e: unknown) {
  return e instanceof PlatformError
    ? failureMessage(e)
    : e instanceof Error
      ? e.message
      : '操作失败';
}

export function LayoutEditor(props: Props) {
  const model = useMemo(() => {
    try {
      return semanticModel(props.text);
    } catch {
      return undefined;
    }
  }, [props.text]);
  if (!model || model.root.kind !== 'object')
    return (
      <button onClick={props.repair}>{props.readOnly ? '查看 JSON 原文' : '打开文本修复'}</button>
    );
  return <LayoutWorkspace {...props} m={model} />;
}

function LayoutWorkspace({
  text,
  readOnly,
  apply,
  locate,
  formPath,
  profile,
  onProfile,
  m,
}: Props & { m: Model }) {
  const { beforeLeave, pendingOwner } = useSchemaNavigation();
  const [overlay, setOverlay] = useState<{ base: string; path: string; text: string }>();
  const views = child(m.root, 'views');
  const root = child(views, profile) ?? views?.children?.[0];
  const key = root?.key ?? '';
  const [path, setPath] = useState('');
  const [fieldPath, setFieldPath] = useState('');
  const [dialog, setDialog] = useState<'new' | 'copy' | 'rename'>();
  const [draftKey, setKey] = useState(''),
    [name, setName] = useState('');
  const [picker, setPicker] = useState<Picker>();
  const [destination, setDestination] = useState('');
  const [narrowPane, setNarrowPane] = useState<'outline' | 'paper'>('outline');
  const [structureTab, setStructureTab] = useState<'fields' | 'outline'>('outline');
  const [inspecting, setInspecting] = useState(false);
  const [drawerFooter, setDrawerFooter] = useState<HTMLDivElement | null>(null);
  const drawerClose = useRef<HTMLButtonElement>(null);
  const [drawerPreview, setDrawerPreview] = useState(false);
  const [inspectorTrigger, setInspectorTrigger] = useState<HTMLElement>();
  const [layoutTrigger, setLayoutTrigger] = useState<HTMLElement>();
  const [error, setError] = useState('');
  const [moving, setMoving] = useState(false);
  const [mode, setMode] = useState<'preview' | 'arrange'>('preview');
  const [drag, setDrag] = useState<{ path: string; kind: 'field' | 'node' }>();
  const empty = !!root && compactJson(m.raw(root)) === emptyRoot;
  const arranging = !readOnly && (empty || mode === 'arrange');
  const [dropHint, setDropHint] = useState('');
  function endDrag() {
    setDrag(undefined);
    setDropHint('');
  }
  const activePicker = picker?.source === text ? picker : undefined;
  const node = root && (path.startsWith(root.path + '/') ? (m.byPath.get(path) ?? root) : root);
  const fields = layoutFields(m);
  const fieldParents: string[] = [];
  const limited = layoutFieldsLimited(m);
  const coverage = root && !limited ? bindingCoverage(m, root) : new Set<string>();
  const positions = root ? layoutPositions(m, root, slots) : [];
  const items = m.items.filter(
    (i) =>
      root &&
      i.group === '视图控件' &&
      (i.node === root || i.node.path.startsWith(root.path + '/')),
  );
  const item = items.find((i) => i.node === node);
  const materialId = m.str(child(node, 'material'));
  const inspectorMaterial = useLayoutMaterial(inspecting ? materialId : undefined);
  const parentNode =
    node && items.findLast(({ node: ancestor }) => node.path.startsWith(ancestor.path + '/'))?.node;
  const itemTitle = node ? nodeName(m, node) : '';
  const materialTitle = inspectorMaterial?.data?.documentation?.title;
  const destinations = item?.parent
    ? positions.flatMap((pos) => {
        const problem = moveProblem(m, item.node.path, pos, slots);
        return !problem || problem.startsWith('作用域 ') || problem.includes('同名作用域')
          ? [{ pos, problem, id: JSON.stringify(pos) }]
          : [];
      })
    : [];
  const target = destinations.find((p) => p.id === destination);
  const destinationName = (pos: LayoutPosition) =>
    nodeName(m, m.byPath.get(pos.parent)!) + ' · ' + pos.slot + ' · 第 ' + (pos.index + 1) + ' 位';
  const current = useRef<object | null>(null);
  useLayoutEffect(() => {
    current.current = {};
    return () => {
      current.current = null;
    };
  }, [text, key, path, picker, inspecting]);
  function selectNode(p: string) {
    setPath(p);
    setFieldPath('');
    setDestination('');
    setError('');
    setDrawerPreview(false);
    setInspecting(true);
  }
  function inspectNode(p: string, from: HTMLElement) {
    beforeLeave(() => {
      setInspectorTrigger(from);
      selectNode(p);
    });
  }
  function selectLayout(k: string) {
    onProfile(k);
    setPath('');
    setError('');
    setPicker(undefined);
    setDestination('');
    setFieldPath('');
    setNarrowPane('outline');
    setInspecting(false);
  }
  function openDialog(kind: NonNullable<typeof dialog>, from: HTMLElement) {
    setLayoutTrigger(from);
    setKey(kind === 'rename' ? key : '');
    setName(kind === 'rename' ? layoutName(m, key) : '');
    setError('');
    setDialog(kind);
  }
  const checkSequence = useRef(0);
  async function check(next: string, nodePath: string) {
    const version = current.current;
    const request = ++checkSequence.current;
    await verifyLayoutEdit(formPath, key, text, next, nodePath);
    if (request !== checkSequence.current) throw Error('已有新的编辑操作，请重试。');
    if (version !== current.current) throw Error('编辑位置或草稿已变化，请重试。');
  }
  async function move(source: string, pos: LayoutPosition) {
    if (moving) return;
    try {
      const next = moveLayoutNode(m, source, pos, slots);
      setMoving(true);
      await check(next, movedLayoutPath(source, pos));
      apply(next);
      setPath('');
      setDestination('');
      setInspecting(false);
      setError('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setMoving(false);
    }
  }
  function openPicker(pos: LayoutPosition, preferred?: string) {
    const parent = m.byPath.get(pos.parent);
    if (
      preferred &&
      (!parent || !bindingCandidates(m, parent).some((f) => f.schemaPath === preferred))
    ) {
      setError('该字段在目标位置没有可用的数据绑定作用域。');
      return;
    }
    setError('');
    setPicker({ source: text, position: pos, preferred });
  }
  const candidatesFor = (n: JsonNode) =>
    bindingCandidates(m, n).map((f) => ({ ...f, schema: JSON.parse(m.raw(f.schema)) }));
  function gap(pos: LayoutPosition) {
    const label =
      '添加到 ' + pos.parent + '/slots/' + escapeKey(pos.slot) + ' 第 ' + (pos.index + 1) + ' 位';
    const problem =
      drag?.kind === 'node'
        ? moveProblem(m, drag.path, pos, slots)
        : drag?.kind === 'field' &&
            !bindingCandidates(m, m.byPath.get(pos.parent)!).some(
              (field) => field.schemaPath === drag.path,
            )
          ? '该字段在目标位置没有可用的数据绑定作用域。'
          : undefined;
    return (
      <button
        type="button"
        className="layout-gap"
        aria-label={label}
        disabled={moving}
        aria-disabled={!!problem || undefined}
        title={problem}
        onClick={() => !problem && beforeLeave(() => openPicker(pos, fieldPath || undefined))}
        onDragEnter={() => setDropHint(problem ?? '')}
        onDragLeave={() => setDropHint('')}
        onDragOver={(e) => {
          if (drag) {
            e.preventDefault();
            e.dataTransfer.dropEffect = problem ? 'none' : drag.kind === 'node' ? 'move' : 'copy';
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (problem) setError(problem);
          else if (drag?.kind === 'node') beforeLeave(() => void move(drag.path, pos));
          else if (drag) beforeLeave(() => openPicker(pos, drag.path));
          endDrag();
        }}
      >
        <span aria-hidden="true">+</span>
      </button>
    );
  }
  function canvas(n: JsonNode) {
    const material = m.str(child(n, 'material'));
    const scoped = child(n, 'node');
    const label = nodeName(m, n);
    const shorthand = child(n, 'children');
    const repeat = child(n, 'scope');
    return (
      <section className={'layout-block' + (node === n ? ' selected' : '')} key={n.start}>
        <button
          className="layout-node-name"
          draggable={items.some((i) => i.node === n && !!i.parent)}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', n.path);
            e.dataTransfer.effectAllowed = 'move';
            setDrag({ kind: 'node', path: n.path });
          }}
          onDragEnd={endDrag}
          onClick={(event) => inspectNode(n.path, event.currentTarget)}
        >
          <strong>{label}</strong>
          {repeat ? (
            <small>重复区 · {label}</small>
          ) : material === 'condition' ? (
            <small>显示条件</small>
          ) : (
            material !== label && <small>{material}</small>
          )}
        </button>
        {scoped && canvas(scoped)}
        {shorthand &&
          (shorthand.kind !== 'array' ||
            child(child(n, 'slots'), 'default') ||
            !slots.get(material ?? '')?.includes('default')) && (
            <button onClick={() => beforeLeave(() => locate(shorthand.path))}>
              查看子节点原文
            </button>
          )}
        {(slots.get(material ?? '') ?? []).map((slot) => {
          const list =
            child(child(n, 'slots'), slot) ?? (slot === 'default' ? shorthand : undefined);
          const children = list?.kind === 'array' ? (list.children ?? []) : [];
          const gaps = positions.filter((p) => p.parent === n.path && p.slot === slot);
          const columnsProp = child(child(n, 'props'), 'columns');
          const columns = columnsProp?.kind === 'number' ? Number(m.raw(columnsProp)) : 2;
          const gridColumns = material === 'grid' && [2, 3].includes(columns) ? columns : 1;
          return (
            <div
              className={'layout-slot' + (gridColumns > 1 ? ' layout-slot-grid' : '')}
              style={
                gridColumns > 1 ? ({ '--layout-columns': gridColumns } as CSSProperties) : undefined
              }
              key={slot}
            >
              {children.map((node, i) => (
                <div className="layout-slot-item" key={node.start}>
                  {gaps[i] && gap(gaps[i])}
                  {canvas(node)}
                </div>
              ))}
              {gaps[children.length] && gap(gaps[children.length]!)}
            </div>
          );
        })}
      </section>
    );
  }
  const fieldRows = fields.map((f) => {
    fieldParents[f.depth] = f.schemaPath;
    return {
      id: f.schemaPath,
      parentId: fieldParents[f.depth - 1],
      depth: f.depth,
      label: f.label,
      path: f.path,
      metadata: { type: m.str(child(f.schema, 'type')) ?? '复合类型', required: f.required },
    };
  });
  const selectedField = fields.find((f) => f.schemaPath === fieldPath);
  return (
    <LayoutFieldStructure.Provider value={fieldRows}>
      <section className="visual-layout" data-pane={narrowPane} aria-label="布局编辑器">
        <header className="layout-bar">
          <div className="layout-selection">
            <strong>布局</strong>
            <StudioSelect
              aria-label="当前布局"
              value={key}
              onValueChange={(selected) => beforeLeave(() => selectLayout(selected))}
            >
              {views?.children?.map((v) => (
                <option key={v.start} value={v.key}>
                  {layoutName(m, v.key!)} · {v.key}
                </option>
              ))}
            </StudioSelect>
            <code>{key}</code>
          </div>
          <div className="layout-operations" aria-label="布局操作">
            {!readOnly && (
              <>
                <Button
                  variant="secondary"
                  onClick={(event) => openDialog('new', event.currentTarget)}
                >
                  新建布局
                </Button>
                {root && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={(event) => openDialog('copy', event.currentTarget)}
                    >
                      复制布局
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={(event) => openDialog('rename', event.currentTarget)}
                    >
                      修改名称
                    </Button>
                  </>
                )}
              </>
            )}
            <Button variant="text" onClick={() => beforeLeave(() => locate(views?.path ?? ''))}>
              {readOnly ? '在 JSON 中定位' : '在 JSON 中编辑'}
            </Button>
          </div>
        </header>
        {root && (
          <div className="layout-narrow-navigation" role="group" aria-label="布局工作区">
            <Button
              variant={narrowPane === 'outline' ? 'secondary' : 'text'}
              aria-pressed={narrowPane === 'outline'}
              onClick={() => setNarrowPane('outline')}
            >
              大纲
            </Button>
            <Button
              variant={narrowPane === 'paper' ? 'secondary' : 'text'}
              aria-pressed={narrowPane === 'paper'}
              onClick={() => setNarrowPane('paper')}
            >
              画布
            </Button>
          </div>
        )}
        {error && !dialog && !inspecting && <p role="alert">{error}</p>}
        {readOnly && !root && <p>尚未配置布局。</p>}
        {root && (
          <div className="layout-panes" inert={inspecting || !!dialog || !!activePicker}>
            <aside className="layout-outline" aria-label="布局结构">
              <Tabs.Root
                value={readOnly ? 'outline' : structureTab}
                onValueChange={(value) => {
                  if (value === 'fields' || value === 'outline') setStructureTab(value);
                }}
                size="sm"
                className="layout-structure-tabs"
              >
                <Tabs.List aria-label="结构类型">
                  {!readOnly && (
                    <Tabs.Tab value="fields">
                      字段
                      {!limited && (
                        <small>
                          {fields.filter((f) => coverage.has(f.schemaPath)).length}/{fields.length}
                        </small>
                      )}
                    </Tabs.Tab>
                  )}
                  <Tabs.Tab value="outline">视图大纲</Tabs.Tab>
                </Tabs.List>
                {!readOnly && (
                  <Tabs.Panel value="fields" className="layout-structure-panel" keepMounted>
                    {limited && (
                      <p className="layout-limited-note">
                        字段结构仅部分展开，完整定义可在 JSON 中查看。
                        <Button
                          variant="text"
                          onClick={() => beforeLeave(() => locate('/data/schema'))}
                        >
                          在 JSON 中查看完整字段
                        </Button>
                      </p>
                    )}
                    <SearchableFieldTree
                      rows={fieldRows}
                      showPath={false}
                      metadata={{
                        fields: ['type'],
                        extra: (row) =>
                          limited ? [] : [coverage.has(row.id) ? '已关联' : '未关联'],
                      }}
                      activeId={fieldPath}
                      onActivate={({ id }) => {
                        setMode('arrange');
                        setFieldPath(fieldPath === id ? '' : id);
                        setError('');
                      }}
                      onDrag={({ id }, event) => {
                        event.dataTransfer.setData('text/plain', id);
                        event.dataTransfer.effectAllowed = 'copy';
                        setMode('arrange');
                        setDrag({ kind: 'field', path: id });
                      }}
                      onDragEnd={endDrag}
                    />
                  </Tabs.Panel>
                )}
                <Tabs.Panel value="outline" className="layout-structure-panel" keepMounted>
                  <nav className="layout-outline-tree" aria-label="视图大纲">
                    {items.map((i) => {
                      const material = m.str(child(i.node, 'material'));
                      const kind =
                        material === 'field'
                          ? '字段'
                          : material
                            ? '组件'
                            : child(i.node, 'scope')
                              ? '重复区'
                              : '容器';
                      const name = nodeName(m, i.node);
                      return (
                        <Button
                          key={i.node.path}
                          variant="text"
                          className="layout-outline-row"
                          data-node-path={i.node.path}
                          aria-pressed={node === i.node}
                          style={{
                            paddingInlineStart:
                              8 +
                              Math.min(
                                8,
                                (
                                  i.node.path
                                    .slice(root.path.length)
                                    .match(/\/slots\/|\/children\/|\/node\b/g) ?? []
                                ).length,
                              ) *
                                12,
                          }}
                          onClick={(event) => inspectNode(i.node.path, event.currentTarget)}
                        >
                          <span>{name}</span>
                          <small className="layout-outline-kind">
                            {material && material !== 'field' && material !== name
                              ? kind + ' · ' + material
                              : kind}
                          </small>
                        </Button>
                      );
                    })}
                  </nav>
                </Tabs.Panel>
              </Tabs.Root>
            </aside>
            <div className="layout-paper" aria-label="布局画布">
              <div className="layout-paper-bar">
                <h3>
                  {layoutName(m, key)} <small>{key}</small>
                </h3>
                {!readOnly && !empty && (
                  <div className="layout-view-switch" role="group" aria-label="画布模式">
                    <Button
                      type="button"
                      variant="text"
                      aria-pressed={!arranging}
                      onClick={() => setMode('preview')}
                    >
                      真实预览
                    </Button>
                    <Button
                      type="button"
                      variant="text"
                      aria-pressed={arranging}
                      onClick={() => setMode('arrange')}
                    >
                      编排
                    </Button>
                  </div>
                )}
              </div>
              {arranging ? (
                <div className={'layout-arrangement' + (drag ? ' layout-dragging' : '')}>
                  {selectedField && (
                    <p>
                      {selectedField.label} · 选择插入位置{' '}
                      <button onClick={() => setFieldPath('')}>取消选择</button>
                    </p>
                  )}
                  {dropHint && (
                    <p className="layout-move-reason" role="status">
                      {dropHint}
                    </p>
                  )}
                  {empty && (
                    <button onClick={() => setPicker({ source: text, root: true })}>
                      选择根容器
                    </button>
                  )}
                  {canvas(root)}
                </div>
              ) : (
                <section className="layout-live" aria-label="真实表单预览">
                  <LayoutLivePreview
                    key={formPath + ':' + key}
                    formPath={formPath}
                    profile={key}
                    text={
                      overlay?.base === text && overlay.path === node?.path ? overlay.text : text
                    }
                  />
                </section>
              )}
            </div>
          </div>
        )}
        <Drawer.Root
          open={inspecting && !!node}
          closeOnOutsideClick={false}
          swipeDirection="right"
          onOpenChange={(open, details) => {
            if (open) return;
            details.cancel();
            if (moving) return;
            beforeLeave(() => {
              setInspecting(false);
              setDrawerPreview(false);
              setDestination('');
              setError('');
            });
          }}
        >
          <Drawer.Portal>
            <Drawer.Backdrop />
            <Drawer.Viewport>
              <Drawer.Popup
                className="layout-editor-drawer layout-property-drawer"
                initialFocus={drawerClose}
                finalFocus={() => (inspectorTrigger?.isConnected ? inspectorTrigger : false)}
              >
                {node && (
                  <>
                    <header className="layout-drawer-header">
                      <div>
                        <Drawer.Title className="layout-drawer-title">
                          {itemTitle === materialId ? materialTitle || itemTitle : itemTitle}
                        </Drawer.Title>
                        <Drawer.Description>
                          {parentNode ? nodeName(m, parentNode) + ' / ' : ''}
                          {materialId ? <code>{materialId}</code> : '视图大纲'}
                        </Drawer.Description>
                      </div>
                      <div className="layout-drawer-actions">
                        <Button
                          variant="text"
                          disabled={moving}
                          onClick={() => beforeLeave(() => locate(node.path))}
                        >
                          <Icon name="FileText" />在 JSON 中定位
                        </Button>
                        <Drawer.Close
                          render={<Button ref={drawerClose} variant="text" disabled={moving} />}
                        >
                          关闭
                        </Drawer.Close>
                      </div>
                    </header>
                    <div className="layout-drawer-body">
                      <section className="layout-inspector" aria-label="节点设置">
                        {error && <p role="alert">{error}</p>}
                        {readOnly ? (
                          <JsonEditor text={m.raw(node)} label="布局节点配置" />
                        ) : (
                          <>
                            {m.str(child(node, 'material')) && !m.ambiguous.has(node.path) && (
                              <LayoutMaterialInspector
                                key={node.path + text}
                                result={inspectorMaterial}
                                footer={drawerFooter}
                                preview={
                                  materialId === 'text-input' && (
                                    <details
                                      className="layout-inspector-preview"
                                      open={drawerPreview}
                                      onToggle={(event) =>
                                        setDrawerPreview(event.currentTarget.open)
                                      }
                                    >
                                      <summary>试填表单</summary>
                                      {drawerPreview && (
                                        <LayoutLivePreview
                                          formPath={formPath}
                                          profile={key}
                                          text={
                                            overlay?.base === text && overlay.path === node.path
                                              ? overlay.text
                                              : text
                                          }
                                        />
                                      )}
                                    </details>
                                  )
                                }
                                fields={candidatesFor(node)}
                                {...{ node, m, text }}
                                apply={(next) => {
                                  const restoreFocus = drawerFooter?.contains(
                                    document.activeElement,
                                  );
                                  apply(next);
                                  if (restoreFocus) {
                                    requestAnimationFrame(() =>
                                      drawerClose.current?.focus({ preventScroll: true }),
                                    );
                                  }
                                }}
                                verification={layoutExpressionContext(formPath, m, node)}
                                locate={(path) => beforeLeave(() => locate(path))}
                                onPreview={setOverlay}
                                verify={(next) => check(next, node.path)}
                              />
                            )}
                            <fieldset
                              className="layout-structure-settings"
                              disabled={pendingOwner !== null}
                            >
                              {item?.parent && (
                                <section className="layout-inspector-group" aria-label="节点位置">
                                  <h4>节点位置</h4>
                                  <div className="layout-move">
                                    <Field.Root>
                                      <Field.Label htmlFor="layout-move-target">移动到</Field.Label>
                                      <StudioSelect
                                        id="layout-move-target"
                                        aria-label="移动到"
                                        disabled={pendingOwner !== null || moving}
                                        value={target ? destination : ''}
                                        onValueChange={setDestination}
                                      >
                                        <option value="">选择位置</option>
                                        {destinations
                                          .filter(({ problem }) => !problem)
                                          .map(({ pos, id }) => (
                                            <option key={id} value={id}>
                                              {destinationName(pos)}
                                            </option>
                                          ))}
                                        {destinations
                                          .filter(({ problem }) => problem)
                                          .map(({ pos, id }) => (
                                            <option key={id} value={id} disabled>
                                              {destinationName(pos)} · 受限
                                            </option>
                                          ))}
                                      </StudioSelect>
                                    </Field.Root>
                                    <Button
                                      variant="secondary"
                                      disabled={!target || !!target.problem || moving}
                                      onClick={() =>
                                        target &&
                                        !target.problem &&
                                        void move(node.path, target.pos)
                                      }
                                    >
                                      移动节点
                                    </Button>
                                    {target?.problem && (
                                      <p role="status" className="layout-move-reason">
                                        {target.problem}
                                      </p>
                                    )}
                                  </div>
                                </section>
                              )}
                              {!m.ambiguous.has(node.path) && (
                                <LayoutScopeInspector
                                  key={'scope:' + node.path + text}
                                  m={m}
                                  formPath={formPath}
                                  node={node}
                                  fields={candidatesFor(node)}
                                  locate={locate}
                                  container={
                                    !!slots.get(m.str(child(node, 'material')) ?? '')?.length
                                  }
                                  commit={async (next, path) => {
                                    await check(next, path);
                                    apply(next);
                                    selectNode(path);
                                  }}
                                />
                              )}
                            </fieldset>
                          </>
                        )}
                      </section>
                    </div>
                    <div className="layout-drawer-footer" ref={setDrawerFooter} />
                  </>
                )}
              </Drawer.Popup>
            </Drawer.Viewport>
          </Drawer.Portal>
        </Drawer.Root>
        <Drawer.Root
          open={!!dialog}
          swipeDirection="right"
          onOpenChange={(open) => {
            if (!open) setDialog(undefined);
          }}
        >
          <Drawer.Portal>
            <Drawer.Backdrop />
            <Drawer.Viewport>
              <Drawer.Popup
                className="layout-editor-drawer layout-settings-drawer"
                finalFocus={() => (layoutTrigger?.isConnected ? layoutTrigger : false)}
              >
                <header className="layout-drawer-header">
                  <div>
                    <Drawer.Title className="layout-drawer-title">
                      {dialog
                        ? { new: '新建布局', copy: '复制布局', rename: '修改名称' }[dialog]
                        : '布局设置'}
                    </Drawer.Title>
                    <p>名称用于识别布局，key 在配置中保持稳定</p>
                  </div>
                  <Drawer.Close render={<Button variant="text" />}>关闭</Drawer.Close>
                </header>
                <div className="layout-drawer-body">
                  {dialog && (
                    <form
                      className="layout-settings-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        try {
                          const k = dialog === 'rename' ? key : draftKey.trim();
                          const next = editLayout(m, dialog, k, name, key);
                          apply(next);
                          selectLayout(k);
                          setDialog(undefined);
                        } catch (reason) {
                          setError(errorText(reason));
                        }
                      }}
                    >
                      <label>
                        布局 key
                        <Input
                          required
                          maxLength={120}
                          value={draftKey}
                          disabled={dialog === 'rename'}
                          onChange={(e) => setKey(e.target.value)}
                        />
                      </label>
                      <label>
                        显示名称
                        <Input required value={name} onChange={(e) => setName(e.target.value)} />
                      </label>
                      {error && <p role="alert">{error}</p>}
                      <footer>
                        <Button type="submit">确认布局</Button>
                      </footer>
                    </form>
                  )}
                </div>
              </Drawer.Popup>
            </Drawer.Viewport>
          </Drawer.Portal>
        </Drawer.Root>
        {activePicker && root && (
          <LayoutMaterialPicker
            fields={candidatesFor(
              activePicker.position ? m.byPath.get(activePicker.position.parent)! : root,
            )}
            verification={layoutExpressionContext(
              formPath,
              m,
              activePicker.position ? m.byPath.get(activePicker.position.parent)! : root,
            )}
            rootOnly={activePicker.root}
            preferredField={activePicker.preferred}
            onClose={() => setPicker(undefined)}
            onInsert={async (raw) => {
              const p = activePicker.position;
              const next = p ? insertLayoutNode(m, p, raw, slots) : m.replace(root, raw);
              const inserted = p
                ? p.parent + '/slots/' + escapeKey(p.slot) + '/' + p.index
                : root.path;
              await check(next, inserted);
              apply(next);
              setPicker(undefined);
              setInspectorTrigger(undefined);
              selectNode(inserted);
            }}
          />
        )}
      </section>
    </LayoutFieldStructure.Provider>
  );
}
