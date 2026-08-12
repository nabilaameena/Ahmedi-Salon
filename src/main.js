import './styles.css';
import backdropDesktop from './assets/backdrop.png';
import backdropMobile from './assets/backdrop-mobile.png';

import { songs } from './data.js';
import * as player from './player.js';
import { station, connectStation, reportEnded, reportDuration, tuneIn } from './station.js';
import { onAuthChange } from './admin.js';
import { enableNotifications, notifyNowPlaying } from './notify.js';
import {
  renderShell, renderView, renderTabs, renderPresence, renderPlayer,
  bindPlayerEvents, currentRoute, navigate, appendChat,
  updateNowPlaying, spawnReaction, setBackdropRotation, updateAdminControls,
} from './views.js';

// Backdrop images (imported so Vite resolves correct relative URLs).
document.documentElement.style.setProperty('--bg-mobile', `url(${backdropMobile})`);
document.documentElement.style.setProperty('--bg-desktop', `url(${backdropDesktop})`);

// ---- Re-render helpers ----------------------------------------------
function refresh() {
  renderTabs();
  renderPresence();
  renderPlayer();
  if (currentRoute() !== 'wall') renderView();
}

// ---- Player callbacks -----------------------------------------------
const PLAY_ICON = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
player.initPlayer({
  onEnded: (videoId) => reportEnded(videoId),
  onDuration: (videoId, dur) => reportDuration(videoId, dur),
  onPlayingState: (playing) => {
    const html = playing ? PAUSE_ICON : PLAY_ICON;
    for (const id of ['playBtn', 'npPlayBtn']) {
      const b = document.getElementById(id);
      if (b) b.innerHTML = html;
    }
  },
});

// ---- Station callbacks ----------------------------------------------
connectStation({
  onStation: (s) => {
    player.syncTo(s.videoId, s.startedAt);
    refresh();
    if (station.tunedIn) notifyNowPlaying(s.song);
  },
  onUpNext: () => { if (currentRoute() !== 'wall') renderView(); },
  onRequests: () => { if (currentRoute() !== 'wall') renderView(); },
  onSchedule: () => { if (currentRoute() !== 'wall') renderView(); },
  onPresence: () => { renderPresence(); updateNowPlaying(); },
  onStats: () => { if (currentRoute() === 'home') renderView(); updateNowPlaying(); },
  onChat: (m) => appendChat(m),
  onChatHistory: () => { if (currentRoute() === 'wall') renderView(); },
  onReaction: (m) => spawnReaction(m.emoji),
});

// ---- Tune-in / playback -------------------------------------------
function doTuneIn() {
  const btn = document.getElementById('tuneInBtn');
  if (btn) btn.style.display = 'none';
  tuneIn();
  player.setTunedIn(true);
  player.play();
  enableNotifications().then((on) => { if (on) notifyNowPlaying(station.song); });
}
function onPlayClick() {
  if (!station.tunedIn) doTuneIn();
  else player.toggle();
}

// ---- Shell + routing ------------------------------------------------
renderShell({
  onTuneIn: doTuneIn,
  onPlayClick: onPlayClick,
});
renderTabs();
renderView();
renderPresence();
bindPlayerEvents();
updateAdminControls();

// Re-render admin-gated controls when the token is set or cleared.
onAuthChange(() => {
  updateAdminControls();
  renderView();
});

window.addEventListener('hashchange', () => {
  renderTabs();
  renderView();
});

// ---- PWA install ----------------------------------------------------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('installBtn');
  if (btn) {
    btn.style.display = 'inline-flex';
    btn.onclick = async () => {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      btn.style.display = 'none';
    };
  }
});

// Service worker for offline shell (optional, progressive)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}