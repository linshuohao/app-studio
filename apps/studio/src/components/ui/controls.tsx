'use client';

import { Button as BaseButton } from '@base-ui/react/button';
import { Input as BaseInput } from '@base-ui/react/input';
import type { ComponentProps } from 'react';

import { Icon, type IconName } from './icon';

type ButtonVariant = 'primary' | 'secondary' | 'text';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: '',
  secondary: ' quiet',
  text: ' text-button',
};

export function Button({
  variant = 'primary',
  type = 'button',
  className = '',
  ...props
}: ComponentProps<typeof BaseButton> & { variant?: ButtonVariant }) {
  return (
    <BaseButton
      {...props}
      type={type}
      data-variant={variant}
      className={(state) =>
        `studio-button${buttonVariants[variant]} ${(typeof className === 'function' ? className(state) : className) ?? ''}`.trimEnd()
      }
    />
  );
}

export function IconButton({
  icon,
  ...props
}: Omit<ComponentProps<typeof Button>, 'children' | 'variant'> & {
  icon: IconName;
  'aria-label': string;
}) {
  return (
    <Button {...props} variant="text" data-icon-button="">
      <span data-icon-frame={icon === 'Info' ? 'intrinsic' : 'outline'}>
        <Icon name={icon} />
      </span>
    </Button>
  );
}

export function Input({ className = '', ...props }: ComponentProps<typeof BaseInput>) {
  return (
    <BaseInput
      {...props}
      className={(state) =>
        `studio-input ${(typeof className === 'function' ? className(state) : className) ?? ''}`.trimEnd()
      }
    />
  );
}

export function Feedback({
  kind,
  children,
}: {
  kind: 'status' | 'error';
  children: ComponentProps<'p'>['children'];
}) {
  return (
    <p className="studio-feedback" role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
