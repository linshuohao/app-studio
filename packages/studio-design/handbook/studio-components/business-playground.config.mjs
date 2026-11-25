import { exampleSources } from './example-source.config.mjs';
import config from './expression-demo.config.mjs';
import { fileURLToPath } from 'node:url';
import { materialPreview } from '../../../../services/api/src/platform/material-previews.ts';
import { materialIds } from './card-list-materials.mjs';

// Supply the catalog endpoint locally when the handbook is opened from disk.
const fixtureId = '\0handbook-material-catalog';
export default {
  plugins: [
    exampleSources(),
    {
      name: 'handbook-material-catalog',
      enforce: 'pre',
      transform(code, id) {
        if (id.endsWith('/app/regex-input.tsx')) {
          // A file:// sandbox needs a self-contained worker for the pattern test.
          return (
            "import HandbookRegexWorker from './regex-preview.worker.ts?worker&inline';\n" +
            code.replace(
              "new Worker(new URL('./regex-preview.worker.ts', import.meta.url))",
              'new HandbookRegexWorker()',
            )
          );
        }
      },
      resolveId(source, importer) {
        if (
          source === './platform-api' &&
          /\/app\/(form-management|operation-records|account-security|github-account|password-settings|material-card|config-diff|config-inspection|function-catalog|expression-verification)\.tsx?$/.test(
            importer ?? '',
          )
        )
          return fixtureId;
        if (source === './read-delivery' && importer?.endsWith('/host/requirements.tsx'))
          return fixtureId;
      },
      load(id) {
        if (id !== fixtureId) return;
        const responses = Object.fromEntries(
          materialIds.map((key) => {
            const preview = materialPreview(key);
            if (!preview) throw new Error('Missing material preview: ' + key);
            return ['/catalog/materials/' + key + '?version=0.1.0', { preview }];
          }),
        );
        return (
          'const catalog = ' +
          JSON.stringify(responses) +
          `;
          export { PlatformError, outcomeUnknown, accessDenied } from ${JSON.stringify(fileURLToPath(new URL('../../../../apps/studio/src/app/platform-api.ts', import.meta.url)))};
          export const failureMessage = error => String(error?.message ?? error);
          export async function platform(path, options) {
            if (path === '/github/binding') return {enabled:false, login:null};
            if (path === '/handbook/copies') return {};
            if (path === '/handbook/metadata') return {...options.body, revision:options.body.revision+1, archived:false};
            if (path.includes('/operations?')) return {rows:[],next:null};
            if (path in catalog) return catalog[path];
            if (path === '/catalog/functions') return [];
            if (path === '/handbook/versions/v1') return { name: '基准版本', text: '{"title":"原名称"}' };
            if (path === '/handbook/check' || path === '/handbook/preview') return {
              success: false, catalogId: 'handbook', target: {platform:'web'},
              diagnostics: [{code:'MISSING_VIEW', severity:'error', sourcePointer:'/views', message:'请添加一个视图'}]
            };
            throw Error('此离线示例未提供该数据');
          }
          export async function readDelivery() {
            return { prepared: {definition:{views:{}},hostRequirements:{requests:[{name:'lookup'}],events:[],validators:[]}} };
          }`
        );
      },
    },
  ],
  ...config,
  oxc: { jsx: { runtime: 'automatic' } },
  define: {
    ...config.define,
    'process.env.RELEASE_MATERIAL_DIGEST': JSON.stringify('sha256:' + '5'.repeat(64)),
    'process.env.RELEASE_FUNCTION_DIGEST': JSON.stringify('sha256:' + '5'.repeat(64)),
  },
  build: {
    ...config.build,
    lib: {
      entry: fileURLToPath(new URL('./business-playground.jsx', import.meta.url)),
      name: 'StudioBusinessExamples',
      formats: ['iife'],
      cssFileName: 'business-playground',
      fileName: () => 'business-playground.js',
    },
  },
};
