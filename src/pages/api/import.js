import { json, route } from '../../../server/util.js';
import { importBatch } from '../../../server/import.js';
import { seed } from '../../lib/seed.js';

// POST /api/import → copies the next batch of the old Git-based entries into the database.
// Call repeatedly until `remaining` is 0 (the admin page does this for you).
export const POST = route(async ({ request, env }) => {
  const origin = new URL(request.url).origin;
  const fetchAsset = (path) => (env.ASSETS ? env.ASSETS.fetch(new Request(origin + path)) : fetch(origin + path));
  return json(await importBatch(env, seed, fetchAsset));
});
