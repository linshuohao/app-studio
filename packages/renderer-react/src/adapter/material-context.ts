import { createContext } from 'react';
import type { Projection } from './projection.js';
/** 单个物料挂载提供的内部接入对象；null 表示 Hook 被用于 Renderer 物料树之外。 */
export const MaterialContext = createContext<Projection | null>(null);
