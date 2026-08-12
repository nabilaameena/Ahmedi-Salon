// All view rendering. The app re-renders on every station state change.
import { el, $, I, relTime } from './lib.js';
import { songs, rotations, songsBySlug } from './data.js';
import { station, requestSong, postChat } from './station.js';
import { doSkip, doSwitch } from './admin.js';
import { toggle, setVolume, seekToPercent } from './player.js';

// ---- Links (edit to your own playlists) -----------------------------
const LINKS = {
  spotify: 'https://open.spotify.com/',
  youtube: 'https://music.youtube.com/',
};

// ---- Shell ----------------------------------------------------------
export function renderShell(handlers) {
  const app = $('#app');
  app.innerHTML = '';
  app.appendChild(el('div', { class: 'backdrop' }));

  // top bar
  const top = el('div', { class: 'topbar' });
  top.appendChild(el('div', { class: 'left' },
    el('button', { id: 'menuBtn', class: 'pill', title: 'Browse', 'aria-label': 'Browse', html: I.menu, onclick: openDrawer }),
    el('button', { id: 'installBtn', class: 'pill', title: 'Install app' }, 'Install'),
    el('button', { id: 'adminBtn', class: 'pill', title: 'Admin', html: I.gear, onclick: handlers.onAdmin })
  ));
  top.appendChild(el('div', { class: 'center' },
    el('span', { class: 'pill online' },
      el('span', { class: 'dot' }),
      el('span', { id: 'onlineCount' }, '—'),
      el('span', { style: 'opacity:0.7' }, 'online')
    )
  ));
  top.appendChild(el('div', { class: 'right' },
    el('a', { class: 'pill', href: LINKS.spotify, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Spotify', html: I.spotify },
      el('span', { class: 'hide-sm' }, 'Spotify')),
    el('a', { class: 'pill', href: LINKS.youtube, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'YouTube Music', html: I.yt },
      el('span', { class: 'hide-sm' }, 'YT Music'))
  ));
  app.appendChild(top);

  // hero (kept clean on the main screen)
  app.appendChild(el('div', { class: 'hero' },
    el('div', { class: 'hero-ornament' }, '✦'),
    el('h1', { class: 'logo' },
      el('span', { class: 'logo-line' }, 'अहमेदी'),
      el('span', { class: 'logo-line' }, 'सैलून')),
    el('p', { class: 'sub' }, 'open all hours'),
    el('div', { class: 'divider' }),
    el('button', { id: 'tuneInBtn', class: 'tune-btn hero-tune', onclick: handlers.onTuneIn }, 'Tune in')
  ));

  // drawer: all browsing content lives here, off-screen until opened
  app.appendChild(el('div', { id: 'drawerScrim', class: 'drawer-scrim', onclick: closeDrawer }));
  const drawer = el('aside', { id: 'drawer', class: 'drawer' });
  drawer.appendChild(el('div', { class: 'drawer-head' },
    el('span', { class: 'drawer-title' }, 'Browse'),
    el('button', { class: 'drawer-close', 'aria-label': 'Close', html: I.close, onclick: closeDrawer })
  ));
  drawer.appendChild(el('p', { class: 'lede' },
    '90s Hindi film songs, playing round the clock — the kind of tape that never stops at a neighbourhood barber shop. Everyone tuned in hears the same track at the same moment.'));
  drawer.appendChild(el('nav', { class: 'tabs' },
    el('button', { class: 'tab', 'data-route': 'home', onclick: () => navigate('') }, 'On Air'),
    el('button', { class: 'tab', 'data-route': 'songs', onclick: () => navigate('#/songs') }, 'Songs'),
    el('button', { class: 'tab', 'data-route': 'playlists', onclick: () => navigate('#/playlists') }, 'Playlists'),
    el('button', { class: 'tab', 'data-route': 'wall', onclick: () => navigate('#/wall') }, 'Wall'),
  ));
  drawer.appendChild(el('div', { id: 'view' }));
  drawer.appendChild(el('footer', { class: 'foot' },
    'Audio plays through YouTube’s embedded player. Nothing is hosted here; all rights stay with the labels, composers and performers.'
  ));
  app.appendChild(drawer);

  // player bar
  app.appendChild(renderPlayerBar(handlers));
  app.appendChild(el('div', { id: 'yt-player', style: 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none' }));
}

// ---- Drawer ---------------------------------------------------------
export function openDrawer() {
  document.getElementById('drawer')?.classList.add('open');
  document.getElementById('drawerScrim')?.classList.add('open');
}
export function closeDrawer() {
  document.getElementById('drawer')?.classList.remove('open');
  document.getElementById('drawerScrim')?.classList.remove('open');
}

// ---- Player bar -----------------------------------------------------
export function renderPlayerBar(handlers = {}) {
  const s = station.song;
  const bar = el('div', { class: 'player' });
  bar.appendChild(el('div', { class: 'now' },
    el('div', { class: 'art' }, s ? s.hi.charAt(0) : '♪'),
    el('div', { class: 'now-meta' },
      el('div', { class: 'now-title' }, s ? s.hi : 'ट्यूनिंग इन — अहमेदी सैलून रेडियो'),
      el('div', { class: 'now-sub' }, s ? `${s.en} · ${s.film}` : 'Tap play to tune in')
    )
  ));
  bar.appendChild(el('div', { class: 'seek-wrap' },
    el('input', { id: 'seek', type: 'range', min: '0', max: '100', value: '0' }),
    el('div', { class: 'time' },
      el('span', { id: 'cur' }, '0:00'),
      el('span', { id: 'dur' }, '0:00')
    )
  ));
  bar.appendChild(el('div', { class: 'controls' },
    el('button', { class: 'ctrl', id: 'prevBtn', 'aria-label': 'Restart track', html: I.prev, onclick: () => seekToPercent(0) }),
    el('button', { class: 'ctrl main', id: 'playBtn', 'aria-label': 'Play or pause', html: I.play, onclick: handlers.onPlayClick || toggle }),
    el('button', { class: 'ctrl', id: 'nextBtn', title: 'Skip (needs admin token)', 'aria-label': 'Skip', html: I.next, onclick: doSkip })
  ));
  bar.appendChild(el('div', { class: 'vol' },
    el('span', { html: I.vol, style: 'display:flex' }),
    el('input', { id: 'volume', type: 'range', min: '0', max: '100', value: '70' })
  ));
  return bar;
}

export function renderPlayer() {
  if (!$('#playBtn')) return;
  const s = station.song;
  $('.player .now-title').textContent = s ? s.hi : 'ट्यूनिंग इन — अहमेदी सैलून रेडियो';
  $('.player .now-sub').textContent = s ? `${s.en} · ${s.film}` : 'Tap play to tune in';
  $('.player .art').textContent = s ? s.hi.charAt(0) : '♪';
}

// ---- Section header -------------------------------------------------
function sectionHead(eyebrow, hi, en, intro) {
  return el('div', { class: 'section-head' },
    el('p', { class: 'eyebrow' }, eyebrow),
    el('h2', {}, hi),
    en ? el('p', { class: 'en' }, en) : null,
    intro ? el('p', {}, intro) : null
  );
}

// ---- Song row (click = request) -------------------------------------
function requestCountFor(slug) {
  const r = station.requests.find(x => x.song && x.song.slug === slug);
  return r ? r.count : 0;
}

function songRow(song, i) {
  const isOnAir = station.song && station.song.videoId === song.videoId;
  const votes = requestCountFor(song.slug);
  return el('li', {},
    el('button', {
      class: 'song' + (isOnAir ? ' current' : '') + (votes ? ' has-votes' : ''),
      'aria-label': `Request ${song.en}`,
      onclick: () => { requestSong(song.slug); flash(song.slug); },
    },
      el('span', { class: 'num' },
        el('span', { class: 'num-text' }, String(i + 1).padStart(3, '0')),
        el('span', { html: I.bell, class: 'bell-icon' })
      ),
      el('span', { class: 'meta' },
        el('div', { class: 'title' }, song.hi,
          isOnAir ? el('span', { class: 'onair-tag' }, 'on air') : null),
        el('div', { class: 'sub' }, `${song.en} · ${song.film}`)
      ),
      el('span', { class: 'right' },
        el('div', { class: 'artist' }, song.artist),
        el('div', { class: 'year' }, votes ? `${votes}♥` : song.year)
      )
    )
  );
}

function flash(slug) {
  // brief visual confirmation — handled via re-render of votes
  const row = document.querySelector(`.song[data-slug="${slug}"]`);
  if (row) { row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 600); }
}

function renderList(list) {
  return el('ol', { class: 'song-list' }, list.map((s, i) => {
    const row = songRow(s, i);
    row.firstChild.setAttribute('data-slug', s.slug);
    return row;
  }));
}

// ---- On Air view ----------------------------------------------------
export function renderOnAir() {
  const view = $('#view');
  view.innerHTML = '';
  const r = rotations.find(x => x.slug === station.rotation) || rotations[0];
  const list = r.tracks.map(slug => songsBySlug[slug]).filter(Boolean);

  view.appendChild(sectionHead(
    `On air · ${r.window}`,
    r.hi, r.en,
    `${r.description} The station picks a rotation by the hour in India — this is what's playing right now. Tap any song to request it next.`
  ));

  // up next + requests row
  view.appendChild(renderNowStrip());

  // schedule strip
  view.appendChild(renderSchedule());

  view.appendChild(renderList(list));
}

function renderNowStrip() {
  const up = station.upNext;
  const reqs = station.requests.slice(0, 4);
  const box = el('div', { class: 'now-strip' });
  box.appendChild(el('div', { class: 'now-card' },
    el('div', { class: 'kicker' }, 'Up next'),
    up ? el('div', { class: 'up-title' }, up.hi) : el('div', { class: 'up-title dim' }, '—'),
    up ? el('div', { class: 'up-sub' }, `${up.en} · ${up.film}`) : null
  ));
  if (reqs.length) {
    box.appendChild(el('div', { class: 'now-card' },
      el('div', { class: 'kicker' }, 'Top requests'),
      ...reqs.map(rq => el('div', { class: 'req-row' },
        el('span', { class: 'req-title' }, rq.song.hi),
        el('span', { class: 'req-count' }, `${rq.count}♥`)
      ))
    ));
  }
  box.appendChild(el('div', { class: 'now-card' },
    el('div', { class: 'kicker' }, 'Station'),
    el('div', { class: 'stat-row' },
      el('span', {}, 'listening now'), el('span', { class: 'stat-val' }, String(station.listeners || 0))),
    el('div', { class: 'stat-row' },
      el('span', {}, 'peak today'), el('span', { class: 'stat-val' }, String(station.peak || 0))),
    el('div', { class: 'stat-row' },
      el('span', {}, 'all-time plays'), el('span', { class: 'stat-val' }, String(station.totalListens || 0)))
  ));
  return box;
}

function renderSchedule() {
  const wrap = el('div', { class: 'schedule' },
    el('div', { class: 'kicker' }, 'Today’s rotations')
  );
  for (const s of station.schedule.length ? station.schedule : rotations.map(r => ({ slug: r.slug, hi: r.hi, en: r.en, window: r.window, count: r.tracks.length }))) {
    const active = s.slug === station.rotation;
    wrap.appendChild(el('div', { class: 'sched-item' + (active ? ' active' : '') },
      el('span', { class: 'sched-window' }, s.window),
      el('span', { class: 'sched-name' }, s.en),
      active ? el('span', { class: 'sched-now' }, 'now') : null
    ));
  }
  return wrap;
}

// ---- Songs view -----------------------------------------------------
export function renderSongs() {
  const view = $('#view');
  view.innerHTML = '';
  view.appendChild(sectionHead(
    `${songs.length} records`,
    'सारे गाने', 'All songs',
    `${songs.length} records, ${Math.min(...songs.map(s => s.year))} to ${Math.max(...songs.map(s => s.year))}, in the order they were released. Tap any song to request it on the station.`
  ));
  view.appendChild(renderList(songs));
}

// ---- Playlists view ------------------------------------------------
export function renderPlaylists() {
  const view = $('#view');
  view.innerHTML = '';
  view.appendChild(sectionHead('Rotation', 'रोटेशन', 'Playlists',
    'The station runs four rotations and picks one by the hour in India. Open any of them to see the full sixty.'
  ));
  const deck = el('ul', { class: 'deck' });
  for (const r of rotations) {
    const card = el('div', {
      class: 'card' + (r.slug === station.rotation ? ' now' : ''),
      role: 'link', tabindex: '0',
      onclick: () => navigate(`#/playlists/${r.slug}`),
      onkeydown: (e) => { if (e.key === 'Enter') navigate(`#/playlists/${r.slug}`); },
    },
      el('div', { class: 'kicker' }, `${r.tracks.length} songs · ${r.window}${r.slug === station.rotation ? ' · on now' : ''}`),
      el('h3', {}, r.hi),
      el('p', { class: 'en' }, r.en),
      el('p', {}, r.description)
    );
    if (r.slug !== station.rotation) {
      card.appendChild(el('button', {
        class: 'switch-btn',
        onclick: (e) => { e.stopPropagation(); doSwitch(r.slug); },
      }, 'Switch station to this'));
    }
    deck.appendChild(el('li', {}, card));
  }
  view.appendChild(deck);
}

// ---- Playlist detail ------------------------------------------------
export function renderPlaylistDetail(slug) {
  const view = $('#view');
  view.innerHTML = '';
  const r = rotations.find(x => x.slug === slug);
  if (!r) {
    view.appendChild(el('p', {}, 'That rotation does not exist. '),
      el('button', { class: 'back-link', onclick: () => navigate('#/playlists') }, '← Back to playlists'));
    return;
  }
  const list = r.tracks.map(s => songsBySlug[s]).filter(Boolean);
  view.appendChild(el('button', { class: 'back-link', onclick: () => navigate('#/playlists') }, '← All rotations'));
  view.appendChild(sectionHead(`${r.tracks.length} songs · ${r.window}`, r.hi, r.en, r.description));
  view.appendChild(renderList(list));
}

// ---- Wall (chat) view ----------------------------------------------
export function renderWall() {
  const view = $('#view');
  view.innerHTML = '';
  view.appendChild(sectionHead('Listener wall', 'दीवार', 'The wall',
    'Leave a note for the shop. Short messages, broadcast to everyone tuned in right now.'
  ));
  const feed = el('div', { id: 'chatFeed' },
    ...station.chat.slice(-50).map(m => chatNode(m))
  );
  view.appendChild(feed);
  const input = el('div', { class: 'chat-input' },
    el('input', { id: 'chatText', type: 'text', maxlength: '240', placeholder: 'Say something to the shop…', onkeydown: (e) => { if (e.key === 'Enter') sendChat(); } }),
    el('button', { class: 'chat-send', 'aria-label': 'Send', html: I.send, onclick: sendChat })
  );
  view.appendChild(input);
  // scroll to bottom
  requestAnimationFrame(() => { feed.scrollTop = feed.scrollHeight; });
}

function chatNode(m) {
  return el('div', { class: 'chat-msg' },
    el('span', { class: 'chat-time' }, relTime(m.at)),
    el('span', { class: 'chat-text' }, m.text)
  );
}

function sendChat() {
  const inp = $('#chatText');
  if (!inp) return;
  const text = inp.value.trim();
  if (text) postChat(text);
  inp.value = '';
}

// Append a single new chat message without re-rendering the whole view.
export function appendChat(m) {
  const feed = $('#chatFeed');
  if (!feed) return;
  feed.appendChild(chatNode(m));
  feed.scrollTop = feed.scrollHeight;
  // keep last 80
  while (feed.children.length > 80) feed.removeChild(feed.firstChild);
}

// ---- Routing --------------------------------------------------------
export function navigate(hash) { location.hash = hash; }

export function currentRoute() {
  const h = location.hash;
  if (h === '' || h === '#/') return 'home';
  if (h === '#/songs') return 'songs';
  if (h === '#/playlists') return 'playlists';
  if (h === '#/wall') return 'wall';
  if (h.startsWith('#/playlists/')) return 'playlist';
  return 'home';
}

export function renderView() {
  const route = currentRoute();
  if (route === 'home') renderOnAir();
  else if (route === 'songs') renderSongs();
  else if (route === 'playlists') renderPlaylists();
  else if (route === 'wall') renderWall();
  else if (route === 'playlist') renderPlaylistDetail(location.hash.replace('#/playlists/', ''));
}

export function renderTabs() {
  const route = currentRoute();
  document.querySelectorAll('.tab').forEach(t => {
    const active = (t.dataset.route === route) ||
      (t.dataset.route === 'playlists' && route === 'playlist');
    t.classList.toggle('active', active);
  });
}

export function renderPresence() {
  const n = $('#onlineCount');
  if (n) n.textContent = String(station.listeners || 0);
}

export function bindPlayerEvents() {
  const seek = $('#seek');
  if (seek && !seek.dataset.bound) {
    seek.dataset.bound = '1';
    let seeking = false;
    seek.addEventListener('input', () => { seeking = true; });
    seek.addEventListener('change', () => { seekToPercent(seek.value); seeking = false; });
  }
  const vol = $('#volume');
  if (vol && !vol.dataset.bound) {
    vol.dataset.bound = '1';
    vol.addEventListener('input', () => setVolume(+vol.value));
  }
}