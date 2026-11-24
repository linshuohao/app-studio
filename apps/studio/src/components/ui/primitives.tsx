'use client';

import type { ComponentProps } from 'react';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { Drawer as BaseDrawer } from '@base-ui/react/drawer';
import { Field as BaseField } from '@base-ui/react/field';
import { Select as BaseSelect } from '@base-ui/react/select';

import { Icon } from './icon';

export { Form } from '@base-ui/react/form';

export const Select = {
  ...BaseSelect,
  GroupLabel: (props: ComponentProps<typeof BaseSelect.GroupLabel>) => (
    <BaseSelect.GroupLabel {...props} data-studio-part="select-group-label" />
  ),
  Icon: ({
    children = <Icon name="ChevronDown" />,
    ...props
  }: ComponentProps<typeof BaseSelect.Icon>) => (
    <BaseSelect.Icon {...props}>{children}</BaseSelect.Icon>
  ),
  ItemIndicator: ({
    children = <Icon name="Check" />,
    ...props
  }: ComponentProps<typeof BaseSelect.ItemIndicator>) => (
    <BaseSelect.ItemIndicator {...props}>{children}</BaseSelect.ItemIndicator>
  ),
  Trigger: (props: ComponentProps<typeof BaseSelect.Trigger>) => (
    <BaseSelect.Trigger {...props} data-studio-part="select-trigger" />
  ),
  Popup: (props: ComponentProps<typeof BaseSelect.Popup>) => (
    <BaseSelect.Popup {...props} data-studio-part="popup" />
  ),
  Item: (props: ComponentProps<typeof BaseSelect.Item>) => (
    <BaseSelect.Item {...props} data-studio-part="option" />
  ),
};

export const Field = {
  ...BaseField,
  Root: (props: ComponentProps<typeof BaseField.Root>) => (
    <BaseField.Root {...props} data-studio-part="field" />
  ),
  Description: (props: ComponentProps<typeof BaseField.Description>) => (
    <BaseField.Description {...props} data-studio-part="hint" />
  ),
  Error: (props: ComponentProps<typeof BaseField.Error>) => (
    <BaseField.Error {...props} data-studio-part="error" />
  ),
};

export function Textarea({
  render = <textarea />,
  ...props
}: ComponentProps<typeof BaseField.Control>) {
  return <BaseField.Control {...props} render={render} data-studio-part="textarea" />;
}

export const Dialog = {
  ...BaseDialog,
  Backdrop: (props: ComponentProps<typeof BaseDialog.Backdrop>) => (
    <BaseDialog.Backdrop {...props} data-studio-part="backdrop" />
  ),
  Popup: (props: ComponentProps<typeof BaseDialog.Popup>) => (
    <BaseDialog.Popup {...props} data-studio-part="dialog" />
  ),
};

type DrawerRootProps = Omit<ComponentProps<typeof BaseDrawer.Root>, 'disablePointerDismissal'> & {
  closeOnOutsideClick?: boolean;
};

function DrawerRoot({ closeOnOutsideClick = true, ...props }: DrawerRootProps) {
  return <BaseDrawer.Root {...props} disablePointerDismissal={!closeOnOutsideClick} />;
}

export const Drawer = {
  ...BaseDrawer,
  Root: DrawerRoot,
  Backdrop: (props: ComponentProps<typeof BaseDrawer.Backdrop>) => (
    <BaseDrawer.Backdrop {...props} data-studio-part="backdrop" />
  ),
  Popup: (props: ComponentProps<typeof BaseDrawer.Popup>) => (
    <BaseDrawer.Popup {...props} data-studio-part="drawer" />
  ),
};
