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
