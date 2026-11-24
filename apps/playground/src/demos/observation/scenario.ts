import type { FormDefinition } from '@form-engine/protocol/definition';
import { travelDefinition, ref } from '../travel/definition';
import { goldenData } from '../travel/policy';
/** 独立的观测压力夹具；不修改家庭出行业务样例的 5 人上限。 */
export function observationDefinition(): FormDefinition {
  const copy = JSON.parse(JSON.stringify(travelDefinition), (key, value) => {
    if (key === 'maxItems' || key === 'maxInsureds') return 40;
    if (value === '1–5 人；年龄为出行开始日的周岁年龄。')
      return '36 人观测夹具；修改投保人姓名查看跨成员联动。';
    return value;
  }) as FormDefinition;
  const scope = { from: ref('/insureds'), as: 'person', mode: 'each' as const };
  return {
    ...copy,
    id: 'observation-stress',
    reactions: [
      ...(copy.reactions ?? []),
      {
        id: 'copy-applicant-to-guardian',
        scope,
        watch: [ref('/applicant/name')],
        when: { op: 'core.lt', args: [{ ref: ref('/age', 'person') }, 18] },
        then: [
          {
            op: 'set',
            target: ref('/guardianName', 'person'),
            value: { $expr: { ref: ref('/applicant/name') } },
          },
        ],
      },
      {
        id: 'guardian-to-identity',
        scope,
        watch: [ref('/guardianName', 'person')],
        then: [
          {
            op: 'set',
            target: ref('/idNumber', 'person'),
            value: { $expr: { ref: ref('/guardianName', 'person') } },
          },
        ],
      },
    ],
  };
}
export function observationData() {
  return {
    ...goldenData(),
    insureds: Array.from({ length: 36 }, (_, index) => ({
      name: `观测成员 ${index + 1}`,
      age: index % 3 === 0 ? 30 : 12,
      idNumber: `TEST-${index + 1}`,
      guardianName: '初始监护人',
    })),
  };
}
