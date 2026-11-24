import { defineHostRequests } from '@form-engine/renderer-react';
import { remoteSelectRequests } from '../../src/index.js';
import type { RemoteSelectSearchInput, RemoteSelectSearchResult } from '../../src/index.js';
const contracts = { lookup: remoteSelectRequests.search };
defineHostRequests(contracts, {
  lookup: (input) => ({ items: [{ id: input.query, label: input.filterKey ?? '全部' }] }),
});
// @ts-expect-error Host must return the material's declared result shape.
defineHostRequests(contracts, { lookup: () => ({ items: 'invalid' }) });
// @ts-expect-error A statically known request implementation cannot be omitted.
defineHostRequests(contracts, {});
const input: RemoteSelectSearchInput = { query: '杭州', filterKey: null };
const result: RemoteSelectSearchResult = { items: [] };
// @ts-expect-error filterKey is a required request snapshot member.
const missing: RemoteSelectSearchInput = { query: '杭州' };
void [input, result, missing];
