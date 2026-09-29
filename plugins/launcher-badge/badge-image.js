'use strict';

// Draws an unread-count badge straight into a raw bitmap from
// nativeImage.toBitmap() (BGRA, premultiplied alpha on Linux), entirely in
// the main process. An earlier version rendered it with a <canvas> in a
// hidden BrowserWindow; any extra window is visible to Zalo's own code that
// walks BrowserWindow.getAllWindows(), so that is avoided here.

const RED = [0xe5, 0x34, 0x2b];
const WHITE = [0xff, 0xff, 0xff];

// 3x5 pixel glyphs, one string per row.
const GLYPHS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '001', '001', '001'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
  '+': ['000', '010', '111', '010', '000']
};

function badgeLabel(count) {
  return count > 99 ? '99+' : String(count);
}

function paint(buf, size, x, y, rgb, coverage) {
  if (coverage <= 0 || x < 0 || y < 0 || x >= size || y >= size) return;
  const a = Math.min(1, coverage);
  const i = (y * size + x) * 4;
  buf[i] = Math.round(rgb[2] * a + buf[i] * (1 - a));
  buf[i + 1] = Math.round(rgb[1] * a + buf[i + 1] * (1 - a));
  buf[i + 2] = Math.round(rgb[0] * a + buf[i + 2] * (1 - a));
  buf[i + 3] = Math.round(255 * a + buf[i + 3] * (1 - a));
}

function fillCircle(buf, size, cx, cy, r, rgb) {
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(size - 1, Math.ceil(cy + r + 1));
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(size - 1, Math.ceil(cx + r + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      paint(buf, size, x, y, rgb, r + 0.5 - d);
    }
  }
}

// Mutates `buf` (size*size*4 bytes) in place.
function drawBadge(buf, size, count) {
  const label = badgeLabel(count);
  const r = size * 0.31;
  const border = Math.max(1, size * 0.045);
  const cx = size - r - border;
  const cy = r + border;

  fillCircle(buf, size, cx, cy, r + border, WHITE);
  fillCircle(buf, size, cx, cy, r, RED);

  const glyphs = label.split('').map((ch) => GLYPHS[ch]).filter(Boolean);
  const n = glyphs.length;
  const scale = Math.max(1, Math.min(Math.floor((r * 1.5) / (4 * n - 1)), Math.floor((r * 1.1) / 5)));
  const width = (4 * n - 1) * scale;
  const height = 5 * scale;
  const left = Math.round(cx - width / 2);
  const top = Math.round(cy - height / 2);

  glyphs.forEach((rows, k) => {
    rows.forEach((row, gy) => {
      for (let gx = 0; gx < 3; gx++) {
        if (row[gx] !== '1') continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            paint(buf, size, left + (k * 4 + gx) * scale + dx, top + gy * scale + dy, WHITE, 1);
          }
        }
      }
    });
  });
}

// Returns a badged nativeImage, or null if the icon can't be read.
function renderBadgedIcon(nativeImage, iconPath, count, size = 64) {
  const base = nativeImage.createFromPath(iconPath);
  if (base.isEmpty()) return null;
  const resized = base.resize({ width: size, height: size, quality: 'best' });
  const bitmap = Buffer.from(resized.toBitmap());
  if (bitmap.length !== size * size * 4) return null;
  drawBadge(bitmap, size, count);
  return nativeImage.createFromBitmap(bitmap, { width: size, height: size });
}

module.exports = { drawBadge, renderBadgedIcon, badgeLabel };
