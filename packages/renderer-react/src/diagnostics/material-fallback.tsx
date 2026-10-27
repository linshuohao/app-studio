import { useEffect, useRef } from 'react';
import type { BoundaryProps } from './boundary-types.js';
import { canonical } from '../material/json.js';

/**
 * 已知的局部配置错误直接降级，不必先抛出异常。
 * 输入是诊断、上报函数和可选降级函数；仅返回业务提示；技术诊断由独立 DevTools 呈现。
 * 仅记住本挂载上次交付的诊断内容与发布关联，不保存业务状态或诊断历史。
 * 同一错误不因渲染 / Strict Mode 重报；内容改变、新发布关联或真实重挂仍会交付。
 * 不建立 Runtime 观察，也不负责释放 Runtime 或物料请求。
 */
export function MaterialFallback({
  diagnostic,
  report,
  fallback,
}: Omit<BoundaryProps, 'children'>) {
  const delivered = useRef<{ key: string; report: typeof report } | null>(null);
  useEffect(() => {
    // 诊断只含定位元数据；比较内容，避免对象重建或 Scope 字典顺序改变产生假事件。
    const key = canonical(diagnostic);
    if (delivered.current?.key === key && delivered.current.report === report) return;
    delivered.current = { key, report };
    report?.(diagnostic);
  }, [report, diagnostic]);
  return (
    <>{fallback ? fallback(diagnostic) : <div role="alert">此处暂时不可用，请稍后重试。</div>}</>
  );
}
