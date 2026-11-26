import { expect, test } from '@playwright/test';
test('首页导航连接四种正式物料场景，离开后重新进入使用独立会话', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveTitle('Assemble Studio · Playground');
  await expect(page.getByRole('heading', { name: 'Assemble Studio · Playground' })).toBeVisible();
  for (const [name, path, heading] of [
    ['基础资料', '/demos/basic', '基础资料'],
    ['家庭成员', '/demos/members', '家庭成员'],
    ['日期与城市', '/demos/interactions', '日期与城市'],
    ['家庭出行', '/demos/travel', '家庭出行'],
  ]) {
    await page.getByRole('link', { name: `打开${name}` }).click();
    await expect(page).toHaveURL(path!);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await page.getByRole('link', { name: '全部 Demo', exact: true }).click();
  }
  await page.getByRole('link', { name: '打开基础资料' }).click();
  await page.getByRole('button', { name: '打开物料验收' }).click();
  await page.getByRole('textbox', { name: '姓名', exact: true }).fill('离开前的填写');
  await page.getByRole('link', { name: '全部 Demo', exact: true }).click();
  await page.getByRole('link', { name: '打开基础资料' }).click();
  await page.getByRole('button', { name: '打开物料验收' }).click();
  await expect(page.getByRole('textbox', { name: '姓名', exact: true })).toHaveValue('Alice');
  await page.getByRole('link', { name: '全部 Demo', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Assemble Studio · Playground' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL('/demos/basic');
  await page.getByRole('button', { name: '打开物料验收' }).click();
  await expect(page.getByRole('textbox', { name: '姓名', exact: true })).toHaveValue('Alice');
  expect((await request.get('/l4')).status()).toBe(404);
  const api = await request.get('http://127.0.0.1:3101/');
  expect(api.status()).toBe(200);
  expect(await api.text()).toBe('Hello World!');
  expect(errors).toEqual([]);
});
