import { route } from '../../../server/util.js';
import { listItems } from '../../../server/db.js';
import { getCollections, getArrangements } from '../../../server/settings.js';

// GET /api/export → a full JSON backup of your shelf (items, notes, collections, arrangements).
// Cover images stay in KV; entries keep their cover paths.
export const GET = route(async ({ env }) => {
  const [items, collections, arrangements] = await Promise.all([listItems(env), getCollections(env), getArrangements(env)]);
  const date = new Date().toISOString().slice(0, 10);
  const data = { exportedAt: new Date().toISOString(), items: items.sort((a, b) => a.slug.localeCompare(b.slug)), collections, arrangements };
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="myshelf-backup-${date}.json"`,
      'cache-control': 'no-store',
    },
  });
});
