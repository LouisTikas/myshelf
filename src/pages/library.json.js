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
  }));
  return new Response(JSON.stringify({ items, collections: getShelves() }), {
    headers: { 'content-type': 'application/json' },
  });
}
