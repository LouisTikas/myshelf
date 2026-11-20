import YAML from 'yaml';

const FIELD_ORDER = [
  'title', 'type', 'creator', 'year', 'cover', 'status', 'rating',
  'dateAdded', 'dateStarted', 'dateFinished', 'collections', 'tags',
  'description', 'genres', 'details', 'source',
];

const DATE_FIELDS = ['dateAdded', 'dateStarted', 'dateFinished'];

function cleanDate(v) {
  if (!v) return null;
  const m = String(v).match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

function isEmpty(v) {
  return v == null || v === '' || (Array.isArray(v) && v.length === 0) ||
    (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
}

// Normalize an item object coming from the admin UI into tidy frontmatter.
export function normalizeItem(input) {
  const item = { ...input };
  for (const f of DATE_FIELDS) item[f] = cleanDate(item[f]);
  if (item.year != null) item.year = String(item.year);
  if (item.rating === '' || item.rating == null) item.rating = null;
  else item.rating = Math.max(0, Math.min(5, Number(item.rating)));
  for (const f of ['collections', 'tags', 'genres']) {
    if (typeof item[f] === 'string') item[f] = item[f].split(',');
    item[f] = (item[f] || []).map((s) => String(s).trim()).filter(Boolean);
  }
  if (item.details && typeof item.details === 'object') {
    for (const [k, v] of Object.entries(item.details)) if (isEmpty(v)) delete item.details[k];
  }
  return item;
}

export function buildMarkdown(item, body = '') {
  const ordered = {};
  const keys = [...FIELD_ORDER, ...Object.keys(item).filter((k) => !FIELD_ORDER.includes(k))];
  for (const k of keys) {
    const v = item[k];
    if (k === 'title' || k === 'type' || k === 'status') { ordered[k] = v ?? ''; continue; }
    if (isEmpty(v)) continue;
    ordered[k] = v;
  }
  const fm = YAML.stringify(ordered, { lineWidth: 0 }).trimEnd();
  return `---\n${fm}\n---\n\n${String(body || '').trim()}\n`;
}

export function parseMarkdown(text) {
  const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: String(text) };
  return { data: YAML.parse(m[1]) || {}, body: m[2].trim() };
}
