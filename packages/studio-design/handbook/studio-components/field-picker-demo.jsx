import React, { useState } from 'react';
import { FieldPicker, fieldsFromSchema } from '../../../../apps/studio/src/components/field-picker';
const dataSchema = {
  type: 'object',
  title: '投保表单',
  properties: {
    applicant: {
      type: 'object',
      title: '投保人',
      properties: {
        name: { type: 'string', title: '姓名' },
        age: { type: 'integer', title: '年龄' },
        contact: {
          type: 'object',
          title: '联系方式',
          properties: {
            mobile: { type: 'string', title: '手机号码' },
            email: { type: 'string', title: '电子邮箱' },
            internationalEmergencyContactTelephoneNumber: {
              type: 'string',
              title: '被保险人在境外需要协助时使用的紧急联络电话号码',
            },
          },
        },
      },
    },
    policy: {
      type: 'object',
      title: '保单信息',
      properties: {
        amount: { type: 'number', title: '保额' },
        term: { type: 'integer', title: '保障年限' },
      },
    },
    insuredPersons: {
      type: 'array',
      title: '被保人名单',
      items: {
        type: 'object',
        title: '当前被保人',
        properties: {
          age: { type: 'integer', title: '年龄' },
          relationship: { type: 'string', title: '与投保人关系' },
        },
      },
    },
  },
};
const scopes = [{ as: 'insured', mode: 'each', from: { source: 'data', path: '/insuredPersons' } }];
export function Sample({ multiple, label, description }) {
  const [value, setValue] = useState(multiple ? [] : null);
  const options = fieldsFromSchema(dataSchema, {
    scopes,
    getDisabledReason: (field) => (!multiple && field.type !== 'integer' ? '需要整数' : undefined),
  });
  return (
    <>
      <FieldPicker
        label={label}
        description={description}
        fields={options}
        multiple={multiple}
        value={value}
        onChange={setValue}
      />
      <details open>
        <summary>页面收到的值</summary>
        <pre aria-live="polite">{JSON.stringify(value, null, 2)}</pre>
      </details>
    </>
  );
}
export const pickerStory = [
  Sample,
  { multiple: false, label: '选择绑定字段', description: '为年龄输入框选择整数类型的绑定字段。' },
];
