import { json, route } from '../../../server/util.js';
import { refreshBoardgames } from '../../../server/refresh.js';

// POST /api/refresh-boardgames  { slugs?: [...] }  → { updated, report }
export const POST = route(async ({ request, env }) => {
  let slugs;
  try { ({ slugs } = await request.json()); } catch {}
  return json(await refreshBoardgames(env, Array.isArray(slugs) && slugs.length ? slugs : undefined));
});
