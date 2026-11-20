import { json, route, HttpError } from '../../../server/util.js';
import { assertSlug } from '../../../server/paths.js';
import { getItem } from '../../../server/db.js';

// GET /api/item?slug=book-dune-1965
export const GET = route(async ({ url, env }) => {
  const slug = assertSlug(url.searchParams.get('slug'));
  const row = await getItem(env, slug);
  if (!row) throw new HttpError(404, 'Item not found');
  return json({ slug, item: row.item, body: row.body });
});
