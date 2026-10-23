/*
 * KEŞİF sim/city — ZEMİN KATMANI (temel + yüzey sütunları + açık blok süsleri). Saf, belirlenimci, chunk dilimi yazar. Sözleşme §7 yazma sırası 1–2.
 *
 *  emitBase(w)                                  taş y0..60, beton y61–62 (pencerenin y aralığı kadar); yüzey bloğu y63 sonra yazılır
 *  emitSurface(w, plan, ctx)                    256 sütun: yol/şerit/zebra/kaldırım/meydan/park/avlu (y63), kıyı bandı (deniz/uçurum + çevre çiti),
 *                                               tepe terasları (pencere/silme/çit), kanal+köprü+tünel sütunları (cityBridges)
 *  emitBlockFeatures(w, plan, ctx)              açık blok süsleri: park yolları, çeşme, parkur platformları
 *  emitPlazaInlays(w, plan)                     Kapı Meydanı ve bölge meydanlarında terminal çevresi neon halkaları (zeminle aynı seviye)
 *  emitLotGrounds(w, lots, bpOf)                park parseli çimi + yolu
 *
 * ctx = {cx, cz, bi, bj, lay (layoutBlock), bp (blok planı)}. Koordinatlar dünya bloğu; "yüzey" bloğu y63, ayak seviyesi 64.
 */
import { hillSurfaceY } from './cityHill.js';
import { LAND, SURF, surfaceAt, tunnelAt } from './cityRoads.js';
import {
  ID, NEON_BY_HUE, Y, cellHash,
} from './cityEmit.js';
import {
  canalColumn, canalNear, plazaInlayHue, tunnelColumn, tunnelNear, tunnelWalls,
} from './cityBridges.js';
import { groundIdOf, surfaceBlockId } from './citySurface.js';

const FENCE_Y = Y.FOOT; // çit bloğu ayak seviyesindeki hücreye konur
const SEA_X = LAND; // x>=LAND (doğu) ya da z>=LAND (güney) deniz; kuzey/batı uçurum
/** Taş + beton temeli (pencere y aralığına kırpılır). */
export function emitBase(w) {
  w.box(w.x0, 0, w.z0, w.x1, Y.STONE_TOP + 1, w.z1, ID.STONE);
  w.box(w.x0, Y.CONCRETE_LO, w.z0, w.x1, Y.CONCRETE_HI + 1, w.z1, ID.WHITE);
}

/* ------------------------------------------------------------------------------------------------
 * Kıyı bandı (kara dışı, |x| ya da |z| ≥ 730)
 * ---------------------------------------------------------------------------------------------- */
/** Deniz/uçurum sütunu. d = karadan uzaklık (≥1). */
function coastColumn(w, x, z) {
  const sea = x >= SEA_X || z >= SEA_X;
  if (sea) {
    const dx = x - (SEA_X - 1);
    const dz = z - (SEA_X - 1);
    const d = dx > dz ? dx : dz;
    // deniz tabanı kıyıdan açığa doğru derinleşir: ayak 44 (kanal tabanı ile süreklilik) → 30
    let bed = Y.BED + 1 - Math.floor(d / 5);
    if (bed < 30) bed = 30;
    w.col(x, z, bed - 1, bed, ID.SAND);
    w.col(x, z, bed, Y.WATER_TOP + 1, ID.WATER);
    w.col(x, z, Y.WATER_TOP + 1, Y.SURFACE + 1, ID.AIR);
    if (d === 1) {
      // kıyı seti: ilk deniz hücresi sıra rıhtım duvarı (tabandan y63) + çit — kara çevresi kapalı; kaldırım hücreleri boş kalır
      w.col(x, z, bed, Y.CONCRETE_LO, ID.STONE); // y≤60 doğal taş (isNaturalFill ile tutarlı)
      w.col(x, z, Y.CONCRETE_LO, Y.SURFACE + 1, ID.STONE_BRICK);
      w.set(x, Y.FOOT, z, ID.FENCE);
    }
    return;
  }
  const dx = -LAND - x; // x < -LAND ise ≥ 1
  const dz = -LAND - z;
  const d = dx > dz ? dx : dz;
  // uçurum: tırmanılabilir yamaç (komşu fark ≤ 1) — kıyı çiti aşılırsa kilitlenme olmaz
  let top = Y.SURFACE - Math.floor((d * 5) / 8);
  if (top < 22) top = 22;
  const rough = cellHash(x, z, 77) & 3;
  w.col(x, z, top + 1, Y.SURFACE + 1, ID.AIR);
  w.set(x, top, z, rough === 0 ? ID.COBBLE : ID.STONE);
  if (d === 1) w.set(x, Y.FOOT, z, ID.FENCE); // uçurum kenarı çiti (kara çevresi kapalı)
}

/* ------------------------------------------------------------------------------------------------
 * Tepe terası sütunu (tepe bloğu dikdörtgeni)
 * ---------------------------------------------------------------------------------------------- */
function hillFoot(hill, x, z) {
  const f = hillSurfaceY(hill, x, z);
  return f === f ? f : 64;
}

function isStairCell(hill, x, z) {
  for (let s = 0; s < hill.stairs.length; s++) {
    const st = hill.stairs[s];
    if (x >= st.x0 && x < st.x1 && z >= st.z0 && z < st.z1) return true;
  }
  return false;
}

/**
 * Yükselen hücre: y63..foot−2 duvar, foot−1 üst yüzey. Teras duvarının görünen yüzlerinde (komşu daha alçak): 12 yüksek kat bandında
 * 2 yüksek pencere sıraları (yanık/sönük, konum karması) ve en üst satırda silme; basamaklarda süs yok. Düşüş ≥2 olan teras kenarına çit.
 */
function hillColumn(w, hill, x, z) {
  const foot = hillFoot(hill, x, z);
  const stair = isStairCell(hill, x, z);
  if (foot <= 64) {
    w.set(x, Y.SURFACE, z, ID.GRASS);
    return;
  }
  const fE = hillFoot(hill, x + 1, z);
  const fW = hillFoot(hill, x - 1, z);
  const fS = hillFoot(hill, x, z + 1);
  const fN = hillFoot(hill, x, z - 1);
  w.col(x, z, Y.SURFACE, foot - 1, ID.BRICK);
  w.set(x, foot - 1, z, stair ? ID.POLISHED : ID.GRASS);
  if (!stair) {
    const lo = Math.min(fE, fW, fS, fN);
    for (let y = Math.max(Y.FOOT, lo); y <= foot - 2; y++) {
      const rel = (y - 64) % 12;
      const onX = (y >= fE || y >= fW) && ((z % 6) + 6) % 6 < 2; // doğu/batı yüzü: z boyunca pencere
      const onZ = (y >= fS || y >= fN) && ((x % 6) + 6) % 6 < 2;
      if (rel === 10) {
        if (y >= fE || y >= fW || y >= fS || y >= fN) w.set(x, y, z, ID.POLISHED);
      } else if ((rel === 4 || rel === 5) && (onX || onZ)) {
        const hh = cellHash(x >> 1, z >> 1, y >> 2);
        w.set(x, y, z, (hh & 3) === 0 ? ID.WINDOW_DARK : ((hh >> 4) & 3) === 0 ? ID.WINDOW_COOL : ID.WINDOW_WARM);
      }
    }
    if (foot - fE >= 2 || foot - fW >= 2 || foot - fS >= 2 || foot - fN >= 2) w.set(x, foot, z, ID.FENCE);
  }
}

/* ------------------------------------------------------------------------------------------------
 * Ana yüzey döngüsü
 * ---------------------------------------------------------------------------------------------- */
export function emitSurface(w, plan, ctx) {
  const R = plan.roads;
  const x0 = w.x0;
  const z0 = w.z0;
  const gnd = groundIdOf(ctx.lay);
  const hill = plan.hill;
  const hr = hill.rect;
  const hillChunk = w.touches(hr.x0, hr.z0, hr.x1, hr.z1);
  const canalChunk = canalNear(x0, z0);
  const centerChunk = tunnelNear(x0, z0);
  for (let lz = 0; lz < 16; lz++) {
    const z = z0 + lz;
    for (let lx = 0; lx < 16; lx++) {
      const x = x0 + lx;
      const s = surfaceAt(R, x, z);
      if (s === SURF.EDGE) {
        coastColumn(w, x, z);
        continue;
      }
      if (hillChunk && x >= hr.x0 && x < hr.x1 && z >= hr.z0 && z < hr.z1) {
        hillColumn(w, hill, x, z);
        continue;
      }
      if (canalChunk && canalColumn(w, R, x, z, s, gnd)) continue;
      if (centerChunk) {
        const t = tunnelAt(R, x, z);
        if (t > 0) {
          tunnelColumn(w, R, x, z, s, t);
          continue;
        }
      }
      w.set(x, Y.SURFACE, z, surfaceBlockId(s, x, z, gnd));
    }
  }
  if (centerChunk) tunnelWalls(w);
}

/* ------------------------------------------------------------------------------------------------
 * Açık blok süsleri (park yolları, çeşme, parkur platformları) + parsel avluları
 * ---------------------------------------------------------------------------------------------- */
function fountain(w, f) {
  const r2out = 4.5 * 4.5;
  const r2in = 3.5 * 3.5;
  for (let dz = -5; dz <= 5; dz++) {
    for (let dx = -5; dx <= 5; dx++) {
      const x = f.x + dx;
      const z = f.z + dz;
      if (x < w.x0 || x >= w.x1 || z < w.z0 || z >= w.z1) continue;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r2out) continue;
      if (d2 < r2in) {
        w.set(x, 62, z, ID.POLISHED);
        w.set(x, Y.SURFACE, z, ID.WATER);
      } else {
        w.set(x, Y.SURFACE, z, ID.STONE_BRICK);
        w.set(x, FENCE_Y, z, ID.SLAB);
      }
    }
  }
  // orta sütun + neon başlık
  w.col(f.x, f.z, Y.SURFACE, Y.SURFACE + 4, ID.POLISHED);
  w.set(f.x, Y.SURFACE + 4, f.z, ID.NEON_CYAN);
  w.set(f.x, 62, f.z, ID.NEON_CYAN);
}

function platformColor(h) {
  return h === 1 ? ID.YELLOW : h === 2 ? ID.ORANGE : ID.RED;
}

/** Blok düzeyi süsler (blok planı features). */
export function emitBlockFeatures(w, plan, ctx) {
  const bp = ctx.bp;
  if (!bp || !bp.features) return;
  const feats = bp.features;
  for (let q = 0; q < feats.length; q++) {
    const f = feats[q];
    if (f.kind === 'yol') {
      if (!w.touches(f.x0, f.z0, f.x1, f.z1)) continue;
      w.box(f.x0, Y.SURFACE, f.z0, f.x1, Y.SURFACE + 1, f.z1, ID.GRAVEL);
    } else if (f.kind === 'cesme') {
      if (!w.touches(f.x - 6, f.z - 6, f.x + 7, f.z + 7)) continue;
      fountain(w, f);
    } else if (f.kind === 'platform') {
      if (!w.touches(f.x0, f.z0, f.x1, f.z1)) continue;
      w.box(f.x0, Y.SURFACE, f.z0, f.x1, Y.SURFACE + f.h + 1, f.z1, platformColor(f.h));
    }
  }
}

/** Meydan neon halkaları: Kapı Meydanı ve bölge meydanlarında terminal çevresi (zeminle aynı seviye, ışıma 12). */
export function emitPlazaInlays(w, plan) {
  const ts = plan.terminals;
  for (let t = 0; t < ts.length; t++) {
    const T = ts[t];
    if (T.kind !== 'plaza' && T.kind !== 'district') continue;
    if (!w.touches(T.x - 19, T.z - 19, T.x + 20, T.z + 20)) continue;
    const hue = plazaInlayHue(plan, T);
    const rings = T.kind === 'plaza' ? [[7, hue[0]], [15, hue[1]]] : [[6, hue[0]]];
    for (let z = T.z - 18; z <= T.z + 18; z++) {
      for (let x = T.x - 18; x <= T.x + 18; x++) {
        if (x < w.x0 || x >= w.x1 || z < w.z0 || z >= w.z1) continue;
        const dx = x - T.x + 0.5;
        const dz = z - T.z + 0.5;
        const d = Math.sqrt(dx * dx + dz * dz);
        for (let r = 0; r < rings.length; r++) {
          if (Math.abs(d - rings[r][0]) < 0.62) {
            const under = w.get(x, Y.SURFACE, z);
            if (under === ID.SIDEWALK || under === ID.ASPHALT) w.set(x, Y.SURFACE, z, NEON_BY_HUE[rings[r][1]]);
          }
        }
      }
    }
  }
}

/** Bloğun parsellerinin ZEMİN süsleri (park parseli çim + yol; avlu zemini yüzey döngüsünde yazıldı). */
export function emitLotGrounds(w, lots, bpOf) {
  for (let q = 0; q < lots.length; q++) {
    const l = lots[q];
    if (!w.touches(l.x0, l.z0, l.x1, l.z1)) continue;
    if (l.archetype !== 'park' || l.hill) continue;
    // park parseli: çim (yüzey zemin türü ne olursa olsun) + 3 genişlik çapraz yol
    w.box(l.x0, Y.SURFACE, l.z0, l.x1, Y.SURFACE + 1, l.z1, ID.GRASS);
    const b = bpOf(l);
    const fs = b && b.features;
    if (fs) {
      for (let k = 0; k < fs.length; k++) {
        const f = fs[k];
        if (f.kind === 'yol') w.box(f.x0, Y.SURFACE, f.z0, f.x1, Y.SURFACE + 1, f.z1, ID.GRAVEL);
      }
    }
  }
}
