// Admin actions (skip, switch rotation) hit the REST endpoints and give
// real feedback via toasts — no silent failures, no browser alerts.

import { toast } from './toast.js';

export function getToken() { return localStorage.getItem('saloonAdmin') || ''; }
export function hasAdminToken() { return !!localStorage.getItem('saloonAdmin'); }

const authListeners = new Set();
export function onAuthChange(fn) { authListeners.add(fn); }
function notifyAuth() { for (const fn of authListeners) fn(); }

export function clearToken() { localStorage.removeItem('saloonAdmin'); notifyAuth(); }

async function post(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Validate a token; store it on success, clear on failure. Returns boolean. */
export async function checkToken(token) {
  const r = await post('/api/admin/check', { token });
  if (r.ok) { localStorage.setItem('saloonAdmin', token); notifyAuth(); return true; }
  clearToken();
  return false;
}

// The skip / switch buttons are only shown when a token is present, so these
// are only ever called as an admin. Network errors are caught + toasted.
async function adminAction(url, body, okMsg, failMsg) {
  const t = getToken();
  if (!t) return;
  try {
    const r = await post(url, body);
    if (r.status === 401) { toast(failMsg, 'error'); clearToken(); return; }
    if (!r.ok) { toast(failMsg, 'error'); return; }
    if (okMsg) toast(okMsg, 'success');
  } catch {
    toast('Couldn’t reach the station. Try again.', 'error');
  }
}

export function doSkip() {
  return adminAction('/api/admin/skip', { token: getToken() }, 'Skipped.', 'Wrong admin token — not skipped.');
}

export function doSwitch(slug) {
  return adminAction('/api/admin/rotation', { slug, token: getToken() }, 'Rotation switched.', 'Wrong admin token — rotation not changed.');
}