/*
 * KEŞİF sim/city — üretilmiş BLOKLAR üzerinde yürünebilirlik çözümlemesi (yalnız test/araç; üretim yolu içe aktarmaz).
 *
 *  buildNav(seed, rect?, {maxLevels?}) → Nav    rect {x0,z0,x1,z1} (dünya hücresi; varsayılan tüm kara −730..730); maxLevels: sütun başına seviye (vars. 4)
 *  nav.reach(sx, sy, sz) → Uint8Array(cols·MAXL)   yürüme BFS: sx,sz başlangıç ayak hücresi (sy ayak y)
 *  nav.reachBack(sx, sy, sz)                       ters BFS: (sx,sy,sz)'ye ULAŞABİLEN düğümler (tuzak denetimi)
 *  nav.levels(x,z) → [foot y,…]                    sütunun ayakta durulabilir seviyeleri
 *  nav.isReached(seen, x, z, y?) → bool
 *
 * Oyuncu modeli (physics.js sabitleri): yürüyerek basamak ≤ 0.6 → 1 blok yükselmek ZIPLAMA ister (zıplama ≈ 1.25: +1 geçer, +2 geçmez; üstte boşluk
 * gerekir); düşüş ≤ 3 blok. Ayakta durulabilir ⇔ altı tam küp, ayak ve baş hücresi serbest. Çit (1.5 yüksek) ve kapalı kayar kapı engeldir; plaka (yarım)
 * engel sayılmaz (0.5 ≤ basamak). Merdiven bloğu serbest (tırmanılır).
 */
import { BLOCKS } from '../blocks.js';
import { generateCityChunk } from './cityGen.js';

export const YLO = 32;
export const YHI = 128;
const H = YHI - YLO;
const MAXL_DEFAULT = 4;
const SOLID = new Uint8Array(256);
const CUBE = new Uint8Array(256);
const SLAB = new Uint8Array(256);
for (let id = 1; id < 255; id++) {
  const b = BLOCKS[id];
  if (!b) continue;
  const coll = b.collision || [];
  SOLID[id] = coll.length > 0 ? 1 : 0;
  CUBE[id] = b.cube ? 1 : 0;
  // yarım yükseklik (plaka): tek kutu, üstü ≤ 0.5
  if (coll.length === 1 && coll[0][4] <= 0.5 && !b.cube) SLAB[id] = 1;
}

/** Hücre ayakta durulabilir bir ayak hücresi için serbest mi (engel değil). */
function free(id) {
  return id === 0 || SOLID[id] === 0 || SLAB[id] === 1;
}

export function buildNav(seed, rect, opt) {
  const MAXL = opt && opt.maxLevels > 0 ? opt.maxLevels | 0 : MAXL_DEFAULT; // sütun başına en çok ayakta durulabilir seviye (varsayılan 4: alt 4 kat; QA2 kapısı 8)
  const R = rect || { x0: -730, z0: -730, x1: 730, z1: 730 };
  const W = R.x1 - R.x0;
  const D = R.z1 - R.z0;
  const cols = W * D;
  const lv = new Int16Array(cols * MAXL); // 0 = yok, aksi ayak y
  const clr = new Uint8Array(cols * MAXL); // ayak hücresinden yukarı ardışık serbest hücre sayısı (≤ 8)
  const cx0 = Math.floor(R.x0 / 16);
  const cx1 = Math.floor((R.x1 - 1) / 16);
  const cz0 = Math.floor(R.z0 / 16);
  const cz1 = Math.floor((R.z1 - 1) / 16);
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const ch = generateCityChunk(seed, cx, cz, { light: false });
      const dn = ch.toDense(YLO, H);
      for (let lz = 0; lz < 16; lz++) {
        const z = cz * 16 + lz;
        if (z < R.z0 || z >= R.z1) continue;
        for (let lx = 0; lx < 16; lx++) {
          const x = cx * 16 + lx;
          if (x < R.x0 || x >= R.x1) continue;
          const col = (z - R.z0) * W + (x - R.x0);
          let n = 0;
          const o = (lz << 4) + lx;
          for (let y = 1; y < H - 1 && n < MAXL; y++) {
            const below = dn[((y - 1) << 8) + o];
            if (CUBE[below] === 0) continue;
            const at = dn[(y << 8) + o];
            if (!free(at)) continue;
            const up = dn[((y + 1) << 8) + o];
            if (!free(up)) continue;
            let c = 2;
            while (c < 8 && y + c < H && free(dn[((y + c) << 8) + o])) c++;
            clr[col * MAXL + n] = c;
            lv[col * MAXL + n++] = y + YLO;
          }
        }
      }
    }
  }
  const idx = (x, z) => (z - R.z0) * W + (x - R.x0);
  const inR = (x, z) => x >= R.x0 && x < R.x1 && z >= R.z0 && z < R.z1;
  const levels = (x, z) => {
    if (!inR(x, z)) return [];
    const out = [];
    const b = idx(x, z) * MAXL;
    for (let k = 0; k < MAXL; k++) if (lv[b + k]) out.push(lv[b + k]);
    return out;
  };
  const DX = [1, -1, 0, 0];
  const DZ = [0, 0, 1, -1];
  /** (nx,ny) düğümünden (x,z,y,jumpOk) düğümüne tek adım geçerli mi (yürü/zıpla/düş kuralları). */
  function stepOk(y, jumpOk, ny, clrN) {
    const dy = ny - y;
    if (dy > 1 || dy < -3) return false;
    if (dy === 1 && !jumpOk) return false;
    if (dy < 0 && clrN < y + 2 - ny) return false;
    return true;
  }

  /**
   * BFS. reverse=false: (sx,sy,sz)'den ulaşılabilenler. reverse=true: (sx,sy,sz)'ye ULAŞABİLENLER (ters kenarlar) — kilitlenme (tuzak) denetimi:
   * ileri ∖ geri = geri dönüşü olmayan hücreler.
   */
  function walk(sx, sy, sz, reverse) {
    const seen = new Uint8Array(cols * MAXL);
    const start = idx(sx, sz) * MAXL;
    let sk = -1;
    for (let k = 0; k < MAXL; k++) if (lv[start + k] === sy) sk = k;
    if (sk < 0) throw new Error('başlangıç ayakta durulabilir değil: ' + sx + ',' + sy + ',' + sz);
    const queue = new Int32Array(cols * MAXL);
    let head = 0;
    let tail = 0;
    seen[start + sk] = 1;
    queue[tail++] = start + sk;
    while (head < tail) {
      const node = queue[head++];
      const col = (node / MAXL) | 0;
      const y = lv[node];
      const x = R.x0 + (col % W);
      const z = R.z0 + ((col / W) | 0);
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d];
        const nz = z + DZ[d];
        if (!inR(nx, nz)) continue;
        const nb = idx(nx, nz) * MAXL;
        for (let m = 0; m < MAXL; m++) {
          const ny = lv[nb + m];
          if (!ny) break;
          const ok = reverse ? stepOk(ny, clr[nb + m] >= 3, y, clr[node]) : stepOk(y, clr[node] >= 3, ny, clr[nb + m]);
          if (!ok) continue;
          const nn = nb + m;
          if (seen[nn]) continue;
          seen[nn] = 1;
          queue[tail++] = nn;
        }
      }
    }
    return seen;
  }
  const reach = (sx, sy, sz) => walk(sx, sy, sz, false);
  const reachBack = (sx, sy, sz) => walk(sx, sy, sz, true);
  const isReached = (seen, x, z, y) => {
    if (!inR(x, z)) return false;
    const b = idx(x, z) * MAXL;
    for (let k = 0; k < MAXL; k++) {
      const f = lv[b + k];
      if (!f) break;
      if ((y === undefined || f === y) && seen[b + k]) return true;
    }
    return false;
  };
  return {
    rect: R, W, D, cols, levels, reach, reachBack, isReached, inR, idx, lv, MAXL,
  };
}


