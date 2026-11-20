// Shared drag-to-arrange dialog, used on the admin page and on public shelves (pencil button).
import Sortable from 'sortablejs';
import '../styles/arrange.css';

const COLORS = { book: '#8a3b2e', movie: '#2e4a6b', tv: '#4b3b6b', music: '#2f5e4e', videogame: '#6b4b1f', boardgame: '#5e2f45' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function thumb(i) {
  const ph = `<span class="ar-ph" style="background:${COLORS[i.type] || '#555'}">${esc((i.title || '?').slice(0, 1))}</span>`;
  return i.cover
    ? `<span class="ar-thumb"><img src="${esc(i.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(this.nextElementSibling.content.cloneNode(true))"><template>${ph}</template></span>`
    : `<span class="ar-thumb">${ph}</span>`;
}

let dialog, list, sortable, current;

function build() {
  dialog = document.createElement('dialog');
  dialog.className = 'ar-dialog';
  dialog.innerHTML = `
    <header class="ar-head">
      <div>
        <h2 class="ar-title"></h2>
        <p class="ar-hint">Drag covers into the order you want. Items you add later appear at the front.</p>
      </div>
      <button type="button" class="ar-btn ar-ghost ar-small" data-ar-close aria-label="Close">✕</button>
    </header>
    <ol class="ar-list"></ol>
    <footer class="ar-foot">
      <button type="button" class="ar-btn ar-ghost ar-small" data-ar-reset>Reset to newest first</button>
      <span class="ar-spacer"></span>
      <button type="button" class="ar-btn ar-ghost" data-ar-close>Cancel</button>
      <button type="button" class="ar-btn ar-primary" data-ar-save>Save order</button>
    </footer>`;
  document.body.appendChild(dialog);
  list = dialog.querySelector('.ar-list');
  dialog.querySelectorAll('[data-ar-close]').forEach((b) => b.addEventListener('click', () => dialog.close()));
  dialog.querySelector('[data-ar-reset]').addEventListener('click', () => {
    const when = (i) => new Date(i.dateFinished || i.dateStarted || i.dateAdded || 0).getTime();
    render([...current.items].sort((a, b) => when(b) - when(a)));
  });
  dialog.querySelector('[data-ar-save]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const order = [...list.querySelectorAll('.ar-item')].map((li) => li.dataset.slug);
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await current.onSave(order);
      dialog.close();
    } catch (err) {
      toast(err.message || 'Could not save', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save order';
    }
  });
}

function render(items) {
  list.innerHTML = items.length
    ? items.map((i, n) => `<li class="ar-item" data-slug="${esc(i.slug)}"><span class="ar-num">${n + 1}</span>${thumb(i)}<span class="ar-name">${esc(i.title)}</span></li>`).join('')
    : '<li class="ar-empty">This collection is empty.</li>';
}

/** items: already in current shelf order. onSave(orderSlugs) should persist (throw on failure). */
export function openArrange({ title, items, onSave }) {
  if (!dialog) build();
  current = { items, onSave };
  dialog.querySelector('.ar-title').textContent = `Arrange “${title}”`;
  render(items);
  sortable?.destroy();
  sortable = Sortable.create(list, {
    animation: 180,
    ghostClass: 'ar-ghost-item',
    chosenClass: 'ar-chosen',
    delay: 120, delayOnTouchOnly: true, // on phones: press & hold briefly to pick up, so scrolling still works
    onSort: () => list.querySelectorAll('.ar-num').forEach((el, n) => (el.textContent = n + 1)),
  });
  dialog.showModal();
}

let toastEl, toastTimer;
export function toast(msg, kind = 'ok') {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'ar-toast';
    toastEl.setAttribute('role', 'status');
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.dataset.kind = kind;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), kind === 'error' ? 7000 : 4500);
}
