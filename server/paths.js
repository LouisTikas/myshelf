import { HttpError } from './util.js';

export function assertSlug(slug) {
  if (!/^[a-z0-9][a-z0-9-]{0,120}$/.test(slug || '')) throw new HttpError(400, 'Invalid slug');
  return slug;
}
