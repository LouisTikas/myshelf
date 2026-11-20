import { json, route } from '../../../server/util.js';
import { deleteItem } from '../../../server/save.js';

// POST /api/delete  { slug }
export const POST = route(async ({ request, env }) => {
  const { slug } = await request.json();
  return json(await deleteItem(env, slug));
});
