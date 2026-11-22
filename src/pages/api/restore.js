import { json, route } from '../../../server/util.js';
import { restoreBackup, restoreCovers } from '../../../server/backup.js';

// POST /api/restore { ...backup file }                      → { items }
// POST /api/restore?covers=1 { origin, offset }              → copies the next few covers from the old site
export const POST = route(async ({ request, env, url }) => {
  const body = await request.json();
  if (url.searchParams.get('covers')) return json(await restoreCovers(env, { origin: body.origin, offset: Number(body.offset) || 0 }));
  return json(await restoreBackup(env, body));
});
