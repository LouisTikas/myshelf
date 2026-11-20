// Admin UI: search external databases, add/edit/delete items, manage collections.
import { marked } from 'marked';
import { SORTS, sortShelf } from '../lib/sorting.js';
import { openArrange } from './arrange.js';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const root = $('#admin');
const TYPES = JSON.parse(root.dataset.types);
const TOKEN_KEY = 'myshelf_token';

const state = {
  type: 'book',
  results: [],
  library: [],
  collections: [],
  editing: null, // { slug?, source? }
  pending: { saved: {}, deleted: new Set() }, // changes not yet in the built site
  lastSha: null,      // most recent commit we made; the site is up to date once it's built
  previewSlug: null,
};

// ───────── helpers ─────────
function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
function setToken(t) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {}
}
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: { authorization: `Bearer ${getToken()}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 401) { showLogin('Your token was rejected.'); throw new Error('Unauthorized'); }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let toastTimer;
function toast(msg, kind = 'ok') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast ${kind}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), kind === 'error' ? 7000 : 4500);
}
function coverThumb(item, size = 64) {
  const t = TYPES[item.type] || TYPES.book;
  const w = Math.round(size * t.aspect);
  const ph = `<span class="thumb-ph" style="width:${w}px;height:${size}px;background:${t.color}">${esc((item.title || '?').slice(0, 1))}</span>`;
  if (!item.cover) return ph;
  return `<span class="thumb-wrap"><img class="thumb" src="${esc(item.cover)}" alt="" style="height:${size}px" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(this.nextElementSibling.content.cloneNode(true))"><template>${ph}</template></span>`;
}
const SOURCE_NAMES = { openlibrary: 'Open Library', googlebooks: 'Google Books', tmdb: 'TMDB', spotify: 'Spotify', musicbrainz: 'MusicBrainz', igdb: 'IGDB', bgg: 'BoardGameGeek', manual: 'Manual' };

// ───────── auth ─────────
function showLogin(error) {
  $('#app').hidden = true;
  $('#login').hidden = false;
  const err = $('#login-error');
  err.hidden = !error;
  err.textContent = error || '';
}
async function boot() {
  if (!getToken()) return showLogin();
  try {
    const { configured } = await api('ping');
    $('#login').hidden = true;
    $('#app').hidden = false;
    renderConfig(configured);
    await Promise.all([loadLibrary(), loadCollections()]);
    handleHash();
  } catch (e) {
    if (e.message !== 'Unauthorized') showLogin(e.message.includes('Failed to fetch') ? 'Could not reach the API.' : e.message);
  }
}
function renderConfig(c) {
  const missing = [];
  if (!c.github) missing.push('GitHub');
  if (!c.tmdb) missing.push('TMDB');
  if (!c.igdb) missing.push('IGDB');
  if (!c.bgg) missing.push('BGG');
  if (!c.spotify) missing.push('Spotify (using MusicBrainz)');
  $('#config-status').innerHTML = missing.length
    ? `<span class="warn" title="Set these in Cloudflare Pages → Settings → Variables">Missing keys: ${esc(missing.join(', '))}</span>`
    : '<span class="okay">All sources connected</span>';
}
$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  setToken($('#login-token').value.trim());
  boot();
});
$('#logout').addEventListener('click', () => { setToken(''); showLogin(); });

// ───────── tabs ─────────
function showTab(name) {
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $$('.tabpanel').forEach((p) => (p.hidden = p.dataset.panel !== name));
}
$$('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

// ───────── search ─────────
$$('.type-btn').forEach((b) =>
  b.addEventListener('click', () => {
    state.type = b.dataset.type;
    $$('.type-btn').forEach((x) => x.classList.toggle('active', x === b));
    $('#search-q').placeholder = `Search ${TYPES[state.type].plural.toLowerCase()}…`;
    $('#results').innerHTML = '';
    $('#search-msg').textContent = '';
    $('#search-q').focus();
  }),
);

$('#search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#search-q').value.trim();
  if (q.length < 2) return;
  $('#search-msg').textContent = 'Searching…';
  $('#results').innerHTML = '';
  try {
    const { results } = await api(`search?type=${state.type}&q=${encodeURIComponent(q)}`);
    state.results = results;
    $('#search-msg').textContent = results.length ? `${results.length} results — pick one to add it.` : 'No matches. Try different words, or add it manually.';
    $('#results').innerHTML = results
      .map((r, i) => `
        <button type="button" class="result" data-i="${i}">
          ${coverThumb(r, 96)}
          <span class="result-text">
            <strong>${esc(r.title)}</strong>
            <span>${esc(r.creator)}${r.creator && r.year ? ' · ' : ''}${esc(r.year)}</span>
            ${r.details?.kind ? `<span class="muted small">${esc(r.details.kind)}</span>` : ''}
            <span class="src">${esc(SOURCE_NAMES[r.source] || r.source)}</span>
          </span>
        </button>`)
      .join('');
  } catch (err) {
    $('#search-msg').textContent = '';
    toast(err.message, 'error');
  }
});

$('#results').addEventListener('click', async (e) => {
  const btn = e.target.closest('.result');
  if (!btn) return;
  const r = { ...state.results[Number(btn.dataset.i)] };
  btn.classList.add('loading');
  try {
    if (r.source === 'tmdb' || r.source === 'openlibrary') {
      const { details } = await api(`details?type=${r.type}&source=${r.source}&id=${encodeURIComponent(r.sourceId)}`);
      Object.assign(r, {
        ...details,
        creator: details.creator || r.creator,
        description: details.description || r.description,
        genres: details.genres?.length ? details.genres : r.genres,
        details: { ...r.details, ...(details.details || {}) },
      });
    }
  } catch (err) {
    console.warn(err);
  } finally {
    btn.classList.remove('loading');
  }
  openEditor({
    title: r.title, type: r.type, creator: r.creator, year: r.year, cover: r.cover,
    status: 'finished', description: r.description, genres: r.genres, details: r.details,
    dateFinished: new Date().toISOString().slice(0, 10),
    source: { name: SOURCE_NAMES[r.source] || r.source, id: r.sourceId, url: r.url },
  });
});

$('#manual-add').addEventListener('click', () =>
  openEditor({ type: state.type, status: 'finished', title: $('#search-q').value.trim(), source: { name: 'Manual' } }),
);

// ───────── editor ─────────
const editor = $('#editor');
const form = $('#editor-form');

function detailsToText(details = {}) {
  return Object.entries(details)
    .filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join('\n');
}
function textToDetails(text) {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/^\s*([\w-]+)\s*:\s*(.+)$/);
    if (!m) continue;
    const [, k, v] = m;
    const listy = ['platforms', 'cast', 'developers', 'publishers'].includes(k);
    out[k] = listy ? v.split(',').map((s) => s.trim()).filter(Boolean) : /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : v.trim();
  }
  return out;
}
function renderCoverPreview() {
  const item = { type: form.type.value, title: form.title.value, cover: form.cover.value.trim() };
  $('#cover-preview').innerHTML = coverThumb(item, 240);
}
function renderCollectionChecks(selected = []) {
  $('#editor-collections').innerHTML = state.collections.length
    ? state.collections
        .map((c) => `<label class="check"><input type="checkbox" value="${esc(c.slug)}" ${selected.includes(c.slug) ? 'checked' : ''}> ${esc(c.name)}</label>`)
        .join('')
    : '<span class="muted small">No collections yet — create some in the Collections tab.</span>';
}
function updateCreatorLabel() {
  const t = TYPES[form.type.value] || TYPES.book;
  $('#creator-label').textContent = t.creator;
  // Status wording matches the media type (e.g. music: Listened / On repeat / Want to listen / Not for me).
  const words = { finished: t.verb, 'in-progress': t.doing, want: t.want, abandoned: t.dropped || 'Abandoned' };
  for (const opt of form.status.options) opt.textContent = words[opt.value] || opt.textContent;
}

function openEditor(item, slug = null) {
  state.editing = { slug, source: item.source || {}, extra: item };
  const sb = $('#editor-save');
  delete sb.dataset.confirmDup;
  sb.classList.remove('warn-btn');
  sb.textContent = 'Save to shelf';
  $('#editor-title').textContent = slug ? `Edit: ${item.title}` : `Add ${TYPES[item.type]?.label || 'item'}`;
  form.title.value = item.title || '';
  form.creator.value = item.creator || '';
  form.year.value = item.year || '';
  form.type.value = item.type || 'book';
  form.status.value = item.status || 'finished';
  form.rating.value = item.rating == null ? '' : String(item.rating);
  form.dateStarted.value = item.dateStarted || '';
  form.dateFinished.value = item.status === 'want' ? '' : item.dateFinished || '';
  form.cover.value = item.cover || '';
  form.tags.value = (item.tags || []).join(', ');
  form.genres.value = (item.genres || []).join(', ');
  form.description.value = item.description || '';
  form.details.value = detailsToText(item.details);
  form.body.value = item.body || '';
  const src = item.source || {};
  $('#editor-source').innerHTML = src.url ? `From <a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.name)}</a>` : esc(src.name || '');
  renderCollectionChecks(item.collections || []);
  updateCreatorLabel();
  renderCoverPreview();
  editor.showModal();
  form.title.focus();
}

form.cover.addEventListener('input', renderCoverPreview);
form.type.addEventListener('change', () => { updateCreatorLabel(); renderCoverPreview(); });
form.status.addEventListener('change', () => {
  const today = new Date().toISOString().slice(0, 10);
  if (form.status.value === 'finished' && !form.dateFinished.value) form.dateFinished.value = today;
  if (form.status.value === 'in-progress' && !form.dateStarted.value) form.dateStarted.value = today;
});
$$('[data-close]', editor).forEach((b) => b.addEventListener('click', () => editor.close()));
$('#add-entry').addEventListener('click', () => {
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const ta = form.body;
  ta.value = `${ta.value.trimEnd()}${ta.value.trim() ? '\n\n' : ''}**${date}** — `;
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const saveBtn = $('#editor-save');
  const { slug, source, extra } = state.editing;
  const item = {
    ...(slug ? extra : {}), // keep any extra frontmatter fields you added by hand
    title: form.title.value.trim(),
    type: form.type.value,
    creator: form.creator.value.trim(),
    year: form.year.value.trim(),
    cover: form.cover.value.trim(),
    status: form.status.value,
    rating: form.rating.value === '' ? null : Number(form.rating.value),
    dateStarted: form.dateStarted.value || null,
    dateFinished: form.dateFinished.value || null,
    collections: $$('#editor-collections input:checked').map((i) => i.value),
    tags: form.tags.value,
    genres: form.genres.value,
    description: form.description.value.trim(),
    details: textToDetails(form.details.value),
    source,
  };
  delete item.body;
  if (!slug && !saveBtn.dataset.confirmDup) {
    const norm = (x) => String(x || '').trim().toLowerCase();
    const dup = libraryItems().find((i) =>
      i.type === item.type && (
        (source?.id && i.source?.id && String(i.source.id) === String(source.id) && i.source?.name === source.name) ||
        (norm(i.title) === norm(item.title) && norm(i.year) === norm(item.year))
      ));
    if (dup) {
      saveBtn.dataset.confirmDup = '1';
      saveBtn.textContent = 'Already on your shelf — save anyway?';
      saveBtn.classList.add('warn-btn');
      return;
    }
  }
  delete saveBtn.dataset.confirmDup;
  saveBtn.classList.remove('warn-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';
  try {
    const res = await api('save', { method: 'POST', body: { slug, item, body: form.body.value } });
    state.pending.saved[res.slug] = { slug: res.slug, ...res.item, body: form.body.value, built: false };
    state.pending.deleted.delete(res.slug);
    renderLibrary();
    editor.close();
    watchPublish(res.sha);
    showPreview(res.slug);
    if (location.hash) history.replaceState(null, '', location.pathname);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save to shelf';
  }
});

// ───────── library ─────────
async function loadLibrary() {
  try {
    const res = await fetch('/library.json', { cache: 'no-store' });
    const data = await res.json();
    state.library = data.items || [];
    state.builtCommit = data.commit || '';
  } catch {
    state.library = [];
  }
  renderLibrary();
}
function libraryItems() {
  const map = new Map(state.library.map((i) => [i.slug, i]));
  for (const [slug, it] of Object.entries(state.pending.saved)) if (!it.built) map.set(slug, { ...it, pending: true });
  for (const slug of state.pending.deleted) map.delete(slug);
  return [...map.values()];
}
function renderLibrary() {
  const q = $('#lib-filter').value.trim().toLowerCase();
  const type = $('#lib-type').value;
  const list = libraryItems().filter(
    (i) => (!type || i.type === type) && (!q || `${i.title} ${i.creator}`.toLowerCase().includes(q)),
  );
  $('#lib-list').innerHTML = list.length
    ? list
        .map((i) => `
      <li class="lib-row">
        ${coverThumb(i, 56)}
        <span class="lib-text">
          <strong>${esc(i.title)}</strong>
          <span class="muted small">${esc(TYPES[i.type]?.label)} · ${esc(i.creator || '')} ${i.pending ? '<span class="pill">pending rebuild</span>' : ''}</span>
        </span>
        <span class="lib-actions">
          ${i.pending
            ? `<button class="btn ghost small" data-preview="${esc(i.slug)}">Preview</button>`
            : `<a class="btn ghost small" href="/item/${esc(i.slug)}/" target="_blank">View</a>`}
          <button class="btn ghost small" data-edit="${esc(i.slug)}">Edit</button>
          <button class="btn ghost small danger" data-del="${esc(i.slug)}">Delete</button>
        </span>
      </li>`)
        .join('')
    : '<li class="muted">Nothing matches.</li>';
}
$('#lib-filter').addEventListener('input', renderLibrary);
$('#lib-type').addEventListener('change', renderLibrary);

async function editSlug(slug) {
  try {
    const { item, body } = await api(`item?slug=${encodeURIComponent(slug)}`);
    openEditor({ ...item, body }, slug);
  } catch (err) {
    toast(err.message, 'error');
  }
}
$('#lib-list').addEventListener('click', async (e) => {
  const prev = e.target.closest('[data-preview]');
  if (prev) return showPreview(prev.dataset.preview);
  const edit = e.target.closest('[data-edit]');
  if (edit) return editSlug(edit.dataset.edit);
  const del = e.target.closest('[data-del]');
  if (!del) return;
  if (!del.classList.contains('confirm')) {
    del.classList.add('confirm');
    del.textContent = 'Really delete?';
    setTimeout(() => { del.classList.remove('confirm'); del.textContent = 'Delete'; }, 4000);
    return;
  }
  del.disabled = true;
  try {
    const res = await api('delete', { method: 'POST', body: { slug: del.dataset.del } });
    state.pending.deleted.add(del.dataset.del);
    delete state.pending.saved[del.dataset.del];
    renderLibrary();
    watchPublish(res.sha);
    toast('Deleted. Your site is updating.');
  } catch (err) {
    del.disabled = false;
    toast(err.message, 'error');
  }
});

// ───────── collections ─────────
async function loadCollections() {
  try {
    const { collections } = await api('collections');
    state.collections = collections;
  } catch (err) {
    // Fall back to the built copy if GitHub isn't configured yet.
    try { state.collections = (await (await fetch('/library.json')).json()).collections || []; } catch {}
    toast(err.message, 'error');
  }
  renderCollections();
}
function renderCollections() {
  $('#col-list').innerHTML = state.collections
    .map((c, i) => `
    <li class="col-row" data-i="${i}">
      <span class="col-move">
        <button class="btn ghost small" data-up ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
        <button class="btn ghost small" data-down ${i === state.collections.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
      </span>
      <input class="col-name" value="${esc(c.name)}" placeholder="Collection name" />
      <input class="col-desc" value="${esc(c.description)}" placeholder="Description (optional)" />
      <span class="col-sort">
        <select class="col-sort-select" aria-label="Sort order">
          ${Object.entries(SORTS).map(([k, label]) => `<option value="${k}" ${(c.sort || 'newest') === k ? 'selected' : ''}>${esc(label)}</option>`).join('')}
        </select>
        ${(c.sort || 'newest') === 'custom' ? `<button class="btn ghost small" data-arrange ${c.slug ? '' : 'disabled title="Save the collection first"'}>Arrange</button>` : ''}
      </span>
      <span class="muted small col-slug">${c.slug ? '/shelf/' + esc(c.slug) : 'new'}</span>
      <button class="btn ghost small danger" data-remove aria-label="Remove">✕</button>
    </li>`)
    .join('') || '<li class="muted">No collections yet.</li>';
}
function syncCollectionsFromInputs() {
  $$('.col-row').forEach((row) => {
    const c = state.collections[Number(row.dataset.i)];
    c.name = $('.col-name', row).value;
    c.description = $('.col-desc', row).value;
    c.sort = $('.col-sort-select', row).value;
  });
}
$('#col-list').addEventListener('change', (e) => {
  if (!e.target.matches('.col-sort-select')) return;
  syncCollectionsFromInputs();
  renderCollections(); // show/hide the Arrange button
});
$('#col-list').addEventListener('click', (e) => {
  const row = e.target.closest('.col-row');
  if (!row) return;
  syncCollectionsFromInputs();
  if (e.target.closest('[data-arrange]')) return openArrangeFor(Number(row.dataset.i));
  const i = Number(row.dataset.i);
  const list = state.collections;
  if (e.target.closest('[data-up]') && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
  else if (e.target.closest('[data-down]') && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
  else if (e.target.closest('[data-remove]')) list.splice(i, 1);
  else return;
  renderCollections();
});
$('#col-add').addEventListener('click', () => {
  syncCollectionsFromInputs();
  state.collections.push({ slug: '', name: '', description: '' });
  renderCollections();
  $$('.col-name').at(-1)?.focus();
});
$('#col-save').addEventListener('click', async () => {
  syncCollectionsFromInputs();
  const btn = $('#col-save');
  btn.disabled = true;
  try {
    const { collections, sha } = await api('collections', {
      method: 'POST',
      body: { collections: state.collections.filter((c) => c.name.trim()) },
    });
    state.collections = collections;
    renderCollections();
    watchPublish(sha);
    toast('Collections saved. Your shelves are updating.');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

// ───────── arrange a collection (shared drag & drop dialog) ─────────
function openArrangeFor(index) {
  const c = state.collections[index];
  // Start from what the shelf shows now; new items (not yet arranged) come first.
  const entries = libraryItems().filter((i) => (i.collections || []).includes(c.slug)).map((i) => ({ id: i.slug, data: i }));
  openArrange({
    title: c.name,
    items: sortShelf(entries, c).map((e) => e.data),
    onSave: async (order) => {
      c.sort = 'custom';
      c.order = order;
      const { collections, sha } = await api('collections', { method: 'POST', body: { collections: state.collections.filter((x) => x.name.trim()) } });
      state.collections = collections;
      renderCollections();
      watchPublish(sha);
      toast(`Saved the order for “${c.name}”. Your shelf is updating.`);
    },
  });
}

// ───────── live preview ─────────
const STATUS_WORDS = (type, status) => {
  const t = TYPES[type] || TYPES.book;
  return { want: t.want, 'in-progress': t.doing, finished: t.verb, abandoned: t.dropped || 'Abandoned' }[status] || status;
};
const DETAIL_NAMES = {
  pages: 'Pages', isbn: 'ISBN', publisher: 'Publisher', runtime: 'Runtime', seasons: 'Seasons', episodes: 'Episodes',
  network: 'Network', tracks: 'Tracks', kind: 'Format', platforms: 'Platforms', developers: 'Developers',
  publishers: 'Publishers', players: 'Players', playtime: 'Play time', weight: 'Complexity', bggRank: 'BGG rank', cast: 'Cast',
};
const fmtDate = (d) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');
const starText = (r) => (r == null ? '' : '★'.repeat(Math.floor(r)) + (r % 1 >= 0.5 ? '½' : ''));

function coverMarkup(item, height) {
  const t = TYPES[item.type] || TYPES.book;
  const ph = `<span class="placeholder"><span class="ph-title">${esc(item.title)}</span>${item.creator ? `<span class="ph-creator">${esc(item.creator)}</span>` : ''}</span>`;
  const img = item.cover ? `<img src="${esc(item.cover)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  return `<div class="cover" data-type="${esc(item.type)}" style="--h:${height}px;--pw:${Math.round(height * t.aspect)}px;--tc:${t.color}">${img}${ph}</div>`;
}

function showPreview(slug) {
  const it = state.pending.saved[slug];
  if (!it) return;
  state.previewSlug = slug;
  const t = TYPES[it.type] || TYPES.book;
  const shelves = state.collections.filter((c) => (it.collections || []).includes(c.slug));
  const details = Object.entries(it.details || {})
    .map(([k, v]) => [DETAIL_NAMES[k] || k, Array.isArray(v) ? v.join(', ') : k === 'runtime' || k === 'playtime' ? `${v} min` : v])
    .filter(([, v]) => v !== '' && v != null);
  const body = (it.body || '').trim();
  $('#preview-body').innerHTML = `
    <article class="item-page preview-page">
      <div class="item-cover">${coverMarkup(it, it.type === 'music' || it.type === 'boardgame' ? 280 : 340)}</div>
      <div class="item-info">
        <p class="eyebrow">${esc(t.label)}${it.year ? ' · ' + esc(it.year) : ''}</p>
        <h1>${esc(it.title)}</h1>
        ${it.creator ? `<p class="creator">${esc(t.creator)}: ${esc(it.creator)}</p>` : ''}
        <div class="item-meta">
          <span class="status status-${esc(it.status)}">${esc(STATUS_WORDS(it.type, it.status))}</span>
          ${it.rating != null ? `<span class="rating">${starText(it.rating)}</span>` : ''}
        </div>
        <dl class="facts">
          ${it.dateStarted ? `<dt>Started</dt><dd>${fmtDate(it.dateStarted)}</dd>` : ''}
          ${it.dateFinished ? `<dt>Finished</dt><dd>${fmtDate(it.dateFinished)}</dd>` : ''}
          ${details.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}
          ${(it.genres || []).length ? `<dt>Genres</dt><dd>${esc(it.genres.join(', '))}</dd>` : ''}
        </dl>
        ${shelves.length || (it.tags || []).length ? `<div class="chips">
          ${shelves.map((s) => `<span class="chip">${esc(s.name)}</span>`).join('')}
          ${(it.tags || []).map((g) => `<span class="chip chip-tag">#${esc(g)}</span>`).join('')}
        </div>` : ''}
        ${body ? `<section class="journal-body prose"><h2>My notes</h2>${marked.parse(body)}</section>` : ''}
        ${it.description ? `<section class="synopsis"><h2>About</h2><p>${esc(it.description)}</p></section>` : ''}
      </div>
    </article>`;
  renderPublishStatus();
  const dlg = $('#preview');
  if (!dlg.open) dlg.showModal();
}

$('[data-close-preview]').addEventListener('click', () => $('#preview').close());
$('#preview-edit').addEventListener('click', () => {
  $('#preview').close();
  if (state.previewSlug) editSlug(state.previewSlug);
});
$('#preview-another').addEventListener('click', () => {
  $('#preview').close();
  showTab('add');
  $('#search-q').value = '';
  $('#results').innerHTML = '';
  $('#search-msg').textContent = '';
  $('#search-q').focus();
});

// ───────── publish watcher: polls the built site until our latest commit is live ─────────
let publishTimer = null;
let publishStarted = 0;
const PUBLISH_TIMEOUT = 6 * 60 * 1000;

function publishState() {
  if (!state.lastSha) return 'idle';
  if (state.builtCommit && state.builtCommit === state.lastSha) return 'live';
  if (Date.now() - publishStarted > PUBLISH_TIMEOUT) return 'slow';
  return 'building';
}

function renderPublishStatus() {
  const st = publishState();
  const secs = Math.round((Date.now() - publishStarted) / 1000);
  const slug = state.previewSlug;
  const live = slug && !state.pending.deleted.has(slug);
  const text = {
    idle: '',
    building: `<span class="spinner"></span> Publishing to your site… ${secs}s`,
    live: `✓ Live on your site${live ? ` — <a href="/item/${esc(slug)}/" target="_blank">view page</a>` : ''}`,
    slow: 'Still publishing — this is taking longer than usual. Check Deployments in Cloudflare if it doesn’t appear soon.',
  }[st];
  const status = $('#publish-status');
  status.innerHTML = text;
  status.className = `publish-status ${st}`;
  const pill = $('#publish-pill');
  pill.hidden = st === 'idle' || $('#preview').open;
  pill.className = `publish-pill ${st}`;
  pill.innerHTML = st === 'live' ? '✓ Site updated' : st === 'slow' ? 'Still publishing…' : `<span class="spinner"></span> Publishing… ${secs}s`;
}

async function checkPublished() {
  try {
    const data = await (await fetch('/library.json', { cache: 'no-store' })).json();
    state.builtCommit = data.commit || '';
    if (state.builtCommit === state.lastSha) {
      state.library = data.items || [];
      // Everything we saved is now in the built site. Keep saved copies only for previews.
      for (const k of Object.keys(state.pending.saved)) state.pending.saved[k].built = true;
      state.pending.deleted = new Set();
      renderLibrary();
    }
  } catch {}
  renderPublishStatus();
  const st = publishState();
  if (st === 'building') publishTimer = setTimeout(checkPublished, 8000);
  else if (st === 'live') setTimeout(() => { if (publishState() === 'live') $('#publish-pill').hidden = true; }, 6000);
}

function watchPublish(sha) {
  if (!sha) return;
  state.lastSha = sha;
  publishStarted = Date.now();
  clearTimeout(publishTimer);
  renderPublishStatus();
  publishTimer = setTimeout(checkPublished, 15000);
}
// keep the seconds counter ticking
setInterval(() => { if (publishState() === 'building') renderPublishStatus(); }, 1000);
$('#preview').addEventListener('close', renderPublishStatus);

// ───────── deep links: /admin/#edit=slug ─────────
function handleHash() {
  const m = location.hash.match(/^#edit=([a-z0-9-]+)$/);
  if (m) editSlug(m[1]);
}
window.addEventListener('hashchange', handleHash);

boot();
