import {
  defineHostRequests,
  defineMaterialContract,
  defineRequest,
  useMaterialAdapter,
} from '../src/index.js';
const search = defineRequest<{ query: string }, { names: string[] }>({
  payloadSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  resultSchema: {
    type: 'object',
    properties: { names: { type: 'array', items: { type: 'string' } } },
    required: ['names'],
  },
});
const requests = { search };
const contract = defineMaterialContract<
  { label: string },
  'value',
  { confirm: string },
  typeof requests
>({ id: 'typed', version: '1', requests });
export function TypedMaterial() {
  const adapter = useMaterialAdapter(contract);
  adapter.set('value', '-'); // 非法工作值也是 JSON，不能被合法 Schema 类型禁止。
  // @ts-expect-error 未声明的 Binding 名
  adapter.set('unknown', 'x');
  adapter.request('search', { query: 'x' });
  // @ts-expect-error 请求参数契约不匹配
  adapter.request('search', { query: 1 });
  // @ts-expect-error 未声明请求
  adapter.request('unknown', {});
  // @ts-expect-error 事件 Payload 类型不匹配
  adapter.emit('confirm', 1);
  return null;
}
defineHostRequests({ lookup: search }, { lookup: (input) => ({ names: [input.query] }) });
// @ts-expect-error 静态可知的必需注册缺失
defineHostRequests({ lookup: search }, {});
// @ts-expect-error Host 输出契约错误
defineHostRequests({ lookup: search }, { lookup: () => ({ names: [1] }) });
