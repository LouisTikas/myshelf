// Pencil buttons on collection shelves: only visible in a browser that's signed in to the admin.
// Clicking opens the arrange dialog; saving updates the shelf instantly and stores the new order.
import { sortShelf, inShelf } from '../lib/sorting.js';

const TOKEN_KEY = 'myshelf_token';
const token = (() => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } })();

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 401) throw new Error('Your admin sign-in has expired. Sign in again on the Manage page.');
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Put the shelf's covers in the new order right away (no reload needed).
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

function savedToast(mod, name) {
  mod.toast(`Saved “${name}”.`);
}

// Open the editor for a collection shelf.
async function editCollection(mod, lib, slug) {
  const live = await api('collections');
  const collections = live.collections;
  const c = collections.find((x) => x.slug === slug);
  if (!c) throw new Error('That collection was not found.');
  // Start from exactly what the shelf shows now (whatever its sort order is).
  const entries = (lib.items || []).filter((i) => inShelf(i, c)).map((i) => ({ id: i.slug, data: i }));
  const items = sortShelf(entries, c).map((e) => e.data);
  // "＋ Add more" opens search with this collection pre-checked (and the media type, if the shelf is all one type).
  const types = new Set(items.map((i) => i.type));
  const addHref = `/admin/#add=${encodeURIComponent(slug)}${types.size === 1 ? `&type=${[...types][0]}` : ''}`;
  mod.openArrange({
    title: c.name,
    items,
    canRemove: (i) => (i.collections || []).includes(slug), // automatic (status) members can't be taken off by hand
    onAdd: c.auto ? null : () => { location.href = addHref; },
    onSave: async (order, removed = []) => {
      if (removed.length) await api('collection-items', { method: 'POST', body: { collection: slug, remove: removed } });
      // Only switch to a custom order if you actually dragged things around.
      const before = items.map((i) => i.slug).filter((s) => !removed.includes(s));
      if (order.join() !== before.join()) {
        c.sort = 'custom';
        c.order = order;
        await api('collections', { method: 'POST', body: { collections } });
        reorderOnPage(`.shelf[data-collection="${slug}"]`, order);
      }
      if (removed.length) removeFromPage(`.shelf[data-collection="${slug}"]`, removed);
      mod.toast(removed.length ? `Saved “${c.name}” — removed ${removed.length} ${removed.length === 1 ? 'item' : 'items'}.` : `Saved “${c.name}”.`);
    },
  });
}

// Take removed covers off the shelf right away and fix the count bubble.
function removeFromPage(selector, removed) {
  const gone = new Set(removed);
  document.querySelectorAll(selector).forEach((shelf) => {
    shelf.querySelectorAll('.shelf-slot').forEach((slot) => {
      const s = (slot.querySelector('.book3d')?.getAttribute('href') || '').replace(/^\/item\//, '').replace(/\/$/, '');
      if (gone.has(s)) slot.remove();
    });
    const n = shelf.closest('.shelf-section')?.querySelector('.count-n');
    if (n) n.textContent = String(Math.max(0, Number(n.textContent) - removed.length));
    shelf.dispatchEvent(new CustomEvent('shelf:reorder'));
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
      await api('arrangements', { method: 'POST', body: { key, order } });
      reorderOnPage(`.shelf[data-arrange-key="${key}"]`, order);
      savedToast(mod, title);
    },
  });
}

if (token) {
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
          const title = btn.dataset.title || btn.closest('.shelf-head')?.querySelector('h2')?.textContent.trim() || 'this shelf';
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
