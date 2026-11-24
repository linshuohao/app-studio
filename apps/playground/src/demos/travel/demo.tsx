'use client';
import { useEffect, useState } from 'react';
import type { ReadonlyJson } from '@form-engine/runtime';
import { FormRenderer } from '@form-engine/renderer-react';
import '@form-engine/materials-react/styles.css';
import { materials } from '../catalog';
import {
  createTravelSession,
  type Delivery,
  type EligibilityCall,
  type TravelProfile,
  type ValidationMode,
} from './session';
const statuses = {
  idle: '尚未提交',
  pending: '完整校验中',
  valid: '已交付模拟提交快照',
  invalid: '校验未通过',
  incomplete: '核验未完成',
  stale: '输入已变化，请重新提交',
};
export default function TravelAcceptance({ observation = false }: { observation?: boolean }) {
  const [session, setSession] = useState<ReturnType<typeof createTravelSession> | null>(null),
    [profile, setProfile] = useState<TravelProfile>('desktop'),
    [mode, setMode] = useState<ValidationMode>('pass');
  const [snapshot, setSnapshot] = useState<ReadonlyJson>(null),
    [delivery, setDelivery] = useState<Delivery>({
      draft: null,
      submission: null,
      submitStatus: 'idle',
    }),
    [calls, setCalls] = useState<EligibilityCall[]>([]);
  useEffect(() => () => session?.dispose(), [session]);
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-12">
      <h1 className="text-2xl font-semibold">
        {observation ? 'DevTools · 36 人跨对象联动' : '家庭出行'}
      </h1>
      <p>
        使用合成费率与本地模拟服务，不代表真实保险产品或承保结果。草稿可保存未完成数据，提交需完整校验通过。
      </p>
      {observation && (
        <p>
          先连接 DevTools，再打开表单。修改投保人姓名：24 名未成年成员串联两级 reaction
          并触发异步资格校验，12
          名成人走条件跳过分支。可切换手动返回、拒绝或失败，再删除成员验证历史链。
        </p>
      )}
      {session ? (
        <>
          <label className="inline-flex items-center gap-3" htmlFor="travel-profile">
            呈现方式
            <select
              id="travel-profile"
              className="fe-input"
              value={profile}
              onChange={(e) => setProfile(e.currentTarget.value as TravelProfile)}
            >
              <option value="desktop">平铺编辑</option>
              <option value="compact">摘要与弹层</option>
            </select>
          </label>
          <FormRenderer
            prepared={session.profiles[profile]}
            runtime={session.runtime}
            materials={materials}
            requests={session.requests}
          />
          <section aria-label="本地 Host 验收控制" className="space-y-3 rounded border p-4">
            <h2>本地 Host 验收控制</h2>
            <label className="inline-flex items-center gap-3" htmlFor="eligibility-mode">
              资格核验返回
              <select
                id="eligibility-mode"
                className="fe-input"
                value={mode}
                onChange={(e) => {
                  const next = e.currentTarget.value as ValidationMode;
                  setMode(next);
                  session.setValidationMode(next);
                }}
              >
                <option value="pass">通过</option>
                <option value="reject">业务拒绝</option>
                <option value="failure">技术失败</option>
                <option value="manual">手动返回</option>
              </select>
            </label>
            <p>模式只控制下一次核验。手动模式可在等待时编辑数据，再返回旧结果。</p>
            <div className="flex flex-wrap gap-2">
              {(['pass', 'reject', 'failure'] as const).map((outcome, i) => (
                <button
                  type="button"
                  className="fe-button"
                  key={outcome}
                  onClick={() => session.completeValidations(outcome)}
                >
                  {['通过待处理核验', '拒绝待处理核验', '失败待处理核验'][i]}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                ['加载合成示例', 'travel.golden'],
                ['加载空白草稿', 'travel.blank'],
                ['模拟导入错误总价', 'travel.wrongTotal'],
              ].map(([label, event]) => (
                <button
                  type="button"
                  className="fe-button"
                  key={event}
                  onClick={() => session.runtime.interact({ type: 'host.emit', event: event! })}
                >
                  {label}
                </button>
              ))}
            </div>
            <ul aria-label="资格核验记录">
              {calls.map((call) => (
                <li key={call.id}>
                  #{call.id} · {call.member} ·{' '}
                  {call.cancelled ? '已取消交付' : call.settled ? '已返回' : '等待返回'}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <button
          type="button"
          className="fe-button"
          onClick={() =>
            setSession(createTravelSession(setSnapshot, setDelivery, setCalls, observation))
          }
        >
          打开完整表单
        </button>
      )}
      <section className="space-y-3">
        <h2>交付结果</h2>
        <p role="status" data-testid="travel-status">
          {statuses[delivery.submitStatus]}
        </p>
        <h3>最近保存的草稿</h3>
        <pre className="overflow-x-auto rounded border p-3 text-sm" data-testid="travel-draft">
          {JSON.stringify(delivery.draft, null, 2)}
        </pre>
        <h3>最近模拟提交</h3>
        <pre className="overflow-x-auto rounded border p-3 text-sm" data-testid="travel-submission">
          {JSON.stringify(delivery.submission, null, 2)}
        </pre>
        <h3>当前工作数据</h3>
        <pre className="overflow-x-auto rounded border p-3 text-sm" data-testid="travel-snapshot">
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      </section>
    </main>
  );
}
