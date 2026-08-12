// Web Notifications for the now-playing track. Requests permission after the
// user tunes in (a gesture, as browsers require) and posts an updating
// notification (single tag, so it replaces rather than stacks) on each track
// change, with the YouTube thumbnail as the image.

import { toast } from './toast.js';

export function notifySupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function ensurePermission() {
  if (!notifySupported()) return 'unsupported';
  if (Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch { /* ignore */ }
  }
  return Notification.permission;
}

let lastVideoId = null;

export function notifyNowPlaying(song) {
  if (!notifySupported() || Notification.permission !== 'granted') return;
  if (!song || !song.videoId || song.videoId === lastVideoId) return;
  lastVideoId = song.videoId;
  try {
    const n = new Notification('अहमेदी सैलून · ' + (song.hi || 'now playing'), {
      body: `${song.en || ''} · ${song.film || ''}\n${song.artist || ''}${song.year ? ' · ' + song.year : ''}`,
      tag: 'ahmedi-now-playing',
      icon: '/apple-touch-icon.png',
      image: `https://i.ytimg.com/vi/${song.videoId}/hqdefault.jpg`,
      silent: true,
    });
    // Close after a while on desktop so it doesn't linger forever.
    setTimeout(() => { try { n.close(); } catch {} }, 10000);
    n.onclick = () => { window.focus(); n.close(); };
  } catch { /* notification creation can fail in some contexts */ }
}

export async function enableNotifications() {
  const res = await ensurePermission();
  if (res === 'granted') {
    toast('Notifications on — you’ll see what’s playing.', 'success');
    return true;
  }
  if (res === 'denied') toast('Notifications are blocked in your browser settings.', 'error', 4000);
  return false;
}