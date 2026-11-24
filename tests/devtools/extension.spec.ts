import { writeFile } from 'node:fs/promises';
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
    await page.goto('http://127.0.0.1:3217/demos/travel');
    await page.getByRole('button', { name: '打开完整表单' }).click();
    await expect(page.getByRole('textbox', { name: '投保人姓名', exact: true })).toHaveValue(
      '投保人示例',
    );
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
            if (inspected === 'http://127.0.0.1:3217/demos/travel') {
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
    await expect
      .poll(() => inspect(`!!document.querySelector('[aria-label="关系图"]')`))
      .toBe(true);
    expect(
      await inspect(`Array.from(document.querySelectorAll('nav button')).map(b=>b.textContent)`),
    ).toEqual(['关系', '执行']);
    expect(await inspect(`document.querySelector('[aria-label="观测对象"]').hidden`)).toBe(true);
    const click = async (label: string) =>
      inspect(
        `Array.from(document.querySelectorAll('button')).find(button=>button.textContent===${JSON.stringify(label)}).click()`,
      );
    expect(await inspect(`!!document.querySelector('[aria-label="关系图"]')`)).toBe(true);
    expect(await inspect(`document.body.textContent`)).not.toContain('投保人示例');
    const selection = await inspect(
      `(()=>{const node=document.querySelector('svg g[data-entity]');if(!node)return null;node.dispatchEvent(new MouseEvent('click',{bubbles:true}));return 'entity:'+node.getAttribute('data-entity');})()`,
    );
    expect(selection).not.toBeNull();
    for (const view of ['执行', '状态', '诊断', '关系']) {
      await click(view);
      expect(await inspect(`document.querySelector('.notice')?.textContent`)).toContain(
        String(selection),
      );
    }
    expect(await inspect(`document.body.textContent`)).not.toContain('开始录制');
    await page.getByRole('textbox', { name: '投保人姓名', exact: true }).fill('Grace');
    await expect
      .poll(() => inspect(`document.querySelector('[role=status]')?.textContent`))
      .toMatch(/· [1-9][0-9]* 条已保留事实/);
    await click('执行');
    expect(await inspect(`!!document.querySelector('[aria-label="执行路径图"]')`)).toBe(true);
    expect(await inspect(`!!document.querySelector('select[aria-label="操作范围"]')`)).toBe(false);
    await click('下一步');
    expect(await inspect(`document.querySelector('[aria-label="执行步进"]').value`)).toBe('1');
    await click('状态');
    await click('刷新当前状态');
    await expect
      .poll(() => inspect(`document.querySelector('table')?.textContent`))
      .toContain('applicant');
    await click('诊断');
    await expect
      .poll(() => inspect(`document.querySelector('main')?.textContent`))
      .toContain('诊断');
    await click('断开连接');
    await expect
      .poll(() => inspect(`document.querySelector('[role=status]')?.textContent`))
      .toContain('已断开');
    await page.getByRole('textbox', { name: '投保人姓名', exact: true }).fill('After disconnect');
    await expect(page.getByTestId('travel-snapshot')).toContainText('After disconnect');
    await click('重新连接');
    await expect
      .poll(() => inspect(`document.querySelector('[role=status]')?.textContent`))
      .toContain('已连接');
    expect(await inspect(`document.body.textContent`)).not.toContain('开始录制');
    await expect(page.getByLabel('表单接入诊断')).toHaveCount(0);
    // 同一面板跨导航重建真实 Port，不靠发现轮询恢复。
    const oldProducer = await inspect(`document.querySelector('[aria-label="观测对象"]').value`);
    await page.reload();
    await page.getByRole('button', { name: '打开完整表单' }).click();
    await expect
      .poll(() =>
        inspect(
          `Array.from(document.querySelector('[aria-label="观测对象"]').options).some(option => option.textContent.startsWith('表单') && option.value !== ${JSON.stringify(oldProducer)})`,
        ),
      )
      .toBe(true);
    await inspect(
      `(()=>{const picker=document.querySelector('[aria-label="观测对象"]');picker.value=Array.from(picker.options).find(o=>o.textContent.startsWith('表单')).value;picker.dispatchEvent(new Event('change'));})()`,
    );
    await expect
      .poll(() => inspect(`document.querySelector('[role=status]')?.textContent`))
      .toContain('元数据快照');
    await click('关系');
    expect(
      await inspect(
        `getComputedStyle(document.querySelector('.form-observer')).getPropertyValue('--purple').trim()`,
      ),
    ).toBe('#7357d5');
    expect(await inspect(`!!document.querySelector('.observer-detail')`)).toBe(true);
    // 数十成员使用真实 Compiler / Runtime / Renderer，从业务 UI 触发跨对象链。
    await page.goto('http://127.0.0.1:3217/demos/observation');
    await page.getByRole('button', { name: '打开完整表单' }).click();
    await expect(page.getByTestId('travel-snapshot')).toContainText('观测成员 36');
    await expect
      .poll(() =>
        inspect(
          `Array.from(document.querySelector('[aria-label="观测对象"]').options).some(o=>o.textContent.startsWith('表单'))`,
        ),
      )
      .toBe(true);
    await inspect(
      `(()=>{const p=document.querySelector('[aria-label="观测对象"]');p.value=Array.from(p.options).find(o=>o.textContent.startsWith('表单')).value;p.dispatchEvent(new Event('change'));})()`,
    );
    await expect
      .poll(() => inspect(`document.querySelector('[role=status]')?.textContent`))
      .toContain('元数据快照');
    await expect
      .poll(() => inspect(`document.querySelector('[aria-label="展开数组成员"]')?.options.length`))
      .toBe(37);
    await inspect(
      `(()=>{const p=document.querySelector('[aria-label="操作范围"]');p.setAttribute('data-probe','stable');p.focus();})()`,
    );
    await page.locator('#eligibility-mode').selectOption('manual');
    await page.getByRole('textbox', { name: '投保人姓名', exact: true }).fill('联动监护人');
    await expect(page.getByTestId('travel-snapshot')).toContainText('联动监护人');
    await expect
      .poll(async () => {
        const snapshot = JSON.parse((await page.getByTestId('travel-snapshot').textContent())!);
        return snapshot.insureds.filter(
          (member: { idNumber: string }) => member.idNumber === '联动监护人',
        ).length;
      })
      .toBe(24);
    await page.getByRole('button', { name: '拒绝待处理核验', exact: true }).click();
    await expect(page.getByText('本地资格核验未通过', { exact: true }).first()).toBeVisible();

    await expect
      .poll(() => inspect(`document.querySelector('[role=status]')?.textContent`))
      .toMatch(/· [1-9][0-9]* 条已保留事实/);
    expect(
      await inspect(
        `document.querySelector('[aria-label="操作范围"]')?.getAttribute('data-probe')`,
      ),
    ).toBe('stable');
    await inspect(`document.querySelector('[aria-label="操作范围"]').blur()`);
    await expect
      .poll(() => inspect(`document.querySelector('main')?.textContent`))
      .toContain('已观测影响至少');
    await click('执行');
    await expect
      .poll(() => inspect(`document.querySelectorAll('[aria-label="执行操作"] [role=tab]').length`))
      .toBeGreaterThan(1);
    expect(await inspect(`!!document.querySelector('select[aria-label="操作范围"]')`)).toBe(false);
    await click('下一步');
    expect(await inspect(`document.querySelector('[aria-label="执行步进"]').value`)).toBe('1');
    await click('关系');
    await inspect(
      `(()=>{const p=document.querySelector('[aria-label="展开数组成员"]');p.focus();p.selectedIndex=2;p.dispatchEvent(new Event('change'));})()`,
    );
    expect(await inspect(`document.querySelector('[aria-label="关系图"]')?.textContent`)).toContain(
      'copy-applicant-to-guardian',
    );
    const renderMs = await inspect(
      `(async()=>{const start=performance.now();Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='执行').click();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return performance.now()-start;})()`,
    );
    expect(Number(renderMs)).toBeLessThan(1500);
    expect(
      await inspect(`document.querySelector('[aria-label="执行路径图"]')?.textContent`),
    ).toContain('/applicant/name');
    const executionHtml = test.info().outputPath('execution-rendered.html');
    await writeFile(executionHtml, String(await inspect(`document.documentElement.outerHTML`)));
    await test
      .info()
      .attach('execution-rendered.html', { path: executionHtml, contentType: 'text/html' });

    const renderPath = test.info().outputPath('render-cost.json');
    await writeFile(
      renderPath,
      JSON.stringify({
        scenario: '36 members, real MV3, relationship to execution, two animation frames',
        durationMs: renderMs,
        localBudgetMs: 1500,
      }),
    );
    await test
      .info()
      .attach('render-cost.json', { path: renderPath, contentType: 'application/json' });
    await click('关系');
    await click('诊断');
    await expect
      .poll(() => inspect(`document.querySelector('main')?.textContent`))
      .toContain('source.result-published');
    await click('关系');
    await page.getByRole('button', { name: '删除成员', exact: true }).nth(1).click();
    await expect
      .poll(() => inspect(`document.querySelector('[aria-label="展开数组成员"]')?.options.length`))
      .toBe(36);
    await expect
      .poll(() => inspect(`document.querySelector('.observer-detail')?.textContent`))
      .toContain('当前已删除');
    expect(
      await inspect(
        `Array.from(document.querySelectorAll('svg g[role=button]')).some(node => node.getAttribute('opacity') === '1')`,
      ),
    ).toBe(true);
    const htmlPath = test.info().outputPath('panel-rendered.html');
    await writeFile(htmlPath, String(await inspect(`document.documentElement.outerHTML`)));
    await test.info().attach('panel-rendered.html', { path: htmlPath, contentType: 'text/html' });
    await click('断开连接');
  } finally {
    await context.close();
  }
});
