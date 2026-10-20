// Explicit upgrade task. Never run from install/postinstall or CI.
import { execFileSync } from 'node:child_process';
const run = (...args) => execFileSync('pnpm', args, { stdio: 'inherit' });
const view = (...args) =>
  JSON.parse(execFileSync('pnpm', ['view', ...args, '--json'], { encoding: 'utf8' }));
const newestStable = (name, range) => {
  const versions = [view(`${name}@${range}`, 'version')].flat();
  const stable = versions.filter((v) => /^\d+\.\d+\.\d+$/.test(v));
  stable.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  if (!stable.length) throw new Error(`No stable ${name} matches ${range}`);
  return stable.at(-1);
};
const tsPeers = view('typescript-eslint@latest', 'peerDependencies');
const jsxPeers = view('eslint-plugin-jsx-a11y@latest', 'peerDependencies');
const ts = newestStable('typescript', tsPeers.typescript);
const eslint = newestStable('eslint', jsxPeers.eslint);
console.log('Resolved from current peer declarations:', { typescript: ts, eslint });
run(
  '--filter',
  './packages/*',
  '--filter',
  './apps/*',
  '--filter',
  './services/*',
  'add',
  '-D',
  `typescript@${ts}`,
);
run('--filter', './apps/*', 'add', '-D', `eslint@${eslint}`);
run('-r', 'update', '--latest', '!typescript', '!eslint', '!@eslint/js');
const tools = [
  'turbo',
  'globals',
  '@types/node',
  '@eslint/js',
  'typescript-eslint',
  'eslint-config-prettier',
  'eslint-plugin-react-hooks',
  'eslint-plugin-jsx-a11y',
  'prettier',
  'husky',
  'lint-staged',
  '@commitlint/cli',
  '@commitlint/config-conventional',
  '@changesets/cli',
  'dependency-cruiser',
  'vitest',
  '@vitest/coverage-v8',
  '@testing-library/react',
  '@testing-library/user-event',
  '@testing-library/jest-dom',
  'jsdom',
];
// @eslint/js is coupled to ESLint's major; select its newest compatible major, too.
const js = newestStable('@eslint/js', `^${eslint.split('.')[0]}`);
run(
  'add',
  '-Dw',
  ...tools.filter((t) => t !== '@eslint/js').map((t) => `${t}@latest`),
  `typescript@${ts}`,
  `eslint@${eslint}`,
  `@eslint/js@${js}`,
);
