// Admin UI: Friends tab (other MyShelf sites, inbox, recommendations, borrowing) and Settings tab.
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const TYPES = JSON.parse($('#admin').dataset.types);
const token = () => { try { return localStorage.getItem('myshelf_token') || ''; } catch { return ''; } };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: { authorization: `Bearer ${token()}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

let toastTimer;
function toast(msg, kind = 'ok') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast ${kind}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), kind === 'error' ? 7000 : 4500);
}

const fmt = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const typeLabel = (t) => TYPES[t]?.label || t || '';
const thumb = (cover, title, type) => {
  const t = TYPES[type] || TYPES.book;
  const ph = `<span class="thumb-ph" style="width:${Math.round(52 * t.aspect)}px;height:52px;background:${t.color}">${esc((title || '?').slice(0, 1))}</span>`;
  return cover ? `<img class="thumb" src="${esc(cover)}" alt="" style="height:52px" loading="lazy" referrerpolicy="no-referrer">` : ph;
};

// ───────── friends tab ─────────
const state = { me: null, friends: [], inbox: [], loaded: false };

async function loadFriends() {
  try {
    const data = await api('friends');
    Object.assign(state, data, { loaded: true });
    render();
  } catch (err) {
    $('#friend-msg').textContent = err.message;
  }
}

function setUnread(n) {
  const el = $('#friends-unread');
  el.hidden = !n;
  el.textContent = n;
}

function render() {
  $('#my-address').textContent = state.me?.url || '';
  setUnread(state.unread);
  renderInbox();
  renderFriends();
}

function renderInbox() {
  const list = $('#inbox-list');
  if (!state.inbox.length) {
    list.innerHTML = '<li class="muted">Nothing yet. Friend requests, recommendations and borrow requests show up here.</li>';
    return;
  }
  list.innerHTML = state.inbox.map((m) => {
    const who = `<strong>${esc(m.fromName)}</strong>`;
    const when = `<span class="muted small">${fmt(m.createdAt)}</span>`;
    const p = m.payload || {};
    const note = p.note ? `<p class="inbox-note">“${esc(p.note)}”</p>` : '';
    const open = ['unread', 'read'].includes(m.status);
    const done = { accepted: 'Accepted', declined: 'Declined' }[m.status];
    let body = '', actions = '';
    if (m.kind === 'friend-request') {
      body = `${who} <span class="muted small">(${esc(m.from)})</span> wants to be friends.`;
      const f = state.friends.find((x) => x.id === m.friendId);
      if (open && f?.status === 'pending') actions = `
        <button class="btn primary small" data-friend-act="accept" data-id="${esc(f.id)}">Accept</button>
        <button class="btn ghost small" data-friend-act="decline" data-id="${esc(f.id)}">Decline</button>
        <button class="btn ghost small danger" data-friend-act="block" data-id="${esc(f.id)}" title="Ignore future requests from this site">Block</button>`;
    } else if (m.kind === 'friend-accept') {
      body = `${who} accepted your friend request.`;
    } else if (m.kind === 'recommend') {
      const it = p.item || {};
      const link = it.url || it.source?.url;
      body = `<span class="inbox-item">${thumb(it.cover, it.title, it.type)}<span>${who} recommends
        <strong>${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(it.title)}</a>` : esc(it.title)}</strong>
        <span class="muted small">${esc(typeLabel(it.type))}${it.creator ? ` · ${esc(it.creator)}` : ''}${it.year ? ` · ${esc(it.year)}` : ''}</span></span></span>`;
      actions = p.alreadyHave
        ? `<a class="btn ghost small" href="/item/${esc(p.alreadyHave)}/" target="_blank">You have this</a>`
        : `<button class="btn ghost small" data-add-rec="${esc(m.id)}">Add it</button>`;
    } else if (m.kind === 'borrow-request') {
      body = `${who} asks to borrow <strong>${esc(p.item?.title)}</strong>.${p.lentTo ? ` <span class="muted small">(It’s marked as lent to ${esc(p.lentTo)}.)</span>` : ''}`;
      if (open) actions = `
        <button class="btn primary small" data-borrow="yes" data-id="${esc(m.id)}">Yes, lend it</button>
        <button class="btn ghost small" data-borrow="no" data-id="${esc(m.id)}">Not now</button>`;
    } else if (m.kind === 'borrow-reply') {
      body = `${who} ${p.answer === 'yes' ? 'said <strong>yes</strong> to' : 'can’t lend you'} <strong>${esc(p.title)}</strong>${p.answer === 'yes' ? '.' : ' right now.'}`;
    }
    return `<li class="inbox-row${m.status === 'unread' ? ' unread' : ''}">
      <div class="inbox-text">${body} ${when}${note}</div>
      <div class="inbox-actions">${actions}${done ? `<span class="muted small">${done}</span>` : ''}</div>
    </li>`;
  }).join('');
}

function renderFriends() {
  const label = { accepted: '', requested: 'Waiting for them to accept', pending: 'Wants to be friends', blocked: 'Blocked' };
  const list = $('#friend-list');
  if (!state.friends.length) {
    list.innerHTML = '<li class="muted">No friends yet. Paste a friend’s MyShelf address above.</li>';
    return;
  }
  list.innerHTML = state.friends.map((f) => `
    <li class="friend-row">
      <span class="friend-text">
        <strong>${esc(f.owner || f.name || f.url)}</strong>${f.owner && f.name ? ` <span class="muted">· ${esc(f.name)}</span>` : ''}
        <a class="muted small" href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.url.replace(/^https?:\/\//, ''))}</a>
        ${label[f.status] ? `<span class="vis-badge">${label[f.status]}</span>` : ''}
      </span>
      <span class="friend-actions">
        ${f.status === 'accepted' ? `<button class="btn ghost small" data-shelf="${esc(f.id)}">View shelf</button>` : ''}
        ${f.status === 'pending' ? `<button class="btn primary small" data-friend-act="accept" data-id="${esc(f.id)}">Accept</button>` : ''}
        <button class="btn ghost small danger" data-friend-act="remove" data-id="${esc(f.id)}">${f.status === 'requested' ? 'Cancel' : f.status === 'blocked' ? 'Unblock' : 'Remove'}</button>
      </span>
    </li>`).join('');
}

// Mark messages that need no answer as read once they've been seen.
async function markSeen() {
  const seen = state.inbox.filter((m) => m.status === 'unread' && !['friend-request', 'borrow-request'].includes(m.kind));
  for (const m of seen) {
    api('friends', { method: 'POST', body: { action: 'mark', id: m.id, status: 'read' } }).catch(() => {});
    m.status = 'read';
  }
  if (seen.length) setUnread(state.inbox.filter((m) => m.status === 'unread').length);
}

document.addEventListener('myshelf:ready', loadFriends);
document.addEventListener('myshelf:tab', async (e) => {
  if (e.detail !== 'friends') return;
  await loadFriends();
  setTimeout(markSeen, 1500);
});

$('#copy-address').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(state.me?.url || ''); toast('Address copied.'); } catch { toast('Couldn’t copy. Select the address and copy it instead.', 'error'); }
});

$('#friend-add').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter || $('#friend-add button');
  btn.disabled = true;
  $('#friend-msg').textContent = 'Contacting their site…';
  try {
    const { friend, status } = await api('friends', { method: 'POST', body: { action: 'add', url: $('#friend-url').value } });
    const name = friend.owner || friend.name || friend.url;
    $('#friend-msg').textContent = status === 'accepted' ? `You and ${name} are now friends.` : `Friend request sent to ${name}. You’ll be connected when they accept.`;
    $('#friend-url').value = '';
    await loadFriends();
  } catch (err) {
    $('#friend-msg').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});


document.addEventListener('click', async (e) => {
  const act = e.target.closest('[data-friend-act]');
  if (act) {
    const action = act.dataset.friendAct;
    if (action === 'remove' && !act.classList.contains('confirm')) {
      act.classList.add('confirm');
      const prev = act.textContent;
      act.textContent = 'Sure?';
      setTimeout(() => { act.classList.remove('confirm'); act.textContent = prev; }, 4000);
      return;
    }
    act.disabled = true;
    try {
      await api('friends', { method: 'POST', body: { action, id: act.dataset.id } });
      toast({ accept: 'You’re now friends.', decline: 'Request declined.', block: 'Blocked.', remove: 'Removed.' }[action]);
      $('#friend-shelf').hidden = true;
      await loadFriends();
    } catch (err) {
      act.disabled = false;
      toast(err.message, 'error');
    }
    return;
  }

  const borrow = e.target.closest('[data-borrow]');
  if (borrow) {
    const yes = borrow.dataset.borrow === 'yes';
    const note = window.prompt(yes ? 'Add a note? (optional — e.g. when to pick it up)' : 'Add a note? (optional)', '');
    if (note === null) return;
    borrow.disabled = true;
    try {
      await api('friends', { method: 'POST', body: { action: 'reply', inboxId: borrow.dataset.id, answer: yes ? 'yes' : 'no', note } });
      toast(yes ? 'Sent. It’s marked as lent on your shelf.' : 'Sent.');
      if (yes) document.dispatchEvent(new CustomEvent('myshelf:library-changed'));
      await loadFriends();
    } catch (err) {
      borrow.disabled = false;
      toast(err.message, 'error');
    }
    return;
  }

  const addRec = e.target.closest('[data-add-rec]');
  if (addRec) {
    const m = state.inbox.find((x) => x.id === addRec.dataset.addRec);
    const it = m?.payload?.item || {};
    document.dispatchEvent(new CustomEvent('myshelf:search', { detail: { type: it.type, title: it.title } }));
    return;
  }

  const shelfBtn = e.target.closest('[data-shelf]');
  if (shelfBtn) return showFriendShelf(shelfBtn.dataset.shelf);

  const ask = e.target.closest('[data-ask]');
  if (ask) {
    const note = window.prompt(`Ask to borrow “${ask.dataset.title}”. Add a note? (optional)`, '');
    if (note === null) return;
    ask.disabled = true;
    try {
      await api('friends', { method: 'POST', body: { action: 'borrow', friendId: ask.dataset.friend, uid: ask.dataset.ask, title: ask.dataset.title, note } });
      ask.textContent = 'Asked';
      toast('Request sent.');
    } catch (err) {
      ask.disabled = false;
      toast(err.message, 'error');
    }
    return;
  }

  const rec = e.target.closest('[data-recommend]');
  if (rec) return openRecommend(rec.dataset.recommend, rec.dataset.title);
});

async function showFriendShelf(id) {
  const box = $('#friend-shelf');
  box.hidden = false;
  box.innerHTML = '<p class="muted">Loading their shelf…</p>';
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const { friend, items } = await api(`friends?shelf=${encodeURIComponent(id)}`);
    const name = friend.owner || friend.name || friend.url;
    const byType = Object.keys(TYPES).map((t) => [t, items.filter((i) => i.type === t)]).filter(([, l]) => l.length);
    box.innerHTML = `
      <div class="friend-shelf-head"><h3>${esc(name)}’s shelf</h3><button class="btn ghost small" data-close-shelf>✕</button></div>
      ${items.length ? '' : '<p class="muted">Nothing to see yet.</p>'}
      ${byType.map(([t, list]) => `
        <h4>${esc(TYPES[t].plural)} <span class="muted small">${list.length}</span></h4>
        <ul class="lib-list">${list.map((i) => `
          <li class="lib-row">
            ${thumb(i.cover, i.title, i.type)}
            <span class="lib-text">
              <strong>${i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a>` : esc(i.title)}${i.youHave ? ' <span class="vis-badge">You have this</span>' : ''}${i.visibility === 'friends' ? ' <span class="vis-badge">Friends only</span>' : ''}</strong>
              <span class="muted small">${esc(i.creator || '')}${i.rating ? ` · ${'★'.repeat(Math.floor(i.rating))}${i.rating % 1 ? '½' : ''}` : ''}</span>
            </span>
            <span class="lib-actions">
              ${i.available ? `<button class="btn ghost small" data-ask="${esc(i.uid)}" data-friend="${esc(friend.id)}" data-title="${esc(i.title)}">Ask to borrow</button>` : i.owned ? '<span class="muted small">Lent out</span>' : ''}
            </span>
          </li>`).join('')}</ul>`).join('')}`;
  } catch (err) {
    box.innerHTML = `<p class="error">${esc(err.message)}</p>`;
  }
}
$('#friend-shelf').addEventListener('click', (e) => {
  if (e.target.closest('[data-close-shelf]')) $('#friend-shelf').hidden = true;
});

// ───────── recommend dialog ─────────
const recDialog = $('#recommend');
let recSlug = null;
async function openRecommend(slug, title) {
  if (!state.loaded) await loadFriends();
  const friends = state.friends.filter((f) => f.status === 'accepted');
  if (!friends.length) return toast('Add a friend first (Friends tab).', 'error');
  recSlug = slug;
  $('#recommend-title').textContent = `Recommend “${title}”`;
  $('#rec-friends').innerHTML = friends.map((f) => `<label class="check"><input type="checkbox" value="${esc(f.id)}" ${friends.length === 1 ? 'checked' : ''}/> ${esc(f.owner || f.name || f.url)}</label>`).join('');
  $('#recommend-form').note.value = '';
  recDialog.showModal();
}
$$('[data-close-rec]', recDialog).forEach((b) => b.addEventListener('click', () => recDialog.close()));
$('#recommend-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const friendIds = $$('#rec-friends input:checked').map((i) => i.value);
  if (!friendIds.length) return toast('Pick at least one friend.', 'error');
  const btn = $('#rec-send');
  btn.disabled = true;
  try {
    const { results } = await api('friends', { method: 'POST', body: { action: 'recommend', slug: recSlug, friendIds, note: e.target.note.value } });
    const failed = results.filter((r) => !r.ok);
    recDialog.close();
    toast(failed.length ? `Sent, but ${failed.length} couldn’t be reached: ${failed[0].error}` : 'Recommendation sent.', failed.length ? 'error' : 'ok');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

// ───────── settings tab ─────────
const siteForm = $('#site-form');
async function loadSite() {
  try {
    const { site } = await api('site');
    for (const k of ['title', 'tagline', 'owner', 'url', 'source']) siteForm[k].value = site[k] || '';
  } catch (err) {
    $('#site-msg').textContent = err.message;
  }
}
document.addEventListener('myshelf:tab', (e) => { if (e.detail === 'settings') loadSite(); });
siteForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(['title', 'tagline', 'owner', 'url', 'source'].map((k) => [k, siteForm[k].value]));
  try {
    const { site } = await api('site', { method: 'POST', body });
    siteForm.url.value = site.url || '';
    siteForm.source.value = site.source || '';
    $('#site-msg').textContent = 'Saved. Your public pages show it right away.';
  } catch (err) {
    $('#site-msg').textContent = err.message;
  }
});

$('#settings-export').addEventListener('click', () => $('#export-btn').click());

$('#restore-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const msg = $('#restore-msg');
  let data;
  try { data = JSON.parse(await file.text()); } catch { msg.textContent = 'That file isn’t valid JSON.'; return; }
  const n = Array.isArray(data.items) ? data.items.length : 0;
  if (!n) { msg.textContent = 'That doesn’t look like a MyShelf backup.'; return; }
  if (!window.confirm(`Restore ${n} entries from this backup? Entries with the same name here will be replaced.`)) return;
  try {
    msg.textContent = 'Restoring entries…';
    const { items } = await api('restore', { method: 'POST', body: data });
    let origin = data.origin && data.origin !== location.origin ? data.origin : '';
    if (!data.origin) origin = window.prompt('Where was this backup made? Enter the old site’s address to copy its covers (leave blank to skip).', '') || '';
    let copied = 0, failed = 0;
    if (origin) {
      let offset = 0;
      for (let i = 0; i < 1000; i++) {
        const r = await api('restore?covers=1', { method: 'POST', body: { origin, offset } });
        copied += r.copied; failed += r.failed; offset = r.next;
        msg.textContent = `Restored ${items} entries. Copying covers… ${Math.min(offset, r.total)} / ${r.total}`;
        if (r.done) break;
      }
    }
    msg.textContent = `Restored ${items} entries${origin ? `, copied ${copied} cover${copied === 1 ? '' : 's'}${failed ? ` (${failed} couldn’t be copied)` : ''}` : ''}.`;
    document.dispatchEvent(new CustomEvent('myshelf:library-changed'));
    loadSite();
    toast('Restore finished.');
  } catch (err) {
    msg.textContent = err.message;
  }
});
