import { json, route } from '../../../server/util.js';
import { getSite, saveSite } from '../../../server/site.js';

// GET /api/site → { site }   POST /api/site { title, tagline, owner } → { site }
export const GET = route(async ({ env }) => json({ site: await getSite(env) }));
export const POST = route(async ({ request, env }) => json({ site: await saveSite(env, await request.json()) }));
