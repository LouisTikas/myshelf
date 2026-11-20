import { json, handler, HttpError, slugify } from '../../server/util.js';
import { readFile, commitFiles } from '../../server/github.js';
import { COLLECTIONS_FILE } from '../../server/paths.js';

// GET /api/collections → live list from GitHub
export const onRequestGet = handler(async ({ env }) => {
  const text = await readFile(env, COLLECTIONS_FILE);
  return json({ collections: text ? JSON.parse(text) : [] });
});

// POST /api/collections  { collections: [{ slug?, name, description }] }  (order = display order)
export const onRequestPost = handler(async ({ request, env }) => {
  const { collections } = await request.json();
  if (!Array.isArray(collections)) throw new HttpError(400, 'collections must be an array');
  const seen = new Set();
  const clean = collections.map((c) => {
    const name = String(c.name || '').trim();
    if (!name) throw new HttpError(400, 'Every collection needs a name');
    let slug = c.slug ? String(c.slug) : slugify(name);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) slug = slugify(slug);
    while (seen.has(slug)) slug += '-2';
    seen.add(slug);
    return { slug, name, description: String(c.description || '').trim() };
  });
  const sha = await commitFiles(env, 'Update collections', [
    { path: COLLECTIONS_FILE, text: JSON.stringify(clean, null, 2) + '\n' },
  ]);
  return json({ collections: clean, sha });
});
