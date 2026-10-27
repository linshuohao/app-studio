'use client';
import { useEffect, useState } from 'react';
import { FormRenderer } from '@form-engine/renderer-react';
import type { ReadonlyJson } from '@form-engine/runtime';
import { createFixtureSession } from './session';
import { fixtureMaterials } from './materials';
export default function L4Verification() {
  const [session, setSession] = useState<ReturnType<typeof createFixtureSession> | null>(null);
  const [snapshot, setSnapshot] = useState<ReadonlyJson>(null),
    [saved, setSaved] = useState('尚未提交');
  useEffect(() => () => session?.dispose(), [session]);
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <h1 className="text-2xl font-semibold">L4 呈现验证</h1>
      <p>本页使用测试物料和可控 Host，验证真实编译、填写、校验与提交。</p>
      {session ? (
        <FormRenderer
          prepared={session.prepared}
          runtime={session.runtime}
          materials={fixtureMaterials}
          requests={session.requests}
        />
      ) : (
        <button
          className="rounded border p-2"
          onClick={() => setSession(createFixtureSession(setSnapshot, setSaved))}
        >
          打开验证
        </button>
      )}
      <section>
        <h2>当前数据</h2>
        <pre data-testid="snapshot">{JSON.stringify(snapshot)}</pre>
        <h2>提交结果</h2>
        <pre data-testid="saved">{saved}</pre>
      </section>
    </main>
  );
}
