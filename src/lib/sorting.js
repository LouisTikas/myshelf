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
      const pos = new Map((shelf.order || []).map((slug, i) => [slug, i]));
      // Arranged items first in your order; anything not arranged yet goes at the end, oldest added first.
      return list.sort((a, b) => {
        const pa = pos.has(a.id) ? pos.get(a.id) : Infinity;
        const pb = pos.has(b.id) ? pos.get(b.id) : Infinity;
        return pa - pb || added(a.data) - added(b.data);
      });
    }
    default: return list.sort(recent);
  }
}
