// Shareable "Now Playing" card. Builds a PNG on a canvas and shares it via the
// Web Share API where supported (mobile); otherwise the UI shows the image
// on screen with Save + Copy-caption so it always "comes up".

import { station } from './station.js';
import backdropDesktop from './assets/backdrop.jpg';

export const BRAND_HI = 'अहमेदी सैलून';
export const SITE = 'https://ahmedisalon.nabilahmed.in';

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

function truncate(ctx, text, maxWidth, font) {
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

export function captionText(song) {
  return `🎵 ${BRAND_HI} · now playing\n${song?.hi || ''} — ${song?.en || ''} (${song?.film || ''}, ${song?.year || ''})\n${SITE}`;
}

export async function makeCardBlob(song) {
  const W = 1200, H = 675;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  try { await document.fonts.ready; } catch {}

  try {
    const img = await loadImage(backdropDesktop);
    drawCover(ctx, img, W, H);
  } catch {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#3a1d12'); g.addColorStop(1, '#1a0f0a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  const og = ctx.createLinearGradient(0, H * 0.3, 0, H);
  og.addColorStop(0, 'rgba(10,6,4,0.1)'); og.addColorStop(1, 'rgba(10,6,4,0.85)');
  ctx.fillStyle = og; ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#d9a441';
  ctx.font = '600 26px "Familjen Grotesk", sans-serif';
  ctx.fillText('▶ NOW PLAYING · ' + BRAND_HI, 64, 90);

  ctx.fillStyle = '#f5ead2';
  ctx.font = '800 84px "Anek Devanagari", sans-serif';
  ctx.fillText(truncate(ctx, song?.hi || BRAND_HI, W - 128, '800 84px "Anek Devanagari", sans-serif'), 64, 230);

  ctx.fillStyle = '#e9dcb8';
  ctx.font = '500 38px "Familjen Grotesk", sans-serif';
  ctx.fillText(truncate(ctx, `${song?.en || ''} · ${song?.film || ''}`, W - 128, '500 38px "Familjen Grotesk", sans-serif'), 64, 290);

  ctx.fillStyle = '#b8a07c';
  ctx.font = '400 30px "Familjen Grotesk", sans-serif';
  ctx.fillText(truncate(ctx, `${song?.artist || ''} · ${song?.year || ''}`, W - 128, '400 30px "Familjen Grotesk", sans-serif'), 64, 340);

  ctx.fillStyle = '#8a7660';
  ctx.font = '500 24px "JetBrains Mono", monospace';
  ctx.fillText(SITE.replace('https://', ''), 64, H - 56);

  return new Promise((res) => canvas.toBlob(res, 'image/png', 0.92));
}