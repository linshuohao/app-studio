// Preloaded only by the Studio test API process. All other fetches retain normal routing.
const actualFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (input === 'https://github.com/login/oauth/access_token') {
    const params = new URLSearchParams(init?.body);
    const valid =
      [
        'studio-test-code',
        'studio-registration-code',
        'studio-registration-cancel',
        'studio-approval-code',
        'studio-experience-code',
        'studio-stale-code',
        'studio-stale-same-code',
        'studio-methods-code',
        'studio-conflict-owner-code',
        'studio-member-methods-code',
        'studio-late-setup-code',
      ].includes(params.get('code')) &&
      /^[A-Za-z0-9_-]{43}$/.test(params.get('code_verifier') ?? '');
    return valid
      ? Response.json({
          access_token:
            params.get('code') === 'studio-test-code' ? 'studio-test-token' : params.get('code'),
        })
      : Response.json({ error: 'bad_verification_code' }, { status: 400 });
  }
  if (input === 'https://api.github.com/user') {
    const identities = {
      'Bearer studio-test-token': { id: 4242, login: 'studio-octocat' },
      'Bearer studio-registration-code': { id: 5252, login: 'new-studio-member' },
      'Bearer studio-registration-cancel': { id: 6262, login: 'cancel-studio-member' },
      'Bearer studio-approval-code': { id: 7272, login: 'approval-studio-member' },
      'Bearer studio-experience-code': { id: 8282, login: 'experience-studio-member' },
      'Bearer studio-stale-code': { id: 9292, login: 'stale-studio-member' },
      'Bearer studio-stale-same-code': { id: 9393, login: 'stale-same-studio-member' },
      'Bearer studio-methods-code': { id: 10101, login: 'methods-studio-member' },
      'Bearer studio-conflict-owner-code': { id: 10202, login: 'conflict-owner' },
      'Bearer studio-member-methods-code': { id: 10303, login: 'member-methods' },
      'Bearer studio-late-setup-code': { id: 10404, login: 'late-setup-member' },
    };
    const identity = identities[init?.headers?.Authorization];
    return identity ? Response.json(identity) : new Response(null, { status: 401 });
  }
  return actualFetch(input, init);
};
