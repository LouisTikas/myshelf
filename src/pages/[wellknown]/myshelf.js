import { json, route } from '../../../server/util.js';
import { wellKnown } from '../../../server/federation/index.js';

// GET /.well-known/myshelf → this site's name, owner and public key, so other MyShelf sites can connect.
// (Astro skips folders whose names start with a dot, so this catches /<anything>/myshelf and only answers
// for ".well-known".)
export const GET = route(async ({ env, url, params }) => {
  if (params.wellknown !== '.well-known') return new Response('Not found', { status: 404 });
  return json(await wellKnown(env, url.href), 200, { 'access-control-allow-origin': '*' });
});
