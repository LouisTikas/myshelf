import { json, route } from '../../../server/util.js';
import { configured } from '../../../server/providers.js';
import { hasDb, countItems } from '../../../server/db.js';
import { hasCovers } from '../../../server/covers.js';
import { pendingImports } from '../../../server/import.js';
import { seed } from '../../lib/seed.js';

// GET /api/ping → confirms the admin token and reports storage + API key status.
export const GET = route(async ({ env }) => {
  const storage = { db: hasDb(env), covers: hasCovers(env) };
  let items = null, toImport = 0;
  if (storage.db) {
    items = await countItems(env);
    toImport = (await pendingImports(env, seed)).length;
  }
  return json({ ok: true, configured: configured(env), storage, items, toImport });
});
