'use client';
import { useEffect, useState } from 'react';
import type { ReadonlyJson } from '@form-engine/runtime';
import { FormRenderer } from '@form-engine/renderer-react';
import '@form-engine/materials-react/styles.css';
import { materials } from '../catalog';
import { createInteractionSession, type SearchCallView } from './session';
export default function InteractionsVerification() {
  const [session, setSession] = useState<ReturnType<typeof createInteractionSession> | null>(null),
    [snapshot, setSnapshot] = useState<ReadonlyJson>(null),
    [calls, setCalls] = useState<SearchCallView[]>([]);
  useEffect(() => () => session?.dispose(), [session]);
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <h1 className="text-2xl font-semibold">日期与城市</h1>
      <p>
        单日期可输入或从日历选择，日期范围在确认后写入。搜索由本地 Host
        返回，可手动制造成功、失败、空列表与迟到结果。
      </p>
      {session ? (
        <>
          <FormRenderer
            prepared={session.prepared}
            runtime={session.runtime}
            materials={materials}
            requests={session.requests}
          />
          <section aria-label="可控 Host 调用">
            <h2 className="font-semibold">Host 待处理调用</h2>
            <ul className="space-y-3">
              {calls.map((call) => (
                <li key={call.id} className="rounded border p-3">
                  <p>
                    #{call.id} · {call.query} · {call.filterKey ?? '全部'} ·{' '}
                    {call.aborted ? '已撤销交付' : call.settled ? '已返回' : '等待返回'}
                  </p>
                  {!call.settled ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="fe-button"
                        onClick={() => session.complete(call.id, 'success')}
                      >
                        返回成功 #{call.id}
                      </button>
                      <button
                        type="button"
                        className="fe-button"
                        onClick={() => session.complete(call.id, 'empty')}
                      >
                        返回空列表 #{call.id}
                      </button>
                      <button
                        type="button"
                        className="fe-button"
                        onClick={() => session.complete(call.id, 'failure')}
                      >
                        返回失败 #{call.id}
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <button
          type="button"
          className="fe-button"
          onClick={() => setSession(createInteractionSession(setSnapshot, setCalls))}
        >
          打开交互验收
        </button>
      )}
      <section>
        <h2>当前工作数据</h2>
        <pre
          className="overflow-x-auto rounded border p-3 text-sm"
          data-testid="interactions-snapshot"
        >
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      </section>
    </main>
  );
}
