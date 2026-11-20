// Board Games page filters: player count (+ best at), play time, complexity, my rating,
// status, mechanics and categories. State lives in the URL so filtered views can be bookmarked.
const root = document.getElementById('bg-filters');
if (root) init();

function init() {
  const slots = [...document.querySelectorAll('.shelf-slot[data-f]')].map((el) => ({ el, f: JSON.parse(el.dataset.f) }));
  const total = slots.length;
  const groups = [...root.querySelectorAll('.bgf-chips')];
  const best = root.querySelector('#bgf-best');
  const state = readUrl();

  function readUrl() {
    const q = new URLSearchParams(location.search);
    return {
      players: q.get('players') || '',
      best: q.get('best') === '1',
      time: q.get('time') || '',
      weight: q.get('weight') || '',
      rating: q.get('rating') || '',
      status: q.get('status') || '',
      mech: q.getAll('mech'),
      cat: q.getAll('cat'),
    };
  }
  function writeUrl() {
    const q = new URLSearchParams();
    for (const k of ['players', 'time', 'weight', 'rating', 'status']) if (state[k]) q.set(k, state[k]);
    if (state.best && state.players) q.set('best', '1');
    state.mech.forEach((m) => q.append('mech', m));
    state.cat.forEach((c) => q.append('cat', c));
    const qs = q.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }

  const overlaps = (lo, hi, a, b) => hi >= a && lo <= b;
  function matches(f) {
    if (state.players) {
      const n = Number(state.players);
      const [min, max] = f.p;
      if (min == null || max == null) return false;
      if (n >= 6 ? max < 6 : n < min || n > max) return false;
      if (state.best && !(f.best || []).some((b) => (n >= 6 ? b >= 6 : b === n))) return false;
    }
    if (state.time) {
      const [lo, hi] = f.t;
      if (lo == null) return false;
      const ok = { 30: overlaps(lo, hi, 0, 30), 60: overlaps(lo, hi, 31, 60), 120: overlaps(lo, hi, 61, 120), long: hi > 120 }[state.time];
      if (!ok) return false;
    }
    if (state.weight) {
      if (f.w == null) return false;
      const band = f.w < 2 ? 'light' : f.w <= 3 ? 'medium' : 'heavy';
      if (band !== state.weight) return false;
    }
    if (state.rating) {
      if (state.rating === 'none') { if (f.r != null) return false; }
      else if (f.r == null || f.r < Number(state.rating)) return false;
    }
    if (state.status && f.s !== state.status) return false;
    if (state.mech.length && !state.mech.every((m) => f.m.includes(m))) return false;
    if (state.cat.length && !state.cat.every((c) => f.c.includes(c))) return false;
    return true;
  }

  function render() {
    // chips
    for (const g of groups) {
      const key = g.dataset.filter;
      const multi = g.hasAttribute('data-multi');
      for (const chip of g.querySelectorAll('.bgf-chip')) {
        const on = multi ? state[key].includes(chip.dataset.value) : state[key] === chip.dataset.value;
        chip.classList.toggle('on', on);
        chip.setAttribute('aria-pressed', String(on));
      }
    }
    best.checked = state.best;
    best.disabled = !state.players;
    best.parentElement.classList.toggle('disabled', !state.players);

    // items
    let shown = 0;
    for (const s of slots) {
      const ok = matches(s.f);
      s.el.hidden = !ok;
      if (ok) shown++;
    }
    // shelves: update counts, hide empty ones, tell the 3D shelf which items are visible
    for (const section of document.querySelectorAll('.bookcase .shelf-section')) {
      const shelf = section.querySelector('.shelf');
      const visible = shelf.querySelectorAll('.shelf-slot:not([hidden])').length;
      const count = section.querySelector('.count');
      if (count) count.textContent = visible;
      section.hidden = visible === 0;
      shelf.dispatchEvent(new CustomEvent('shelf:reorder'));
    }
    const active = isFiltering();
    root.querySelector('#bgf-summary').textContent = active ? `Showing ${shown} of ${total}` : `${total} games`;
    root.querySelector('#bgf-clear').hidden = !active;
    root.querySelector('#bgf-empty').hidden = !(active && shown === 0);
    writeUrl();
  }
  const isFiltering = () => Boolean(state.players || state.time || state.weight || state.rating || state.status || state.mech.length || state.cat.length);

  for (const g of groups) {
    g.addEventListener('click', (e) => {
      const chip = e.target.closest('.bgf-chip');
      if (!chip) return;
      const key = g.dataset.filter;
      const v = chip.dataset.value;
      if (g.hasAttribute('data-multi')) {
        state[key] = state[key].includes(v) ? state[key].filter((x) => x !== v) : [...state[key], v];
      } else {
        state[key] = state[key] === v ? '' : v; // tap again to turn off
        if (key === 'players' && !state.players) state.best = false;
      }
      render();
    });
  }
  best.addEventListener('change', () => { state.best = best.checked; render(); });
  const clear = () => { Object.assign(state, { players: '', best: false, time: '', weight: '', rating: '', status: '', mech: [], cat: [] }); render(); };
  root.querySelector('#bgf-clear').addEventListener('click', clear);
  root.querySelector('[data-clear]').addEventListener('click', clear);
  const toggle = root.querySelector('.bgf-toggle');
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    root.classList.toggle('collapsed', !open);
  });
  // Start closed on every device, unless the page was opened with filters already set (bookmark).
  if (!isFiltering()) { toggle.setAttribute('aria-expanded', 'false'); root.classList.add('collapsed'); }
  render();
}
