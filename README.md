# अहमेदी सैलून · Ahmedi Salon

> _An always-on, synchronised street-corner radio playing 90s Bollywood film
> songs — the kind of tape that never stops at a neighbourhood barber shop._

Inspired by **[Deluxe Salon](https://deluxesaloon.in)** — a love letter to the
music that fills Indian barber shops, reimagined as a full-stack, self-hostable
radio station.

Everyone tuned in at the same moment hears the same track at the same position,
like a real station. A server-driven clock keeps every listener in sync; when a
track ends, the station advances and broadcasts the next one to all clients.
Audio is streamed through YouTube's embedded player — nothing is hosted here,
and all rights stay with the labels, composers and performers.

---

## ✨ Features

- **Synchronised radio** — a server-driven station clock seek-syncs every
  listener to the same moment. No two people hear different songs.
- **Live presence** — a real concurrent-listener count over WebSocket.
- **Song requests** — tap any song to request it; the station plays the
  most-requested track next (vote tally tracked server-side).
- **Listener wall** — a live chat that broadcasts to everyone tuned in.
- **Four rotations** of 60 tracks, auto-picked by the hour in India (IST):
  - `05:00–09:00` — Shaadi & Sunday
  - `09:00–18:00` — Saloon Classics
  - `18:00–22:00` — 90s Dard
  - `22:00–05:00` — Highway Raat
- **Up next**, **day schedule**, and **station stats** (listeners now, peak,
  all-time plays).
- **Admin controls** — token-protected skip and force-rotation, with feedback.
- **PWA** — installable, manifest, service worker (offline shell), theme colour.
- 133 songs (1986–2001) with Hindi + Romanised titles, film, artist and year.
- Frosted-glass UI over an illustrated Indian street-corner backdrop.

## 🛠 Built with

- **Vite + vanilla JS** — the front end, no framework
- **Node + Express + `ws`** — a tiny station server (REST + WebSocket)
- **YouTube IFrame API** — the audio source
- **Docker** — one-command, self-contained deploy

## 🏗 Architecture

```
Browser ──REST /api──▶ Node server (Express) ── serves built dist/
        ──WS   /ws──▶ WebSocket hub ──▶ Station scheduler (IST rotations + requests)
                                     Store (JSON persistence: durations, chat, listens, peak)
```

```
index.html              app shell + meta
vite.config.js          build config + dev proxy to the backend
Dockerfile              multi-stage: build frontend → runtime (server + dist)
docker-compose.yml      one-command run with a persisted volume
server/
  index.js              Express + WebSocket hub, REST API, static serving
  station.js            station state machine (rotations, requests, advance)
  store.js              JSON-file persistence
  package.json          express, ws
src/
  main.js               boot, routing, glue
  views.js              all UI rendering
  admin.js              token-aware admin actions (skip, switch) over REST
  station.js            WebSocket client + shared state
  player.js             YouTube IFrame wrapper with live-sync
  lib.js                DOM + icon helpers
  data.js               songs + rotations (single source of truth)
  styles.css            the whole UI
  assets/               backdrop images (imported, hashed at build)
public/                 favicon, manifest, service worker, share image
```

## 🚀 Quick start (Docker)

```bash
docker compose up --build -d      # http://localhost:8080
```

Station state (durations, chat, listen counts, peak) persists in the
`saloon-data` volume. Set your own admin token:

```bash
ADMIN_TOKEN=change-me docker compose up --build -d
```

## 💻 Local development

```bash
npm run install:all    # install root + server deps
npm run dev            # server (8080) + web (5173) together
```

`vite.config.js` proxies `/api` and `/ws` to the backend, so the frontend talks
to the server in dev with no CORS setup.

```bash
npm run build          # build the frontend to dist/
npm run preview        # build, then serve via the Node server
```

## 🌐 Deploy to your own domain

The container is a single self-contained service — deploy it anywhere that runs
Docker (a VPS, Fly.io, Render, Railway, Cloud Run, ECS, k8s). Point your domain
at port `8080` and terminate TLS at your load balancer / reverse proxy.

Minimal **Caddy** example (auto-HTTPS):

```
your-domain.example {
  reverse_proxy ahmedi-salon:8080
}
```

For **WebSocket over HTTPS**, make sure your reverse proxy upgrades the `/ws`
connection (Caddy and Nginx do this by default for `reverse_proxy` / `proxy_pass`
with `Upgrade` headers).

### Without Docker

```bash
npm run install:all
npm run build
PORT=8080 ADMIN_TOKEN=change-me npm --prefix server start
```

Static files are served from `dist/` by the server, so you only need one process
behind any reverse proxy.

## 🔧 Before you ship — things to edit

- **Admin token** — set the `ADMIN_TOKEN` env var. The default is `saloon`;
  change it. Enter it in the browser via the **⚙** button to enable skip and
  force-rotation.
- **Spotify / YouTube Music links** — set `LINKS` at the top of `src/views.js`.
- **Social share image** — in `index.html`, replace
  `https://your-domain.example/social-share.png` with your real domain.
- **Scaling** — the server holds station state in memory + a JSON file, which is
  fine for one instance. For multiple replicas, move state to Redis/Postgres and
  run the WebSocket hub behind a sticky-session or pub/sub layer.

## ⏱ How synchronisation works

The server keeps `startedAt` (ms) for the current track. On connect, each
client receives `{videoId, startedAt}` and, once the user has tuned in (a
gesture, to satisfy autoplay policies), loads the YouTube video and seeks to
`(now - startedAt) / 1000`. When a client's player reaches the end it sends
`track:ended`; the server advances and rebroadcasts. A safety timer also
auto-advances past a known duration if no client reports.

## 📄 License

MIT — see [LICENSE](./LICENSE). The song data and backdrop artwork are included
for personal/non-commercial enjoyment; all rights to the music, films and
recordings remain with their respective owners.

## 🙏 Credits & rights

Audio plays through YouTube's embedded player. Nothing is hosted here, and all
rights stay with the labels, composers and performers. Song credits were
assembled from film soundtrack listings. If you hold rights to anything here and
want it taken off, remove the entry from `src/data.js`.

This project is **inspired by [Deluxe Salon](https://deluxesaloon.in)** — built
from scratch as a self-hostable, full-stack tribute to the barber-shop radio
that soundtracks so many Indian afternoons.