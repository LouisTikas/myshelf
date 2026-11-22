import { json, route } from '../../../../server/util.js';
import { shelfFeed } from '../../../../server/federation/index.js';

// GET /federation/v1/shelf → public items for anyone; friends-only items too when the request is signed by a friend.
export const GET = route(async ({ request, env }) => json(await shelfFeed(env, request), 200, { 'access-control-allow-origin': '*' }));
