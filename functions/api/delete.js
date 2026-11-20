import { json, handler } from '../../server/util.js';
import { deleteItem } from '../../server/save.js';
import { wantsPublish } from '../../server/github.js';

// POST /api/delete  { slug }
export const onRequestPost = handler(async ({ request, env }) => {
  const { slug } = await request.json();
  return json({ ...(await deleteItem(env, slug, { publish: wantsPublish(request) })), published: wantsPublish(request) });
});
