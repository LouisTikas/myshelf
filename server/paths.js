import { HttpError } from './util.js';

export const ITEMS_DIR = 'src/content/items';
export const COVERS_DIR = 'public/covers';
export const COLLECTIONS_FILE = 'src/data/collections.json';

export function assertSlug(slug) {
  if (!/^[a-z0-9][a-z0-9-]{0,120}$/.test(slug || '')) throw new HttpError(400, 'Invalid slug');
  return slug;
}

export const itemPath = (slug) => `${ITEMS_DIR}/${assertSlug(slug)}.md`;

/** "/covers/foo.jpg" → "public/covers/foo.jpg" (only for covers we host). */
export function localCoverRepoPath(cover) {
  const m = String(cover || '').match(/^\/covers\/([a-z0-9][a-z0-9.-]*)$/);
  return m ? `${COVERS_DIR}/${m[1]}` : null;
}
