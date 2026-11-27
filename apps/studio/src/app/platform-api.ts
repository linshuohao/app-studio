import { DefaultChatTransport, type UIMessage } from 'ai';

class AgentTransport extends DefaultChatTransport<UIMessage> {
  decode(body: ReadableStream<Uint8Array>) {
    return this.processResponseStream(body);
  }
}
export type Account = {
  userId: string;
  username: string | null;
  githubLogin: string | null;
  hasPassword: boolean;
  membership: {
    spaceId: string;
    status: 'none' | 'active' | 'suspended';
    memberId?: string;
    permissions: string[];
  };
};
export type Registration = { login: string; expiresAt: number };
export type Access = { userId: string; spaceId: string; permissions: string[] };
export type FormSummary = {
  formId: string;
  name: string;
  description: string;
  archived: boolean;
  revision: number;
};
export type FormListEntry = FormSummary & {
  latestSave: { versionId: string; savedAt: string } | null;
  latestRelease: {
    name?: string;
    releaseId: string;
    versionId: string;
    publishedAt: string;
  } | null;
};
export type VersionSummary = {
  name?: string | null;
  versionId: string;
  savedBy: string;
  savedAt: string;
  basedOnVersionId: string | null;
  note: string | null;
};
export type Version = VersionSummary & { text: string };
export type OpenForm = FormSummary & {
  version: Version | null;
  text: string;
};

export type UnderstandingItem = { kind: 'requirement' | 'question'; text: string };
export type ComposePhase = {
  stage: 'schema' | 'capabilities' | 'view' | 'validation' | 'reaction' | 'compile';
  status: 'started' | 'completed' | 'retrying' | 'failed';
  attempt?: number;
  detail?: string;
};
export type TurnEvent =
  | { type: 'progress'; message: string; stage?: ComposePhase['stage'] }
  | ({ type: 'compose_phase' } & ComposePhase)
  | ({ type: 'understanding_item' } & UnderstandingItem)
  | { type: 'understanding_reset' }
  | { type: 'text_reset' }
  | { type: 'text_delta'; delta: string };
export class PlatformError extends Error {
  constructor(
    readonly status: number,
    readonly detail?: string,
    readonly code?: string,
  ) {
    super(`Platform request failed (${status})`);
  }
}

export async function platform<T>(
  path: string,
  request?: {
    body?: object;
    method?: 'POST' | 'PATCH' | 'DELETE';
    key?: string;
    signal?: AbortSignal;
    onTurnEvent?: (event: TurnEvent) => void;
  },
): Promise<T> {
  const response = await fetch(`/api/platform${path}`, {
    cache: 'no-store',
    signal: request?.signal,
    method: request?.method ?? (request ? 'POST' : 'GET'),
    headers: request && {
      'Content-Type': 'application/json',
      ...(request.onTurnEvent && { Accept: 'text/event-stream' }),
      ...(request.key && { 'Idempotency-Key': request.key }),
    },
    body: request && JSON.stringify(request.body ?? {}),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: unknown;
      code?: unknown;
    } | null;
    throw new PlatformError(
      response.status,
      typeof body?.message === 'string' ? body.message : undefined,
      typeof body?.code === 'string' ? body.code : undefined,
    );
  }
  if (request?.onTurnEvent) {
    if (!response.body) throw new PlatformError(502);
    const reader = new AgentTransport().decode(response.body).getReader();
    const emit = request.onTurnEvent;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) throw new PlatformError(502, '进度连接提前结束，请重新打开会话核对结果');
        if (value.type === 'text-delta') emit({ type: 'text_delta', delta: value.delta });
        else if (value.type === 'data-text-reset') emit({ type: 'text_reset' });
        else if (value.type === 'data-progress')
          emit({ type: 'progress', message: String(value.data) });
        else if (value.type === 'data-stage-progress') {
          const { message, stage } = value.data as {
            message: string;
            stage: ComposePhase['stage'];
          };
          emit({ type: 'progress', message, stage });
        } else if (value.type === 'data-compose-phase')
          emit({ type: 'compose_phase', ...(value.data as ComposePhase) });
        else if (value.type === 'data-reset') emit({ type: 'understanding_reset' });
        else if (value.type === 'data-item')
          emit({ type: 'understanding_item', ...(value.data as UnderstandingItem) });
        else if (value.type === 'data-result') return value.data as T;
        else if (value.type === 'data-failure') {
          const failure = value.data as number | { status: number; reason: string; code?: string };
          throw typeof failure === 'number'
            ? new PlatformError(failure)
            : new PlatformError(failure.status, failure.reason, failure.code);
        } else if (value.type === 'error') throw new PlatformError(502);
      }
    } finally {
      await reader.cancel();
    }
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export function accessDenied(error: unknown) {
  return (
    error instanceof PlatformError &&
    (error.status === 401 || (error.status === 403 && error.code !== 'STUDIO_ORIGIN_REJECTED'))
  );
}

export function outcomeUnknown(error: unknown) {
  return !(error instanceof PlatformError) || error.status >= 500;
}

export function failureMessage(error: unknown) {
  if (!(error instanceof PlatformError)) return '无法连接到服务，请重试。';
  switch (error.status) {
    case 401:
      return '凭据无效或登录已过期。';
    case 403:
      if (error.code === 'STUDIO_ORIGIN_REJECTED')
        return error.detail ?? '当前页面的来源未获允许，请从配置的 Studio 地址打开。';
      return '当前账号没有操作权限。';
    case 404:
      return '找不到请求的资源。';
    case 409:
      return '操作发生冲突，请刷新当前数据后再试。';
    case 400:
      return error.detail ?? '输入不符合要求。';
    case 413:
      return '请求内容超过大小上限。';
    default:
      return '服务暂时无法完成操作，请重试。';
  }
}

export type ReleaseDiagnostic = { code: string; message: string; sourcePointer: string };
export type Release = {
  success: true;
  name?: string;
  versionId: string;
  releaseId: string;
  target: { platform: string; profile: string };
  diagnostics: ReleaseDiagnostic[];
  publishedAt?: string | null;
  publishedBy?: string | null;
};
export type ReleaseResult =
  Release | { success: false; versionId: string; diagnostics: ReleaseDiagnostic[] };
