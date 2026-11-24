'use client';
import { useState } from 'react';
export function RecordIdentity({ id, label = '查看完整标识' }: { id: string; label?: string }) {
  const [message, setMessage] = useState('');
  return (
    <details className="record-identity">
      <summary>{label}</summary>
      <code translate="no">{id}</code>
      <button
        type="button"
        className="text-button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(id);
            setMessage('已复制');
          } catch {
            setMessage('复制失败，请选择标识手动复制');
          }
        }}
      >
        复制标识
      </button>
      <span role="status">{message}</span>
    </details>
  );
}
