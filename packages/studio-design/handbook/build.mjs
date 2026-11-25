import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const handbook = fileURLToPath(new URL('./', import.meta.url));
const repository = resolve(handbook, '../../..');
const output = resolve(process.env.STUDIO_HANDBOOK_ROOT || join(handbook, 'dist'));
const builtAssets = join(output, 'studio-components/assets');
const groups = ['playground', 'business-playground', 'menu-demo', 'expression-travel'];

if (!process.env.STUDIO_HANDBOOK_ROOT) rmSync(output, { recursive: true, force: true });
mkdirSync(builtAssets, { recursive: true });

for (const group of groups) {
  execFileSync(
    'pnpm',
    [
      'exec',
      'vite',
      'build',
      '--config',
      `studio-components/${group}.config.mjs`,
      '--outDir',
      builtAssets,
    ],
    { cwd: handbook, stdio: 'inherit' },
  );
}

const within = (root, file) => {
  const path = relative(root, file);
  return path !== '..' && !path.startsWith('../') && !isAbsolute(path);
};
const missing = [];
const pages = ['', 'studio-components'].flatMap((folder) =>
  readdirSync(join(handbook, folder), { withFileTypes: true })
    .filter((file) => file.isFile() && /\.(html|css|js)$/.test(file.name))
    .map((file) => join(folder, file.name)),
);
for (const page of pages) {
  const source = join(handbook, page);
  const target = join(output, page);
  const html = readFileSync(source, 'utf8').replace(
    /\b(href|src)=(["'])([^"']+)\2/g,
    (attribute, key, quote, url) => {
      if (/^(?:[\w+.-]+:|\/\/|#)/.test(url)) return attribute;
      const [, path, suffix] = /^([^?#]*)(.*)$/.exec(url);
      if (!path) return attribute;
      const file = resolve(dirname(source), decodeURI(path));
      if (within(handbook, file)) {
        const built = join(output, relative(handbook, file));
        if (existsSync(file) && !pages.includes(relative(handbook, file))) {
          mkdirSync(dirname(built), { recursive: true });
          copyFileSync(file, built);
        } else if (!existsSync(file) && !existsSync(built)) {
          missing.push(`${page} → ${url}`);
        }
        return attribute;
      }
      if (!within(repository, file) || !existsSync(file)) {
        missing.push(`${page} → ${url}`);
        return attribute;
      }
      const reference = join(output, 'source', relative(repository, file));
      mkdirSync(dirname(reference), { recursive: true });
      copyFileSync(file, reference);
      return `${key}=${quote}${relative(dirname(target), reference)}${suffix}${quote}`;
    },
  );
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html);
}
if (missing.length) throw new Error(`Handbook links are missing:\n${missing.join('\n')}`);
console.log(
  `Built ${pages.filter((file) => file.endsWith('.html')).length} Handbook pages in ${output}`,
);
