# remote-select

Host 搜索、显式选择的受控单选。`createRemoteSelect(artifact)` 使用 Host 制品身份。

- Props：`placeholder?: string`，`disabled = false`，`clearable = true`，`filterKey?: string | null`（缺省按 null 交付）。
- Binding `value`：完整 `{ id: string; label: string } | null`。没有 Events 或 Slots。
- Request `search`：latest 策略；输入 `{ query: string; filterKey: string | null }`，输出 `{ items: Array<{ id: string; label: string }> }`。静态 Manifest 是机器契约；公开 `remoteSelectRequests` 提供 Host 类型推导。
- 点击搜索或 Enter 才调用 Host；输入关键词和请求成功不改选中值。选择写完整对象，清空写 null。查询 / filterKey / disabled 改变，显式取消或卸载撤销当前交付、清空候选并拒绝迟到与排队旧结果。重试同一 query 也生成新资格。
- 失败只显示友好提示，不泄露技术异常、不清选中值、不生成校验 Issue；discarded 回到空闲。空结果与失败有不同展示。仅复用 Adapter 已发布校验；完整校验不等待搜索。
- Host 承接网络、防抖、缓存和重试。国家改变清空城市必须用 Definition Reaction 明确配置，物料不隐含业务联动。

```ts
const view = {
  material: 'remote-select',
  props: { filterKey: { $expr: { ref: { source: 'data', path: '/travel/countryCode' } } } },
  bindings: { value: { source: 'data', path: '/travel/city' } },
  requests: { search: { type: 'host.request', request: 'travel.searchCities' } },
};
// import { defineHostRequests } from '@form-engine/renderer-react';
// import { remoteSelectRequests } from '@form-engine/materials-react';
const requests = defineHostRequests(
  { 'travel.searchCities': remoteSelectRequests.search },
  { 'travel.searchCities': async ({ query, filterKey }, { signal }) =>
      cityService.search({ query, country: filterKey, signal }) },
);
```

行为、乱序、卸载及 Host 类型正反例见 `tests/remote-select/`；实际浏览器使用可控 Host 验收。
