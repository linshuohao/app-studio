// Opt-in live acceptance against an isolated local Studio. Supply the checked travel form JSON.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { turnResponse, captureAssistantTurns } from './assistant-browser.mjs';
import { randomUUID, createHash } from 'node:crypto';
(async () => {
  const origin = new URL(process.env.CREATE_FORM_STUDIO_URL ?? 'http://127.0.0.1:3200').origin;
  assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
  const browser = await chromium.launch({ channel: 'chrome' });
  const p = await browser.newPage({ baseURL: origin });
  try {
    p.setDefaultTimeout(60000);
    await p.goto('/');
    await p.getByRole('button', { name: '以本地开发账号登录' }).click();
    await p.getByRole('button', { name: '表单助手', exact: true }).waitFor();
    async function post(path, data) {
      const r = await p.request.post('/api/platform' + path, {
        headers: { Origin: origin, 'Idempotency-Key': randomUUID() },
        data,
      });
      assert(r.ok(), await r.text());
      return r.json();
    }
    const candidate = JSON.parse(fs.readFileSync(process.env.TRAVEL_FORM_JSON, 'utf8'));
    delete candidate.reactions;
    const form = await post('/forms', { name: '旅险城市编辑验收' }),
      path = '/forms/' + form.formId;
    const work = await post(path + '/work', { name: '旅险初稿', text: JSON.stringify(candidate) });
    const initial = await post(path + '/versions', {
      workId: work.id,
      text: JSON.stringify(candidate),
      basedOnVersionId: null,
    });

    await p.goto('/?form=' + form.formId + '&work=' + work.id);
    await p.getByRole('button', { name: '更多操作' }).click();
    await p.getByRole('menuitem', { name: 'Agent 协作', exact: true }).click();
    await p.getByRole('button', { name: 'JSON 原文', exact: true }).click();
    await p.getByRole('button', { name: '文本查看 / 修复' }).click();
    const raw = p.getByRole('textbox', { name: '配置原文' });
    const base = JSON.parse(await raw.inputValue());
    function visit(v, fn) {
      if (v && typeof v === 'object') {
        fn(v);
        Object.values(v).forEach((x) => visit(x, fn));
      }
    }
    function edit(doc, title, hint) {
      visit(doc.views, (v) => {
        if (
          v.material === 'field' &&
          (v.children ?? v.slots?.default)?.[0]?.material === 'remote-select'
        )
          v.props.label = title;
        if (v.material === 'remote-select') v.props.placeholder = hint;
      });
    }
    edit(base, '抵达城市', '输入目的地');
    await raw.fill(JSON.stringify(base));
    await p
      .getByLabel('修改要求')
      .fill(
        '仅修改现有表单两项：目的地国家变化时清空旧城市；城市搜索框 placeholder 改成“搜索城市”。保留所有其他配置。',
      );
    await captureAssistantTurns(p);
    const result = p.waitForResponse((r) => r.url().endsWith('/turns'), { timeout: 620000 });
    await p.getByText('发送修改要求', { exact: true }).click();
    await expect(p.locator('.design-source')).toHaveAttribute('inert', '');
    await expect(p.getByRole('button', { name: '保存配置', exact: true })).toBeDisabled();
    console.log('lock verified');
    const res = await result,
      body = (await turnResponse(res)).editorProposal;
    assert(body);
    console.log('candidate', body.digest);
    await p.getByText('对比并应用候选', { exact: true }).waitFor();
    edit(base, '手工抵达城市', '请输入抵达城市');
    await raw.fill(JSON.stringify(base));
    await p.getByText('对比并应用候选', { exact: true }).click();
    const dialog = p.getByRole('dialog', { name: '对比候选与当前工作稿' });
    await expect(dialog.getByText('应用到当前工作稿')).toBeDisabled();
    const choices = dialog.getByLabel('保留手工值');
    assert(await choices.count());
    for (const c of await choices.all()) await c.check();
    await dialog.getByText('应用到当前工作稿').click();
    await expect(p.getByText('保存配置', { exact: true })).toBeDisabled();
    const req = p.waitForRequest((r) => r.url().endsWith('/preview') && r.method() === 'POST');
    await p.getByRole('button', { name: '预览配置', exact: true }).click();
    const preview = (await req).postDataJSON().text;
    const area = p.getByRole('region', { name: '受控预览' });
    const select = area.getByRole('combobox').last();
    async function country(x) {
      const op = select.getByRole('option', { name: x });
      await select.selectOption(await op.getAttribute('value'));
    }
    async function city(x) {
      await area.getByRole('searchbox').fill(x);
      await area.getByRole('button', { name: '搜索', exact: true }).click();
      await area.getByRole('button', { name: x + '市（模拟）' }).click();
    }
    await country(/中国/);
    await expect(area.getByRole('searchbox')).toHaveAttribute('placeholder', '请输入抵达城市');
    await city('上海');
    await country(/日本/);
    await expect(area.getByText('当前选择：未选择')).toBeVisible();
    await city('东京');
    await p.getByText('确认此版试填结果').click();
    const sv = p.waitForResponse(
      (r) => r.url().endsWith('/versions') && r.request().method() === 'POST',
    );
    await p.getByRole('button', { name: '保存配置', exact: true }).click();
    const resp = await sv;
    assert(resp.ok(), await resp.text());
    const { versionId } = await resp.json();
    const read = await (
      await p.request.get('/api/platform' + path + '/versions/' + versionId)
    ).json();
    assert.equal(read.text, preview);
    assert(preview.includes('手工抵达城市'));
    assert(preview.includes('请输入抵达城市'));
    assert.equal(read.basedOnVersionId, initial.versionId);
    const hash = (t) => createHash('sha256').update(t).digest('hex');
    const proof = {
      formId: form.formId,
      versionId,
      basedOnVersionId: read.basedOnVersionId,
      previewDigest: hash(preview),
      storedDigest: hash(read.text),
      candidateDigest: body.digest,
    };
    if (process.env.CREATE_FORM_ACCEPTANCE_OUTPUT)
      fs.writeFileSync(process.env.CREATE_FORM_ACCEPTANCE_OUTPUT, JSON.stringify(proof, null, 2));
    console.log(proof);
  } catch (e) {
    console.log((await p.locator('body').innerText()).slice(-3700));
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
