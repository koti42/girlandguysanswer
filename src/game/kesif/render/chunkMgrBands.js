/*
 * KEŞİF render — mesh BANTLARI yardımcıları (SAF: three/DOM yok, node'da test edilir).
 *
 * Bir chunk sütunu dikeyde 48 bloklu (3 kesit) mesh bantlarına bölünür (macera: 16 bant; legacy harita: 3 bant). Her bant kendi
 * mesh'ine (3 geçiş) sahiptir; yalnız oyuncunun dikey penceresindeki, boş olmayan ve tamamen gömülü olmayan bantlar mesh'lenir.
 *
 *   verticalWindow(py, aboveGround) → {lo, hi, keepLo, keepHi}   mesh penceresi + derin kesit tutma penceresi (mutlak y)
 *   bandTrivial(world, cx, cz, s0, ns) → boolean        bant çizim üretmez (tamamen hava ya da komşularıyla birlikte tek tip katı)
 *   neededSections(sectionCount, s0, ns) → [sA, sB]      bandın mesh'i için üretilmiş olması gereken kesitler (dikey komşular dahil)
 *   affectedBandsOfCell(world, x, y, z) → [[cx,cz,b], …] bir hücre değişince yeniden mesh'lenecek bantlar
 *   columnSurfaceRange(chunk, out) → out {min, max}     sütun heightMap min/max
 */
import { chunkId } from '../sim/chunk.js';
import { OPAQUE_LUT } from '../sim/blocks.js';
import { bandOfSection } from './chunkMgrCore.js';

/** Oyuncunun gözünün altı/üstü mesh penceresi (blok). */
export const MESH_BELOW = 72;
export const MESH_ABOVE = 168;
/** Derin kesitleri bellekte tutma penceresi (blok): mesh penceresinden geniş (histerezis + hızlı iniş/çıkış). */
export const KEEP_BELOW = 176;
export const KEEP_ABOVE = 264;
/** Pencere histerezisi: mesh'lenmiş bant bu kadar dışarıya taşınca bırakılır. */
export const WINDOW_SLACK = 24;
/** Gömülü (yer altı) bantlar için yatay görüş: yer altında bu kadar chunk; yer üstündeyken yalnız yakın çevre (mağara ağızları). */
export const DEEP_VIEW_CHUNKS = 5;
export const INTERIOR_NEAR_CHUNKS = 2.3;

export function verticalWindow(py) {
  return {
    lo: py - MESH_BELOW, hi: py + MESH_ABOVE, keepLo: py - KEEP_BELOW, keepHi: py + KEEP_ABOVE,
  };
}

/** Bandın mesh'i için gereken kesit aralığı [sA, sB] (dikey komşu kesitler dahil, dünya aralığına kırpılmış). */
export function neededSections(sectionCount, s0, ns) {
  return [Math.max(0, s0 - 1), Math.min(sectionCount - 1, s0 + ns)];
}

function uniformOf(chunk, si) {
  if (si < 0 || si >= chunk.sectionCount) return -2; // dünya dışı
  if (chunk.secGen[si] === 0) return -3; // üretilmemiş
  return chunk.secBlocks[si] === null ? chunk.secUniform[si] : -1;
}

/**
 * Bant çizim üretmez mi? (a) tüm kesitler tek tip hava; ya da (b) tüm kesitler aynı OPAK tek tip katı ve dikey/yatay komşu kesitler
 * de aynı tek tip (ya da üretilmemiş/dünya dışı) → tüm yüzler gizlidir.
 */
export function bandTrivial(world, chunk, s0, ns) {
  const u = uniformOf(chunk, s0);
  if (u < 0) return false;
  for (let k = 1; k < ns; k++) if (uniformOf(chunk, s0 + k) !== u) return false;
  if (u === 0) return true;
  if (!OPAQUE_LUT[u]) return false;
  const lo = s0 - 1;
  const hi = s0 + ns;
  for (let si = lo; si <= hi; si += hi - lo) {
    const v = uniformOf(chunk, si);
    if (v !== u && v !== -3 && v !== -2) return false;
  }
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      const n = world.getChunk(chunk.cx + dx, chunk.cz + dz);
      if (!n) continue;
      for (let si = s0; si < s0 + ns; si++) {
        const v = uniformOf(n, si);
        if (v !== u && v !== -3) return false;
      }
    }
  }
  return true;
}

/** Sütunun heightMap min/max değerleri. */
export function columnSurfaceRange(chunk, out) {
  const h = chunk.heightMap;
  let mn = 32767;
  let mx = -32768;
  for (let i = 0; i < 256; i++) {
    const v = h[i];
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  out.min = mn;
  out.max = mx;
  return out;
}

/**
 * (x,y,z) hücresi değişince mesh'i etkilenen bantlar: kendi bandı, sınırdaysa dikey/yatay komşu bantlar (köşegenler dahil).
 * Döner [[cx, cz, b], ...] (tekrarsız).
 */
export function affectedBandsOfCell(world, x, y, z) {
  const cx = x >> 4;
  const cz = z >> 4;
  const lx = x & 15;
  const lz = z & 15;
  const ly = y & 15;
  const si = world.sectionOf(y);
  const ex = lx === 0 ? -1 : lx === 15 ? 1 : 0;
  const ez = lz === 0 ? -1 : lz === 15 ? 1 : 0;
  const ey = ly === 0 ? -1 : ly === 15 ? 1 : 0;
  const out = [];
  const seen = new Set();
  const push = (px, pz, ps) => {
    if (ps < 0 || ps >= world.sectionCount) return;
    const b = bandOfSection(ps);
    const key = chunkId(px, pz) * 64 + b;
    if (seen.has(key)) return;
    seen.add(key);
    out.push([px, pz, b]);
  };
  for (let az = 0; az <= 1; az++) {
    if (az === 1 && ez === 0) continue;
    for (let ax = 0; ax <= 1; ax++) {
      if (ax === 1 && ex === 0) continue;
      for (let ay = 0; ay <= 1; ay++) {
        if (ay === 1 && ey === 0) continue;
        push(cx + (ax ? ex : 0), cz + (az ? ez : 0), si + (ay ? ey : 0));
      }
    }
  }
  return out;
}
