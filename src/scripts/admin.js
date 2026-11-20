// Admin UI: search external databases, add/edit/delete items, manage collections.
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
  $('#creator-label').textContent = (TYPES[form.type.value] || TYPES.book).creator;
}

function openEditor(item, slug = null) {
  state.editing = { slug, source: item.source || {}, extra: item };
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
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';
  try {
    const res = await api('save', { method: 'POST', body: { slug, item, body: form.body.value } });
    state.pending.saved[res.slug] = { slug: res.slug, ...res.item };
    state.pending.deleted.delete(res.slug);
    renderLibrary();
    editor.close();
    toast(`Saved “${item.title}”. It'll show up on your shelf in about a minute.`);
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
  } catch {
    state.library = [];
  }
  renderLibrary();
}
function libraryItems() {
  const map = new Map(state.library.map((i) => [i.slug, i]));
  for (const [slug, it] of Object.entries(state.pending.saved)) map.set(slug, { ...it, pending: true });
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
          <a class="btn ghost small" href="/item/${esc(i.slug)}/" target="_blank">View</a>
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
    await api('delete', { method: 'POST', body: { slug: del.dataset.del } });
    state.pending.deleted.add(del.dataset.del);
    delete state.pending.saved[del.dataset.del];
    renderLibrary();
    toast('Deleted. The site will update in about a minute.');
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
  });
}
$('#col-list').addEventListener('click', (e) => {
  const row = e.target.closest('.col-row');
  if (!row) return;
  syncCollectionsFromInputs();
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
    const { collections } = await api('collections', {
      method: 'POST',
      body: { collections: state.collections.filter((c) => c.name.trim()) },
    });
    state.collections = collections;
    renderCollections();
    toast('Collections saved. Your shelves will update in about a minute.');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

// ───────── deep links: /admin/#edit=slug ─────────
function handleHash() {
  const m = location.hash.match(/^#edit=([a-z0-9-]+)$/);
  if (m) editSlug(m[1]);
}
window.addEventListener('hashchange', handleHash);

boot();
