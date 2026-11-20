// Expansions attached to a board game: kept inside the base game's entry, not as their own items.
import { downloadImage, storeCover, deleteCover, storedCoverName } from './covers.js';

const MAX = 200;
const MAX_DOWNLOADS = 15; // per save, to stay under Cloudflare's per-request fetch limit

/** Tidy the list from the admin: [{ id, title, year, cover, url }], deduped, in the given order. */
export function cleanExpansions(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const x of list) {
    const title = String(x?.title || '').trim().slice(0, 200);
    if (!title) continue;
    const id = /^\d{1,9}$/.test(String(x.id || '')) ? String(x.id) : '';
    const key = id || `t:${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const cover = String(x.cover || '').trim();
    const url = String(x.url || '').trim();
    out.push({
      ...(id ? { id } : {}),
      title,
      ...(x.year ? { year: String(x.year).slice(0, 4) } : {}),
      ...(/^(https?:\/\/|\/img\/|\/covers\/)/i.test(cover) ? { cover } : {}),
      ...(/^https?:\/\//i.test(url) ? { url } : id ? { url: `https://boardgamegeek.com/boardgameexpansion/${id}` } : {}),
    });
    if (out.length >= MAX) break;
  }
  return out;
}

/**
 * Copy remote expansion images into cover storage and remove images of expansions that were detached.
 * Mutates `list`. Returns the stored covers that are no longer used (delete after the save succeeds).
 */
export async function storeExpansionCovers(env, slug, list, previous = []) {
  let downloads = 0;
  for (const x of list) {
    if (!/^https?:\/\//i.test(x.cover || '') || downloads >= MAX_DOWNLOADS || !env?.COVERS) continue;
    downloads++;
    const img = await downloadImage(x.cover);
    if (img) x.cover = await storeCover(env, `${slug}-x${x.id || downloads}`, img); // else keep it hotlinked
  }
  const keep = new Set(list.map((x) => x.cover));
  return (previous || []).map((x) => x.cover).filter((c) => storedCoverName(c) && !keep.has(c));
}

export async function deleteExpansionCovers(env, covers) {
  for (const c of covers || []) await deleteCover(env, c).catch(() => {});
}
