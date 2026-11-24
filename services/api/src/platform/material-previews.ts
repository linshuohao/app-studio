import type { FormDefinition, ViewNode } from '@form-engine/protocol/definition';
import type { JsonValue } from '@form-engine/protocol';
import type { ReadonlyPreparedForm } from '@form-engine/protocol/prepared';
import { remoteSelectManifest } from '@form-engine/materials-react/manifests';
import { checkWebConfig } from './web-check.js';

// Isolated gallery examples use the same manifests, Compiler and Renderer as form previews.
const ref = (path: string) => ({ source: 'data' as const, path });
const text: ViewNode = {
  material: 'text-input',
  props: { placeholder: '请输入姓名', maxLength: 40 },
  bindings: { value: ref('/name') },
};
const field: ViewNode = {
  material: 'field',
  props: { label: '姓名', help: '请填写证件上的姓名', requiredMark: true },
  bindings: { value: ref('/name') },
  slots: { default: [text] },
};
const amount: ViewNode = {
  material: 'value-display',
  props: { value: 12800, format: 'moneyMinor' },
};
const examples: Record<string, ViewNode> = {
  'array-editor': {
    material: 'array-editor',
    props: { title: '同行人', initial: { name: '' } },
    bindings: { value: ref('/people') },
  },
  'text-input': field,
  'number-input': {
    material: 'field',
    props: { label: '出行人数' },
    bindings: { value: ref('/count') },
    slots: {
      default: [
        {
          material: 'number-input',
          props: { inputMode: 'numeric' },
          bindings: { value: ref('/count') },
        },
      ],
    },
  },
  checkbox: {
    material: 'checkbox',
    props: { label: '我已阅读并同意相关条款' },
    bindings: { value: ref('/accepted') },
  },
  select: {
    material: 'field',
    props: { label: '出行方式' },
    bindings: { value: ref('/mode') },
    slots: {
      default: [
        {
          material: 'select',
          props: {
            options: [
              { id: 'train', label: '高铁' },
              { id: 'flight', label: '飞机' },
            ],
            placeholder: '请选择出行方式',
          },
          bindings: { value: ref('/mode') },
        },
      ],
    },
  },
  button: {
    material: 'button',
    props: { label: '保存示例', variant: 'primary' },
    on: { activate: { type: 'host.emit', event: 'travel.saveDraft' } },
  },
  field,
  'value-display': amount,
  section: {
    material: 'section',
    props: { title: '出行信息', description: '点击标题可折叠或展开内容', collapsible: true },
    slots: { default: [field] },
  },
  grid: {
    material: 'grid',
    props: { columns: 2, gap: 'medium' },
    slots: {
      default: [
        field,
        { material: 'field', props: { label: '保费' }, slots: { default: [amount] } },
      ],
    },
  },
  condition: {
    material: 'section',
    props: { title: '条件显示' },
    slots: {
      default: [
        {
          material: 'checkbox',
          props: { label: '显示补充信息' },
          bindings: { value: ref('/accepted') },
        },
        {
          material: 'condition',
          props: { visible: { $expr: { ref: ref('/accepted') } } },
          slots: { default: [field] },
        },
      ],
    },
  },
  'dialog-editor': {
    material: 'dialog-editor',
    props: { title: '编辑成员', triggerLabel: '编辑成员' },
    slots: {
      summary: [{ material: 'value-display', props: { value: { $expr: { ref: ref('/name') } } } }],
      content: [field],
    },
  },
  'insured-summary': {
    material: 'insured-summary',
    props: { premiumMinor: 12800 },
    bindings: { insured: ref('/insured') },
  },
  'date-range': {
    material: 'date-range',
    props: { label: '出行日期' },
    bindings: { start: ref('/start'), end: ref('/end') },
  },
  'remote-select': {
    material: 'remote-select',
    props: { placeholder: '搜索目的地', filterKey: 'CN' },
    bindings: { value: ref('/city') },
    requests: { search: { type: 'host.request', request: 'travel.searchCities' } },
  },
};
const data: JsonValue = {
  people: [{ name: '林小满' }],
  name: '林小满',
  count: 2,
  accepted: true,
  mode: 'train',
  insured: { name: '林小满', age: 28 },
  start: '2026-12-01',
  end: '2026-12-05',
  city: null,
};
const readOnlyName: ViewNode = {
  ...field,
  slots: { default: [{ ...text, props: { readOnly: true } }] },
};

export function materialPreview(id: string) {
  const view = examples[id];
  return view ? compilePreview(view) : undefined;
}

export function materialPreviewVariants(id: string) {
  if (id !== 'text-input') return undefined;
  const preview = compilePreview(readOnlyName);
  return preview ? [{ id: 'read-only', title: '只读展示', ...preview }] : undefined;
}

function compilePreview(
  view: ViewNode,
): { prepared: ReadonlyPreparedForm; data: JsonValue; configuration: ViewNode } | undefined {
  const definition: FormDefinition = {
    protocolVersion: '1',
    id: 'material-gallery',
    version: '1',
    data: {
      schema: {
        type: 'object',
        properties: {
          people: { type: 'array', items: { type: 'object' } },
          name: { type: 'string' },
          count: { type: 'number' },
          accepted: { type: 'boolean' },
          mode: { type: ['string', 'null'] },
          insured: { type: 'object' },
          start: { type: ['string', 'null'] },
          end: { type: ['string', 'null'] },
          city: remoteSelectManifest.bindings!.value!.schema,
        },
      },
    },
    views: { main: view },
  };
  const result = checkWebConfig(JSON.stringify(definition), 'main');
  return result.success ? { prepared: result.prepared, data, configuration: view } : undefined;
}
