import fs from 'node:fs';

// Tiny JSON-file persistence. Good enough for a single-node radio station;
// swap for SQLite/Postgres if you ever run multiple instances.
const FILE = 'data/state.json';

const DEFAULTS = {
  durations: {},   // videoId -> seconds (learned from clients)
  requests: {},    // slug -> vote count (pending)
  listens: {},     // videoId -> lifetime play count
  chat: [],        // last N wall messages
  peak: 0,         // peak concurrent listeners
};

export class Store {
  constructor() {
    this.data = structuredClone(DEFAULTS);
    try {
      if (fs.existsSync(FILE)) {
        this.data = { ...this.data, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
      }
    } catch (e) {
      console.warn('store: could not load state, starting fresh:', e.message);
    }
    this._timer = null;
  }

  markDirty() {
    if (this._timer) return;
    this._timer = setTimeout(() => this.flush(), 2000);
  }

  flush() {
    this._timer = null;
    try {
      fs.mkdirSync('data', { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(this.data));
    } catch (e) {
      console.warn('store: flush failed:', e.message);
    }
  }

  pushChat(msg) {
    this.data.chat.push(msg);
    if (this.data.chat.length > 80) this.data.chat = this.data.chat.slice(-80);
    this.markDirty();
  }

  setPeak(n) {
    if (n > (this.data.peak || 0)) { this.data.peak = n; this.markDirty(); }
  }
}