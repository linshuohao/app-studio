import { expect, test } from '@playwright/test';

for (const interrupted of [false, true]) {
  test(`shows in-flight details and collapses the ${interrupted ? 'interrupted' : 'completed'} turn`, async ({
    page,
    baseURL,
  }) => {
    const login = await page.request.post('/api/platform/login', {
      headers: { Origin: baseURL! },
      data: { username: 'studio-test', password: 'local-browser-test-password' },
    });
    expect(login.ok()).toBeTruthy();
    const id = crypto.randomUUID();
    const draftId = crypto.randomUUID();
    const message = '创建旅险表单';
    const draft = {
      id: draftId,
      name: '旅险投保表单',
      versionName: '',
      revision: 1,
      text: '{}',
      candidateText: '{}',
      candidateDigest: 'fixture',
      appliedDigest: 'fixture',
    };
    let conversation: object = { id, title: '旅险', revision: 0, turns: [] };
    await page.route('**/agent-conversations/' + id, (route) =>
      route.fulfill({ json: conversation }),
    );
    await page.route('**/agent-conversations/' + id + '/deliveries/*', (route) =>
      route.fulfill({ json: { draft } }),
    );
    await page.addInitScript((id) => {
      const fetch = window.fetch;
      window.fetch = (input, init) => {
        const turns = '/api/platform/agent-conversations/' + id + '/turns';
        const resume =
          typeof input === 'string' && input.startsWith(turns + '/') && input.endsWith('/resume');
        if (input !== turns && !resume) {
          return fetch(input, init);
        }
        const turnId = resume ? input.split('/').at(-2) : JSON.parse(String(init?.body)).turnId;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const encoder = new TextEncoder();
            function send(data: object) {
              controller.enqueue(encoder.encode('data: ' + JSON.stringify(data) + '\n\n'));
            }
            const receive = (event: Event) => {
              const chunk = (event as CustomEvent<{ type: string; data: unknown }>).detail;
              send(chunk);
              if (chunk.type === 'data-result' || chunk.type === 'data-failure') {
                window.removeEventListener('fixture-agent-frame', receive);
                controller.close();
              }
            };
            window.addEventListener('fixture-agent-frame', receive);
            document.documentElement.dataset[resume ? 'fixtureResumedTurnId' : 'fixtureTurnId'] =
              turnId;
            send({ type: 'start', messageId: turnId });
          },
        });
        return Promise.resolve(
          new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }),
        );
      };
    }, id);
    const frame = (data: object) =>
      page.evaluate((detail) => {
        window.dispatchEvent(new CustomEvent('fixture-agent-frame', { detail }));
      }, data);
    await page.goto('/?page=agent&conversation=' + id);
    await page.getByRole('textbox', { name: '发送消息' }).fill(message);
    await page.getByRole('button', { name: '发送', exact: true }).click();
    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-fixture-turn-id', /.+/);
    const turnId = await root.getAttribute('data-fixture-turn-id');
    const progress = {
      type: 'progress',
      stage: 'schema',
      message: '正在生成数据 Schema 的验收用例',
    };
    const phase = { stage: 'compile', status: 'started' };
    await frame({
      type: 'data-stage-progress',
      data: { stage: progress.stage, message: progress.message },
    });
    const log = page.getByRole('log');
    const timeline = log.locator('.agent-attempt-process');
    const summary = timeline.locator(':scope > summary');
    const indicator = timeline.locator('.agent-attempt-running');
    await expect(indicator).toHaveText(progress.message);
    const schema = log.locator('.agent-attempt-stage').filter({ hasText: 'Schema' });
    await expect(schema).toBeHidden();
    await expect
      .poll(() => indicator.evaluate((node) => getComputedStyle(node, '::before').animationName))
      .toBe('agent-attempt-spin');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect
      .poll(() => indicator.evaluate((node) => getComputedStyle(node, '::before').animationName))
      .toBe('none');
    const schemaComplete = { stage: 'schema', status: 'completed' };
    await frame({ type: 'data-compose-phase', data: schemaComplete });
    const completion = log.getByText('数据 Schema 已通过检查。', { exact: true });
    await expect(completion).toBeVisible();
    await expect(schema.getByText(progress.message, { exact: true })).toBeHidden();
    await frame({ type: 'data-compose-phase', data: phase });
    await expect(indicator).toHaveText('正在编译整表候选');
    expect(
      await completion.evaluate((node) =>
        Boolean(
          node.compareDocumentPosition(document.querySelector('.agent-attempt-running')!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
    ).toBe(true);
    await summary.focus();
    await summary.press('Enter');
    const compile = timeline.locator('.agent-attempt-stage').filter({ hasText: '编译 ·' });
    await expect(compile.locator('summary')).toHaveText('编译 · 处理中');
    await expect(compile.locator('li')).toBeHidden();
    await expect(schema.getByText(progress.message, { exact: true })).toBeHidden();
    await schema.locator('summary').press('Enter');
    await expect(schema.getByText(progress.message, { exact: true })).toBeVisible();
    await frame({ type: 'text-start', id: 'reply' });
    await frame({ type: 'text-delta', id: 'reply', delta: '候选正在' });
    await expect(log.getByText('候选正在', { exact: true })).toBeVisible();
    await frame({ type: 'text-delta', id: 'reply', delta: '编译' });
    await expect(log.getByText('候选正在编译', { exact: true })).toBeVisible();
    await frame({ type: 'text-delta', id: 'reply', delta: '\n\n```json\n{ "ready":' });
    const liveCode = log.locator('.studio-code-block code[data-language="json"]');
    await expect(liveCode.locator('[data-code-token="property"]')).toHaveText('"ready"');
    await frame({ type: 'text-delta', id: 'reply', delta: ' true }\n```' });
    await expect(liveCode.locator('[data-code-token="literal"]')).toHaveText('true');
    const retry = {
      stage: 'compile',
      status: 'retrying',
      attempt: 2,
      detail: '视图字段绑定未通过。',
    };
    await frame({ type: 'data-compose-phase', data: retry });
    await expect(indicator).toHaveText('正在修复候选，准备重新编译（第 2 次）');
    await expect(compile.locator('summary')).toHaveText('编译 · 重试中');
    await compile.locator('summary').click();
    await expect(compile.locator('li')).toHaveText([
      '处理中',
      '重试中（第 2 次） · 视图字段绑定未通过。',
    ]);
    const result = {
      kind: 'proposal',
      summary: '编译通过\n\n```json\n{ "ready": true }\n```\n\n```unknown\n<example>\n```',
    };
    conversation = {
      id,
      title: '旅险',
      revision: interrupted ? 0 : 1,
      turns: interrupted ? [] : [{ turnId, message, result, draftId }],
      attempts: [
        {
          turnId,
          message,
          status: interrupted ? 'interrupted' : 'done',
          resumable: interrupted,
          elapsedMs: 3600,
          interruptionReason: interrupted ? '编译服务暂时不可用。' : undefined,
          events: [
            progress,
            { type: 'compose_phase', ...schemaComplete },
            { type: 'compose_phase', ...phase },
            { type: 'compose_phase', ...retry },
            ...(!interrupted
              ? [{ type: 'compose_phase', stage: 'compile', status: 'completed' }]
              : []),
          ],
        },
      ],
    };
    await frame(
      interrupted
        ? { type: 'data-failure', data: { status: 502, reason: '编译服务暂时不可用。' } }
        : { type: 'data-result', data: { conversation, draft } },
    );
    await expect(summary).toHaveText(
      interrupted ? '用时 3 秒 · 编译 · 处理中断' : '用时 3 秒 · 编译 · 已结束',
    );
    await expect(log.locator('.agent-attempt-running')).toHaveCount(0);
    await expect(completion).toHaveCount(0);
    await expect(log.getByText(progress.message, { exact: true })).toBeHidden();
    await expect(log.getByText(interrupted ? /编译服务暂时不可用/ : '编译通过')).toBeVisible();
    if (!interrupted) {
      const resource = log.getByRole('link', { name: /旅险投保表单/ });
      await expect(resource).toHaveAttribute('href', new RegExp(draftId));
      await expect(liveCode.locator('[data-code-token="literal"]')).toHaveText('true');
      const plainCode = log.locator('.studio-code-block code[data-language="text"]');
      await expect(plainCode).toHaveText('<example>');
      await expect(plainCode.locator('[data-code-token]')).toHaveCount(0);
      const reply = log.locator('.agent-message').getByText('编译通过', { exact: true });
      expect(
        await reply.evaluate((node) => {
          const message = node.closest('.agent-message');
          return Boolean(message?.previousElementSibling?.querySelector('.agent-attempt-process'));
        }),
      ).toBe(true);
    }
    await summary.focus();
    await summary.press('Enter');
    await schema.locator('summary').press('Enter');
    await expect(log.getByText(progress.message, { exact: true })).toBeVisible();
    if (interrupted) {
      await log.getByRole('button', { name: '继续处理' }).click();
      await expect(root).toHaveAttribute('data-fixture-resumed-turn-id', turnId!);
      await frame({
        type: 'data-stage-progress',
        data: { stage: 'compile', message: '正在重新编译已修复的视图' },
      });
      await expect(indicator).toHaveText('正在重新编译已修复的视图');
      await expect(compile).toBeHidden();
      await summary.click();
      await compile.locator('summary').click();
      await expect(compile.getByText('正在重新编译已修复的视图', { exact: true })).toBeVisible();
    }
  });
}
