'use client';

import { child, semanticModel, type Model } from './semantic-model';
import { removeLayoutMember } from './layout-token-edit';

export function isLiteralOptionList(model: Model) {
  return (
    model.root.kind === 'array' &&
    !model.ambiguous.size &&
    (model.root.children ?? []).every(
      (row) =>
        row.kind === 'object' &&
        !!row.children?.every(
          (value) => (value.key === 'id' || value.key === 'label') && value.kind === 'string',
        ),
    )
  );
}

export function LayoutOptionList({ model, set }: { model: Model; set: (raw: string) => void }) {
  const entries = model.root.children ?? [];
  function move(index: number, by: -1 | 1) {
    const old = entries[index];
    const other = entries[index + by];
    if (!old || !other) return;
    const result = semanticModel(model.replace(old, model.raw(other)));
    set(result.replace(result.root.children![index + by]!, model.raw(old)));
  }
  return (
    <div className="layout-option-list">
      <p className="layout-option-help">填写用户看到的名称和提交时写入的值。</p>
      <div className="layout-option-head" aria-hidden="true">
        <span>显示名称</span>
        <span>写入值</span>
      </div>
      {!entries.length && <p className="layout-option-empty">暂无选项</p>}
      <ol>
        {entries.map((entry, index) => {
          const item = '第 ' + (index + 1) + ' 项';
          return (
            <li key={index}>
              <input
                aria-label={item + '显示名称'}
                placeholder="例如：基础计划"
                value={model.str(child(entry, 'label')) ?? ''}
                onChange={(e) =>
                  set(model.property(entry, 'label', JSON.stringify(e.target.value)))
                }
              />
              <input
                aria-label={item + '写入值'}
                placeholder="例如：basic"
                value={model.str(child(entry, 'id')) ?? ''}
                onChange={(e) => set(model.property(entry, 'id', JSON.stringify(e.target.value)))}
              />
              <div className="layout-option-actions">
                <button
                  type="button"
                  className="quiet"
                  aria-label={'上移' + item}
                  title="上移"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="quiet"
                  aria-label={'下移' + item}
                  title="下移"
                  disabled={index === entries.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="quiet layout-option-delete"
                  aria-label={'删除' + item}
                  title="删除"
                  onClick={() => set(removeLayoutMember(model.raw(model.root), entry))}
                >
                  ×
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="quiet layout-option-add"
        onClick={() => {
          const raw = model.raw(model.root);
          set(raw.slice(0, -1) + (entries.length ? ',' : '') + '{"id":"","label":""}]');
        }}
      >
        ＋ 添加选项
      </button>
    </div>
  );
}
