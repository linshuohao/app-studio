import { useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { Button } from '@base-ui/react/button';
import { Input } from '@base-ui/react/input';
import { Popover } from '@base-ui/react/popover';
import { Calendar } from './calendar.js';

export function DateTextInput(props: ComponentProps<'input'>) {
  return <Input data-slot="input" className="fe-input" placeholder="YYYY-MM-DD" {...props} />;
}

interface CalendarTriggerProps {
  label: string;
  value: string;
  min?: string | undefined;
  max?: string | undefined;
  disabled?: boolean | undefined;
  onSelect: (value: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

// shadcn/ui Date Picker composition: Button, Popover and Calendar.
export function CalendarTrigger({
  label,
  disabled,
  onSelect,
  open,
  onOpenChange,
  ...calendar
}: CalendarTriggerProps) {
  const trigger = useRef<HTMLButtonElement>(null);
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
        className="fe-button fe-date-trigger"
        disabled={disabled}
        aria-label={label}
      >
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
              {...calendar}
              onSelect={(value) => {
                onSelect(value);
                changeOpen(false);
              }}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18m-13 5h2m4 0h2m-8 3h2m4 0h2" />
    </svg>
  );
}

export function ClearDateButton(props: ComponentProps<'button'>) {
  return (
    <Button className="fe-button fe-date-trigger" aria-label="清空日期" {...props}>
      ×
    </Button>
  );
}
