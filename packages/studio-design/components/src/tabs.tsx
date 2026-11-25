'use client';

import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import type { ComponentProps } from 'react';

export type TabsSize = 'sm' | 'md';

export const Tabs = {
  ...BaseTabs,
  Root: ({
    size = 'md',
    bordered = false,
    ...props
  }: ComponentProps<typeof BaseTabs.Root> & { size?: TabsSize; bordered?: boolean }) => (
    <BaseTabs.Root
      {...props}
      data-studio-part="tabs"
      data-size={size}
      data-bordered={bordered || undefined}
    />
  ),
  List: (props: ComponentProps<typeof BaseTabs.List>) => (
    <BaseTabs.List {...props} data-studio-part="tab-list" />
  ),
  Tab: (props: ComponentProps<typeof BaseTabs.Tab>) => (
    <BaseTabs.Tab {...props} data-studio-part="tab" />
  ),
  Panel: (props: ComponentProps<typeof BaseTabs.Panel>) => (
    <BaseTabs.Panel {...props} data-studio-part="tab-panel" />
  ),
};
