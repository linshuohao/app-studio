'use client';
import { Select } from './primitives';
import { Children, isValidElement, useRef, useState, type ReactNode } from 'react';
function labelText(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child)
        ? labelText(child.props.children)
        : String(child),
    )
    .join('');
}
export function StudioSelect({
  value,
  onValueChange,
  children,
  id,
  name,
  disabled,
  required,
  visibleLabel,
  'aria-label': ariaLabel,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  visibleLabel?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}) {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = Children.toArray(children)
    .filter(isValidElement<{ value?: string; children?: ReactNode; disabled?: boolean }>)
    .map((child) => ({
      value: child.props.value ?? labelText(child.props.children),
      label: labelText(child.props.children),
      disabled: child.props.disabled,
    }));
  return (
    <Select.Root
      onOpenChange={(open) => {
        if (open) setPortalContainer(trigger.current?.closest('dialog') ?? document.body);
      }}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
      items={items}
      name={name}
      disabled={disabled}
      required={required}
      modal={false}
    >
      <Select.Trigger
        ref={trigger}
        id={id}
        aria-label={ariaLabel ?? visibleLabel}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        className="studio-select-trigger"
      >
        {visibleLabel && value ? (
          <span className="studio-select-labeled-value">
            <span aria-hidden="true">{visibleLabel}：</span>
            <Select.Value />
          </span>
        ) : (
          <Select.Value />
        )}
        <Select.Icon />
      </Select.Trigger>
      <Select.Portal container={portalContainer}>
        <Select.Positioner
          sideOffset={6}
          alignItemWithTrigger={false}
          className="studio-select-positioner"
        >
          <Select.Popup className="studio-select-popup">
            <Select.List>
              {items.map((item) => (
                <Select.Item
                  key={item.value}
                  value={item.value}
                  disabled={item.disabled}
                  className="studio-select-item"
                >
                  <Select.ItemText>{item.label}</Select.ItemText>
                  <Select.ItemIndicator />
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
