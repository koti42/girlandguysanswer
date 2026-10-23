/*
 * KEŞİF sim — yapı yerleşimi: 64×64 hücre ızgarası + bölge çapaları (saf, belirlenimci).
 *
 * Hücre (ci,cj) = [64ci−32, 64ci+32) × [64cj−32, 64cj+32). Seed + hücre hash'i ile tür/doluluk seçilir; her tür kendi `plan(env)`
 * işleviyle düz, kuru bir yer bulur. ÇAPALAR: her bölge için kesin sayıda zorunlu yapı (ZONES[z].temples Anahtar Tapınağı,
 * Mühür Kulesi, Boss Arenası, Başlangıç kampı…) bölge halkasında seed'e bağlı açılarla yerleştirilir; diğer hücreler rastgele.
 *
 * Çakışma: her planın `rect`i (düzleştirme marjı dahil) başka planla 6 blokluk aralık bırakır; çapalar önceliklidir, kalanlar
 * hash önceliğiyle; Mühür halkası bandı (R±5) ve doğuş noktası (r=14) hiçbir yapıya girmez.
 */
import {
  WORLD_RADIUS, ZONES, ZONE_COUNT, zoneIndexAt,
} from './constants.js';
import { hash2, hash3, seededRandom, stringSeedToInt, toSeedInt } from './rng.js';
import { biomeKeyAt, legacySpawnPoint } from './worldgen.js';
import { rectsOverlap } from './structuresKit.js';
import { SEAL_RING_RADII } from './worldgenTerrain.js';
import {
  clearHeightCache, rectAvoidsDisk, ringClear, siteStats,
} from './structuresTerrain.js';
import {
  BIOME_MULT, TYPES, STRUCTURE_TYPES, OCCUPANCY, WEIGHTS,
} from './structuresTypes.js';

export const CELL = 64;
const GAP = 6;
/** Bir hücre planının rect'i hücre merkezinden en çok bu kadar uzanabilir (arama penceresi ≤ 40 + rampalı platform ≤ 70). */
export const MAX_REACH = 120;
const TAU = Math.PI * 2;

export function cellIndex(v) {
  return Math.floor((v + CELL / 2) / CELL);
}

export const DEBUG = { on: false, reasons: {} };
function why(type, r) {
  if (!DEBUG.on) return;
  const k = type + ':' + r;
  DEBUG.reasons[k] = (DEBUG.reasons[k] || 0) + 1;
}

const STATES = new Map();

/** Seed başına durum (en çok 3 önbellek). */
export function getState(seed) {
  const s = toSeedInt(seed);
  let S = STATES.get(s);
  if (!S) {
    if (STATES.size >= 3) STATES.delete(STATES.keys().next().value);
    const sp = legacySpawnPoint(s); // eski doğuş: yapı düzeni (kamp çapası dahil) ve mevcut kayıtlar değişmesin
    S = {
      seed: s,
      spawn: { x: Math.floor(sp.x), z: Math.floor(sp.z) },
      anchors: null,
      anchorList: [],
      anchorIds: new Map(),
      raw: new Map(),
      acc: new Map(),
      computing: false,
    };
    STATES.set(s, S);
    S.anchors = computeAnchors(S);
  }
  return S;
}

export function clearLayoutCache() {
  STATES.clear();
  clearHeightCache();
}

/* ------------------------------------------------------------------------------------------------
 * env
 * ---------------------------------------------------------------------------------------------- */
function makeEnv(S, type, ci, cj, o) {
  const T = TYPES[type];
  const base = o.desired || { x: ci * CELL, z: cj * CELL };
  const zone = o.zone !== undefined ? o.zone : zoneIndexAt(base.x, base.z);
  const id = type + ':' + ci + ',' + cj;
  const relaxed = !!o.relaxed || !!o.force;
  const force = !!o.force;
  const env = {
    seed: S.seed,
    id,
    type,
    name: T.name,
    ci,
    cj,
    cellX: ci * CELL,
    cellZ: cj * CELL,
    zone,
    difficulty: ZONES[zone].difficulty,
    relaxed,
    force,
    isAnchor: !!o.anchor,
    desired: base,
    spawn: S.spawn,
    extra: o.extra || {},
    rng: seededRandom(hash3(ci, cj, S.seed ^ stringSeedToInt(type))),
    biome: 'cayir',
    biomeAt: (x, z) => biomeKeyAt(S.seed, x, z),
    why: (r) => why(type, r),
    cands(n, jx, jz) {
      const r = seededRandom(hash3(ci, cj, S.seed ^ 0xca7d ^ stringSeedToInt(type)));
      const out = [{ x: Math.round(base.x), z: Math.round(base.z) }];
      for (let i = 1; i < n; i++) {
        const k = Math.min(1, 0.35 + i / n);
        out.push({
          x: Math.round(base.x + r.float(-jx, jx) * k),
          z: Math.round(base.z + r.float(-jz, jz) * k),
        });
      }
      return out;
    },
    /** kind: 'surf' (varsayılan: yüzey) | 'deep' (yeraltı: yalnız halka + derin-derin çakışma). */
    rectOk(rect, circ, kind) {
      const ok = env.rectOk2(rect, circ, kind);
      if (!ok) why(type, 'rectOk');
      return ok;
    },
    rectOk2(rect, circ, kind) {
      if (circ) {
        const rr = Math.sqrt(circ.x * circ.x + circ.z * circ.z);
        const pad = relaxed ? 3 : 5;
        for (let i = 0; i < SEAL_RING_RADII.length; i++) {
          if (Math.abs(rr - SEAL_RING_RADII[i]) <= circ.r + pad) { why(type, 'ring'); return false; }
        }
      } else if (!ringClear(rect, force ? 2 : (kind === 'deep' ? 3 : (relaxed ? 3 : 5)))) { why(type, 'ring'); return false; }
      if (kind === 'deep') return true; // yeraltı çakışması yükseklik bandıyla deepY'de çözülür
      const sr = type === 'kamp' ? 7 : 14;
      if (!rectAvoidsDisk(rect, S.spawn.x, S.spawn.z, sr)) { why(type, 'spawn'); return false; }
      const cx = circ ? circ.x : (rect.x0 + rect.x1) >> 1;
      const cz = circ ? circ.z : (rect.z0 + rect.z1) >> 1;
      if (zoneIndexAt(cx, cz) !== zone) { why(type, 'zone'); return false; }
      for (let i = 0; i < S.anchorList.length; i++) {
        const parts = S.anchorList[i].surfParts;
        for (let k = 0; k < parts.length; k++) {
          if (rectsOverlap(rect, parts[k], GAP)) { why(type, 'anchor'); return false; }
        }
      }
      return true;
    },
    /**
     * Yeraltı bandı: dikdörtgenle çakışan başka çapa derinliğiyle kesişmeyen en yüksek zemin y'si (≤ yMax, ≥ 8), yoksa −1.
     * h = bandın yüksekliği (zeminden tavana + pay).
     */
    deepY(rect, yMax, h) {
      for (let y = yMax; y >= 8; y -= h + 5) {
        let ok = true;
        for (let i = 0; i < S.anchorList.length && ok; i++) {
          const a = S.anchorList[i];
          if (a.deep && rectsOverlap(rect, a.deep, 4) && (y - 3) <= a.deepBand.y1 && (y + h) >= a.deepBand.y0) ok = false;
        }
        if (ok) return y;
      }
      return -1;
    },
    /**
     * Düz + kuru yer ara. spec: {hx,hz (düz alan yarıçapları), rect(x,z)→etki dikdörtgeni, maxVar, maxWet, jx, jz, tries, nx}
     * Döner {x,z,stats,rect, score} | null.
     */
    site(spec) {
      const maxVar = (spec.maxVar === undefined ? 6 : spec.maxVar) + (force ? 22 : (relaxed ? 5 : 0));
      const maxWet = spec.dry ? 0 : (force ? 0.95 : (relaxed ? 0.5 : (spec.maxWet === undefined ? 0.3 : spec.maxWet)));
      const list = env.cands(Math.max(spec.tries || 14, 40), spec.jx === undefined ? 26 : Math.max(spec.jx, 26), spec.jz === undefined ? 26 : Math.max(spec.jz, 26));
      let best = null;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const st = siteStats(S.seed, c.x, c.z, spec.hx, spec.hz, spec.nx || 5, spec.nz || spec.nx || 5);
        if (st.wet > maxWet) { why(type, 'wet'); continue; }
        if (st.range > maxVar) { why(type, 'range'); continue; }
        if (st.median > (spec.maxMedian || 92)) { why(type, 'high'); continue; }
        if (spec.accept && !spec.accept(c, st)) { why(type, 'accept'); continue; }
        const rect = spec.rect(c.x, c.z);
        if (!env.rectOk(rect, spec.circle ? spec.circle(c.x, c.z) : undefined)) { why(type, 'rect'); continue; }
        const score = st.range * 2 + st.wet * 50 + i * 0.4;
        if (!best || score < best.score) best = { x: c.x, z: c.z, stats: st, rect, score };
        if (best.score < 2.5 && i >= 4) break;
      }
      return best;
    },
  };
  return env;
}

/** İki plan çakışıyor mu: yüzey–yüzey 6, derin–derin 4 blok aralık. */
export function conflict(a, b) {
  for (let i = 0; i < a.surfParts.length; i++) {
    for (let j = 0; j < b.surfParts.length; j++) {
      if (rectsOverlap(a.surfParts[i], b.surfParts[j], GAP)) return true;
    }
  }
  if (a.deep && b.deep && rectsOverlap(a.deep, b.deep, 4)) {
    return a.deepBand.y0 <= b.deepBand.y1 && b.deepBand.y0 <= a.deepBand.y1;
  }
  // Derin plan (tapınak odaları) ↔ derin olmayan ama yeraltına inen yapı (gizli mağara: bounds.y0 zeminin ~17 altı): yatay örtüşme
  // + yükseklik bandı çakışması. Eskiden yalnız derin–derin denetleniyordu; mağaranın dolgusu tapınak odasının içine taş sokuyordu.
  if (underHit(a, b) || underHit(b, a)) return true;
  return false;
}

function underHit(d, o) {
  if (!d.deep || o.deep || !d.deepBand || !o.pub || !o.pub.bounds) return false;
  const bb = o.pub.bounds;
  if (bb.y0 > d.deepBand.y1 || bb.y1 < d.deepBand.y0) return false;
  for (let i = 0; i < o.surfParts.length; i++) if (rectsOverlap(o.surfParts[i], d.deep, 4)) return true;
  return false;
}

function planType(S, type, ci, cj, o) {
  const T = TYPES[type];
  if (!T) return null;
  const env = makeEnv(S, type, ci, cj, o);
  const plan = T.plan(env);
  if (!plan) return null;
  plan.type = type;
  if (!plan.surf) plan.surf = plan.rect;
  if (!plan.surfParts) plan.surfParts = [plan.surf];
  return plan;
}

/* ------------------------------------------------------------------------------------------------
 * Çapalar
 * ---------------------------------------------------------------------------------------------- */
function polar(rad, ang) {
  return { x: Math.round(rad * Math.cos(ang)), z: Math.round(rad * Math.sin(ang)) };
}

function place(S, type, zone, desiredFn, extra) {
  for (let pass = 0; pass < 3; pass++) {
    const tries = pass === 0 ? 22 : (pass === 1 ? 26 : 40);
    for (let a = 0; a < tries; a++) {
      const d = desiredFn(a + (pass >= 1 ? 22 : 0) + (pass === 2 ? 26 : 0));
      const ci = cellIndex(d.x);
      const cj = cellIndex(d.z);
      const key = type + ':' + ci + ',' + cj;
      if (S.anchorIds.has(key)) continue;
      const plan = planType(S, type, ci, cj, {
        anchor: true, desired: d, zone, relaxed: pass >= 1, force: pass === 2, extra,
      });
      if (!plan) continue;
      if (S.anchorList.some((a) => conflict(plan, a))) continue;
      plan.anchor = true;
      S.anchorIds.set(key, plan);
      S.anchorList.push(plan);
      return plan;
    }
  }
  return null;
}

function computeAnchors(S) {
  S.computing = true;
  const out = [];
  const spawn = S.spawn;
  for (let z = 0; z < ZONE_COUNT; z++) {
    const zn = ZONES[z];
    const ar = seededRandom(hash3(z, 77, S.seed ^ 0xa4c0));
    const ang0 = ar.float(0, TAU);
    const rOut = zn.rOut;
    const rIn = zn.rIn;
    const wid = rOut - rIn;
    // Mühür Kulesi: dış halkaya yakın
    out.push(place(S, 'muhursunagi', z, (a) => {
      const sgn = a % 2 === 0 ? 1 : -1;
      return polar(rOut - 20 - (a % 5) * 3, ang0 + sgn * 0.045 * Math.floor(a / 2));
    }));
    // Boss arenası
    if (zn.bossKey) {
      const R = [0, 22, 24, 26, 28][z];
      const base = ang0 + 1.35 + ar.float(-0.25, 0.25);
      out.push(place(S, 'bossarena', z, (a) => {
        const sgn = a % 2 === 0 ? 1 : -1;
        const rr = Math.max(rIn + R + 10, rOut - R - 14 - (a % 4) * 3);
        return polar(rr, base + sgn * 0.07 * Math.floor(a / 2));
      }));
    }
    // Anahtar Tapınakları (geri izlemeli: biri yerleşemezse öncekiler farklı konumlarla yeniden denenir)
    const N = zn.temples;
    const span = TAU - 2.6;
    const fracs = [];
    const jit = [];
    for (let k = 0; k < N; k++) {
      fracs.push(z === 0 ? ar.float(0.38, 0.55) : ar.float(0.3, 0.7));
      jit.push(ar.float(-0.15, 0.15));
    }
    let okAll = false;
    for (let retry = 0; retry < 10 && !okAll; retry++) {
      const placed = [];
      let failed = false;
      for (let k = 0; k < N && !failed; k++) {
        const baseAng = (z === 0
          ? ang0 + 2.3 + k * Math.PI + jit[k]
          : ang0 + 2.3 + (k + 0.5) * (span / N) + jit[k]) + retry * 0.31 * (k % 2 === 0 ? 1 : -1);
        const frac = Math.min(0.8, Math.max(0.2, fracs[k] + ((retry % 3) - 1) * 0.08));
        const plan = place(S, 'anahtartapinagi', z, (a) => {
          const sgn = a % 2 === 0 ? 1 : -1;
          const rr = rIn + wid * Math.min(0.85, Math.max(0.15, frac + sgn * 0.02 * Math.floor(a / 3)));
          return polar(rr, baseAng + sgn * 0.08 * Math.floor(a / 2));
        }, { retry });
        if (!plan) failed = true;
        else placed.push(plan);
      }
      if (failed) {
        placed.forEach((pl) => {
          S.anchorIds.delete(pl.pub.id);
          const i = S.anchorList.indexOf(pl);
          if (i >= 0) S.anchorList.splice(i, 1);
        });
      } else {
        okAll = true;
        placed.forEach((pl) => out.push(pl));
      }
    }
    if (z === 0) {
      // Başlangıç kampı doğuş noktasına yakın; Başlangıç Vadisi'ne sığmazsa Fısıldayan Ormanlar girişine kurulur
      const campAng = ang0 + 0.8;
      let camp = place(S, 'kamp', 0, (a) => ({
        x: Math.round(spawn.x + Math.cos(campAng + a * 2.399963) * (22 + (a % 7) * 6)),
        z: Math.round(spawn.z + Math.sin(campAng + a * 2.399963) * (22 + (a % 7) * 6)),
      }), { starter: true });
      if (!camp) {
        camp = place(S, 'kamp', 1, (a) => polar(ZONES[1].rIn + 14 + (a % 6) * 5, ang0 + 0.8 + a * 0.35), { starter: true });
      }
      out.push(camp);
      out.push(place(S, 'gozcukulesi', 0, (a) => polar(46 + (a % 4) * 4, ang0 + 5.4 + a * 0.15)));
    } else if (z === 1) {
      out.push(place(S, 'kamp', z, (a) => polar(rIn + 26 + (a % 5) * 4, ang0 + 4.2 + a * 0.2)));
    }
    // her bölgenin kademesi: Z0 → Bronz … Z4 → Kuantum (ilk bölge sığmazsa komşu bölgede)
    const tier = z + 1;
    let pk = null;
    for (let dz = 0; dz < 3 && !pk; dz++) {
      const zz = Math.min(ZONE_COUNT - 1, z + dz);
      const zr = ZONES[zz];
      const pang = ang0 + 3.9 + dz * 1.1;
      pk = place(S, 'parkur', zz, (a) => polar(
        zz === 0 ? 52 + (a % 4) * 4 : zr.rIn + (zr.rOut - zr.rIn) * (0.35 + 0.1 * (a % 5)),
        pang + a * 0.12,
      ), { tier });
    }
    out.push(pk);
    void wid;
  }
  S.computing = false;
  return out.filter(Boolean);
}

/* ------------------------------------------------------------------------------------------------
 * Hücre kararı + plan + kabul
 * ---------------------------------------------------------------------------------------------- */
/** Ağırlıklı sıralama: ilk eleman ağırlıkla seçilir, kalanlar yedek sırası (belirlenimli). */
function orderByWeight(weights, seed, ci, cj) {
  const rng = seededRandom(hash3(ci, cj, seed ^ 0x7e11));
  const pool = weights.map((w) => [w[0], w[1]]);
  const out = [];
  while (pool.length > 0 && out.length < 5) {
    const i = rng.weighted(pool.map((w) => w[1]));
    out.push(pool[i][0]);
    pool.splice(i, 1);
  }
  return out;
}

/** Hücrenin tür aday sırası (dolu değilse null). İlk tür başarısız olursa sıradaki denenir. */
export function cellDecision(S, ci, cj) {
  const cx = ci * CELL;
  const cz = cj * CELL;
  if (Math.hypot(cx, cz) > WORLD_RADIUS - 24) return null;
  const zone = zoneIndexAt(cx, cz);
  const r0 = hash2(ci, cj, S.seed ^ 0x5712) / 4294967296;
  if (r0 >= OCCUPANCY[zone]) return null;
  const mult = BIOME_MULT[biomeKeyAt(S.seed, cx, cz)] || {};
  return orderByWeight(WEIGHTS[zone].map((w) => [w[0], w[1] * (mult[w[0]] || 1)]), S.seed, ci, cj);
}

function rawPlan(S, ci, cj) {
  const key = ci + ',' + cj;
  if (S.raw.has(key)) return S.raw.get(key);
  let plan = null;
  const order = cellDecision(S, ci, cj);
  if (order) {
    for (let i = 0; i < order.length && !plan; i++) {
      if (S.anchorIds.has(order[i] + ':' + ci + ',' + cj)) continue;
      plan = planType(S, order[i], ci, cj, {});
    }
    why('z' + zoneIndexAt(ci * CELL, cj * CELL), plan ? 'planned' : 'plannull');
  }
  if (plan) plan.priority = hash2(ci, cj, S.seed ^ 0x7777);
  S.raw.set(key, plan);
  return plan;
}

function acceptedPlan(S, ci, cj) {
  const key = ci + ',' + cj;
  if (S.acc.has(key)) return S.acc.get(key);
  S.acc.set(key, null); // döngü koruması
  const plan = rawPlan(S, ci, cj);
  let ok = !!plan;
  if (ok) {
    for (let i = 0; i < S.anchorList.length && ok; i++) {
      if (conflict(plan, S.anchorList[i])) ok = false;
    }
  }
  for (let dj = -2; dj <= 2 && ok; dj++) {
    for (let di = -2; di <= 2 && ok; di++) {
      if (di === 0 && dj === 0) continue;
      if (!cellDecision(S, ci + di, cj + dj)) continue;
      const np = rawPlan(S, ci + di, cj + dj);
      if (!np) continue;
      if (np.priority < plan.priority || (np.priority === plan.priority && np.pub.id > plan.pub.id)) continue;
      if (!conflict(plan, np)) continue;
      if (acceptedPlan(S, ci + di, cj + dj)) ok = false;
    }
  }
  const res = ok ? plan : null;
  if (plan && !ok) why('z' + zoneIndexAt(ci * CELL, cj * CELL), 'conflicted');
  S.acc.set(key, res);
  return res;
}

/* ------------------------------------------------------------------------------------------------
 * Sorgular (planlar)
 * ---------------------------------------------------------------------------------------------- */
/** Dikdörtgenle kesişen kabul edilmiş planlar (çapalar + hücre planları), id sıralı. */
export function plansInRect(S, x0, z0, x1, z1) {
  const out = [];
  const seen = new Set();
  const pad = MAX_REACH;
  const c0 = cellIndex(x0 - pad);
  const c1 = cellIndex(x1 + pad);
  const d0 = cellIndex(z0 - pad);
  const d1 = cellIndex(z1 + pad);
  for (let cj = d0; cj <= d1; cj++) {
    for (let ci = c0; ci <= c1; ci++) {
      const p = acceptedPlan(S, ci, cj);
      if (p && !seen.has(p.pub.id) && p.rect.x1 >= x0 && p.rect.x0 <= x1 && p.rect.z1 >= z0 && p.rect.z0 <= z1) {
        seen.add(p.pub.id);
        out.push(p);
      }
    }
  }
  for (let i = 0; i < S.anchorList.length; i++) {
    const p = S.anchorList[i];
    if (!seen.has(p.pub.id) && p.rect.x1 >= x0 && p.rect.x0 <= x1 && p.rect.z1 >= z0 && p.rect.z0 <= z1) {
      seen.add(p.pub.id);
      out.push(p);
    }
  }
  out.sort((a, b) => (a.pub.id < b.pub.id ? -1 : 1));
  return out;
}

/** Hücrenin kabul edilmiş planı (hücreye ait; çapa değil) | null. */
export function cellPlan(S, ci, cj) {
  return acceptedPlan(S, ci, cj);
}

/** id (`tür:ci,cj`) → kabul edilmiş plan | null. */
export function planById(S, id) {
  const m = /^([a-z]+):(-?\d+),(-?\d+)$/.exec(String(id));
  if (!m) return null;
  const ci = Number(m[2]);
  const cj = Number(m[3]);
  const anc = S.anchorIds.get(id);
  if (anc) return anc;
  const p = acceptedPlan(S, ci, cj);
  return p && p.pub.id === id ? p : null;
}

/** Tüm dünya (WORLD_RADIUS içi) yapıları: test ve harita için. */
export function allPlans(S) {
  const R = Math.ceil(WORLD_RADIUS / CELL) + 1; // dünya yarıçapını kapsar
  const out = [];
  const seen = new Set();
  for (let cj = -R; cj <= R; cj++) {
    for (let ci = -R; ci <= R; ci++) {
      const p = acceptedPlan(S, ci, cj);
      if (p && !seen.has(p.pub.id)) {
        seen.add(p.pub.id);
        out.push(p);
      }
    }
  }
  S.anchorList.forEach((p) => {
    if (!seen.has(p.pub.id)) {
      seen.add(p.pub.id);
      out.push(p);
    }
  });
  out.sort((a, b) => (a.pub.id < b.pub.id ? -1 : 1));
  return out;
}

export { STRUCTURE_TYPES, TYPES };
