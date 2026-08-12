import { rotations, songsBySlug } from '../src/data.js';

// IST is UTC+5:30. The station picks a rotation by the hour in India.
const IST_OFFSET_MIN = 330;

function istHour() {
  const now = new Date();
  const ist = new Date(now.getTime() + (now.getTimezoneOffset() + IST_OFFSET_MIN) * 60000);
  return ist.getHours();
}

export function rotationForHour(h) {
  if (h >= 5 && h < 9) return 'shaadi-sunday';
  if (h >= 9 && h < 18) return 'saloon-classics';
  if (h >= 18 && h < 22) return 'dard-90s';
  return 'highway-raat'; // 22:00–05:00 overnight
}

/**
 * The station is a shared, server-driven state machine. Every listener
 * connected at the same moment hears the same track at the same position.
 */
export class Station {
  constructor(store) {
    this.store = store;
    this.rotation = rotationForHour(istHour());
    this.order = this._orderFor(this.rotation);
    this.pos = 1;                 // index into `order` of the NEXT natural track
    this.current = this.order[0]; // slug currently playing
    this.startedAt = Date.now();
    this.requests = store.data.requests || {};
    this.durations = store.data.durations || {};
    this.listens = store.data.listens || {};
    this._countPlay(this.current);
  }

  _orderFor(slug) {
    const r = rotations.find((x) => x.slug === slug);
    return r ? r.tracks.slice() : [];
  }

  _countPlay(slug) {
    const s = songsBySlug[slug];
    if (!s) return;
    this.listens[s.videoId] = (this.listens[s.videoId] || 0) + 1;
    this.store.markDirty();
  }

  _topRequest() {
    const entries = Object.entries(this.requests);
    if (!entries.length) return null;
    entries.sort((a, b) => b[1] - a[1]); // most votes first
    return entries[0][0];
  }

  currentSong() { return songsBySlug[this.current] || null; }

  nextSong() {
    const top = this._topRequest();
    if (top) return songsBySlug[top] || null;
    return songsBySlug[this.order[this.pos]] || null;
  }

  /** Advance to the next track. Returns the new current song. */
  advance() {
    const top = this._topRequest();
    let next;
    if (top) {
      delete this.requests[top];
      next = top;
    } else {
      next = this.order[this.pos];
      this.pos = (this.pos + 1) % this.order.length;
    }
    this.current = next;
    this.startedAt = Date.now();
    this._countPlay(next);
    return this.currentSong();
  }

  /** A client reported its player reached the end of the current track. */
  reportEnded(videoId) {
    const cur = this.currentSong();
    if (cur && cur.videoId === videoId) return this.advance();
    return null;
  }

  reportDuration(videoId, dur) {
    if (dur && isFinite(dur) && dur > 0 && this.durations[videoId] !== dur) {
      this.durations[videoId] = dur;
      this.store.markDirty();
    }
  }

  /** Force a different rotation (admin). */
  forceRotation(slug) {
    if (!rotations.find((r) => r.slug === slug)) return null;
    this.rotation = slug;
    this.order = this._orderFor(slug);
    this.pos = 1;
    this.current = this.order[0];
    this.startedAt = Date.now();
    this._countPlay(this.current);
    return this.currentSong();
  }

  skip() { return this.advance(); }

  addRequest(slug) {
    if (!songsBySlug[slug]) return null;
    this.requests[slug] = (this.requests[slug] || 0) + 1;
    this.store.markDirty();
    return this.requests[slug];
  }

  /** Safety auto-advance: if we're well past a known duration, advance. */
  maybeAutoAdvance() {
    const cur = this.currentSong();
    if (!cur) return null;
    const dur = this.durations[cur.videoId];
    if (!dur) return null;
    const elapsed = (Date.now() - this.startedAt) / 1000;
    if (elapsed > dur + 8) return this.advance();
    return null;
  }

  state() {
    return {
      rotation: this.rotation,
      videoId: this.currentSong()?.videoId ?? null,
      startedAt: this.startedAt,
      song: this.currentSong(),
      upNext: this.nextSong(),
    };
  }

  schedule() {
    return rotations.map((r) => ({
      slug: r.slug, hi: r.hi, en: r.en, window: r.window, count: r.tracks.length,
    }));
  }

  requestList() {
    return Object.entries(this.requests)
      .sort((a, b) => b[1] - a[1])
      .map(([slug, count]) => ({ song: songsBySlug[slug], count }))
      .filter((x) => x.song);
  }

  stats() {
    const totalListens = Object.values(this.listens).reduce((a, b) => a + b, 0);
    return { peak: this.store.data.peak || 0, totalListens, totalUsers: this.store.data.totalUsers || 0 };
  }
}