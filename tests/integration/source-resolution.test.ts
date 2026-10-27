import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
const require = createRequire(import.meta.url);
it('开发加载只改真实相邻 TS 模块的 ESM 路径，保留字符串、注释、外部包及不存在路径', () => {
  const loader = require('../../tools/engineering/source-extension-loader.cjs') as (
    this: { resourcePath: string },
    source: string,
  ) => string;
  const input = `// import './runtime.js'\nconst example="./runtime.js";\nexport { createRuntime } from './runtime.js';\nimport './missing.js';\nimport 'external.js';`;
  const output = loader.call({ resourcePath: resolve('packages/runtime/src/index.ts') }, input);
  expect(output).toContain(`from "./runtime.ts"`);
  expect(output).toContain(`const example="./runtime.js"`);
  expect(output).toContain(`// import './runtime.js'`);
  expect(output).toContain(`import './missing.js'`);
  expect(output).toContain(`import 'external.js'`);
});

it('第三方包中的模块标识不被工作区源码加载器改写', () => {
  const loader = require('../../tools/engineering/source-extension-loader.cjs') as (
    this: { resourcePath: string },
    source: string,
  ) => string;
  const input = 'export {createRuntime} from "../../packages/runtime/src/runtime.js"';
  expect(loader.call({ resourcePath: resolve('node_modules/example/index.ts') }, input)).toBe(
    input,
  );
});
