'use client';
import { useState, useRef, type ReactNode } from 'react';
import type { DataReference, ScopeBinder } from '@form-engine/protocol/definition';
import { Button, Dialog, Input } from '@form-engine/studio-design-components';
import {
  FieldTree,
  type FieldTreeMetadata,
  type FieldTreeNode,
  type FieldTreeSelection,
} from '../field-tree';
import { reactionFields, schemaTypeLabel } from '../../app/reaction-fields';

export type FieldOption = {
  ref: DataReference;
  label: string;
  type: string;
  disabledReason?: string;
  selectable?: boolean;
  required?: boolean;
  children?: readonly FieldOption[];
};
type PickerNode = FieldTreeNode & { field: FieldOption };

export type FieldPickerProps = {
  fields: readonly FieldOption[];
  label: string;
  description?: ReactNode;
  showPath?: boolean;
  metadata?: FieldTreeMetadata<PickerNode>;
} & (
  | { multiple?: false; value: DataReference | null; onChange: (field: DataReference) => void }
  | { multiple: true; value: readonly DataReference[]; onChange: (fields: DataReference[]) => void }
);
const identity = (ref: DataReference) => JSON.stringify([ref.scope ?? null, ref.path]);

export function fieldsFromSchema(
  schema: unknown,
  {
    scopes = [],
    getDisabledReason,
  }: {
    scopes?: readonly ScopeBinder[];
    getDisabledReason?: (field: FieldOption) => string | undefined;
  } = {},
): FieldOption[] {
  return fieldsFromReactionFields(reactionFields(schema, scopes), getDisabledReason);
}

export function fieldsFromReactionFields(
  fields: ReturnType<typeof reactionFields>,
  getDisabledReason?: (field: FieldOption) => string | undefined,
): FieldOption[] {
  const roots: FieldOption[] = [],
    byId = new Map<string, FieldOption & { children: FieldOption[] }>();
  for (const { ref, title, schema: shape } of fields) {
    const type = schemaTypeLabel(shape);
    const node: FieldOption & { children: FieldOption[] } = {
      label: title || (ref.path === '' ? (ref.scope ?? '表单根') : ref.path),
      ref,
      type,
      children: [],
    };
    node.disabledReason = getDisabledReason?.(node);
    byId.set(identity(ref), node);
  }
  for (const node of byId.values()) {
    const { ref } = node;
    const parent =
      ref.path &&
      byId.get(identity({ ...ref, path: ref.path.slice(0, ref.path.lastIndexOf('/')) }));
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function FieldPicker(props: FieldPickerProps) {
  const { fields, multiple, value, onChange, label, description, showPath, metadata } = props;
  const trigger = useRef<HTMLButtonElement>(null);
  const [container, setContainer] = useState<HTMLElement>();
  const [draft, setDraft] = useState<DataReference[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(new Set<string>());
  const keyOf = (field: FieldOption) => identity(field.ref);
  const term = query.trim().toLocaleLowerCase();
  const byId = new Map<string, { field: FieldOption; label: string }>(),
    visible = new Set<string>();
  const parents = new Map<string, string | undefined>();
  function inspect(field: FieldOption, trail: string[], parent?: string): boolean {
    const key = keyOf(field);
    parents.set(key, parent);
    const labels = [...trail, field.label];
    byId.set(key, { field, label: labels.join(' / ') });
    let match = [field.label, field.ref.path, field.ref.scope]
      .join(' ')
      .toLocaleLowerCase()
      .includes(term);
    for (const child of field.children ?? []) if (inspect(child, labels, key)) match = true;
    if (match) visible.add(key);
    return match;
  }
  fields.forEach((field) => inspect(field, []));
  const missing = draft.some((ref) => {
    const entry = byId.get(identity(ref));
    return !entry || entry.field.selectable === false || !!entry.field.disabledReason;
  });
  const changeOpen = (next: boolean) => {
    if (next) {
      setContainer(trigger.current?.closest('dialog') ?? undefined);
      setDraft(multiple ? [...value] : value ? [value] : []);
      setQuery('');
      const opened = new Set(
        fields.flatMap((root) => [keyOf(root), ...(root.children ?? []).slice(0, 1).map(keyOf)]),
      );
      for (const selected of multiple ? value : value ? [value] : []) {
        let parent = parents.get(identity(selected));
        while (parent !== undefined) {
          opened.add(parent);
          parent = parents.get(parent);
        }
      }
      setExpanded(opened);
    }
    setOpen(next);
  };
  const draftById = new Map(draft.map((ref) => [identity(ref), ref]));
  const selection: FieldTreeSelection = multiple
    ? {
        mode: 'multiple',
        value: [...draftById.keys()],
        onChange: (ids) =>
          setDraft(
            ids.flatMap((id) => {
              const ref = draftById.get(id) ?? byId.get(id)?.field.ref;
              return ref ? [ref] : [];
            }),
          ),
      }
    : {
        mode: 'single',
        value: draft[0] ? identity(draft[0]) : null,
        onChange: (id) => {
          const field = byId.get(id)?.field;
          if (field) setDraft([field.ref]);
        },
      };
  function toggle(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }
  const nodes = [...byId]
    .filter(([id]) => visible.has(id))
    .map<PickerNode>(([id, { field, label }]) => ({
      id,
      label: field.label,
      accessibleLabel: label,
      field,
      parentId: parents.get(id),
      path: field.ref.path || undefined,
      metadata: { type: field.type, required: field.required },
      disabledReason: field.disabledReason,
      selectable: field.selectable,
    }));
  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger ref={trigger} render={<Button variant="secondary" />}>
        {label}
      </Dialog.Trigger>
      <Dialog.Portal container={container}>
        <Dialog.Backdrop />
        <Dialog.Popup className="picker-dialog">
          <header className="picker-header">
            <Dialog.Title>{label}</Dialog.Title>
            {description && <Dialog.Description>{description}</Dialog.Description>}
            <Input
              type="search"
              aria-label="搜索字段"
              placeholder="搜索字段名或路径"
              value={query}
              onValueChange={setQuery}
            />
          </header>
          <div className="picker-panes">
            <div className="picker-results">
              <FieldTree
                label="字段层级"
                {...{ nodes, selection, showPath, metadata }}
                isExpanded={(id) => !!term || expanded.has(id)}
                lockExpansion={!!term}
                onToggle={toggle}
              />
              {!visible.size && (
                <p role="status">{fields.length ? '没有匹配的字段' : '表单尚无字段'}</p>
              )}
            </div>
            {multiple && (
              <section className="picker-selection" aria-label="已选字段">
                <h3>已选 {draft.length} 项</h3>
                {draft.map((ref) => (
                  <p key={identity(ref)}>
                    <span>{byId.get(identity(ref))?.label ?? '已失效字段'}</span>{' '}
                    <Button
                      variant="text"
                      aria-label={'移除 ' + (byId.get(identity(ref))?.label ?? '已失效字段')}
                      onClick={() => setDraft(draft.filter((r) => identity(r) !== identity(ref)))}
                    >
                      移除
                    </Button>
                  </p>
                ))}
              </section>
            )}
          </div>
          {missing && <p role="alert">原选择已失效，请重新选择。</p>}
          <footer>
            <Dialog.Close render={<Button variant="secondary" />}>取消</Dialog.Close>
            <Button
              disabled={missing || (!multiple && !draft.length)}
              onClick={() => {
                if (multiple) onChange(draft);
                else if (draft[0]) onChange(draft[0]);
                setOpen(false);
              }}
            >
              应用选择
            </Button>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
