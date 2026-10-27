import { resolve } from 'node:path';

/** 独立 Vitest 进程各持有本包缓存，避免 Turbo 并行启动时争相清理工作区缓存。 */
export const fsModuleCachePath = resolve(process.cwd(), 'node_modules/.vitest-cache');
