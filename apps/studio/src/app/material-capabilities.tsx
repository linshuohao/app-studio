'use client';

import type { MaterialManifest } from '@form-engine/protocol/capability';
import type { ViewNode } from '@form-engine/protocol/definition';
import { useState, type ReactNode } from 'react';
import { ContractTable, schemaType } from '../components/catalog/contract-reference';
import { JsonEditor } from '../components/json/json-editor';
import { Button } from '@form-engine/studio-design-components';
import { capabilitySetup } from './material-capability-examples';
import { Modal } from './modal';
import { MaterialDescription } from './material-description';

export function MaterialCapabilities({
  manifest,
  configuration,
  annotations,
  requestExamples,
}: {
  manifest: Pick<MaterialManifest, 'id' | 'version' | 'events' | 'requests'>;
  configuration?: ViewNode;
  annotations: Record<string, string>;
  requestExamples?: Record<string, { title: string; description: string; value: unknown }[]>;
}) {
  const [dialog, setDialog] = useState<{
    title: string;
    content: ReactNode;
    trigger: HTMLElement;
  }>();
  const events = Object.entries(manifest.events ?? {});
  const requests = Object.entries(manifest.requests ?? {});
  if (!events.length && !requests.length) return null;

  function openButton(label: string, title: string, content: ReactNode) {
    return (
      <Button
        variant="secondary"
        aria-haspopup="dialog"
        onClick={(event) => setDialog({ title, content, trigger: event.currentTarget })}
      >
        {label}
      </Button>
    );
  }

  function setupButton(capability: string, setup: ReturnType<typeof capabilitySetup>) {
    if (!setup) return null;
    return openButton(
      '查看接入示例',
      capability + ' · 接入示例',
      <>
        <p>{setup.description}</p>
        <section>
          <h3>物料使用配置 · JSON</h3>
          <JsonEditor
            label="接入示例配置"
            text={JSON.stringify(setup.configuration)}
            initialMode="text"
          />
        </section>
        <section>
          <h3>{setup.title} · JSX</h3>
          <pre className="contract-type">
            <code>{setup.jsx}</code>
          </pre>
        </section>
      </>,
    );
  }

  return (
    <>
      {!!events.length && (
        <section className="material-detail-section material-capabilities" aria-label="事件">
          <h2>事件</h2>
          {events.map(([name, event]) => {
            const pointer = '/events/' + name;
            const payload = event.payloadSchema;
            const signature = `${name}(${payload === undefined ? '' : 'payload: EventPayload'}): void`;
            const setup = capabilitySetup(manifest, configuration, name);
            return (
              <section key={name} className="material-capability" aria-label={`事件 ${name}`}>
                <div className="material-capability-heading">
                  <div className="material-title-with-info">
                    <h3>
                      <code translate="no">{name}</code>
                    </h3>
                    <MaterialDescription
                      title={`查看 ${name} 事件说明`}
                      text={annotations[pointer] ?? '通过 on 映射决定后续动作。'}
                    />
                  </div>
                  <div className="material-capability-actions">
                    {setupButton(name, setup)}
                    {openButton(
                      '查看事件契约',
                      name + ' · 事件契约',
                      <>
                        <section>
                          <h3>事件签名</h3>
                          <pre className="contract-type">
                            <code>
                              {signature}
                              {payload !== undefined &&
                                `\n\ntype EventPayload = ${schemaType(payload)}`}
                            </code>
                          </pre>
                        </section>
                        <section>
                          <h3>原始事件契约</h3>
                          <JsonEditor
                            label="原始事件契约"
                            text={JSON.stringify({ [name]: event })}
                            initialMode="text"
                          />
                        </section>
                      </>,
                    )}
                  </div>
                </div>
                <dl className="material-capability-meta">
                  <div>
                    <dt>事件参数</dt>
                    <dd>{payload === undefined ? '无' : '见参数表'}</dd>
                  </div>
                  <div>
                    <dt>返回值</dt>
                    <dd>无</dd>
                  </div>
                  {setup && (
                    <div>
                      <dt>动作映射示例</dt>
                      <dd>
                        <code>{setup.name}</code>
                      </dd>
                    </div>
                  )}
                </dl>
                {payload !== undefined && (
                  <section aria-label="事件参数">
                    <h4>事件参数</h4>
                    <ContractTable
                      schema={payload}
                      pointer={pointer + '/payloadSchema'}
                      annotations={annotations}
                    />
                  </section>
                )}
              </section>
            );
          })}
        </section>
      )}
      {!!requests.length && (
        <section className="material-detail-section material-capabilities" aria-label="Host 能力">
          <h2>Host 能力</h2>
          {requests.map(([name, request]) => {
            const pointer = '/requests/' + name;
            const strategy = request.concurrency ?? 'latest';
            const setup = capabilitySetup(manifest, configuration, name);
            return (
              <section className="material-capability" key={name} aria-label={`Host 请求 ${name}`}>
                <div className="material-capability-heading">
                  <div className="material-title-with-info">
                    <h3>
                      <code translate="no">{name}</code>
                    </h3>
                    <MaterialDescription
                      title={`查看 ${name} Host 请求说明`}
                      text={annotations[pointer] ?? '通过 requests 映射到 Host 注册的能力。'}
                    />
                  </div>
                  <div className="material-capability-actions">
                    {setupButton(name, setup)}
                    {openButton(
                      '查看类型与值示例',
                      name + ' · 类型与值示例',
                      <>
                        <section>
                          <h3>请求签名与类型</h3>
                          <pre className="contract-type">
                            <code>
                              {[
                                `${name}(payload: RequestInput): Promise<RequestResult>`,
                                `type RequestInput = ${schemaType(request.payloadSchema)}`,
                                `type RequestResult = ${schemaType(request.resultSchema)}`,
                              ].join('\n\n')}
                            </code>
                          </pre>
                        </section>
                        {requestExamples?.[name]?.map((sample, index) => (
                          <section key={index}>
                            <h3>{sample.title}</h3>
                            <p>{sample.description}</p>
                            <JsonEditor
                              label={`${name} 示例 ${index + 1}`}
                              text={JSON.stringify(sample.value)}
                              initialMode="text"
                            />
                          </section>
                        ))}
                      </>,
                    )}
                    {openButton(
                      '查看原始请求契约',
                      name + ' · 原始请求契约',
                      <JsonEditor
                        label="原始请求契约"
                        text={JSON.stringify({ [name]: request })}
                        initialMode="text"
                      />,
                    )}
                  </div>
                </div>
                <dl className="material-capability-meta">
                  {setup && (
                    <div>
                      <dt>Host 映射示例</dt>
                      <dd>
                        <code>{setup.name}</code>
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>并发策略</dt>
                    <dd>
                      <code>{strategy}</code> ·{' '}
                      {strategy === 'latest' ? '仅交付最新请求结果' : '各次请求独立交付'}
                    </dd>
                  </div>
                </dl>
                <div className="contract-columns">
                  <section aria-label="请求参数">
                    <h4>请求参数</h4>
                    <ContractTable
                      schema={request.payloadSchema}
                      pointer={pointer + '/payloadSchema'}
                      annotations={annotations}
                    />
                  </section>
                  <section aria-label="返回结果">
                    <h4>返回结果</h4>
                    <ContractTable
                      schema={request.resultSchema}
                      pointer={pointer + '/resultSchema'}
                      annotations={annotations}
                    />
                  </section>
                </div>
              </section>
            );
          })}
        </section>
      )}
      {dialog && (
        <Modal
          title={dialog.title}
          size="wide"
          returnFocus={dialog.trigger}
          onClose={() => setDialog(undefined)}
        >
          <div className="material-detail-dialog-content">{dialog.content}</div>
        </Modal>
      )}
    </>
  );
}
