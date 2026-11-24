import type { CompilerInputDefinition, ViewNode } from '@form-engine/protocol/definition';
export const ref = (path: string) => ({ source: 'data' as const, path });
const field = (
  label: string,
  path: string,
  material: string,
  props: Record<string, string | boolean | { id: string; label: string }[]> = {},
): ViewNode => ({
  material: 'field',
  props: { label, requiredMark: true },
  bindings: { value: ref(path) },
  slots: { default: [{ material, props, bindings: { value: ref(path) } }] },
});
export const basicDefinition = {
  protocolVersion: 'verification',
  id: 'first-materials',
  version: 'draft',
  data: {
    schema: {
      type: 'object',
      required: ['name', 'age', 'plan', 'acknowledged'],
      properties: {
        name: { type: 'string', minLength: 1 },
        age: { type: 'integer', minimum: 0, maximum: 80 },
        plan: { type: 'string', enum: ['basic', 'plus'] },
        acknowledged: { type: 'boolean', const: true },
      },
    },
  },
  views: {
    main: {
      material: 'section',
      props: { title: '基础输入' },
      slots: {
        default: [
          field('姓名', '/name', 'text-input', { placeholder: '请输入姓名' }),
          field('年龄', '/age', 'number-input'),
          field('方案', '/plan', 'select', {
            options: [
              { id: 'basic', label: '基础方案' },
              { id: 'plus', label: '升级方案' },
            ],
          }),
          field('信息确认', '/acknowledged', 'checkbox', { label: '我已核对信息' }),
          { material: 'value-display', props: { value: 500, format: 'moneyMinor' } },
          {
            material: 'button',
            props: { label: 'Host 填入示例', variant: 'secondary' },
            on: { activate: { type: 'host.emit', event: 'verification.fill' } },
          },
          {
            material: 'button',
            props: { label: '校验并交付快照', variant: 'primary' },
            on: { activate: { type: 'host.emit', event: 'verification.validate' } },
          },
        ],
      },
    },
  },
} satisfies CompilerInputDefinition;
