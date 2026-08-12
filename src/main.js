import './styles.css';
import backdropDesktop from './assets/backdrop.png';
import backdropMobile from './assets/backdrop-mobile.png';

import { songs } from './data.js';
import * as player from './player.js';
import { station, connectStation, reportEnded, reportDuration, tuneIn } from './station.js';
import { checkToken } from './admin.js';
import {
  renderShell, renderView, renderTabs, renderPresence, renderPlayer,
  bindPlayerEvents, currentRoute, navigate, appendChat,
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
player.initPlayer({
  onEnded: (videoId) => reportEnded(videoId),
  onDuration: (videoId, dur) => reportDuration(videoId, dur),
  onPlayingState: (playing) => {
    const btn = document.getElementById('playBtn');
    if (btn) btn.innerHTML = playing
      ? '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  },
});

// ---- Station callbacks ----------------------------------------------
connectStation({
  onStation: (s) => {
    player.syncTo(s.videoId, s.startedAt);
    refresh();
  },
  onUpNext: () => { if (currentRoute() !== 'wall') renderView(); },
  onRequests: () => { if (currentRoute() !== 'wall') renderView(); },
  onSchedule: () => { if (currentRoute() !== 'wall') renderView(); },
  onPresence: () => renderPresence(),
  onStats: () => { if (currentRoute() === 'home') renderView(); },
  onChat: (m) => appendChat(m),
  onChatHistory: () => { if (currentRoute() === 'wall') renderView(); },
});

// ---- Tune-in / playback -------------------------------------------
function doTuneIn() {
  const btn = document.getElementById('tuneInBtn');
  if (btn) btn.style.display = 'none';
  tuneIn();
  player.setTunedIn(true);
  player.play();
}
function onPlayClick() {
  if (!station.tunedIn) doTuneIn();
  else player.toggle();
}

// ---- Shell + routing ------------------------------------------------
renderShell({
  onTuneIn: doTuneIn,
  onPlayClick: onPlayClick,
  onAdmin: async () => {
    const t = (prompt('Admin token:') || '').trim();
    if (!t) return;
    const ok = await checkToken(t);
    alert(ok ? 'Admin token accepted — skip & switch are enabled.' : 'Wrong admin token.');
  },
});
renderTabs();
renderView();
renderPresence();
bindPlayerEvents();

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