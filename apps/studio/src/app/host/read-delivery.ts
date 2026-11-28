import type { ContentDigest } from '@form-engine/protocol';
import { capturePreparedForm } from '@form-engine/protocol/internal/prepared';
export async function digest(text: string): Promise<ContentDigest> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const hexadecimal = Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `sha256:${hexadecimal}`;
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(
          (key) => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key]),
        )
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}

type Delivery = {
  format?: string;
  name?: string;
  releaseId?: string;
  target?: { platform?: string; profile?: string };
  preparedText?: string;
  digest?: string;
};

export async function readDelivery(releaseId: string, signal: AbortSignal, onVerify?: () => void) {
  const response = await fetch('/api/platform/releases/' + encodeURIComponent(releaseId), {
    cache: 'no-store',
    credentials: 'omit',
    signal,
  });
  if (!response.ok) throw new Error(response.status === 404 ? '找不到该发布。' : '无法获取发布。');
  onVerify?.();
  let delivery: Delivery;
  try {
    delivery = (await response.json()) as Delivery;
  } catch {
    throw new Error('发布响应不是有效的 JSON。');
  }
  if (
    delivery?.format !== 'form-engine.release/1' ||
    delivery.releaseId !== releaseId ||
    delivery.target?.platform !== 'web' ||
    typeof delivery.preparedText !== 'string'
  )
    throw new Error('发布身份、响应格式或目标不匹配。');
  const preparedDigest = await digest(delivery.preparedText);
  if (preparedDigest !== delivery.digest) throw new Error('发布制品摘要不匹配。');

  let prepared: ReturnType<typeof capturePreparedForm>;
  try {
    prepared = capturePreparedForm(JSON.parse(delivery.preparedText));
  } catch {
    throw new Error('发布制品结构无效。');
  }
  if (
    prepared.preparedFormatVersion !== 'form-engine.prepared/2' ||
    prepared.build.platform !== 'web' ||
    prepared.build.profile !== delivery.target.profile ||
    !Object.hasOwn(prepared.definition.views, prepared.build.profile)
  )
    throw new Error('发布制品格式或目标不受支持。');

  return {
    prepared,
    preparedDigest,
    name: typeof delivery.name === 'string' ? delivery.name : undefined,
  };
}
export type LoadedRelease = Awaited<ReturnType<typeof readDelivery>>['prepared'];
