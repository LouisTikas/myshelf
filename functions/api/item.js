import { json, handler, HttpError } from '../../server/util.js';
import { readFile } from '../../server/github.js';
import { parseMarkdown } from '../../server/markdown.js';
import { itemPath } from '../../server/paths.js';

// GET /api/item?slug=book-dune-1965 → live copy from GitHub (newer than the built site)
export const onRequestGet = handler(async ({ request, env }) => {
  const slug = new URL(request.url).searchParams.get('slug');
  const text = await readFile(env, itemPath(slug));
  if (text == null) throw new HttpError(404, 'Item not found');
  const { data, body } = parseMarkdown(text);
  return json({ slug, item: data, body });
});
