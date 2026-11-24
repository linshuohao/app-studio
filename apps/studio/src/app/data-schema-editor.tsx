import { Button } from '../components/ui';
import { FieldTree } from '../components/field-tree';
import { JsonEditor } from '../components/json/json-editor';
import { useCallback, useMemo, useRef, useState } from 'react';
import { dataSchemaModel, type DataSchemaModel, type SchemaItem } from './data-schema-model';
import { child } from './semantic-model';
import { SchemaInspector, type SchemaNodeAction } from './schema-inspector';
import { SchemaFieldDrawerNext } from './schema-field-drawer-next';
import { SchemaRules } from './schema-rules';
import { useSchemaNavigation } from './schema-navigation';
import { Modal } from './modal';
import './data-schema.css';

export function useSchemaPosition() {
  const [selection, setSelection] = useState('');
  const [detail, setDetail] = useState(false);
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const scroll = useRef(0);
  const restoreOutline = useCallback((el: HTMLElement | null) => {
    if (el) el.scrollTop = scroll.current;
  }, []);
  function rememberScroll(offset: number) {
    scroll.current = offset;
  }
  return {
    selection,
    setSelection,
    detail,
    setDetail,
    collapsed,
    setCollapsed,
    restoreOutline,
    rememberScroll,
  };
}

type Actions = {
  position: ReturnType<typeof useSchemaPosition>;
  text: string;
  readOnly?: boolean;
  apply: (next: string) => void;
  locate: (path: string) => void;
  repair: () => void;
};

export function DataSchemaEditor({ position, text, apply, locate, repair, readOnly }: Actions) {
  const { beforeLeave } = useSchemaNavigation();
  const [nextDrawer, setNextDrawer] = useState(false);
  const [returnPath, setReturnPath] = useState<string>();
  const [initialAction, setInitialAction] = useState<SchemaNodeAction>();
  const [trigger, setTrigger] = useState<HTMLElement>();
  const outline = useRef<HTMLElement>(null);
  const model = useMemo(() => {
    try {
      return dataSchemaModel(text);
    } catch {
      return undefined;
    }
  }, [text]);
  const {
    selection,
    setSelection,
    detail,
    setDetail,
    collapsed,
    setCollapsed,
    restoreOutline,
    rememberScroll,
  } = position;
  const setOutline = useCallback(
    (element: HTMLElement | null) => {
      outline.current = element;
      restoreOutline(element);
    },
    [restoreOutline],
  );
  function select(path: string) {
    setSelection(path);
    setDetail(true);
    const group = path.startsWith('/data/schema/$defs/') ? 'definitions' : 'structure';
    const ancestors = model?.nodes.filter(
      (row) => row.group === group && path.startsWith(row.node.path + '/'),
    );
    setCollapsed((old) => {
      const next = new Set(old);
      for (const row of ancestors ?? []) next.delete(row.node.path);
      return next;
    });
  }
  if (!model)
    return (
      <div>
        <p>无法读取配置结构，请检查 JSON 原文。</p>
        <button onClick={repair}>{readOnly ? '查看 JSON 原文' : '打开文本修复'}</button>
      </div>
    );
  const schema = model.schema;
  if (!schema) {
    const root = model.byPath.get('')!;
    const data = child(root, 'data');
    const canCreate =
      root.kind === 'object' &&
      (!data || (data.kind === 'object' && !model.ambiguous.has(data.path)));
    return (
      <div>
        <p>当前配置缺少数据模型。</p>
        {!readOnly && canCreate && (
          <button onClick={() => apply(model.createSchema())}>创建数据模型</button>
        )}
        <button className="text-button" onClick={repair}>
          {readOnly ? '查看 JSON 原文' : '打开文本修复'}
        </button>
      </div>
    );
  }
  // JSON may have removed the selected field while the outline was closed.
  const chosen =
    model.nodes.reduce<SchemaItem | undefined>((nearest, row) => {
      const path = row.node.path;
      if (selection !== path && !selection.startsWith(path + '/')) return nearest;
      return !nearest || path.length > nearest.node.path.length ? row : nearest;
    }, undefined) ?? model.nodes[0];
  if (!chosen)
    return <button onClick={repair}>{readOnly ? '查看 JSON 原文' : '打开文本修复'}</button>;
  function rows(model: DataSchemaModel, items: SchemaItem[], label: string) {
    const ancestors: string[] = [];
    const nodes = items.map((item) => {
      const id = model.ambiguous.has(item.node.path)
        ? JSON.stringify([item.node.path, item.node.start])
        : item.node.path;
      const parent = ancestors[item.depth - 1];
      ancestors[item.depth] = id;
      return {
        id,
        parentId: parent,
        label: item.label,
        path: item.node.path,
        metadata: {
          type: child(item.node, '$ref')
            ? '引用'
            : (model.str(child(item.node, 'type')) ??
              (item.node.kind === 'boolean' ? '布尔模型' : '模型')),
          required: item.required,
        },
        item,
      };
    });
    return (
      <FieldTree
        label={label}
        showPath={false}
        nodes={nodes}
        activeId={nodes.find(({ item }) => item.node.start === chosen?.node.start)?.id}
        browseButtonProps={({ item }) => ({ 'data-schema-path': item.node.path })}
        onActivate={({ item }, event) => openEditor(item.node.path, event.currentTarget)}
        isExpanded={(id) => !collapsed.has(id)}
        toggleLabel={(node, open) => (open ? '收起' : '展开') + node.label}
        onToggle={(id) =>
          setCollapsed((old) => {
            const next = new Set(old);
            if (!next.delete(id)) next.add(id);
            return next;
          })
        }
        renderActions={({ item }, { tabIndex }) => {
          if (readOnly || model.ambiguous.has(item.node.path))
            return (
              <Button
                variant="text"
                tabIndex={tabIndex}
                aria-label={'查看 ' + item.label}
                onClick={(event) =>
                  openEditor(item.node.path, event.currentTarget, undefined, true)
                }
              >
                查看
              </Button>
            );
          const children = model.childActions(item.node);
          const named = item.role === 'field' || item.role === 'definition';
          const definition = item.role === 'definition';
          let add: { action: SchemaNodeAction; label: string } | undefined;
          if (children?.field) add = { action: 'field', label: '新增子字段' };
          else if (children?.items) add = { action: 'items', label: '新增数组元素' };
          else if (named)
            add = { action: 'insert', label: definition ? '插入同级定义' : '插入同级字段' };
          const deleteLabel = definition
            ? '删除定义'
            : named
              ? '删除字段'
              : item.node.key === 'items'
                ? '删除数组元素'
                : '删除模型节点';
          return (
            <div className="schema-row-actions">
              {add && (
                <Button
                  variant="text"
                  tabIndex={tabIndex}
                  title={add.label}
                  aria-label={add.label + ' ' + item.label}
                  onClick={(event) => openEditor(item.node.path, event.currentTarget, add.action)}
                >
                  {add.action === 'insert' ? '插入' : '新增'}
                </Button>
              )}
              <Button
                variant="text"
                tabIndex={tabIndex}
                aria-label={'编辑 ' + item.label}
                onClick={(event) =>
                  openEditor(item.node.path, event.currentTarget, undefined, true)
                }
              >
                编辑
              </Button>
              {item.role !== 'root' && (
                <Button
                  variant="text"
                  tabIndex={tabIndex}
                  aria-label={deleteLabel + ' ' + item.label}
                  onClick={(event) => openEditor(item.node.path, event.currentTarget, 'delete')}
                >
                  删除
                </Button>
              )}
            </div>
          );
        }}
      />
    );
  }
  const trail = model.nodes.filter(
    (row) =>
      row.group === chosen.group &&
      row.role !== 'root' &&
      (row.node.path === chosen.node.path || chosen.node.path.startsWith(row.node.path + '/')),
  );
  const breadcrumb = [
    chosen.group === 'definitions' ? '共享定义' : '表单结构',
    ...trail.map((row) => row.label),
  ].join(' › ');
  const unsafe = model.ambiguous.has(chosen.node.path);
  function openEditor(path: string, from?: HTMLElement, action?: SchemaNodeAction, next = !action) {
    setNextDrawer(next);
    setReturnPath(undefined);
    setTrigger(from);
    setInitialAction(action);
    select(path);
  }
  function applyEdit(next: string) {
    const action = initialAction;
    setInitialAction(undefined);
    apply(next);
    if (action === 'delete') {
      setDetail(false);
    } else if (action) {
      setNextDrawer(true);
    }
  }
  return (
    <div className="data-schema">
      {!readOnly && schema.kind === 'object' && !model.ambiguous.has(schema.path) && (
        <div className="schema-outline-actions" inert={detail}>
          {model.childActions(schema).field && (
            <Button onClick={(event) => openEditor(schema.path, event.currentTarget, 'field')}>
              新增字段
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={(event) => openEditor(schema.path, event.currentTarget, 'definition')}
          >
            新增共享定义
          </Button>
        </div>
      )}
      <nav
        ref={setOutline}
        inert={detail}
        onScroll={(event) => {
          rememberScroll(event.currentTarget.scrollTop);
        }}
        className="semantic-outline"
        aria-label="数据模型大纲"
      >
        <h3>表单结构</h3>
        {rows(
          model,
          model.nodes.filter((item) => item.group === 'structure'),
          '表单结构',
        )}
        <h3>共享定义</h3>
        {rows(
          model,
          model.nodes.filter((item) => item.group === 'definitions'),
          '共享定义',
        )}
      </nav>
      {detail && nextDrawer && (
        <SchemaFieldDrawerNext
          key={JSON.stringify([chosen.node.path, text])}
          {...{ model, text, breadcrumb }}
          item={chosen}
          readonly={readOnly}
          returnFocus={trigger}
          returnToField={!!returnPath}
          apply={(next, path) => {
            applyEdit(next);
            if (returnPath) {
              select(returnPath);
              setReturnPath(undefined);
            } else {
              setSelection(path);
              setDetail(false);
              if (path !== chosen.node.path)
                requestAnimationFrame(() => {
                  Array.from(
                    outline.current?.querySelectorAll<HTMLElement>('[data-schema-path]') ?? [],
                  )
                    .find((button) => button.dataset.schemaPath === path)
                    ?.focus({ preventScroll: true });
                });
            }
          }}
          close={() => {
            if (returnPath) {
              select(returnPath);
              setReturnPath(undefined);
            } else setDetail(false);
          }}
          openRelated={(path, next) => {
            if (next && next !== text) applyEdit(next);
            setReturnPath(returnPath ?? chosen.node.path);
            select(path);
          }}
          locate={(path) => beforeLeave(() => locate(path))}
        />
      )}
      {detail && !nextDrawer && (
        <Modal
          title={chosen.label}
          className="workbench-drawer"
          size="wide"
          returnFocus={trigger}
          onClose={() =>
            beforeLeave(() => {
              setDetail(false);
              setInitialAction(undefined);
              if (!trigger?.isConnected) {
                requestAnimationFrame(() =>
                  outline.current
                    ?.querySelector<HTMLElement>('[data-schema-path][aria-pressed="true"]')
                    ?.focus({ preventScroll: true }),
                );
              }
            })
          }
        >
          <section className="semantic-detail" aria-label="数据模型详情">
            <header className="schema-node-heading">
              <small className="schema-location" title={chosen.node.path}>
                {breadcrumb}
              </small>
              <Button
                variant="text"
                title={chosen.node.path}
                onClick={() => locate(chosen.node.path)}
              >
                在 JSON 中定位
              </Button>
            </header>
            {readOnly ? (
              <JsonEditor text={model.raw(chosen.node)} label="字段配置" />
            ) : unsafe ? (
              <p>该位置包含重复属性，请在 JSON 原文中核对。</p>
            ) : (
              <div key={JSON.stringify([chosen.node.path, text])}>
                {initialAction && (
                  <SchemaInspector
                    {...{ text, locate, model }}
                    apply={applyEdit}
                    select={(path) => {
                      setInitialAction(undefined);
                      select(path);
                    }}
                    node={chosen.node}
                    initialAction={initialAction}
                  />
                )}
                <SchemaRules {...{ model, text, locate }} apply={applyEdit} node={chosen.node} />
              </div>
            )}
          </section>
        </Modal>
      )}
    </div>
  );
}
