'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ScopeBinder } from '@form-engine/protocol/definition';
import { FieldPicker, fieldsFromSchema } from '../components/field-picker';
import { JsonEditor } from '../components/json/json-editor';
import {
  Button,
  EditorViewSwitch,
  Input,
  type EditorView,
} from '@form-engine/studio-design-components';
import { StudioSelect } from '@form-engine/studio-design-components/select';
import { Modal } from './modal';
import {
  reactionFields,
  scopeBinders,
  removedScopeInUse,
  scopeUsageLabels,
} from './reaction-fields';
import './reaction-fields.css';

function defaultMemberAlias(path: string) {
  const field = path.split('/').at(-1)?.replaceAll('~1', '/').replaceAll('~0', '~') ?? '';
  const name = field.replace(/[^\p{L}\p{N}_]+/gu, '_').replace(/^_+|_+$/g, '');
  return name ? (/^\p{N}/u.test(name) ? 'item_' + name : name) : 'item';
}

type ScopeProps = {
  schema: unknown;
  rule: unknown;
  checkRemovedScope?: boolean;
  onChange: (scope: ScopeBinder | undefined) => Promise<void>;
  compactSummary?: boolean;
  scopeJson?: string;
  onApplyJson?: (raw: string) => Promise<void>;
  validate?: (scope: ScopeBinder | undefined) => Promise<void>;
};
export function ScopeEditor({
  schema,
  rule,
  onChange,
  checkRemovedScope = true,
  compactSummary,
  scopeJson,
  onApplyJson,
  validate,
}: ScopeProps) {
  const scope = rule && typeof rule === 'object' && 'scope' in rule ? rule.scope : undefined;
  const declarations = scopeBinders(scope);
  const current = declarations[0];
  const simple =
    declarations.length === 0 ||
    (!Array.isArray(scope) &&
      declarations.length === 1 &&
      current?.mode === 'each' &&
      current.from?.source === 'data' &&
      current.from.scope === undefined);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<EditorView>('form');
  const [json, setJson] = useState('null');
  const [mode, setMode] = useState<'root' | 'each'>('root');
  const [aliasOverride, setAliasOverride] = useState<string>();
  const [path, setPath] = useState<string>();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [validation, setValidation] = useState<{ candidate: string; error?: string }>();
  const fields = useMemo(() => reactionFields(schema), [schema]);
  const arrays = useMemo(
    () =>
      fields.filter(
        (f) =>
          f.schema &&
          typeof f.schema === 'object' &&
          'type' in f.schema &&
          f.schema.type === 'array' &&
          !('prefixItems' in f.schema),
      ),
    [fields],
  );
  const sourceFields = useMemo(() => {
    const allowed = new Set(arrays.map((field) => field.ref.path));
    return fieldsFromSchema(schema, {
      getDisabledReason: (field) =>
        allowed.has(field.ref.path) ? undefined : '请选择可逐项遍历的数组',
    });
  }, [arrays, schema]);
  const alias = aliasOverride ?? defaultMemberAlias(path ?? '');
  const valid =
    mode === 'root' || (arrays.some((field) => field.ref.path === path) && !!alias.trim());
  const next = useMemo<ScopeBinder | undefined>(
    () =>
      mode === 'each' && valid && path !== undefined
        ? { from: { source: 'data', path }, as: alias, mode: 'each' }
        : undefined,
    [mode, path, alias, valid],
  );
  const changed = next?.as !== current?.as || next?.from.path !== current?.from.path;
  const candidate = JSON.stringify(next ?? null);
  const removed = checkRemovedScope && valid ? removedScopeInUse(scope, next, rule) : undefined;
  const impact =
    !compactSummary || removed === undefined
      ? undefined
      : '切换后，作用域 ' +
        removed +
        ' 的引用将失效：' +
        scopeUsageLabels(rule, removed).join('、') +
        '。';
  useEffect(() => {
    if (!open || view !== 'form' || !valid || !changed || !validate || impact) return;
    let active = true;
    const timer = setTimeout(() => {
      void validate(next).then(
        () => {
          if (active) setValidation({ candidate });
        },
        (e) => {
          if (active)
            setValidation({
              candidate,
              error: e instanceof Error ? e.message : '无法核验作用域。',
            });
        },
      );
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, view, valid, changed, validate, impact, next, candidate]);
  const preflight =
    !!validate && valid && changed && !impact && validation?.candidate !== candidate;
  const warning =
    impact ?? (validation?.candidate === candidate ? validation.error : undefined) ?? error;
  function close() {
    setOpen(false);
  }
  function configure() {
    setView(simple ? 'form' : 'json');
    setJson(scopeJson ?? JSON.stringify(scope ?? null));
    setMode(current ? 'each' : 'root');
    setAliasOverride(current?.as);
    setPath(current?.from?.path ?? (compactSummary ? undefined : arrays[0]?.ref.path));
    setError('');
    setValidation(undefined);
    setOpen(true);
  }
  function switchView(nextView: EditorView) {
    if (nextView === 'json') {
      setJson(
        mode === 'root'
          ? 'null'
          : JSON.stringify(
              {
                from: { source: 'data', path },
                as: alias,
                mode: 'each',
              },
              null,
              2,
            ),
      );
    } else {
      try {
        const value = JSON.parse(json);
        if (value === null) {
          setMode('root');
        } else if (
          value &&
          !Array.isArray(value) &&
          value.mode === 'each' &&
          typeof value.as === 'string' &&
          value.from?.source === 'data' &&
          (value.from.path === undefined || typeof value.from.path === 'string') &&
          Object.keys(value).every((key) => ['from', 'as', 'mode'].includes(key)) &&
          Object.keys(value.from).every((key) => ['source', 'path'].includes(key))
        ) {
          setMode('each');
          setAliasOverride(value.as);
          setPath(value.from.path);
        } else {
          setError('此作用域无法在表单中表示，请继续使用 JSON 编辑。');
          return;
        }
      } catch {
        setError('请先修正作用域 JSON。');
        return;
      }
    }
    setValidation(undefined);
    setError('');
    setView(nextView);
  }
  async function applyJson() {
    if (checking || !onApplyJson) return;
    setChecking(true);
    setError('');
    try {
      await onApplyJson(json);
      close();
    } catch (error) {
      setError(error instanceof Error ? error.message : '无法应用作用域 JSON。');
    } finally {
      setChecking(false);
    }
  }
  async function apply() {
    if (
      checking ||
      !valid ||
      impact ||
      preflight ||
      (validation?.candidate === candidate && validation.error)
    )
      return;
    if (removed !== undefined) {
      setError('请先处理仍在使用作用域 ' + removed + ' 的观察、条件或动作。');
      return;
    }
    setChecking(true);
    setError('');
    try {
      if (changed) await onChange(next);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法核验作用域。');
    } finally {
      setChecking(false);
    }
  }
  const fieldsForm = (
    <fieldset className="reaction-scope-form" disabled={checking}>
      <div className="reaction-scope-field">
        <StudioSelect
          aria-label="执行范围"
          value={mode}
          disabled={checking}
          onValueChange={(value) => {
            if (value !== 'root' && value !== 'each') return;
            setError('');
            setValidation(undefined);
            setMode(value);
          }}
        >
          <option value="root">整张表单</option>
          <option value="each">按数组逐项执行</option>
        </StudioSelect>
      </div>
      {mode === 'each' && (
        <section className="reaction-scope-source" aria-labelledby="reaction-scope-source-title">
          <div className="reaction-scope-source-fields">
            <div className="reaction-scope-field">
              <span id="reaction-scope-source-title">来源数组</span>
              <FieldPicker
                label={path === undefined ? '选择来源数组' : path || '表单根'}
                fields={sourceFields}
                value={path === undefined ? null : { source: 'data', path }}
                onChange={(ref) => {
                  if (ref.path !== path) {
                    setValidation(undefined);
                    setPath(ref.path);
                  }
                }}
              />
            </div>
            <label className="reaction-scope-alias">
              成员名称
              <Input
                value={alias}
                onChange={(e) => {
                  setError('');
                  setValidation(undefined);
                  setAliasOverride(e.target.value);
                }}
              />
            </label>
          </div>
        </section>
      )}
      {warning && (
        <p className="reaction-scope-warning" role="alert">
          {warning}
        </p>
      )}
    </fieldset>
  );
  const actions = (
    <div className="reaction-scope-actions">
      <Button
        type="button"
        disabled={
          checking ||
          (view === 'form' &&
            (!valid ||
              preflight ||
              !!impact ||
              !!(validation?.candidate === candidate && validation.error)))
        }
        aria-label="应用范围"
        aria-busy={checking || (view === 'form' && preflight)}
        className="reaction-scope-apply"
        onClick={() => void (view === 'json' ? applyJson() : apply())}
      >
        {checking || (view === 'form' && preflight) ? '检查中…' : '应用范围'}
      </Button>
    </div>
  );
  const dialog = open && (
    <Modal
      title="配置执行范围"
      onClose={close}
      closeDisabled={checking}
      size="standard"
      closeLabel="取消"
      className="reaction-scope-dialog"
      toolbar={
        onApplyJson && (
          <EditorViewSwitch
            value={view}
            onChange={switchView}
            formDisabled={checking}
            jsonDisabled={checking}
          />
        )
      }
      actions={actions}
    >
      {view === 'json' ? (
        <>
          <p>
            使用 <code>null</code> 表示整张表单。
          </p>
          <JsonEditor
            label="作用域 JSON"
            initialMode="text"
            text={json}
            readOnly={checking}
            onChange={(raw) => {
              setJson(raw);
              setError('');
            }}
          />
          {error && (
            <p className="reaction-scope-warning" role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        fieldsForm
      )}
    </Modal>
  );
  if (compactSummary) {
    const label = current && fields.find((f) => f.ref.path === current.from?.path)?.title;
    return (
      <div>
        <div className="reaction-scope-summary">
          <h3>执行范围</h3>
          <Button
            variant="secondary"
            disabled={checking}
            aria-haspopup="dialog"
            onClick={configure}
          >
            <span className="reaction-scope-value">
              {!current
                ? '整张表单'
                : simple
                  ? (label ?? current.from.path) + ' · 逐个成员'
                  : '自定义作用域（' + declarations.length + ' 项）'}
            </span>
            <span>{simple ? '更改范围' : '编辑 JSON'}</span>
          </Button>
        </div>
        {dialog}
      </div>
    );
  }
  return (
    <div className="reaction-scope">
      <div>
        {declarations.length
          ? declarations.map((binder, i) => (
              <div key={i}>
                <code>
                  {binder?.from?.scope ?? '表单根'} · {binder?.from?.path || '（自身）'}
                </code>{' '}
                → <strong>{String(binder?.as ?? '？')}</strong>（
                {binder?.mode === 'each' ? '逐成员' : '单个位置'}）
              </div>
            ))
          : '整张表单'}
      </div>
      {simple ? (
        <Button type="button" variant="secondary" onClick={configure}>
          配置作用域
        </Button>
      ) : (
        <small>使用作用域 JSON 编辑有序绑定。</small>
      )}
      {dialog}
    </div>
  );
}
