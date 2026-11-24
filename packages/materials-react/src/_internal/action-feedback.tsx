import { useState } from 'react';
import type { AdapterActionResult } from '@form-engine/renderer-react';
export function useActionFeedback() {
  const [error, setError] = useState<string | null>(null);
  const accept = (result: AdapterActionResult) => {
    const ok = result.kind === 'executed' && result.result.ok;
    setError(ok ? null : '本次操作未完成，请重试');
    return ok;
  };
  return { accept, error };
}
export function ActionFeedback({ error }: { error: string | null }) {
  return error ? (
    <p className="fe-feedback" role="alert">
      {error}
    </p>
  ) : null;
}
