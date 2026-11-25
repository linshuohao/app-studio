'use client';

import type { ComponentProps } from 'react';
import { Menu as BaseMenu } from '@base-ui/react/menu';
import { Button } from './controls';

export const Menu = {
  ...BaseMenu,
  Trigger: ({
    render = <Button variant="secondary" />,
    ...props
  }: ComponentProps<typeof BaseMenu.Trigger>) => <BaseMenu.Trigger {...props} render={render} />,
  Positioner: ({ sideOffset = 4, ...props }: ComponentProps<typeof BaseMenu.Positioner>) => (
    <BaseMenu.Positioner {...props} sideOffset={sideOffset} data-studio-part="menu-positioner" />
  ),
  Popup: (props: ComponentProps<typeof BaseMenu.Popup>) => (
    <BaseMenu.Popup {...props} data-studio-part="popup" data-studio-menu="" />
  ),
};
