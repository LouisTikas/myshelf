// Emoji for comment reactions. Any emoji a phone or computer keyboard can type is allowed (skin tones, flags,
// keycaps and ZWJ combinations like 👩‍🚀 included), but only one at a time and nothing else.
// No dependencies, so the server and browser scripts can both use it.

// Characters an emoji can be built from…
const PARTS = /^[\p{Extended_Pictographic}\p{Emoji_Component}⃣️‍]+$/u;
// …and at least one that makes it a picture rather than a bare digit or # (flags and keycaps count).
const PICTURE = /[\p{Extended_Pictographic}\p{Regional_Indicator}⃣]/u;

function graphemes(text) {
  const s = String(text ?? '');
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].map((g) => g.segment);
  }
  return [s]; // very old browsers: the checks below still keep out anything that isn't emoji
}

/** value if it's exactly one emoji, otherwise ''. */
export function oneEmoji(value) {
  const s = String(value ?? '').trim();
  if (!s || s.length > 32 || graphemes(s).length !== 1) return '';
  return PARTS.test(s) && PICTURE.test(s) ? s : '';
}

/** The first emoji in some typed text (what an emoji keyboard put in a box), or ''. */
export function firstEmoji(text) {
  for (const g of graphemes(text)) {
    const e = oneEmoji(g);
    if (e) return e;
  }
  return '';
}
