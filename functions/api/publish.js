import { json, handler } from '../../server/util.js';
import { commitFiles, commitsSince, SKIP_PREFIX } from '../../server/github.js';

// GET /api/publish?since=<sha the live site was built from> → what's waiting to go live
export const onRequestGet = handler(async ({ request, env }) => {
  const since = new URL(request.url).searchParams.get('since') || '';
  if (!/^[0-9a-f]{7,40}$/i.test(since)) return json({ pending: null, changes: [] });
  const { commits } = await commitsSince(env, since);
  // Only count saves that are waiting for a publish (tagged to skip the build). Code updates
  // and publishes build by themselves, so they're never "unpublished".
  const changes = commits.filter((m) => m.startsWith(SKIP_PREFIX)).map((m) => m.slice(SKIP_PREFIX.length));
  return json({ pending: changes.length, changes });
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
