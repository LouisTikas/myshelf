// Cover images live in Cloudflare KV (free, no card needed) and are served from /img/<name>.
import { imageSize } from 'image-size';
import { HttpError } from './util.js';

export const IMG_PREFIX = '/img/';
const NAME = /^[a-z0-9][a-z0-9.-]{0,160}$/;

export const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
export const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };
const MAX_COVER_BYTES = 5 * 1024 * 1024; // KV allows 25 MB per value; covers never need that much

export const hasCovers = (env) => Boolean(env?.COVERS);

function kv(env) {
  if (!env?.COVERS) {
    throw new HttpError(500, 'Cover storage is not connected. Your Worker has no KV namespace binding named COVERS. Check the kv_namespaces entry in wrangler.jsonc (or Worker → Settings → Bindings), then redeploy.');
  }
  return env.COVERS;
}

/** "/img/foo.jpg" → "foo.jpg" for covers we store; otherwise null. */
export function storedCoverName(cover) {
  const s = String(cover || '');
  if (!s.startsWith(IMG_PREFIX)) return null;
  const name = s.slice(IMG_PREFIX.length);
  return NAME.test(name) ? name : null;
}

/** width / height, rounded, or null. */
export function aspectOf(buf) {
  try {
    const { width, height } = imageSize(new Uint8Array(buf));
    return width > 0 && height > 0 ? Math.round((width / height) * 10000) / 10000 : null;
  } catch {
    return null;
  }
}

/** Download a remote image. Returns { buf, ext, type } or null. */
export async function downloadImage(url, fetcher = fetch) {
  try {
    const res = await fetcher(url, { headers: { 'user-agent': 'MyShelf' }, redirect: 'follow' });
    if (!res.ok) return null;
    let type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!EXT[type]) {
      const ext = String(url).split('?')[0].split('.').pop().toLowerCase();
      type = MIME[ext] || type;
    }
    if (!EXT[type]) return null;
    const buf = await res.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > MAX_COVER_BYTES) return null;
    return { buf, ext: EXT[type], type: type === 'image/jpg' ? 'image/jpeg' : type };
  } catch {
    return null;
  }
}

/** Store an image under a fresh name (so browsers can cache it forever). Returns "/img/<name>". */
export async function storeCover(env, slug, img) {
  const name = `${slug}-${Date.now().toString(36)}.${img.ext}`;
  await kv(env).put(name, img.buf, { metadata: { type: img.type } });
  return IMG_PREFIX + name;
}

export async function deleteCover(env, cover) {
  const name = storedCoverName(cover);
  if (name && env?.COVERS) await env.COVERS.delete(name);
}

/** Response for GET /img/<name>. */
export async function serveCover(env, name) {
  if (!NAME.test(name || '') || !env?.COVERS) return new Response('Not found', { status: 404 });
  const { value, metadata } = await env.COVERS.getWithMetadata(name, { type: 'arrayBuffer' });
  if (!value) return new Response('Not found', { status: 404 });
  const ext = name.split('.').pop();
  return new Response(value, {
    headers: {
      'content-type': metadata?.type || MIME[ext] || 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
