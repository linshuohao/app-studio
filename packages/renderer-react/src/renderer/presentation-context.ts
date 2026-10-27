import { createContext } from 'react';
import type { FormRendererProps } from './types.js';
/** 仅传递业务错误呈现选项；与静态装配环境分离，更新不撤销物料关联。 */
export const PresentationContext =
  createContext<FormRendererProps['renderMaterialError']>(undefined);
