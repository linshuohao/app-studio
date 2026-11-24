import { format, resolveConfig } from 'prettier';
import { resolve } from 'node:path';

export async function generated(root, path, content) {
  const filepath = resolve(root, path);
  const config = await resolveConfig(filepath, { useCache: false });
  return format(content, {
    singleQuote: true,
    trailingComma: 'all',
    printWidth: 100,
    ...config,
    filepath,
  });
}
