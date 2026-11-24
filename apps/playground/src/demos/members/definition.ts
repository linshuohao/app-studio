import type { FormDefinition, ViewNode } from '@form-engine/protocol/definition';
export const ref = (path: string, scope?: string) => ({
  source: 'data' as const,
  path,
  ...(scope ? { scope } : {}),
});
const count = { op: 'core.length', args: [{ ref: ref('/insureds') }] };
const field = (label: string, path: string, material: string): ViewNode => ({
  material: 'field',
  props: { label, requiredMark: true },
  bindings: { value: ref(path, 'insured') },
  slots: { default: [{ material, bindings: { value: ref(path, 'insured') } }] },
});
const fields: ViewNode = {
  material: 'grid',
  props: { columns: 2, gap: 'medium' },
  slots: {
    default: [
      field('成员姓名', '/name', 'text-input'),
      field('成员年龄', '/age', 'number-input'),
      field('证件号码', '/idNumber', 'text-input'),
      {
        material: 'condition',
        props: { visible: { $expr: { ref: ref('/showGuardian') } } },
        slots: { default: [field('监护人姓名', '/guardianName', 'text-input')] },
      },
    ],
  },
};
const actions: ViewNode[] = [
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
    props: {
      label: '删除成员',
      variant: 'danger',
      disabled: { $expr: { op: 'core.lte', args: [count, 1] } },
    },
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
const members = (compact: boolean): ViewNode => ({
  scope: { from: ref('/insureds'), as: 'row', mode: 'each' },
  node: {
    material: 'section',
    props: { title: '成员' },
    slots: {
      actions,
      default: compact
        ? [
            {
              material: 'dialog-editor',
              props: { title: '编辑被保人' },
              slots: {
                summary: [summary],
                content: [
                  useFields,
                  {
                    material: 'grid',
                    props: { columns: 2, gap: 'small' },
                    slots: { default: actions },
                  },
                ],
              },
            },
          ]
        : [summary, useFields],
    },
  },
});
const page = (compact: boolean): ViewNode => ({
  material: 'section',
  props: { title: '被保人列表', description: '组合成员验收：字段实时写入，完成或关闭不会回滚。' },
  slots: {
    actions: [
      {
        material: 'button',
        props: { label: '新增成员', disabled: { $expr: { op: 'core.gte', args: [count, 5] } } },
        on: {
          activate: {
            type: 'form.command',
            command: {
              op: 'array.insert',
              target: ref('/insureds'),
              position: { kind: 'index', index: 0 },
              value: { $literal: { name: '新增成员', age: 20, idNumber: '', guardianName: '' } },
            },
          },
        },
      },
      {
        material: 'button',
        props: { label: '完整校验', variant: 'primary' },
        on: { activate: { type: 'host.emit', event: 'members.validate' } },
      },
    ],
    default: [
      {
        material: 'field',
        props: { label: '字段显示控制' },
        bindings: { value: ref('/showGuardian') },
        slots: {
          default: [
            {
              material: 'checkbox',
              props: { label: '显示监护人字段' },
              bindings: { value: ref('/showGuardian') },
            },
          ],
        },
      },
      members(compact),
    ],
  },
});
// This page exercises composition. Age policies and real premium functions arrive in batch 4.
export const memberDefinition: FormDefinition = {
  protocolVersion: 'verification',
  id: 'member-composition',
  version: 'draft',
  data: {
    schema: {
      type: 'object',
      required: ['insureds', 'showGuardian'],
      $defs: {
        Insured: {
          type: 'object',
          required: ['name', 'age', 'idNumber', 'guardianName'],
          properties: {
            name: { type: 'string', minLength: 1 },
            age: { type: 'integer', minimum: 0, maximum: 80 },
            idNumber: { type: 'string', minLength: 1 },
            guardianName: { type: 'string', minLength: 1 },
          },
        },
      },
      properties: {
        insureds: { type: 'array', minItems: 1, maxItems: 5, items: { $ref: '#/$defs/Insured' } },
        showGuardian: { type: 'boolean' },
      },
    },
  },
  viewTemplates: {
    'insured-fields': { params: { insured: { schemaRef: '#/$defs/Insured' } }, node: fields },
  },
  views: { desktop: page(false), compact: page(true) },
};
