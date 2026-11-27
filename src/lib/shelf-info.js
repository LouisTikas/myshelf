// The facts the shelf info bar shows for an item (the panel that slides out under a shelf when you hover an
// item, or tap it on a phone). Built when the page renders and kept on the item's slot as JSON (data-info).
import { TYPES, STATUS_LABEL, isVinyl, isChannel, progressOf, formatDetail, stars } from './types.js';
import { mentionsPlain } from './mentions.js';

const EXCERPT = 180; // characters of your review shown in the bar (it's clamped to a few lines too)

/** Your review (the item's notes, in Markdown) as one line of plain text, cut at a word near `max`. */
export function reviewExcerpt(body, max = EXCERPT) {
  let s = mentionsPlain(String(body || ''));
  s = s
    .replace(/```[\s\S]*?```/g, ' ')              // code blocks
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')         // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')       // links: keep the text
    .replace(/<[^>]+>/g, ' ')                     // stray HTML
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '') // headings, quotes, list markers
    .replace(/(\*\*|__|\*|_|~~|`)/g, '')          // emphasis and code marks
    .replace(/^\s*([-*_]\s*){3,}$/gm, ' ')        // horizontal rules
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max).replace(/\s+\S*$/, '').replace(/[\s,;:.\-–—]+$/, '');
  return `${cut || s.slice(0, max)}…`;
}

// How the creator line reads: "by Andy Weir", "Directed by Denis Villeneuve"…
const BY = { movie: 'Directed by', tv: 'Created by', boardgame: 'Designed by', video: 'from' };

// One extra fact per type, from the item's details: [label, value].
function keyFact(d) {
  const det = d.details || {};
  const pick = (label, key) => {
    const v = formatDetail(key, det[key], det);
    return v ? [label, v] : null;
  };
  switch (d.type) {
    case 'book': return pick('Pages', 'pages');
    case 'movie': return pick('Runtime', 'runtime');
    case 'tv': return pick('Seasons', 'seasons') || pick('Episodes', 'episodes');
    case 'music': return pick('Tracks', 'tracks');
    case 'videogame': return pick('Platforms', 'platforms');
    case 'boardgame': return pick('Players', 'players') || pick('Play time', 'playtime');
    case 'video': return isChannel(d) ? pick('Subscribers', 'subscribers') : pick('Channel', 'channel');
    default: return null;
  }
}

/** Short keys keep the JSON on each slot small. */
export function shelfInfo(entry) {
  const d = entry.data || {};
  const t = TYPES[d.type] || TYPES.book;
  const prog = progressOf(d);
  const fact = keyFact(d);
  const label = isVinyl(d) ? 'Album' : isChannel(d) ? 'YouTube channel' : t.label;
  const info = {
    l: label,                                // type label
    t: d.title || '',
    s: STATUS_LABEL(d.type, d.status),       // status label
    k: d.status || '',                       // status key (colours the pill)
  };
  if (d.year) info.y = String(d.year);
  if (d.creator) info.c = `${BY[d.type] || 'by'} ${d.creator}`;
  if (d.rating != null) { info.r = stars(d.rating); info.rv = Number(d.rating); }
  if (prog) info.p = { x: prog.text, n: prog.pct };
  if (fact) info.f = fact;
  const review = reviewExcerpt(entry.body);
  if (review) info.v = review;
  return info;
}
