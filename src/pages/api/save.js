import { json, route } from '../../../server/util.js';
import { saveItem } from '../../../server/save.js';

// POST /api/save  { slug?, item, body }  → live immediately
export const POST = route(async ({ request, env }) => json(await saveItem(env, await request.json())));
