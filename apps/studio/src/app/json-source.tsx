'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@form-engine/studio-design-components/controls';
import { SchemaNavigation, usePendingNavigation, useSchemaNavigation } from './schema-navigation';
import { ConstraintEditor } from './constraint-editor';
import { ReactionEditor } from './reaction-editor';
import { LayoutEditor } from './layout-editor';
import { DataSchemaEditor, useSchemaPosition } from './data-schema-editor';
import { JsonEditor, JsonEditorView, useJsonHistory } from '../components/json/json-editor';
import { Modal } from './modal';
import { semanticModel } from './semantic-model';
import { compactJson, displayJson } from '../components/json/format';

const modules = {
  schema: { label: '字段', key: 'data' },
  layout: { label: '布局', key: 'views' },
  reaction: { label: '联动', key: 'reactions' },
  validation: { label: '校验', key: 'constraints' },
} as const;
type Module = keyof typeof modules;

export type SourceFocus = { path: string; revision: number; section?: Module };

type Props = {
  initialSection?: Module;
  formPath: string;
  profile: string;
  onProfile: (key: string) => void;
  text: string;
  readOnly: boolean;
  onPendingChange?: (value: boolean) => void;
  onChange: (text: string) => void;
  renderActions?: React.ComponentProps<typeof JsonEditorView>['renderActions'];
  focusPath?: SourceFocus;
  pickingReference?: boolean;
};

export function JsonSource(props: Props) {
  return (
    <SchemaNavigation text={props.text} onPendingChange={props.onPendingChange}>
      <SourceViews key={props.formPath} {...props} />
    </SchemaNavigation>
  );
}

function SourceViews({
  initialSection,
  formPath,
  profile,
  onProfile,
  text,
  readOnly,
  onChange,
  focusPath,
  pickingReference,
  renderActions,
}: Props) {
  const history = useJsonHistory(text, readOnly ? undefined : onChange);
  const { beforeLeave, pendingOwner } = useSchemaNavigation();
  const [section, setSection] = useState<Module>(initialSection ?? 'schema');
  const [mode, setMode] = useState<'schema' | 'json'>(focusPath ? 'json' : 'schema');
  const seenFocus = useRef(focusPath);
  const [focus, setFocus] = useState(focusPath);
  useEffect(() => {
    if (seenFocus.current === focusPath) return;
    seenFocus.current = focusPath;
    if (focusPath)
      beforeLeave(() => {
        if (focusPath.section) {
          setSection(focusPath.section);
          setMode('schema');
        } else {
          setFocus(focusPath);
          setMode('json');
        }
      });
  }, [beforeLeave, focusPath]);
  const [repair, setRepair] = useState(0);
  const [fragment, setFragment] = useState<{ path: string; trigger?: HTMLElement }>();
  const position = useSchemaPosition();
  function locate(path: string) {
    if (!path) return;
    const active = document.activeElement;
    const trigger = active instanceof HTMLElement ? active : undefined;
    beforeLeave(() => setFragment({ path, trigger }));
  }
  function switchMode(next: typeof mode) {
    if (next !== mode) beforeLeave(() => setMode(next));
  }
  return (
    <>
      <nav className="workbench-tabs semantic-tabs" aria-label="配置编辑视图">
        {Object.entries(modules).map(([id, { label }]) => (
          <button
            key={id}
            type="button"
            aria-pressed={mode === 'schema' && section === id}
            onClick={() =>
              beforeLeave(() => {
                setSection(id as Module);
                setMode('schema');
              })
            }
          >
            {label}
          </button>
        ))}
        <div className="configuration-source-actions">
          {!readOnly && (
            <>
              <Button
                variant="text"
                disabled={pendingOwner !== null || !history.canUndo}
                onClick={() => history.undo()}
                aria-label="撤销"
              >
                撤销
              </Button>
              <Button
                variant="text"
                disabled={pendingOwner !== null || !history.canRedo}
                onClick={() => history.redo()}
                aria-label="重做"
              >
                重做
              </Button>
            </>
          )}
          <button
            className="source-toggle"
            type="button"
            aria-pressed={mode === 'json'}
            onClick={() => switchMode(mode === 'json' ? 'schema' : 'json')}
          >
            {mode === 'json' ? '返回' + modules[section].label : 'JSON 原文'}
          </button>
        </div>
      </nav>
      <JsonEditorView
        history={history}
        hideHistoryActions
        renderAlternative={
          mode === 'json'
            ? undefined
            : section === 'layout'
              ? (commit) => (
                  <LayoutEditor
                    key={String(readOnly)}
                    readOnly={readOnly}
                    {...{ formPath, profile, onProfile, text }}
                    apply={commit}
                    locate={locate}
                    repair={() => {
                      setRepair((n) => n + 1);
                      setMode('json');
                    }}
                  />
                )
              : section === 'reaction'
                ? (commit) => (
                    <ReactionEditor
                      pickingReference={pickingReference}
                      key={String(readOnly)}
                      readOnly={readOnly}
                      {...{ formPath, profile }}
                      text={text}
                      apply={commit}
                      locate={locate}
                      repair={() => {
                        setRepair((n) => n + 1);
                        setMode('json');
                      }}
                    />
                  )
                : section === 'validation'
                  ? (commit) => (
                      <ConstraintEditor
                        pickingReference={pickingReference}
                        key={String(readOnly)}
                        readOnly={readOnly}
                        {...{ formPath, profile, text }}
                        apply={commit}
                        repair={() => {
                          setRepair((n) => n + 1);
                          setMode('json');
                        }}
                      />
                    )
                  : (commit) => (
                      <DataSchemaEditor
                        key={String(readOnly)}
                        readOnly={readOnly}
                        position={position}
                        text={text}
                        apply={commit}
                        locate={locate}
                        repair={() => {
                          setRepair((n) => n + 1);
                          switchMode('json');
                        }}
                      />
                    )
        }
        disableMutableTools={pendingOwner !== null}
        textModeRequest={repair}
        renderActions={mode === 'json' ? renderActions : undefined}
        text={text}
        readOnly={readOnly}
        onChange={onChange}
        label="配置原文"
        focusPath={focus}
      />
      {fragment &&
        createPortal(
          <SourceFragment
            text={text}
            readOnly={readOnly}
            {...fragment}
            onClose={() => setFragment(undefined)}
            apply={history.commit}
          />,
          fragment.trigger?.isConnected
            ? (fragment.trigger.closest('[role="dialog"][data-studio-part="drawer"]') ??
                document.body)
            : document.body,
        )}
    </>
  );
}

function readFragment(text: string, path: string) {
  const model = semanticModel(text);
  const node = model.byPath.get(path);
  if (!node || model.ambiguous.has(path))
    throw Error('这个位置无法唯一定位，请通过顶部「JSON 原文」核对。');
  return { model, node, raw: model.raw(node) };
}

function SourceFragment({
  text,
  path,
  trigger,
  readOnly,
  onClose,
  apply,
}: {
  text: string;
  path: string;
  trigger?: HTMLElement;
  readOnly: boolean;
  onClose: () => void;
  apply: (next: string) => void;
}) {
  const [initial] = useState(() => {
    try {
      const { raw } = readFragment(text, path);
      return { raw, value: displayJson(raw) };
    } catch {
      return undefined;
    }
  });
  const original = initial?.raw;
  const [value, setValue] = useState(initial?.value ?? '');
  const [error, setError] = useState('');
  usePendingNavigation(
    'inspector',
    !readOnly && initial && value !== initial.value ? { discard: onClose } : null,
  );
  let valid = false;
  try {
    JSON.parse(value);
    valid = true;
  } catch {
    // The fragment can be temporarily invalid while typing.
  }
  function commit() {
    if (!valid || original === undefined) return;
    try {
      const { model, node, raw } = readFragment(text, path);
      if (raw !== original) throw Error('这段配置已变更，请关闭后重新打开。');
      if (compactJson(value) !== compactJson(original)) apply(model.replace(node, value.trim()));
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : '无法应用这段配置。');
    }
  }
  return (
    <Modal
      title={readOnly ? '查看局部 JSON' : '编辑局部 JSON'}
      size="wide"
      returnFocus={trigger}
      onClose={onClose}
      actions={
        !readOnly &&
        original !== undefined && (
          <Button disabled={!valid} onClick={commit}>
            应用 JSON
          </Button>
        )
      }
    >
      <code>{path}</code>
      {original === undefined ? (
        <p role="status">这个位置无法唯一定位，请通过顶部「JSON 原文」核对。</p>
      ) : (
        <>
          <JsonEditor
            label="局部 JSON"
            text={value}
            initialMode="text"
            readOnly={readOnly}
            onChange={setValue}
          />
          {!valid && <p role="status">请输入有效的 JSON。</p>}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </Modal>
  );
}
