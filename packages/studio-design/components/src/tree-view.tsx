'use client';

import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from './controls';
import { Icon } from './icon';
import './tree-view.css';

export type TreeViewNode = {
  id: string;
  parent?: string;
  label: string;
  selected?: boolean;
};

// The caller supplies stable IDs and parent relationships and owns selection, filtering, and expansion.
export function TreeView<T extends TreeViewNode>({
  label,
  nodes,
  isExpanded,
  onToggle,
  renderItem,
  density = 'regular',
  singleLine = density === 'compact',
  multiple,
  lockExpansion,
  toggleLabel = (row, open) => (open ? '收起 ' : '展开 ') + row.label,
}: {
  label: string;
  nodes: readonly T[];
  isExpanded: (id: string) => boolean;
  onToggle: (id: string) => void;
  renderItem: (node: T, focusProps: { tabIndex: number; 'data-tree-focus': true }) => ReactNode;
  density?: 'regular' | 'compact';
  singleLine?: boolean;
  multiple?: boolean;
  lockExpansion?: boolean;
  toggleLabel?: (node: T, open: boolean) => string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState<string>();
  const children = new Map<string | undefined, T[]>();
  for (const node of nodes) {
    const siblings = children.get(node.parent);
    if (siblings) siblings.push(node);
    else children.set(node.parent, [node]);
  }
  const rows: T[] = [];
  const levels = new Map<string, number>();
  const positions = new Map<string, number>();
  function collect(parent: string | undefined, level: number) {
    children.get(parent)?.forEach((node, index) => {
      rows.push(node);
      levels.set(node.id, level);
      positions.set(node.id, index + 1);
      if (isExpanded(node.id)) collect(node.id, level + 1);
    });
  }
  collect(undefined, 1);
  const tabStop =
    focused !== undefined && levels.has(focused)
      ? focused
      : (rows.find((node) => node.selected) ?? rows[0])?.id;

  function navigate(event: KeyboardEvent, index: number) {
    const row = rows[index];
    let next = index;
    switch (event.key) {
      case 'ArrowDown':
        next++;
        break;
      case 'ArrowUp':
        next--;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = rows.length - 1;
        break;
      case 'ArrowRight':
        if (children.has(row.id)) {
          if (isExpanded(row.id)) next++;
          else if (!lockExpansion) onToggle(row.id);
        }
        break;
      case 'ArrowLeft':
        if (children.has(row.id) && isExpanded(row.id) && !lockExpansion) onToggle(row.id);
        else next = rows.findIndex((node) => node.id === row.parent);
        break;
      case 'Enter':
        if (!(event.target instanceof HTMLInputElement)) return;
        event.target.click();
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next !== index && rows[next])
      root.current?.querySelectorAll<HTMLElement>('[data-tree-focus]')[next]?.focus();
  }
  return (
    <div
      ref={root}
      role="tree"
      aria-label={label}
      aria-multiselectable={multiple || undefined}
      className="studio-tree"
      data-density={density}
      data-single-line={singleLine || undefined}
    >
      {rows.map((node, index) => {
        const level = levels.get(node.id)!;
        const open = children.has(node.id) ? isExpanded(node.id) : undefined;
        const pos = positions.get(node.id);
        return (
          // eslint-disable-next-line jsx-a11y/interactive-supports-focus -- The rendered control owns the roving focus stop for this row.
          <div
            role="treeitem"
            key={node.id}
            aria-level={level}
            aria-posinset={pos}
            aria-setsize={children.get(node.parent)?.length}
            aria-expanded={open}
            aria-selected={!!node.selected}
            aria-label={node.label}
            onFocus={() => setFocused(node.id)}
            onKeyDown={(event) => navigate(event, index)}
            style={{ '--studio-tree-depth': Math.min(level - 1, 8) } as CSSProperties}
          >
            {open === undefined ? (
              <span className="studio-tree-indent" />
            ) : (
              <Button
                variant="text"
                className="studio-tree-toggle"
                tabIndex={-1}
                disabled={lockExpansion}
                aria-label={toggleLabel(node, open)}
                aria-expanded={open}
                onClick={(event) => {
                  event.currentTarget.parentElement
                    ?.querySelector<HTMLElement>('[data-tree-focus]')
                    ?.focus();
                  onToggle(node.id);
                }}
              >
                <Icon name={open ? 'ChevronDown' : 'ChevronRight'} />
              </Button>
            )}
            {renderItem(node, { tabIndex: node.id === tabStop ? 0 : -1, 'data-tree-focus': true })}
          </div>
        );
      })}
    </div>
  );
}
