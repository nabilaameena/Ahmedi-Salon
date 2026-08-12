// YouTube IFrame wrapper that syncs to the station's clock.
// The station is server-driven; this player seeks to the live position
// (now - startedAt) so every listener hears the same moment.

let player = null;
let playerReady = false;
let currentVideoId = null;
let targetStartedAt = null;
let lastSeekedVideoId = null;
let tunedIn = false;
let progressTimer = null;

const cb = { onEnded: null, onDuration: null, onPlayingState: null };

export function initPlayer(handlers = {}) {
  Object.assign(cb, handlers);
  loadAPI();
}

function loadAPI() {
  if (window.YT && window.YT.Player) { createPlayer(); return; }
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
  window.onYouTubeIframeAPIReady = createPlayer;
}

function createPlayer() {
  player = new YT.Player('yt-player', {
    height: '0', width: '0',
    videoId: '',
    playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, rel: 0 },
    events: { onReady: onReady, onStateChange: onStateChange, onError: onError },
  });
}

function onReady() {
  playerReady = true;
  if (currentVideoId) applySync();
}

function onError() { if (cb.onEnded) cb.onEnded(currentVideoId); }

function onStateChange(e) {
  if (e.data === YT.PlayerState.PLAYING) {
    // Seek to the live position once per track so we're in sync with the station.
    if (currentVideoId !== lastSeekedVideoId) {
      seekToLive();
      lastSeekedVideoId = currentVideoId;
    }
    startProgress();
    if (cb.onPlayingState) cb.onPlayingState(true);
    const dur = player.getDuration();
    if (dur && cb.onDuration) cb.onDuration(currentVideoId, dur);
  } else if (e.data === YT.PlayerState.PAUSED) {
    if (cb.onPlayingState) cb.onPlayingState(false);
  } else if (e.data === YT.PlayerState.ENDED) {
    if (cb.onEnded) cb.onEnded(currentVideoId);
  }
}

function seekToLive() {
  if (!playerReady || !targetStartedAt) return;
  const offset = (Date.now() - targetStartedAt) / 1000;
  const dur = player.getDuration ? player.getDuration() : 0;
  if (dur && offset >= dur) {
    // we're past the end — tell the station to advance
    if (cb.onEnded) cb.onEnded(currentVideoId);
    return;
  }
  player.seekTo(Math.max(0, offset), true);
}

function startProgress() {
  clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    if (!playerReady || !player.getCurrentTime) return;
    const cur = player.getCurrentTime();
    const dur = player.getDuration();
    if (dur > 0) {
      const seek = document.getElementById('seek');
      const curEl = document.getElementById('cur');
      const durEl = document.getElementById('dur');
      if (seek) seek.value = (cur / dur) * 100;
      if (curEl) curEl.textContent = fmt(cur);
      if (durEl) durEl.textContent = fmt(dur);
    }
  }, 500);
}

function fmt(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function applySync() {
  if (!playerReady || !currentVideoId) return;
  lastSeekedVideoId = null;
  if (tunedIn) player.loadVideoById(currentVideoId);   // loads + plays
  else player.cueVideoById(currentVideoId);            // load without playing
}

/** Tune the player to a station track. */
export function syncTo(videoId, startedAt) {
  currentVideoId = videoId;
  targetStartedAt = startedAt;
  if (playerReady) applySync();
}

export function setTunedIn(v) {
  tunedIn = v;
  if (v && playerReady && currentVideoId) {
    // user just gestured — start playing the live stream
    player.playVideo();
  }
}

export function isPlaying() {
  if (!playerReady || !player.getPlayerState) return false;
  return player.getPlayerState() === YT.PlayerState.PLAYING;
}

export function play() {
  if (!playerReady || !currentVideoId) return;
  seekToLive();
  player.playVideo();
}

export function pause() { if (playerReady) player.pauseVideo(); }

export function toggle() { if (isPlaying()) pause(); else play(); }

export function setVolume(v) { if (playerReady && player.setVolume) player.setVolume(v); }

export function seekToPercent(p) {
  if (!playerReady || !player.getDuration) return;
  player.seekTo((p / 100) * player.getDuration(), true);
}