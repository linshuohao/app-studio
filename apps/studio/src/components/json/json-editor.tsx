'use client';
import { createPortal } from 'react-dom';
import { Button } from '../ui/controls';
import { StudioSelect } from '../ui/select';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal } from '../../app/modal';
import { compactJson, displayJson } from './format';
import {
  addNode,
  editNode,
  parseJson,
  removeNode,
  valueToken,
  type JsonKind,
  type JsonNode,
} from './model';
const labels: Record<JsonKind, string> = {
  object: '对象',
  array: '数组',
  string: '文本',
  number: '数字',
  boolean: '布尔值',
  null: '空值',
};
type Selection = {
  node: JsonNode;
  parent?: JsonNode;
  add?: boolean;
  source: string;
  trigger?: HTMLElement;
};
export type JsonValidation =
  | { status: 'valid' }
  | { status: 'invalid'; message: string }
  | { status: 'unchecked'; reason: 'size-limit' };

type EditorProps = {
  text: string;
  label?: string;
  textModeRequest?: number;
  renderAlternative?: (commit: (text: string) => void) => ReactNode;
  renderActions?: (change: (text: string) => void, disabled: boolean) => ReactNode;
  disableMutableTools?: boolean;
  hideHistoryActions?: boolean;
  initialMode?: 'tree' | 'text';
  focusPath?: { path: string; revision: number };
  onValidityChange?: (valid: boolean) => void;
  size?: 'regular' | 'compact';
  toolbarExtra?: ReactNode;
  onValidationChange?: (result: JsonValidation) => void;
} & (
  | { readOnly?: true; onChange?: (text: string) => void }
  | { readOnly: boolean; onChange: (text: string) => void }
);

export function useJsonHistory(text: string, onChange?: (text: string) => void) {
  const [undo, setUndo] = useState<string[]>([]);
  const [redo, setRedo] = useState<string[]>([]);
  return {
    canUndo: undo.length > 0,
    canRedo: redo.length > 0,
    commit(next: string) {
      if (!onChange || next === text) return;
      setUndo((h) => [...h.slice(-29), text]);
      setRedo([]);
      onChange(next);
    },
    undo() {
      if (!onChange || !undo.length) return;
      setRedo((h) => [...h, text]);
      onChange(undo[undo.length - 1]);
      setUndo((h) => h.slice(0, -1));
    },
    redo() {
      if (!onChange || !redo.length) return;
      setUndo((h) => [...h, text]);
      onChange(redo[redo.length - 1]);
      setRedo((h) => h.slice(0, -1));
    },
  };
}

export function JsonEditor(props: EditorProps) {
  const history = useJsonHistory(props.text, props.onChange);
  return <JsonEditorView {...props} history={history} />;
}

export function JsonEditorView({
  text,
  readOnly = true,
  label = 'JSON 内容',
  renderActions,
  disableMutableTools = false,
  hideHistoryActions = false,
  renderAlternative,
  textModeRequest,
  initialMode = 'tree',
  focusPath,
  onValidityChange,
  onValidationChange,
  size = 'regular',
  toolbarExtra,
  history,
}: EditorProps & { history: ReturnType<typeof useJsonHistory> }) {
  const id = useId(),
    region = useRef<HTMLDivElement>(null);
  const compact = size === 'compact';
  const [tool, setTool] = useState<string>();
  const [mode, setMode] = useState<'tree' | 'text'>(initialMode);
  const [fold, setFold] = useState<{ expanded?: boolean; revision: number }>({ revision: 0 });
  const [selection, setSelection] = useState<Selection>();
  const [kind, setKind] = useState<JsonKind>('string'),
    [value, setValue] = useState(''),
    [key, setKey] = useState(''),
    [error, setError] = useState('');
  const [importing, setImporting] = useState(false),
    [importText, setImportText] = useState(''),
    [copied, setCopied] = useState(false);
  const formattedText = useMemo(() => displayJson(text), [text]);
  const [formattedSource, setFormattedSource] = useState<string>();
  const visibleText = readOnly || formattedSource === text ? formattedText : text;
  const validation = useMemo<JsonValidation>(() => {
    try {
      compactJson(text);
      return { status: 'valid' };
    } catch (reason) {
      return reason instanceof RangeError
        ? { status: 'unchecked', reason: 'size-limit' }
        : { status: 'invalid', message: 'JSON 语法无效，已保留完整原文。' };
    }
  }, [text]);
  const parsed = useMemo<{ tokens?: string[]; root?: JsonNode; error?: string }>(() => {
    if (mode !== 'tree') return {};
    try {
      return parseJson(text);
    } catch (reason) {
      return { error: reason instanceof Error ? reason.message : 'JSON 格式错误' };
    }
  }, [text, mode]);
  const valid = validation.status === 'valid';
  useEffect(() => onValidationChange?.(validation), [validation, onValidationChange]);
  useEffect(() => onValidityChange?.(valid), [valid, onValidityChange]);
  useEffect(() => {
    if (focusPath) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 外部诊断定位请求到达时展开树并切换模式，保留当前编辑文本。
      setMode('tree');
      setTool(undefined);
      setError('');
      setFold((f) => ({ expanded: true, revision: f.revision + 1 }));
    }
  }, [focusPath]);
  useEffect(() => {
    if (!focusPath || mode !== 'tree') return;
    const match = Array.from(
      region.current?.querySelectorAll<HTMLElement>('[data-json-path]') ?? [],
    )
      .filter((el) => el.dataset.jsonPath === focusPath.path)
      .at(-1);
    if (!match && region.current?.querySelector('[data-json-path]') && fold.expanded) {
      setError('路径已不存在：' + (focusPath.path || '/'));
    }
    match?.scrollIntoView({ block: 'center' });
    match?.focus();
  }, [focusPath, mode, fold]);
  useEffect(() => {
    if (textModeRequest) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 文本修复入口切换同一编辑器的模式并保留历史。
      setMode('text');
      setTool(undefined);
    }
  }, [textModeRequest]);
  function commit(next: string) {
    if (readOnly) return;
    history.commit(next);
    setError('');
  }
  function change(next: string) {
    commit(displayJson(next));
  }
  function open(node: JsonNode, parent?: JsonNode, add = false) {
    setSelection({
      node,
      parent,
      add,
      source: text,
      trigger: document.activeElement instanceof HTMLElement ? document.activeElement : undefined,
    });
    setKind(add ? 'string' : node.kind);
    setKey(add ? '' : (node.key ?? ''));
    setValue(
      add
        ? ''
        : node.kind === 'string'
          ? (JSON.parse(parsed.tokens![node.start]) as string)
          : node.children
            ? displayJson(parsed.tokens!.slice(node.start, node.end).join(''))
            : (parsed.tokens?.slice(node.start, node.end).join('') ?? ''),
    );
    setError('');
  }
  function apply() {
    try {
      if (!selection || !parsed.tokens) return;
      if (selection.source !== text) throw new Error('内容已变化，请关闭后重新选择节点。');
      const { node, parent, add } = selection;
      if (
        !add &&
        parent?.kind === 'object' &&
        key !== node.key &&
        parent.children?.some((c) => c.key === key)
      )
        throw new Error('同名属性已存在。');
      const token =
        !add &&
        kind === node.kind &&
        kind === 'string' &&
        JSON.parse(parsed.tokens[node.start]) === value
          ? parsed.tokens.slice(node.start, node.end).join('')
          : valueToken(kind, value);
      change(
        add ? addNode(parsed.tokens, node, token, key) : editNode(parsed.tokens, node, token, key),
      );
      setSelection(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '修改失败');
    }
  }
  function remove(node: JsonNode, parent: JsonNode) {
    if (!window.confirm(`删除 ${node.key ?? '节点'} 及其内容？`)) return;
    const siblings = parent.children ?? [];
    const index = siblings.indexOf(node);
    const next = siblings[index + 1];
    const focus =
      next && parent.kind === 'array' ? node.path : (next ?? siblings[index - 1] ?? parent).path;
    change(removeNode(parsed.tokens!, parent, node));
    requestAnimationFrame(() =>
      region.current
        ?.querySelector<HTMLElement>('[data-json-path="' + CSS.escape(focus) + '"]')
        ?.focus(),
    );
  }
  function finishTool() {
    setTool(undefined);
    if (compact) document.getElementById(id + '-action')?.focus();
  }
  function applyImport() {
    try {
      const compact = compactJson(importText);
      change(compact);
      setImporting(false);
      finishTool();
    } catch (reason) {
      setError(
        reason instanceof RangeError
          ? '内容超过阅读上限（1 MiB）。'
          : 'JSON 格式无效，请检查引号、逗号和括号。',
      );
    }
  }
  const selectedTool =
    compact &&
    !renderAlternative &&
    (tool === 'copy' || (!readOnly && tool && !(tool === 'import' && disableMutableTools)))
      ? tool
      : undefined;
  const actionSelect = compact && !renderAlternative;
  function chooseTool(next: string) {
    setError('');
    setCopied(false);
    if (next === 'tree' || next === 'text') {
      if (next === 'text') setFormattedSource(text);
      setMode(next);
      setTool(undefined);
    } else {
      if (next === 'import') setImportText('');
      setTool(next);
    }
  }
  const actions = (
    <>
      {!renderAlternative &&
        (!actionSelect ? mode === 'text' : selectedTool === 'format') &&
        !readOnly && (
          <button
            type="button"
            className="quiet"
            onClick={() => {
              try {
                change(compactJson(text));
                if (compact) {
                  setMode('text');
                  finishTool();
                }
                setError('');
              } catch {
                setError('JSON 格式无效，当前原文已保留。');
              }
            }}
          >
            格式化 JSON
          </button>
        )}
      {!renderAlternative && mode === 'tree' && !selectedTool && (
        <div className="action-row">
          <button
            type="button"
            className="text-button"
            onClick={() => setFold((f) => ({ expanded: true, revision: f.revision + 1 }))}
          >
            全部展开
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setFold((f) => ({ expanded: false, revision: f.revision + 1 }))}
          >
            全部折叠
          </button>
        </div>
      )}
      {!readOnly && (
        <>
          {!renderAlternative && !actionSelect && (
            <button
              type="button"
              className="quiet"
              disabled={disableMutableTools}
              onClick={() => {
                setImporting(true);
                setImportText('');
                setError('');
              }}
            >
              导入 JSON
            </button>
          )}
          {!hideHistoryActions && (!actionSelect || selectedTool === 'undo') && (
            <button
              type="button"
              className="quiet"
              disabled={disableMutableTools || !history.canUndo}
              onClick={() => {
                history.undo();
                finishTool();
              }}
            >
              撤销
            </button>
          )}
          {!hideHistoryActions && (!actionSelect || selectedTool === 'redo') && (
            <button
              type="button"
              className="quiet"
              disabled={disableMutableTools || !history.canRedo}
              onClick={() => {
                history.redo();
                finishTool();
              }}
            >
              重做
            </button>
          )}
        </>
      )}
      {!renderAlternative && (!actionSelect || selectedTool === 'copy') && (
        <button
          type="button"
          className="text-button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(displayJson(text));
              setCopied(true);
            } catch {
              setError('复制失败，请在文本视图中手动复制。');
            }
          }}
        >
          复制 JSON
        </button>
      )}
    </>
  );
  return (
    <div className="json-component" data-json-size={size}>
      {(!renderAlternative ||
        toolbarExtra ||
        (!readOnly && (!hideHistoryActions || renderActions))) && (
        <div className="json-toolbar" role="group" aria-label={label + '工具栏'}>
          {!readOnly && renderActions?.(change, disableMutableTools)}
          {!renderAlternative && !compact && (
            <>
              <div className="action-row" aria-label="JSON 显示方式">
                {(['tree', 'text'] as const).map((m) => (
                  <button
                    type="button"
                    key={m}
                    className="quiet"
                    aria-pressed={mode === m}
                    onClick={() => {
                      if (m === 'text') setFormattedSource(text);
                      setMode(m);
                    }}
                  >
                    {m === 'tree'
                      ? readOnly
                        ? '层级查看'
                        : '层级编辑'
                      : readOnly
                        ? '格式化文本'
                        : '文本查看 / 修复'}
                  </button>
                ))}
              </div>
            </>
          )}
          {actionSelect ? (
            <>
              <label htmlFor={id + '-action'}>操作</label>
              <StudioSelect
                id={id + '-action'}
                value={selectedTool ?? mode}
                onValueChange={chooseTool}
              >
                <option value="tree">{readOnly ? '层级查看' : '层级编辑'}</option>
                <option value="text">{readOnly ? '查看文本' : '编辑文本'}</option>
                {!readOnly && (
                  <option value="import" disabled={disableMutableTools}>
                    导入 JSON
                  </option>
                )}
                {!readOnly && <option value="format">格式化 JSON</option>}
                {!readOnly && !hideHistoryActions && (
                  <option value="undo" disabled={disableMutableTools || !history.canUndo}>
                    撤销
                  </option>
                )}
                {!readOnly && !hideHistoryActions && (
                  <option value="redo" disabled={disableMutableTools || !history.canRedo}>
                    重做
                  </option>
                )}
                <option value="copy">复制 JSON</option>
              </StudioSelect>
            </>
          ) : (
            actions
          )}
          {toolbarExtra}
          <span role="status">{copied ? '已复制' : ''}</span>
        </div>
      )}
      {actionSelect && (
        <div className="json-compact-action">
          {selectedTool === 'import' ? (
            <>
              <label htmlFor={id + '-paste'}>粘贴 JSON</label>
              <textarea
                id={id + '-paste'}
                rows={4}
                value={importText}
                spellCheck={false}
                onChange={(e) => setImportText(e.target.value)}
              />
              <Button disabled={!importText.trim() || disableMutableTools} onClick={applyImport}>
                校验并导入
              </Button>
            </>
          ) : (
            actions
          )}
        </div>
      )}
      {!valid && (
        <p role="alert" className="page-error">
          {validation.status === 'invalid'
            ? validation.message
            : '内容超过 1 MiB，未检查语法，仍可查看完整原文。'}
        </p>
      )}
      {selectedTool ? null : renderAlternative ? (
        renderAlternative(commit)
      ) : mode === 'text' ? (
        <textarea
          id={id}
          aria-label={label}
          name="jsonText"
          value={visibleText}
          rows={compact ? Math.min(7, Math.max(3, visibleText.split('\n').length)) : undefined}
          style={
            compact
              ? undefined
              : {
                  height: Math.min(480, Math.max(120, (visibleText.split('\n').length + 1) * 22)),
                }
          }
          readOnly={readOnly}
          spellCheck={false}
          wrap="off"
          onChange={(e) => commit(e.target.value)}
          onPaste={(event) => {
            const field = event.currentTarget;
            if (readOnly || field.selectionStart !== 0 || field.selectionEnd !== visibleText.length)
              return;
            try {
              const pasted = compactJson(event.clipboardData.getData('text/plain'));
              event.preventDefault();
              change(pasted);
            } catch {
              /* Preserve incomplete text for explicit repair. */
            }
          }}
        />
      ) : (
        <div ref={region} className="json-tree" role="region" aria-label={label} translate="no">
          {parsed.root && parsed.tokens ? (
            <JsonBranch
              key={fold.revision}
              node={parsed.root}
              tokens={parsed.tokens}
              depth={0}
              expanded={fold.expanded}
              readOnly={readOnly}
              focusPath={focusPath?.path}
              edit={open}
              remove={remove}
            />
          ) : (
            <p>
              {parsed.error ?? '请检查 JSON 内容。'}{' '}
              <button type="button" className="text-button" onClick={() => setMode('text')}>
                显示原文
              </button>
            </p>
          )}
        </div>
      )}
      {error && !selection && !importing && <p role="alert">{error}</p>}
      {selection &&
        createPortal(
          <Modal
            wide={kind === 'object' || kind === 'array'}
            returnFocus={selection.trigger}
            title={selection.add ? '添加节点' : '编辑节点'}
            onClose={() => setSelection(undefined)}
          >
            <form
              className="authoring-fields"
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                apply();
              }}
            >
              <p className="muted">
                路径：{selection.node.path || '/'}
                {selection.add ? ' / 新节点' : ''}
              </p>
              {(selection.add
                ? selection.node.kind === 'object'
                : selection.parent?.kind === 'object') && (
                <>
                  <label htmlFor={id + '-key'}>属性名称</label>
                  <input id={id + '-key'} value={key} onChange={(e) => setKey(e.target.value)} />
                </>
              )}
              <label htmlFor={id + '-kind'}>值类型</label>
              <StudioSelect
                id={id + '-kind'}
                value={kind}
                onValueChange={(value) => {
                  setKind(value as JsonKind);
                  setValue(
                    value === 'boolean'
                      ? 'false'
                      : value === 'object'
                        ? '{}\n'
                        : value === 'array'
                          ? '[]\n'
                          : '',
                  );
                }}
              >
                {Object.entries(labels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </StudioSelect>
              {kind === 'string' || kind === 'number' ? (
                <>
                  <label htmlFor={id + '-value'}>值</label>
                  {kind === 'string' ? (
                    <textarea
                      id={id + '-value'}
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                    />
                  ) : (
                    <input
                      id={id + '-value'}
                      inputMode="decimal"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      required
                    />
                  )}
                </>
              ) : kind === 'object' || kind === 'array' ? (
                <>
                  <label htmlFor={id + '-value'}>
                    {kind === 'object' ? '对象 JSON' : '数组 JSON'}
                  </label>
                  <textarea
                    id={id + '-value'}
                    className="json-object-input"
                    style={{
                      height: Math.min(420, Math.max(160, value.split('\n').length * 22 + 26)),
                    }}
                    value={value}
                    wrap="off"
                    spellCheck={false}
                    onChange={(event) => setValue(event.target.value)}
                  />
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => {
                      try {
                        setValue(displayJson(valueToken(kind, value)));
                        setError('');
                      } catch (reason) {
                        setError(reason instanceof Error ? reason.message : 'JSON 格式无效');
                      }
                    }}
                  >
                    格式化节点 JSON
                  </button>
                  <p className="muted">
                    可整块修改此节点；应用时校验对象或数组，保存时去除字符串外空白。
                  </p>
                </>
              ) : kind === 'boolean' ? (
                <>
                  <label htmlFor={id + '-value'}>值</label>
                  <StudioSelect
                    id={id + '-value'}
                    value={value}
                    onValueChange={(value) => setValue(value)}
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </StudioSelect>
                </>
              ) : (
                <p>该节点的值为 null。</p>
              )}
              {!selection.add && kind !== selection.node.kind && selection.node.children && (
                <p>更改类型将替换当前节点及全部子节点；可通过撤销恢复。</p>
              )}
              {error && <p role="alert">{error}</p>}
              <button type="submit">应用修改</button>
            </form>
          </Modal>,
          document.body,
        )}
      {importing &&
        createPortal(
          <Modal title="导入 JSON" onClose={() => setImporting(false)}>
            <form
              className="authoring-fields"
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                applyImport();
              }}
            >
              <label htmlFor={id + '-import'}>粘贴 JSON</label>
              <textarea
                id={id + '-import'}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                required
                spellCheck={false}
              />
              <p>校验通过后替换当前内容，可通过撤销恢复。</p>
              {error && <p role="alert">{error}</p>}
              <button type="submit">校验并导入</button>
            </form>
          </Modal>,
          document.body,
        )}
    </div>
  );
}
function JsonBranch({
  node,
  parent,
  tokens,
  depth,
  expanded,
  readOnly,
  focusPath,
  edit,
  remove,
}: {
  node: JsonNode;
  parent?: JsonNode;
  tokens: string[];
  depth: number;
  expanded?: boolean;
  readOnly: boolean;
  focusPath?: string;
  edit: (node: JsonNode, parent?: JsonNode, add?: boolean) => void;
  remove: (node: JsonNode, parent: JsonNode) => void;
}) {
  const [open, setOpen] = useState(expanded ?? depth < 2);
  const value = (
    <>
      <span className="json-key">
        {node.key !== undefined ? JSON.stringify(node.key) + ': ' : ''}
      </span>
      {node.children ? (
        <>
          <span>{node.kind === 'object' ? '{' : '['}</span>
          <span className="json-count">
            {node.children.length} {node.kind === 'object' ? '个属性' : '项'}
          </span>
          <span>{node.kind === 'object' ? '}' : ']'}</span>
        </>
      ) : (
        <span className={node.kind === 'string' ? 'json-string' : 'json-value'}>
          {tokens[node.start]}
        </span>
      )}
    </>
  );
  const controls = !readOnly && (
    <span className="json-node-actions">
      <button
        type="button"
        className="text-button"
        aria-label={'编辑 ' + (node.path || '/')}
        onClick={() => edit(node, parent)}
      >
        编辑
      </button>
      {node.children && (
        <button
          type="button"
          className="text-button"
          aria-label={'添加到 ' + (node.path || '/')}
          onClick={() => edit(node, parent, true)}
        >
          添加
        </button>
      )}
      {parent && (
        <button
          type="button"
          className="text-button"
          aria-label={'删除 ' + node.path}
          onClick={() => remove(node, parent)}
        >
          删除
        </button>
      )}
    </span>
  );
  return (
    <div
      className={focusPath === node.path ? 'json-node json-highlight' : 'json-node'}
      data-json-path={node.path}
      tabIndex={-1}
    >
      <div className="json-node-row">
        {node.children ? (
          <button
            type="button"
            className="json-toggle"
            aria-expanded={open}
            aria-label={(open ? '折叠 ' : '展开 ') + (node.path || '/')}
            onClick={() => setOpen(!open)}
          >
            <span aria-hidden="true">{open ? '▾' : '▸'}</span> {value}
          </button>
        ) : (
          <span className="json-leaf">{value}</span>
        )}
        {controls}
      </div>
      {open && node.children && (
        <div className="json-children">
          {node.children.map((child, index) => (
            <JsonBranch
              key={index}
              node={child}
              parent={node}
              tokens={tokens}
              depth={depth + 1}
              expanded={expanded}
              readOnly={readOnly}
              focusPath={focusPath}
              edit={edit}
              remove={remove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
