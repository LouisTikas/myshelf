// One-time import of the old Git-based shelf (Markdown files + covers in public/covers)
// into D1 + KV. Safe to run more than once: items already in the database are skipped,
// and collections / arrangements are only copied if the database doesn't have them yet.
import { parseMarkdown, normalizeItem } from './markdown.js';
import { getItem, putItem, hasSetting, setSetting } from './db.js';
import { storeCover, aspectOf, EXT, MIME } from './covers.js';

const BATCH = 15; // stay well under per-request limits; the admin calls again until done

/** seed: { files: { [path]: markdownText }, collections: [], arrangements: {} } */
export function seedEntries(seed) {
  return Object.entries(seed.files || {})
    .map(([path, text]) => ({ slug: path.split('/').pop().replace(/\.md$/, ''), text }))
    .filter((e) => /^[a-z0-9][a-z0-9-]{0,120}$/.test(e.slug))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Which seed items aren't in the database yet. */
export async function pendingImports(env, seed) {
  const out = [];
  for (const e of seedEntries(seed)) if (!(await getItem(env, e.slug))) out.push(e);
  return out;
}

/**
 * Import up to BATCH items. fetchAsset(path) → Response for files in public/ (e.g. "/covers/x.jpg").
 * Returns { imported: [slugs], remaining, settings: [keys copied] }.
 */
export async function importBatch(env, seed, fetchAsset) {
  const settings = [];
  for (const key of ['collections', 'arrangements']) {
    if (seed[key] != null && !(await hasSetting(env, key))) {
      await setSetting(env, key, seed[key]);
      settings.push(key);
    }
  }

  const todo = await pendingImports(env, seed);
  const imported = [];
  for (const { slug, text } of todo.slice(0, BATCH)) {
    const { data, body } = parseMarkdown(text);
    const item = normalizeItem(data);
    for (const k of ['dateAdded', 'dateStarted', 'dateFinished', 'rating']) if (item[k] == null) delete item[k];
    const m = String(item.cover || '').match(/^\/covers\/([a-z0-9][a-z0-9.-]*)$/i);
    if (m) {
      try {
        const res = await fetchAsset(`/covers/${m[1]}`);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          const ext = m[1].split('.').pop().toLowerCase();
          const type = MIME[ext] || (res.headers.get('content-type') || '').split(';')[0];
          if (buf.byteLength && EXT[type]) {
            item.cover = await storeCover(env, slug, { buf, ext: EXT[type], type });
            const a = aspectOf(buf);
            if (a) item.coverAspect = a;
          }
        }
      } catch { /* keep the old /covers/ path; it still works as a static file */ }
    }
    await putItem(env, slug, item, body);
    imported.push(slug);
  }
  return { imported, remaining: Math.max(0, todo.length - imported.length), settings };
}
