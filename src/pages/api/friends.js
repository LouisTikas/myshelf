import { json, route, HttpError } from '../../../server/util.js';
import * as fed from '../../../server/federation/index.js';

// GET  /api/friends            → { me, friends, inbox, unread }
// GET  /api/friends?shelf=<id> → that friend's shelf (including their friends-only items)
// POST /api/friends { action, ... } → add | accept | decline | block | remove | recommend | borrow | reply | mark
export const GET = route(async ({ env, url }) => {
  const shelf = url.searchParams.get('shelf');
  return json(shelf ? await fed.friendShelf(env, url.href, shelf) : await fed.overview(env, url.href));
});

export const POST = route(async ({ request, env, url }) => {
  const b = await request.json();
  const at = url.href;
  switch (b.action) {
    case 'add': return json(await fed.addFriend(env, at, b.url, b.note));
    case 'accept': return json(await fed.acceptFriend(env, at, b.id));
    case 'decline': return json(await fed.declineFriend(env, b.id));
    case 'block': return json(await fed.blockFriend(env, b.id));
    case 'remove': return json(await fed.removeFriend(env, at, b.id));
    case 'recommend': return json(await fed.recommend(env, at, b));
    case 'borrow': return json(await fed.askToBorrow(env, at, b));
    case 'reply': return json(await fed.replyToBorrow(env, at, b));
    case 'mark': return json(await fed.markMessage(env, b.id, b.status));
    default: throw new HttpError(400, 'Unknown action');
  }
});
