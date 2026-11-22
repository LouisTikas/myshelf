// Read the shelf live from the D1 database (pages render on each request, so saves show up immediately).
import { marked } from 'marked';
import { listItems, getItem as getRow } from '../../server/db.js';
import { getCollections, getArrangements as loadArrangements } from '../../server/settings.js';

const DEFAULTS = {
  creator: '', year: '', cover: '', status: 'finished', rating: null,
  collections: [], tags: [], description: '', genres: [], details: {}, source: {},
};

/** Same shape the pages used with Astro content collections: { id, data, body }. */
export function toEntry({ slug, item, body }) {
  const data = { ...DEFAULTS, ...Object.fromEntries(Object.entries(item || {}).filter(([, v]) => v != null)) };
  data.year = data.year == null ? '' : String(data.year);
  if (data.rating === '' || data.rating == null) data.rating = null;
  return { id: slug, data, body: body || '' };
}

export const sortDate = (e) => {
  const d = e.data.dateFinished || e.data.dateStarted || e.data.dateAdded;
  return d ? new Date(d).getTime() : 0;
};

export const byRecent = (a, b) => sortDate(b) - sortDate(a);

/** Items for the public pages. Friends-only and private items stay out unless { all: true }. */
export async function getItems(env, { all = false } = {}) {
  return (await listItems(env, all ? {} : { visibility: ['public'] })).map(toEntry).sort(byRecent);
}

/** One item for its public page, or null if it doesn't exist or isn't public. */
export async function getEntry(env, slug) {
  const row = await getRow(env, slug);
  if (!row || (row.item.visibility && row.item.visibility !== 'public')) return null;
  return toEntry(row);
}

export function getShelves(env) {
  return getCollections(env);
}

export function getArrangements(env) {
  return loadArrangements(env);
}

export const renderBody = (body) => (body && body.trim() ? marked.parse(body) : '');

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
