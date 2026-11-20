import { json, handler } from '../../server/util.js';
import { saveItem } from '../../server/save.js';
import { wantsPublish } from '../../server/github.js';

// POST /api/save  { slug?, item, body }
export const onRequestPost = handler(async ({ request, env }) => {
  const payload = await request.json();
  return json({ ...(await saveItem(env, payload, { publish: wantsPublish(request) })), published: wantsPublish(request) });
});
