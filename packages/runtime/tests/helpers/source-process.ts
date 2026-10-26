import { spawnSync } from 'node:child_process';

/** 在独立 Node 进程中运行当前源码，并让未处理拒绝直接令用例失败。 */
export function runSourceProcess(script: string, input?: unknown) {
  const loader = `
    import { registerHooks } from 'node:module';
    registerHooks({ resolve(specifier, context, nextResolve) {
      try { return nextResolve(specifier, context); } catch (error) {
        if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && specifier.endsWith('.js'))
          return nextResolve(specifier.slice(0, -3) + '.ts', context);
        throw error;
      }
    }});
  `;
  return spawnSync(
    process.execPath,
    [
      '--experimental-transform-types',
      '--conditions=development',
      '--disable-warning=ExperimentalWarning',
      '--unhandled-rejections=strict',
      '--input-type=module',
      '-e',
      loader + script,
    ],
    { encoding: 'utf8', timeout: 5000, input: JSON.stringify(input ?? null) },
  );
}
