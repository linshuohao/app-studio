const binding = { value: { source: 'data', path: '/name' } };
export const basicInformationDefinition = {
  protocolVersion: '1',
  id: 'basic-information',
  version: '1',
  data: {
    schema: { type: 'object', properties: { name: { type: 'string' } } },
  },
  views: {
    main: {
      material: 'field',
      props: { label: '姓名' },
      bindings: binding,
      slots: {
        default: [
          { material: 'text-input', props: { placeholder: '请输入姓名' }, bindings: binding },
        ],
      },
    },
  },
};
