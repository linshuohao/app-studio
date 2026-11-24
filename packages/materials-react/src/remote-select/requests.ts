import { defineRequest } from '@form-engine/renderer-react';
import { manifest } from './manifest.js';
export type RemoteSelectOption = { id: string; label: string };
export type RemoteSelectSearchInput = { query: string; filterKey: string | null };
export type RemoteSelectSearchResult = { items: RemoteSelectOption[] };
export const remoteSelectRequests = {
  search: defineRequest<RemoteSelectSearchInput, RemoteSelectSearchResult>(
    manifest.requests!.search!,
  ),
};
