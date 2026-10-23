/*
 * KEŞİF sim — yapı planı ortak yardımcıları (saf).
 *
 * Her yapı türü `plan(env)` ile bir PLAN üretir:
 *   { pub, rect, build(W) }
 *     pub   herkese açık tanım (yalnız JSON-uyumlu alanlar; dondurulmuş) — structuresInRegion bunu döner
 *     rect  etki alanı {x0,z0,x1,z1} (düzleştirme marjı dahil): çakışma dışlama ve chunk kesişimi için
 *     build(W)  chunk yazıcısına (structuresKit.makeChunkW) YALNIZ kendi kesitini yazar
 */
import { B } from './blocks.js';
import { lootForChest } from './loot.js';
import { MAX_Y, TIER_COLORS } from './structuresKit.js';
import { platform } from './structuresTerrain.js';

/** -0 → 0 (JSON gidiş-dönüşünde eşitlik bozulmasın); nesneyi yerinde düzeltir. */
export function cleanNumbers(o) {
  if (o && typeof o === 'object') {
    Object.keys(o).forEach((k) => {
      const v = o[k];
      if (typeof v === 'number') {
        if (Object.is(v, -0)) o[k] = 0;
      } else cleanNumbers(v);
    });
  }
  return o;
}

export function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.keys(o).forEach((k) => deepFreeze(o[k]));
  }
  return o;
}

/**
 * Sandık kaydı: {x,y,z,block,kind,index,loot}. o: {kind, block:'sandık'|'ödül', index, parkourTier}
 * Ganimet yalnız (seed, konum, bağlam)'a bağlıdır.
 */
export function chestEntry(env, x, y, z, o) {
  const op = o || {};
  const kind = op.kind || 'sandık';
  const reward = op.block === 'ödül';
  const loot = lootForChest(env.seed, { x, y, z }, {
    structType: env.type, zone: env.zone, tier: env.difficulty, kind, index: op.index | 0, parkourTier: op.parkourTier,
    starter: !!(env.extra && env.extra.starter),
  });
  return {
    x, y, z, block: reward ? B.REWARD_CHEST : B.CHEST, blockKey: reward ? 'ödül_sandığı' : 'sandık', kind, index: op.index | 0, loot,
  };
}

export function signEntry(x, y, z, text) {
  return { x, y, z, text };
}

/** Işık hüzmesi kaydı (renk = kademe rengi). */
export function beaconEntry(x, z, y0, y1, tier) {
  const ti = Math.max(1, Math.min(5, tier | 0));
  const t = TIER_COLORS[ti];
  return {
    x, z, y0: Math.min(MAX_Y, y0), y1: Math.min(MAX_Y, y1), tier: ti, color: t.hex, colorKey: t.key,
  };
}

/** Arazi aralığına göre düzleştirme marjı (5..12). */
export function marginFor(range) {
  return Math.max(5, Math.min(12, Math.ceil(range * 0.6)));
}

/**
 * Seçilen siteye göre düz platform + rampa: uyarlanır marj (engebeli arazide daha geniş yumuşatma), çakışma uygunsa onu seçer.
 * Döner {plat, margin}.
 */
export function fitPlatform(env, site, base, defMargin, opts, circ) {
  const m = Math.max(marginFor(site.stats.range), defMargin);
  const tries = m > defMargin ? [m, defMargin] : [defMargin];
  for (let i = 0; i < tries.length; i++) {
    const plat = platform(site.x, site.z, base, tries[i], opts);
    const c = circ ? circ(tries[i]) : undefined;
    if (i === tries.length - 1 || env.rectOk(plat.rect, c)) return { plat, margin: tries[i] };
  }
  return { plat: platform(site.x, site.z, base, defMargin, opts), margin: defMargin };
}

export function boxOf(x0, y0, z0, x1, y1, z1) {
  return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1) };
}

export function unionBox(a, b) {
  return {
    x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), z0: Math.min(a.z0, b.z0),
    x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), z1: Math.max(a.z1, b.z1),
  };
}

export function rectOfBox(b, pad) {
  const p = pad || 0;
  return { x0: b.x0 - p, z0: b.z0 - p, x1: b.x1 + p, z1: b.z1 + p };
}

/**
 * Planı birleştirir. pub alanları env + parça sonuçlarından doldurulur.
 *   parts: {name, x,y,z (merkez, ayakta durulan y), bounds, rect, build, ...ek herkese açık alanlar}
 */
export function makePlan(env, parts) {
  const {
    build, rect, surf, surfParts, deep, ...rest
  } = parts;
  const pub = Object.assign({
    id: env.id,
    type: env.type,
    zone: env.zone,
    difficulty: env.difficulty,
    biome: env.biome,
    puzzles: [],
    chests: [],
    signs: [],
  }, rest);
  if (pub.bounds) {
    pub.bounds = Object.assign({}, pub.bounds, { y1: Math.min(MAX_Y, pub.bounds.y1), y0: Math.max(1, pub.bounds.y0) });
  }
  cleanNumbers(pub);
  deepFreeze(pub);
  return {
    pub, rect, surf: surf || rect, surfParts: surfParts || null, deep: deep || null, build,
  };
}

/** 4 facing için yön vektörleri (kitGeometry.FACINGS ile aynı): facing → {fx,fz}. */
export const DIRS = Object.freeze([
  Object.freeze({ fx: 0, fz: 1 }),
  Object.freeze({ fx: -1, fz: 0 }),
  Object.freeze({ fx: 0, fz: -1 }),
  Object.freeze({ fx: 1, fz: 0 }),
]);

/** Dünya yönüne (dx,dz) en yakın facing. */
export function facingToward(dx, dz) {
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 3 : 1;
  return dz > 0 ? 0 : 2;
}

/** İki noktayı bağlayan çizgi boyunca çit/dizi gibi işler için küçük yardımcı. */
export function* cellsOnLine(x0, z0, x1, z1) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const n = Math.max(Math.abs(dx), Math.abs(dz));
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    yield [Math.round(x0 + dx * t), Math.round(z0 + dz * t)];
  }
}
