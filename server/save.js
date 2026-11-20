import { HttpError, slugify, TYPE_KEYS } from './util.js';
import { readFile, fileExists, commitFiles } from './github.js';
import { buildMarkdown, normalizeItem, parseMarkdown } from './markdown.js';
import { itemPath, assertSlug, localCoverRepoPath, COVERS_DIR } from './paths.js';

const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
const MAX_COVER_BYTES = 5 * 1024 * 1024;

async function downloadCover(url) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'MyShelf' }, redirect: 'follow' });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!EXT[type]) return null;
    const buf = await res.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > MAX_COVER_BYTES) return null;
    return { buf, ext: EXT[type] };
  } catch {
    return null;
  }
}

async function uniqueSlug(env, base) {
  let slug = base;
  for (let n = 2; n < 50; n++) {
    if (!(await fileExists(env, itemPath(slug)))) return slug;
    slug = `${base}-${n}`;
  }
  throw new HttpError(409, 'Could not find a free slug');
}

/**
 * Create or update an item.
 * payload: { slug?: string (existing item), item: {...frontmatter}, body: string }
 * If item.cover is a remote URL, the image is downloaded and stored in the repo.
 */
export async function saveItem(env, payload, opts = {}) {
  const raw = payload?.item;
  if (!raw || !raw.title || !TYPE_KEYS.includes(raw.type)) throw new HttpError(400, 'Item needs a title and a valid type');
  const item = normalizeItem(raw);
  const isEdit = Boolean(payload.slug);

  let previous = null;
  let slug;
  if (isEdit) {
    slug = assertSlug(payload.slug);
    const text = await readFile(env, itemPath(slug));
    if (text == null) throw new HttpError(404, 'Item to update was not found');
    previous = parseMarkdown(text).data;
  } else {
    slug = await uniqueSlug(env, slugify(`${item.type} ${item.title} ${item.year || ''}`));
    item.dateAdded = item.dateAdded || new Date().toISOString().slice(0, 10);
  }

  const changes = [];
  const oldLocal = localCoverRepoPath(previous?.cover);

  if (/^https?:\/\//i.test(item.cover || '')) {
    const img = await downloadCover(item.cover);
    if (img) {
      const path = `${COVERS_DIR}/${slug}.${img.ext}`;
      changes.push({ path, binary: img.buf });
      if (oldLocal && oldLocal !== path) changes.push({ path: oldLocal, delete: true });
      item.cover = `/covers/${slug}.${img.ext}`;
    }
    // If the download failed we keep the remote URL (hotlinked) rather than losing the cover.
  } else if (!item.cover && oldLocal) {
    changes.push({ path: oldLocal, delete: true });
  }

  changes.push({ path: itemPath(slug), text: buildMarkdown(item, payload.body) });
  const verb = isEdit ? 'Update' : 'Add';
  const sha = await commitFiles(env, `${verb} ${item.type}: ${item.title}`, changes, opts);
  return { slug, sha, item };
}

export async function deleteItem(env, slug, opts = {}) {
  assertSlug(slug);
  const text = await readFile(env, itemPath(slug));
  if (text == null) throw new HttpError(404, 'Item not found');
  const { data } = parseMarkdown(text);
  const changes = [{ path: itemPath(slug), delete: true }];
  const cover = localCoverRepoPath(data.cover);
  if (cover) changes.push({ path: cover, delete: true });
  const sha = await commitFiles(env, `Remove ${data.type || 'item'}: ${data.title || slug}`, changes, opts);
  return { slug, sha };
}
