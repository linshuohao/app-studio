'use client';
// 本页物料仅用于 L4 消费验收，不是 materials-react 的正式物料库。
import { useState } from 'react';
import {
  createMaterialRegistry,
  defineMaterial,
  defineMaterialContract,
  defineRequest,
  useMaterialAdapter,
} from '@form-engine/renderer-react';
export const artifact = {
  id: 'l4-browser-fixture',
  platform: 'web',
  digest: `sha256:${'4'.repeat(64)}` as const,
};
const binding = { value: { schema: true } };
export const field = defineMaterialContract<{ label: string; numeric?: boolean }, 'value'>({
  id: 'fixture.input',
  version: '1',
  bindings: binding,
});
function Field() {
  const a = useMaterialAdapter(field),
    value = a.values.value;
  return (
    <label className="block space-y-1">
      {a.props.label}
      <input
        className="block rounded border p-2"
        aria-label={a.props.label}
        value={value.kind === 'value' ? String(value.value ?? '') : ''}
        onChange={(e) => {
          const text = e.target.value;
          a.set(
            'value',
            a.props.numeric && text !== '' && Number.isFinite(Number(text)) ? Number(text) : text,
          );
        }}
      />
      <span className="block text-sm" aria-label={`${a.props.label}校验`}>
        {a.validation.value.status}
      </span>
    </label>
  );
}
export const group = defineMaterialContract({
  id: 'fixture.group',
  version: '1',
  slots: ['default'],
});
function Group() {
  return <section className="space-y-4">{useMaterialAdapter(group).slots.default}</section>;
}
export const row = defineMaterialContract<object, 'value'>({
  id: 'fixture.row',
  version: '1',
  bindings: binding,
});
function Row() {
  const a = useMaterialAdapter(row),
    current = a.values.value;
  const name = current.kind === 'value' ? String(current.value) : '';
  return (
    <div className="flex gap-2" data-testid="insured-row">
      <span>{name}</span>
      <button
        className="rounded border px-2"
        onClick={() =>
          a.command({
            op: 'array.move',
            target: { source: 'data', path: '/rows' },
            item: { $scope: 'insured' },
            position: { kind: 'index', index: 0 },
          })
        }
      >
        移到首位 {name}
      </button>
      <button
        className="rounded border px-2"
        onClick={() =>
          a.command({
            op: 'array.remove',
            target: { source: 'data', path: '/rows' },
            item: { $scope: 'insured' },
          })
        }
      >
        删除 {name}
      </button>
    </div>
  );
}
export const date = defineMaterialContract<object, 'value'>({
  id: 'fixture.date',
  version: '1',
  bindings: binding,
});
function DateField() {
  const a = useMaterialAdapter(date),
    [open, setOpen] = useState(false),
    [draft, setDraft] = useState('');
  const current = a.values.value.kind === 'value' ? String(a.values.value.value) : '';
  return (
    <section>
      <p>
        确认日期：<span data-testid="confirmed-date">{current}</span>
      </p>
      <button
        className="rounded border px-2"
        onClick={() => {
          setDraft(current);
          setOpen(true);
        }}
      >
        选择日期
      </button>
      {open && (
        <div>
          <input
            type="date"
            aria-label="预选日期"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            onClick={() => {
              a.set('value', draft);
              setOpen(false);
            }}
          >
            确认日期
          </button>
          <button onClick={() => setOpen(false)}>取消日期</button>
        </div>
      )}
    </section>
  );
}
const lookup = defineRequest<string, string[]>({
  payloadSchema: { type: 'string' },
  resultSchema: { type: 'array', items: { type: 'string' } },
});
const requestContracts = { search: lookup };
export const search = defineMaterialContract<
  object,
  'value',
  Record<string, never>,
  typeof requestContracts
>({ id: 'fixture.search', version: '1', bindings: binding, requests: requestContracts });
function Search() {
  const a = useMaterialAdapter(search),
    [query, setQuery] = useState(''),
    [options, setOptions] = useState<string[]>([]);
  return (
    <section>
      <label>
        城市查询
        <input
          aria-label="城市查询"
          className="rounded border p-2"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <button
        className="rounded border px-2"
        onClick={() => {
          void a.request('search', query).result.then((result) => {
            if (result.status === 'success') setOptions(result.value);
          });
        }}
      >
        查询城市
      </button>
      {options.map((option) => (
        <button className="rounded border px-2" key={option} onClick={() => a.set('value', option)}>
          {option}
        </button>
      ))}
    </section>
  );
}
export const save = defineMaterialContract<object, never, { click: undefined }>({
  id: 'fixture.save',
  version: '1',
  events: { click: {} },
});
function Save() {
  const a = useMaterialAdapter(save);
  return (
    <button className="rounded border p-2" onClick={() => a.emit('click')}>
      校验并提交
    </button>
  );
}
export const broken = defineMaterialContract({ id: 'fixture.broken', version: '1' });
function Broken(): never {
  throw Error('Fixture render failure');
}
export const fixtureDefinitions = [
  defineMaterial(field, artifact, Field),
  defineMaterial(group, artifact, Group),
  defineMaterial(row, artifact, Row),
  defineMaterial(date, artifact, DateField),
  defineMaterial(search, artifact, Search),
  defineMaterial(save, artifact, Save),
  defineMaterial(broken, artifact, Broken),
];
export const fixtureMaterials = createMaterialRegistry(fixtureDefinitions);
