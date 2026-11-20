import { json, handler } from '../../server/util.js';
import { saveItem } from '../../server/save.js';

// POST /api/save  { slug?, item, body }
export const onRequestPost = handler(async ({ request, env }) => {
  const payload = await request.json();
  return json(await saveItem(env, payload));
});
