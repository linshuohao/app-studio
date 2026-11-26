import { createContext } from 'react';
import type { InspectionInput } from './config-inspection';
import type { LayoutAssetContext } from './layout-check';

export const FormAssetScope = createContext<
  | {
      formPath: string;
      input: InspectionInput;
      profile?: string;
      choices?: LayoutAssetContext;
    }
  | undefined
>(undefined);
