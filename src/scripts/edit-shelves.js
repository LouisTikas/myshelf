// Pencil buttons on collection shelves: only visible in a browser that's signed in to the admin.
// Clicking opens the arrange dialog; saving updates the shelf instantly and commits the new order.
import { sortShelf, inShelf } from '../lib/sorting.js';

const TOKEN_KEY = 'myshelf_token';
const token = (() => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } })();

const publishNowOn = () => { try { return localStorage.getItem('myshelf_publish_now') === '1'; } catch { return false; } };
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(method !== 'GET' && path !== 'publish' && publishNowOn() ? { 'x-myshelf-publish': '1' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 401) throw new Error('Your admin sign-in has expired. Sign in again on the Manage page.');
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Put the shelf's covers in the new order right away (the rebuilt site follows in ~1 minute).
function reorderOnPage(selector, order) {
  const pos = new Map(order.map((s, i) => [s, i]));
  document.querySelectorAll(selector).forEach((shelf) => {
    const slots = [...shelf.querySelectorAll('.shelf-slot')];
    const key = (slot) => {
      const href = slot.querySelector('.book3d')?.getAttribute('href') || '';
      const s = href.replace(/^\/item\//, '').replace(/\/$/, '');
      return pos.has(s) ? pos.get(s) : Infinity;
    };
    slots.sort((a, b) => key(a) - key(b)).forEach((slot) => shelf.appendChild(slot));
    shelf.scrollLeft = 0;
    shelf.dispatchEvent(new CustomEvent('shelf:reorder'));
  });
}

function savedToast(mod, name, published) {
  mod.toast(published ? `Saved “${name}”. Your public shelf updates in about a minute.` : `Saved “${name}”. Publish when you’re ready to update the public site.`);
  if (!published) updatePublishPill();
}

// Small floating "N unpublished · Publish" pill on public pages, only when signed in.
let pill;
async function updatePublishPill() {
  try {
    const lib = await fetch('/library.json', { cache: 'no-store' }).then((r) => r.json());
    if (!lib.commit) return;
    const { pending } = await api(`publish?since=${encodeURIComponent(lib.commit)}`);
    if (!pill) {
      pill = document.createElement('div');
      pill.className = 'pub-pill';
      pill.innerHTML = '<span class="pub-text"></span><button type="button">Publish</button>';
      document.body.appendChild(pill);
      pill.querySelector('button').addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        try {
          await api('publish', { method: 'POST', body: {} });
          pill.querySelector('.pub-text').textContent = 'Publishing — live in about a minute';
          pill.querySelector('button').hidden = true;
        } catch (err) {
          e.currentTarget.disabled = false;
          (await import('./arrange.js')).toast(err.message, 'error');
        }
      });
    }
    pill.hidden = !pending;
    pill.querySelector('.pub-text').textContent = `${pending} unpublished change${pending === 1 ? '' : 's'}`;
  } catch { /* not important */ }
}

// Open the editor for a collection shelf.
async function editCollection(mod, lib, slug) {
  const live = await api('collections');
  const collections = live.collections;
  const c = collections.find((x) => x.slug === slug);
  if (!c) throw new Error('That collection was not found.');
  // Start from exactly what the shelf shows now (whatever its sort order is).
  const entries = (lib.items || []).filter((i) => inShelf(i, c)).map((i) => ({ id: i.slug, data: i }));
  mod.openArrange({
    title: c.name,
    items: sortShelf(entries, c).map((e) => e.data),
    onSave: async (order) => {
      c.sort = 'custom';
      c.order = order;
      const res = await api('collections', { method: 'POST', body: { collections } });
      reorderOnPage(`.shelf[data-collection="${slug}"]`, order);
      savedToast(mod, c.name, res.published);
    },
  });
}

// Open the editor for a per-type shelf, e.g. Books → "Read" (key "book:finished").
async function editTypeShelf(mod, lib, key, title) {
  const { arrangements } = await api('arrangements');
  const [type, status] = key.split(':');
  const entries = (lib.items || []).filter((i) => i.type === type && i.status === status).map((i) => ({ id: i.slug, data: i }));
  const shelf = arrangements[key] ? { sort: 'custom', order: arrangements[key] } : { sort: 'newest' };
  mod.openArrange({
    title,
    items: sortShelf(entries, shelf).map((e) => e.data),
    onSave: async (order) => {
      const res = await api('arrangements', { method: 'POST', body: { key, order } });
      reorderOnPage(`.shelf[data-arrange-key="${key}"]`, order);
      savedToast(mod, title, res.published);
    },
  });
}

if (token) {
  updatePublishPill();
  document.querySelectorAll('.shelf-edit').forEach((btn) => {
    btn.hidden = false;
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      btn.disabled = true;
      try {
        const [mod, lib] = await Promise.all([
          import('./arrange.js'),
          fetch('/library.json', { cache: 'no-store' }).then((r) => r.json()),
        ]);
        if (btn.dataset.arrangeKey) {
          const title = btn.closest('.shelf-head')?.querySelector('h2')?.textContent.trim() || 'this shelf';
          await editTypeShelf(mod, lib, btn.dataset.arrangeKey, title);
        } else {
          await editCollection(mod, lib, btn.dataset.collection);
        }
      } catch (err) {
        (await import('./arrange.js')).toast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  });
}
