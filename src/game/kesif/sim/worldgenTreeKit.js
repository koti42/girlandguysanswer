/*
 * KEŞİF sim — ağaç/bitki yazıcı takımı (saf; worldgenFlora.js ve worldgenTreesBiome.js ortak kullanır).
 *
 * Yazımlar tek bir hedef chunk'a KIRPILIR (beginTrees ile seçilir; blocks = chunk yoğun dizisi, indeks (y<<8)+(lz<<4)+lx).
 * Her chunk kendine değebilecek tüm ağaçları aynı sırayla işler → sonuç chunk sınırından bağımsızdır:
 *   lf  yaprak  yalnız HAVAya yazılır          lg  kütük  hava/yaprak üstüne        lw  su-geçişli (kök/mercan: hava/yaprak/su)
 *   ls  zemin altı (kök dibi)  yalnız katı olmayana
 */
import { B } from './blocks.js';
import { hash3 } from './rng.js';

let _b = null;
let _x0 = 0;
let _z0 = 0;
let _top = 128;

export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

/** buildTree için hedef chunk'ı seçer. */
export function beginTrees(blocks, x0, z0) {
  _b = blocks;
  _top = blocks.length >> 8;
  _x0 = x0;
  _z0 = z0;
}

export function targetX0() {
  return _x0;
}
export function targetZ0() {
  return _z0;
}

/** Yaprak: yalnız havaya. */
export function lf(wx, wy, wz, id) {
  const lx = wx - _x0;
  const lz = wz - _z0;
  if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || wy < 1 || wy >= _top) return;
  const i = (wy << 8) + (lz << 4) + lx;
  if (_b[i] === 0) _b[i] = id;
}

/** Kütük: hava ya da (eski) yaprak üstüne (48–51 = ilk dalga yaprakları, 160–175 biyom yaprakları). */
export function lg(wx, wy, wz, id) {
  const lx = wx - _x0;
  const lz = wz - _z0;
  if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || wy < 1 || wy >= _top) return;
  const i = (wy << 8) + (lz << 4) + lx;
  const b = _b[i];
  if (b === 0 || (b >= 48 && b <= 51) || isBiomeLeaf(b) || b === B.VINE) _b[i] = id; // dal, gövde sarmaşığının yerine geçer (dal kopmasın)
}

/** Su-geçişli yazım: hava/yaprak/su (20,21) üzerine (mangrov kökü, mercan, su altı bitkisi). */
export function lw(wx, wy, wz, id) {
  const lx = wx - _x0;
  const lz = wz - _z0;
  if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || wy < 1 || wy >= _top) return;
  const i = (wy << 8) + (lz << 4) + lx;
  const b = _b[i];
  if (b === 0 || b === 20 || b === 21 || (b >= 48 && b <= 51) || isBiomeLeaf(b)) _b[i] = id;
}

/** Zemin içine (zemin ya da bitki/yaprak/su yerine; kayaya dokunmaz): kök dibi, mantar tabanı. */
export function ls(wx, wy, wz, id) {
  const lx = wx - _x0;
  const lz = wz - _z0;
  if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || wy < 1 || wy >= _top) return;
  const i = (wy << 8) + (lz << 4) + lx;
  const b = _b[i];
  if (b === 0 || b === 20 || b === 21 || b === B.MUD || b === B.SAND || b === B.CLAY || b === B.GRAVEL || b === B.DIRT) _b[i] = id;
}

/** Yazım hedefindeki mevcut blok (chunk dışı = -1). */
export function peek(wx, wy, wz) {
  const lx = wx - _x0;
  const lz = wz - _z0;
  if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || wy < 1 || wy >= _top) return -1;
  return _b[(wy << 8) + (lz << 4) + lx];
}

const LEAF_LUT = new Uint8Array(256);
[160, 161, 162, 164, 167, 170, 175].forEach((id) => { LEAF_LUT[id] = 1; });
export function isBiomeLeaf(id) {
  return LEAF_LUT[id] === 1;
}

/** [0,1) belirlenimci rastgele (hash3). */
export function hv(a, b, c, th) {
  return (hash3(a, b, c, th) & 255) / 256;
}

/** Dolu küre/yassı küre yaprak kümesi (kenar benekli). */
export function leafBlob(cx, cy, cz, R, id, th, flat = 1.35) {
  const ri = Math.ceil(R);
  for (let dy = -ri; dy <= ri; dy++) {
    for (let dz = -ri; dz <= ri; dz++) {
      for (let dx = -ri; dx <= ri; dx++) {
        const d2 = dx * dx + dy * dy * flat + dz * dz;
        if (d2 > R * R) continue;
        if (d2 > R * R - 2.2 && (hash3(cx + dx, cy + dy, cz + dz, th) & 3) === 0) continue;
        lf(cx + dx, cy + dy, cz + dz, id);
      }
    }
  }
}
