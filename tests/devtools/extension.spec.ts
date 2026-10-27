import { chromium, expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { attachTarget } from './cdp';
test('真实 MV3 面板自动发现、查看状态 / 轨迹、断开重连且业务填写继续', async () => {
  const extension = resolve('packages/devtools/dist/extension');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      '--auto-open-devtools-for-tabs',
    ],
  });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:3217/l4');
    await page.getByRole('button', { name: '打开验证' }).click();
    await expect(page.getByRole('textbox', { name: '姓名', exact: true })).toHaveValue('Alice');
    const cdp = await context.newCDPSession(page);
    const targets = async () => (await cdp.send('Target.getTargets')).targetInfos;
    // Chromium 不向普通 Page 列表公开 DevTools，使用测试协议展示已注册的扩展标签。
    for (const target of (await targets()).filter((item) => item.url.startsWith('devtools:'))) {
      const evaluate = await attachTarget(cdp, target.targetId);
      await expect
        .poll(async () =>
          evaluate(
            `(async()=>{const ui=await import('./ui/legacy/legacy.js');const view=ui.InspectorView.InspectorView.instance();const id=view.tabbedPane.tabIds().find(id=>id.startsWith('chrome-extension:')&&id.endsWith('FormEngine'));if(!id)return false;await view.showPanel(id);return true;})()`,
          ),
        )
        .toBe(true);
    }
    // about:blank 和业务页各自有面板；等待属于业务页的面板就绪，不能以任意面板出现作为完成。
    let panel: Awaited<ReturnType<typeof attachTarget>> | undefined;
    const evaluators = new Map<string, Awaited<ReturnType<typeof attachTarget>>>();
    await expect
      .poll(
        async () => {
          for (const target of (await targets()).filter((item) =>
            item.url.endsWith('/panel.html'),
          )) {
            let evaluate = evaluators.get(target.targetId);
            if (!evaluate) {
              evaluate = await attachTarget(cdp, target.targetId);
              evaluators.set(target.targetId, evaluate);
            }
            const inspected = await evaluate(
              `new Promise(resolve=>{if(!globalThis.chrome?.devtools?.inspectedWindow){resolve(null);return;}chrome.devtools.inspectedWindow.eval('location.href',result=>resolve(result));})`,
            );
            if (inspected === 'http://127.0.0.1:3217/l4') {
              panel = evaluate;
              return true;
            }
          }
          return false;
        },
        { message: 'Form Engine 面板必须属于当前业务页' },
      )
      .toBe(true);
    const inspect = panel!;
    await expect
      .poll(() => inspect(`document.querySelector('[role=status]')?.textContent`))
      .toContain('已连接');
    expect(
      await inspect(`document.querySelector('[data-testid=devtools-snapshot]')?.textContent`),
    ).toBe('');
    await inspect(
      `Array.from(document.querySelectorAll('nav button')).find(button=>button.textContent.includes('运行实例')).click()`,
    );
    await expect
      .poll(() => inspect(`document.querySelector('[data-testid=devtools-snapshot]')?.textContent`))
      .toContain('Alice');
    await page.getByRole('textbox', { name: '姓名', exact: true }).fill('Grace');
    await expect
      .poll(() => inspect(`document.querySelector('[data-testid=devtools-snapshot]')?.textContent`))
      .toContain('Grace');
    await page.getByRole('textbox', { name: '城市查询' }).fill('杭州');
    await page.getByRole('button', { name: '查询城市' }).click();
    await expect.poll(() => inspect(`document.body.textContent`)).toContain('request');
    await inspect(`document.querySelector('header button').click()`);
    await expect
      .poll(() => inspect(`document.querySelector('[role=status]')?.textContent`))
      .toContain('已断开');
    await page.getByRole('textbox', { name: '姓名', exact: true }).fill('After disconnect');
    await expect(page.getByTestId('snapshot')).toContainText('After disconnect');
    expect(await inspect(`document.querySelector('[data-testid=devtools-snapshot]')`)).toBeNull();
    await inspect(`document.querySelector('header button').click()`);
    await expect
      .poll(() => inspect(`document.querySelector('[role=status]')?.textContent`))
      .toContain('已连接');
    await inspect(
      `Array.from(document.querySelectorAll('nav button')).find(button=>button.textContent.includes('运行实例')).click()`,
    );
    await expect
      .poll(() => inspect(`document.querySelector('[data-testid=devtools-snapshot]')?.textContent`))
      .toContain('After disconnect');
    await expect(page.getByLabel('表单接入诊断')).toHaveCount(0);
    await inspect(`document.querySelector('header button').click()`);
  } finally {
    await context.close();
  }
});
