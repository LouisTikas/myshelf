import { json, handler } from '../../server/util.js';
import { commitFiles, commitsSince, SKIP_PREFIX } from '../../server/github.js';

// GET /api/publish?since=<sha the live site was built from> → what's waiting to go live
export const onRequestGet = handler(async ({ request, env }) => {
  const since = new URL(request.url).searchParams.get('since') || '';
  if (!/^[0-9a-f]{7,40}$/i.test(since)) return json({ pending: null, changes: [] });
  const { aheadBy, commits } = await commitsSince(env, since);
  const changes = commits.map((m) => m.replace(SKIP_PREFIX, '')).filter((m) => !/^Publish site/.test(m));
  return json({ pending: aheadBy, changes });
});

// POST /api/publish → one commit WITHOUT the skip tag, so Cloudflare builds once and
// every saved change goes live together.
export const onRequestPost = handler(async ({ env }) => {
  const publishedAt = new Date().toISOString();
  const sha = await commitFiles(env, 'Publish site', [
    { path: 'src/data/published.json', text: JSON.stringify({ publishedAt }, null, 2) + '\n' },
  ], { publish: true });
  return json({ sha, publishedAt });
});
