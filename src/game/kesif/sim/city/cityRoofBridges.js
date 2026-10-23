/*
 * KEŞİF sim/city — MERKEZ/TEKNOLOJİ KULELERİ ARASI GÖKYÜZÜ KÖPRÜLERİ (Faz 2, interiors_d). Saf, belirlenimci; pencereye kırpılır.
 * İki kulenin (aynı bölgede, aralarında 5–16 blok boş hava) çatı kademeleri arasında açık havada yürüme köprüsü:
 *   3 geniş tahta güverte (eğim ≤ 1/2: her 2 hücrede ≤1 basamak), iki yanda çit + camgöbeği korkuluk lambası, altta neon aydınlatma,
 *   uçlardaki korkuluk (parapet) açıklığı. İçe kapı yok → "kapalı kat sızıntısı" olmaz; yalnız çatıya çıkabilen oyuncu (planör/jetpack/kanca) kullanır.
 *
 *  skybridgesOf(plan, lot) → [{key, axis:'x'|'z', ax, bx, zc (yanal merkez), cells:[{x,y,z}], ends:[{x,z,y,sgn}], a:lotId, b:lotId, yA, yB}]
 *  emitSkybridges(w, plan, lot, bp)    bu parselle ilgili köprüleri yazar (iki uç parselden de çağrılır; yazımlar eşit/bağımsız)
 */
import { B } from '../blocks.js';
import { ID } from './cityEmit.js';
import { ARCHETYPES } from './archetypes.js';
import { lotAt } from './cityLots.js';
import { lotsInRect } from './cityPlan.js';
import { planBuilding } from './buildingPlan.js';
import { UT, hh } from './cityContentKit.js';

const MIN_GAP = 2;
const MAX_GAP = 16;

function exposedTops(bp) {
  // kademe çatıları: üst yüzü açık (üstünü örten kademe yok) olanlar
  const out = [];
  for (let i = 0; i < bp.tiers.length; i++) {
    const t = bp.tiers[i];
    const covered = bp.tiers.some((o) => o !== t && o.part === t.part && o.f0 === t.f1 && o.x0 <= t.x0 + 1 && o.x0 + o.w >= t.x0 + t.w - 1);
    if (covered) continue;
    out.push({
      x0: t.x0, z0: t.z0, x1: t.x0 + t.w, z1: t.z0 + t.d, y: 64 + 4 * t.f1 + (t.f1 === bp.floors && bp.roof ? bp.roof.lift : 0), part: t.part,
    });
  }
  return out;
}

function towerBp(plan, lot) {
  const A0 = ARCHETYPES[lot.archetype];
  if (!A0 || !A0.tower || !lot.built || lot.hill) return null;
  const bp = planBuilding(plan, lot);
  return bp && bp.tiers && bp.tiers.length ? bp : null;
}

/** Hücre (x,z) üstünde y düzeyinde herhangi bir bina kademesi var mı (köprü yolu çakışması). */
function blockedAt(plan, x, z, y, ia, ib) {
  const lot = lotAt(plan, x, z);
  if (!lot || !lot.built || lot.hill || lot.id === ia || lot.id === ib) return false; // uç kuleler kendi kenarıyla çakışmaz
  const A0 = ARCHETYPES[lot.archetype];
  if (!A0 || !A0.building) return false;
  const bp = planBuilding(plan, lot);
  if (!bp.tiers) return false;
  for (let i = 0; i < bp.tiers.length; i++) {
    const t = bp.tiers[i];
    if (x >= t.x0 - 1 && x <= t.x0 + t.w && z >= t.z0 - 1 && z <= t.z0 + t.d && y <= 64 + 4 * t.f1 + 4) return true;
  }
  return false;
}

function pairBridge(plan, A, B2) {
  const bpA = towerBp(plan, A);
  const bpB = towerBp(plan, B2);
  if (!bpA || !bpB) return null;
  if (hh(plan.seed, A.id * 20000 + B2.id, UT.RF_BRIDGE) % 100 >= 65) return null;
  const ta = exposedTops(bpA);
  const tb = exposedTops(bpB);
  let best = null;
  for (let i = 0; i < ta.length; i++) {
    for (let j = 0; j < tb.length; j++) {
      const a = ta[i];
      const b = tb[j];
      for (let ax = 0; ax < 2; ax++) {
        // eksen x: a solda, b sağda (ya da ters)
        const lo = ax === 0 ? Math.max(a.z0, b.z0) : Math.max(a.x0, b.x0);
        const hi = ax === 0 ? Math.min(a.z1, b.z1) : Math.min(a.x1, b.x1);
        if (hi - lo < 7) continue;
        const sgn = ax === 0 ? (b.x0 >= a.x1 ? 1 : (a.x0 >= b.x1 ? -1 : 0)) : (b.z0 >= a.z1 ? 1 : (a.z0 >= b.z1 ? -1 : 0));
        if (sgn === 0) continue;
        const gap = ax === 0 ? (sgn > 0 ? b.x0 - a.x1 : a.x0 - b.x1) : (sgn > 0 ? b.z0 - a.z1 : a.z0 - b.z1);
        if (gap < MIN_GAP || gap > MAX_GAP) continue;
        const dy = b.y - a.y;
        if (Math.abs(dy) * 2 > gap) continue;
        const score = Math.abs(dy) * 100 + gap;
        if (best === null || score < best.score) best = { score, a, b, ax, sgn, gap, lo, hi, dy };
      }
    }
  }
  if (!best) return null;
  const { a, b, ax, sgn, gap, lo, hi, dy } = best;
  const zc = Math.floor((lo + hi) / 2);
  // A kenarından B kenarına hücreler (A kenarının DIŞINDAN başlar)
  const start = ax === 0 ? (sgn > 0 ? a.x1 : a.x0 - 1) : (sgn > 0 ? a.z1 : a.z0 - 1);
  const cells = [];
  for (let i = 0; i < gap; i++) {
    const t = start + sgn * i;
    const y = a.y - 1 + Math.round(((i + 1) * dy) / (gap + 1));
    for (let o = -1; o <= 1; o++) cells.push(ax === 0 ? { x: t, y, z: zc + o, i } : { x: zc + o, y, z: t, i });
  }
  // yol çakışması: köprü hücreleri üstünde (y−1 .. y+3) başka kademe var mı
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k];
    if (blockedAt(plan, c.x, c.z, c.y + 3, A.id, B2.id)) return null;
  }
  const ends = [
    { x: ax === 0 ? (sgn > 0 ? a.x1 - 1 : a.x0) : zc, z: ax === 0 ? zc : (sgn > 0 ? a.z1 - 1 : a.z0), y: a.y, sgn: -sgn, lot: A.id, part: a.part },
    { x: ax === 0 ? (sgn > 0 ? b.x0 : b.x1 - 1) : zc, z: ax === 0 ? zc : (sgn > 0 ? b.z0 : b.z1 - 1), y: b.y, sgn, lot: B2.id, part: b.part },
  ];
  return {
    key: A.id + ',' + B2.id, axis: ax === 0 ? 'x' : 'z', sgn, gap, zc, cells, ends, a: A.id, b: B2.id, yA: a.y, yB: b.y,
  };
}

export function skybridgesOf(plan, lot) {
  let cache = plan._ugBridges;
  if (!cache) {
    cache = new Map();
    Object.defineProperty(plan, '_ugBridges', { value: cache, enumerable: false, configurable: true, writable: true });
  }
  const hit = cache.get(lot.id);
  if (hit) return hit;
  const out = [];
  const A0 = ARCHETYPES[lot.archetype];
  if (A0 && A0.tower && lot.built && !lot.hill) {
    const near = lotsInRect(plan.seed, lot.x0 - MAX_GAP - 2, lot.z0 - MAX_GAP - 2, lot.x1 + MAX_GAP + 2, lot.z1 + MAX_GAP + 2);
    for (let i = 0; i < near.length; i++) {
      const N = near[i];
      if (N.id === lot.id) continue;
      const lo = lot.id < N.id ? lot : N;
      const hi2 = lot.id < N.id ? N : lot;
      const pb = pairBridge(plan, lo, hi2);
      if (pb) out.push(pb);
    }
    out.sort((p, q) => (p.key < q.key ? -1 : 1));
  }
  cache.set(lot.id, out);
  return out;
}

function emitBridge(w, br) {
  const ax = br.axis === 'x';
  // pencere ön süzgeci
  const cs = br.cells;
  let minx = 1e9;
  let maxx = -1e9;
  let minz = 1e9;
  let maxz = -1e9;
  for (let i = 0; i < cs.length; i++) {
    if (cs[i].x < minx) minx = cs[i].x;
    if (cs[i].x > maxx) maxx = cs[i].x;
    if (cs[i].z < minz) minz = cs[i].z;
    if (cs[i].z > maxz) maxz = cs[i].z;
  }
  if (!w.touches(minx - 2, minz - 2, maxx + 3, maxz + 3)) return;
  // uç açıklıkları: korkuluk (parapet) hücreleri temizlenir (kenar hücresi y..y+1)
  for (let e = 0; e < 2; e++) {
    const E = br.ends[e];
    for (let o = -1; o <= 1; o++) {
      const x = ax ? E.x : E.x + o;
      const z = ax ? E.z + o : E.z;
      w.set(x, E.y, z, 0);
      w.set(x, E.y + 1, z, 0);
    }
  }
  for (let k = 0; k < cs.length; k++) {
    const c = cs[k];
    if (c.x < w.x0 || c.x >= w.x1 || c.z < w.z0 || c.z >= w.z1) continue;
    const side = ax ? (c.z === br.zc - 1 || c.z === br.zc + 1) : (c.x === br.zc - 1 || c.x === br.zc + 1);
    w.set(c.x, c.y, c.z, ID.POLISHED);
    w.set(c.x, c.y + 1, c.z, 0);
    w.set(c.x, c.y + 2, c.z, 0);
    // orta şerit: tahta; yanlar: koyu panel
    if (!side) w.set(c.x, c.y, c.z, B.PLANKS_OAK);
    if (side) {
      w.set(c.x, c.y + 1, c.z, B.FENCE);
      if (c.i % 4 === 0) {
        w.set(c.x, c.y + 2, c.z, ID.NEON_CYAN);
      }
    }
    // altta neon aydınlatma (orta, 4'te bir)
    if (!side && c.i % 4 === 2) w.set(c.x, c.y - 1, c.z, ID.NEON_CYAN);
  }
}

/** Penceredeki tüm köprüler (bölgeler arası kuleler dahil; kule parseli başka blokta olabilir → pencereden aranır). */
export function emitSkybridgesWindow(w, plan) {
  if (!w.touchesY(70, 335)) return;
  const near = lotsInRect(plan.seed, w.x0 - MAX_GAP - 2, w.z0 - MAX_GAP - 2, w.x1 + MAX_GAP + 2, w.z1 + MAX_GAP + 2);
  const seen = new Set();
  for (let i = 0; i < near.length; i++) {
    const lot = near[i];
    const A0 = ARCHETYPES[lot.archetype];
    if (!A0 || !A0.tower) continue;
    const bs = skybridgesOf(plan, lot);
    for (let k = 0; k < bs.length; k++) {
      if (seen.has(bs[k].key)) continue;
      seen.add(bs[k].key);
      emitBridge(w, bs[k]);
    }
  }
}

