'use client';
import { useEffect, useState } from 'react';
import type { ReadonlyJson } from '@form-engine/runtime';
import { FormRenderer } from '@form-engine/renderer-react';
import '@form-engine/materials-react/styles.css';
import { materials } from '../catalog';
import { createMaterialSession } from './session';
export default function MaterialVerification() {
  const [session, setSession] = useState<ReturnType<typeof createMaterialSession> | null>(null);
  const [snapshot, setSnapshot] = useState<ReadonlyJson>(null),
    [result, setResult] = useState('尚未校验');
  useEffect(() => () => session?.dispose(), [session]);
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-12">
      <h1 className="text-2xl font-semibold">基础资料</h1>
      <p>
        真实 Compiler、Runtime 和正式物料，使用可控本地 Host。方案初始值故意保留未知
        ID，用于验证非法状态。
      </p>
      {session ? (
        <FormRenderer prepared={session.prepared} runtime={session.runtime} materials={materials} />
      ) : (
        <button
          type="button"
          className="fe-button"
          onClick={() => setSession(createMaterialSession(setSnapshot, setResult))}
        >
          打开物料验收
        </button>
      )}
      <section>
        <h2>当前工作数据</h2>
        <pre
          data-testid="materials-snapshot"
          className="overflow-x-auto rounded border p-3 text-sm"
        >
          {JSON.stringify(snapshot, null, 2)}
        </pre>
        <h2>Host 交付结果</h2>
        <pre data-testid="materials-result" className="overflow-x-auto rounded border p-3 text-sm">
          {result}
        </pre>
      </section>
    </main>
  );
}
