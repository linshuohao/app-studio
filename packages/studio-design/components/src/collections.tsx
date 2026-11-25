import type { Key, ReactNode, Ref } from 'react';
import { Icon } from './icon';
import { Button } from './controls';
import { StudioSelect } from './select';

export function Grid({
  density = 'regular',
  children,
}: {
  density?: 'regular' | 'dense';
  children: ReactNode;
}) {
  return (
    <div className="studio-grid" data-density={density}>
      {children}
    </div>
  );
}

export function GridItem({ span = 12, children }: { span?: number; children: ReactNode }) {
  return (
    <div
      style={{
        gridColumn: `span ${Math.min(12, Math.max(1, Math.trunc(span) || 12))}`,
        minWidth: 0,
      }}
    >
      {children}
    </div>
  );
}

type CardListLayout =
  | { layout?: 'content'; filters?: never; pagination?: never; resultsRef?: never }
  | {
      layout: 'fill';
      filters?: ReactNode;
      pagination: ReactNode;
      resultsRef?: Ref<HTMLDivElement>;
    };

export function CardList<T>({
  label,
  items,
  itemKey,
  renderItem,
  empty = '暂无记录',
  layout,
  filters,
  pagination,
  resultsRef,
}: {
  label: string;
  items: readonly T[];
  itemKey: (item: T) => Key;
  renderItem: (item: T) => ReactNode;
  empty?: ReactNode;
} & CardListLayout) {
  const results = items.length ? (
    <ul className="studio-card-list" aria-label={label}>
      {items.map((item) => (
        <li key={itemKey(item)}>{renderItem(item)}</li>
      ))}
    </ul>
  ) : (
    <div className={layout === 'fill' ? 'studio-card-list-empty' : undefined} role="status">
      {empty}
    </div>
  );
  if (layout !== 'fill') return results;

  return (
    <section className="studio-card-list-layout" aria-label={label + '结果'}>
      {filters && <div className="studio-card-list-filters">{filters}</div>}
      <div
        className="studio-card-list-results"
        role="region"
        aria-label={label + '滚动区'}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Card results need a keyboard stop for scrolling.
        tabIndex={0}
        data-return-scroll
        ref={resultsRef}
      >
        {results}
      </div>
      <footer className="studio-card-list-footer">{pagination}</footer>
    </section>
  );
}

export function Pagination({
  total,
  page,
  pageSize,
  pageSizeOptions,
  onChange,
}: {
  total: number;
  page: number;
  pageSize: number;
  pageSizeOptions: readonly number[];
  onChange: (page: number, pageSize: number) => void;
}) {
  const pages = Math.ceil(total / pageSize);
  return (
    <nav className="studio-pagination" aria-label="分页">
      <label>
        每页条数
        <StudioSelect value={String(pageSize)} onValueChange={(size) => onChange(1, Number(size))}>
          {pageSizeOptions.map((size) => (
            <option key={size} value={String(size)}>
              {size}
            </option>
          ))}
        </StudioSelect>
      </label>
      <div>
        <output>{total ? `第 ${page} / ${pages} 页，共 ${total} 条` : '共 0 条'}</output>
        <Button
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onChange(page - 1, pageSize)}
        >
          <Icon name="ChevronLeft" /> 上一页
        </Button>
        <Button
          variant="secondary"
          disabled={page >= pages}
          onClick={() => onChange(page + 1, pageSize)}
        >
          下一页 <Icon name="ChevronRight" />
        </Button>
      </div>
    </nav>
  );
}
