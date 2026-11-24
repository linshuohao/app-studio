'use client';
import { useEffect, useState } from 'react';
import type { ReadonlyJson } from '@form-engine/runtime';
import { FormRenderer } from '@form-engine/renderer-react';
import '@form-engine/materials-react/styles.css';
import { materials } from '../catalog';
import { createMemberSession, type MemberProfile } from './session';
export default function MembersVerification() {
  const [session, setSession] = useState<ReturnType<typeof createMemberSession> | null>(null),
    [profile, setProfile] = useState<MemberProfile>('desktop');
  const [snapshot, setSnapshot] = useState<ReadonlyJson>(null),
    [result, setResult] = useState('尚未校验');
  useEffect(() => () => session?.dispose(), [session]);
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-12">
      <h1 className="text-2xl font-semibold">家庭成员</h1>
      <p>
        验证多成员、模板、条件显示、原生弹层与同实例 Profile
        切换。金额为固定展示样本，本页尚未接入完整业务规则与真实服务。
      </p>
      {session ? (
        <>
          <label className="inline-flex items-center gap-3" htmlFor="member-profile">
            呈现方式
            <select
              id="member-profile"
              className="fe-input"
              value={profile}
              onChange={(e) => setProfile(e.currentTarget.value as MemberProfile)}
            >
              <option value="desktop">平铺编辑</option>
              <option value="compact">摘要与弹层</option>
            </select>
          </label>
          <FormRenderer
            prepared={session.profiles[profile]}
            runtime={session.runtime}
            materials={materials}
          />
        </>
      ) : (
        <button
          type="button"
          className="fe-button"
          onClick={() => setSession(createMemberSession(setSnapshot, setResult))}
        >
          打开成员验收
        </button>
      )}
      <section>
        <h2>当前工作数据</h2>
        <pre className="overflow-x-auto rounded border p-3 text-sm" data-testid="members-snapshot">
          {JSON.stringify(snapshot, null, 2)}
        </pre>
        <h2>完整校验交付</h2>
        <pre className="overflow-x-auto rounded border p-3 text-sm" data-testid="members-result">
          {result}
        </pre>
      </section>
    </main>
  );
}
