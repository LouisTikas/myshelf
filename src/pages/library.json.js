// Build-time index used by the admin page (search/edit list).
import { getItems, getShelves } from '../lib/items.js';

export async function GET() {
  const items = (await getItems()).map((e) => ({
    slug: e.id,
    title: e.data.title,
    type: e.data.type,
    creator: e.data.creator,
    year: e.data.year,
    cover: e.data.cover,
    status: e.data.status,
    rating: e.data.rating ?? null,
    collections: e.data.collections,
    source: e.data.source || {},
    dateAdded: e.data.dateAdded ? new Date(e.data.dateAdded).toISOString().slice(0, 10) : null,
    dateStarted: e.data.dateStarted ? new Date(e.data.dateStarted).toISOString().slice(0, 10) : null,
    dateFinished: e.data.dateFinished ? new Date(e.data.dateFinished).toISOString().slice(0, 10) : null,
  }));
    // Cloudflare Pages sets this during builds; the admin uses it to know when a save is live.
  const commit = process.env.CF_PAGES_COMMIT_SHA || '';
  return new Response(JSON.stringify({ commit, items, collections: getShelves() }), {
    headers: { 'content-type': 'application/json' },
  });
}
