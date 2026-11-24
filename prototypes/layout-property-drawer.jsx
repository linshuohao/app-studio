import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Button,
  Dialog,
  Drawer,
  Field,
  Icon,
  Input,
  Tabs,
  TreeView,
} from '../apps/studio/src/components/ui';
import { StudioSelect } from '../apps/studio/src/components/ui/select';
import { FieldPicker, fieldsFromSchema } from '../apps/studio/src/components/field-picker';
import { JsonEditor } from '../apps/studio/src/components/json/json-editor';
import { ExpressionEditor, expressionDescription } from '../apps/studio/src/app/expression-editor';
import { checkReactionExpression } from '../apps/studio/src/app/reaction-expression-model';
import { reactionFields } from '../apps/studio/src/app/reaction-fields';
import { defaultLiteral } from '../apps/studio/src/app/manifest-input';
import { manifest } from '../packages/materials-react/src/text-input/manifest';
import { manifest as nonBlankManifest } from '../packages/pure-functions/src/text-is-non-blank/manifest';
import { invoke as isNonBlank } from '../packages/pure-functions/src/text-is-non-blank/implementation';
import '../apps/studio/src/app/studio.css';
import '../apps/studio/src/app/studio-ui.css';
import '../apps/studio/src/components/field-picker/field-picker.css';
import '../apps/studio/src/app/selection-controls.css';
import './layout-property-drawer.css';

const properties = manifest.propsSchema.properties;
const labels = {
  placeholder: '提示文字',
  maxLength: '最长字符数',
  inputMode: '输入方式',
  disabled: '禁用',
  readOnly: '只读',
};
const schema = {
  type: 'object',
  properties: {
    applicant: {
      title: '投保人',
      type: 'object',
      properties: {
        name: { title: '投保人姓名', type: 'string' },
        phone: { title: '联系电话', type: 'string' },
      },
    },
    settings: {
      title: '表单设置',
      type: 'object',
      properties: {
        nameHint: { title: '姓名输入提示', type: 'string' },
        nameLimit: { title: '姓名字符上限', type: 'integer', minimum: 0 },
        locked: { title: '锁定姓名', type: 'boolean' },
      },
    },
  },
};
const sample = {
  '/applicant/name': '林小满',
  '/applicant/phone': '',
  '/settings/nameHint': '请填写证件姓名',
  '/settings/nameLimit': 40,
  '/settings/locked': true,
};
const named = { nameHint: { ref: { source: 'data', path: '/settings/nameHint' } } };
const expressionContext = {
  fields: reactionFields(schema, []),
  named,
  manifests: [nonBlankManifest],
};
const pickerFields = fieldsFromSchema(schema, {
  getDisabledReason: (field) =>
    typeof sample[field.ref.path] === 'string' ? undefined : '文本输入需要绑定文本字段',
});
const destinations = [
  ['name', '投保人姓名 / 默认插槽'],
  ['phone', '联系电话 / 默认插槽'],
];
const initial = { placeholder: '请输入投保人姓名' };
const toRef = (path) => ({ source: 'data', path });
function evaluate(expr) {
  if (!expr || typeof expr !== 'object') return expr;
  if (expr.ref) return sample[expr.ref.path];
  if (expr.use === 'nameHint') return evaluate(named.nameHint);
  if (expr.op === nonBlankManifest.id) return isNonBlank(expr.args.map(evaluate));
  return expr.literal;
}
const valueOf = (value) => (value?.$expr ? evaluate(value.$expr) : value);

function PreviewInput({ draft, disabledLength, label }) {
  return (
    <Field.Root>
      <Field.Label>{label}</Field.Label>
      <Input
        placeholder={valueOf(draft.placeholder) ?? ''}
        readOnly={valueOf(draft.readOnly) === true}
        disabled={valueOf(draft.disabled) === true}
        inputMode={valueOf(draft.inputMode) ?? 'text'}
        maxLength={
          disabledLength || draft.maxLength === undefined
            ? undefined
            : Number(valueOf(draft.maxLength))
        }
      />
    </Field.Root>
  );
}

function Property({ name, value, onChange, onExpression, disabled }) {
  const spec = properties[name];
  const title = labels[name];
  const expression = value?.$expr;
  const id = 'prop-' + name;
  const numeric = name === 'maxLength';
  const invalid =
    numeric &&
    value !== undefined &&
    !expression &&
    (!Number.isInteger(Number(value)) || Number(value) < 0);
  return (
    <Field.Root className="review-property" invalid={invalid}>
      <div className="review-property-head">
        {expression ? <span>{title}</span> : <Field.Label htmlFor={id}>{title}</Field.Label>}
        <Button
          variant="text"
          disabled={disabled}
          onClick={onExpression}
          aria-label={'配置' + title + '的取值'}
        >
          {expression ? '编辑表达式' : '配置取值'}
        </Button>
      </div>
      {expression ? (
        <div className="review-expression-value">
          <Icon name="FunctionSquare" />
          {expressionDescription(expression)}
        </div>
      ) : name === 'inputMode' ? (
        <StudioSelect
          id={id}
          aria-label={title}
          value={value ?? 'text'}
          onValueChange={onChange}
          disabled={disabled}
        >
          <option value="text">文本键盘</option>
          <option value="tel">电话键盘</option>
        </StudioSelect>
      ) : spec.type === 'boolean' ? (
        <label className="review-checkbox">
          <Field.Control
            render={<input type="checkbox" />}
            id={id}
            checked={value === true}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
          />
          {name === 'disabled' ? '禁止输入和修改' : '允许查看，禁止修改'}
        </label>
      ) : (
        <Input
          id={id}
          type={numeric ? 'number' : 'text'}
          min={numeric ? spec.minimum : undefined}
          step={numeric ? 1 : undefined}
          placeholder={numeric ? '不限制' : '未设置'}
          value={value ?? ''}
          disabled={disabled}
          onChange={(event) =>
            onChange(numeric && event.target.value === '' ? undefined : event.target.value)
          }
        />
      )}
      {invalid && <Field.Error match>请输入大于或等于 0 的整数。</Field.Error>}
    </Field.Root>
  );
}

function Review() {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(['root', 'applicant', 'name', 'phone']);
  const [mode, setMode] = useState('layout');
  const [props, setProps] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [binding, setBinding] = useState(toRef('/applicant/name'));
  const [location, setLocation] = useState('name');
  const [destination, setDestination] = useState('');
  const [editing, setEditing] = useState(null);
  const [leave, setLeave] = useState(null);
  const [status, setStatus] = useState('');
  const trigger = useRef(null);
  const fallbackTrigger = useRef(null);
  const expressionTrigger = useRef(null);
  const close = useRef(null);
  const json = useRef(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(props);
  const max = draft.maxLength;
  const invalid =
    max !== undefined && !max?.$expr && (!Number.isInteger(Number(max)) || Number(max) < 0);
  const node = { material: 'text-input', props, bindings: { value: binding } };
  const change = (key, value) => {
    setStatus('');
    setDraft((previous) => {
      const next = { ...previous };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  };
  function navigate(target) {
    setOpen(false);
    setLeave(null);
    setDestination('');
    if (target === 'json') {
      setMode('json');
      requestAnimationFrame(() => json.current?.focus());
    }
  }
  function beforeLeave(target) {
    if (dirty) setLeave(target);
    else navigate(target);
  }
  function openExpression(key, event) {
    expressionTrigger.current = event.currentTarget;
    const current = draft[key];
    setEditing({
      key,
      raw: current?.$expr
        ? JSON.stringify(current.$expr)
        : current === undefined
          ? defaultLiteral(properties[key])
          : JSON.stringify(key === 'maxLength' ? Number(current) : current),
      changed: false,
    });
  }
  let expressionError;
  if (editing?.changed) {
    try {
      expressionError = checkReactionExpression(editing.raw, {
        ...expressionContext,
        expected: properties[editing.key],
      });
    } catch (error) {
      expressionError = error.message;
    }
  }
  const outline = [
    { id: 'root', label: '家庭短期出行投保录入单' },
    { id: 'applicant', label: '投保人', parent: 'root' },
    { id: 'name', label: '投保人姓名', parent: 'applicant' },
    { id: 'phone', label: '联系电话', parent: 'applicant' },
    { id: 'node', label: 'text-input', parent: location, selected: true },
  ];
  return (
    <div className="review-page">
      <header className="review-top">
        默认空间 <span>/</span> 表单 <span>/</span> demo
      </header>
      <main className="review-main" id="studio-main">
        <section data-studio-ui>
          <div className="review-title">
            <h1>配置 · 2026-11-14 #1</h1>
            <span>交互设计稿</span>
          </div>
          <Tabs.Root value={mode} onValueChange={setMode} size="sm">
            <Tabs.List aria-label="配置视图">
              <Tabs.Tab value="layout">布局</Tabs.Tab>
              <Tabs.Tab value="json">JSON</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="layout" keepMounted>
              <div className="review-layout">
                <section className="review-outline">
                  <h2>视图大纲</h2>
                  <TreeView
                    label="视图大纲"
                    nodes={outline}
                    density="compact"
                    isExpanded={(id) => expanded.includes(id)}
                    onToggle={(id) =>
                      setExpanded((current) =>
                        current.includes(id)
                          ? current.filter((key) => key !== id)
                          : [...current, id],
                      )
                    }
                    renderItem={(item, focusProps) =>
                      item.id === 'node' ? (
                        <Button
                          {...focusProps}
                          variant="text"
                          className="review-tree-action"
                          onClick={(event) => {
                            trigger.current = event.currentTarget;
                            setOpen(true);
                          }}
                        >
                          {item.label}
                        </Button>
                      ) : (
                        <span {...focusProps}>{item.label}</span>
                      )
                    }
                  />
                </section>
                <section className="review-canvas">
                  <header>
                    <h2>家庭短期出行投保录入单</h2>
                    <code>desktop</code>
                  </header>
                  <div className="review-canvas-inner">
                    <h3>投保人</h3>
                    <PreviewInput
                      draft={draft}
                      disabledLength={invalid}
                      label={location === 'name' ? '投保人姓名' : '联系电话'}
                    />
                    <Button
                      variant="secondary"
                      ref={fallbackTrigger}
                      onClick={(event) => {
                        trigger.current = event.currentTarget;
                        setOpen(true);
                      }}
                    >
                      文本输入设置
                    </Button>
                  </div>
                </section>
              </div>
            </Tabs.Panel>
            <Tabs.Panel value="json">
              <section className="review-json" ref={json} tabIndex={-1}>
                <h2>布局节点</h2>
                <JsonEditor label="文本输入节点" text={JSON.stringify(node, null, 2)} readOnly />
              </section>
            </Tabs.Panel>
          </Tabs.Root>
        </section>
      </main>
      <Drawer.Root
        open={open}
        swipeDirection="right"
        closeOnOutsideClick={false}
        onOpenChange={(next, details) => {
          if (!next) {
            details.cancel();
            beforeLeave('close');
          }
        }}
      >
        <Drawer.Portal>
          <Drawer.Backdrop className="review-backdrop" />
          <Drawer.Viewport>
            <Drawer.Popup
              className="review-drawer"
              initialFocus={close}
              finalFocus={() =>
                mode === 'layout'
                  ? trigger.current?.isConnected
                    ? trigger.current
                    : fallbackTrigger.current
                  : false
              }
            >
              <header className="review-drawer-head">
                <div>
                  <Drawer.Title>文本输入</Drawer.Title>
                  <Drawer.Description>
                    投保人 / {location === 'name' ? '投保人姓名' : '联系电话'} /{' '}
                    <code>text-input</code>
                  </Drawer.Description>
                </div>
                <div className="review-actions">
                  <Button variant="text" onClick={() => beforeLeave('json')}>
                    <Icon name="FileText" />在 JSON 中定位
                  </Button>
                  <Drawer.Close render={<Button ref={close} variant="text" />}>关闭</Drawer.Close>
                </div>
              </header>
              <div className="review-scroll">
                <section aria-labelledby="review-display">
                  <h3 id="review-display">显示与选项</h3>
                  <div className="review-grid">
                    {Object.keys(labels).map((name) => (
                      <Property
                        key={name}
                        name={name}
                        value={draft[name]}
                        onChange={(value) => change(name, value)}
                        onExpression={(event) => openExpression(name, event)}
                      />
                    ))}
                  </div>
                </section>
                <details className="review-preview">
                  <summary>试填文本输入</summary>
                  <PreviewInput draft={draft} disabledLength={invalid} label="示例输入" />
                </details>
                <section className="review-section" aria-labelledby="review-binding">
                  <h3 id="review-binding">数据绑定</h3>
                  <fieldset disabled={dirty} className="review-binding">
                    <div>
                      <strong>
                        {
                          expressionContext.fields.find((field) => field.ref.path === binding.path)
                            ?.title
                        }
                      </strong>
                      <code>{binding.path}</code>
                    </div>
                    <FieldPicker
                      label="更换绑定字段"
                      fields={pickerFields}
                      value={binding}
                      showPath
                      onChange={(ref) => {
                        setBinding(ref);
                        setStatus('已更新绑定字段');
                      }}
                    />
                  </fieldset>
                </section>
                <section className="review-section" aria-labelledby="review-move">
                  <h3 id="review-move">节点位置</h3>
                  <fieldset disabled={dirty} className="review-move">
                    <Field.Root>
                      <Field.Label htmlFor="review-destination">移动到</Field.Label>
                      <StudioSelect
                        id="review-destination"
                        aria-label="移动到"
                        value={destination}
                        onValueChange={setDestination}
                        disabled={dirty}
                      >
                        <option value="">选择位置</option>
                        {destinations.map(([key, label]) => (
                          <option value={key} key={key} disabled={key === location}>
                            {label}
                            {key === location ? '（当前位置）' : ''}
                          </option>
                        ))}
                      </StudioSelect>
                    </Field.Root>
                    <Button
                      variant="secondary"
                      disabled={!destination || dirty}
                      onClick={() => {
                        setLocation(destination);
                        setDestination('');
                        setStatus('已移动节点');
                      }}
                    >
                      移动节点
                    </Button>
                  </fieldset>
                </section>
              </div>
              <footer className="review-footer" hidden={!dirty && !status}>
                <span role="status">{dirty ? '属性预览中，尚未应用' : status}</span>
                {dirty && (
                  <>
                    <Button
                      variant="text"
                      onClick={() => {
                        setDraft(props);
                        setStatus('已还原属性');
                      }}
                    >
                      还原
                    </Button>
                    <Button
                      disabled={invalid}
                      onClick={() => {
                        const next = { ...draft };
                        if (typeof next.maxLength === 'string')
                          next.maxLength = Number(next.maxLength);
                        setProps(next);
                        setDraft(next);
                        setStatus('属性已应用到工作草稿');
                      }}
                    >
                      应用属性
                    </Button>
                  </>
                )}
              </footer>
              {editing && (
                <Dialog.Root
                  open
                  onOpenChange={(next) => {
                    if (!next) setEditing(null);
                  }}
                >
                  <Dialog.Portal>
                    <Dialog.Backdrop className="review-dialog-backdrop" />
                    <Dialog.Popup className="review-dialog" finalFocus={expressionTrigger}>
                      <Dialog.Title>{labels[editing.key]}的取值</Dialog.Title>
                      <ExpressionEditor
                        {...expressionContext}
                        label={labels[editing.key]}
                        expected={properties[editing.key]}
                        allowValidation={false}
                        raw={editing.raw}
                        onChange={(raw) => setEditing({ ...editing, raw, changed: true })}
                      />
                      {expressionError && <p role="alert">{expressionError}</p>}
                      <div className="review-actions">
                        <Dialog.Close render={<Button variant="text" />}>取消</Dialog.Close>
                        <Button
                          disabled={!editing.changed || !!expressionError}
                          onClick={() => {
                            const value = JSON.parse(editing.raw);
                            change(
                              editing.key,
                              typeof value === 'object' && value !== null
                                ? { $expr: value }
                                : value,
                            );
                            setStatus('');
                            setEditing(null);
                          }}
                        >
                          应用取值
                        </Button>
                      </div>
                    </Dialog.Popup>
                  </Dialog.Portal>
                </Dialog.Root>
              )}
              {leave && (
                <Dialog.Root
                  open
                  onOpenChange={(next) => {
                    if (!next) setLeave(null);
                  }}
                >
                  <Dialog.Portal>
                    <Dialog.Backdrop className="review-dialog-backdrop" />
                    <Dialog.Popup className="review-dialog">
                      <Dialog.Title>放弃未应用的属性修改？</Dialog.Title>
                      <Dialog.Description>本次属性修改会恢复到上次应用的值。</Dialog.Description>
                      <div className="review-actions">
                        <Dialog.Close render={<Button variant="secondary" />}>
                          继续编辑
                        </Dialog.Close>
                        <Button
                          onClick={() => {
                            setDraft(props);
                            navigate(leave);
                          }}
                        >
                          放弃修改
                        </Button>
                      </div>
                    </Dialog.Popup>
                  </Dialog.Portal>
                </Dialog.Root>
              )}
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}

createRoot(document.getElementById('drawer-review')).render(<Review />);
