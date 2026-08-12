// Media Session (lock-screen / notification / hardware media controls) and a
// screen wake lock while playing. These are the best legitimate improvements for
// mobile playback with a YouTube IFrame source.
//
// NOTE: the YouTube IFrame is suspended by mobile browsers when the app is
// backgrounded (Home button), so true background audio isn't possible with this
// source — that would require a direct audio stream instead of the embed.

export function mediaSupported() {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator;
}

let bound = false;
export function setupMediaSession(handlers = {}) {
  if (bound || !mediaSupported()) return;
  bound = true;
  const set = (action, fn) => {
    try { navigator.mediaSession.setActionHandler(action, fn || null); } catch {}
  };
  set('play', handlers.play);
  set('pause', handlers.pause);
  set('stop', handlers.stop || null);
  // No seek/next/prev for a synchronised station — the station owns the queue.
  set('seekto', null);
  set('nexttrack', null);
  set('previoustrack', null);
}

export function setNowPlaying(song) {
  if (!mediaSupported() || !song || !song.videoId) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.hi || song.en || 'अहमेदी सैलून',
      artist: song.artist || '',
      album: song.film || 'अहमेदी सैलून',
      artwork: [
        { src: `https://i.ytimg.com/vi/${song.videoId}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' },
        { src: `https://i.ytimg.com/vi/${song.videoId}/maxresdefault.jpg`, sizes: '1280x720', type: 'image/jpeg' },
      ],
    });
  } catch {}
}

export function setPlaybackState(playing) {
  if (!mediaSupported()) return;
  try { navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; } catch {}
}

// ---- Screen wake lock (keeps the screen on while audio plays) -------------
let wakeLock = null;

export async function updateWakeLock(playing) {
  if (!('wakeLock' in navigator)) return;
  if (playing) {
    try {
      if (!wakeLock) wakeLock = await navigator.wakeLock.request('screen');
    } catch { /* user denied or unsupported */ }
  } else {
    try { wakeLock?.release(); } catch {}
    wakeLock = null;
  }
}

// Wake locks are released when the page is hidden; re-acquire on return if still playing.
export function bindWakeLockRelay(isPlaying) {
  if (!('wakeLock' in navigator)) return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isPlaying()) updateWakeLock(true);
  });
}