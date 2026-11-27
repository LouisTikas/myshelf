// Manage → Settings → Updates. A MyShelf copy made by forking on GitHub can pull in new versions from the
// repository it was forked from without visiting GitHub: this does what GitHub's "Sync fork" button does,
// through GitHub's API, and Cloudflare redeploys the site from the updated fork as usual.
//
// Which repository: the GITHUB_REPO variable ("you/myshelf") if set, otherwise the Source code link in
// Settings. Both checking and syncing use a GITHUB_TOKEN secret: a fine-grained token for just that
// repository with "Contents: Read and write". (Without one, GitHub's shared rate limit for Cloudflare's
// addresses runs out quickly, so we don't try.)
import { getSite } from './site.js';
import { HttpError } from './util.js';
import { versionInfo, VERSION } from './version.js';
import { getSetting, setSetting, hasDb } from './db.js';
import { logEvent } from './logs.js';

const API = 'https://api.github.com';

function repoOf(env, site) {
  const raw = String(env.GITHUB_REPO || site.source || '').trim();
  const m = raw.match(/^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
  return m ? `${m[1]}/${m[2]}` : null;
}

async function gh(env, path, { method = 'GET', body } = {}) {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'MyShelf', 'x-github-api-version': '2022-11-28' };
  if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  if (body) headers['content-type'] = 'application/json';
  const res = await fetch((env.GITHUB_API || API) + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const firstLine = (s) => String(s || '').split('\n')[0];

/** Where this site's repository stands against the one it was forked from. */
export async function checkUpdates(env) {
  return { ...(await check(env)), current: versionInfo() };
}

/** The version number in the original's package.json (blank if it can't be read). */
async function upstreamVersion(env, upstream, branch) {
  const res = await gh(env, `/repos/${upstream}/contents/package.json?ref=${encodeURIComponent(branch)}`).catch(() => null);
  if (res?.status !== 200 || !res.data.content) return '';
  try { return String(JSON.parse(atob(res.data.content.replace(/\s/g, ''))).version || ''); } catch { return ''; }
}

async function check(env) {
  const site = await getSite(env);
  const repo = repoOf(env, site);
  const canSync = Boolean(env.GITHUB_TOKEN);
  if (!repo) return { status: 'no-repo', canSync };
  if (!canSync) return { status: 'no-token', repo, canSync };

  const info = await gh(env, `/repos/${repo}`);
  if (info.status === 401 || info.status === 403) return { status: 'bad-token', repo, canSync };
  if (info.status === 404) return { status: 'not-found', repo, canSync };
  if (info.status !== 200) return { status: 'error', repo, canSync, message: info.data.message || `GitHub answered ${info.status}` };
  if (!info.data.fork || !info.data.parent) return { status: 'not-fork', repo, canSync };

  const upstream = info.data.parent.full_name;
  const branch = info.data.default_branch;
  const upBranch = info.data.parent.default_branch;
  const [upOwner] = upstream.split('/');
  // base = your fork, head = the original: "ahead_by" is how many new commits the original has.
  const cmp = await gh(env, `/repos/${repo}/compare/${encodeURIComponent(branch)}...${encodeURIComponent(`${upOwner}:${upBranch}`)}`);
  if (cmp.status !== 200) return { status: 'error', repo, upstream, canSync, message: cmp.data.message || `GitHub answered ${cmp.status}` };

  const all = (cmp.data.commits || [])
    .filter((c) => (c.parents || []).length < 2) // skip merge commits; their branches' commits are listed
    .map((c) => ({ message: firstLine(c.commit?.message), date: c.commit?.committer?.date || c.commit?.author?.date || '' }))
    .reverse();
  const behind = cmp.data.ahead_by > 0;
  return {
    status: behind ? 'behind' : 'up-to-date',
    latest: behind ? await upstreamVersion(env, upstream, upBranch) : '',
    repo, upstream, branch, canSync,
    behind: all.length || cmp.data.ahead_by || 0,
    changes: all.slice(0, 8),
    yours: cmp.data.behind_by || 0, // commits only in your fork (edits you made)
  };
}

/** Pull in the original's new commits, like GitHub's "Sync fork → Update branch". */
export async function syncUpdates(env) {
  if (!env.GITHUB_TOKEN) throw new HttpError(400, 'Add a GitHub token in Manage → Settings → API keys to update from here.');
  const now = await check(env);
  if (now.status === 'up-to-date') return { ok: true, message: 'Already up to date.' };
  if (now.status !== 'behind') throw new HttpError(400, `Can’t update right now (${now.status}).`);

  const res = await gh(env, `/repos/${now.repo}/merge-upstream`, { method: 'POST', body: { branch: now.branch } });
  if (res.status === 200) return { ok: true, updated: true, message: res.data.message || 'Updated.' };
  if (res.status === 409) throw new HttpError(409, 'Your copy has its own changes that clash with the new version. Open your repository on GitHub and use Sync fork there to sort it out.');
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    throw new HttpError(403, 'GitHub turned the token down. It needs “Contents: Read and write” on your MyShelf repository and must not be expired.');
  }
  throw new HttpError(502, res.data.message || `GitHub answered ${res.status}`);
}

// ───────── automatic updates ─────────
// Once a day (the cron trigger in wrangler.jsonc, handled in src/worker.js) the site does what Update now does,
// but only when a new *version* is out: commits on the original's main branch between releases are left alone.
// On unless turned off in Manage → Settings → Updates. Every run is recorded for that page and the debug log.

const AUTO_KEY = 'auto_update';      // { enabled: boolean }
const LAST_KEY = 'auto_update_last'; // { at, result, message, version? }

export async function getAutoUpdate(env) {
  if (!hasDb(env)) return { enabled: true, last: null };
  const [pref, last] = await Promise.all([getSetting(env, AUTO_KEY, {}), getSetting(env, LAST_KEY, null)]);
  return { enabled: pref?.enabled !== false, last };
}

export async function setAutoUpdate(env, enabled) {
  await setSetting(env, AUTO_KEY, { enabled: Boolean(enabled) });
  return getAutoUpdate(env);
}

// Quiet outcomes (nothing to do, or a copy that can't update this way) aren't worth a debug-log line every day.
const QUIET = new Set(['off', 'up-to-date', 'waiting', 'no-repo', 'not-fork', 'no-token']); // no-token: shown in Settings → Updates instead

/** One scheduled run. Never throws; returns what happened ({ result, message }). */
export async function runAutoUpdate(env) {
  let out;
  try {
    out = await autoUpdateOnce(env);
  } catch (err) {
    out = { result: 'failed', message: err.message || String(err) };
  }
  out = { at: new Date().toISOString(), ...out };
  if (hasDb(env)) {
    await setSetting(env, LAST_KEY, out).catch(() => {});
    if (!QUIET.has(out.result)) {
      await logEvent(env, { level: out.result === 'updated' ? 'info' : 'warn', source: 'auto-update', message: out.message });
    }
  }
  return out;
}

async function autoUpdateOnce(env) {
  const { enabled } = await getAutoUpdate(env);
  if (!enabled) return { result: 'off', message: 'Automatic updates are turned off.' };
  const now = await check(env);
  switch (now.status) {
    case 'up-to-date': return { result: 'up-to-date', message: `Up to date (${VERSION}).` };
    case 'no-repo': return { result: 'no-repo', message: 'This site doesn’t know which GitHub repository it runs from.' };
    case 'not-fork': return { result: 'not-fork', message: `${now.repo} isn’t a fork, so there’s nothing to update it from.` };
    case 'no-token': return { result: 'no-token', message: 'Skipped: add a GitHub token in Settings → API keys so the site can update itself.' };
    case 'bad-token': return { result: 'bad-token', message: 'Skipped: GitHub didn’t accept the GitHub token. It may have expired.' };
    case 'not-found': return { result: 'not-found', message: `Skipped: couldn’t find ${now.repo} on GitHub.` };
    case 'behind': break;
    default: return { result: 'failed', message: `Couldn’t check for updates: ${now.message || now.status}` };
  }
  // Only whole releases: the version number in the original must have moved on from this one.
  if (!now.latest || now.latest === VERSION) {
    return { result: 'waiting', message: `There are new changes, but no new version yet (you have ${VERSION}).` };
  }
  const res = await syncUpdates(env); // throws with a readable message (clashing edits, token turned down…)
  return res.updated
    ? { result: 'updated', version: now.latest, message: `Updated from ${VERSION} to ${now.latest}. Cloudflare redeploys the site in a couple of minutes.` }
    : { result: 'up-to-date', message: res.message || 'Already up to date.' };
}
