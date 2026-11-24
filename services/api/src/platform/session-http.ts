import { ForbiddenException } from '@nestjs/common';

export function studioOrigin() {
  return process.env.PLATFORM_STUDIO_ORIGIN || 'http://127.0.0.1:3200';
}

export function requireStudioOrigin(origin: string | undefined) {
  const configured = studioOrigin();
  if (origin === configured) return;
  const allowed = [configured];
  if (process.env.NODE_ENV === 'development') {
    const url = new URL(configured);
    if (
      url.origin === configured &&
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    ) {
      url.hostname = url.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
      if (origin === url.origin) return;
      allowed.push(url.origin);
    }
  }
  const reason = origin ? '当前页面的来源未获允许' : '请求缺少页面来源（Origin）';
  throw new ForbiddenException({
    statusCode: 403,
    code: 'STUDIO_ORIGIN_REJECTED',
    message: reason + '。请从 ' + allowed.join(' 或 ') + ' 打开 Studio 后重试。',
  });
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: studioOrigin().startsWith('https://'),
    sameSite: 'lax' as const,
    path: '/',
  };
}

export function cookieName() {
  return cookieOptions().secure ? '__Host-platform-session' : 'platform-session';
}

export function session(cookie: string | undefined) {
  const prefix = `${cookieName()}=`;
  const value = cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  return value && /^[a-zA-Z0-9_-]{43}$/.test(value) ? value : undefined;
}
