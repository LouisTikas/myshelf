import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewExcerpt, shelfInfo } from '../src/lib/shelf-info.js';

test('reviewExcerpt turns Markdown notes into one plain line', () => {
  assert.equal(reviewExcerpt('# Wow\n\n**Loved** it. See [the site](https://x.y) and @[Sam](https://sam.example)!'), 'Wow Loved it. See the site and @Sam!');
  assert.equal(reviewExcerpt('- one\n- two\n> quoted'), 'one two quoted');
  assert.equal(reviewExcerpt(''), '');
  assert.equal(reviewExcerpt(null), '');
});

test('reviewExcerpt cuts long reviews at a word', () => {
  const out = reviewExcerpt('word '.repeat(100), 30);
  assert.ok(out.endsWith('…'));
  assert.ok(out.length <= 31);
  assert.ok(!/\s…$/.test(out));
});

test('shelfInfo gathers the bar facts', () => {
  const info = shelfInfo({
    data: { type: 'book', title: 'Dune', creator: 'Frank Herbert', year: '1965', status: 'in-progress', rating: 4.5, details: { pages: 688 }, progress: { at: 100 } },
    body: 'Slow start, then *great*.',
  });
  assert.equal(info.l, 'Book');
  assert.equal(info.t, 'Dune');
  assert.equal(info.c, 'by Frank Herbert');
  assert.equal(info.y, '1965');
  assert.equal(info.s, 'Reading');
  assert.equal(info.k, 'in-progress');
  assert.equal(info.r, '★★★★½');
  assert.deepEqual(info.f, ['Pages', '688']);
  assert.deepEqual(info.p, { x: 'Page 100 of 688', n: 15 });
  assert.equal(info.v, 'Slow start, then great.');
});

test('shelfInfo leaves out what an item does not have', () => {
  const info = shelfInfo({ data: { type: 'movie', title: 'Arrival', status: 'want', rating: null, details: {} }, body: '' });
  assert.equal(info.s, 'Want to watch');
  for (const k of ['c', 'y', 'r', 'p', 'f', 'v']) assert.equal(info[k], undefined, k);
});
