import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, hash) => (error ? reject(error) : resolve(hash)));
  });
}
export const usernamePattern = /^[a-zA-Z0-9_.-]{1,64}$/;
export const defaultSpaceId = 'default';

export function validPassword(password: unknown): password is string {
  return typeof password === 'string' && Buffer.byteLength(password) <= 256;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = (await derive(password, salt)).toString('hex');
  return { salt, hash };
}

export async function verifyPassword(password: string, salt: string, hash: string) {
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}
