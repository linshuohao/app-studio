import { Form } from '@base-ui/react/form';
import { Button } from './controls';
import { useId, useState, type ReactNode } from 'react';

export function ListFilterBar({
  label,
  children,
  onApply,
  onReset,
  layout = 'compact',
  advanced,
  actions,
  applyLabel = '确认',
  inlineSearch = false,
}: {
  label: string;
  children: ReactNode;
  onApply: () => void;
  onReset: () => void;
  layout?: 'search' | 'compact' | 'query';
  advanced?: { fields: ReactNode; appliedSummary?: ReactNode };
  actions?: ReactNode;
  applyLabel?: string;
  inlineSearch?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const advancedId = useId();
  return (
    <Form
      role="search"
      aria-label={label}
      className="studio-list-filters"
      data-filter-layout={layout}
      data-inline-search={inlineSearch || undefined}
      data-filter-advanced={advanced ? '' : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        onApply();
      }}
    >
      <div className="studio-filter-fields">
        {children}
        {advanced && (
          <Button
            variant="secondary"
            aria-expanded={expanded}
            aria-controls={advancedId}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? '收起高级筛选' : '高级筛选'}
          </Button>
        )}
      </div>
      {advanced && (
        <div className="studio-filter-advanced" id={advancedId} hidden={!expanded}>
          {advanced.fields}
        </div>
      )}
      <div className="studio-filter-actions">
        <Button variant="secondary" onClick={onReset}>
          重置
        </Button>
        <Button
          type="submit"
          onClick={(event) => {
            // Implicit Enter uses the submit button, including in the Handbook preview sandbox.
            event.preventDefault();
            onApply();
          }}
        >
          {applyLabel}
        </Button>
        {actions}
      </div>
      {advanced?.appliedSummary && (
        <p className="studio-filter-summary" role="status">
          {advanced.appliedSummary}
        </p>
      )}
    </Form>
  );
}

export function TableResults({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="studio-table-results"
      data-return-scroll
    >
      {children}
    </div>
  );
}

export function MasterDetail({
  navigation,
  label,
  children,
}: {
  navigation: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="studio-master-detail">
      <div className="studio-master-detail-columns">
        <div className="studio-master-pane">{navigation}</div>
        <section aria-label={label} className="studio-detail-pane">
          {children}
        </section>
      </div>
    </div>
  );
}
