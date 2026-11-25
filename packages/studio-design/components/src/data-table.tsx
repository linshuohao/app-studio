'use client';

import { useCallback, useState, type Key, type ReactNode } from 'react';
import { Icon } from './icon';
import { Button } from './controls';
import { TableResults } from './list-layout';
import { Menu } from './menu';

export type Column<T> = {
  key: string;
  title: ReactNode;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  hideable?: boolean;
};
export type TableSort = { key: string; direction: 'asc' | 'desc' } | null;

export function DataTable<T>({
  label,
  rows,
  columns,
  rowKey,
  sort,
  onSortChange,
  visibleKeys,
  onVisibleKeysChange,
  empty = '暂无记录',
  layout = 'inline',
  filters,
  pagination,
  panelClassName,
}: {
  label: string;
  rows: readonly T[];
  columns: readonly Column<T>[];
  rowKey: (row: T) => Key;
  sort?: TableSort;
  onSortChange?: (sort: TableSort) => void;
  visibleKeys?: readonly string[];
  onVisibleKeysChange?: (keys: string[]) => void;
  empty?: ReactNode;
  layout?: 'inline' | 'fill';
  filters?: ReactNode;
  pagination?: ReactNode;
  panelClassName?: string;
}) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [menuContainer, setMenuContainer] = useState<HTMLDialogElement | null>(null);
  const locateMenu = useCallback((node: HTMLDivElement | null) => {
    setMenuContainer(node?.closest('dialog') ?? null);
  }, []);
  const optional = columns.filter((column) => column.hideable);
  const visible = columns.filter(
    (column) =>
      !column.hideable ||
      (visibleKeys ? visibleKeys.includes(column.key) : !hidden.includes(column.key)),
  );
  function toggle(key: string, checked: boolean) {
    const keys = columns
      .filter((column) => (column.key === key ? checked : visible.includes(column)))
      .map((column) => column.key);
    if (visibleKeys === undefined)
      setHidden(columns.filter((column) => !keys.includes(column.key)).map((column) => column.key));
    onVisibleKeysChange?.(keys);
  }
  function requestSort(key: string) {
    if (sort?.key !== key) onSortChange?.({ key, direction: 'asc' });
    else onSortChange?.(sort.direction === 'asc' ? { key, direction: 'desc' } : null);
  }
  const table = (
    <>
      {optional.length > 0 && (
        <div className="studio-table-tools" ref={locateMenu}>
          <Menu.Root>
            <Menu.Trigger>
              <Icon name="Columns3" /> 列设置
            </Menu.Trigger>
            <Menu.Portal container={menuContainer ?? undefined}>
              <Menu.Positioner align="end">
                <Menu.Popup aria-label="列设置">
                  {optional.map((column) => (
                    <Menu.CheckboxItem
                      key={column.key}
                      checked={visible.includes(column)}
                      onCheckedChange={(checked) => toggle(column.key, checked)}
                      closeOnClick={false}
                      data-studio-part="option"
                    >
                      {column.title}
                      <Menu.CheckboxItemIndicator aria-hidden>
                        <Icon name="Check" />
                      </Menu.CheckboxItemIndicator>
                    </Menu.CheckboxItem>
                  ))}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
      )}
      <TableResults label={label}>
        <table className="studio-data-table" aria-label={label}>
          <thead>
            <tr>
              {visible.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    sort?.key === column.key
                      ? sort.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  {column.sortable && onSortChange ? (
                    <Button variant="text" onClick={() => requestSort(column.key)}>
                      {column.title}{' '}
                      <Icon
                        name={
                          sort?.key !== column.key
                            ? 'ArrowUpDown'
                            : sort.direction === 'asc'
                              ? 'ArrowUp'
                              : 'ArrowDown'
                        }
                      />
                    </Button>
                  ) : (
                    column.title
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={rowKey(row)}>
                  {visible.map((column) => (
                    <td key={column.key}>{column.render(row)}</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={Math.max(1, visible.length)}>{empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </TableResults>
    </>
  );
  if (layout === 'inline') return table;
  return (
    <div data-studio-table-layout="fill">
      <div className={['studio-table-layout-panel', panelClassName].filter(Boolean).join(' ')}>
        {filters}
        {rows.length
          ? table
          : empty != null && <div className="studio-table-layout-empty">{empty}</div>}
      </div>
      {pagination != null && <div className="studio-table-layout-footer">{pagination}</div>}
    </div>
  );
}
