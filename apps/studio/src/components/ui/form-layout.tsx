import { useId, type ReactNode } from 'react';

type FieldControlProps = {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
};

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: (props: FieldControlProps) => ReactNode;
}) {
  const id = useId();
  const descriptions = [hint ? id + '-hint' : '', error ? id + '-error' : ''].filter(Boolean);
  return (
    <div className="studio-field">
      <label htmlFor={id}>{label}</label>
      <div className="studio-field-body">
        {children({
          id,
          'aria-describedby': descriptions.join(' ') || undefined,
          'aria-invalid': error ? true : undefined,
        })}
        {hint && (
          <p id={id + '-hint'} className="studio-field-hint">
            {hint}
          </p>
        )}
        {error && (
          <p id={id + '-error'} className="studio-field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export function FormLayout({
  density = 'regular',
  columns = 'single',
  intro,
  feedback,
  actions,
  children,
}: {
  density?: 'regular' | 'dense';
  columns?: 'single' | 'two';
  intro?: ReactNode;
  feedback?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="studio-form-layout" data-density={density} data-columns={columns}>
      {intro && <div className="studio-form-intro">{intro}</div>}
      <div className="studio-form-fields">
        {children}
        {feedback}
      </div>
      {actions && <div className="studio-form-actions">{actions}</div>}
    </div>
  );
}
