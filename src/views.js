// All view rendering. The app re-renders on every station state change.
import { el, $, I, relTime } from './lib.js';
import { songs, rotations, songsBySlug } from './data.js';
import { station, requestSong, postChat, sendReaction } from './station.js';
import { doSkip, doSwitch, hasAdminToken, checkToken, clearToken, onAuthChange } from './admin.js';
import { toggle, setVolume, seekToPercent } from './player.js';
import { shareNowPlaying } from './share.js';
import { toast } from './toast.js';

// ---- Links -----------------------------------------------------------
const LINKS = {
  spotify: 'https://open.spotify.com/playlist/5ArVtGnLrImLZ8cQRQaRlZ?si=ab461580ab864318',
  youtube: 'https://music.youtube.com/playlist?list=PLb9iKZqdgfJg',
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
    el('button', { id: 'installBtn', class: 'pill', title: 'Install app' }, 'Install')
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
    el('button', { id: 'tuneInBtn', class: 'tune-btn hero-tune', onclick: handlers.onTuneIn }, 'Tune in'),
    el('a', { class: 'built-by', href: 'https://nabilahmed.in', target: '_blank', rel: 'noopener noreferrer' }, 'Built by Nabil')
  ));

  // drawer: all browsing content lives here, off-screen until opened
  app.appendChild(el('div', { id: 'drawerScrim', class: 'drawer-scrim', onclick: closeDrawer }));
  const drawer = el('aside', { id: 'drawer', class: 'drawer' });
  drawer.appendChild(el('div', { class: 'drawer-head' },
    el('span', { class: 'drawer-title' }, 'Browse'),
    el('div', { class: 'drawer-head-actions' },
      renderAdminWidget(),
      el('button', { class: 'drawer-close', 'aria-label': 'Close', html: I.close, onclick: closeDrawer })
    )
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
    'Audio plays through YouTube’s embedded player. Nothing is hosted here; all rights stay with the labels, composers and performers. ',
        el('br'),
        el('a', { class: 'built-by', href: 'https://nabilahmed.in', target: '_blank', rel: 'noopener noreferrer' }, 'Built by Nabil'),
        ' · Inspired by Deluxe Salon.'
  ));
  app.appendChild(drawer);

  // player bar
  app.appendChild(renderPlayerBar(handlers));
  app.appendChild(el('div', { id: 'yt-player', style: 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none' }));

  // floating reactions (rendered here, animated by spawnReaction)
  app.appendChild(el('div', { id: 'reactionLayer', class: 'reaction-layer' }));

  // compact reaction dock on the main screen
  app.appendChild(el('div', { id: 'reactionDock', class: 'reaction-dock' },
    ...REACTIONS.map((e) => el('button', { class: 'react-btn', 'aria-label': e.name, onclick: () => sendReaction(e.emoji), html: e.emoji }))
  ));

  // full-screen Now Playing overlay
  app.appendChild(renderNowPlaying());
}

const REACTIONS = [
  { emoji: '❤️', name: 'love' },
  { emoji: '🔥', name: 'fire' },
  { emoji: '👏', name: 'clap' },
  { emoji: '🎵', name: 'note' },
];

// ---- Drawer ---------------------------------------------------------
export function openDrawer() {
  document.getElementById('drawer')?.classList.add('open');
  document.getElementById('drawerScrim')?.classList.add('open');
}
export function closeDrawer() {
  document.getElementById('drawer')?.classList.remove('open');
  document.getElementById('drawerScrim')?.classList.remove('open');
}

// ---- Admin token widget (gear → input → green/red gear) ------------
export function renderAdminWidget() {
  const widget = el('div', {
    id: 'adminWidget',
    class: 'admin-widget',
    'data-state': hasAdminToken() ? 'ok' : 'idle',
  },
    el('button', { id: 'adminGear', class: 'admin-gear', title: 'Admin settings', 'aria-label': 'Admin settings', html: I.gear, onclick: adminEdit }),
    el('button', { id: 'adminLogout', class: 'admin-logout', title: 'Sign out', 'aria-label': 'Sign out', html: I.logout, onclick: adminLogout }),
    el('span', { class: 'admin-field' },
      el('input', { id: 'adminInput', class: 'admin-input', type: 'password', placeholder: 'admin token', autocomplete: 'off', spellcheck: 'false', onkeydown: (e) => {
        if (e.key === 'Enter') adminSubmit();
        if (e.key === 'Escape') adminCancel();
      } }),
      el('button', { class: 'admin-ok', title: 'Confirm', 'aria-label': 'Confirm', html: I.check, onclick: adminSubmit }),
      el('button', { class: 'admin-cancel', title: 'Cancel', 'aria-label': 'Cancel', html: I.close, onclick: adminCancel })
    )
  );
  // keep the widget in sync if the token is cleared elsewhere (e.g. a 401)
  onAuthChange(syncAdminWidget);
  return widget;
}

function adminState() { return document.getElementById('adminWidget')?.getAttribute('data-state'); }
function setAdminState(state) {
  const w = document.getElementById('adminWidget');
  if (w) w.setAttribute('data-state', state);
}
function syncAdminWidget() {
  if (adminState() === 'editing') return;        // don't clobber an active edit
  setAdminState(hasAdminToken() ? 'ok' : 'idle');
}

function adminEdit() {
  setAdminState('editing');
  const input = document.getElementById('adminInput');
  if (input) { input.value = ''; input.focus(); }
}
function adminCancel() {
  setAdminState(hasAdminToken() ? 'ok' : 'idle');
}
async function adminSubmit() {
  const input = document.getElementById('adminInput');
  if (!input) return;
  const token = input.value.trim();
  if (!token) { adminCancel(); return; }
  input.disabled = true;
  const ok = await checkToken(token);
  input.disabled = false;
  if (ok) {
    setAdminState('ok');
    toast('Admin enabled — skip & switch are now available.', 'success');
  } else {
    setAdminState('err');
    toast('Wrong admin token.', 'error');
    setTimeout(() => { setAdminState('editing'); if (input) { input.value = ''; input.focus(); } }, 1300);
  }
}
function adminLogout() {
  clearToken();
  setAdminState('idle');
  toast('Signed out of admin.', 'default');
}

// ---- Player bar -----------------------------------------------------
export function renderPlayerBar(handlers = {}) {
  const s = station.song;
  const bar = el('div', { class: 'player' });
  bar.appendChild(el('div', { class: 'now', onclick: openNowPlaying, style: 'cursor:pointer' },
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
    el('button', { class: 'ctrl', id: 'nextBtn', title: 'Skip', 'aria-label': 'Skip', html: I.next, onclick: doSkip })
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
  updateNowPlaying();
  setBackdropRotation(station.rotation);
}

// ---- Now Playing overlay -------------------------------------------
function ytThumb(videoId) {
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';
}

export function renderNowPlaying() {
  return el('div', { id: 'nowPlaying', class: 'np', 'aria-hidden': 'true' },
    el('button', { class: 'np-close', 'aria-label': 'Close', html: I.close, onclick: closeNowPlaying }),
    el('div', { class: 'np-art' }, el('img', { id: 'npArt', alt: '', src: '' })),
    el('div', { class: 'np-meta' },
      el('div', { class: 'np-kicker' }, '▶ now playing · ', el('span', { id: 'npListeners' }, '0'), ' listening'),
      el('h2', { class: 'np-title', id: 'npHi' }, '—'),
      el('p', { class: 'np-sub', id: 'npEn' }, ''),
      el('p', { class: 'np-artist', id: 'npArtist' }, '')
    ),
    el('div', { class: 'np-seek' },
      el('input', { id: 'npSeek', type: 'range', min: '0', max: '100', value: '0' }),
      el('div', { class: 'time' }, el('span', { id: 'npCur' }, '0:00'), el('span', { id: 'npDur' }, '0:00'))
    ),
    el('div', { class: 'np-controls' },
      el('button', { class: 'ctrl', 'aria-label': 'Restart', html: I.prev, onclick: () => seekToPercent(0) }),
      el('button', { class: 'ctrl main', id: 'npPlayBtn', 'aria-label': 'Play or pause', html: I.play, onclick: toggle }),
      el('button', { class: 'ctrl', id: 'npNextBtn', title: 'Skip', 'aria-label': 'Skip', html: I.next, onclick: doSkip })
    ),
    el('div', { class: 'np-reactions' },
      ...REACTIONS.map((e) => el('button', { class: 'react-btn lg', 'aria-label': e.name, onclick: () => sendReaction(e.emoji), html: e.emoji }))
    ),
    el('button', { class: 'np-share', onclick: onShare }, 'Share what’s playing'),
    el('div', { class: 'np-upnext' }, 'Up next: ', el('span', { id: 'npUpNext' }, '—'))
  );
}

async function onShare() {
  const r = await shareNowPlaying();
  if (r === 'copied') toast('Copied — paste it anywhere.', 'success');
  else if (r === 'failed') toast('Sharing isn’t available on this browser.', 'error');
}

export function openNowPlaying() {
  const np = $('#nowPlaying'); if (!np) return;
  np.classList.add('open');
  np.setAttribute('aria-hidden', 'false');
  updateNowPlaying();
}
export function closeNowPlaying() {
  const np = $('#nowPlaying'); if (!np) return;
  np.classList.remove('open');
  np.setAttribute('aria-hidden', 'true');
}

export function updateNowPlaying() {
  const s = station.song;
  const art = $('#npArt');
  if (art) art.src = s ? ytThumb(s.videoId) : '';
  setText('#npHi', s ? s.hi : 'ट्यूनिंग इन — अहमेदी सैलून रेडियो');
  setText('#npEn', s ? `${s.en} · ${s.film}` : 'Tap play to tune in');
  setText('#npArtist', s ? `${s.artist} · ${s.year}` : '');
  setText('#npUpNext', station.upNext ? `${station.upNext.hi} — ${station.upNext.en}` : '—');
  setText('#npListeners', String(station.listeners || 0));
  // mirror play/pause icon
  const play = $('#npPlayBtn');
  if (play) play.innerHTML = playIconIsPause() ? I.pause : I.play;
}

function setText(sel, t) { const n = $(sel); if (n) n.textContent = t; }
function playIconIsPause() {
  const b = $('#playBtn');
  return !!(b && b.innerHTML.includes('M6 5h4'));
}

// ---- Reactions -----------------------------------------------------
export function spawnReaction(emoji) {
  const layer = $('#reactionLayer');
  if (!layer) return;
  const node = el('span', { class: 'float-emoji' }, emoji);
  const left = 8 + Math.random() * 84;        // vw %
  const size = 1.6 + Math.random() * 1.4;      // rem
  const drift = (Math.random() * 2 - 1) * 40; // px horizontal drift
  node.style.left = left + 'vw';
  node.style.fontSize = size + 'rem';
  node.style.setProperty('--drift', drift + 'px');
  layer.appendChild(node);
  node.addEventListener('animationend', () => node.remove());
}

// ---- Day/night reactive backdrop ----------------------------------
export function setBackdropRotation(slug) {
  const b = $('.backdrop');
  if (b && b.dataset.rot !== slug) b.dataset.rot = slug || '';
}

// Show admin-only controls (skip buttons) only when a token is present.
export function updateAdminControls() {
  const show = hasAdminToken() ? '' : 'none';
  for (const id of ['nextBtn', 'npNextBtn']) {
    const n = document.getElementById(id);
    if (n) n.style.display = show;
  }
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
    if (r.slug !== station.rotation && hasAdminToken()) {
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
  const bindSeek = (id) => {
    const seek = $('#' + id);
    if (seek && !seek.dataset.bound) {
      seek.dataset.bound = '1';
      let seeking = false;
      seek.addEventListener('input', () => { seeking = true; });
      seek.addEventListener('change', () => { seekToPercent(seek.value); seeking = false; });
    }
  };
  bindSeek('seek');
  bindSeek('npSeek');
  const vol = $('#volume');
  if (vol && !vol.dataset.bound) {
    vol.dataset.bound = '1';
    vol.addEventListener('input', () => setVolume(+vol.value));
  }
}