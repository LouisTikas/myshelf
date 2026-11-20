// Shelf sort orders. Used by the public pages and (labels) by the admin.
export const SORTS = {
  newest:   'Newest first',
  oldest:   'Oldest first',
  title:    'Title A–Z',
  creator:  'Creator A–Z',
  rating:   'Rating (highest first)',
  'year-new': 'Release year (newest)',
  'year-old': 'Release year (oldest)',
  custom:   'Custom (drag to arrange)',
};

const when = (d) => {
  const v = d.dateFinished || d.dateStarted || d.dateAdded;
  return v ? new Date(v).getTime() : 0;
};
const added = (d) => (d.dateAdded ? new Date(d.dateAdded).getTime() : 0);
const titleKey = (t) => String(t || '').toLowerCase().replace(/^(the|a|an)\s+/, '');
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const year = (d) => parseInt(d.year, 10) || null;

/** Sort entries ({ id, data }) for a shelf with { sort, order }. Returns a new array. */
export function sortShelf(entries, shelf = {}) {
  const list = [...entries];
  const by = shelf.sort || 'newest';
  const recent = (a, b) => when(b.data) - when(a.data);
  switch (by) {
    case 'oldest': return list.sort((a, b) => when(a.data) - when(b.data));
    case 'title': return list.sort((a, b) => cmp(titleKey(a.data.title), titleKey(b.data.title)));
    case 'creator': return list.sort((a, b) => cmp(String(a.data.creator || '~').toLowerCase(), String(b.data.creator || '~').toLowerCase()) || cmp(titleKey(a.data.title), titleKey(b.data.title)));
    case 'rating': return list.sort((a, b) => (b.data.rating ?? -1) - (a.data.rating ?? -1) || recent(a, b));
    case 'year-new': return list.sort((a, b) => (year(b.data) ?? -Infinity) - (year(a.data) ?? -Infinity) || recent(a, b));
    case 'year-old': return list.sort((a, b) => (year(a.data) ?? Infinity) - (year(b.data) ?? Infinity) || recent(a, b));
    case 'custom': {
      const ordered = arrangeOrder(list.map((e) => ({ slug: e.id, dateAdded: e.data.dateAdded, e })), shelf.order);
      return ordered.map((x) => x.e);
    }
    default: return list.sort(recent);
  }
}

/**
 * Custom order: items you haven't arranged yet (i.e. newly added) come FIRST, newest added first;
 * then everything you arranged, in your order. Works on plain objects with { slug, dateAdded }.
 */
export function arrangeOrder(items, order = []) {
  const pos = new Map((order || []).map((slug, i) => [slug, i]));
  const t = (i) => (i.dateAdded ? new Date(i.dateAdded).getTime() : 0);
  return [...items].sort((a, b) => {
    const ia = pos.has(a.slug), ib = pos.has(b.slug);
    if (ia && ib) return pos.get(a.slug) - pos.get(b.slug);
    if (!ia && !ib) return t(b) - t(a);
    return ia ? 1 : -1;
  });
}

/** Automatic collections: items with this status are included without being added by hand. */
export const AUTO_RULES = { 'in-progress': 'In progress', finished: 'Finished', want: 'Want to' };

/** Is a plain item ({ collections, status }) on this shelf? Works for manual and automatic collections. */
export function inShelf(item, shelf) {
  return (item.collections || []).includes(shelf.slug) || (!!shelf.auto && item.status === shelf.auto);
}
