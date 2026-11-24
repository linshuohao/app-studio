import type {
  DataReference,
  Expression,
  FormDefinition,
  ValueSpec,
  ViewNode,
  Constraint,
} from '@form-engine/protocol/definition';
import { agePolicy, ratePolicy } from './policy';
export const ref = (path: string, scope?: string): DataReference => ({
  source: 'data',
  path,
  ...(scope ? { scope } : {}),
});
const call = (op: string, ...args: Expression[]): Expression => ({ op, args });
const get = (path: string, scope?: string): Expression =>
  call('core.if', call('core.exists', { ref: ref(path, scope) }), { ref: ref(path, scope) }, null);
const expr = (value: Expression): ValueSpec => ({ $expr: value });
const literalAge: Expression = { literal: agePolicy },
  literalRates: Expression = { literal: ratePolicy };
const guardian = (scope: string) => call('travel.requiresGuardian', get('/age', scope), literalAge);
const days: Expression = { use: 'tripDays' };
const total = call('travel.totalPremium', get('/insureds'), get('/plan'), days, literalRates);
const count = call('core.length', { ref: ref('/insureds') });
const field = (
  label: string,
  path: string,
  material: string,
  scope?: string,
  props: Record<string, ValueSpec> = {},
): ViewNode => ({
  material: 'field',
  props: { label, requiredMark: true },
  bindings: { value: ref(path, scope) },
  slots: { default: [{ material, props, bindings: { value: ref(path, scope) } }] },
});
const eventButton = (label: string, event: string): ViewNode => ({
  material: 'button',
  props: { label, variant: event === 'travel.submit' ? 'primary' : 'secondary' },
  on: { activate: { type: 'host.emit', event } },
});
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
    props: { label: '删除成员', variant: 'danger', disabled: expr(call('core.lte', count, 1)) },
    on: {
      activate: {
        type: 'form.command',
        command: { op: 'array.remove', target: ref('/insureds'), item: { $scope: 'row' } },
      },
    },
  },
];
const memberFields: ViewNode = {
  material: 'grid',
  props: { columns: 2, gap: 'medium' },
  slots: {
    default: [
      field('成员姓名', '/name', 'text-input', 'insured'),
      field('出行时年龄', '/age', 'number-input', 'insured'),
      field('证件号码', '/idNumber', 'text-input', 'insured'),
      {
        material: 'condition',
        props: { visible: expr(guardian('insured')) },
        slots: { default: [field('监护人姓名', '/guardianName', 'text-input', 'insured')] },
      },
    ],
  },
};
const members = (compact: boolean): ViewNode => {
  const summary: ViewNode = {
    material: 'insured-summary',
    bindings: { insured: ref('', 'row') },
    props: {
      premiumMinor: expr(
        call('travel.personPremium', get('/age', 'row'), get('/plan'), days, literalRates),
      ),
    },
  };
  const editor: ViewNode = { $use: 'insured-fields', with: { insured: ref('', 'row') } };
  return {
    scope: { from: ref('/insureds'), as: 'row', mode: 'each' },
    node: {
      material: 'section',
      props: { title: '被保险人' },
      slots: {
        actions,
        default: compact
          ? [
              {
                material: 'dialog-editor',
                props: { title: '编辑被保险人' },
                slots: {
                  summary: [summary],
                  content: [
                    editor,
                    {
                      material: 'grid',
                      props: { columns: 2, gap: 'small' },
                      slots: { default: actions },
                    },
                  ],
                },
              },
            ]
          : [summary, editor],
      },
    },
  };
};
const page = (compact: boolean): ViewNode => ({
  material: 'section',
  props: { title: '家庭短期出行投保录入单', description: '使用合成费率试算，仅作整体验收。' },
  slots: {
    default: [
      {
        material: 'section',
        props: { title: '投保人' },
        slots: {
          default: [
            {
              material: 'grid',
              props: { columns: 2 },
              slots: {
                default: [
                  field('投保人姓名', '/applicant/name', 'text-input'),
                  field('联系电话', '/applicant/phone', 'text-input', undefined, {
                    inputMode: 'tel',
                  }),
                ],
              },
            },
          ],
        },
      },
      {
        material: 'section',
        props: { title: '出行信息' },
        slots: {
          default: [
            field('目的地国家', '/travel/countryCode', 'select', undefined, {
              options: {
                $literal: [
                  { id: 'CN', label: '中国' },
                  { id: 'US', label: '美国' },
                ],
              },
              clearable: false,
            }),
            {
              material: 'field',
              props: { label: '目的地城市', requiredMark: true },
              bindings: { value: ref('/travel/city') },
              slots: {
                default: [
                  {
                    material: 'remote-select',
                    props: {
                      placeholder: '输入城市关键词',
                      filterKey: expr({ ref: ref('/travel/countryCode') }),
                    },
                    bindings: { value: ref('/travel/city') },
                    requests: { search: { type: 'host.request', request: 'travel.searchCities' } },
                  },
                ],
              },
            },
            {
              material: 'date-range',
              props: { label: '出行日期' },
              bindings: { start: ref('/travel/startDate'), end: ref('/travel/endDate') },
            },
            field('投保方案', '/plan', 'select', undefined, {
              options: {
                $literal: [
                  { id: 'basic', label: '基础方案' },
                  { id: 'plus', label: '升级方案' },
                ],
              },
              clearable: false,
            }),
          ],
        },
      },
      {
        material: 'section',
        props: { title: '被保险人列表', description: '1–5 人；年龄为出行开始日的周岁年龄。' },
        slots: {
          actions: [
            {
              material: 'button',
              props: { label: '新增成员', disabled: expr(call('core.gte', count, 5)) },
              on: {
                activate: {
                  type: 'form.command',
                  command: {
                    op: 'array.insert',
                    target: ref('/insureds'),
                    position: { kind: 'index', index: 0 },
                    value: { $literal: { name: '', age: null, idNumber: '', guardianName: '' } },
                  },
                },
              },
            },
          ],
          default: [members(compact)],
        },
      },
      {
        material: 'section',
        props: { title: '试算与确认' },
        slots: {
          default: [
            {
              material: 'field',
              props: { label: '出行天数' },
              bindings: { value: ref('/travel/endDate') },
              slots: {
                default: [
                  { material: 'value-display', props: { value: expr(days), format: 'integer' } },
                ],
              },
            },
            {
              material: 'field',
              props: { label: '试算总保费（分）', help: 'CNY 整数分，合成费率。' },
              bindings: { value: ref('/estimatedTotalMinor') },
              slots: {
                default: [
                  {
                    material: 'value-display',
                    props: { value: expr(get('/estimatedTotalMinor')), format: 'moneyMinor' },
                  },
                ],
              },
            },
            {
              material: 'checkbox',
              props: { label: '我已核对投保信息' },
              bindings: { value: ref('/acknowledged') },
            },
            {
              material: 'field',
              props: { label: '整单校验' },
              bindings: { value: ref('') },
              slots: {
                default: [{ material: 'value-display', props: { value: '提交前将执行完整校验' } }],
              },
            },
          ],
          actions: [
            eventButton('保存草稿', 'travel.saveDraft'),
            eventButton('提交申请', 'travel.submit'),
          ],
        },
      },
    ],
  },
});
const nonblank = (id: string, path: string, message: string, scope?: string): Constraint => ({
  id,
  kind: 'internal',
  ...(scope ? { scope: { from: ref('/insureds'), as: scope, mode: 'each' as const } } : {}),
  assert: call('text.isNonBlank', get(path, scope)),
  issue: { target: ref(path, scope), code: id, message: { text: message } },
});
export const travelDefinition: FormDefinition = {
  protocolVersion: 'verification',
  id: 'family-travel',
  version: 'draft',
  data: {
    schema: {
      type: 'object',
      required: ['applicant', 'travel', 'plan', 'insureds', 'acknowledged', 'estimatedTotalMinor'],
      $defs: {
        Insured: {
          title: '被保险人',
          type: 'object',
          required: ['name', 'age', 'idNumber', 'guardianName'],
          properties: {
            name: { title: '姓名', type: 'string' },
            age: { title: '出行时年龄', type: 'integer', minimum: 0, maximum: 80 },
            idNumber: { title: '证件号码', type: 'string', minLength: 1 },
            guardianName: { title: '监护人姓名', type: 'string' },
          },
        },
      },
      properties: {
        applicant: {
          title: '投保人',
          type: 'object',
          required: ['name', 'phone'],
          properties: {
            name: { title: '投保人姓名', type: 'string' },
            phone: { title: '联系电话', type: 'string' },
          },
        },
        travel: {
          title: '出行信息',
          type: 'object',
          required: ['countryCode', 'city', 'startDate', 'endDate'],
          properties: {
            countryCode: { title: '目的地国家', type: 'string', enum: ['CN', 'US'] },
            city: {
              title: '目的地城市',
              type: 'object',
              required: ['id', 'label'],
              properties: {
                id: { title: '城市标识', type: 'string', minLength: 1 },
                label: { title: '城市名称', type: 'string', minLength: 1 },
              },
              additionalProperties: false,
            },
            startDate: { type: 'string', title: '出发日期' },
            endDate: { type: 'string', title: '返程日期' },
          },
        },
        plan: { title: '投保方案', type: 'string', enum: ['basic', 'plus'] },
        insureds: {
          title: '被保险人列表',
          type: 'array',
          minItems: 1,
          maxItems: 5,
          items: { $ref: '#/$defs/Insured' },
        },
        acknowledged: { title: '已核对投保信息', type: 'boolean', const: true },
        estimatedTotalMinor: {
          title: '试算总保费（分）',
          type: ['integer', 'null'],
          minimum: 0,
          maximum: Number.MAX_SAFE_INTEGER,
        },
      },
    },
  },
  expressions: {
    tripDays: call('date.inclusiveDays', get('/travel/startDate'), get('/travel/endDate')),
  },
  constraints: [
    nonblank('APPLICANT_REQUIRED', '/applicant/name', '请填写投保人姓名'),
    nonblank('PHONE_REQUIRED', '/applicant/phone', '请填写联系电话'),
    nonblank('MEMBER_REQUIRED', '/name', '请填写成员姓名', 'person'),
    nonblank('ID_REQUIRED', '/idNumber', '请填写证件号码', 'person'),
    {
      id: 'age-eligible',
      kind: 'internal',
      scope: { from: ref('/insureds'), as: 'person', mode: 'each' },
      assert: call('travel.isEligibleAge', get('/age', 'person'), literalAge),
      issue: {
        target: ref('/age', 'person'),
        code: 'AGE_INELIGIBLE',
        message: { text: '年龄须为 0–80 的整数' },
      },
    },
    {
      id: 'guardian-required',
      kind: 'internal',
      scope: { from: ref('/insureds'), as: 'person', mode: 'each' },
      when: guardian('person'),
      assert: call('text.isNonBlank', get('/guardianName', 'person')),
      issue: {
        target: ref('/guardianName', 'person'),
        code: 'GUARDIAN_REQUIRED',
        message: { text: '未成年人须填写监护人姓名' },
      },
    },
    {
      id: 'trip-range',
      kind: 'internal',
      assert: call(
        'travel.isTripRangeAllowed',
        get('/travel/startDate'),
        get('/travel/endDate'),
        30,
      ),
      issue: {
        target: ref('/travel/endDate'),
        code: 'TRIP_RANGE',
        message: { text: '请选择有效的 1–30 天出行日期' },
      },
    },
    {
      id: 'estimate-consistent',
      kind: 'internal',
      assert: call(
        'core.and',
        call('core.exists', { ref: ref('/estimatedTotalMinor') }),
        call('core.eq', { ref: ref('/estimatedTotalMinor') }, total),
      ),
      issue: {
        target: ref('/estimatedTotalMinor'),
        code: 'ESTIMATE_MISMATCH',
        message: { text: '保存的试算金额与当前计算不一致' },
      },
    },
    {
      id: 'identity-eligibility',
      kind: 'external',
      validator: 'travel.checkEligibility',
      scope: { from: ref('/insureds'), as: 'person', mode: 'each' },
      watch: [ref('/idNumber', 'person'), ref('/age', 'person'), ref('/travel/countryCode')],
      target: ref('/idNumber', 'person'),
      requires: [
        { kind: 'field', target: ref('/idNumber', 'person'), phase: 'sync' },
        { kind: 'field', target: ref('/age', 'person'), phase: 'sync' },
      ],
    },
  ],
  reactions: [
    {
      id: 'clear-city-on-country',
      watch: [ref('/travel/countryCode')],
      then: [{ op: 'set', target: ref('/travel/city'), value: null }],
    },
    {
      id: 'estimate-total',
      watch: [ref('/travel/startDate'), ref('/travel/endDate'), ref('/plan'), ref('/insureds')],
      runOnActivate: true,
      then: [{ op: 'set', target: ref('/estimatedTotalMinor'), value: expr(total) }],
    },
  ],
  viewTemplates: {
    'insured-fields': { params: { insured: { schemaRef: '#/$defs/Insured' } }, node: memberFields },
  },
  views: { desktop: page(false), compact: page(true) },
};
