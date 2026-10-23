/*
 * KEŞİF sim — yapılar (saf; worker-güvenli). Dünya üretimindeki `decorate` kancası ve yapı sorguları.
 *
 *   decorateChunk(chunk, ctx)                    worldgen decorate kancası: chunk'ın kendi kesitini yazar
 *   structuresInRegion(seed, x0,z0,x1,z1)        → [tanım] (dikdörtgenle kesişen; id sıralı, dondurulmuş)
 *   structureAt(seed, x, z)                      → tanım | null (sınır kutusu x/z içinde)
 *   nearestStructure(seed, x, z, {type, zone, discovered, maxDist}) → tanım | null
 *        discovered: zaten keşfedilmiş id'ler (Set | dizi) → HARİÇ tutulur (en yakın KEŞFEDİLMEMİŞ aranır)
 *   structureById(seed, id)                      → tanım | null
 *   allStructures(seed)                          → tüm dünya yapıları (test/harita)
 *   inSafeZone(seed, x, z)                       → kamp/köy güvenli yarıçapı içinde mi (yaratık doğmaz)
 *   warmStructures(seed)                         bölge çapalarını önceden hesaplar (ilk decorate çağrısı ~1–3 sn sürer;
 *                                                yükleme ekranında/işçi başlangıcında çağır) → çapa sayısı
 *   STRUCTURE_TYPES                              12 tür anahtarı
 *
 * Tanım biçimi: { id:`${type}:${ci},${cj}`, type, name, x,y,z (ayakta durulan merkez), zone, difficulty, biome, bounds,
 *   puzzles:[{id,type,origin,facing,difficulty,zone,structureId}], chests:[{x,y,z,block,blockKey,kind,index,loot}], signs,
 *   beacon:{x,z,y0,y1,tier,color}, crystalId?, altar?, seal?, boss?, lookout?, parkour?, safeRadius?, tags }
 */
import { B } from './blocks.js';
import { makeChunkW } from './structuresKit.js';
import {
  CELL, STRUCTURE_TYPES, allPlans, cellIndex, cellPlan, getState, planById, plansInRect,
} from './structuresLayout.js';

export { STRUCTURE_TYPES };

/** Çapa hesaplamasını (tapınaklar, mühür kuleleri, boss arenaları, kademeli parkurlar, başlangıç kampı) ısıtır. */
export function warmStructures(seed) {
  return getState(seed).anchorList.length;
}

/**
 * Yanardağ lav göletleri (worldgenBiomeFeatures) yapıların çevresinde bırakılmaz: yapı dikdörtgeni + 8 blokluk pay içindeki yüzey lavı
 * (iki katman) bazalta çevrilir → giriş/sandık yolu hiçbir yerde lavdan geçmez. Yalnız yüzey katmanları (heightMap civarı) taranır.
 */
function fillLavaPools(chunk, plans, x0, z0) {
  const blocks = chunk.blocks;
  for (let i = 0; i < plans.length; i++) {
    const r = plans[i].rect;
    const xa = Math.max(x0, r.x0 - 8);
    const xb = Math.min(x0 + 15, r.x1 + 8);
    const za = Math.max(z0, r.z0 - 8);
    const zb = Math.min(z0 + 15, r.z1 + 8);
    for (let z = za; z <= zb; z++) {
      for (let x = xa; x <= xb; x++) {
        const col = ((z - z0) << 4) + (x - x0);
        const h = chunk.heightMap[col];
        for (let y = h; y >= h - 2 && y > 1; y--) {
          const k = (y << 8) + col;
          if (blocks[k] === B.LAVA) blocks[k] = B.BASALT;
        }
      }
    }
  }
}

/** Worldgen decorate kancası: ctx = worldgen ctx. */
export function decorateChunk(chunk, ctx) {
  const x0 = chunk.cx * 16;
  const z0 = chunk.cz * 16;
  const S = getState(ctx && ctx.seed !== undefined ? ctx.seed : 0);
  const plans = plansInRect(S, x0, z0, x0 + 15, z0 + 15);
  if (plans.length === 0) return;
  fillLavaPools(chunk, plans, x0, z0);
  const W = makeChunkW(chunk, ctx);
  for (let i = 0; i < plans.length; i++) plans[i].build(W);
  // ikinci evre: dikey şaftlar (tapınak çıkış bacası) başka yapıların odalarından/duvarlarından sonra yazılır → kesintisiz kalır
  for (let i = 0; i < plans.length; i++) if (typeof plans[i].post === 'function') plans[i].post(W);
  if (W.writes > 0) chunk.recomputeHeightMap();
}

function toPub(plans) {
  return plans.map((p) => p.pub);
}

export function structuresInRegion(seed, x0, z0, x1, z1) {
  const S = getState(seed);
  const ax = Math.min(x0, x1);
  const bx = Math.max(x0, x1);
  const az = Math.min(z0, z1);
  const bz = Math.max(z0, z1);
  return toPub(plansInRect(S, ax, az, bx, bz).filter((p) => {
    const b = p.pub.bounds;
    return b.x1 >= ax && b.x0 <= bx && b.z1 >= az && b.z0 <= bz;
  }));
}

export function structureAt(seed, x, z) {
  const S = getState(seed);
  const plans = plansInRect(S, x - 2, z - 2, x + 2, z + 2);
  let best = null;
  for (let i = 0; i < plans.length; i++) {
    const b = plans[i].pub.bounds;
    if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) {
      const area = (b.x1 - b.x0 + 1) * (b.z1 - b.z0 + 1);
      if (!best || area < best.area) best = { pub: plans[i].pub, area };
    }
  }
  return best ? best.pub : null;
}

export function structureById(seed, id) {
  const p = planById(getState(seed), id);
  return p ? p.pub : null;
}

export function nearestStructure(seed, x, z, opts) {
  const o = opts || {};
  const S = getState(seed);
  const skip = new Set(o.discovered ? Array.from(o.discovered) : []);
  const maxD = o.maxDist === undefined ? 1100 : o.maxDist; // dünya yarıçapı 1408: varsayılan arama ~ bir bölge genişliği+
  let best = null;
  let bestD = Infinity;
  const consider = (p) => {
    const pub = p.pub;
    if (o.type && pub.type !== o.type) return;
    if (o.zone !== undefined && pub.zone !== o.zone) return;
    if (skip.has(pub.id)) return;
    const d = Math.hypot(pub.x - x, pub.z - z);
    if (d < bestD && d <= maxD) {
      bestD = d;
      best = pub;
    }
  };
  S.anchorList.forEach(consider);
  const c0i = cellIndex(x);
  const c0j = cellIndex(z);
  const maxRing = Math.min(24, Math.ceil(maxD / CELL) + 1);
  for (let ring = 0; ring <= maxRing; ring++) {
    if (best && (ring - 1) * CELL > bestD) break;
    for (let dj = -ring; dj <= ring; dj++) {
      for (let di = -ring; di <= ring; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
        const p = cellPlan(S, c0i + di, c0j + dj);
        if (p) consider(p);
      }
    }
  }
  return best;
}

export function allStructures(seed) {
  return toPub(allPlans(getState(seed)));
}

/** Kamp/köy gibi güvenli bölgelerin içinde mi (x,z). */
export function inSafeZone(seed, x, z) {
  const S = getState(seed);
  const plans = plansInRect(S, x - 48, z - 48, x + 48, z + 48);
  for (let i = 0; i < plans.length; i++) {
    const p = plans[i].pub;
    if (p.safeRadius && Math.hypot(p.x - x, p.z - z) <= p.safeRadius) return true;
  }
  return false;
}
