import { json, route } from '../../../server/util.js';
import { listLogs, clearLogs } from '../../../server/logs.js';

// GET    /api/logs → the site's debug log, newest first (Settings → Debug log)
// DELETE /api/logs → empty it
export const GET = route(async ({ env }) => json({ logs: await listLogs(env) }));
export const DELETE = route(async ({ env }) => { await clearLogs(env); return json({ ok: true }); });
