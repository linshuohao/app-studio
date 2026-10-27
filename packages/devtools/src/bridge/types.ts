import type {
  DevtoolsEvent,
  DevtoolsSnapshot,
  DevtoolsSourceInfo,
} from '@form-engine/runtime/devtools';
export interface PageCommand {
  readonly op: 'poll' | 'inspect' | 'disconnect';
  readonly session: string;
  readonly id?: string;
}
export interface PageReply {
  readonly status: 'connected' | 'waiting' | 'incompatible';
  readonly sources: readonly DevtoolsSourceInfo[];
  readonly events: readonly DevtoolsEvent[];
  readonly dropped: number;
  readonly selectedId?: string;
  readonly snapshot?: DevtoolsSnapshot;
}
export interface DevtoolsTransport {
  request(command: PageCommand): Promise<PageReply>;
}
