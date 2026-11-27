// Debug log, in two places on Manage:
// - Settings → Debug log (signed in): health checks, the site's own log (server errors, auto-update runs) and this
//   device's log (page crashes, failed requests; collected by the script at the top of Base.astro).
// - "Having trouble? View debug log" on the sign-in screen (signed out): health checks and this device's log only.
//   The site's log stays behind sign-in, since anyone can open the sign-in screen.
const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const token = () => { try { return localStorage.getItem('myshelf_token') || ''; } catch { return ''; } };
const device = () => window.myshelfDebug?.list().slice().reverse() || [];
const when = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

async function getHealth() {
  try {
    const r = await fetch('/health.json', { cache: 'no-store' });
    return await r.json();
  } catch (err) {
    return { error: `Couldn’t reach the site: ${err.message}` };
  }
}

async function getServerLog() {
  const r = await fetch('/api/logs', { headers: { authorization: `Bearer ${token()}` } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
  return d.logs || [];
}

function healthHtml(h) {
  if (h.error) return `<p class="error">${esc(h.error)}</p>`;
  const v = [h.version && `MyShelf ${esc(h.version)}`, h.commit && `<code>${esc(h.commit)}</code>`].filter(Boolean).join(' · ');
  return `<ul class="debug-health">${(h.checks || []).map((c) => `<li class="${c.ok ? 'ok' : 'bad'}"><span aria-hidden="true">${c.ok ? '✓' : '✕'}</span> <strong>${esc(c.name)}</strong> <span class="muted small">${esc(c.note)}</span></li>`).join('')}</ul>${v ? `<p class="muted small">${v}</p>` : ''}`;
}

function entriesHtml(rows, empty) {
  if (!rows.length) return `<p class="muted small">${esc(empty)}</p>`;
  return `<ol class="debug-entries">${rows.map((e) => `<li class="debug-${esc(e.level)}">
    <div class="debug-head"><span class="debug-level">${esc(e.level)}</span> <span class="muted small">${esc(when(e.at))}${e.source || e.page ? ` · ${esc(e.source || e.page)}` : ''}</span></div>
    <div class="debug-msg">${esc(e.message)}</div>
    ${e.detail ? `<details><summary class="muted small">Details</summary><pre>${esc(e.detail)}</pre></details>` : ''}
  </li>`).join('')}</ol>`;
}

function asText(h, server, dev) {
  const line = (e) => `${e.at} [${e.level}] ${e.source || e.page || ''} ${e.message}${e.detail ? `\n    ${e.detail.split('\n').join('\n    ')}` : ''}`;
  const parts = [`MyShelf debug log, copied ${new Date().toISOString()}`, `Page: ${location.href}`, `Browser: ${navigator.userAgent}`];
  if (h && !h.error) parts.push(`Version: ${h.version || '?'} ${h.commit || ''}`, ...(h.checks || []).map((c) => `${c.ok ? 'OK ' : 'BAD'} ${c.name}: ${c.note}`));
  if (server) parts.push('', '== Site log ==', ...(server.length ? server.map(line) : ['(empty)']));
  parts.push('', '== This device ==', ...(dev.length ? dev.map(line) : ['(empty)']));
  return parts.join('\n');
}

/** Draw the debug log into `box`. signedIn: also show (and allow clearing) the site's own log. */
export async function renderDebugLog(box, { signedIn = false } = {}) {
  box.innerHTML = '<p class="muted">Loading…</p>';
  let server = null, serverErr = '';
  const [h] = await Promise.all([
    getHealth(),
    signedIn ? getServerLog().then((r) => { server = r; }, (err) => { serverErr = err.message; }) : null,
  ]);
  const dev = device();
  box.innerHTML = `
    <h3>Health</h3>${healthHtml(h)}
    ${signedIn ? `<h3>Site log <span class="muted small">(errors on the server, and what automatic updates did)</span></h3>
      ${serverErr ? `<p class="error">${esc(serverErr)}</p>` : entriesHtml(server, 'Nothing logged. That’s good news.')}` : ''}
    <h3>This device <span class="muted small">(page crashes and failed requests in this browser)</span></h3>
    ${entriesHtml(dev, 'Nothing logged in this browser.')}
    ${signedIn ? '' : '<p class="muted small">Sign in to also see the site’s own log.</p>'}
    <div class="row">
      <button type="button" class="btn ghost small" data-debug="copy">Copy all</button>
      <button type="button" class="btn ghost small" data-debug="refresh">Refresh</button>
      <button type="button" class="btn ghost small" data-debug="clear">Clear</button>
      <span class="muted small" data-debug-msg></span>
    </div>`;
  box.onclick = async (e) => {
    const b = e.target.closest('[data-debug]');
    if (!b) return;
    const msg = $('[data-debug-msg]', box);
    if (b.dataset.debug === 'refresh') return renderDebugLog(box, { signedIn });
    if (b.dataset.debug === 'copy') {
      try { await navigator.clipboard.writeText(asText(h, server, dev)); msg.textContent = 'Copied.'; }
      catch { msg.textContent = 'Couldn’t copy. Select the text and copy it instead.'; }
      return;
    }
    if (b.dataset.debug === 'clear') {
      window.myshelfDebug?.clear();
      if (signedIn) {
        try { await fetch('/api/logs', { method: 'DELETE', headers: { authorization: `Bearer ${token()}` } }); } catch {}
      }
      return renderDebugLog(box, { signedIn });
    }
  };
}

// Signed out: the link under the sign-in form.
const loginBox = $('#login-debug');
loginBox?.addEventListener('toggle', () => { if (loginBox.open) renderDebugLog($('#login-debug-body'), { signedIn: false }); });
// Signed in: Settings → Debug log, loaded when the Settings tab opens.
document.addEventListener('myshelf:tab', (e) => { if (e.detail === 'settings' && $('#debug-log')) renderDebugLog($('#debug-log'), { signedIn: true }); });
