'use client';

import { useState } from 'react';
import type { JsonValue } from '@form-engine/protocol';
import type { ViewNode } from '@form-engine/protocol/definition';
import type { ReadonlyPreparedForm } from '@form-engine/protocol/prepared';
import { JsonEditor } from '../components/json/json-editor';
import { Button, Tabs } from '../components/ui';
import { PreviewRuntime } from './preview-runtime';

export type MaterialPreview = {
  prepared: ReadonlyPreparedForm;
  data: JsonValue;
  configuration?: ViewNode;
};

export type MaterialPreviewVariant = MaterialPreview & { id: string; title: string };

export function MaterialDetailPreview({
  preview,
  variants = [],
  examples = [],
}: {
  preview?: MaterialPreview;
  variants?: MaterialPreviewVariant[];
  examples?: { source: string; value: unknown }[];
}) {
  const [selected, setSelected] = useState('default');
  const [revision, setRevision] = useState(0);
  const scenarios = preview ? [{ ...preview, id: 'default', title: '基础输入' }, ...variants] : [];
  const active = scenarios.find(({ id }) => id === selected);
  const configurations =
    active?.configuration === undefined ? examples : [{ source: '', value: active.configuration }];

  const reset = (
    <Button variant="secondary" onClick={() => setRevision((value) => value + 1)}>
      重置示例
    </Button>
  );
  return (
    <section className="material-detail-section" aria-label="物料效果预览">
      <h2>交互预览</h2>
      {preview && scenarios.length > 1 ? (
        <Tabs.Root size="sm" value={selected} onValueChange={setSelected}>
          <div className="material-preview-toolbar">
            <Tabs.List aria-label="预览场景">
              {scenarios.map(({ id, title }) => (
                <Tabs.Tab key={id} value={id}>
                  {title}
                </Tabs.Tab>
              ))}
            </Tabs.List>
            {selected === 'default' && reset}
          </div>
          <div className="material-preview-frame">
            {scenarios.map(({ id, prepared, data }) => (
              <Tabs.Panel
                key={id}
                value={id}
                keepMounted
                hidden={id !== selected}
                className="material-preview-canvas"
              >
                <PreviewRuntime
                  key={id === 'default' ? revision : id}
                  prepared={prepared}
                  data={data}
                />
              </Tabs.Panel>
            ))}
          </div>
        </Tabs.Root>
      ) : preview ? (
        <div>
          <div className="material-preview-toolbar">{reset}</div>
          <div className="material-preview-frame">
            <div className="material-preview-canvas">
              <PreviewRuntime key={revision} prepared={preview.prepared} data={preview.data} />
            </div>
          </div>
        </div>
      ) : (
        <p>此版本暂未提供可交互预览{configurations.length ? '，请参考物料使用配置。' : '。'}</p>
      )}
      {!!configurations.length && (
        <details className="material-preview-configuration">
          <summary>物料使用配置 · JSON</summary>
          {configurations.map(({ source, value }, index) => (
            <div key={index}>
              {source && <small>{source}</small>}
              <JsonEditor
                label={`物料使用配置 ${index + 1}`}
                text={JSON.stringify(value)}
                initialMode="text"
              />
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
