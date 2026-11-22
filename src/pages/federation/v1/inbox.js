import { json, route } from '../../../../server/util.js';
import { receive } from '../../../../server/federation/index.js';

// POST /federation/v1/inbox → signed messages from other MyShelf sites (friend requests, recommendations, …).
export const POST = route(async ({ request, env }) => json(await receive(env, request), 202));
