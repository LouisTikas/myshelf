// The shelf info bar: a panel that slides out under a shelf (pushing the shelves below down a little) with the
// basics about the item facing front: type, title, creator, status, progress, one key fact, your rating and a
// line from your review. Mouse: it opens while you hover a shelf and closes shortly after you leave it.
// Touch: tapping a spine turns it and opens the bar; tapping the front cover opens the bar, and tapping it again
// (with the bar open) opens the item. One bar is open on the page at a time.
// The facts come from each slot's data-info (built in src/lib/shelf-info.js). Text goes in with textContent only.

const CLOSE_DELAY = 350; // ms after the mouse leaves a shelf

let openBar = null; // the bar that's open right now, page-wide

const el = (tag, cls, attrs = {}) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

function build() {
  const bar = el('div', 'shelf-info', { 'aria-hidden': 'true' });
  const clip = el('div', 'si-clip');
  const panel = el('div', 'si-panel');
  const caret = el('span', 'si-caret', { 'aria-hidden': 'true' });

  const main = el('div', 'si-main');
  const eyebrow = el('p', 'si-eyebrow');
  const title = el('a', 'si-title', { tabindex: '-1' });
  const by = el('p', 'si-by');
  main.append(eyebrow, title, by);

  const facts = el('div', 'si-facts');
  const fact = (label, cls) => {
    const f = el('div', `si-fact ${cls}`);
    const k = el('span', 'si-k');
    k.textContent = label;
    const v = el('span', 'si-v');
    f.append(k, v);
    facts.appendChild(f);
    return { f, k, v };
  };
  const status = fact('Status', 'si-status');
  const pill = el('span', 'si-pill');
  status.v.appendChild(pill);
  const prog = fact('Progress', 'si-progress');
  const progText = el('span', 'si-progress-text');
  const progBar = el('span', 'si-bar');
  const progFill = el('span');
  progBar.appendChild(progFill);
  prog.v.append(progText, progBar);
  const key = fact('', 'si-keyfact');
  const rating = fact('My rating', 'si-rating');

  const open = el('a', 'si-open', { tabindex: '-1' });
  open.innerHTML = 'Open <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>';
  const close = el('button', 'si-close', { type: 'button', 'aria-label': 'Close info', tabindex: '-1' });
  close.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg>';

  const review = el('p', 'si-review');
  const reviewK = el('span', 'si-k');
  reviewK.textContent = 'My review';
  const reviewQ = el('span', 'si-quote');
  review.append(reviewK, reviewQ);

  panel.append(caret, main, facts, open, close, review);
  clip.appendChild(panel);
  bar.appendChild(clip);
  return { bar, caret, eyebrow, title, by, pill, status, prog, progText, progFill, key, rating, open, close, review, reviewQ };
}

/**
 * Attach an info bar to one shelf (.shelf-3d). Returns { show(book, { touch }), hide(), isOpenFor(book) }.
 * show() fills the bar from the book's slot and slides it out under that book's row.
 */
export function infoBar(shelf) {
  const section = shelf.closest('.shelf-section') || shelf.parentElement;
  const ui = build();
  let current = null;   // the .book3d the bar describes
  let closeTimer = 0;
  let caretRaf = 0;

  const placeCaret = () => {
    cancelAnimationFrame(caretRaf);
    caretRaf = requestAnimationFrame(() => {
      if (!current || !ui.bar.isConnected) return;
      const a = current.getBoundingClientRect();
      const p = ui.caret.parentElement.getBoundingClientRect();
      const x = Math.max(16, Math.min(p.width - 16, a.left + a.width / 2 - p.left));
      ui.caret.style.left = `${x}px`;
    });
  };

  // Under the row the item is in (wrapping shelves are split into rows), else under the whole shelf.
  const place = (b) => {
    const row = b.closest('.shelf-row');
    if (row && row.parentElement === shelf) {
      if (row.nextElementSibling !== ui.bar) row.after(ui.bar);
      ui.bar.classList.add('in-shelf');
    } else {
      if (shelf.nextElementSibling !== ui.bar) shelf.after(ui.bar);
      ui.bar.classList.remove('in-shelf');
    }
  };

  const fill = (b) => {
    let d = {};
    try { d = JSON.parse(b.closest('.shelf-slot')?.dataset.info || '{}'); } catch {}
    const href = b.getAttribute('href') || '#';
    ui.eyebrow.textContent = [d.l, d.y].filter(Boolean).join(' · ');
    ui.title.textContent = d.t || b.getAttribute('aria-label') || '';
    ui.title.href = href;
    ui.by.textContent = d.c || '';
    ui.by.hidden = !d.c;
    ui.pill.textContent = d.s || '';
    ui.pill.dataset.status = d.k || '';
    ui.status.f.hidden = !d.s;
    ui.prog.f.hidden = !d.p;
    if (d.p) {
      ui.progText.textContent = d.p.n != null ? `${d.p.x} (${d.p.n}%)` : d.p.x;
      ui.progFill.style.width = `${d.p.n ?? 0}%`;
      ui.progFill.parentElement.hidden = d.p.n == null;
    }
    ui.key.f.hidden = !d.f;
    if (d.f) { ui.key.k.textContent = d.f[0]; ui.key.v.textContent = d.f[1]; }
    ui.rating.v.textContent = d.r || 'Not rated';
    ui.rating.v.classList.toggle('is-empty', !d.r);
    if (d.rv != null) ui.rating.v.setAttribute('aria-label', `${d.rv} out of 5`);
    else ui.rating.v.removeAttribute('aria-label');
    ui.open.href = href;
    ui.open.setAttribute('aria-label', `Open ${d.t || 'this item'}`);
    ui.review.hidden = !d.v;
    ui.reviewQ.textContent = d.v || '';
  };

  const setFocusable = (on) => {
    for (const n of [ui.title, ui.open, ui.close]) n.tabIndex = on ? 0 : -1;
  };

  const hide = () => {
    clearTimeout(closeTimer);
    if (!ui.bar.classList.contains('is-open')) return;
    ui.bar.classList.remove('is-open', 'is-touch');
    ui.bar.setAttribute('aria-hidden', 'true');
    setFocusable(false);
    if (openBar === api) openBar = null;
  };

  const show = (b, { touch = false } = {}) => {
    if (!b) return;
    clearTimeout(closeTimer);
    if (openBar && openBar !== api) openBar.hide();
    openBar = api;
    const wasOpen = ui.bar.classList.contains('is-open');
    const moved = ui.bar.previousElementSibling !== (b.closest('.shelf-row') || shelf);
    current = b;
    fill(b);
    if (moved && wasOpen) {
      // Jumping to another row: close here and open there, so the slide reads as one motion.
      ui.bar.classList.remove('is-open');
    }
    place(b);
    ui.bar.classList.toggle('is-touch', touch);
    ui.bar.setAttribute('aria-hidden', 'false');
    setFocusable(true);
    // Let the closed state paint first so it slides open.
    requestAnimationFrame(() => {
      ui.bar.classList.add('is-open');
      placeCaret();
    });
  };

  const isOpenFor = (b) => ui.bar.classList.contains('is-open') && current === b;

  // Mouse: stay open while over the shelf or the bar; close a moment after leaving both.
  const leave = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(hide, CLOSE_DELAY);
  };
  const enter = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    clearTimeout(closeTimer);
  };
  section.addEventListener('pointerleave', leave);
  section.addEventListener('pointerenter', enter);

  ui.close.addEventListener('click', () => {
    hide();
    current?.focus?.({ preventScroll: true });
  });
  // Keyboard: Escape closes; tabbing out of the shelf and bar closes.
  section.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.bar.classList.contains('is-open')) hide(); });
  section.addEventListener('focusout', (e) => {
    if (e.relatedTarget && section.contains(e.relatedTarget)) return;
    if (!section.matches(':hover')) hide();
  });

  // The caret follows the item as it widens to face front, and as the shelf slides sideways.
  shelf.addEventListener('transitionend', (e) => {
    if (e.propertyName === 'width' && e.target === current) placeCaret();
  });
  shelf.addEventListener('scroll', placeCaret, { passive: true, capture: true });
  window.addEventListener('resize', placeCaret, { passive: true });
  // Rows re-packed, or the shelf sorted, filtered or rearranged: the bar would point at the wrong place.
  shelf.addEventListener('shelf:rows', hide);
  shelf.addEventListener('shelf:reorder', hide);

  const api = { show, hide, isOpenFor, placeCaret };
  return api;
}

// Touch: a tap outside any shelf or bar closes the open one.
document.addEventListener('click', (e) => {
  if (!openBar) return;
  if (e.target.closest?.('.shelf-section')) return;
  openBar.hide();
}, { passive: true });
