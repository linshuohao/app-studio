import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Input, Select } from '../apps/studio/src/components/ui';
import { FieldPicker, fieldsFromSchema } from '../apps/studio/src/components/field-picker';
import '../apps/studio/src/components/field-picker/field-picker.css';

import { valueAsExpression } from '../apps/studio/src/app/reaction-expression-model';
import { ExpressionEditor } from '../apps/studio/src/app/expression-editor';
import { reactionFields } from '../apps/studio/src/app/reaction-fields';
import { createCoreFunctions } from '@form-engine/pure-functions';

const ref = (path) => ({ source: 'data', path });
const target = ref('/policy/amount'),
  array = ref('/insured');
const schema = {
  type: 'object',
  title: '投保表单',
  properties: {
    policy: {
      type: 'object',
      title: '保单信息',
      properties: {
        amount: { type: 'number', title: '保额' },
        premium: { type: 'number', title: '保费' },
      },
    },
    insured: {
      type: 'array',
      title: '被保人名单',
      items: { type: 'object', properties: { name: { type: 'string', title: '姓名' } } },
    },
  },
};
const names = {
  set: '设置字段',
  patch: '更新对象',
  remove: '删除属性',
  'array.insert': '插入成员',
  'array.remove': '移除成员',
  'array.move': '移动成员',
  'host.emit': '通知宿主',
  batch: '批量命令',
};
const labels = {
  '/policy': '保单信息',
  '/policy/amount': '保额',
  '/policy/premium': '保费',
  '/insured': '被保人名单',
};
const numeric = ['/policy/amount', '/policy/premium'];
const members = { current: '当前被保人', anchor: '参照被保人' };
function fresh(op) {
  const fixtures = {
    set: { op, target, value: 500000 },
    patch: { op, target: ref('/policy'), value: { amount: 500000 } },
    remove: { op, target: ref('/policy/premium') },
    'array.insert': {
      op,
      target: array,
      position: { kind: 'index', index: 0 },
      value: { name: '王明' },
    },
    'array.remove': { op, target: array, item: { $scope: 'current' } },
    'array.move': {
      op,
      target: array,
      item: { $scope: 'current' },
      position: { kind: 'after', item: { $scope: 'anchor' } },
    },
    'host.emit': { type: op, event: 'policy.updated' },
    batch: {
      op,
      commands: [
        { op: 'set', target, value: 500000 },
        { op: 'remove', target: ref('/policy/premium') },
      ],
    },
  };
  return structuredClone(fixtures[op]);
}
const rowKeys = new WeakMap();
let nextKey = 0;
function rowKey(c) {
  if (!rowKeys.has(c)) rowKeys.set(c, ++nextKey);
  return rowKeys.get(c);
}
const kind = (a) => a.op || a.type;
function valueLabel(value) {
  const expr = value?.$expr;
  if (expr?.ref) return labels[expr.ref.path] ?? expr.ref.path;
  if (expr?.op || expr?.use) return expr.op ?? expr.use;
  const literal = expr?.literal ?? expr ?? value;
  return typeof literal === 'number' ? literal.toLocaleString('zh-CN') : JSON.stringify(literal);
}
function summary(a) {
  const target = labels[a.target?.path];
  const where =
    a.position?.kind === 'index'
      ? '下标 ' + a.position.index
      : (members[a.position?.item?.$scope] ?? '') +
        (a.position?.kind === 'before' ? '之前' : '之后');
  switch (kind(a)) {
    case 'set':
      return '将' + target + '设为 ' + valueLabel(a.value);
    case 'patch':
      return (
        '更新' +
        target +
        ' · ' +
        Object.keys(a.value)
          .map((k) => schema.properties.policy.properties[k]?.title ?? k)
          .join('、')
      );
    case 'remove':
      return '删除' + target;
    case 'array.move':
      return '将' + members[a.item.$scope] + '移到' + where;
    case 'array.insert':
      return '在' + target + '的' + where + '插入成员';
    case 'array.remove':
      return '从' + target + '移除' + members[a.item.$scope];
    case 'host.emit':
      return '通知宿主 · ' + a.event;
    case 'batch':
      return '顺序执行 ' + a.commands.length + ' 条命令';
  }
}
function Choice({ label, choices, value, onChange }) {
  return (
    <div className="line">
      <span>{label}</span>
      <Select.Root value={value} onValueChange={onChange}>
        <Select.Trigger aria-label={label}>
          <Select.Value>{(v) => choices[v]}</Select.Value>
          <Select.Icon />
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner>
            <Select.Popup>
              <Select.List>
                {Object.entries(choices).map(([v, text]) => (
                  <Select.Item key={v} value={v}>
                    <Select.ItemText>{text}</Select.ItemText>
                    <Select.ItemIndicator />
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
function Pick({ label, value, onChange, paths }) {
  const fields = fieldsFromSchema(schema, {
    getDisabledReason: (f) => (paths.includes(f.ref.path) ? undefined : '此处不能选择该字段'),
  });
  return (
    <div className="line">
      <span>{label}</span>
      <FieldPicker label={label} fields={fields} value={value} onChange={onChange} />
    </div>
  );
}
const fields = reactionFields(schema);
const manifests = Object.values(
  createCoreFunctions({
    id: 'action-draft',
    platform: 'web',
    digest: 'sha256:' + '5'.repeat(64),
  }),
).map((binding) => binding.manifest);

function PropertyValues({ value, onChange, shape }) {
  const [key, setKey] = useState('');
  const properties = shape?.properties ?? {};
  const name = key.trim();
  const valid =
    name && !['$expr', '$literal', '__proto__'].includes(name) && !Object.hasOwn(value, name);
  return (
    <div className="stack">
      {Object.entries(value).map(([k, v]) => (
        <div className="child" key={k}>
          <ActionValue
            label={properties[k]?.title || k}
            value={v}
            expected={properties[k]}
            onChange={(next) => onChange({ ...value, [k]: next })}
          />
          <Button
            variant="text"
            onClick={() => {
              const next = { ...value };
              delete next[k];
              onChange(next);
            }}
          >
            移除属性
          </Button>
        </div>
      ))}
      <div className="row">
        <label>
          属性名
          <Input value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
        <Button
          variant="secondary"
          disabled={!valid}
          onClick={() => {
            const prop = properties[name];
            onChange({ ...value, [name]: prop?.type === 'number' ? 0 : '' });
            setKey('');
          }}
        >
          添加属性
        </Button>
      </div>
    </div>
  );
}
function ActionValue({ label, value, expected, onChange }) {
  return (
    <ExpressionEditor
      label={label}
      raw={valueAsExpression(JSON.stringify(value))}
      fields={fields}
      manifests={manifests}
      expected={expected}
      advisory
      compactArguments
      onChange={(raw) => onChange({ $expr: JSON.parse(raw) })}
    />
  );
}
function Editor({ a, update }) {
  const op = kind(a),
    change = (part) => update({ ...a, ...part });
  const [childType, setChild] = useState('set');
  if (op === 'batch')
    return (
      <div className="stack">
        <p>子命令按列表顺序执行。后续命令失败时，已完成的修改保留。</p>
        {a.commands.map((c, i) => (
          <details className="child" key={rowKey(c)}>
            <summary>
              {i + 1}. {summary(c)}
            </summary>
            <div className="row">
              <Button
                variant="text"
                disabled={!i}
                onClick={() => {
                  let v = [...a.commands];
                  [v[i - 1], v[i]] = [v[i], v[i - 1]];
                  change({ commands: v });
                }}
              >
                上移
              </Button>
              <Button
                variant="text"
                onClick={() => change({ commands: a.commands.filter((_, j) => i !== j) })}
              >
                移除
              </Button>
            </div>
            <Editor
              a={c}
              update={(next) => {
                rowKeys.set(next, rowKey(c));
                change({ commands: a.commands.map((v, j) => (i === j ? next : v)) });
              }}
            />
          </details>
        ))}
        <div className="row">
          <Choice
            label="子命令类型"
            choices={Object.fromEntries(Object.entries(names).filter(([k]) => k !== 'host.emit'))}
            value={childType}
            onChange={setChild}
          />
          <Button
            variant="secondary"
            onClick={() => change({ commands: [...a.commands, fresh(childType)] })}
          >
            添加子命令
          </Button>
        </div>
      </div>
    );
  return (
    <div className="stack">
      {a.target && (
        <Pick
          label={op.startsWith('array.') ? '目标数组' : '目标字段'}
          paths={
            op === 'patch'
              ? ['/policy']
              : op.startsWith('array.')
                ? ['/insured']
                : op === 'set'
                  ? numeric
                  : Object.keys(labels)
          }
          value={a.target}
          onChange={(target) => change({ target })}
        />
      )}
      {op === 'set' && (
        <ActionValue
          label="写入值"
          value={a.value}
          expected={{ type: 'number' }}
          onChange={(value) => change({ value })}
        />
      )}
      {op === 'patch' && (
        <PropertyValues
          shape={schema.properties.policy}
          value={a.value}
          onChange={(value) => change({ value })}
        />
      )}
      {op === 'array.insert' && (
        <ActionValue
          label="新成员"
          value={a.value}
          expected={schema.properties.insured.items}
          onChange={(value) => change({ value })}
        />
      )}
      {a.item && (
        <Choice
          label={op === 'array.move' ? '被移动的成员' : '被移除的成员'}
          choices={members}
          value={a.item.$scope}
          onChange={(v) =>
            change({
              item: { $scope: v },
              ...(a.position?.item?.$scope === v ? { position: { kind: 'index', index: 0 } } : {}),
            })
          }
        />
      )}
      {a.position && (
        <>
          <Choice
            label="目的位置"
            choices={{ index: '指定下标', before: '成员之前', after: '成员之后' }}
            value={a.position.kind}
            onChange={(k) =>
              change({
                position:
                  k === 'index'
                    ? { kind: k, index: 0 }
                    : {
                        kind: k,
                        item: { $scope: a.item?.$scope === 'anchor' ? 'current' : 'anchor' },
                      },
              })
            }
          />
          {a.position.kind === 'index' ? (
            <label>
              下标（从 0 开始）
              <Input
                type="number"
                required
                min={0}
                step={1}
                value={a.position.index}
                onChange={(e) =>
                  change({
                    position: {
                      kind: 'index',
                      index: e.target.value === '' ? '' : Number(e.target.value),
                    },
                  })
                }
              />
            </label>
          ) : (
            <Choice
              label="参照成员"
              choices={Object.fromEntries(
                Object.entries(members).filter(([k]) => k !== a.item?.$scope),
              )}
              value={a.position.item.$scope}
              onChange={(v) => change({ position: { kind: a.position.kind, item: { $scope: v } } })}
            />
          )}
        </>
      )}
      {op === 'host.emit' && (
        <>
          <label>
            事件名
            <Input required value={a.event} onChange={(e) => change({ event: e.target.value })} />
          </label>
          {'payload' in a ? (
            <>
              <ActionValue
                label="消息内容"
                value={a.payload}
                onChange={(payload) => change({ payload })}
              />
              <Button
                variant="text"
                onClick={() => {
                  const { payload, ...rest } = a;
                  update(rest);
                }}
              >
                移除消息内容
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => change({ payload: { amount: 500000 } })}>
              添加消息内容
            </Button>
          )}
        </>
      )}
    </div>
  );
}
function App() {
  const [applied, save] = useState(() => fresh('set'));
  const [draft, edit] = useState(applied);
  const [revision, reset] = useState(0);
  const [notice, report] = useState('');
  function update(action) {
    edit(action);
    report('');
  }
  function apply(event) {
    event.preventDefault();
    save(draft);
    report('已应用');
  }
  function cancel() {
    edit(applied);
    reset((n) => n + 1);
    report('已恢复上次应用的动作');
  }
  return (
    <main>
      <header>
        <small>Studio Design Handbook / 业务组件草案</small>
        <h1>
          ActionEditor <span>动作配置</span>
        </h1>
      </header>
      <form
        onSubmit={apply}
        onInvalidCapture={(event) => {
          for (let node = event.target.parentElement; node; node = node.parentElement)
            if (node.tagName === 'DETAILS') node.open = true;
        }}
      >
        <Choice
          label="动作类型"
          choices={names}
          value={kind(draft)}
          onChange={(type) => update(type === kind(applied) ? applied : fresh(type))}
        />
        <Editor key={kind(draft) + revision} a={draft} update={update} />
        <footer>
          <output role="status">{notice}</output>
          <Button variant="secondary" onClick={cancel}>
            取消
          </Button>
          <Button type="submit">应用</Button>
        </footer>
      </form>
      <details className="protocol">
        <summary>查看已应用的动作 JSON</summary>
        <pre>{JSON.stringify(applied, null, 2)}</pre>
      </details>
    </main>
  );
}
createRoot(document.getElementById('root')).render(<App />);
