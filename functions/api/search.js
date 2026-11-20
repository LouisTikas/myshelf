import { json, handler, HttpError, TYPE_KEYS } from '../../server/util.js';
import { search } from '../../server/providers.js';

// GET /api/search?type=book&q=dune
export const onRequestGet = handler(async ({ request, env }) => {
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const q = (url.searchParams.get('q') || '').trim();
  if (!TYPE_KEYS.includes(type)) throw new HttpError(400, 'Invalid type');
  if (q.length < 2) throw new HttpError(400, 'Search query too short');
  const results = await search(type, q, env);
  return json({ results });
});
