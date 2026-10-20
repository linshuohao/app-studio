import { fileURLToPath } from 'node:url';
const core = 'packages/(protocol|compiler|runtime|pure-functions)/src';
export default {
  forbidden: [
    {
      name: 'apps-consume-public-exports',
      severity: 'error',
      from: { path: '^(apps|services)/' },
      to: { path: '^packages/[^/]+/src/' },
    },
    { name: 'no-cycles', severity: 'error', from: {}, to: { circular: true } },
    { name: 'no-unresolved', severity: 'error', from: {}, to: { couldNotResolve: true } },
    {
      name: 'core-is-framework-independent',
      severity: 'error',
      from: { path: core },
      to: {
        path: '(apps/|services/|packages/(renderer-react|materials-react)/|node_modules/(react|next|@nestjs)/)',
      },
    },
    {
      name: 'compiler-runtime-independent',
      severity: 'error',
      from: { path: 'packages/compiler/src' },
      to: { path: 'packages/runtime/' },
    },
    {
      name: 'no-library-to-app',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^(apps|services)/' },
    },
    {
      name: 'no-cross-package-source',
      severity: 'error',
      from: { path: '^packages/([^/]+)/src' },
      to: { path: '^packages/([^/]+)/src', pathNot: '^packages/$1/src' },
    },
  ],
  options: {
    tsConfig: {
      fileName: fileURLToPath(new URL('./tools/config/tsconfig.boundaries.json', import.meta.url)),
    },
    doNotFollow: { path: 'node_modules|/dist/' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'types', 'default'],
    },
    exclude: '\\.(test|spec)\\.',
  },
};
