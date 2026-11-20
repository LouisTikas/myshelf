// Every /api/* request must carry `Authorization: Bearer <ADMIN_TOKEN>`.
import { json } from './util.js';

async function sha256(str) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)));
}

async function safeEqual(a, b) {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

/** Returns an error Response if the request isn't authorized, otherwise null. */
export async function checkAuth(request, env) {
  if (!env.ADMIN_TOKEN) return json({ error: 'ADMIN_TOKEN is not set in Cloudflare Pages environment variables.' }, 500);
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || !(await safeEqual(token, env.ADMIN_TOKEN))) return json({ error: 'Unauthorized' }, 401);
  return null;
}
