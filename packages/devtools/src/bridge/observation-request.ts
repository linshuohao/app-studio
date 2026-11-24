import type {
  ObservationReply,
  ObservationRequest,
  ObservationHook,
} from '@form-engine/runtime/devtools';
/** 自包含页面世界入口；只转发新版声明操作，不安装 Hook、不保存第二套会话或读取业务值。 */
export function observationPageRequest(command: ObservationRequest): ObservationReply {
  const version = 2 as const;
  const response = (status: 'waiting' | 'incompatible' | 'unavailable'): ObservationReply => ({
    version,
    requestId: command.requestId,
    result: { status },
  });
  try {
    const candidate = (globalThis as unknown as Record<string, unknown>)
      .__FORM_ENGINE_DEVTOOLS__ as ObservationHook | undefined;
    if (!candidate) return response('waiting');
    if (candidate.version !== version || typeof candidate.request !== 'function')
      return response('incompatible');
    return candidate.request(command);
  } catch {
    return response('unavailable');
  }
}
