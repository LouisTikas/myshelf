import { json, route } from '../../../server/util.js';
import { getCollections, saveCollections } from '../../../server/settings.js';

// GET /api/collections
export const GET = route(async ({ env }) => json({ collections: await getCollections(env) }));

// POST /api/collections  { collections: [{ slug?, name, description, ... }] }  (order = display order)
export const POST = route(async ({ request, env }) => {
  const { collections } = await request.json();
  return json({ collections: await saveCollections(env, collections) });
});
