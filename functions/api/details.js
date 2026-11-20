import { json, handler, HttpError, TYPE_KEYS } from '../../server/util.js';
import { details } from '../../server/providers.js';

// GET /api/details?type=movie&source=tmdb&id=123
export const onRequestGet = handler(async ({ request, env }) => {
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const source = url.searchParams.get('source');
  const id = url.searchParams.get('id');
  if (!TYPE_KEYS.includes(type) || !source || !id) throw new HttpError(400, 'type, source and id are required');
  return json({ details: await details(type, source, id, env) });
});
