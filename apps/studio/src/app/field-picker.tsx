'use client';

import { useId, useState, type ReactNode } from 'react';
import type { DataReference } from '@form-engine/protocol/definition';
import {
  FieldTree,
  type FieldTreeNode,
  type FieldTreeProps,
  type FieldTreeSelection,
} from '../components/field-tree';
import { Button, Input } from '../components/ui';
import { Modal } from './modal';
import './layout-field-picker.css';

export type FieldRow = FieldTreeNode & {
  depth: number;
  path: string;
  detail?: string;
  unavailable?: string;
  choiceLabel?: string;
};

export function SearchableFieldTree({
  rows,
  autoFocus,
  showPath = true,
  options,
  ...tree
}: Omit<
  FieldTreeProps<FieldRow>,
  'nodes' | 'label' | 'isExpanded' | 'onToggle' | 'lockExpansion'
> & {
  rows: readonly FieldRow[];
  autoFocus?: boolean;
  showPath?: boolean;
  options?: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [closed, setClosed] = useState(new Set<string>());
  const search = query.trim().toLocaleLowerCase();
  const byId = new Map(rows.map((row) => [row.id, row]));
  const matches = new Set<string>();
  if (search)
    for (const row of rows) {
      const extra = tree.metadata === false ? [] : (tree.metadata?.extra?.(row) ?? []);
      if (
        ![row.label, row.path, row.metadata?.type, row.detail, row.choiceLabel, ...extra]
          .join(' ')
          .toLocaleLowerCase()
          .includes(search)
      )
        continue;
      let match: FieldRow | undefined = row;
      while (match && !matches.has(match.id)) {
        matches.add(match.id);
        match = match.parentId ? byId.get(match.parentId) : undefined;
      }
    }
  const nodes = rows
    .filter((row) => !search || matches.has(row.id))
    .map((row) => ({
      ...row,
      accessibleLabel: row.choiceLabel,
      metadata: row.metadata ?? { type: row.detail },
      disabledReason: row.unavailable,
    }));
  return (
    <div className="layout-field-tree">
      <div className="field-picker-searchbar">
        <div className="field-picker-search">
          <Input
            type="search"
            autoFocus={autoFocus}
            aria-label="搜索字段"
            placeholder="搜索字段名、字段键或路径"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {options && <div className="field-picker-options">{options}</div>}
      </div>
      <FieldTree
        {...tree}
        label="字段层级"
        nodes={nodes}
        showPath={showPath}
        isExpanded={(id) => !!search || !closed.has(id)}
        lockExpansion={!!search}
        onToggle={(id) =>
          setClosed((current) => {
            const next = new Set(current);
            if (!next.delete(id)) next.add(id);
            return next;
          })
        }
      />
      {!nodes.length && <p role="status">没有匹配的字段</p>}
    </div>
  );
}

export type FieldSelection = { id: string; label: string };

type FieldPickerDialogProps = {
  title: string;
  rows: FieldRow[];
  selected: FieldSelection[];
  onSelect: (id: string) => void;
  multiple?: boolean;
  options?: ReactNode;
  onRemove?: (id: string) => void;
  onApply: () => void;
  onClose: () => void;
  nativeChoice?: boolean;
  busy?: boolean;
  feedback?: string;
  selectedRowIds?: string[];
};

export function FieldPickerDialog({
  title,
  onClose,
  onApply,
  feedback,
  ...props
}: FieldPickerDialogProps) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      closeDisabled={props.busy}
      customChrome
      className={
        props.multiple ? 'field-picker-dialog field-picker-multiple' : 'field-picker-dialog'
      }
    >
      <FieldPickerContent {...props} />
      {feedback && <p role="alert">{feedback}</p>}
      <footer className="field-picker-footer">
        <button type="button" className="quiet" disabled={props.busy} onClick={onClose}>
          取消
        </button>
        <button
          type="button"
          className="field-picker-apply"
          disabled={props.busy || (!props.multiple && !props.selected.length)}
          onClick={onApply}
        >
          应用选择
        </button>
      </footer>
    </Modal>
  );
}

export function FieldPickerContent({
  rows,
  selected,
  onSelect,
  multiple = false,
  options,
  onRemove,
  nativeChoice = false,
  busy = false,
  selectedRowIds = selected.map(({ id }) => id),
}: Omit<FieldPickerDialogProps, 'title' | 'onApply' | 'onClose' | 'feedback'>) {
  const selection: FieldTreeSelection = multiple
    ? {
        mode: 'multiple',
        value: selectedRowIds,
        onChange: (next) => {
          const changed =
            next.find((id) => !selectedRowIds.includes(id)) ??
            selectedRowIds.find((id) => !next.includes(id));
          if (changed !== undefined) onSelect(changed);
        },
      }
    : nativeChoice
      ? {
          mode: 'single',
          value: selectedRowIds[0] ?? null,
          onChange: onSelect,
        }
      : { mode: 'none' };
  const candidates =
    selection.mode === 'none'
      ? rows.map((row) => ({
          ...row,
          choiceLabel: [row.label, row.path || '（自身）', row.detail ?? row.metadata?.type]
            .filter(Boolean)
            .join(' '),
        }))
      : rows;
  return (
    <div className="field-picker-body" data-multiple={multiple || undefined}>
      <SearchableFieldTree
        rows={candidates}
        activeId={selectedRowIds[0]}
        selection={selection}
        onActivate={(row) => onSelect(row.id)}
        options={options}
        disabled={busy}
        autoFocus
      />
      {multiple && (
        <aside className="field-picker-selection" aria-label="已选字段">
          <h3>已选 {selected.length} 项</h3>
          {!selected.length && <p>从字段树中选择。</p>}
          <ul>
            {selected.map(({ id, label }) => (
              <li key={id}>
                <span>{label}</span>
                <Button
                  variant="text"
                  disabled={busy}
                  aria-label={'移除 ' + label}
                  onClick={() => onRemove?.(id)}
                >
                  移除
                </Button>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}

export const fieldReferenceId = (ref: DataReference) =>
  JSON.stringify([ref.scope ?? null, ref.path]);

export function referenceFieldRows(
  fields: readonly {
    ref: DataReference;
    label?: string;
    detail?: string;
    unavailable?: string;
  }[],
): FieldRow[] {
  const rows = new Map<string, FieldRow>();
  function add(ref: DataReference): FieldRow {
    const id = fieldReferenceId(ref);
    const existing = rows.get(id);
    if (existing) return existing;
    const { scope, path } = ref;
    const slash = path.lastIndexOf('/');
    const key = path
      .slice(slash + 1)
      .replaceAll('~1', '/')
      .replaceAll('~0', '~');
    const parent = path ? add({ ...ref, path: path.slice(0, slash) }) : undefined;
    const row: FieldRow = {
      id,
      parentId: parent?.id,
      depth: parent ? parent.depth + 1 : 0,
      label: path ? key || '（空键）' : (scope ?? '表单根'),
      path,
      choiceLabel: (scope ?? '表单根') + ' · ' + (path || '（自身）'),
      selectable: false,
    };
    rows.set(id, row);
    return row;
  }
  for (const field of fields) {
    const row = add(field.ref);
    row.label = field.label ?? row.label;
    row.detail = field.detail;
    row.unavailable = field.unavailable;
    row.selectable = true;
  }
  return [...rows.values()];
}

export function FieldPickerControl({
  label,
  rows,
  value,
  valueLabel,
  onChange,
}: {
  label: string;
  rows: FieldRow[];
  value?: string;
  valueLabel?: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string>();
  const summary = useId();
  const chosen = rows.find(
    (row) => row.id === pending && row.selectable !== false && !row.unavailable,
  );
  const current = rows.find((row) => row.id === value);
  return (
    <div className="layout-field-control">
      <button
        type="button"
        className="quiet"
        aria-haspopup="dialog"
        aria-label={label}
        aria-describedby={summary}
        onClick={() => {
          setPending(value);
          setOpen(true);
        }}
      >
        {label} <span aria-hidden="true">›</span>
      </button>
      <small id={summary}>
        {valueLabel ?? (current ? (current.choiceLabel ?? current.label) : '未选择字段')}
      </small>
      {open && (
        <FieldPickerDialog
          title={label}
          rows={rows}
          selected={chosen ? [{ id: chosen.id, label: chosen.label }] : []}
          onSelect={setPending}
          onApply={() => {
            if (chosen) onChange(chosen.id);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
