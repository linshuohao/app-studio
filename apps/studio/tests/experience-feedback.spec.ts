import { expect, test } from '@playwright/test';
import { registerGitHubAccount } from './admission-fixture';

test('explains unavailable GitHub login and keeps member actions visible', async ({
  page,
  browser,
  baseURL,
}) => {
  await page.route('**/api/platform/github/enabled', (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.goto('/');
  await expect(
    page.getByText('当前环境未配置 GitHub 登录，暂不可用；请使用内置账号登录。'),
  ).toBeVisible();
  await expect(
    page
      .getByLabel('用户名', { exact: true })
      .or(page.getByRole('button', { name: '使用账号密码登录', exact: true })),
  ).toBeVisible();
  if (await page.getByRole('button', { name: '使用账号密码登录', exact: true }).isVisible())
    await page.getByRole('button', { name: '使用账号密码登录', exact: true }).click();
  await page.getByLabel('用户名').fill('studio-test');
  await page.getByLabel('密码', { exact: true }).fill('local-browser-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('button', { name: '我的账号', exact: true }).click();
  await page.getByRole('menuitem', { name: '账号与权限', exact: true }).click();
  await expect(page.getByText('尚未绑定 GitHub 账号。')).toBeVisible();
  await expect(page.getByLabel('确认内置密码')).toBeVisible();
  await expect(page.getByText(/新密码至少 12 个字符/)).toBeVisible();
  await page.getByRole('button', { name: '成员', exact: true }).click();
  const applicant = await browser.newContext();
  try {
    const origin = new URL(baseURL!).origin;
    await registerGitHubAccount(applicant.request, origin, 'studio-experience-code');
    const pending = await applicant.request.post(origin + '/api/platform/join-requests', {
      headers: { Origin: origin },
      data: { explanation: '这是加入团队的申请说明。'.repeat(60) },
    });
    expect(pending.status()).toBe(200);
  } finally {
    await applicant.close();
  }
  await page.getByRole('tab', { name: '加入申请', exact: true }).click();
  await page
    .getByRole('button', { name: '审批申请 @experience-studio-member', exact: true })
    .click();
  for (const viewport of [
    { width: 1160, height: 826 },
    { width: 390, height: 700 },
  ]) {
    await page.setViewportSize(viewport);
    const dialog = page.getByRole('dialog', { name: '审批加入申请' });
    const button = dialog.getByRole('button', { name: '批准并授予角色' });
    await expect(button).toBeInViewport({ ratio: 1 });
    const body = dialog.locator('.member-dialog-body');
    const sizes = await body.evaluate((el) => ({
      height: el.clientHeight,
      scroll: el.scrollHeight,
      overflow: getComputedStyle(el).overflowY,
    }));
    expect(sizes.overflow).toBe('auto');
    expect(sizes.scroll).toBeGreaterThan(sizes.height);
  }
});
