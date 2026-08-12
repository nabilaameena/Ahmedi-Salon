// WebSocket client for the Ahmedi Salon station. Holds shared state
// (now playing, presence, requests, chat, schedule, stats) and notifies
// the UI through per-type callbacks registered at connect time.

import { toast } from './toast.js';

const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

export const station = {
  videoId: null,
  startedAt: null,
  song: null,
  upNext: null,
  rotation: null,
  listeners: 0,
  peak: 0,
  totalListens: 0,
  requests: [],
  schedule: [],
  chat: [],
  tunedIn: false,
};

let ws = null;
let reconnectTimer = null;
const cb = {};

export function connectStation(handlers = {}) {
  Object.assign(cb, handlers);
  let wasOpen = false;
  const open = () => {
    ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      clearTimeout(reconnectTimer);
      if (wasOpen) toast('Reconnected to the station.', 'success');
      wasOpen = true;
    };
    ws.onclose = () => {
      if (wasOpen) toast('Connection dropped — reconnecting…', 'default', 2500);
      reconnectTimer = setTimeout(open, 2000);
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
    ws.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      handle(msg);
    };
  };
  open();
}

function handle(msg) {
  switch (msg.type) {
    case 'station':
      station.videoId = msg.videoId;
      station.startedAt = msg.startedAt;
      station.song = msg.song;
      station.rotation = msg.rotation;
      if (cb.onStation) cb.onStation(station);
      break;
    case 'upnext':
      station.upNext = msg.song;
      if (cb.onUpNext) cb.onUpNext();
      break;
    case 'presence':
      station.listeners = msg.count;
      if (cb.onPresence) cb.onPresence();
      break;
    case 'stats':
      station.listeners = msg.listeners ?? station.listeners;
      station.peak = msg.peak ?? station.peak;
      station.totalListens = msg.totalListens ?? station.totalListens;
      if (cb.onStats) cb.onStats();
      break;
    case 'requests':
      station.requests = msg.items || [];
      if (cb.onRequests) cb.onRequests();
      break;
    case 'schedule':
      station.schedule = msg.rotations || [];
      if (cb.onSchedule) cb.onSchedule();
      break;
    case 'chat:history':
      station.chat = msg.messages || [];
      if (cb.onChatHistory) cb.onChatHistory();
      break;
    case 'reaction':
      if (cb.onReaction) cb.onReaction(msg);
      break;
    case 'chat':
      station.chat.push(msg);
      if (station.chat.length > 80) station.chat = station.chat.slice(-80);
      if (cb.onChat) cb.onChat(msg);
      break;
  }
}

export function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

export function requestSong(slug) { send({ type: 'request', slug }); }
export function postChat(text) { send({ type: 'chat', text }); }
export function sendReaction(emoji) { send({ type: 'reaction', emoji }); }
export function reportEnded(videoId) { send({ type: 'track:ended', videoId }); }
export function reportDuration(videoId, duration) { send({ type: 'track:duration', videoId, duration }); }

export function tuneIn() { station.tunedIn = true; }