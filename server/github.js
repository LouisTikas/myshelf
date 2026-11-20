// Minimal GitHub client: read files and write several files in ONE commit
// (so each save triggers just one Cloudflare Pages build).
import { HttpError, arrayBufferToBase64 } from './util.js';

const API = 'https://api.github.com';

function cfg(env) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    throw new HttpError(500, 'GITHUB_TOKEN and GITHUB_REPO must be set in your Cloudflare Pages environment variables.');
  }
  return { repo: env.GITHUB_REPO, branch: env.GITHUB_BRANCH || 'main', token: env.GITHUB_TOKEN };
}

async function gh(env, path, init = {}) {
  const { token } = cfg(env);
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'MyShelf',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  return res;
}

async function ghJson(env, path, init) {
  const res = await gh(env, path, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new HttpError(502, `GitHub ${init?.method || 'GET'} ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

/** Read a text file from the repo. Returns null if it doesn't exist. */
export async function readFile(env, path) {
  const { repo, branch } = cfg(env);
  const res = await gh(env, `/repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`, {
    headers: { accept: 'application/vnd.github.raw+json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(502, `GitHub read ${path} failed (${res.status})`);
  return res.text();
}

export async function fileExists(env, path) {
  const { repo, branch } = cfg(env);
  const res = await gh(env, `/repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`, { method: 'GET' });
  if (res.status === 404) return false;
  if (!res.ok) throw new HttpError(502, `GitHub lookup ${path} failed (${res.status})`);
  return true;
}

/**
 * Commit changes in a single commit.
 * changes: [{ path, text }] | [{ path, binary: ArrayBuffer }] | [{ path, delete: true }]
 */
export const SKIP_PREFIX = '[CI Skip] ';

/** Did the request ask to go live right away? (admin "Publish immediately" toggle) */
export const wantsPublish = (request) => request?.headers?.get('x-myshelf-publish') === '1';

export async function commitFiles(env, message, changes, { publish = false } = {}) {
  // Unless publishing, tag the commit so Cloudflare Pages skips the build (saves builds;
  // everything goes live together with the next publish).
  if (!publish) message = SKIP_PREFIX + message;
  const { repo, branch } = cfg(env);
  const ref = await ghJson(env, `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const parentSha = ref.object.sha;
  const parent = await ghJson(env, `/repos/${repo}/git/commits/${parentSha}`);

  const tree = [];
  for (const c of changes) {
    if (c.delete) {
      tree.push({ path: c.path, mode: '100644', type: 'blob', sha: null });
      continue;
    }
    const blobBody = c.binary
      ? { content: arrayBufferToBase64(c.binary), encoding: 'base64' }
      : { content: c.text, encoding: 'utf-8' };
    const blob = await ghJson(env, `/repos/${repo}/git/blobs`, { method: 'POST', body: JSON.stringify(blobBody) });
    tree.push({ path: c.path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const newTree = await ghJson(env, `/repos/${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: parent.tree.sha, tree }),
  });
  const commit = await ghJson(env, `/repos/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message, tree: newTree.sha, parents: [parentSha] }),
  });
  await ghJson(env, `/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  });
  return commit.sha;
}

/** List file names in a repo directory. */
export async function listDir(env, path) {
  const { repo, branch } = cfg(env);
  const res = await gh(env, `/repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new HttpError(502, `GitHub list ${path} failed (${res.status})`);
  const data = await res.json();
  return Array.isArray(data) ? data.filter((f) => f.type === 'file').map((f) => f.name) : [];
}

/** Commits on the branch since `base` (the commit the live site was built from). */
export async function commitsSince(env, base) {
  const { repo, branch } = cfg(env);
  const data = await ghJson(env, `/repos/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(branch)}`);
  return { aheadBy: data.ahead_by || 0, commits: (data.commits || []).map((c) => c.commit?.message?.split('\n')[0] || '') };
}
