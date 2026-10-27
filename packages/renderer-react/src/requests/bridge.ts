import type { JsonValue } from '@form-engine/protocol';
import type { PreparedMaterialNode } from '@form-engine/protocol/prepared';
import type { ScopeBinding } from '@form-engine/runtime';
import type { RequestCall, RequestResult } from '../adapter/types.js';
import type { RenderEnvironment } from '../renderer/create-render-environment.js';
import { copyJson } from '../material/json.js';
interface CallRecord {
  readonly id: number;
  readonly name: string;
  readonly cancel: () => void;
}
/** 独立于校验队列，只管理本挂载实例的交付资格。 */
export class RequestBridge {
  /** 只包含尚未结算的调用；完成 / 取消即移除，没有已完成结果缓存。 */
  readonly #calls = new Set<CallRecord>();
  #sequence = 0;
  /** 只读调用元数据，无 Payload / Result / cancel 函数，查询不会发起请求。 */
  inspect() {
    return [...this.#calls].map(({ id, name }) => ({ id, name, status: 'pending' as const }));
  }
  constructor(
    readonly environment: RenderEnvironment,
    readonly node: PreparedMaterialNode,
    readonly scope: ScopeBinding,
    readonly occurrence: string,
    readonly alive: () => boolean,
    readonly inspectEvent?: (event: { id: number; name: string; status: string }) => void,
  ) {}
  /** 本挂载失效时撤销全部在途交付，底层 Promise 即使永不结束也不能悬挂调用。 */
  cancelAll() {
    for (const call of [...this.#calls]) call.cancel();
  }
  /**
   * 输入是物料请求名与 JSON Payload；返回当前调用独立的 result / cancel 句柄。
   * 状态在本次闭包中保存：done=false 为可交付，finish 后只允许忽略迟到结果。
   * latest 按挂载实例 + 请求名替换；parallel 独立。两者都不参与表单校验队列。
   */
  request = (name: string, input: JsonValue): RequestCall<JsonValue> => {
    const id = ++this.#sequence;
    const note = (status: string) => {
      try {
        this.inspectEvent?.({ id, name, status });
      } catch {
        /* 工具不影响调用。 */
      }
    };
    const controller = new AbortController();
    let done = false;
    let resolve!: (result: RequestResult<JsonValue>) => void;
    const result = new Promise<RequestResult<JsonValue>>((settle) => {
      resolve = settle;
    });
    // 所有终态经过同一结算口，先置 done / 移除记录，再交付结果。
    const finish = (outcome: RequestResult<JsonValue>) => {
      if (done) return;
      done = true;
      this.#calls.delete(record);
      note(outcome.status);
      resolve(Object.freeze(outcome));
    };
    // 正确性依赖立即撤销资格；AbortSignal 只是尽力节省 Host 资源。
    const cancel = () => {
      if (done) return;
      finish({ status: 'discarded' });
      try {
        controller.abort();
      } catch {
        this.#report('REQUEST_CANCEL_FAILED', name);
      }
    };
    const record: CallRecord = { id, name, cancel };
    const call = Object.freeze({ result, cancel });
    if (!this.alive()) {
      finish({ status: 'discarded' });
      return call;
    }
    const mapping = Object.hasOwn(this.node.requests ?? {}, name)
      ? this.node.requests![name]
      : undefined;
    if (!mapping) {
      finish({ status: 'error', error: { code: 'REQUEST_UNAVAILABLE' } });
      return call;
    }
    this.#calls.add(record);
    note('pending');
    if (mapping.concurrency === 'latest')
      for (const previous of [...this.#calls])
        if (previous !== record && previous.name === name) previous.cancel();
    // 取消旧调用可能同步触发 Host abort 回调并重入，因此再次核对当前调用资格。
    if (done || !this.alive()) {
      cancel();
      return call;
    }
    const failed = (code: string) => {
      if (done) return;
      if (!this.alive()) {
        cancel();
        return;
      }
      this.#report(code, name);
      finish({ status: 'error', error: { code, message: '请求暂时无法完成，请重试。' } });
    };
    try {
      const captured = copyJson(input);
      if (!this.environment.contracts.valid(mapping.payloadSchemaRef, captured)) {
        failed('REQUEST_INPUT_INVALID');
        return call;
      }
      let payload = captured;
      if (mapping.payload !== undefined) {
        const evaluated = this.environment.runtime.evaluateValue(
          mapping.payload,
          this.scope,
          captured,
        );
        if (evaluated.kind !== 'value') {
          failed('REQUEST_PAYLOAD_INVALID');
          return call;
        }
        payload = copyJson(evaluated.value);
      }
      if (
        mapping.hostPayloadSchemaRef &&
        !this.environment.contracts.valid(mapping.hostPayloadSchemaRef, payload)
      ) {
        failed('REQUEST_PAYLOAD_INVALID');
        return call;
      }
      const handler =
        this.environment.requests && Object.hasOwn(this.environment.requests, mapping.request)
          ? this.environment.requests[mapping.request]
          : undefined;
      if (!handler) {
        failed('REQUEST_UNAVAILABLE');
        return call;
      }
      const returned = handler(payload as never, { signal: controller.signal });
      void Promise.resolve(returned)
        .then(
          (value) => {
            if (done) return;
            if (!this.alive()) {
              cancel();
              return;
            }
            let capturedResult: JsonValue;
            try {
              capturedResult = copyJson(value);
              if (
                (mapping.hostResultSchemaRef &&
                  !this.environment.contracts.valid(mapping.hostResultSchemaRef, capturedResult)) ||
                !this.environment.contracts.valid(mapping.resultSchemaRef, capturedResult)
              ) {
                failed('REQUEST_RESULT_INVALID');
                return;
              }
            } catch {
              failed('REQUEST_RESULT_INVALID');
              return;
            }
            finish({ status: 'success', value: capturedResult });
          },
          () => failed('REQUEST_FAILED'),
        )
        .catch(() => failed('REQUEST_FAILED'));
    } catch {
      failed('REQUEST_FAILED');
    }
    return call;
  };
  #report(code: string, request: string) {
    this.environment.report({
      code,
      phase: 'request',
      formId: this.environment.compiledForm.definition.id,
      profile: this.environment.compiledForm.build.profile,
      nodeId: this.node.id,
      occurrence: this.occurrence,
      material: this.node.material,
      scope: this.scope,
      request,
      message: code,
    });
  }
}
