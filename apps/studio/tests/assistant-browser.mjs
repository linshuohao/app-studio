// The browser reads only the visible turn and the independently delivered Platform artifact.
import assert from 'node:assert/strict';

// CDP cannot reliably retrieve streamed response bodies. Observe a clone of
// the same fetch in the page, leaving the application's reader untouched.
export async function captureAssistantTurns(page) {
  await page.evaluate(() => {
    if (window.__studioTestAssistantTurns) return;
    const results = (window.__studioTestAssistantTurns = {});
    const original = window.fetch.bind(window);
    window.fetch = (resource, options) => {
      const response = original(resource, options);
      if (options?.method === 'POST' && String(resource).endsWith('/turns')) {
        const { turnId } = JSON.parse(options.body);
        void response
          .then(async (r) => {
            const body = await r.clone().text();
            if (!r.ok) throw Error('Assistant HTTP ' + r.status);
            const events = body
              .split('\n')
              .filter((line) => line.startsWith('data: {'))
              .map((line) => JSON.parse(line.slice(6)));
            const final = events.find((e) => e.type === 'data-result');
            if (!final)
              throw Error(
                'Assistant stream ended with ' +
                  JSON.stringify(events.find((e) => e.type === 'data-failure') ?? 'no result'),
              );
            results[turnId] = { value: final.data };
          })
          .catch((e) => {
            results[turnId] = { error: e.message };
          });
      }
      return response;
    };
  });
}
export async function turnResponse(response) {
  const { turnId } = response.request().postDataJSON(),
    page = response.frame().page();
  const value = await page.waitForFunction(
    (id) => window.__studioTestAssistantTurns?.[id],
    turnId,
    { timeout: 620000 },
  );
  const result = await value.jsonValue();
  await value.dispose();
  assert(!result.error, result.error);
  return result.value;
}
export async function clickTurn(
  page,
  label = '发送',
  submit = () => page.getByRole('button', { name: label, exact: true }).click(),
) {
  await captureAssistantTurns(page);
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes('/agent-conversations/') &&
        r.url().endsWith('/turns') &&
        r.request().method() === 'POST',
      { timeout: 620000 },
    ),
    submit(),
  ]);
  const payload = response.request().postDataJSON();
  assert(!('history' in payload) && !('previous_failure' in payload));
  const next = await turnResponse(response);
  const turn = next.conversation.turns.find((entry) => entry.turnId === payload.turnId);
  assert(turn && turn.message === payload.message);
  return next;
}

export async function openDeliveredDraft(page, draftName) {
  const link = page.getByRole('link').filter({ hasText: draftName });
  await page.goto(await link.getAttribute('href'));
}
