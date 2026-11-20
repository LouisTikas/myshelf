// One front-facing item per shelf.
// Mouse: hover turns an item. Keyboard: Tab turns it. Touch: tap a spine to turn it
// (tap again to open), or swipe sideways to flip through the shelf.
const SWIPE_STEP = 34;      // px of finger travel per item while swiping
const SWIPE_LOCK = 10;      // px before we decide the gesture is horizontal

function initShelf(shelf) {
  let books = [...shelf.querySelectorAll('.book3d')];
  if (!books.length) return;
  let active = books.find((b) => b.classList.contains('is-front')) || books[0];
  active.classList.add('is-front');

  const setActive = (b, { reveal = false } = {}) => {
    if (!b || b === active) return;
    active.classList.remove('is-front');
    b.classList.add('is-front');
    active = b;
    if (reveal) {
      // Keep the newly turned item in view (once it has started widening).
      requestAnimationFrame(() => b.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }));
    }
  };

  // Shelf was rearranged on the page (pencil → Arrange → Save): first item faces front again.
  shelf.addEventListener('shelf:reorder', () => {
    books = [...shelf.querySelectorAll('.book3d')];
    active.classList.remove('is-front');
    active = books[0];
    active.classList.add('is-front');
  });

  // ── Mouse: real movement only (layout shifts under a still cursor shouldn't turn things).
  let mouse = null;
  shelf.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    mouse = { x: e.clientX, y: e.clientY };
    const b = e.target.closest?.('.book3d');
    if (b && books.includes(b)) setActive(b);
  }, { passive: true });
  shelf.addEventListener('pointerleave', () => (mouse = null));

  // Trackpad scrolling with the cursor over the shelf: the item under the cursor faces front.
  let raf = 0;
  shelf.addEventListener('scroll', () => {
    if (!mouse) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const el = document.elementFromPoint(mouse.x, mouse.y)?.closest('.book3d');
      if (el && books.includes(el)) setActive(el);
    });
  }, { passive: true });

  // ── Keyboard: only keyboard focus turns an item. (A tap also focuses the link; reacting
  // to that turned the item before the tap was handled, so a single tap opened it.)
  books.forEach((b) => {
    b.addEventListener('focus', () => { if (b.matches(':focus-visible')) setActive(b, { reveal: true }); });
  });

  // ── Touch: swipe sideways to flip through the shelf.
  let start = null;        // { x, y, id, idx }
  let swiping = false;
  let suppressClick = false;

  shelf.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    suppressClick = false; // a new touch starts fresh
    start = { x: e.clientX, y: e.clientY, id: e.pointerId, idx: books.indexOf(active) };
    swiping = false;
  });
  shelf.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!swiping) {
      if (Math.abs(dy) > SWIPE_LOCK && Math.abs(dy) > Math.abs(dx)) { start = null; return; } // vertical: let the page scroll
      if (Math.abs(dx) < SWIPE_LOCK) return;
      swiping = true;
    }
    // Finger moving left = forward through the shelf, like flicking through records.
    const steps = Math.trunc(-dx / SWIPE_STEP);
    const idx = Math.max(0, Math.min(books.length - 1, start.idx + steps));
    setActive(books[idx], { reveal: true });
  });
  const end = (e) => {
    if (!start || e.pointerId !== start.id) return;
    if (swiping) {
      // Swallow the click some browsers fire at the end of a swipe — but only that one.
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 350);
    }
    start = null;
    swiping = false;
  };
  shelf.addEventListener('pointerup', end);
  shelf.addEventListener('pointercancel', end);

  // ── Taps/clicks: a spine turns to face you first; the front-facing item opens.
  books.forEach((b) => {
    b.addEventListener('click', (e) => {
      if (suppressClick) { e.preventDefault(); suppressClick = false; return; }
      if (!b.classList.contains('is-front')) { e.preventDefault(); setActive(b, { reveal: true }); }
    });
  });
}

document.querySelectorAll('.shelf-3d').forEach(initShelf);
