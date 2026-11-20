// Cloudflare D1 storage for items and settings (collections, shelf arrangements).
// Tables are created automatically the first time they're needed, so there's no SQL to run by hand.
import { HttpError } from './util.js';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS items (
    slug TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    data TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS items_type ON items (type)`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
];

const ready = new WeakMap();

export function hasDb(env) {
  return Boolean(env?.DB);
}

function db(env) {
  if (!env?.DB) {
    throw new HttpError(500, 'The D1 database is not connected. In Cloudflare Pages → Settings → Bindings, add a D1 database binding named DB, then redeploy.');
  }
  return env.DB;
}

/** Create the tables once per worker instance. */
export async function ensureSchema(env) {
  const DB = db(env);
  if (!ready.has(DB)) {
    const p = DB.batch(SCHEMA.map((sql) => DB.prepare(sql))).catch((err) => {
      ready.delete(DB);
      throw err;
    });
    ready.set(DB, p);
  }
  await ready.get(DB);
  return DB;
}

const now = () => new Date().toISOString();
const rowToItem = (r) => ({ slug: r.slug, item: JSON.parse(r.data), body: r.body || '' });

/** Every item: [{ slug, item, body }]. */
export async function listItems(env, { type } = {}) {
  const DB = await ensureSchema(env);
  const stmt = type
    ? DB.prepare('SELECT slug, data, body FROM items WHERE type = ?').bind(type)
    : DB.prepare('SELECT slug, data, body FROM items');
  const { results } = await stmt.all();
  return (results || []).map(rowToItem);
}

export async function getItem(env, slug) {
  const DB = await ensureSchema(env);
  const r = await DB.prepare('SELECT slug, data, body FROM items WHERE slug = ?').bind(slug).first();
  return r ? rowToItem(r) : null;
}

export async function itemExists(env, slug) {
  const DB = await ensureSchema(env);
  return Boolean(await DB.prepare('SELECT 1 AS x FROM items WHERE slug = ?').bind(slug).first());
}

export async function countItems(env) {
  const DB = await ensureSchema(env);
  const r = await DB.prepare('SELECT COUNT(*) AS n FROM items').first();
  return Number(r?.n || 0);
}

function upsertStmt(DB, slug, item, body) {
  const t = now();
  return DB.prepare(
    `INSERT INTO items (slug, type, title, data, body, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
     ON CONFLICT (slug) DO UPDATE SET type = ?2, title = ?3, data = ?4, body = ?5, updated_at = ?6`,
  ).bind(slug, item.type, item.title, JSON.stringify(item), String(body || '').trim(), t);
}

/** Insert or update one item. */
export async function putItem(env, slug, item, body = '') {
  const DB = await ensureSchema(env);
  await upsertStmt(DB, slug, item, body).run();
}

/** Insert or update several items in one transaction: [{ slug, item, body }]. */
export async function putItems(env, rows) {
  if (!rows.length) return;
  const DB = await ensureSchema(env);
  await DB.batch(rows.map((r) => upsertStmt(DB, r.slug, r.item, r.body)));
}

export async function removeItem(env, slug) {
  const DB = await ensureSchema(env);
  await DB.prepare('DELETE FROM items WHERE slug = ?').bind(slug).run();
}

export async function getSetting(env, key, fallback = null) {
  const DB = await ensureSchema(env);
  const r = await DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  if (!r) return fallback;
  try { return JSON.parse(r.value); } catch { return fallback; }
}

export async function hasSetting(env, key) {
  const DB = await ensureSchema(env);
  return Boolean(await DB.prepare('SELECT 1 AS x FROM settings WHERE key = ?').bind(key).first());
}

export async function setSetting(env, key, value) {
  const DB = await ensureSchema(env);
  await DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT (key) DO UPDATE SET value = ?2, updated_at = ?3`,
  ).bind(key, JSON.stringify(value), now()).run();
}
