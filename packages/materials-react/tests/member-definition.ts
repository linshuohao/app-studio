import type { FormDefinition, ViewNode } from '@form-engine/protocol/definition';
import { ref } from './fixtures.js';
const fields: ViewNode = {
  material: 'grid',
  props: { columns: 2 },
  slots: {
    default: [
      {
        material: 'field',
        props: { label: '成员姓名' },
        bindings: { value: ref('/name', 'insured') },
        slots: {
          default: [{ material: 'text-input', bindings: { value: ref('/name', 'insured') } }],
        },
      },
      {
        material: 'field',
        props: { label: '成员年龄' },
        bindings: { value: ref('/age', 'insured') },
        slots: {
          default: [{ material: 'number-input', bindings: { value: ref('/age', 'insured') } }],
        },
      },
      {
        material: 'condition',
        props: { visible: { $expr: { ref: ref('/showGuardian') } } },
        slots: {
          default: [
            {
              material: 'field',
              props: { label: '监护人姓名' },
              bindings: { value: ref('/guardianName', 'insured') },
              slots: {
                default: [
                  { material: 'text-input', bindings: { value: ref('/guardianName', 'insured') } },
                ],
              },
            },
          ],
        },
      },
    ],
  },
};
const controls: ViewNode[] = [
  {
    material: 'button',
    props: { label: '移到首位' },
    on: {
      activate: {
        type: 'form.command',
        command: {
          op: 'array.move',
          target: ref('/insureds'),
          item: { $scope: 'row' },
          position: { kind: 'index', index: 0 },
        },
      },
    },
  },
  {
    material: 'button',
    props: { label: '删除成员', variant: 'danger' },
    on: {
      activate: {
        type: 'form.command',
        command: { op: 'array.remove', target: ref('/insureds'), item: { $scope: 'row' } },
      },
    },
  },
];
const summary: ViewNode = {
  material: 'insured-summary',
  props: { premiumMinor: 500 },
  bindings: { insured: ref('', 'row') },
};
const useFields: ViewNode = { $use: 'insured-fields', with: { insured: ref('', 'row') } };
const row = (compact: boolean): ViewNode => ({
  scope: { from: ref('/insureds'), as: 'row', mode: 'each' },
  node: {
    material: 'section',
    props: { title: '成员' },
    slots: {
      actions: controls,
      default: compact
        ? [
            {
              material: 'dialog-editor',
              props: { title: '编辑成员' },
              slots: { summary: [summary], content: [useFields, ...controls] },
            },
          ]
        : [summary, useFields],
    },
  },
});
const page = (compact: boolean): ViewNode => ({
  material: 'section',
  props: { title: '被保人列表' },
  slots: {
    default: [row(compact)],
    actions: [
      {
        material: 'button',
        props: { label: '新增成员' },
        on: {
          activate: {
            type: 'form.command',
            command: {
              op: 'array.insert',
              target: ref('/insureds'),
              position: { kind: 'index', index: 0 },
              value: { $literal: { name: '新增', age: 20, guardianName: '监护人' } },
            },
          },
        },
      },
    ],
  },
});
export const memberDefinition: Partial<FormDefinition> = {
  data: {
    schema: {
      type: 'object',
      $defs: {
        Insured: {
          type: 'object',
          required: ['name', 'age', 'guardianName'],
          properties: {
            name: { type: 'string', minLength: 1 },
            age: { type: 'integer', minimum: 0, maximum: 80 },
            guardianName: { type: 'string', minLength: 1 },
          },
        },
      },
      properties: {
        insureds: { type: 'array', items: { $ref: '#/$defs/Insured' }, minItems: 1, maxItems: 5 },
        showGuardian: { type: 'boolean' },
      },
    },
  },
  viewTemplates: {
    'insured-fields': { params: { insured: { schemaRef: '#/$defs/Insured' } }, node: fields },
  },
  views: { desktop: page(false), compact: page(true) },
};
export const memberData = {
  insureds: [
    { name: '甲', age: 18, guardianName: '监护甲' },
    { name: '乙', age: 12, guardianName: '监护乙' },
  ],
  showGuardian: true,
};
