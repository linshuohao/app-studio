/** 将本地 / 跨上下文 Promise 和 thenable 统一为当前上下文的 Promise。 */
export function toPromise(value: unknown): Promise<unknown> | undefined {
  if (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    'then' in value &&
    typeof value.then === 'function'
  )
    return Promise.resolve(value);
  return undefined;
}

/** 只接管异步拒绝，不等待结果；错误出口自身失败也不能形成新的未处理拒绝。 */
export function observeRejection(
  value: unknown,
  rejected: (error: unknown) => void = () => undefined,
): boolean {
  const promise = toPromise(value);
  if (!promise) return false;
  void promise.catch(rejected).catch(() => undefined);
  return true;
}
