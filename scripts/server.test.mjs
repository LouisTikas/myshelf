// Offline tests for the API layer (run: npm test). External services are mocked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMarkdown, parseMarkdown, normalizeItem } from '../server/markdown.js';
import { parseBggSearch, parseBggThings, search, details, igdbScore } from '../server/providers.js';
import { saveItem, deleteItem } from '../server/save.js';
import { onRequest as authMiddleware } from '../functions/api/_middleware.js';
import { onRequestGet as searchHandler } from '../functions/api/search.js';

// ── tiny fetch mock ──
function mockFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    calls.push({ url, init });
    for (const [match, fn] of routes) {
      if (typeof match === 'string' ? url.includes(match) : match.test(url)) {
        const r = await fn(url, init);
        if (r instanceof Response) return r;
        return new Response(typeof r === 'string' ? r : JSON.stringify(r), { status: 200, headers: { 'content-type': typeof r === 'string' ? 'text/xml' : 'application/json' } });
      }
    }
    return new Response('not mocked: ' + url, { status: 599 });
  };
  return calls;
}

test('markdown round-trip keeps fields and quotes numeric strings', () => {
  const item = normalizeItem({
    title: 'Dune: Part Two', type: 'movie', creator: 'Denis Villeneuve', year: 2024, rating: '4.5',
    status: 'finished', dateFinished: '2026-11-19T10:00:00Z', collections: ['2026', 'favorites'],
    tags: 'sci-fi, epic', genres: [], details: { runtime: 166, cast: ['Timothée Chalamet'], empty: '' },
    source: { name: 'TMDB', id: '693134', url: 'https://www.themoviedb.org/movie/693134' },
  });
  const md = buildMarkdown(item, 'Loved it.\n\nSecond paragraph.');
  assert.match(md, /^---\ntitle: "Dune: Part Two"|^---\ntitle: 'Dune: Part Two'/);
  assert.match(md, /year: "2024"/);
  assert.match(md, /- "2026"/);
  assert.match(md, /dateFinished: 2026-11-19/);
  assert.doesNotMatch(md, /genres/);
  assert.doesNotMatch(md, /empty/);
  const { data, body } = parseMarkdown(md);
  assert.equal(data.title, 'Dune: Part Two');
  assert.equal(data.rating, 4.5);
  assert.deepEqual(data.tags, ['sci-fi', 'epic']);
  assert.equal(body, 'Loved it.\n\nSecond paragraph.');
});

const BGG_SEARCH = `<?xml version="1.0" encoding="utf-8"?><items total="3" termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
<item type="boardgame" id="266192"><name type="primary" value="Wingspan"/><yearpublished value="2019" /></item>
<item type="boardgame" id="999"><name type="primary" value="Wingspan Asia"/><yearpublished value="2022" /></item>
<item type="boardgame" id="266192"><name type="alternate" value="Flügelschlag"/><yearpublished value="2019" /></item>
</items>`;
const BGG_THING = `<?xml version="1.0" encoding="utf-8"?><items termsofuse="x">
<item type="boardgame" id="266192">
  <thumbnail>https://cf.geekdo-images.com/t.jpg</thumbnail>
  <image>https://cf.geekdo-images.com/big.jpg</image>
  <name type="primary" sortindex="1" value="Wingspan" />
  <name type="alternate" sortindex="1" value="Flügelschlag" />
  <description>Attract birds &amp;amp; build engines.&amp;#10;&amp;#10;Second line &amp;mdash; ok.</description>
  <yearpublished value="2019" /><minplayers value="1" /><maxplayers value="5" /><playingtime value="70" />
  <link type="boardgamecategory" id="1089" value="Animals" />
  <link type="boardgamedesigner" id="1" value="Elizabeth Hargrave" />
  <link type="boardgamepublisher" id="2" value="Stonemaier Games" />
  <statistics page="1"><ratings><ranks><rank type="subtype" id="1" name="boardgame" friendlyname="Board Game Rank" value="31" bayesaverage="7.9" /></ranks><averageweight value="2.4431" /></ratings></statistics>
</item></items>`;

test('BGG XML parsing', () => {
  const hits = parseBggSearch(BGG_SEARCH);
  assert.equal(hits.length, 3);
  assert.deepEqual(hits[0], { id: '266192', name: 'Wingspan', year: '2019' });
  const [t] = parseBggThings(BGG_THING);
  assert.equal(t.title, 'Wingspan');
  assert.equal(t.image, 'https://cf.geekdo-images.com/big.jpg');
  assert.equal(t.players, '1–5');
  assert.equal(t.rank, '31');
  assert.equal(t.weight, '2.44 / 5');
  assert.deepEqual(t.designers, ['Elizabeth Hargrave']);
  assert.equal(t.description, 'Attract birds & build engines.\n\nSecond line — ok.');
});

test('BGG search: sends token, dedupes, enriches', async () => {
  const calls = mockFetch([['xmlapi2/search', () => BGG_SEARCH], ['xmlapi2/thing', () => BGG_THING]]);
  const res = await search('boardgame', 'wingspan', { BGG_TOKEN: 'tok' });
  assert.equal(res.length, 2);
  assert.equal(res[0].title, 'Wingspan');
  assert.equal(res[0].creator, 'Elizabeth Hargrave');
  assert.equal(res[0].cover, 'https://cf.geekdo-images.com/big.jpg');
  assert.equal(calls[0].init.headers.authorization, 'Bearer tok');
  assert.match(calls[1].url, /id=266192,999/);
});

test('TMDB search + details (bearer token)', async () => {
  const calls = mockFetch([
    ['/search/movie', () => ({ results: [{ id: 1, title: 'The Princess Bride', release_date: '1987-09-25', poster_path: '/p.jpg', overview: 'Fairy tale.' }] })],
    ['/movie/1', () => ({ runtime: 98, overview: 'Fairy tale.', genres: [{ name: 'Adventure' }], credits: { cast: [{ name: 'Cary Elwes' }], crew: [{ job: 'Director', name: 'Rob Reiner' }] } })],
  ]);
  const env = { TMDB_TOKEN: 'eyJ' + 'x'.repeat(60) };
  const [r] = await search('movie', 'princess bride', env);
  assert.equal(r.year, '1987');
  assert.equal(r.cover, 'https://image.tmdb.org/t/p/w780/p.jpg');
  assert.match(calls[0].init.headers.authorization, /^Bearer /);
  const d = await details('movie', 'tmdb', '1', env);
  assert.equal(d.creator, 'Rob Reiner');
  assert.equal(d.details.runtime, 98);
});

test('Spotify search uses client credentials and limit=10; falls back to MusicBrainz on failure', async () => {
  let calls = mockFetch([
    ['accounts.spotify.com', () => ({ access_token: 'abc', expires_in: 3600 })],
    ['api.spotify.com/v1/search', () => ({
      albums: { items: [{ id: 'a1', name: 'Abbey Road', album_type: 'album', total_tracks: 17, release_date: '1969-09-26', artists: [{ name: 'The Beatles' }], images: [{ url: 'https://i.scdn.co/a.jpg' }], external_urls: { spotify: 'https://open.spotify.com/album/a1' } }] },
      tracks: { items: [{ id: 't1', name: 'Something', artists: [{ name: 'The Beatles' }], album: { name: 'Abbey Road', release_date: '1969', images: [{ url: 'https://i.scdn.co/a.jpg' }] }, external_urls: {} }] },
    })],
  ]);
  const env = { SPOTIFY_CLIENT_ID: 'id', SPOTIFY_CLIENT_SECRET: 'secret' };
  const res = await search('music', 'abbey road', env);
  assert.equal(res.length, 2);
  assert.equal(res[0].details.kind, 'Album');
  assert.equal(res[1].details.kind, 'Song');
  assert.match(calls.find((c) => c.url.includes('/v1/search')).url, /limit=10/);

  calls = mockFetch([
    ['api.spotify.com', () => new Response('nope', { status: 403 })],
    ['musicbrainz.org', () => ({ 'release-groups': [{ id: 'rg1', title: 'Abbey Road', 'first-release-date': '1969-09-26', 'primary-type': 'Album', 'artist-credit': [{ name: 'The Beatles' }] }] })],
  ]);
  const fb = await search('music', 'abbey road', env);
  assert.equal(fb[0].source, 'musicbrainz');
  assert.equal(fb[0].cover, 'https://coverartarchive.org/release-group/rg1/front-500');
});

test('IGDB search via Twitch token', async () => {
  const calls = mockFetch([
    ['id.twitch.tv', () => ({ access_token: 'tw', expires_in: 5000000 })],
    ['api.igdb.com', () => [{ id: 1026, name: 'The Legend of Zelda: A Link to the Past', first_release_date: 690681600, cover: { image_id: 'co3vzn' }, summary: 'Hero.', genres: [{ name: 'Adventure' }], platforms: [{ abbreviation: 'SNES' }], involved_companies: [{ developer: true, company: { name: 'Nintendo EAD' } }, { publisher: true, company: { name: 'Nintendo' } }], url: 'https://www.igdb.com/games/x' }]],
  ]);
  const [g] = await search('videogame', 'link to the past', { TWITCH_CLIENT_ID: 'c', TWITCH_CLIENT_SECRET: 's' });
  assert.equal(g.year, '1991');
  assert.equal(g.creator, 'Nintendo EAD');
  assert.equal(g.cover, 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co3vzn.jpg');
  const igdbCall = calls.find((c) => c.url.includes('api.igdb.com'));
  assert.equal(igdbCall.init.headers['client-id'], 'c');
  assert.match(igdbCall.init.body, /search "link to the past"/);
});

test('Books merge Open Library + Google Books even if one fails', async () => {
  mockFetch([
    ['openlibrary.org/search.json', () => ({ docs: [{ key: '/works/OL893415W', title: 'Dune', author_name: ['Frank Herbert'], first_publish_year: 1965, cover_i: 123, isbn: ['0441013597', '9780441013593'] }] })],
    ['googleapis.com/books', () => new Response('quota', { status: 429 })],
  ]);
  const res = await search('book', 'dune', {});
  assert.equal(res.length, 1);
  assert.equal(res[0].sourceId, 'OL893415W');
  assert.equal(res[0].details.isbn, '9780441013593');
  assert.equal(res[0].cover, 'https://covers.openlibrary.org/b/id/123-L.jpg');
});

// ── GitHub commit flow ──
function githubMock({ existing = {} } = {}) {
  const state = { blobs: [], tree: null, commitMsg: null, refPatched: false };
  const calls = mockFetch([
    [/\/contents\/(.+)\?ref=/, (url) => {
      const path = decodeURI(url.match(/\/contents\/(.+)\?ref=/)[1]);
      return path in existing ? new Response(existing[path], { status: 200 }) : new Response('{}', { status: 404 });
    }],
    ['/git/ref/heads/main', () => ({ object: { sha: 'parent' } })],
    ['/git/commits/parent', () => ({ tree: { sha: 'basetree' } })],
    ['/git/blobs', (_, init) => { const b = JSON.parse(init.body); state.blobs.push(b); return { sha: 'blob' + state.blobs.length }; }],
    ['/git/trees', (_, init) => { state.tree = JSON.parse(init.body); return { sha: 'newtree' }; }],
    [/\/git\/commits$/, (_, init) => { state.commitMsg = JSON.parse(init.body).message; return { sha: 'newcommit' }; }],
    ['/git/refs/heads/main', (_, init) => { state.refPatched = JSON.parse(init.body).sha === 'newcommit'; return {}; }],
    ['example.com/cover.jpg', () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })],
  ]);
  return { state, calls };
}
const GH_ENV = { GITHUB_TOKEN: 'ghp', GITHUB_REPO: 'lex/shelf' };

test('saveItem: new item downloads cover and commits md + image in one commit', async () => {
  const { state } = githubMock({ existing: { 'src/content/items/book-dune-1965.md': '---\ntitle: x\n---\n' } });
  const res = await saveItem(GH_ENV, {
    item: { title: 'Dune', type: 'book', year: '1965', status: 'finished', cover: 'https://example.com/cover.jpg', collections: ['favorites'] },
    body: 'Great.',
  });
  assert.equal(res.slug, 'book-dune-1965-2'); // first slug was taken
  assert.equal(res.item.cover, '/covers/book-dune-1965-2.jpg');
  assert.equal(state.tree.base_tree, 'basetree');
  const paths = state.tree.tree.map((t) => t.path).sort();
  assert.deepEqual(paths, ['public/covers/book-dune-1965-2.jpg', 'src/content/items/book-dune-1965-2.md']);
  assert.equal(state.blobs[0].encoding, 'base64');
  assert.equal(state.blobs[0].content, Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]).toString('base64'));
  assert.match(state.blobs[1].content, /cover: \/covers\/book-dune-1965-2\.jpg/);
  assert.match(state.blobs[1].content, /dateAdded: \d{4}-\d{2}-\d{2}/);
  assert.equal(state.commitMsg, 'Add book: Dune');
  assert.ok(state.refPatched);
});

test('saveItem: editing keeps slug; deleteItem removes md + local cover', async () => {
  const md = '---\ntitle: Dune\ntype: book\ncover: /covers/book-dune-1965.jpg\nstatus: finished\n---\n\nOld.';
  let { state } = githubMock({ existing: { 'src/content/items/book-dune-1965.md': md } });
  await saveItem(GH_ENV, { slug: 'book-dune-1965', item: { title: 'Dune', type: 'book', status: 'finished', cover: '/covers/book-dune-1965.jpg', rating: 5 }, body: 'New.' });
  assert.deepEqual(state.tree.tree.map((t) => t.path), ['src/content/items/book-dune-1965.md']);
  assert.equal(state.commitMsg, 'Update book: Dune');

  ({ state } = githubMock({ existing: { 'src/content/items/book-dune-1965.md': md } }));
  await deleteItem(GH_ENV, 'book-dune-1965');
  assert.deepEqual(state.tree.tree, [
    { path: 'src/content/items/book-dune-1965.md', mode: '100644', type: 'blob', sha: null },
    { path: 'public/covers/book-dune-1965.jpg', mode: '100644', type: 'blob', sha: null },
  ]);
  await assert.rejects(() => deleteItem(GH_ENV, '../etc/passwd'), /Invalid slug/);
});

test('auth middleware + search handler', async () => {
  const env = { ADMIN_TOKEN: 's3cret' };
  const next = () => new Response('ok');
  const req = (h) => new Request('https://x/api/ping', { headers: h });
  assert.equal((await authMiddleware({ request: req({}), env, next })).status, 401);
  assert.equal((await authMiddleware({ request: req({ authorization: 'Bearer nope' }), env, next })).status, 401);
  assert.equal((await authMiddleware({ request: req({ authorization: 'Bearer s3cret' }), env, next })).status, 200);
  const bad = await searchHandler({ request: new Request('https://x/api/search?type=nope&q=hi'), env });
  assert.equal(bad.status, 400);
  const noKey = await searchHandler({ request: new Request('https://x/api/search?type=movie&q=hello'), env: {} });
  assert.equal(noKey.status, 400);
  assert.match((await noKey.json()).error, /TMDB_TOKEN/);
});

test('IGDB re-ranking puts real releases above mods and caps at 26', async () => {
  const cover = { image_id: 'x' };
  const pool = [
    { id: 1, name: "Ocarina of Time: Spaceworld '97 Experience", game_type: 5, cover },
    { id: 2, name: 'Ocarina of Time: Chaos Edition', game_type: 5, cover },
    { id: 3, name: 'Unreal Engine The Legend of Zelda: Ocarina of Time' },
    { id: 4, name: 'Ocarina of Time Redux', cover },
    { id: 5, name: 'The Legend of Zelda: Ocarina of Time 3D', game_type: 8, cover, total_rating_count: 400 },
    { id: 6, name: 'The Legend of Zelda: Ocarina of Time', game_type: 0, cover, total_rating_count: 900 },
    { id: 7, name: 'The Legend of Zelda: Ocarina of Time', game_type: 8, cover, hypes: 120 },
    { id: 8, name: 'Ocarina of Time + Majora\'s Mask Crossover Randomizer', cover },
    ...Array.from({ length: 40 }, (_, i) => ({ id: 100 + i, name: `Filler ${i}` })),
  ];
  const calls = mockFetch([
    ['id.twitch.tv', () => ({ access_token: 'tw2', expires_in: 5000000 })],
    ['api.igdb.com', () => pool],
  ]);
  const res = await search('videogame', 'ocarina of time', { TWITCH_CLIENT_ID: 'c', TWITCH_CLIENT_SECRET: 's' });
  assert.equal(res.length, 26);
  assert.deepEqual(res.slice(0, 3).map((r) => r.sourceId).sort(), ['5', '6', '7']);
  const top3 = res.slice(0, 3).map((r) => r.sourceId);
  assert.ok(top3.indexOf('6') < top3.indexOf('5'), 'exact title beats "3D"');
  const pos = (id) => res.findIndex((r) => r.sourceId === id);
  assert.ok(pos('1') > pos('5') && pos('3') > pos('5') && pos('4') > pos('5'));
  assert.match(calls.find((c) => c.url.includes('api.igdb.com')).init.body, /limit 50;/);
  assert.ok(igdbScore({ name: 'Wingspan Redux', cover }, 'wingspan redux') > igdbScore({ name: 'Wingspan Redux', cover }, 'wingspan') );
});

test('shelf sort orders', async () => {
  const { sortShelf } = await import('../src/lib/sorting.js');
  const e = (id, data) => ({ id, data });
  const items = [
    e('a', { title: 'The Zebra', creator: 'Bo', year: '1999', rating: 3, dateAdded: '2026-01-01', dateFinished: '2026-03-01' }),
    e('b', { title: 'Apple', creator: 'Al', year: '2020', rating: null, dateAdded: '2026-02-01', dateFinished: '2026-01-15' }),
    e('c', { title: 'Mango', creator: '', year: '', rating: 5, dateAdded: '2026-03-05' }),
  ];
  const ids = (sort, extra = {}) => sortShelf(items, { sort, ...extra }).map((x) => x.id).join('');
  assert.equal(ids('newest'), 'cab');
  assert.equal(ids('oldest'), 'bac');
  assert.equal(ids('title'), 'bca');      // "The Zebra" sorts as "Zebra"
  assert.equal(ids('creator'), 'bac');    // missing creator last
  assert.equal(ids('rating'), 'cab');     // unrated last
  assert.equal(ids('year-new'), 'bac');
  assert.equal(ids('year-old'), 'abc');
  assert.equal(ids('custom', { order: ['c', 'a'] }), 'bca'); // unarranged (new) 'b' goes first
  assert.equal(ids(undefined), 'cab');
});

test('automatic collections include items by status', async () => {
  const { inShelf } = await import('../src/lib/sorting.js');
  const cur = { slug: 'currently', auto: 'in-progress' };
  assert.ok(inShelf({ status: 'in-progress', collections: [] }, cur));
  assert.ok(!inShelf({ status: 'finished', collections: [] }, cur));
  assert.ok(inShelf({ status: 'finished', collections: ['currently'] }, cur)); // manual add still works
  assert.ok(inShelf({ status: 'want', collections: ['favorites'] }, { slug: 'favorites' }));
});

test('arrangements API saves per-type shelf orders', async () => {
  const { onRequestPost } = await import('../functions/api/arrangements.js');
  const { state } = githubMock({ existing: { 'src/data/arrangements.json': '{"music:finished":["x"]}' } });
  const req = (body) => new Request('https://x/api/arrangements', { method: 'POST', body: JSON.stringify(body) });
  const res = await onRequestPost({ request: req({ key: 'book:finished', order: ['b', 'a', 'b', '../bad'] }), env: GH_ENV });
  assert.equal(res.status, 200);
  const saved = JSON.parse(state.blobs[0].content);
  assert.deepEqual(saved, { 'book:finished': ['b', 'a'], 'music:finished': ['x'] });
  assert.equal(state.commitMsg, 'Arrange book:finished');
  const bad = await onRequestPost({ request: req({ key: 'book:nope', order: [] }), env: GH_ENV });
  assert.equal(bad.status, 400);
});
