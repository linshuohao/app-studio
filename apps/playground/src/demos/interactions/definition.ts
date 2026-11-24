import type { FormDefinition, ViewNode } from '@form-engine/protocol/definition';
export const ref = (path: string) => ({ source: 'data' as const, path });
const remote: ViewNode = {
  material: 'field',
  props: { label: '目的地城市' },
  bindings: { value: ref('/city') },
  slots: {
    default: [
      {
        material: 'remote-select',
        props: { placeholder: '输入城市关键词', filterKey: { $expr: { ref: ref('/country') } } },
        bindings: { value: ref('/city') },
        requests: { search: { type: 'host.request', request: 'travel.searchCities' } },
      },
    ],
  },
};
export const interactionDefinition: FormDefinition = {
  protocolVersion: 'verification',
  id: 'material-interactions',
  version: 'draft',
  data: {
    schema: {
      type: 'object',
      required: ['country', 'city', 'start', 'endState', 'showRemote'],
      properties: {
        country: { type: 'string', enum: ['CN', 'US'] },
        city: {
          anyOf: [
            {
              type: 'object',
              required: ['id', 'label'],
              properties: { id: { type: 'string' }, label: { type: 'string' } },
              additionalProperties: false,
            },
            { type: 'null' },
          ],
        },
        start: { type: ['string', 'null'] },
        endState: {
          type: 'object',
          required: ['end'],
          properties: { end: { type: ['string', 'null'] } },
        },
        showRemote: { type: 'boolean' },
      },
    },
  },
  reactions: [
    {
      id: 'clear-city-on-country',
      watch: [ref('/country')],
      then: [{ op: 'set', target: ref('/city'), value: null }],
    },
  ],
  views: {
    main: {
      material: 'section',
      props: { title: '日期与目的地交互' },
      slots: {
        default: [
          {
            material: 'date-range',
            props: { label: '出行日期' },
            bindings: { start: ref('/start'), end: ref('/endState/end') },
          },
          {
            material: 'section',
            props: { title: '日期失败测试' },
            slots: {
              actions: [
                {
                  material: 'button',
                  props: { label: '模拟结束端不可写' },
                  on: {
                    activate: {
                      type: 'form.command',
                      command: { op: 'set', target: ref('/endState'), value: null },
                    },
                  },
                },
                {
                  material: 'button',
                  props: { label: '恢复结束端' },
                  on: {
                    activate: {
                      type: 'form.command',
                      command: {
                        op: 'set',
                        target: ref('/endState'),
                        value: { $literal: { end: '2028-03-01' } },
                      },
                    },
                  },
                },
              ],
            },
          },
          {
            material: 'field',
            props: { label: '国家' },
            bindings: { value: ref('/country') },
            slots: {
              default: [
                {
                  material: 'select',
                  props: {
                    options: [
                      { id: 'CN', label: '中国' },
                      { id: 'US', label: '美国' },
                    ],
                  },
                  bindings: { value: ref('/country') },
                },
              ],
            },
          },
          {
            material: 'checkbox',
            props: { label: '显示城市搜索' },
            bindings: { value: ref('/showRemote') },
          },
          {
            material: 'condition',
            props: { visible: { $expr: { ref: ref('/showRemote') } } },
            slots: { default: [remote] },
          },
        ],
      },
    },
  },
};
