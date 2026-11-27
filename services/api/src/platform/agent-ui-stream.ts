import { randomUUID } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { createUIMessageStream, pipeUIMessageStreamToResponse } from 'ai';
import type { Response } from 'express';
import { AgentTurnFailure, type TurnStream } from './create-form-agent.js';

export function sendAgentStream<T>(
  response: Response,
  run: (events: TurnStream) => Promise<T>,
  reply: (result: T) => {
    summary?: string;
    message?: string;
    reason?: string;
    questions?: string[];
  },
) {
  const traceId = randomUUID();
  return pipeUIMessageStreamToResponse({
    response,
    headers: {
      'X-Accel-Buffering': 'no',
      'X-Trace-Id': traceId,
      'Cache-Control': 'no-store, no-transform',
      'Content-Encoding': 'identity',
    },
    stream: createUIMessageStream({
      async execute({ writer }) {
        writer.write({ type: 'start', messageId: traceId });
        try {
          let emitted = '';
          const append = (delta: string) => {
            if (!delta) return;
            if (!emitted) writer.write({ type: 'text-start', id: traceId });
            emitted += delta;
            writer.write({ type: 'text-delta', id: traceId, delta });
          };
          const result = await run({
            text: append,
            resetText: () => {
              if (emitted) writer.write({ type: 'text-end', id: traceId });
              emitted = '';
              writer.write({ type: 'data-text-reset', data: true });
            },
            traceId,
            progress: (message, stage) => {
              if (stage) writer.write({ type: 'data-stage-progress', data: { message, stage } });
              else writer.write({ type: 'data-progress', data: message });
            },
            phase: (value) => writer.write({ type: 'data-compose-phase', data: value }),
            reset: () => writer.write({ type: 'data-reset', data: true }),
            item: (item) => writer.write({ type: 'data-item', data: item }),
          });
          const value = reply(result);
          const paragraphs = [
            value.summary ?? value.message ?? value.reason,
            ...(value.questions ?? []),
          ].filter(Boolean);
          const final = paragraphs.join('\n\n');
          if (final.startsWith(emitted)) append(final.slice(emitted.length));
          if (emitted) writer.write({ type: 'text-end', id: traceId });
          writer.write({ type: 'data-result', data: result });
          writer.write({ type: 'finish' });
        } catch (error) {
          const detail = error instanceof HttpException ? error.getResponse() : undefined;
          const editingConflict =
            detail &&
            typeof detail === 'object' &&
            'code' in detail &&
            detail.code === 'DRAFT_EDITING' &&
            'message' in detail &&
            typeof detail.message === 'string'
              ? detail.message
              : undefined;
          writer.write({
            type: 'data-failure',
            data:
              error instanceof AgentTurnFailure
                ? { status: error.getStatus(), reason: error.reason }
                : editingConflict
                  ? { status: 409, reason: editingConflict, code: 'DRAFT_EDITING' }
                  : error instanceof HttpException
                    ? error.getStatus()
                    : 502,
          });
        }
      },
    }),
  });
}
