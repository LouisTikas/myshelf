// The old Git-based shelf, bundled at build time so /api/import can copy it into the database.
// Once everything is imported, src/content/items and public/covers can be deleted.
import collections from '../data/collections.json';
import arrangements from '../data/arrangements.json';

const files = import.meta.glob('../content/items/*.md', { query: '?raw', import: 'default', eager: true });

export const seed = { files, collections, arrangements };
