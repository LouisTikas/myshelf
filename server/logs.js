// The debug log in Manage → Settings → Debug log: the site's recent errors (failed saves, lookups, friends'
// messages, pages that wouldn't build) and what the daily auto-update did. Kept in D1, newest 300 entries only.
// Nothing here ever throws: logging a problem must never cause one. Secrets are scrubbed before saving.
import { ensureSchema, hasDb } from './db.js';

const KEEP = 300;
const LEVELS = ['error', 'warn', 'info'];
const SECRET_NAME = /(TOKEN|SECRET|KEY|PASSWORD|CLIENT_ID)$/i;

/** Hide anything that looks like a credential: the site's own secrets, bearer tokens, key=… in URLs. */
export function scrub(text, env = {}) {
  let out = String(text ?? '');
  for (const [name, value] of Object.entries(env || {})) {
    if (SECRET_NAME.test(name) && typeof value === 'string' && value.length >= 8) out = out.split(value).join('[hidden]');
  }
  return out
    .replace(/(Bearer\s+)[\w.~+/=-]{8,}/gi, '$1[hidden]')
    .replace(/([?&](?:key|api_key|apikey|token|access_token|client_secret)=)[^&\s"']+/gi, '$1[hidden]');
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Add an entry: { level, source, message, detail } or an Error as message. Resolves even if it fails. */
export async function logEvent(env, { level = 'error', source = '', message = '', detail = '' } = {}) {
  try {
    if (!hasDb(env)) return;
    if (message instanceof Error) {
      detail = detail || message.stack || '';
      message = message.message || String(message);
    }
    const DB = await ensureSchema(env);
    await DB.batch([
      DB.prepare('INSERT INTO logs (at, level, source, message, detail) VALUES (?1, ?2, ?3, ?4, ?5)').bind(
        new Date().toISOString(),
        LEVELS.includes(level) ? level : 'error',
        clip(scrub(source, env), 200),
        clip(scrub(message, env), 1000) || '(no message)',
        clip(scrub(detail, env), 4000),
      ),
      DB.prepare('DELETE FROM logs WHERE id <= (SELECT MAX(id) FROM logs) - ?1').bind(KEEP),
    ]);
  } catch (err) {
    console.error('Could not write to the debug log:', err);
  }
}

/** Newest first. */
export async function listLogs(env, limit = KEEP) {
  if (!hasDb(env)) return [];
  const DB = await ensureSchema(env);
  const { results } = await DB.prepare('SELECT id, at, level, source, message, detail FROM logs ORDER BY id DESC LIMIT ?1')
    .bind(Math.max(1, Math.min(KEEP, Number(limit) || KEEP))).all();
  return results || [];
}

export async function clearLogs(env) {
  if (!hasDb(env)) return;
  const DB = await ensureSchema(env);
  await DB.prepare('DELETE FROM logs').run();
}
