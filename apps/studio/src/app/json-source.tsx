'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@form-engine/studio-design-components/controls';
import { SchemaNavigation, useSchemaNavigation } from './schema-navigation';
import { ConstraintEditor } from './constraint-editor';
import { ReactionEditor } from './reaction-editor';
import { LayoutEditor } from './layout-editor';
import { DataSchemaEditor, useSchemaPosition } from './data-schema-editor';
import { JsonEditorView, useJsonHistory } from '../components/json/json-editor';

const modules = {
  schema: { label: '字段', key: 'data' },
  layout: { label: '布局', key: 'views' },
  reaction: { label: '联动', key: 'reactions' },
  validation: { label: '校验', key: 'constraints' },
} as const;
type Module = keyof typeof modules;

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
  focusPath?: { path: string; revision: number };
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
        setFocus(focusPath);
        setMode('json');
      });
  }, [beforeLeave, focusPath]);
  const [repair, setRepair] = useState(0);
  const position = useSchemaPosition();
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
                    locate={(path) => {
                      setFocus({ path, revision: Date.now() });
                      setMode('json');
                    }}
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
                      locate={(path) => {
                        setFocus({ path, revision: Date.now() });
                        setMode('json');
                      }}
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
                        locate={(path) => {
                          beforeLeave(() => {
                            setFocus({ path, revision: Date.now() });
                            setMode('json');
                          });
                        }}
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
    </>
  );
}
