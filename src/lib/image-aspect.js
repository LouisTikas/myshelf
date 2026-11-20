// Build-time image proportions for covers stored in the repo (public/covers/...).
import fs from 'node:fs';
import path from 'node:path';
import { imageSize } from 'image-size';

const cache = new Map();

/** width / height of a locally stored cover, or null if unknown (e.g. a hotlinked image). */
export function coverAspect(cover) {
  if (!cover || !cover.startsWith('/covers/')) return null;
  if (cache.has(cover)) return cache.get(cover);
  let aspect = null;
  try {
    const { width, height } = imageSize(fs.readFileSync(path.join(process.cwd(), 'public', cover)));
    if (width > 0 && height > 0) aspect = width / height;
  } catch {}
  cache.set(cover, aspect);
  return aspect;
}
