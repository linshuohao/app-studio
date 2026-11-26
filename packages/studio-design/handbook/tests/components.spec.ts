import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const handbook =
  process.env.STUDIO_HANDBOOK_ROOT ?? fileURLToPath(new URL('../dist', import.meta.url));
const runner = pathToFileURL(
  resolve(handbook, 'studio-components/assets/playground-runner.html'),
).href;

test('the shared Button preserves variant and disabled colors in the Handbook', async ({
  page,
}) => {
  await page.goto(runner + '?run#button');
  const button = page.getByRole('button', { name: /保存草稿/ });
  const color = (token: string) =>
    page.evaluate((property) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(' + property + ')';
      document.body.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    }, token);
  await expect(button).toHaveCSS('background-color', await color('--studio-primary'));
  await button.evaluate((node) => node.setAttribute('data-variant', 'secondary'));
  await expect(button).toHaveCSS('background-color', await color('--studio-surface'));
  await button.evaluate((node) => {
    node.setAttribute('data-variant', 'primary');
    node.setAttribute('disabled', '');
  });
  await expect(button).toHaveCSS('background-color', await color('--studio-disabled-bg'));
});

test('code blocks preserve text and highlight the declared language in a narrow panel', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 600 });
  const businessRunner = pathToFileURL(
    resolve(handbook, 'studio-components/assets/business-playground-runner.html'),
  ).href;
  await page.goto(businessRunner + '?run#codeblock');

  const json = page.getByRole('group', { name: 'JSON 配置' });
  const property = json.locator('[data-code-token="property"]').first();
  const literal = json.locator('[data-code-token="literal"]');
  await expect(property).toHaveText('"name"');
  await expect(literal).toHaveText('true');
  await expect(property).not.toHaveCSS(
    'color',
    await literal.evaluate((node) => getComputedStyle(node).color),
  );
  expect(await json.textContent()).toBe('{\n  "name": "差旅申请",\n  "enabled": true\n}');
  const jsx = page.getByRole('group', { name: 'JSX 示例' });
  await expect(jsx.locator('[data-code-token="tag"]')).toHaveText('<FormRenderer');
  await expect(jsx).toHaveCSS('white-space', 'pre-wrap');
  expect(await jsx.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const typescript = page.getByRole('group', { name: 'TypeScript 契约' });
  await expect(typescript.locator('[data-code-token="keyword"]')).toHaveText('type');

  await json.focus();
  await expect(json).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Tab');
  await expect(jsx).toBeFocused();
});

test('the CodeBlock component page sizes its embedded preview', async ({ page }) => {
  const componentPage = pathToFileURL(resolve(handbook, 'studio-components/code-block.html')).href;
  await page.goto(componentPage);
  const preview = page.locator('iframe[title="CodeBlock 交互预览"]');
  await expect(preview.contentFrame().locator('pre[aria-label="TypeScript 契约"]')).toBeVisible();
  await expect(preview).toHaveAttribute('style', /height: \d+px/);
});

test('unterminated strings preserve raw code and resume highlighting on the next line', async ({
  page,
}) => {
  const businessRunner = pathToFileURL(
    resolve(handbook, 'studio-components/assets/business-playground-runner.html'),
  ).href;
  await page.goto(businessRunner + '?run#codeblock');
  const json = page.getByRole('group', { name: 'JSON 配置' });
  await expect(json).toBeVisible();

  const source = '"' + '\\"'.repeat(45_000) + 'true\n"enabled": false';
  await page.evaluate((source) => {
    const code = `import React from 'react';
      import { CodeBlock } from '../../../../apps/studio/src/components/code-block';
      export default function Example() {
        return <CodeBlock language="json" label="不完整的 JSON" source={${JSON.stringify(source)}} />;
      }`;
    window.postMessage({ type: 'handbook-run', revision: 1, code }, '*');
  }, source);

  const malformed = page.locator('pre[aria-label="不完整的 JSON"]');
  await expect(malformed.locator('[data-code-token="literal"]')).toHaveText(['false']);
  expect(await malformed.textContent()).toBe(source);
});

test('Agent reply highlights fenced code and confines wide table scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 });
  const businessRunner = pathToFileURL(
    resolve(handbook, 'studio-components/assets/business-playground-runner.html'),
  ).href;
  await page.goto(businessRunner + '?run#agentreply');
  const fence = page.locator('.agent-markdown .studio-code-block code[data-language="json"]');
  await expect(fence.locator('[data-code-token="string"]')).toHaveText('"姓名"');
  await expect(fence).toContainText('{ "name": "姓名", "required": true }');
  await expect(fence.locator('..')).toHaveCSS('white-space', 'pre-wrap');
  const table = page.getByRole('table');
  await expect(table.getByRole('row')).toHaveCount(25);
  const scroll = table.locator('..');
  await expect(scroll).toHaveCSS('max-height', 'none');
  await expect(scroll).toHaveCSS('overflow-x', 'auto');
  expect(await scroll.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
  expect(
    await page.locator('.agent-markdown').evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
});
