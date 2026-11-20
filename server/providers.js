// Metadata providers. Every search returns normalized results:
// { type, source, sourceId, title, creator, year, cover, description, genres, details, url }
import { HttpError, fetchJson, userAgent, yearOf, decodeEntities, stripHtml, truncate } from './util.js';

const result = (r) => ({
  creator: '', year: '', cover: '', description: '', genres: [], details: {}, url: '',
  ...r,
  sourceId: String(r.sourceId),
});

// ───────────────────────── Books: Open Library + Google Books ─────────────────────────

async function searchOpenLibrary(q, env) {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=10&fields=key,title,subtitle,author_name,first_publish_year,cover_i,number_of_pages_median,isbn,subject,publisher`;
  const data = await fetchJson(url, { headers: { 'user-agent': userAgent(env) } }, 'Open Library');
  return (data.docs || []).map((d) => result({
    type: 'book',
    source: 'openlibrary',
    sourceId: String(d.key || '').replace('/works/', ''),
    title: d.subtitle ? `${d.title}: ${d.subtitle}` : d.title,
    creator: (d.author_name || []).slice(0, 3).join(', '),
    year: d.first_publish_year ? String(d.first_publish_year) : '',
    cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : '',
    genres: (d.subject || []).slice(0, 4),
    details: {
      pages: d.number_of_pages_median || undefined,
      isbn: (d.isbn || []).find((i) => i.length === 13) || (d.isbn || [])[0],
      publisher: (d.publisher || [])[0],
    },
    url: d.key ? `https://openlibrary.org${d.key}` : '',
  }));
}

async function openLibraryDetails(id, env) {
  const data = await fetchJson(`https://openlibrary.org/works/${encodeURIComponent(id)}.json`, { headers: { 'user-agent': userAgent(env) } }, 'Open Library');
  const desc = typeof data.description === 'string' ? data.description : data.description?.value || '';
  return { description: truncate(desc.replace(/\r/g, '').replace(/\(\[source\][^)]*\)/g, '')) };
}

async function searchGoogleBooks(q, env) {
  const key = env.GOOGLE_BOOKS_KEY ? `&key=${env.GOOGLE_BOOKS_KEY}` : '';
  const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=10&printType=books${key}`, {}, 'Google Books');
  return (data.items || []).map((it) => {
    const v = it.volumeInfo || {};
    const img = v.imageLinks?.extraLarge || v.imageLinks?.large || v.imageLinks?.medium || v.imageLinks?.thumbnail || '';
    const isbn = (v.industryIdentifiers || []).find((i) => i.type === 'ISBN_13')?.identifier;
    return result({
      type: 'book',
      source: 'googlebooks',
      sourceId: it.id,
      title: v.subtitle ? `${v.title}: ${v.subtitle}` : v.title,
      creator: (v.authors || []).join(', '),
      year: yearOf(v.publishedDate),
      cover: img.replace('http://', 'https://').replace('&edge=curl', ''),
      description: truncate(stripHtml(v.description)),
      genres: v.categories || [],
      details: { pages: v.pageCount || undefined, isbn, publisher: v.publisher },
      url: v.infoLink || '',
    });
  });
}

async function searchBooks(q, env) {
  const [ol, gb] = await Promise.allSettled([searchOpenLibrary(q, env), searchGoogleBooks(q, env)]);
  const out = [...(ol.status === 'fulfilled' ? ol.value : []), ...(gb.status === 'fulfilled' ? gb.value : [])];
  if (!out.length && ol.status === 'rejected' && gb.status === 'rejected') throw ol.reason;
  return out;
}

// ───────────────────────── Movies & TV: TMDB ─────────────────────────

function tmdb(env, path, params = {}) {
  if (!env.TMDB_TOKEN) throw new HttpError(400, 'TMDB_TOKEN is not set. Add your TMDB API Read Access Token in Cloudflare.');
  const usp = new URLSearchParams(params);
  const headers = { accept: 'application/json' };
  // Accept either the long "API Read Access Token" (Bearer) or the short v3 API key.
  if (env.TMDB_TOKEN.length > 40) headers.authorization = `Bearer ${env.TMDB_TOKEN}`;
  else usp.set('api_key', env.TMDB_TOKEN);
  return fetchJson(`https://api.themoviedb.org/3${path}?${usp}`, { headers }, 'TMDB');
}

const tmdbImg = (p) => (p ? `https://image.tmdb.org/t/p/w780${p}` : '');

async function searchTmdb(type, q, env) {
  const kind = type === 'tv' ? 'tv' : 'movie';
  const data = await tmdb(env, `/search/${kind}`, { query: q, include_adult: 'false' });
  return (data.results || []).slice(0, 12).map((r) => result({
    type,
    source: 'tmdb',
    sourceId: r.id,
    title: kind === 'tv' ? r.name : r.title,
    year: yearOf(kind === 'tv' ? r.first_air_date : r.release_date),
    cover: tmdbImg(r.poster_path),
    description: truncate(r.overview),
    url: `https://www.themoviedb.org/${kind}/${r.id}`,
  }));
}

async function tmdbDetails(type, id, env) {
  const kind = type === 'tv' ? 'tv' : 'movie';
  const d = await tmdb(env, `/${kind}/${encodeURIComponent(id)}`, { append_to_response: 'credits' });
  const cast = (d.credits?.cast || []).slice(0, 5).map((c) => c.name);
  if (kind === 'movie') {
    const directors = (d.credits?.crew || []).filter((c) => c.job === 'Director').map((c) => c.name);
    return {
      creator: directors.join(', '),
      genres: (d.genres || []).map((g) => g.name),
      description: truncate(d.overview),
      details: { runtime: d.runtime || undefined, cast },
    };
  }
  return {
    creator: (d.created_by || []).map((c) => c.name).join(', '),
    genres: (d.genres || []).map((g) => g.name),
    description: truncate(d.overview),
    details: {
      seasons: d.number_of_seasons || undefined,
      episodes: d.number_of_episodes || undefined,
      network: d.networks?.[0]?.name,
      cast,
    },
  };
}

// ───────────────────────── Music: Spotify (fallback: MusicBrainz) ─────────────────────────

let spotifyToken = null; // { token, exp } — cached per isolate

async function getSpotifyToken(env) {
  if (spotifyToken && spotifyToken.exp > Date.now() + 30_000) return spotifyToken.token;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      authorization: 'Basic ' + btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new HttpError(502, `Spotify auth failed (${res.status})`);
  const data = await res.json();
  spotifyToken = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return spotifyToken.token;
}

async function searchSpotify(q, env) {
  const token = await getSpotifyToken(env);
  // Development Mode caps `limit` at 10 (Feb 2026 change).
  const data = await fetchJson(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=album,track&limit=10`,
    { headers: { authorization: `Bearer ${token}` } },
    'Spotify',
  );
  const albums = (data.albums?.items || []).map((a) => result({
    type: 'music',
    source: 'spotify',
    sourceId: `album:${a.id}`,
    title: a.name,
    creator: (a.artists || []).map((x) => x.name).join(', '),
    year: yearOf(a.release_date),
    cover: a.images?.[0]?.url || '',
    details: { kind: a.album_type === 'single' ? 'Single' : a.album_type === 'compilation' ? 'Compilation' : 'Album', tracks: a.total_tracks },
    url: a.external_urls?.spotify || '',
  }));
  const tracks = (data.tracks?.items || []).map((t) => result({
    type: 'music',
    source: 'spotify',
    sourceId: `track:${t.id}`,
    title: t.name,
    creator: (t.artists || []).map((x) => x.name).join(', '),
    year: yearOf(t.album?.release_date),
    cover: t.album?.images?.[0]?.url || '',
    description: t.album?.name ? `From ${t.album.name}` : '',
    details: { kind: 'Song' },
    url: t.external_urls?.spotify || '',
  }));
  return [...albums, ...tracks];
}

async function searchMusicBrainz(q, env) {
  const data = await fetchJson(
    `https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(q)}&fmt=json&limit=12`,
    { headers: { 'user-agent': userAgent(env), accept: 'application/json' } },
    'MusicBrainz',
  );
  return (data['release-groups'] || []).map((rg) => result({
    type: 'music',
    source: 'musicbrainz',
    sourceId: rg.id,
    title: rg.title,
    creator: (rg['artist-credit'] || []).map((a) => (a.name || a.artist?.name || '') + (a.joinphrase || '')).join('').trim(),
    year: yearOf(rg['first-release-date']),
    cover: `https://coverartarchive.org/release-group/${rg.id}/front-500`,
    details: { kind: rg['primary-type'] || 'Album' },
    url: `https://musicbrainz.org/release-group/${rg.id}`,
  }));
}

async function searchMusic(q, env) {
  if (env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET) {
    try {
      return await searchSpotify(q, env);
    } catch (err) {
      console.warn('Spotify failed, falling back to MusicBrainz:', err.message);
    }
  }
  return searchMusicBrainz(q, env);
}

// ───────────────────────── Video games: IGDB (via Twitch) ─────────────────────────

let twitchToken = null;

async function getTwitchToken(env) {
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) {
    throw new HttpError(400, 'TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET are not set (needed for IGDB video game search).');
  }
  if (twitchToken && twitchToken.exp > Date.now() + 60_000) return twitchToken.token;
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(env.TWITCH_CLIENT_ID)}&client_secret=${encodeURIComponent(env.TWITCH_CLIENT_SECRET)}&grant_type=client_credentials`,
    { method: 'POST' },
  );
  if (!res.ok) throw new HttpError(502, `Twitch auth failed (${res.status})`);
  const data = await res.json();
  twitchToken = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return twitchToken.token;
}

const IGDB_POOL = 50;   // candidates fetched from IGDB
const IGDB_RESULTS = 26; // results shown after re-ranking

// IGDB game_type ids → how much we trust it as "the real game".
const IGDB_TYPE_WEIGHT = {
  0: 2,    // main game
  8: 2,    // remake
  9: 1.5,  // remaster
  10: 1.5, // expanded game
  4: 1.5,  // standalone expansion
  2: 1,    // expansion
  11: 1,   // port
  3: 0.5,  // bundle
  1: 0,    // DLC
  6: 0, 7: 0, 13: 0, 14: -0.5, // episode, season, pack, update
  5: -3,   // mod
  12: -2,  // fork
};
const FAN_WORDS = /\b(randomi[sz]er|rom ?hack|hack|redux|mod|fan ?game|demake|unreal engine|crossover|online|2d)\b/i;

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Higher = better. Exported for tests. */
export function igdbScore(game, q) {
  const name = norm(game.name);
  const query = norm(q);
  // Compare against the full name and against the part after a series prefix ("The Legend of Zelda: Ocarina of Time").
  const parts = [name, ...String(game.name || '').split(/[:\-–—]/).slice(1).map(norm)].filter(Boolean);
  let title = 0;
  if (parts.some((p) => p === query)) title = 3;
  else if (name.startsWith(query) || parts.some((p) => p.startsWith(query))) title = 2;
  else if (name.includes(query)) title = 1;

  const typeId = game.game_type ?? game.category;
  let type = typeId in IGDB_TYPE_WEIGHT ? IGDB_TYPE_WEIGHT[typeId] : 0;
  // Unofficial stuff that isn't tagged as a mod still tends to say so in its name.
  if (type >= 0 && FAN_WORDS.test(game.name) && !FAN_WORDS.test(q)) type -= 2;

  const popularity = Math.log10(1 + (game.total_rating_count || 0) + (game.hypes || 0) + (game.follows || 0));
  const cover = game.cover?.image_id ? 0 : -2;
  return title * 2 + type * 1.5 + popularity + cover;
}

async function igdbQuery(env, token, body) {
  return fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: { 'client-id': env.TWITCH_CLIENT_ID, authorization: `Bearer ${token}`, accept: 'application/json', 'content-type': 'text/plain' },
    body,
  });
}

async function searchIgdb(q, env) {
  const token = await getTwitchToken(env);
  const safe = q.replace(/["\\]/g, ' ');
  const base = 'name,first_release_date,cover.image_id,summary,genres.name,platforms.abbreviation,platforms.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,url,total_rating_count,hypes';
  let res = await igdbQuery(env, token, `search "${safe}"; fields ${base},game_type; limit ${IGDB_POOL};`);
  // If IGDB ever rejects the game_type field, retry without it rather than failing the search.
  if (res.status === 400) res = await igdbQuery(env, token, `search "${safe}"; fields ${base}; limit ${IGDB_POOL};`);
  if (!res.ok) throw new HttpError(502, `IGDB failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const games = (await res.json())
    .map((g, i) => ({ g, i, s: igdbScore(g, q) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, IGDB_RESULTS)
    .map(({ g }) => g);
  return games.map((g) => {
    const companies = g.involved_companies || [];
    const developers = companies.filter((c) => c.developer).map((c) => c.company?.name).filter(Boolean);
    const publishers = companies.filter((c) => c.publisher).map((c) => c.company?.name).filter(Boolean);
    return result({
      type: 'videogame',
      source: 'igdb',
      sourceId: g.id,
      title: g.name,
      creator: developers.slice(0, 2).join(', '),
      year: g.first_release_date ? String(new Date(g.first_release_date * 1000).getUTCFullYear()) : '',
      cover: g.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${g.cover.image_id}.jpg` : '',
      description: truncate(g.summary),
      genres: (g.genres || []).map((x) => x.name),
      details: {
        platforms: (g.platforms || []).map((p) => p.abbreviation || p.name).filter(Boolean),
        publishers: publishers.slice(0, 3),
      },
      url: g.url || '',
    });
  });
}

// ───────────────────────── Board games: BoardGameGeek XML API2 ─────────────────────────

const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], decodeEntities(m[2])]));

export function parseBggSearch(xml) {
  return [...xml.matchAll(/<item\b([^>]*)>([\s\S]*?)<\/item>/g)].map(([, a, inner]) => {
    const name = inner.match(/<name\b[^>]*\/?>/);
    const year = inner.match(/<yearpublished\b[^>]*\/?>/);
    return {
      id: attrs(a).id,
      name: name ? attrs(name[0]).value : '',
      year: year ? attrs(year[0]).value : '',
    };
  });
}

export function parseBggThings(xml) {
  return [...xml.matchAll(/<item\b([^>]*)>([\s\S]*?)<\/item>/g)].map(([, a, inner]) => {
    const tags = (name) => [...inner.matchAll(new RegExp(`<${name}\\b[^>]*\\/?>`, 'g'))].map((m) => attrs(m[0]));
    const val = (name) => tags(name)[0]?.value || '';
    const text = (name) => decodeEntities((inner.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`)) || [])[1] || '').trim();
    const names = tags('name');
    const links = tags('link');
    const linkVals = (t) => links.filter((l) => l.type === t).map((l) => l.value);
    const rank = tags('rank').find((r) => r.name === 'boardgame')?.value;
    const minP = val('minplayers'), maxP = val('maxplayers');
    const weight = parseFloat(val('averageweight'));
    return {
      id: attrs(a).id,
      title: (names.find((n) => n.type === 'primary') || names[0] || {}).value || '',
      year: val('yearpublished'),
      image: text('image'),
      thumbnail: text('thumbnail'),
      description: text('description'),
      players: minP && maxP ? (minP === maxP ? minP : `${minP}–${maxP}`) : '',
      playtime: val('playingtime'),
      designers: linkVals('boardgamedesigner'),
      publishers: linkVals('boardgamepublisher'),
      categories: linkVals('boardgamecategory'),
      weight: Number.isFinite(weight) && weight > 0 ? weight.toFixed(2) + ' / 5' : '',
      rank: rank && rank !== 'Not Ranked' ? rank : '',
    };
  });
}

async function bgg(env, path) {
  const headers = { 'user-agent': userAgent(env) };
  if (env.BGG_TOKEN) headers.authorization = `Bearer ${env.BGG_TOKEN}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://boardgamegeek.com/xmlapi2/${path}`, { headers });
    if (res.status === 202) { await new Promise((r) => setTimeout(r, 1200)); continue; } // queued
    if (res.status === 401 || res.status === 403) {
      throw new HttpError(502, 'BoardGameGeek refused the request. Set BGG_TOKEN (register an app at boardgamegeek.com/applications).');
    }
    if (!res.ok) throw new HttpError(502, `BoardGameGeek failed (${res.status})`);
    return res.text();
  }
  throw new HttpError(504, 'BoardGameGeek is busy — try again in a moment.');
}

async function searchBgg(q, env) {
  const hits = parseBggSearch(await bgg(env, `search?query=${encodeURIComponent(q)}&type=boardgame`));
  const ql = q.trim().toLowerCase();
  const score = (h) => (h.name.toLowerCase() === ql ? 0 : h.name.toLowerCase().startsWith(ql) ? 1 : 2);
  const seen = new Set();
  const top = hits
    .map((h, i) => ({ ...h, i }))
    .sort((a, b) => score(a) - score(b) || a.i - b.i)
    .filter((h) => !seen.has(h.id) && seen.add(h.id))
    .slice(0, 12);
  if (!top.length) return [];
  const things = parseBggThings(await bgg(env, `thing?id=${top.map((h) => h.id).join(',')}&stats=1`));
  const byId = Object.fromEntries(things.map((t) => [t.id, t]));
  return top.map((h) => {
    const t = byId[h.id] || {};
    return result({
      type: 'boardgame',
      source: 'bgg',
      sourceId: h.id,
      title: t.title || h.name,
      creator: (t.designers || []).filter((d) => d !== '(Uncredited)').slice(0, 3).join(', '),
      year: t.year || h.year,
      cover: t.image || t.thumbnail || '',
      description: truncate(t.description),
      genres: (t.categories || []).slice(0, 4),
      details: {
        players: t.players,
        playtime: t.playtime && t.playtime !== '0' ? t.playtime : undefined,
        weight: t.weight,
        bggRank: t.rank,
        publishers: (t.publishers || []).slice(0, 2),
      },
      url: `https://boardgamegeek.com/boardgame/${h.id}`,
    });
  });
}

// ───────────────────────── Public API ─────────────────────────

export async function search(type, q, env) {
  switch (type) {
    case 'book': return searchBooks(q, env);
    case 'movie':
    case 'tv': return searchTmdb(type, q, env);
    case 'music': return searchMusic(q, env);
    case 'videogame': return searchIgdb(q, env);
    case 'boardgame': return searchBgg(q, env);
    default: throw new HttpError(400, `Unknown type: ${type}`);
  }
}

/** Extra info fetched only when you pick a result (keeps search fast). */
export async function details(type, source, id, env) {
  if (source === 'tmdb') return tmdbDetails(type, id, env);
  if (source === 'openlibrary') return openLibraryDetails(id, env);
  return {};
}

export function configured(env) {
  return {
    github: Boolean(env.GITHUB_TOKEN && env.GITHUB_REPO),
    books: true,
    tmdb: Boolean(env.TMDB_TOKEN),
    spotify: Boolean(env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET),
    igdb: Boolean(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET),
    bgg: Boolean(env.BGG_TOKEN),
  };
}
