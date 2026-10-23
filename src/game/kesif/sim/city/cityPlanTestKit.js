/*
 * KEŞİF sim/city — cityplan testleri için ortak yardımcılar (yalnız test dosyaları içe aktarır).
 *   citySeed(i)            i. test tohumu (gerçek dimSeed(worldSeed,'neon') değerleri)
 *   digest(value)          değeri (Float32Array dahil) kararlı JSON'a çevirip uint32 hash'ler
 *   planDigest(seed, order) planın tüm bloklarını (props/furniture/lamps/lots) + binaları verilen blok sırasıyla üretir ve hash'ler
 *   bfsWalk(walk, from)    yaya ağında erişilebilir düğüm kümesi
 */
import { dimSeed } from '../dim/dimensions.js';
import { stringSeedToInt } from '../rng.js';
import { allLots } from './cityLots.js';
import { getBlockPlan, getCityPlan, planBuilding } from './cityPlan.js';

export function citySeed(i) {
  return dimSeed(Math.imul(i + 1, 7919) + 13, 'neon');
}

function replacer(k, v) {
  if (v instanceof Float32Array) return Array.from(v, (x) => Math.round(x * 1000) / 1000);
  if (v instanceof Map) return Array.from(v.entries());
  if (v instanceof Set) return Array.from(v.values());
  if (typeof v === 'function') return undefined;
  return v;
}

export function digest(value) {
  return stringSeedToInt(JSON.stringify(value, replacer));
}

/** order: 'asc' | 'desc' | 'shuffle'. Blok planı + her parselin bina planı. */
export function planDigest(seed, order) {
  const keys = [];
  for (let bj = -10; bj <= 9; bj++) for (let bi = -10; bi <= 9; bi++) keys.push([bi, bj]);
  if (order === 'desc') keys.reverse();
  else if (order === 'shuffle') {
    for (let i = keys.length - 1; i > 0; i--) {
      const j = (Math.imul(i, 2654435761) >>> 7) % (i + 1);
      const t = keys[i];
      keys[i] = keys[j];
      keys[j] = t;
    }
  }
  const parts = new Array(keys.length);
  const bp = {};
  keys.forEach(([bi, bj]) => {
    const b = getBlockPlan(seed, bi, bj);
    bp[bi + ',' + bj] = b;
  });
  const plan = getCityPlan(seed);
  const lots = allLots(plan).slice();
  if (order === 'desc') lots.reverse();
  const bld = {};
  lots.forEach((l) => {
    bld[l.id] = planBuilding(seed, l);
  });
  const sortedKeys = Object.keys(bp).sort();
  sortedKeys.forEach((k, i) => {
    parts[i] = digest(bp[k]);
  });
  const lotIds = Object.keys(bld).map(Number).sort((a, b) => a - b);
  const bparts = lotIds.map((id) => digest(bld[id]));
  return digest([parts, bparts, plan.terminals, plan.races, plan.roofRoutes, plan.underground, plan.skyline, plan.intersections]);
}

export function bfsWalk(walk, from) {
  const seen = new Uint8Array(walk.nodes.length);
  const st = [from];
  seen[from] = 1;
  while (st.length) {
    const u = st.pop();
    const l = walk.adj[u];
    for (let q = 0; q < l.length; q++) {
      if (!seen[l[q].to]) {
        seen[l[q].to] = 1;
        st.push(l[q].to);
      }
    }
  }
  return seen;
}
