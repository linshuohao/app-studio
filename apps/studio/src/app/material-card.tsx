'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { JsonValue } from '@form-engine/protocol';
import type { ReadonlyPreparedForm } from '@form-engine/protocol/prepared';
import { platform } from './platform-api';
import { Button } from '@form-engine/studio-design-components';
import { catalogAssetPath } from './asset-binding-editor';
import { PreviewRuntime } from './preview-runtime';

type Preview = { prepared: ReadonlyPreparedForm; data: JsonValue };
export function MaterialCard({
  asset,
  onOpen,
  selected,
  detailsAction = false,
  onReference,
}: {
  asset: {
    id: string;
    version: string;
    artifact?: { digest: string };
    title?: string;
    summary?: string;
    category?: string;
    implementation?: string;
  };
  onOpen: (button: HTMLButtonElement) => void;
  detailsAction?: boolean;
  onReference?: () => void;
  selected?: boolean;
}) {
  const container = useRef<HTMLElement>(null);
  const previewFrame = useRef<HTMLDivElement>(null);
  const previewRender = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [preview, setPreview] = useState<Preview>();
  const [status, setStatus] = useState('正在加载预览…');
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '160px' },
    );
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    void platform<{ preview?: Preview }>(
      catalogAssetPath('materials', asset.id, asset.version, asset.artifact?.digest),
    ).then(
      (result) => {
        if (!active) return;
        setPreview(result.preview);
        setStatus(result.preview ? '' : '此版本暂无效果预览');
      },
      () => {
        if (active) setStatus('预览暂不可用，点击查看详情');
      },
    );
    return () => {
      active = false;
    };
  }, [visible, asset.id, asset.version, asset.artifact?.digest]);
  useLayoutEffect(() => {
    const frame = previewFrame.current;
    const render = previewRender.current;
    if (!frame || !render) return;

    function fitPreview(frame: HTMLDivElement, render: HTMLDivElement) {
      // Measure the unscaled layout so the transform does not feed back into sizing.
      const width = render.scrollWidth;
      const height = render.scrollHeight;
      if (!width || !height) return;

      const scale = Math.min(1, frame.clientWidth / width, frame.clientHeight / height);
      const x = (frame.clientWidth - width * scale) / 2;
      const y = (frame.clientHeight - height * scale) / 2;
      render.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    }

    const observer = new ResizeObserver(() => fitPreview(frame, render));
    observer.observe(frame);
    observer.observe(render);
    fitPreview(frame, render);
    return () => observer.disconnect();
  }, [preview]);
  const openProps = {
    'data-return-focus': 'material-' + asset.id + ':' + asset.version,
    'aria-current': selected ? (true as const) : undefined,
    'aria-label': '查看 ' + asset.id,
  };
  return (
    <article
      className="material-card"
      data-material={asset.id}
      data-details-action={detailsAction || undefined}
      ref={container}
    >
      <div className="material-card-preview" aria-hidden="true" inert>
        {preview ? (
          <div className="material-card-preview-frame" ref={previewFrame}>
            <div className="material-card-render" ref={previewRender}>
              <PreviewRuntime prepared={preview.prepared} data={preview.data} />
            </div>
          </div>
        ) : (
          <span className="material-card-placeholder">{status}</span>
        )}
      </div>
      <div className="material-card-info">
        <div className="material-card-heading">
          <h2>{asset.title || asset.id}</h2>
          <span translate="no">v{asset.version}</span>
        </div>
        {!detailsAction && (
          <div className="material-card-tags">
            <span>{asset.category || '未分类'}</span>
            <span>{asset.implementation || '未标注'}</span>
          </div>
        )}
        <p>{asset.summary || asset.id}</p>
      </div>
      {detailsAction ? (
        <footer className="material-card-actions">
          <small>
            {asset.category || '未分类'} · {asset.implementation || '未标注'}
          </small>
          {onReference && (
            <Button variant="text" aria-label={'引用到 Agent：' + asset.id} onClick={onReference}>
              引用到 Agent
            </Button>
          )}
          <Button
            variant="secondary"
            {...openProps}
            onClick={(event) => onOpen(event.currentTarget)}
          >
            查看详情
          </Button>
        </footer>
      ) : (
        <button
          type="button"
          {...openProps}
          className="material-card-open"
          onClick={(event) => onOpen(event.currentTarget)}
        >
          <span className="sr-only">查看{asset.title || asset.id}详情</span>
        </button>
      )}
    </article>
  );
}
