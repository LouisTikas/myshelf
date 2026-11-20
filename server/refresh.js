// Refresh board games with the latest BGG data (player counts, play time, complexity, mechanics...).
// Games added by hand get linked to BGG by title + year. All changes land in ONE commit.
import { HttpError } from './util.js';
import { readFile, listDir, commitFiles } from './github.js';
import { parseMarkdown, buildMarkdown, normalizeItem } from './markdown.js';
import { ITEMS_DIR, itemPath } from './paths.js';
import { bggThings, bggFind, bggDetails } from './providers.js';

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)));
const bggIdOf = (src = {}) => (/boardgamegeek|bgg/i.test(`${src.name} ${src.url}`) && src.id ? String(src.id) : null);

export async function refreshBoardgames(env, onlySlugs, opts = {}) {
  if (!env.BGG_TOKEN) throw new HttpError(400, 'BGG_TOKEN is not set.');
  const names = (await listDir(env, ITEMS_DIR)).filter((n) => n.endsWith('.md'));
  const games = [];
  for (const name of names) {
    const slug = name.replace(/\.md$/, '');
    if (onlySlugs && !onlySlugs.includes(slug)) continue;
    if (!onlySlugs && !slug.startsWith('boardgame-')) continue;
    const text = await readFile(env, itemPath(slug));
    if (!text) continue;
    const { data, body } = parseMarkdown(text);
    if (data.type !== 'boardgame') continue;
    games.push({ slug, data, body });
  }

  const report = [];
  for (const g of games) {
    g.id = bggIdOf(g.data.source);
    if (!g.id) {
      const hit = await bggFind(env, g.data.title, g.data.year);
      if (hit) { g.id = hit.id; g.linkedNow = `${hit.name}${hit.year ? ` (${hit.year})` : ''}`; }
    }
  }
  const ids = [...new Set(games.map((g) => g.id).filter(Boolean))];
  const things = Object.fromEntries((await bggThings(env, ids)).map((t) => [t.id, t]));

  const changes = [];
  for (const g of games) {
    const t = g.id && things[g.id];
    if (!t) { report.push({ slug: g.slug, title: g.data.title, status: 'not found on BGG' }); continue; }
    const item = { ...g.data };
    item.details = clean({ ...(item.details || {}), ...clean(bggDetails(t)) });
    if (t.categories?.length) item.genres = t.categories;
    if (!item.creator) item.creator = (t.designers || []).filter((d) => d !== '(Uncredited)').slice(0, 3).join(', ');
    if (!item.year && t.year) item.year = t.year;
    item.source = { name: 'BoardGameGeek', id: String(g.id), url: `https://boardgamegeek.com/boardgame/${g.id}` };
    changes.push({ path: itemPath(g.slug), text: buildMarkdown(normalizeItem(item), g.body) });
    report.push({ slug: g.slug, title: g.data.title, status: g.linkedNow ? `linked to “${g.linkedNow}” and updated` : 'updated', bggUrl: item.source.url });
  }
  const sha = changes.length ? await commitFiles(env, `Refresh ${changes.length} board game${changes.length === 1 ? '' : 's'} from BGG`, changes, opts) : null;
  return { sha, report };
}
