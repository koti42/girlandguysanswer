/*
 * KEŞİF sim — kaba keşif haritası (saf). 1 hücre = 8×8 blok. Değerler: 0 bilinmiyor, 1 yürünerek/ışıkla görüldü,
 * 2 gözcü kulesi gibi uzak açılım. Izgara dünya yarıçapını (1408 blok) ve bir tampon payını kapsar.
 */
import { WORLD_RADIUS } from './constants.js';
import { decodeRleSafe, encodeRle } from './mapFormat.js';

export const MAP_CELL = 8;
export const MAP_HALF = Math.ceil(WORLD_RADIUS / MAP_CELL) + 4; // 180
export const MAP_GRID = MAP_HALF * 2; // 360
export const MAP_CELLS = MAP_GRID * MAP_GRID;

/** Yarıçap (blok) bazlı açılım: güneşli yüzey, loş, karanlık; meşale eklenir. */
export const REVEAL_RADIUS = Object.freeze({
  bright: 28, dim: 20, dark: 12, torchBonus: 8, tower: 112,
});

/** Dünya diskinin içindeki hücre sayısı (yüzde hesabı için). */
export const DISC_CELLS = (function countDisc() {
  let n = 0;
  for (let j = 0; j < MAP_GRID; j++) {
    for (let i = 0; i < MAP_GRID; i++) {
      const x = (i - MAP_HALF + 0.5) * MAP_CELL;
      const z = (j - MAP_HALF + 0.5) * MAP_CELL;
      if (x * x + z * z <= WORLD_RADIUS * WORLD_RADIUS) n++;
    }
  }
  return n;
}());

export function createRevealGrid() {
  return new Uint8Array(MAP_CELLS);
}

/** Dünya koordinatı → hücre sütunu/satırı (ızgara dışı -1). */
export function cellOf(v) {
  const c = Math.floor(v / MAP_CELL) + MAP_HALF;
  return c < 0 || c >= MAP_GRID ? -1 : c;
}

export function cellIndex(x, z) {
  const i = cellOf(x);
  const j = cellOf(z);
  return i < 0 || j < 0 ? -1 : j * MAP_GRID + i;
}

/**
 * (x,z) merkezli r blok yarıçaplı daireyi açar. Yeni açılan hücre sayısını döner.
 * level: yazılacak değer (1|2); daha yüksek değer korunur.
 */
export function revealCircle(grid, x, z, r, level = 1) {
  const rc = Math.ceil(r / MAP_CELL);
  const ci = Math.floor(x / MAP_CELL) + MAP_HALF;
  const cj = Math.floor(z / MAP_CELL) + MAP_HALF;
  const r2 = (r + MAP_CELL * 0.5) * (r + MAP_CELL * 0.5);
  let fresh = 0;
  for (let j = cj - rc; j <= cj + rc; j++) {
    if (j < 0 || j >= MAP_GRID) continue;
    const dz = (j - MAP_HALF + 0.5) * MAP_CELL - z;
    for (let i = ci - rc; i <= ci + rc; i++) {
      if (i < 0 || i >= MAP_GRID) continue;
      const dx = (i - MAP_HALF + 0.5) * MAP_CELL - x;
      if (dx * dx + dz * dz > r2) continue;
      const k = j * MAP_GRID + i;
      const old = grid[k];
      if (old === 0) fresh++;
      if (old < level) grid[k] = level;
    }
  }
  return fresh;
}

export function countRevealed(grid) {
  let n = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i] !== 0) n++;
  return n;
}

/** Açılan hücrelerin dünya diski içindeki yüzdesi (0..100, 0,1 duyarlık). */
export function revealedPercent(count) {
  return Math.min(100, Math.round((count / DISC_CELLS) * 1000) / 10);
}

export function encodeReveal(grid) {
  return encodeRle(grid);
}

/** base64 RLE → ızgara; geçersizse null (atmaz). */
export function decodeReveal(str) {
  if (typeof str !== 'string' || str.length === 0 || str.length > 400000) return null;
  const r = decodeRleSafe(str, MAP_CELLS);
  if (!r.ok) return null;
  const g = r.data;
  for (let i = 0; i < g.length; i++) if (g[i] > 2) g[i] = 2;
  return g;
}
