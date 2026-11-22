// Site title, tagline and owner name: edited in Manage → Settings, stored in D1.
// src/data/site.json holds the defaults a brand-new site starts with.
import defaults from '../src/data/site.json';
import { getSetting, setSetting, hasDb } from './db.js';
import { HttpError } from './util.js';

const clean = (v, n) => String(v ?? '').trim().slice(0, n);

export async function getSite(env) {
  if (!hasDb(env)) return { ...defaults };
  try {
    return { ...defaults, ...(await getSetting(env, 'site', {})) };
  } catch {
    return { ...defaults };
  }
}

export async function saveSite(env, input = {}) {
  const site = {
    title: clean(input.title, 80) || defaults.title,
    tagline: clean(input.tagline, 200),
    owner: clean(input.owner, 80),
    // The address friends use to reach you. Leave blank to use whatever address you open the site on.
    url: cleanUrl(input.url),
  };
  await setSetting(env, 'site', site);
  return site;
}

function cleanUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (u.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(u.hostname)) return u.origin;
  } catch {}
  throw new HttpError(400, 'Your site address should look like https://myshelf.example.workers.dev');
}
