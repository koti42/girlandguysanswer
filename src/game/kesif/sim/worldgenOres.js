/*
 * KEŞİF sim — maden ve toprak/çakıl/bazalt damar kümeleri (saf, belirlenimci; worldgen.js ve worldgenDeep.js kullanır).
 *
 * Derin dünya: damar merkezleri 16 yüksekliğinde "dilimlere" (slab = kesit) bağlıdır. Her (chunk, dilim, maden) kendi PRNG akışıyla
 * (hash3(cx,cz,seed ^ …)) birkaç merkez dener; merkez dilim içinde, chunk kenarlarından 3 blok içeride, damar yarıçapı ≤ 3.
 * Bir pencere (yüzey bandı penceresi ya da tek derin kesit) yalnız KENDİNE değebilecek dilimlerin (±1) damarlarını yazar ve
 * hücre gürültüsü mutlak koordinatın hash'idir → sonuç pencere/üretim sırasından BAĞIMSIZDIR (kesit sınırlarında dikişsiz).
 *
 * Derinlik tablosu (mutlak y): kömür her yerde (-400..110, derinde seyrelir), bakır orta (-80..70), demir (-200..50),
 * altın derin (-330..-40; derinde sıklaşır), kızıltaş derin (-400..-90), elmas çok derin (-400..-110; nadir, derinde artar),
 * kuantum kristali en derin (-400..-190; nadir, derinde artar; bölge ilerledikçe biraz sıklaşır) + kristal salon kabuğu (worldgenCaves/Deep),
 * zümrüt yalnız Dağ biyomunda tekil (yüzey bandı, 5..50). Çakıl/toprak/bazalt cepleri yalnız taş içinde.
 */
import { B } from './blocks.js';
import { hash3, mulberry32 } from './rng.js';
import { BIOME_ID } from './worldgenTerrain.js';
import { WORLD_Y_MIN } from './constants.js';

/**
 * minY/maxY: aralık; peak: dilim başına deneme sayısı (en sık olduğu yüksekte); size: damar hücre sayısı;
 * best: en sık olduğu y (ağırlık 1); aralığın uçlarına doğru doğrusal azalır. deep: derinlik arttıkça sıklaşma çarpanı (0 = sabit).
 */
export const ORE_TABLE = Object.freeze([
  { id: B.COAL_ORE, key: 'kömür', minY: -400, maxY: 110, best: 50, peak: 2.4, size: 10, deep: 0, floor: 0.25 },
  { id: B.COPPER_ORE, key: 'bakır', minY: -80, maxY: 70, best: 20, peak: 1.3, size: 8, deep: 0, floor: 0 },
  { id: B.IRON_ORE, key: 'demir', minY: -200, maxY: 50, best: -40, peak: 1.2, size: 7, deep: 0, floor: 0 },
  { id: B.GOLD_ORE, key: 'altın', minY: -330, maxY: -40, best: -230, peak: 0.55, size: 5, deep: 0.4, floor: 0.2 },
  { id: B.REDSTONE_ORE, key: 'kızıltaş', minY: -400, maxY: -90, best: -260, peak: 0.8, size: 6, deep: 0.3, floor: 0.2 },
  { id: B.DIAMOND_ORE, key: 'elmas', minY: -400, maxY: -110, best: -330, peak: 0.28, size: 4, deep: 1.2, floor: 0.2 },
  { id: B.QUANTUM_ORE, key: 'kuantum', minY: -400, maxY: -190, best: -350, peak: 0.12, size: 3, deep: 1.5, floor: 0.2, zoneBoost: true },
]);

const FILLERS = Object.freeze([
  { id: B.GRAVEL, minY: -400, maxY: 70, best: 20, peak: 0.7, size: 14, floor: 0.4 },
  { id: B.DIRT, minY: 10, maxY: 80, best: 40, peak: 0.5, size: 14, floor: 0 },
  { id: B.BASALT, minY: -60, maxY: 40, best: -10, peak: 0.45, size: 20, floor: 0 },
]);

function isStone(b) {
  return b === B.STONE;
}

function isHost(b) {
  return b === B.STONE || b === B.BASALT || b === B.CANYON_ROCK;
}

/** Ağırlık 0..1: best'te 1, uçlara doğru doğrusal azalır (floor tabanı), aralık dışı 0. */
function profile(def, y) {
  if (y < def.minY || y > def.maxY) return 0;
  const f = def.floor || 0;
  if (y >= def.best) {
    const span = def.maxY - def.best;
    return span <= 0 ? 1 : f + (1 - f) * (1 - (y - def.best) / span);
  }
  const span = def.best - def.minY;
  return span <= 0 ? 1 : f + (1 - f) * (1 - (def.best - y) / span);
}

/**
 * Damar: merkez (wx,wy,wz) mutlak; blocks penceresi yBase'den başlar, [yLo,yHi] (dahil) ile ve chunk (x0,z0) ile kırpılır.
 * Hücre sapması hash3(x,y,z,bseed)'tir (kırpmadan bağımsız).
 */
function blob(blocks, yBase, yLo, yHi, x0, z0, wx, wy, wz, size, id, host, bseed) {
  const rad = Math.cbrt(size) * 0.62 + 0.15;
  const ri = Math.ceil(rad) + 1;
  const r2 = rad * rad;
  for (let dz = -ri; dz <= ri; dz++) {
    const z = wz + dz;
    if (z < z0 || z > z0 + 15) continue;
    for (let dx = -ri; dx <= ri; dx++) {
      const x = wx + dx;
      if (x < x0 || x > x0 + 15) continue;
      for (let dy = -ri; dy <= ri; dy++) {
        const y = wy + dy;
        if (y < yLo || y > yHi) continue;
        const nz = (hash3(x, y, z, bseed) / 4294967296 - 0.5) * 0.9;
        const d2 = dx * dx + dy * dy + dz * dz + nz;
        if (d2 > r2) continue;
        const i = ((y - yBase) << 8) + ((z - z0) << 4) + (x - x0);
        if (host(blocks[i])) blocks[i] = id;
      }
    }
  }
}

function runDef(seed, blocks, yBase, yLo, yHi, cx, cz, def, defIdx, host, ht, zoneBoost) {
  const x0 = cx * 16;
  const z0 = cz * 16;
  const s0 = Math.max(0, ((yLo - 4 - WORLD_Y_MIN) >> 4));
  const s1 = Math.min(47, ((yHi + 4 - WORLD_Y_MIN) >> 4));
  for (let csi = s0; csi <= s1; csi++) {
    const slabY = WORLD_Y_MIN + csi * 16;
    const lo = Math.max(slabY, def.minY);
    const hi = Math.min(slabY + 15, def.maxY);
    if (hi < lo) continue;
    const rnd = mulberry32(hash3(cx, cz, seed ^ (0x0e5e + csi * 0x9e3779b1 + defIdx * 0x85ebca6b)));
    let n = def.peak * (zoneBoost || 1);
    const depth = def.deep ? 1 + def.deep * Math.max(0, Math.min(1, (-slabY - 40) / 360)) : 1;
    n *= depth;
    const att = Math.floor(n) + (rnd() < n - Math.floor(n) ? 1 : 0);
    for (let a = 0; a < att; a++) {
      const lx = 3 + Math.floor(rnd() * 10);
      const lz = 3 + Math.floor(rnd() * 10);
      const y = slabY + Math.floor(rnd() * 16);
      const acc = rnd();
      const bs = Math.floor(rnd() * 4294967296);
      if (acc >= profile(def, y)) continue;
      if (ht && y > ht[(lz << 4) + lx] - 3) continue;
      blob(blocks, yBase, yLo, yHi, x0, z0, x0 + lx, y, z0 + lz, def.size, def.id, host, bs | 0);
    }
  }
}

/**
 * Pencereye (blocks, yBase'den başlayan, [yLo,yHi] dahil) maden + dolgu damarları yazar. ht: yüzey penceresinde sütun yüzey
 * yükseklikleri (Int16Array 256; merkez y > ht-3 ise atlanır), derin pencerede null. zone: chunk merkez bölgesi (kuantum sıklığı).
 */
export function placeOresWin(seed, blocks, yBase, yLo, yHi, cx, cz, ht, zone) {
  for (let o = 0; o < ORE_TABLE.length; o++) {
    const def = ORE_TABLE[o];
    if (def.maxY < yLo - 4 || def.minY > yHi + 4) continue;
    runDef(seed, blocks, yBase, yLo, yHi, cx, cz, def, o, isHost, ht, def.zoneBoost ? 1 + 0.25 * zone : 1);
  }
  for (let f = 0; f < FILLERS.length; f++) {
    const def = FILLERS[f];
    if (def.maxY < yLo - 4 || def.minY > yHi + 4) continue;
    runDef(seed, blocks, yBase, yLo, yHi, cx, cz, def, 16 + f, isStone, ht, 1);
  }
}

/** Zümrüt (yalnız Dağ biyomu, tekil; yüzey bandı penceresi): chunk akışıyla belirlenimci. */
export function placeEmeralds(seed, blocks, cx, cz, ht, biomeMap) {
  const rnd = mulberry32(hash3(cx, cz, seed ^ 0x0e5f));
  const em = Math.floor(4) + (rnd() < 0 ? 1 : 0);
  for (let a = 0; a < em; a++) {
    const lx = 3 + Math.floor(rnd() * 10);
    const lz = 3 + Math.floor(rnd() * 10);
    const y = 5 + Math.floor(rnd() * 46);
    if (biomeMap[(lz << 4) + lx] !== BIOME_ID.dag || y > ht[(lz << 4) + lx] - 3) continue;
    const i = (y << 8) + (lz << 4) + lx;
    if (isHost(blocks[i])) blocks[i] = B.EMERALD_ORE;
  }
}

/** Eski ad: yüzey bandı penceresi için tüm madenler (y 0.. pencere). */
export function placeOres(seed, blocks, cx, cz, ht, biomeMap, zone) {
  placeOresWin(seed, blocks, 0, 0, (blocks.length >> 8) - 1, cx, cz, ht, zone);
  placeEmeralds(seed, blocks, cx, cz, ht, biomeMap);
}
