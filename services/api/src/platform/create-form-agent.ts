import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  GatewayTimeoutException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ReleaseBuild } from './release-build.js';
import { webTarget, withTravelPreviewHost } from './web-check.js';
export type UnderstandingItem = { kind: 'requirement' | 'question'; text: string };
export type ComposePhase = {
  stage: 'schema' | 'capabilities' | 'view' | 'validation' | 'reaction' | 'compile';
  status: 'started' | 'completed' | 'retrying' | 'failed';
  attempt?: number;
  detail?: string;
};
export class AgentTurnFailure extends HttpException {
  constructor(
    readonly reason: string,
    status: number,
  ) {
    super(reason, status);
  }
}
export type TurnStream = {
  traceId: string;
  progress: (message: string) => void;
  phase?: (value: ComposePhase) => void;
  text?: (delta: string) => void;
  resetText?: () => void;
  reset: () => void;
  item: (value: UnderstandingItem) => void;
};
export function serviceToken() {
  const token = process.env.AGENT_SERVICE_TOKEN;
  if (!token) throw new ServiceUnavailableException('CreateForm service is not configured');
  return token;
}
export async function conversationRequest<T>(
  actor: { userId: string; spaceId: string },
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    query?: URLSearchParams;
    stream?: TurnStream;
  } = {},
): Promise<T> {
  const { stream } = options;
  const target = process.env.CREATE_FORM_AGENT_URL;
  if (!target) throw new ServiceUnavailableException('Agent service URL is missing');
  const token = serviceToken();
  const url = new URL('/internal/v1/conversations' + path, target);
  if (options.query) url.search = options.query.toString();
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(610_000),
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Service-Token': token,
        'X-Agent-User': actor.userId,
        'X-Agent-Space': actor.spaceId,
        ...(stream && { Accept: 'application/x-ndjson', 'X-Trace-Id': stream.traceId }),
      },
      body: JSON.stringify(options.body),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError')
      throw new GatewayTimeoutException();
    throw new BadGatewayException('Agent unavailable');
  }
  if (response.status === 404) throw new NotFoundException();
  if (response.status === 409) throw new ConflictException('会话已更新，请重新打开。');
  if (response.status === 422 || response.status === 400)
    throw new BadRequestException('Invalid conversation request');
  if (response.status === 504) throw new GatewayTimeoutException();
  if (!response.ok) throw new BadGatewayException(`Agent request failed (HTTP ${response.status})`);
  if (response.status === 204) return undefined as T;
  if (stream) {
    if (!response.body || !response.headers.get('content-type')?.includes('application/x-ndjson'))
      throw new BadGatewayException('Missing Agent stream');
    const reader = response.body.getReader();
    async function* chunks() {
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) return;
          yield Buffer.from(chunk.value);
        }
      } finally {
        await reader.cancel();
      }
    }
    const source = Readable.from(chunks());
    try {
      for await (const line of createInterface({ input: source, crlfDelay: Infinity })) {
        const event = JSON.parse(line);
        if (event.traceId !== stream.traceId) throw new BadGatewayException();
        if (event.type === 'text_reset') stream.resetText?.();
        else if (event.type === 'understanding_reset') stream.reset();
        else if (event.type === 'text_delta' && typeof event.delta === 'string')
          stream.text?.(event.delta);
        else if (event.type === 'progress') stream.progress(event.message);
        else if (event.type === 'compose_phase') {
          stream.phase?.({
            stage: event.stage,
            status: event.status,
            attempt: event.attempt,
            detail: event.detail,
          });
        } else if (
          event.type === 'understanding_item' &&
          ['requirement', 'question'].includes(event.kind) &&
          typeof event.text === 'string'
        )
          stream.item({ kind: event.kind, text: event.text });
        else if (event.type === 'result') return event.result;
        else if (event.type === 'error' && typeof event.reason === 'string')
          throw new AgentTurnFailure(event.reason, event.status);
        else if (event.status === 409) throw new ConflictException('会话已更新，请重新打开。');
        else if (event.status === 404) throw new NotFoundException();
        else if (event.status === 422) throw new BadRequestException();
        else if (event.status === 504) throw new GatewayTimeoutException();
        else throw new BadGatewayException('Agent execution failed');
      }
    } finally {
      source.destroy();
    }
    throw new BadGatewayException('Incomplete Agent stream');
  }
  return await response.json();
}

export function previewInputs(builds: ReleaseBuild, profile?: unknown) {
  const input = builds.capture(webTarget(profile));
  return { ...input, catalog: withTravelPreviewHost(input.catalog) };
}

export function checkEnvironment(builds: ReleaseBuild): string {
  const { compiler, catalog, target, schemaResources } = previewInputs(builds);
  return createHash('sha256')
    .update(JSON.stringify([compiler, catalog.id, catalog.host, target, schemaResources]))
    .digest('hex');
}
