// A basic health check anyone can see, for the "Having trouble?" link on Manage's sign-in screen: is the
// database connected and up to date, is cover storage connected, is an admin password set, which version is this.
// Yes/no answers only: no error details, settings or keys (those are in the debug log, behind sign-in).
import { ensureSchema, hasDb, SCHEMA_VERSION } from './db.js';
import { hasCovers } from './covers.js';
import { versionInfo } from './version.js';

export async function health(env) {
  const checks = [];
  let db = hasDb(env);
  let dbNote = db ? '' : 'No database is connected. Check the d1_databases entry in wrangler.jsonc, then redeploy.';
  if (db) {
    try {
      const DB = await ensureSchema(env);
      await DB.prepare('SELECT 1 AS x').first();
    } catch {
      db = false;
      dbNote = 'The database is connected but couldn’t be read or updated.';
    }
  }
  checks.push({ name: 'Database', ok: db, note: db ? `Up to date (schema ${SCHEMA_VERSION}).` : dbNote });
  const covers = hasCovers(env);
  checks.push({ name: 'Cover storage', ok: covers, note: covers ? 'Connected.' : 'No KV namespace named COVERS is connected, so covers can’t be saved.' });
  const token = Boolean(env.ADMIN_TOKEN);
  checks.push({ name: 'Admin password', ok: token, note: token ? 'Set.' : 'ADMIN_TOKEN isn’t set, so nobody can sign in. Add it under Worker → Settings → Variables and Secrets.' });
  return { ok: checks.every((c) => c.ok), checks, ...versionInfo(), at: new Date().toISOString() };
}
