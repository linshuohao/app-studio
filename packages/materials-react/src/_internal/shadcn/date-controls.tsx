import { useId, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { Button } from '@base-ui/react/button';
import { Popover } from '@base-ui/react/popover';
import { Calendar } from './calendar.js';

interface CalendarTriggerProps {
  label: string;
  value: string;
  placeholder?: string | undefined;
  min?: string | undefined;
  max?: string | undefined;
  disabled?: boolean | undefined;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerProps?: Pick<
    ComponentProps<'button'>,
    'id' | 'aria-label' | 'aria-labelledby' | 'aria-describedby' | 'aria-invalid'
  >;
  onSelect: (value: string) => void;
  onClear?: (() => void) | undefined;
}

// shadcn/ui Date Picker composition: Button, Popover and Calendar.
export function CalendarTrigger({
  label,
  value,
  placeholder = '选择日期',
  min,
  max,
  disabled,
  open,
  onOpenChange,
  triggerProps,
  onSelect,
  onClear,
}: CalendarTriggerProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const valueId = useId();
  const [localOpen, setLocalOpen] = useState(false);
  const [container, setContainer] = useState<HTMLDialogElement>();
  function changeOpen(next: boolean) {
    if (next) setContainer(trigger.current?.closest('dialog') ?? undefined);
    if (open === undefined) setLocalOpen(next);
    onOpenChange?.(next);
  }
  return (
    <Popover.Root open={(open ?? localOpen) && !disabled} onOpenChange={changeOpen}>
      <Popover.Trigger
        ref={trigger}
        className="fe-input fe-date-trigger"
        disabled={disabled}
        aria-label={triggerProps?.['aria-labelledby'] ? undefined : label}
        {...triggerProps}
        aria-describedby={[valueId, triggerProps?.['aria-describedby']].filter(Boolean).join(' ')}
      >
        <span id={valueId} data-placeholder={!value || undefined}>
          {value || placeholder}
        </span>
        <CalendarIcon />
      </Popover.Trigger>
      <Popover.Portal container={container}>
        <Popover.Positioner
          className="fe-date-positioner"
          positionMethod="fixed"
          sideOffset={6}
          align="start"
        >
          <Popover.Popup className="fe-date-popup" aria-label={label} finalFocus={trigger}>
            <Calendar
              focusOnOpen
              value={value}
              min={min}
              max={max}
              onSelect={(value) => {
                onSelect(value);
                changeOpen(false);
              }}
            />
            {onClear && (
              <div className="fe-date-popup-actions">
                <Button
                  className="fe-button"
                  onClick={() => {
                    onClear();
                    changeOpen(false);
                  }}
                >
                  清空日期
                </Button>
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18m-13 5h2m4 0h2m-8 3h2m4 0h2" />
    </svg>
  );
}
