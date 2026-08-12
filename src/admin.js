// Admin actions (skip, switch rotation) hit the REST endpoints and give
// real feedback on a wrong/missing token — instead of silently failing
// over the WebSocket like the older version did.

export function getToken() { return localStorage.getItem('saloonAdmin') || ''; }
export function clearToken() { localStorage.removeItem('saloonAdmin'); }

async function post(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function promptToken(action) {
  const t = (prompt(`Admin token — ${action}:`) || '').trim();
  if (t) localStorage.setItem('saloonAdmin', t);
  return t;
}

/** Validate the token currently in storage (used by the gear button). */
export async function checkToken(token) {
  const r = await post('/api/admin/check', { token });
  if (r.ok) { localStorage.setItem('saloonAdmin', token); return true; }
  clearToken();
  return false;
}

export async function doSkip() {
  let t = getToken();
  if (!t) t = promptToken('skip the station');
  if (!t) return;
  const r = await post('/api/admin/skip', { token: t });
  if (r.status === 401) {
    alert('Wrong admin token — not skipped.');
    clearToken();
  }
}

export async function doSwitch(slug) {
  let t = getToken();
  if (!t) t = promptToken('switch the station rotation');
  if (!t) return;
  const r = await post('/api/admin/rotation', { slug, token: t });
  if (r.status === 401) {
    alert('Wrong admin token — rotation not changed.');
    clearToken();
  }
}