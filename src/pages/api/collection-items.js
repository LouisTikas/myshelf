import { json, route } from '../../../server/util.js';
import { removeFromCollection } from '../../../server/save.js';

// POST /api/collection-items  { collection: slug, remove: [itemSlug, ...] }
export const POST = route(async ({ request, env }) => {
  const { collection, remove } = await request.json();
  return json(await removeFromCollection(env, collection, remove));
});
