// Shared media-type config. Keep keys in sync with functions/api/_lib/types.js.
export const TYPES = {
  book:      { label: 'Book',       plural: 'Books',       creator: 'Author',    verb: 'Read',    doing: 'Reading',   want: 'Want to read',  aspect: 2 / 3, color: '#8a3b2e' },
  movie:     { label: 'Movie',      plural: 'Movies',      creator: 'Director',  verb: 'Watched', doing: 'Watching',  want: 'Want to watch', aspect: 2 / 3, color: '#2e4a6b' },
  tv:        { label: 'TV Show',    plural: 'TV Shows',    creator: 'Creator',   verb: 'Watched', doing: 'Watching',  want: 'Want to watch', aspect: 2 / 3, color: '#4b3b6b' },
  music:     { label: 'Music',      plural: 'Music',       creator: 'Artist',    verb: 'Listened',doing: 'Listening', want: 'Want to hear',  aspect: 1,     color: '#2f5e4e' },
  videogame: { label: 'Video Game', plural: 'Video Games', creator: 'Developer', verb: 'Played',  doing: 'Playing',   want: 'Want to play',  aspect: 3 / 4, color: '#6b4b1f' },
  boardgame: { label: 'Board Game', plural: 'Board Games', creator: 'Designer',  verb: 'Played',  doing: 'Playing',   want: 'Want to play',  aspect: 1,     color: '#5e2f45' },
};

export const TYPE_KEYS = Object.keys(TYPES);

export const STATUS_LABEL = (type, status) => {
  const t = TYPES[type] || TYPES.book;
  return { want: t.want, 'in-progress': t.doing, finished: t.verb, abandoned: 'Abandoned' }[status] || status;
};

// Readable labels for the `details` object.
export const DETAIL_LABELS = {
  pages: 'Pages', isbn: 'ISBN', publisher: 'Publisher',
  runtime: 'Runtime', seasons: 'Seasons', episodes: 'Episodes', network: 'Network',
  tracks: 'Tracks', kind: 'Format', label: 'Label',
  platforms: 'Platforms', developers: 'Developers', publishers: 'Publishers',
  players: 'Players', playtime: 'Play time', weight: 'Complexity', bggRank: 'BGG rank',
  cast: 'Cast',
};

export function formatDetail(key, value) {
  if (value == null || value === '') return '';
  if (Array.isArray(value)) return value.join(', ');
  if (key === 'runtime') return `${value} min`;
  if (key === 'playtime') return `${value} min`;
  return String(value);
}

export function stars(rating) {
  if (rating == null) return '';
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return '★'.repeat(full) + (half ? '½' : '');
}
