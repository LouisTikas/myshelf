import { json, route } from '../../../server/util.js';
import { getArrangements, saveArrangement } from '../../../server/settings.js';

// Custom orders for the per-type shelves (e.g. "book:finished" → [slugs]).
export const GET = route(async ({ env }) => json({ arrangements: await getArrangements(env) }));

// POST /api/arrangements { key, order: [slugs] }  (empty order resets to newest first)
export const POST = route(async ({ request, env }) => {
  const { key, order } = await request.json();
  return json({ arrangements: await saveArrangement(env, key, order) });
});
