import type { NextRequest } from 'next/server';

const callbackPath = '/api/platform/github/callback';
const results = new Set([
  'signed-in',
  'registration-required',
  'password-setup-verified',
  'bound',
  'unbound',
  'invalid',
  'cancelled',
  'conflict',
  'unavailable',
]);

export async function GET(request: NextRequest) {
  let result = 'unavailable';
  try {
    const api = new URL(callbackPath, process.env.PLATFORM_API_URL || 'http://127.0.0.1:3001');
    api.search = request.nextUrl.search;
    const response = await fetch(api, {
      headers: { Cookie: request.headers.get('cookie') ?? '' },
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    const location = response.headers.get('location') ?? '';
    const prefix = '/?github=';
    if (response.status === 303 && location.startsWith(prefix)) {
      const status = location.slice(prefix.length);
      if (results.has(status)) result = status;
    }
  } catch {
    // Proxy failures must not log the callback query, which contains code and state.
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/?github=' + result,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
