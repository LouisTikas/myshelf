// One front-facing item per shelf. Hover, focus, tap or scroll changes which one.
function initShelf(shelf) {
  const books = [...shelf.querySelectorAll('.book3d')];
  if (!books.length) return;
  let active = books.find((b) => b.classList.contains('is-front')) || books[0];
  const setActive = (b) => {
    if (!b || b === active) return;
    active?.classList.remove('is-front');
    b.classList.add('is-front');
    active = b;
  };
  active.classList.add('is-front');

  // React to real mouse movement only. (When items turn, the layout shifts under a still
  // cursor; using pointermove instead of pointerenter stops that from triggering another turn.)
  shelf.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const b = e.target.closest?.('.book3d');
    if (b && books.includes(b)) setActive(b);
  }, { passive: true });

  books.forEach((b) => {
    b.addEventListener('focus', () => setActive(b));
    // Tapping a spine turns it to face you first; tapping again opens it.
    b.addEventListener('click', (e) => {
      if (!b.classList.contains('is-front')) { e.preventDefault(); setActive(b); }
    });
  });

  if (shelf.classList.contains('shelf-scroll')) {
    let raf = 0;
    let mouse = null; // last mouse position while over this shelf
    shelf.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') mouse = { x: e.clientX, y: e.clientY }; }, { passive: true });
    shelf.addEventListener('pointerleave', () => (mouse = null));
    shelf.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (mouse) {
          // Mouse over the shelf (e.g. trackpad scrolling): the item under the cursor faces front.
          const el = document.elementFromPoint(mouse.x, mouse.y)?.closest('.book3d');
          if (el && books.includes(el)) return setActive(el);
        }
        // Touch / scrollbar: the first item at the left edge faces front.
        const edge = shelf.getBoundingClientRect().left + 30;
        setActive(books.find((b) => b.getBoundingClientRect().right > edge));
      });
    }, { passive: true });
  }
}

document.querySelectorAll('.shelf-3d').forEach(initShelf);
