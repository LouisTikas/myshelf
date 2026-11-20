// Live index used by the admin page and the shelf pencil buttons.
import { getItems, getShelves } from '../lib/items.js';

export async function GET({ locals }) {
  const env = locals.runtime.env;
  const [entries, collections] = await Promise.all([getItems(env), getShelves(env)]);
  const items = entries.map((e) => ({
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
    dateAdded: e.data.dateAdded || null,
    dateStarted: e.data.dateStarted || null,
    dateFinished: e.data.dateFinished || null,
  }));
  return new Response(JSON.stringify({ items, collections }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
