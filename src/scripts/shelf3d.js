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
  // Also fired by the board game filters: only visible items take part.
  shelf.addEventListener('shelf:reorder', () => {
    books = [...shelf.querySelectorAll('.book3d')].filter((b) => !b.closest('.shelf-slot')?.hidden);
    if (!books.length) return;
    if (books.includes(active) && books[0] === active) return;
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

  // ── Long shelves glide with the mouse: the cursor's position across the shelf maps to the
  // scroll position, so moving to the right edge brings the last item fully into view
  // (even after it widens to face front). Trackpad/wheel scrolling takes over instantly.
  if (shelf.classList.contains('shelf-scroll')) {
    const EDGE = 70; // px at each end that count as "all the way"
    let target = 0;
    let glide = 0;
    const step = () => {
      const cur = shelf.scrollLeft;
      const max = shelf.scrollWidth - shelf.clientWidth;
      const goal = Math.max(0, Math.min(max, target));
      const d = goal - cur;
      if (Math.abs(d) < 0.5) { shelf.scrollTo({ left: goal, behavior: 'instant' }); glide = 0; return; }
      shelf.scrollTo({ left: cur + d * 0.16, behavior: 'instant' });
      glide = requestAnimationFrame(step);
    };
    const aim = (clientX) => {
      const max = shelf.scrollWidth - shelf.clientWidth;
      if (max <= 0) return;
      const r = shelf.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (clientX - r.left - EDGE) / Math.max(1, r.width - 2 * EDGE)));
      target = t * max;
      if (!glide) glide = requestAnimationFrame(step);
    };
    shelf.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') aim(e.clientX); }, { passive: true });
    // When an item finishes turning (the shelf just got wider), make sure the front-facing
    // item is completely visible — nudge the shelf just enough if it's cut off at either end.
    const PAD = 12;
    shelf.addEventListener('transitionend', (e) => {
      if (e.propertyName !== 'width' || !e.target.classList?.contains('book3d')) return;
      if (mouse) aim(mouse.x);
      const r = shelf.getBoundingClientRect();
      const a = active.getBoundingClientRect();
      const base = glide ? target : shelf.scrollLeft;
      let goal = base;
      if (a.right > r.right - PAD) goal = shelf.scrollLeft + (a.right - (r.right - PAD));
      else if (a.left < r.left + PAD) goal = shelf.scrollLeft - ((r.left + PAD) - a.left);
      if (goal !== base) {
        target = goal;
        if (!glide) glide = requestAnimationFrame(step);
      }
    });
    shelf.addEventListener('wheel', () => { cancelAnimationFrame(glide); glide = 0; }, { passive: true });
  }

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

// ── Fade covers out at the right edge while there's more shelf to scroll to.
function watchEdge(shelf) {
  const update = () => {
    const more = shelf.scrollWidth - shelf.clientWidth - shelf.scrollLeft > 4;
    shelf.classList.toggle('fade-right', more);
  };
  shelf.addEventListener('scroll', update, { passive: true });
  shelf.addEventListener('shelf:reorder', () => requestAnimationFrame(update));
  new ResizeObserver(update).observe(shelf);
  update();
}
document.querySelectorAll('.shelf-scroll').forEach(watchEdge);

// ── Wrapping shelves (collection pages): stop items jumping between rows.
// Turning an item to face front makes it wider, which used to re-wrap the shelf. Instead, rows are
// packed full (by spine width) into fixed row strips. When an item turns front, its row grows past
// the edge; the overflow fades out on the right, and the row slides so the front item stays in view.
// Rows are only re-packed when the shelf's width changes or its items are filtered/reordered.
function lockRows(shelf) {
  let lastWidth = 0;
  const px = (el, v) => parseFloat(getComputedStyle(el).getPropertyValue(v)) || 0;

  const edges = (row) => {
    const max = row.scrollWidth - row.clientWidth;
    row.classList.toggle('fade-right', max - row.scrollLeft > 4);
    row.classList.toggle('fade-left', row.scrollLeft > 4);
  };
  // Keep the front-facing item fully visible; other rows go back to the start.
  const reveal = () => {
    for (const row of shelf.querySelectorAll(':scope > .shelf-row')) {
      const front = row.querySelector('.book3d.is-front');
      let left = 0;
      if (front) {
        const slot = front.closest('.shelf-slot');
        const end = slot.offsetLeft - row.offsetLeft + slot.offsetWidth + 8;
        left = Math.max(0, end - row.clientWidth);
      }
      if (Math.abs(row.scrollLeft - left) > 1) row.scrollTo({ left, behavior: 'smooth' });
      else edges(row);
    }
  };

  const layout = () => {
    const slots = [...shelf.querySelectorAll('.shelf-slot')];
    if (!slots.length) return;
    slots.forEach((sl) => shelf.appendChild(sl));
    shelf.querySelectorAll(':scope > .shelf-row, :scope > .shelf-break').forEach((r) => r.remove());
    const cs = getComputedStyle(shelf);
    const avail = shelf.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const gap = parseFloat(cs.columnGap) || 0;
    let row = null, used = 0;
    for (const slot of slots) {
      const spine = slot.hidden ? 0 : px(slot.querySelector('.book3d'), '--d');
      const add = (used ? gap : 0) + spine;
      if (!row || (spine && used && used + add > avail)) {
        row = document.createElement('div');
        row.className = 'shelf-row';
        row.addEventListener('scroll', () => edges(row), { passive: true });
        shelf.appendChild(row);
        used = 0;
      }
      row.appendChild(slot);
      if (spine) used += (used ? gap : 0) + spine;
    }
    reveal();
  };

  new ResizeObserver(() => {
    if (shelf.clientWidth === lastWidth) return;
    lastWidth = shelf.clientWidth;
    layout();
  }).observe(shelf);
  shelf.addEventListener('shelf:reorder', () => requestAnimationFrame(layout));
  // When an item finishes turning front (its width transition), make sure it's in view.
  shelf.addEventListener('transitionend', (e) => {
    if (e.propertyName === 'width' && e.target.classList?.contains('book3d')) reveal();
  });
}
document.querySelectorAll('.shelf-3d:not(.shelf-scroll)').forEach(lockRows);
