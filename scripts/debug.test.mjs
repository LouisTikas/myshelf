// Debug log, health check and automatic updates (run: npm test). GitHub is mocked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeEnv } from './fake-cloudflare.mjs';
import { logEvent, listLogs, clearLogs, scrub } from '../server/logs.js';
import { handler, HttpError, json } from '../server/util.js';
import { health } from '../server/health.js';
import { runAutoUpdate, getAutoUpdate, setAutoUpdate } from '../server/updates.js';
import { VERSION } from '../server/version.js';

test('scrub hides the site’s secrets, bearer tokens and keys in URLs', () => {
  const env = { GITHUB_TOKEN: 'github_pat_abcdef123456', TMDB_TOKEN: 'short', DB: {} };
  const out = scrub('token github_pat_abcdef123456 / Bearer abc.def.ghi.jkl / https://x.test/v1?q=dune&key=AIzaSecret123&x=1', env);
  assert.doesNotMatch(out, /github_pat_abcdef123456|abc\.def\.ghi|AIzaSecret123/);
  assert.match(out, /key=\[hidden\]&x=1/);
});

test('debug log keeps entries newest first, trims old ones, and clears', async () => {
  const env = fakeEnv();
  await logEvent(env, { level: 'warn', source: 'test', message: 'first' });
  await logEvent(env, { source: 'test', message: new Error('second') });
  let logs = await listLogs(env);
  assert.equal(logs.length, 2);
  assert.equal(logs[0].message, 'second');
  assert.equal(logs[0].level, 'error');
  assert.match(logs[0].detail, /Error: second/);
  assert.equal(logs[1].level, 'warn');
  for (let i = 0; i < 310; i++) await logEvent(env, { message: `m${i}` });
  logs = await listLogs(env);
  assert.equal(logs.length, 300);
  assert.equal(logs[0].message, 'm309');
  await clearLogs(env);
  assert.equal((await listLogs(env)).length, 0);
});

test('logging never throws, even without a database', async () => {
  await logEvent({}, { message: 'nowhere to go' });
  await logEvent({ DB: { prepare() { throw new Error('boom'); }, batch() { throw new Error('boom'); } } }, { message: 'x' });
});

test('API errors: 5xx go in the debug log, 4xx don’t', async () => {
  const env = fakeEnv();
  const request = new Request('https://shelf.test/api/save', { method: 'POST' });
  const boom = handler(async () => { throw new Error('D1 exploded'); });
  const nope = handler(async () => { throw new HttpError(400, 'Every collection needs a name'); });
  const ok = handler(async () => json({ ok: true }));
  assert.equal((await boom({ env, request })).status, 500);
  assert.equal((await nope({ env, request })).status, 400);
  assert.equal((await ok({ env, request })).status, 200);
  const logs = await listLogs(env);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].source, 'POST /api/save');
  assert.equal(logs[0].message, 'D1 exploded');
});

test('health check: yes/no answers, no secrets', async () => {
  const good = await health({ ...fakeEnv(), ADMIN_TOKEN: 'super-secret-admin-token' });
  assert.equal(good.ok, true);
  assert.equal(good.version, VERSION);
  assert.doesNotMatch(JSON.stringify(good), /super-secret-admin-token/);
  const bad = await health({});
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.checks.map((c) => c.ok), [false, false, false]);
});

// ── automatic updates ──
function mockGitHub({ upstreamVersion = '9.9.9', ahead = 2, merge = 200 } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    calls.push({ url, method: init.method || 'GET' });
    const ok = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/repos/me/myshelf')) return ok({ fork: true, default_branch: 'main', parent: { full_name: 'lexjudex/myshelf', default_branch: 'main' } });
    if (url.includes('/compare/')) return ok({ ahead_by: ahead, behind_by: 0, commits: Array.from({ length: ahead }, (_, i) => ({ parents: [{}], commit: { message: `change ${i}`, committer: { date: '2026-11-26T00:00:00Z' } } })) });
    if (url.includes('/contents/package.json')) return ok({ content: btoa(JSON.stringify({ version: upstreamVersion })) });
    if (url.endsWith('/merge-upstream')) return ok(merge === 200 ? { message: 'Merged' } : { message: 'conflict' }, merge);
    return new Response('not mocked', { status: 599 });
  };
  return calls;
}
const ghEnv = () => ({ ...fakeEnv(), GITHUB_TOKEN: 'github_pat_testtoken123', GITHUB_REPO: 'me/myshelf' });

test('auto-update: on by default, installs a new version and logs it', async () => {
  const env = ghEnv();
  assert.equal((await getAutoUpdate(env)).enabled, true);
  const calls = mockGitHub();
  const r = await runAutoUpdate(env);
  assert.equal(r.result, 'updated');
  assert.ok(calls.some((c) => c.url.endsWith('/merge-upstream') && c.method === 'POST'));
  const { last } = await getAutoUpdate(env);
  assert.equal(last.result, 'updated');
  const logs = await listLogs(env);
  assert.equal(logs[0].level, 'info');
  assert.match(logs[0].message, /to 9\.9\.9/);
});

test('auto-update: waits for a new version number, not every commit', async () => {
  const env = ghEnv();
  const calls = mockGitHub({ upstreamVersion: VERSION });
  const r = await runAutoUpdate(env);
  assert.equal(r.result, 'waiting');
  assert.ok(!calls.some((c) => c.url.endsWith('/merge-upstream')));
  assert.equal((await listLogs(env)).length, 0); // quiet: nothing worth a log line
});

test('auto-update: turned off does nothing', async () => {
  const env = ghEnv();
  await setAutoUpdate(env, false);
  const calls = mockGitHub();
  const r = await runAutoUpdate(env);
  assert.equal(r.result, 'off');
  assert.equal(calls.length, 0);
});

test('auto-update: clashing edits and missing tokens are logged, not thrown', async () => {
  const env = ghEnv();
  mockGitHub({ merge: 409 });
  const r = await runAutoUpdate(env);
  assert.equal(r.result, 'failed');
  assert.match(r.message, /clash/);
  assert.equal((await listLogs(env))[0].level, 'warn');

  const noToken = { ...fakeEnv(), GITHUB_REPO: 'me/myshelf' };
  const r2 = await runAutoUpdate(noToken);
  assert.equal(r2.result, 'no-token');
  assert.equal((await listLogs(noToken)).length, 0); // shown in Settings → Updates, not logged daily
  assert.match((await getAutoUpdate(noToken)).last.message, /GitHub token/);
});
