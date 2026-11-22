import { route } from '../../../server/util.js';
import { exportBackup } from '../../../server/backup.js';

// GET /api/export → a full JSON backup of your shelf (items, notes, collections, arrangements, site settings).
// Cover images stay in KV; restoring on another site copies them from this site's address.
export const GET = route(async ({ env, url }) => {
  const data = await exportBackup(env, url.origin);
  const date = data.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="myshelf-backup-${date}.json"`,
      'cache-control': 'no-store',
    },
  });
});
