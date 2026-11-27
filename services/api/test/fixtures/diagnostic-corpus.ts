import type { JsonValue } from '@form-engine/protocol';
import type {
  CompilerInputDefinition,
  Constraint,
  Expression,
  Reaction,
} from '@form-engine/protocol/definition';

export const ref = (path: string) => ({ source: 'data' as const, path });
const read = (path: string): Expression => ({ ref: ref(path) });
const literal = (value: JsonValue): Expression => ({ literal: value });
const call = (op: string, ...args: Expression[]): Expression => ({ op, args });
const positive = (value: Expression) => call('core.gt', value, literal(0));
const divide = call('core.div', literal(100), read('/amount'));
const missing = read('/optionalAmount');
const age = { minAge: 0, maxAge: 80, adultAge: 18 };
const daily = { adultDailyMinor: Number.MAX_SAFE_INTEGER, childDailyMinor: 0 };
const rate = { agePolicy: age, maxDays: 90, maxInsureds: 4, rates: { basic: daily, plus: daily } };

type Case = {
  id: string;
  label: string;
  code:
    | 'reaction.error'
    | 'reaction.action.error'
    | 'validation.error'
    | 'validator.error'
    | 'flush.aborted';
  phase: string;
  error: string;
  input?: Record<string, JsonValue>;
} & (
  | { kind: 'reaction' | 'assert' | 'when'; expression: Expression }
  | { kind: 'event'; payload?: Expression; invoke: () => void }
  | { kind: 'validator'; invoke: () => unknown }
  | { kind: 'loop' }
);

function fixture(scenario: Case): Case {
  return scenario;
}
const reaction = (
  id: string,
  label: string,
  error: string,
  expression: Expression,
  input?: Record<string, JsonValue>,
) =>
  fixture({
    id,
    label,
    code: 'reaction.error',
    phase: 'when',
    error,
    kind: 'reaction',
    expression,
    input,
  });
const validator = (
  id: string,
  label: string,
  phase: 'invoke' | 'result',
  error: string,
  invoke: () => unknown,
) => fixture({ id, label, code: 'validator.error', phase, error, kind: 'validator', invoke });
const result = (value: unknown) => ({ result: Promise.resolve(value) });

export const diagnosticForms = [
  {
    key: 'freight',
    name: '运费与重量分摊',
    cases: [
      reaction(
        'zero-divisor',
        '运输件数为零导致分摊除零',
        'division by zero',
        call('core.and', positive(divide), call('core.ne', read('/amount'), literal(0))),
        { amount: 0 },
      ),
      reaction(
        'arithmetic-overflow',
        '换算系数导致浮点结果溢出',
        'non-finite result',
        positive(call('core.mul', read('/amount'), literal(1e308))),
        { amount: 10 },
      ),
    ],
  },
  {
    key: 'purchase',
    name: '采购单价批量导入',
    cases: [
      reaction(
        'imported-number-is-text',
        '导入金额是文本，数值函数拒绝参数',
        'argument type',
        positive(divide),
        { amount: '未报价' },
      ),
      reaction(
        'required-rate-missing',
        '旧单据缺少可选费率，联动直接读取',
        'missing value',
        positive(missing),
      ),
    ],
  },
  {
    key: 'insurance',
    name: '团险资格与保费计算',
    cases: [
      reaction(
        'inverted-age-range',
        '保单年龄下界大于上界',
        'invalid age policy',
        call('travel.isEligibleAge', literal(30), literal({ ...age, minAge: 70, maxAge: 50 })),
      ),
      reaction(
        'premium-cent-overflow',
        '保费换算超过安全整数分范围',
        'amount overflow',
        call(
          'core.exists',
          call('travel.personPremium', literal(30), literal('basic'), literal(2), literal(rate)),
        ),
      ),
    ],
  },
  {
    key: 'reimbursement',
    name: '报销额度复核',
    cases: [
      fixture({
        id: 'approval-guard-missing',
        label: '审批适用条件缺少额度数据',
        kind: 'when',
        code: 'validation.error',
        phase: 'when',
        error: 'missing value',
        expression: positive(missing),
      }),
      fixture({
        id: 'allocation-assertion-divides-by-zero',
        label: '分摊比例断言使用零作为基数',
        kind: 'assert',
        code: 'validation.error',
        phase: 'assert',
        error: 'division by zero',
        expression: positive(divide),
        input: { amount: 0 },
      }),
    ],
  },
  {
    key: 'warehouse',
    name: '仓库调拨通知',
    cases: [
      fixture({
        id: 'notification-payload-missing',
        label: '调拨事件缺少组装负载所需的金额',
        kind: 'event',
        code: 'reaction.action.error',
        phase: 'payload',
        error: 'missing value',
        payload: missing,
        invoke: () => {},
      }),
      fixture({
        id: 'notification-adapter-unconfigured',
        label: 'Host 通知适配器缺少出库配置',
        kind: 'event',
        code: 'reaction.action.error',
        phase: 'invoke',
        error: 'outbound destination not configured',
        invoke: () => {
          throw new Error('outbound destination not configured');
        },
      }),
    ],
  },
  {
    key: 'supplier',
    name: '供应商准入核验',
    cases: [
      validator(
        'async-validator-wrapper',
        '校验器整个返回 Promise，未同步返回任务',
        'invoke',
        'expected a synchronous task',
        async () => result([]),
      ),
      validator(
        'plain-array-task-result',
        '任务 result 误填为同步数组',
        'invoke',
        'expected a Promise task',
        () => ({ result: [] }),
      ),
    ],
  },
  {
    key: 'identity',
    name: '身份资料核验',
    cases: [
      validator(
        'validator-region-unconfigured',
        '校验适配器缺少请求区域配置',
        'invoke',
        'identity region not configured',
        () => {
          throw new Error('identity region not configured');
        },
      ),
      validator(
        'provider-response-timeout',
        '外部校验请求超时并拒绝任务结果',
        'result',
        'identity provider timeout',
        () => ({ result: Promise.reject(new Error('identity provider timeout')) }),
      ),
    ],
  },
  {
    key: 'invoice',
    name: '发票验真与问题映射',
    cases: [
      validator(
        'issues-object-instead-of-array',
        '外部服务返回问题对象而非问题数组',
        'result',
        'issues must be an array',
        () => result({ problems: [] }),
      ),
      validator('issue-without-code', '问题条目缺少稳定错误码', 'result', 'invalid issue', () =>
        result([{ message: '发票状态不明' }]),
      ),
    ],
  },
  {
    key: 'membership',
    name: '团体成员资格登记',
    cases: [
      validator(
        'issue-target-points-to-context',
        '校验问题错误地指向 Host Context',
        'result',
        'invalid target',
        () => result([{ code: 'MEMBER', target: { source: 'context', path: '/record' } }]),
      ),
      validator(
        'issue-target-scope-unbound',
        '校验问题引用当前调用未绑定的成员别名',
        'result',
        'unknown lexical binding',
        () => result([{ code: 'MEMBER', target: { ...ref('/record'), scope: 'member' } }]),
      ),
    ],
  },
  {
    key: 'settlement',
    name: '结算状态同步',
    cases: [
      validator(
        'non-json-validator-result',
        '校验适配器返回日期实例，违反 JSON 边界',
        'result',
        'plain objects required',
        () => result([new Date('2026-11-25T00:00:00Z')]),
      ),
      fixture({
        id: 'cyclic-settlement-write',
        label: 'Host 回写反复触发自身联动，耗尽执行预算',
        kind: 'loop',
        code: 'flush.aborted',
        phase: 'flush',
        error: 'Execution budget exhausted',
      }),
    ],
  },
];

export function formDefinition(form: (typeof diagnosticForms)[number]): CompilerInputDefinition {
  const reactions: Reaction[] = [];
  const constraints: Constraint[] = [];
  for (const sample of form.cases) {
    const active = call('core.eq', read('/scenario'), literal(sample.id));
    const when = call('core.and', active, call('core.ne', read('/record'), literal('')));
    switch (sample.kind) {
      case 'reaction':
        reactions.push({
          id: sample.id,
          watch: [ref('/record')],
          when: call('core.and', when, sample.expression),
          then: [{ op: 'set', target: ref('/result'), value: 1 }],
        });
        break;
      case 'when':
      case 'assert':
        constraints.push({
          id: sample.id,
          kind: 'internal',
          when: sample.kind === 'when' ? call('core.and', when, sample.expression) : when,
          assert: sample.kind === 'assert' ? sample.expression : literal(true),
          issue: { code: 'FIXTURE', target: ref('/record') },
        });
        break;
      case 'validator':
        constraints.push({
          id: sample.id,
          kind: 'external',
          validator: 'fixture.' + sample.id,
          when,
          watch: [ref('/record')],
          target: ref('/record'),
        });
        break;
      case 'event':
      case 'loop':
        reactions.push({
          id: sample.id,
          watch: sample.kind === 'loop' ? [ref('/record'), ref('/result')] : [ref('/record')],
          when,
          then: [
            {
              type: 'host.emit',
              event: 'fixture.' + sample.id,
              ...(sample.kind === 'event' && sample.payload
                ? { payload: { $expr: sample.payload } }
                : {}),
            },
          ],
        });
        break;
    }
  }

  return {
    protocolVersion: 'verification',
    id: 'diagnostics-' + form.key,
    version: 'draft',
    data: {
      schema: {
        type: 'object',
        properties: {
          scenario: { type: 'string' },
          record: { type: 'string' },
          amount: { type: 'number' },
          optionalAmount: { type: 'number' },
          result: { type: 'number' },
        },
      },
    },
    views: {
      main: {
        material: 'section',
        props: { title: form.name },
        slots: {
          default: [
            {
              material: 'field',
              props: { label: '测试单据编号' },
              bindings: { value: ref('/record') },
              slots: { default: [{ material: 'text-input', bindings: { value: ref('/record') } }] },
            },
          ],
        },
      },
    },
    reactions,
    constraints,
  };
}
