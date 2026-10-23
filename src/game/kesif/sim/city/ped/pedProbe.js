/*
 * KEŞİF sim/city/ped — YAYA ENGEL SORGUSU ("probe"): bir daire (x,z,r) yayanın ayağına/gövdesine uygun mu? SAF, worker-güvenli, es2020, tahsissiz sıcak yol.
 *
 *   worldProbe(world, {roads, groundY?}) → probe   GERÇEK BLOKLAR + world.colliders (statik prop kutuları): üretim yolu (systems/crowd.js; roads = plan.roads: yol yüzeyi kodu)
 *   planProbe(seed, opts?)   → probe     şehir PLANINDAN (yüzey kodu + parsel ayak izleri + prop kutuları): chunk üretmeden test/fuzz (200 tohum)
 *   probe = { kind, y, free(x, z, r, allowRoad) → bool, loaded(x, z) → bool }
 *
 * free: zemin yüzü yürünebilir (kaldırım/meydan/park/yan zemin; yol asfaltı/şerit/zebra YALNIZ allowRoad iken: geçit kenarları), su/boşluk/yapı/prop/duvar yok,
 * gövde bandı (ayak y+0,1 … y+1,75) serbest. Dinamik kutular (araçlar, diğer yayalar) BURADA sayılmaz: çağıran ayrıca denetler.
 * Yüklenmemiş blok → free=false (yaya yüklenmemiş yere basmaz), loaded=false.
 */
import { BLOCKS } from '../../blocks.js';
import { getCityPlan } from '../cityPlan.js';
import { SURF, bridgeAt, surfaceAt } from '../cityRoads.js';
import { footprintOf, lotAt } from '../cityLots.js';
import { ARCHETYPES } from '../archetypes.js';
import { propsForChunk } from '../../props/propPlan.js';
import { PROP_BY_T, worldBoxes } from '../../props/propDefs.js';

export const GROUND_Y = 64;
const BODY_LO = 0.12;
const BODY_HI = 1.72;

/** Yol yüzeyi kodları (asfalt, şerit, zebra): yalnız allowRoad ile. (Meydan satranç zemini de 223 BLOK kimliğini kullanır: yol/meydan ayrımı blok değil YÜZEY koduyla yapılır.) */
const ROAD_SURF = new Uint8Array(16);
[SURF.ASPHALT, SURF.LANE_X, SURF.LANE_Z, SURF.ZEBRA_X, SURF.ZEBRA_Z].forEach((s) => { ROAD_SURF[s] = 1; });
/** Tam küp zemin (üstü ≥ 0,9). */
const FLOOR_OK = new Uint8Array(256);
/** Gövde bandında engel: kutu yüksekliği > 0,55 olan çarpışma kutusu varsa 1. */
const TALL = new Uint8Array(256);
for (let id = 1; id < 255; id++) {
  const b = BLOCKS[id];
  if (!b) continue;
  const c = b.collision || [];
  let top = 0;
  let tall = 0;
  for (let i = 0; i < c.length; i++) {
    if (c[i][4] > top) top = c[i][4];
    if (c[i][4] > 0.55) tall = 1;
  }
  FLOOR_OK[id] = !b.liquid && top >= 0.9 ? 1 : 0;
  TALL[id] = tall;
}

/* ------------------------------------------------------------------------------------------------
 * Gerçek dünya
 * ---------------------------------------------------------------------------------------------- */
export function worldProbe(world, opts) {
  const o = opts || {};
  const roads = o.roads || null;
  const y0 = o.groundY === undefined ? GROUND_Y : o.groundY;
  const buf = new Float64Array(6 * 12);
  const probe = {
    kind: 'world',
    y: y0,
    loaded(x, z) {
      return world.hasChunk(Math.floor(x) >> 4, Math.floor(z) >> 4);
    },
    free(x, z, r, allowRoad) {
      const cx0 = Math.floor(x - r);
      const cx1 = Math.floor(x + r);
      const cz0 = Math.floor(z - r);
      const cz1 = Math.floor(z + r);
      const xa = x - r;
      const xb = x + r;
      const za = z - r;
      const zb = z + r;
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          const f = world.getBlock(cx, y0 - 1, cz);
          if (f === null || f === undefined || FLOOR_OK[f] === 0) return false;
          if (!allowRoad && roads && ROAD_SURF[surfaceAt(roads, cx, cz)] === 1) return false;
          for (let dy = 0; dy < 2; dy++) {
            const id = world.getBlock(cx, y0 + dy, cz);
            if (id === null || id === undefined) return false;
            if (id === 0 || id === 223) continue;
            const b = BLOCKS[id];
            if (!b || b.liquid) continue;
            const c = b.collision;
            for (let i = 0; i < c.length; i++) {
              const bx = c[i];
              // yaya y'si sabit (64): ≥ 0,3 yüksek plaka/basamak (taş plaka halkası) bacağı gömer → engel; halı/plaka izi (< 0,3) geçilir (QA4-001)
              if (dy === 0 && bx[4] <= 0.3) continue;
              if (cx + bx[0] < xb && cx + bx[3] > xa && cz + bx[2] < zb && cz + bx[5] > za) return false;
            }
          }
        }
      }
      const cc = world.colliders;
      if (cc && cc.size > 0) {
        const n = cc.queryRaw(xa, y0 + BODY_LO, za, xb, y0 + BODY_HI, zb, buf, 12);
        for (let i = 0; i < n; i++) if (cc.kind[cc.slots[i]] === 1) return false;
      }
      return true;
    },
  };
  return probe;
}

/* ------------------------------------------------------------------------------------------------
 * Plan (chunk üretmeden)
 * ---------------------------------------------------------------------------------------------- */
function propBoxesOfChunk(seed, cx, cz) {
  const props = propsForChunk(seed, cx, cz, { lamps: true });
  const out = [];
  const tmp = [];
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    const d = PROP_BY_T[p.t];
    if (!d || !d.colliders || d.colliders.length === 0) continue;
    const bx = worldBoxes(d, p.x, p.y, p.z, p.yaw, tmp);
    for (let k = 0; k < bx.length; k++) {
      const b = bx[k];
      if (b[1] > GROUND_Y + BODY_HI || b[4] < GROUND_Y + BODY_LO) continue;
      out.push(b[0], b[2], b[3], b[5]);
    }
  }
  return new Float32Array(out);
}

export function planProbe(seed, opts) {
  const o = opts || {};
  const plan = getCityPlan(seed);
  const roads = plan.roads;
  const cache = new Map();
  const maxCache = o.maxChunks > 0 ? o.maxChunks : 96;
  const key = (cx, cz) => ((cx + 4096) << 13) | (cz + 4096);
  function chunkBoxes(cx, cz) {
    const k = key(cx, cz);
    let v = cache.get(k);
    if (v === undefined) {
      v = propBoxesOfChunk(seed, cx, cz);
      if (cache.size >= maxCache) cache.delete(cache.keys().next().value);
      cache.set(k, v);
    } else {
      cache.delete(k);
      cache.set(k, v);
    }
    return v;
  }
  const lotCache = new Map();
  function lotRect(x, z) {
    const l = lotAt(plan, x, z);
    if (!l) return null;
    let r = lotCache.get(l.id);
    if (r === undefined) {
      const A0 = ARCHETYPES[l.archetype];
      r = A0 && (A0.building || A0.special) ? footprintOf(l) : null;
      if (lotCache.size > 4000) lotCache.clear();
      lotCache.set(l.id, r);
    }
    return r;
  }
  const probe = {
    kind: 'plan',
    y: GROUND_Y,
    plan,
    loaded() {
      return true;
    },
    free(x, z, r, allowRoad) {
      const cx0 = Math.floor(x - r);
      const cx1 = Math.floor(x + r);
      const cz0 = Math.floor(z - r);
      const cz1 = Math.floor(z + r);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          const s = surfaceAt(roads, cx, cz);
          if (s === SURF.SIDEWALK || s === SURF.PLAZA || s === SURF.PARK || s === SURF.GROUND) {
            const fp = s === SURF.GROUND || s === SURF.PARK || s === SURF.PLAZA ? lotRect(cx, cz) : null;
            if (fp && cx >= fp.x0 && cx < fp.x1 && cz >= fp.z0 && cz < fp.z1) return false;
            continue;
          }
          if (allowRoad && (s === SURF.ASPHALT || s === SURF.ZEBRA_X || s === SURF.ZEBRA_Z || s === SURF.LANE_X || s === SURF.LANE_Z)) {
            if (bridgeAt(roads, cx, cz)) continue;
            continue;
          }
          return false;
        }
      }
      const bx0 = Math.floor((x - r) / 16);
      const bx1 = Math.floor((x + r) / 16);
      const bz0 = Math.floor((z - r) / 16);
      const bz1 = Math.floor((z + r) / 16);
      for (let bx = bx0; bx <= bx1; bx++) {
        for (let bz = bz0; bz <= bz1; bz++) {
          const bs = chunkBoxes(bx, bz);
          for (let i = 0; i < bs.length; i += 4) {
            if (bs[i] < x + r && bs[i + 2] > x - r && bs[i + 1] < z + r && bs[i + 3] > z - r) return false;
          }
        }
      }
      return true;
    },
  };
  return probe;
}
