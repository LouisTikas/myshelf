import { json, handler } from '../../server/util.js';
import { refreshBoardgames } from '../../server/refresh.js';
import { wantsPublish } from '../../server/github.js';

// POST /api/refresh-boardgames  { slugs?: [...] }  → { sha, report }
export const onRequestPost = handler(async ({ request, env }) => {
  let slugs;
  try { ({ slugs } = await request.json()); } catch {}
  return json({ ...(await refreshBoardgames(env, Array.isArray(slugs) && slugs.length ? slugs : undefined, { publish: wantsPublish(request) })), published: wantsPublish(request) });
});
