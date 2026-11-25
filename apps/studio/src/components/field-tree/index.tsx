'use client';

import {
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Tooltip, TreeView } from '@form-engine/studio-design-components';
import './field-tree.css';

export type FieldTreeNode = {
  id: string;
  parentId?: string;
  label: string;
  path?: string;
  metadata?: { type?: string; required?: boolean };
  selectable?: boolean;
  disabledReason?: string;
  accessibleLabel?: string;
};

export type FieldTreeMetadata<T extends FieldTreeNode = FieldTreeNode> =
  | false
  | {
      fields?: readonly ('type' | 'required')[];
      extra?: (node: T) => readonly string[];
    };

export type FieldTreeSelection =
  | { mode: 'none' }
  | { mode: 'single'; value: string | null; onChange: (id: string) => void }
  | { mode: 'multiple'; value: readonly string[]; onChange: (ids: string[]) => void };

type BrowseAttributes = Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'title'> & {
  [key: `data-${string}`]: string | undefined;
};

export type FieldTreeProps<T extends FieldTreeNode> = {
  nodes: readonly T[];
  label: string;
  showPath?: boolean;
  metadata?: FieldTreeMetadata<T>;
  selection?: FieldTreeSelection;
  activeId?: string;
  disabled?: boolean;
  density?: 'regular' | 'compact';
  isExpanded: (id: string) => boolean;
  onToggle: (id: string) => void;
  lockExpansion?: boolean;
  toggleLabel?: (node: T, open: boolean) => string;
  onActivate?: (node: T, event: MouseEvent<HTMLButtonElement>) => void;
  onDrag?: (node: T, event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: () => void;
  browseButtonProps?: (node: T) => BrowseAttributes;
  renderActions?: (node: T, state: { tabIndex: number; disabled: boolean }) => ReactNode;
};

const defaultFields = ['type', 'required'] as const;
const browse = { mode: 'none' } as const;
const typeLabels: Record<string, string> = {
  object: '对象',
  array: '数组',
  string: '文本',
  number: '数值',
  integer: '整数',
  boolean: '布尔值',
  null: '空值',
};

export function FieldTree<T extends FieldTreeNode>({
  nodes,
  label,
  showPath = true,
  metadata,
  selection = browse,
  activeId,
  disabled,
  density,
  isExpanded,
  onToggle,
  lockExpansion,
  toggleLabel,
  onActivate,
  onDrag,
  onDragEnd,
  browseButtonProps,
  renderActions,
}: FieldTreeProps<T>) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const [portal, setPortal] = useState<HTMLElement>();
  const [reported, setReported] = useState<string>();
  const selected = new Set(
    selection.mode === 'multiple'
      ? selection.value
      : [selection.mode === 'single' ? selection.value : activeId],
  );
  return (
    <div className="studio-field-tree" ref={container}>
      <TreeView
        {...{ label, density, isExpanded, onToggle, lockExpansion }}
        singleLine
        multiple={selection.mode === 'multiple'}
        nodes={nodes.map((node, index) => ({
          id: node.id,
          parent: node.parentId,
          label: node.label,
          selected: selected.has(node.id),
          node,
          descriptionId: id + '-' + index,
        }))}
        toggleLabel={toggleLabel && (({ node }, open) => toggleLabel(node, open))}
        renderItem={({ node, selected: checked, descriptionId }, focus) => {
          const path = showPath && node.path !== node.label ? node.path : undefined;
          const details =
            metadata === false
              ? []
              : [
                  ...(metadata?.fields ?? defaultFields).map((field) => {
                    if (field === 'required') return node.metadata?.required ? '必填' : undefined;
                    return node.metadata?.type
                      ?.split(/( [|·/] )/)
                      .map((type) => (Object.hasOwn(typeLabels, type) ? typeLabels[type] : type))
                      .join('');
                  }),
                  ...(metadata?.extra?.(node) ?? []),
                ].filter(Boolean);
          const reason = node.disabledReason;
          const blocked = !!(disabled || reason);
          const hasChoice = selection.mode !== 'none' && node.selectable !== false;
          const name = node.accessibleLabel ?? node.label;
          const describedBy =
            [
              path !== undefined && descriptionId + '-path',
              details.length > 0 && descriptionId + '-meta',
              reason && descriptionId + '-reason',
            ]
              .filter(Boolean)
              .join(' ') || undefined;
          const content = (
            <span className="studio-field-row-content">
              <span className="studio-field-row-identity">
                <span className="studio-field-row-label">{node.label}</span>
                {path !== undefined && (
                  <code className="studio-field-row-path" id={descriptionId + '-path'}>
                    {path || '（自身）'}
                  </code>
                )}
              </span>
              {details.length > 0 && (
                <small className="studio-field-row-meta" id={descriptionId + '-meta'}>
                  {details.join(' · ')}
                </small>
              )}
              {reason && (
                <span hidden id={descriptionId + '-reason'}>
                  {reason}
                </span>
              )}
            </span>
          );
          const buttonProps = browseButtonProps?.(node);
          const control = hasChoice ? (
            <label
              className="studio-field-row studio-field-choice"
              data-disabled={blocked || undefined}
            >
              <input
                {...(!blocked && focus)}
                type={selection.mode === 'multiple' ? 'checkbox' : 'radio'}
                name={selection.mode === 'single' ? id : undefined}
                checked={checked}
                disabled={blocked}
                aria-label={name}
                aria-describedby={describedBy}
                onChange={() => {
                  if (selection.mode === 'single') selection.onChange(node.id);
                  if (selection.mode === 'multiple')
                    selection.onChange(
                      checked
                        ? selection.value.filter((key) => key !== node.id)
                        : [...selection.value, node.id],
                    );
                }}
              />
              {content}
            </label>
          ) : selection.mode === 'none' && onActivate && node.selectable !== false ? (
            <button
              {...focus}
              {...buttonProps}
              className={['studio-field-row', buttonProps?.className].filter(Boolean).join(' ')}
              type="button"
              aria-label={name}
              aria-describedby={describedBy}
              aria-disabled={blocked || undefined}
              aria-pressed={checked}
              draggable={!!onDrag && !blocked}
              onClick={(event) => {
                setReported(reason ? node.id : undefined);
                if (!blocked) onActivate(node, event);
              }}
              onDragStart={onDrag && !blocked ? (event) => onDrag(node, event) : undefined}
              onDragEnd={onDragEnd}
            >
              {content}
            </button>
          ) : (
            <span
              className="studio-field-row"
              {...focus}
              aria-label={name}
              aria-describedby={describedBy}
            >
              {content}
            </span>
          );
          const target =
            blocked && hasChoice ? (
              <span
                className="studio-field-disabled"
                {...focus}
                aria-label={name}
                aria-describedby={describedBy}
              >
                {control}
              </span>
            ) : (
              control
            );
          return (
            <>
              {reason ? (
                <Tooltip.Root
                  onOpenChange={(open) => {
                    if (open)
                      setPortal(
                        container.current?.closest<HTMLElement>('dialog, [role="dialog"]') ??
                          undefined,
                      );
                  }}
                >
                  <Tooltip.Trigger render={target} delay={250} />
                  <Tooltip.Portal container={portal}>
                    <Tooltip.Positioner
                      className="studio-field-reason-positioner"
                      side="bottom"
                      align="start"
                      sideOffset={4}
                    >
                      <Tooltip.Popup role="tooltip" className="studio-field-reason">
                        {reason}
                      </Tooltip.Popup>
                    </Tooltip.Positioner>
                  </Tooltip.Portal>
                </Tooltip.Root>
              ) : (
                target
              )}
              {reported === node.id && reason && (
                <small className="studio-field-unavailable" role="status">
                  {reason}
                </small>
              )}
              {renderActions &&
                (blocked ? (
                  <div className="studio-field-action-boundary" inert>
                    {renderActions(node, { tabIndex: -1, disabled: true })}
                  </div>
                ) : (
                  renderActions(node, { tabIndex: focus.tabIndex, disabled: false })
                ))}
            </>
          );
        }}
      />
    </div>
  );
}
