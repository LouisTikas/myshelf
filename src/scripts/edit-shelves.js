// Pencil buttons on collection shelves: only visible in a browser that's signed in to the admin.
// Clicking opens the arrange dialog; saving updates the shelf instantly and commits the new order.
import { sortShelf } from '../lib/sorting.js';

const TOKEN_KEY = 'myshelf_token';
const token = (() => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } })();

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 401) throw new Error('Your admin sign-in has expired. Sign in again on the Manage page.');
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Put the shelf's covers in the new order right away (the rebuilt site follows in ~1 minute).
function reorderOnPage(slug, order) {
  const pos = new Map(order.map((s, i) => [s, i]));
  document.querySelectorAll(`.shelf[data-collection="${slug}"]`).forEach((shelf) => {
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

if (token) {
  document.querySelectorAll('.shelf-edit').forEach((btn) => {
    btn.hidden = false;
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      btn.disabled = true;
      let toast = () => {};
      try {
        const [mod, lib, live] = await Promise.all([
          import('./arrange.js'),
          fetch('/library.json', { cache: 'no-store' }).then((r) => r.json()),
          api('collections'),
        ]);
        toast = mod.toast;
        const slug = btn.dataset.collection;
        const collections = live.collections;
        const c = collections.find((x) => x.slug === slug);
        if (!c) throw new Error('That collection was not found.');
        // Start from exactly what the shelf shows now (whatever its sort order is).
        const entries = (lib.items || []).filter((i) => (i.collections || []).includes(slug)).map((i) => ({ id: i.slug, data: i }));
        const items = sortShelf(entries, c).map((e) => e.data);
        mod.openArrange({
          title: c.name,
          items,
          onSave: async (order) => {
            c.sort = 'custom';
            c.order = order;
            await api('collections', { method: 'POST', body: { collections } });
            reorderOnPage(slug, order);
            mod.toast(`Saved “${c.name}”. Your public shelf updates in about a minute.`);
          },
        });
      } catch (err) {
        (await import('./arrange.js')).toast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  });
}
