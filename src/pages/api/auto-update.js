import { json, route, HttpError } from '../../../server/util.js';
import { getAutoUpdate, setAutoUpdate } from '../../../server/updates.js';

// GET  /api/auto-update → { enabled, last: { at, result, message } | null }
// POST /api/auto-update { enabled } → turn the daily automatic update on or off
export const GET = route(async ({ env }) => json(await getAutoUpdate(env)));
export const POST = route(async ({ request, env }) => {
  const body = await request.json().catch(() => ({}));
  if (typeof body.enabled !== 'boolean') throw new HttpError(400, 'enabled must be true or false');
  return json(await setAutoUpdate(env, body.enabled));
});
