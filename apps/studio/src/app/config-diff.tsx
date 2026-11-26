'use client';
import { useEffect, useMemo, useState } from 'react';
import { CodeBlock } from '../components/code-block';
import { parseJson, type JsonNode } from '../components/json/model';
import { displayJson } from './format-json';
import { StudioSelect } from '@form-engine/studio-design-components/select';
import { Modal } from './modal';
import {
  failureMessage,
  platform,
  type Version,
  type VersionSummary,
  type Release,
} from './platform-api';
import { versionLabel } from './record-labels';

type Change = { path: string; kind: string; before?: string; after?: string };
function compare(left: string, right: string) {
  const changes: Change[] = [];
  const a = parseJson(left),
    b = parseJson(right);
  function visit(x?: JsonNode, y?: JsonNode) {
    const path = (x ?? y)!.path || '/';
    const before = x && a.tokens.slice(x.start, x.end).join('');
    const after = y && b.tokens.slice(y.start, y.end).join('');
    if (before === after) return;
    if (x?.children && y?.children && x.kind === y.kind) {
      const old = new Map(x.children.map((n) => [n.key, n])),
        next = new Map(y.children.map((n) => [n.key, n]));
      if (old.size !== x.children.length || next.size !== y.children.length)
        throw Error('对象含重复键');
      const common = x.children.filter((n) => next.has(n.key));
      const ordered = y.children.filter((n) => old.has(n.key));
      if (common.some((n, i) => n.key !== ordered[i].key))
        changes.push({ path, kind: '顺序调整', before, after });
      for (const [key, n] of old) {
        const other = next.get(key);
        if (
          other &&
          n.keyIndex !== undefined &&
          other.keyIndex !== undefined &&
          a.tokens[n.keyIndex] !== b.tokens[other.keyIndex]
        )
          throw Error('属性名转义发生变化');
        visit(n, other);
      }
      for (const [key, n] of next) if (!old.has(key)) visit(undefined, n);
    } else changes.push({ path, kind: !x ? '新增' : !y ? '删除' : '修改', before, after });
  }
  visit(a.root, b.root);
  return changes;
}
function Pair({ left, right }: { left?: string; right?: string }) {
  return (
    <div className="diff-pair">
      {[
        { label: '基准', source: left },
        { label: '当前', source: right },
      ].map(({ label, source }) => (
        <div key={label}>
          <small>{label}</small>
          <CodeBlock label={label} language="json" source={source ?? '（无）'} />
        </div>
      ))}
    </div>
  );
}
export function DiffResult({ texts }: { texts: [string, string] }) {
  const changes = useMemo(() => {
    try {
      return compare(...texts);
    } catch {
      return null;
    }
  }, [texts]);
  return (
    <>
      {changes ? (
        <>
          <p>
            {changes.length
              ? ['新增', '修改', '删除', '顺序调整']
                  .map((k) => k + ' ' + changes.filter((c) => c.kind === k).length)
                  .join(' · ')
              : '配置内容相同'}
          </p>
          {changes.map((c, i) => (
            <details key={i}>
              <summary>
                {c.kind}　{c.path}
              </summary>
              <Pair
                left={c.before === undefined ? undefined : displayJson(c.before)}
                right={c.after === undefined ? undefined : displayJson(c.after)}
              />
            </details>
          ))}
        </>
      ) : (
        <p>无法可靠比较结构，请查看原文。</p>
      )}
      <details open={!changes}>
        <summary>完整文本对比</summary>
        <Pair left={texts[0]} right={texts[1]} />
      </details>
    </>
  );
}
export function ConfigDiff({
  path,
  initialLeft,
  initialRight,
  draft,
  versions,
  choose,
  split = false,
  onClose,
}: {
  path: string;
  initialLeft: string;
  initialRight: string;
  draft: string;
  versions: VersionSummary[];
  choose: boolean;
  split?: boolean;
  onClose: () => void;
}) {
  const [left, setLeft] = useState(initialLeft),
    [right, setRight] = useState(initialRight);
  const [result, setResult] = useState<{
    key: string;
    texts?: [string, string];
    labels?: string[];
    error?: string;
  }>();
  const key = JSON.stringify([path, left, right]);
  useEffect(() => {
    let active = true;
    async function read(id: string): Promise<{ text: string; label: string }> {
      if (id === 'draft') return { text: draft, label: '当前草稿' };
      if (id === 'latest-release') {
        const [last] = await platform<Release[]>(path + '/releases');
        if (!last) throw Error('首次发布，尚无上一次发布配置。');
        return read(last.versionId);
      }
      if (!id) throw Error('尚无可比较的基准版本。');
      const version = await platform<Version>(path + '/versions/' + id);
      return { text: version.text, label: versionLabel(version) };
    }
    Promise.all([read(left), read(right)]).then(
      ([a, b]) => {
        if (active) setResult({ key, texts: [a.text, b.text], labels: [a.label, b.label] });
      },
      (e) => {
        if (active) setResult({ key, error: e instanceof Error ? e.message : failureMessage(e) });
      },
    );
    return () => {
      active = false;
    };
  }, [path, left, right, draft, key]);
  return (
    <Modal
      wide={!split}
      size={split ? 'wide' : undefined}
      title="配置对比"
      closeLabel="返回"
      onClose={onClose}
    >
      <div className="config-diff">
        {choose && (
          <div className="diff-pair">
            {[left, right].map((id, i) => (
              <label key={i}>
                {i ? '当前版本' : '基准版本'}
                <StudioSelect value={id} onValueChange={i ? setRight : setLeft}>
                  {versions.map((v) => (
                    <option key={v.versionId} value={v.versionId}>
                      {versionLabel(v)}
                    </option>
                  ))}
                </StudioSelect>
              </label>
            ))}
          </div>
        )}
        {result?.key !== key ? (
          <p role="status">正在读取配置…</p>
        ) : result.error ? (
          <p role="status">{result.error}</p>
        ) : (
          result.texts && (
            <>
              {!choose && <p>{result.labels?.join(' → ')}</p>}
              <DiffResult texts={result.texts} />
            </>
          )
        )}
      </div>
    </Modal>
  );
}
