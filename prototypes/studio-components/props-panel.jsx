import React, { useEffect, useId, useRef, useState } from 'react';
import { transform } from 'sucrase';
import { Button, Textarea } from '../../apps/studio/src/components/ui';

const descriptions = {
  activateOnFocus: '用方向键移动焦点时，同时切换标签页。',
  after: '用于差异对比的新名称。',
  allowValidation: '允许表达式引用校验结果。',
  before: '用于差异对比的原名称。',
  bordered: '显示标签页边框。',
  children: '按钮显示的文字。',
  clear: '示例是否传入 onClear 回调，显示清除条件操作。',
  compactArguments: '紧凑展示表达式参数。',
  density: '控制栅格的内边距和间距。',
  description: '向用户解释字段用途的帮助文字。',
  disabled: '禁用组件交互。',
  empty: '向卡片列表传入空数组，查看空态。',
  emptyText: '列表没有条目时显示的文字。',
  grouped: '将示例选项按发布阶段分组。',
  hideable: '设置状态列的 columns[].hideable，允许用户在列设置中隐藏它。',
  id: '要展示的记录标识。',
  label: '控件或区域的名称，也用于辅助技术识别。',
  modal: '以模态方式打开浮层，将焦点限制在浮层内。',
  multiple: '允许选择多个值。',
  name: '试填表单的姓名初始值。',
  orientation: '标签列表的排列方向。',
  placeholder: '输入为空时显示的提示文字。',
  readOnly: '保留查看能力，禁止修改内容。',
  required: '提交时要求该字段有值。',
  rows: '文本框初始显示的行数。',
  search: '示例是否传入 onSearch 回调，显示搜索操作。',
  sendDisabled: '禁用发送操作。',
  sendLabel: '发送按钮的文字。',
  size: '控件的展示尺寸。',
  sortable: '设置版本列的 columns[].sortable，允许点击列头排序。',
  span: '每个子项在十二列栅格中占用的列数。',
  title: '浮层标题，也用于示例的打开按钮。',
  total: '供分页器计算页数的记录总数。',
  type: '选择浏览器的输入方式。',
  validationMode: '决定提交、失焦或编辑时触发校验。',
  variant: '按钮的视觉样式。',
};

function sourceFor(story, overrides) {
  const [, spec, source] = story;
  const attributes = Object.entries(spec).map(([key, rule]) => {
    const value = overrides[key] ?? (Array.isArray(rule) ? rule[0] : rule);
    return key + '={' + JSON.stringify(value) + '}';
  });
  return (
    source.imports +
    '\n\n' +
    source.body +
    '\n\nexport default function Example() {\n  return <' +
    source.component +
    '\n    ' +
    attributes.join('\n    ') +
    '\n  />;\n}\n'
  );
}

class PreviewBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    this.props.onError(error.message);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Runner({ story, overrides }) {
  const [Example, spec, { modules }] = story;
  const [preview, setPreview] = useState(() => {
    const defaults = Object.fromEntries(
      Object.entries(spec).map(([key, rule]) => [
        key,
        overrides[key] ?? (Array.isArray(rule) ? rule[0] : rule),
      ]),
    );
    return <Example {...defaults} />;
  });
  const surface = useRef(null);
  useEffect(() => {
    const reply = (data) => window.parent.postMessage(data, '*');
    function receive(event) {
      if (event.source !== window.parent || event.data?.type !== 'handbook-run') return;
      const { code, revision } = event.data;
      try {
        const compiled = transform(code, { transforms: ['jsx', 'imports'], production: true }).code;
        const exports = {};
        const load = (path) => {
          if (!Object.hasOwn(modules, path)) throw new Error('此预览未载入模块 ' + path);
          return modules[path];
        };
        new Function('require', 'exports', compiled)(load, exports);
        const Example = exports.default;
        if (typeof Example !== 'function') throw new Error('请用 export default 导出示例组件。');
        const onError = (message) => reply({ type: 'handbook-result', revision, message });
        setPreview(
          <PreviewBoundary key={revision} onError={onError}>
            <Example />
          </PreviewBoundary>,
        );
        onError('');
      } catch (error) {
        reply({ type: 'handbook-result', revision, message: error.message });
      }
    }
    function measure() {
      const overlay = document.querySelector(
        'dialog[open], [role="dialog"], [role="menu"], [role="listbox"], [role="tooltip"]',
      );
      reply({
        type: 'handbook-height',
        height: document.querySelector('main').getBoundingClientRect().height,
        overlay: Boolean(overlay),
      });
    }
    const observer = new ResizeObserver(measure);
    const portals = new MutationObserver(measure);
    portals.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'hidden', 'role'],
    });
    observer.observe(surface.current);
    const reportError = (event) =>
      reply({ type: 'handbook-event-error', message: event.message || String(event.reason) });
    window.addEventListener('error', reportError);
    window.addEventListener('unhandledrejection', reportError);
    window.addEventListener('message', receive);
    reply({ type: 'handbook-ready' });
    return () => {
      observer.disconnect();
      portals.disconnect();
      window.removeEventListener('message', receive);
      window.removeEventListener('error', reportError);
      window.removeEventListener('unhandledrejection', reportError);
    };
  }, [modules]);
  return (
    <div className="specimen" ref={surface}>
      {preview}
    </div>
  );
}

function SourceEditor({ story, overrides }) {
  const [, spec] = story;
  const initialCode = sourceFor(story, overrides);
  const [code, setCode] = useState(initialCode);
  const [resetCount, setResetCount] = useState(0);
  const [error, setError] = useState('');
  const revision = useRef(0);
  const id = useId();
  useEffect(() => {
    function receive(event) {
      if (event.source !== window.parent) return;
      const data = event.data;
      if (
        (data?.type === 'handbook-result' && data.revision === revision.current) ||
        data?.type === 'handbook-event-error'
      )
        setError(data.message);
    }
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);
  useEffect(() => {
    // Loading a lazy editor must preserve interaction already started in the preview.
    if (revision.current === 0 && code === initialCode && resetCount === 0) return;
    const next = ++revision.current;
    const timeout = setTimeout(
      () => window.parent.postMessage({ type: 'handbook-run', revision: next, code }, '*'),
      180,
    );
    return () => clearTimeout(timeout);
  }, [code, initialCode, resetCount]);
  return (
    <>
      <section className="props-panel">
        <header>
          <label htmlFor={id}>组件使用代码 · JSX</label>
          <Button
            variant="text"
            onClick={() => {
              setCode(initialCode);
              setResetCount((n) => n + 1);
            }}
          >
            重置示例
          </Button>
        </header>
        <p>直接修改 JSX、状态或事件回调，运行结果会随代码更新。</p>
        <Textarea
          id={id}
          render={<textarea spellCheck={false} />}
          aria-describedby={id + '-error'}
          aria-invalid={Boolean(error)}
          value={code}
          onChange={(event) => setCode(event.currentTarget.value)}
        />
        <p id={id + '-error'} role="status">
          {error}
        </p>
        <details>
          <summary>属性用途与取值</summary>
          <dl>
            {Object.entries(spec).map(([key, rule]) => (
              <div key={key}>
                <dt>
                  <code>{key}</code>
                </dt>
                <dd>
                  {descriptions[key]} {Array.isArray(rule) && '可选值：' + rule.join('、') + '。'}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      </section>
    </>
  );
}

export function Playground({ story, overrides = {} }) {
  return location.search === '?run' ? (
    <Runner story={story} overrides={overrides} />
  ) : (
    <SourceEditor story={story} overrides={overrides} />
  );
}
