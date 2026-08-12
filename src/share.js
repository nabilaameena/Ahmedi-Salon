// Generates a shareable "Now Playing" card on a canvas and shares it via the
// Web Share API (image if supported, else text), with a clipboard fallback.

import { station } from './station.js';
import backdropDesktop from './assets/backdrop.png';

const BRAND_HI = 'अहमेदी सैलून';
const REPO = 'https://github.com/nabilaameena/Ahmedi-Salon';

async function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function drawCover(ctx, img, w, h) {
  const ir = img.width / img.height;
  const cr = w / h;
  let dw, dh, dx, dy;
  if (ir > cr) { dh = h; dw = h * ir; dx = (w - dw) / 2; dy = 0; }
  else { dw = w; dh = w / ir; dx = 0; dy = (h - dh) / 2; }
  ctx.drawImage(img, dx, dy, dw, dh);
}

async function makeCardBlob(song, backdropUrl) {
  const W = 1200, H = 675;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  try { await document.fonts.ready; } catch {}

  // Backdrop
  try {
    const img = await loadImage(backdropUrl);
    drawCover(ctx, img, W, H);
  } catch {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#3a1d12'); g.addColorStop(1, '#1a0f0a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  // Legibility gradient
  const og = ctx.createLinearGradient(0, H * 0.3, 0, H);
  og.addColorStop(0, 'rgba(10,6,4,0.1)'); og.addColorStop(1, 'rgba(10,6,4,0.85)');
  ctx.fillStyle = og; ctx.fillRect(0, 0, W, H);

  // Brand
  ctx.textAlign = 'left';
  ctx.fillStyle = '#d9a441';
  ctx.font = '600 26px "Familjen Grotesk", sans-serif';
  ctx.fillText('▶ NOW PLAYING · ' + BRAND_HI, 64, 90);

  // Song title (Hindi)
  ctx.fillStyle = '#f5ead2';
  ctx.font = '800 84px "Anek Devanagari", sans-serif';
  const title = song?.hi || 'अहमेदी सैलून';
  ctx.fillText(truncate(ctx, title, W - 128, 84), 64, 230);

  // Romanised + film
  ctx.fillStyle = '#e9dcb8';
  ctx.font = '500 38px "Familjen Grotesk", sans-serif';
  const sub = truncate(ctx, `${song?.en || ''} · ${song?.film || ''}`, W - 128, 38);
  ctx.fillText(sub, 64, 290);

  // Artist · year
  ctx.fillStyle = '#b8a07c';
  ctx.font = '400 30px "Familjen Grotesk", sans-serif';
  ctx.fillText(truncate(ctx, `${song?.artist || ''} · ${song?.year || ''}`, W - 128, 30), 64, 340);

  // Footer link
  ctx.fillStyle = '#8a7660';
  ctx.font = '500 24px "JetBrains Mono", monospace';
  ctx.fillText('ahmedi-salon · ' + REPO.replace('https://', ''), 64, H - 56);

  return new Promise((res) => canvas.toBlob(res, 'image/png', 0.92));
}

function truncate(ctx, text, maxWidth, font) {
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

function textFallback(song) {
  return `🎵 ${BRAND_HI} · now playing\n${song?.hi || ''} — ${song?.en || ''} (${song?.film || ''}, ${song?.year || ''})\n${REPO}`;
}

export async function shareNowPlaying() {
  const song = station.song;
  const text = textFallback(song);
  try {
    const blob = await makeCardBlob(song, backdropDesktop);
    const file = new File([blob], 'ahmedi-salon-now-playing.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: BRAND_HI, text });
      return 'shared';
    }
  } catch { /* fall through to text share */ }
  if (navigator.share) {
    try { await navigator.share({ title: BRAND_HI, text }); return 'shared'; } catch {}
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}