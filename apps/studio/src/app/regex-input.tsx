'use client';

import { useEffect, useId, useRef, useState } from 'react';

const templates = {
  digits: '固定长度数字',
  letters: '固定长度英文字母',
  prefix: '以指定文本开头',
} as const;

export function RegexInput({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const hintId = useId();
  const [template, setTemplate] = useState<keyof typeof templates>('digits');
  const [length, setLength] = useState('6');
  const [prefix, setPrefix] = useState('');
  const [sample, setSample] = useState('');
  const [result, setResult] = useState('');
  const stop = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => stop.current?.();
  }, [value, disabled]);

  const preview =
    template === 'prefix'
      ? prefix && '^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      : /^[1-9][0-9]{0,2}$/.test(length)
        ? `^${template === 'digits' ? '[0-9]' : '[A-Za-z]'}{${length}}$`
        : '';

  function clearResult() {
    stop.current?.();
    setResult('');
  }

  function test() {
    clearResult();
    try {
      const worker = new Worker(new URL('./regex-preview.worker.ts', import.meta.url));
      const timeout = window.setTimeout(() => finish('匹配超时，请简化表达式或缩短样例。'), 1000);
      function finish(message: string) {
        stop.current?.();
        setResult(message);
      }
      stop.current = () => {
        window.clearTimeout(timeout);
        worker.terminate();
        stop.current = null;
      };
      worker.onmessage = (event: MessageEvent<string>) => finish(event.data);
      worker.onerror = () => finish('无法运行正则测试，请重试。');
      setResult('正在测试…');
      worker.postMessage({ pattern: value, sample });
    } catch {
      stop.current?.();
      setResult('无法运行正则测试，请重试。');
    }
  }

  return (
    <div className="regex-input">
      <label>
        正则匹配
        <input
          aria-label="正则匹配"
          aria-describedby={hintId}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            clearResult();
            onChange(event.target.value);
          }}
        />
      </label>
      <small id={hintId}>
        填写表达式本体，例如 <code>{'^[0-9]{6}$'}</code> 表示整段文本为 6 位数字，无需加 /…/。
      </small>
      <details>
        <summary>正则模板</summary>
        <label>
          模板
          <select
            aria-label="正则模板"
            value={template}
            disabled={disabled}
            onChange={(event) => setTemplate(event.target.value as keyof typeof templates)}
          >
            {Object.entries(templates).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <small>选择要匹配的规则，例如「固定长度数字」。</small>
        </label>
        {template === 'prefix' ? (
          <label>
            开头文本
            <input
              aria-label="开头文本"
              value={prefix}
              disabled={disabled}
              onChange={(event) => setPrefix(event.target.value)}
            />
            <small>填写必须出现在开头的文字，例如 ORD-。</small>
          </label>
        ) : (
          <label>
            字符个数
            <input
              aria-label="字符个数"
              inputMode="numeric"
              value={length}
              disabled={disabled}
              onChange={(event) => setLength(event.target.value)}
            />
            <small>填写 1 到 999 的整数，例如 6。</small>
          </label>
        )}
        {preview && (
          <p>
            表达式预览 <code>{preview}</code>
          </p>
        )}
        <button
          type="button"
          className="quiet"
          disabled={disabled || !preview}
          onClick={() => {
            clearResult();
            onChange(preview);
          }}
        >
          {value ? '替换当前表达式' : '填入表达式'}
        </button>
      </details>
      <details>
        <summary>试样例</summary>
        <label>
          样例文本
          <input
            aria-label="样例文本"
            value={sample}
            disabled={disabled}
            onChange={(event) => {
              clearResult();
              setSample(event.target.value);
            }}
          />
          <small>输入一个可能的字段值，例如 012345；留空可测试空字符串。</small>
        </label>
        <button type="button" className="quiet" disabled={disabled || !value} onClick={test}>
          测试匹配
        </button>
        <p role="status">{result}</p>
      </details>
    </div>
  );
}
