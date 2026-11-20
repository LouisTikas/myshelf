import { json, handler, HttpError } from '../../server/util.js';
import { readFile, commitFiles } from '../../server/github.js';

// Custom orders for the per-type shelves (e.g. "book:finished" → [slugs]).
const FILE = 'src/data/arrangements.json';
const KEY = /^(book|movie|tv|music|videogame|boardgame):(want|in-progress|finished|abandoned)$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/;

async function load(env) {
  const text = await readFile(env, FILE);
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
}

// GET /api/arrangements → { arrangements }
export const onRequestGet = handler(async ({ env }) => json({ arrangements: await load(env) }));

// POST /api/arrangements { key, order: [slugs] }  (empty order resets to newest first)
export const onRequestPost = handler(async ({ request, env }) => {
  const { key, order } = await request.json();
  if (!KEY.test(key || '')) throw new HttpError(400, 'Invalid shelf');
  if (!Array.isArray(order)) throw new HttpError(400, 'order must be an array');
  const clean = [...new Set(order.map(String).filter((s) => SLUG.test(s)))].slice(0, 5000);
  const all = await load(env);
  if (clean.length) all[key] = clean; else delete all[key];
  const sorted = Object.fromEntries(Object.keys(all).sort().map((k) => [k, all[k]]));
  const sha = await commitFiles(env, `Arrange ${key}`, [{ path: FILE, text: JSON.stringify(sorted, null, 2) + '\n' }]);
  return json({ arrangements: sorted, sha });
});
