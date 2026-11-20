import { json, handler } from '../../server/util.js';
import { deleteItem } from '../../server/save.js';

// POST /api/delete  { slug }
export const onRequestPost = handler(async ({ request, env }) => {
  const { slug } = await request.json();
  return json(await deleteItem(env, slug));
});
