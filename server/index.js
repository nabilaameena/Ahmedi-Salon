import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { songs, rotations, songsBySlug } from '../src/data.js';
import { Store } from './store.js';
import { Station, rotationForHour } from './station.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'saloon';

const store = new Store();
const station = new Station(store);

const app = express();
app.use(express.json());

// ---- REST API -------------------------------------------------------
app.get('/api/state', (_req, res) => res.json(station.state()));
app.get('/api/songs', (_req, res) => res.json(songs));
app.get('/api/rotations', (_req, res) => res.json(rotations));
app.get('/api/schedule', (_req, res) => res.json(station.schedule()));
app.get('/api/requests', (_req, res) => res.json(station.requestList()));
app.get('/api/stats', (_req, res) => res.json({ listeners: clients.size, ...station.stats() }));

app.post('/api/request', (req, res) => {
  const slug = String(req.body?.slug || '');
  const count = station.addRequest(slug);
  if (count == null) return res.status(404).json({ error: 'unknown song' });
  broadcast({ type: 'requests', items: station.requestList() });
  res.json({ slug, count });
});

app.post('/api/admin/check', (req, res) => {
  if (req.body?.token !== ADMIN_TOKEN) return res.status(401).json({ error: 'no' });
  res.json({ ok: true });
});

app.post('/api/admin/skip', (req, res) => {
  if (req.body?.token !== ADMIN_TOKEN) return res.status(401).json({ error: 'no' });
  station.skip();
  broadcastStation();
  res.json(station.state());
});

app.post('/api/admin/rotation', (req, res) => {
  if (req.body?.token !== ADMIN_TOKEN) return res.status(401).json({ error: 'no' });
  const song = station.forceRotation(String(req.body?.slug || ''));
  if (!song) return res.status(404).json({ error: 'unknown rotation' });
  broadcastStation();
  res.json(station.state());
});

// ---- Static frontend (production) -----------------------------------
const distDir = path.resolve(__dirname, '../dist');
app.use(express.static(distDir));
// SPA fallback (hash routing, but be safe for any path)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
  res.sendFile(path.join(distDir, 'index.html'), (err) => { if (err) next(err); });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Set();

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(data);
}

function broadcastStation() {
  broadcast({ type: 'station', ...station.state() });
  broadcast({ type: 'upnext', song: station.nextSong() });
  broadcast({ type: 'requests', items: station.requestList() });
}

function send(ws, msg) { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); }

wss.on('connection', (ws) => {
  clients.add(ws);
  store.setPeak(clients.size);
  store.incrementUsers();
  broadcast({ type: 'presence', count: clients.size });
  broadcast({ type: 'stats', listeners: clients.size, ...station.stats() });

  // Initial snapshot for the new listener.
  send(ws, { type: 'station', ...station.state() });
  send(ws, { type: 'upnext', song: station.nextSong() });
  send(ws, { type: 'schedule', rotations: station.schedule() });
  send(ws, { type: 'requests', items: station.requestList() });
  send(ws, { type: 'chat:history', messages: store.data.chat.slice(-50) });
  send(ws, { type: 'presence', count: clients.size });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    switch (msg.type) {
      case 'track:ended': {
        const newSong = station.reportEnded(msg.videoId);
        if (newSong) broadcastStation();
        break;
      }
      case 'track:duration': {
        station.reportDuration(msg.videoId, Number(msg.duration));
        break;
      }
      case 'chat': {
        const text = String(msg.text || '').slice(0, 240).trim();
        if (!text) break;
        const entry = { id: crypto.randomUUID(), text, at: Date.now() };
        store.pushChat(entry);
        broadcast({ type: 'chat', ...entry });
        break;
      }
      case 'request': {
        const count = station.addRequest(String(msg.slug));
        if (count != null) broadcast({ type: 'requests', items: station.requestList() });
        break;
      }
      case 'reaction': {
        // Ephemeral floating emote — broadcast to everyone, no persistence.
        const emoji = String(msg.emoji || '').slice(0, 8);
        if (!emoji) break;
        broadcast({ type: 'reaction', emoji, id: crypto.randomUUID(), at: Date.now() });
        break;
      }
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    broadcast({ type: 'presence', count: clients.size });
    broadcast({ type: 'stats', listeners: clients.size, ...station.stats() });
  });
});

// Safety auto-advance in case no client reports track end.
setInterval(() => {
  if (station.maybeAutoAdvance()) broadcastStation();
}, 5000);

server.listen(PORT, () => {
  console.log(`Ahmedi Salon station on http://0.0.0.0:${PORT}`);
  console.log(`Now playing: ${station.currentSong()?.en || '—'} (${station.rotation})`);
});