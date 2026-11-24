import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function buildIdentity(packageFile: string, id: string, directories = ['dist']) {
  const root = dirname(packageFile);
  const files = directories
    .flatMap((directory) =>
      readdirSync(join(root, directory), { recursive: true, encoding: 'utf8' })
        .filter(
          (file) => /\.(?:js|mjs|cjs|css|json)$/.test(file) && !file.startsWith('node_modules/'),
        )
        .map((file) => join(directory, file)),
    )
    .sort();

  if (!files.length) throw new Error(`No built artifact for ${id}`);
  const entries = ['package.json', ...new Set(files)].map((file) => [
    file.replaceAll('\\', '/'),
    createHash('sha256')
      .update(readFileSync(join(root, file)))
      .digest('hex'),
  ]);
  return {
    id,
    platform: 'web',
    digest: `sha256:${createHash('sha256').update(JSON.stringify(entries)).digest('hex')}` as const,
  };
}
