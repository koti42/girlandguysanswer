/*
 * KEŞİF sim/city — PARSEL YERLEŞİMİ (blok → parseller). Saf, belirlenimci, önbellekli. Sözleşme §7 "Parsel", risk #9 (tek `lotPlan` kaynağı).
 *
 *  layoutBlock(plan, bi, bj) → {bi,bj,kind,rect,district,lots:[Lot],axis}      sahip (owner) ataması UYGULANMIŞ
 *  baseLayout(plan, bi, bj)                                                      sahipsiz taban yerleşim
 *  lotAt(plan, x, z) → Lot | null           lotById(plan, id) → Lot | null       O(1) (blok hesabı + ≤32 parsel taraması)
 *  footprintOf(lot) → {x0,z0,x1,z1}         bina ayak izi (parsel − set-back); açık arketiplerde null
 *  doorOf(lot) → Door | null                cephe girişi (3 genişlik, 3 yükseklik; kayar kapı 239/240)
 *  ownerMap(plan) → Map<ownerId,{lotId,bi,bj,k,archetype}>   16 sahip, 16 ayrı parsel
 *  allLots(plan) → Lot[]                    (iterasyon; ilk çağrıda 400 blok yerleşimi)
 *  OWNER_HOME                               sahip iç mekân türü → bölge listesi (cityBrands ile aynı; test çapraz denetler)
 *
 * Lot = {id, bi, bj, k, x0,z0,x1,z1,w,d, front:'n'|'s'|'e'|'w', corner:bool, district, archetype, floors, built, owner, roof, station, hill,
 *        setback:{f,s,b}, door}
 *  - Parsel dikdörtgeni [x0,x1)×[z0,z1) tamsayı bloktur; `front` kenarı bir yol KORİDORUNA (kaldırım dış kenarına) bitişiktir (her parsel yola değer).
 *  - id = ((bj+10)·20+(bi+10))·32+k  (blok başına ≤32 parsel).
 *  - Yerleşim: blok iç dikdörtgeni iki banda (kuzey/güney ya da batı/doğu) bölünür; her bant yola bakar. Ara boşluk 0/2/3/4 (çatı parkuru
 *    bloklarında ≤3), band içi parseller arası 0/2/3/4. Merkez/Teknoloji/Liman'da bazen tek mega parsel. Kanal bloklarında tek bant, derinlik
 *    kanal kıyısına (26 blok: su 20 + rıhtım 6) göre kırpılır; <10 derinlik düşer. İstasyon köşelerinde 12×12 `istasyon_girisi` parseli.
 */
import {
  ARCHETYPES, ARCH_WEIGHTS, DISTRICTS, DISTRICT_KEYS, ROOF_ROUTE_ARCHS, floorsFor, interiorFits,
} from './archetypes.js';
import { OWNERS } from './ownerData.js';
import {
  BK, CANAL, GRID, blockRect, canalCenterZ, stationLattice,
} from './cityRoads.js';
import { Lru, TAG, blockKey, sh, shf, stream } from './cityPlanKit.js';

export const OWNER_HOME = Object.freeze({
  kapsul_daire: ['merkez', 'teknoloji', 'gece_pazari'],
  loft: ['merkez', 'teknoloji'],
  hacker_odasi: ['teknoloji', 'liman'],
  oyuncu_odasi: ['gece_pazari', 'merkez', 'konteyner'],
  ramen_bari: ['gece_pazari', 'merkez', 'tepe'],
  klinik: ['merkez', 'teknoloji', 'tepe'],
  garaj_atolyesi: ['liman', 'konteyner'],
  kulup: ['merkez', 'gece_pazari'],
  market: ['merkez', 'gece_pazari', 'tepe', 'teknoloji', 'konteyner', 'liman'],
  cati_bahcesi: ['tepe', 'merkez'],
  kitap_kafe: ['merkez', 'teknoloji', 'tepe'],
  sanat_studyosu: ['gece_pazari', 'konteyner', 'tepe'],
  robot_tamirhanesi: ['liman', 'konteyner', 'teknoloji'],
  arcade: ['gece_pazari', 'merkez', 'konteyner'],
  dron_kurye: ['merkez', 'teknoloji', 'liman', 'gece_pazari'],
  holo_sinema: ['merkez', 'gece_pazari'],
});

const KIOSK = 12;
/* Merkez istasyonu (0,0) giriş kioskları: 4 meydan bloğunda birer 12×12 parsel (Mor hattı x=0'a bakar); Kapı Meydanı karesinin (|x|,|z|≤17) dışında. */
const CENTRAL_KIOSK = Object.freeze({
  '0,-1': { rect: { x0: 10, x1: 22, z0: -30, z1: -18 }, front: 'w' },
  '0,0': { rect: { x0: 10, x1: 22, z0: 18, z1: 30 }, front: 'w' },
  '-1,-1': { rect: { x0: -22, x1: -10, z0: -30, z1: -18 }, front: 'e' },
  '-1,0': { rect: { x0: -22, x1: -10, z0: 18, z1: 30 }, front: 'e' },
});
const MIN_DEPTH = 10;
const GAP_POOL = Object.freeze([0, 0, 0, 0, 2, 3, 4]);
const GAP_ROUTE = Object.freeze([0, 1, 2, 3]);
/**
 * Çatı parkuru başlangıç parselinin ön yüzü `len` ise dış merdiven ile 3 geniş kapı yan yana sığmalı. İki kollu merdiven: ceil(yükseklik/2)+7 ≤ len; sığmazsa
 * üç kollu (buildingPlan.extStairThree): ceil(yükseklik/3)+7 ≤ len. En çok kat: F ≤ 4 ve ceil((4F+1)/3)+7 ≤ len, en az `lo` (bölge alt sınırı).
 * QA2: kapı önü merdivenle kapanıyordu.
 */
export function floorsFitStair(len, lo) {
  for (let f = 4; f > lo; f--) if (Math.ceil((4 * f + 1) / 3) + 7 <= len) return f;
  return lo;
}

export function lotId(bi, bj, k) {
  return (((bj + 10) * 20) + (bi + 10)) * 32 + k;
}
/** id → {bi,bj,k} */
export function lotIdParts(id) {
  const k = id & 31;
  const b = id >> 5;
  return { bi: (b % 20) - 10, bj: Math.floor(b / 20) - 10, k };
}

/* ------------------------------------------------------------------------------------------------
 * Bant bölümlemesi
 * ---------------------------------------------------------------------------------------------- */
/** L uzunluğunu [lo,hi] genişlikli parsellere böler: [{o,w}] (o: bant başından ofset). `resS` başta ayrılmış, `resE` sonda ayrılmış uzunluk. */
function partitionBand(st, L, lo, hi, gaps, resS, resE, stretch) {
  const out = [];
  const start = resS > 0 ? resS + gaps[st.i(gaps.length)] : 0;
  const end = L - (resE > 0 ? resE + gaps[st.i(gaps.length)] : 0);
  const Lr = end - start;
  if (Lr < 6) return { lots: out, start, end };
  let nMin = Math.max(1, Math.ceil(Lr / (hi + 1)));
  const nMax = Math.max(1, Math.floor((Lr + 2) / lo));
  if (nMin > nMax) nMin = nMax;
  let n = nMin + st.i(nMax - nMin + 1);
  let gs = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    gs = [];
    let gsum = 0;
    for (let g = 0; g < n - 1; g++) {
      const gv = attempt >= 3 ? 0 : gaps[st.i(gaps.length)];
      gs.push(gv);
      gsum += gv;
    }
    if (n * lo <= Lr - gsum + 0.001 || n === 1) break;
    if (attempt >= 3 && n > 1) n--;
  }
  let gsum = 0;
  for (let g = 0; g < gs.length; g++) gsum += gs[g];
  let avail = Lr - gsum;
  if (n === 1) {
    const w = stretch ? avail : Math.min(avail, hi);
    if (w < Math.min(lo, 6)) return { lots: out, start, end };
    const off = start + Math.floor((avail - w) * st.f());
    out.push({ o: off, w });
    return { lots: out, start, end };
  }
  if (avail < n * lo) {
    // sığmıyor: parselleri küçült (alt sınırın altına, en az 6)
    const w0 = Math.floor(avail / n);
    if (w0 < 6) {
      n = Math.max(1, Math.floor(avail / 6));
      gs = gs.slice(0, Math.max(0, n - 1));
      gsum = 0;
      for (let g = 0; g < gs.length; g++) gsum += gs[g];
      avail = Lr - gsum;
    }
  }
  const ws = new Array(n).fill(Math.min(lo, Math.floor(avail / n)));
  let extra = avail - ws.reduce((a, b) => a + b, 0);
  let guard = 0;
  while (extra > 0 && guard++ < 400) {
    const k = st.i(n);
    if (ws[k] >= hi) {
      let all = true;
      for (let q = 0; q < n; q++) if (ws[q] < hi) all = false;
      if (all) break;
      continue;
    }
    const add = Math.min(extra, hi - ws[k], 1 + st.i(4));
    ws[k] += add;
    extra -= add;
  }
  if (stretch) {
    // son parsel bant sonuna uzanır (çatı parkurunda iki bandın son parselleri üst üste biner)
    let used = 0;
    for (let q = 0; q < n; q++) used += ws[q];
    for (let g = 0; g < gs.length; g++) used += gs[g];
    ws[n - 1] += Math.max(0, Lr - used);
  }
  let o = start;
  for (let q = 0; q < n; q++) {
    out.push({ o, w: ws[q] });
    o += ws[q] + (q < n - 1 ? gs[q] : 0);
  }
  return { lots: out, start, end };
}

/* ------------------------------------------------------------------------------------------------
 * Küçük yardımcılar
 * ---------------------------------------------------------------------------------------------- */
function stationCornerOf(bi, bj) {
  const S = stationLattice();
  for (let s = 0; s < S.length; s++) {
    const i = S[s][0];
    const j = S[s][1];
    if (i === 0 && j === 0) continue;
    if ((bi === i - 1 || bi === i) && (bj === j - 1 || bj === j)) {
      return { id: s, cx: bi === i - 1 ? 'x1' : 'x0', cz: bj === j - 1 ? 'z1' : 'z0', i, j };
    }
  }
  return null;
}

function blockDistrict(plan, bi, bj) {
  return plan.districts.districtAt(bi * GRID + GRID / 2, bj * GRID + GRID / 2);
}

function routeOfBlock(plan, bi, bj) {
  const rb = plan.roads.blocks.routeBlocks;
  for (let r = 0; r < rb.length; r++) if (rb[r].bi === bi && rb[r].bj === bj) return rb[r];
  return null;
}

/** Çatı parkuru bilgisi (blok başına bir kez; kat sayısı ve yükseltme belirlenimci). */
export function routeInfo(plan, rb) {
  const dk = rb.district;
  const D0 = DISTRICTS[dk];
  const fmin = Math.ceil(D0.hMin / 4);
  const fmax = Math.floor(D0.hMax / 4);
  // alçak: bölge aralığının alt yarısı (parkur için ≥2 kat)
  const lo = Math.max(2, fmin);
  const hi = Math.max(lo, Math.min(fmax, lo + 2, 4)); // dış merdiven (≤17 basamak) en dar parsele sığsın
  const floors = lo + Math.floor(shf(plan.seed, rb.route, TAG.ROOF_FLOORS) * (hi - lo + 1));
  return { route: rb.route, floors, district: dk };
}

function pickArchetype(st, dk, w, d, setSum) {
  const wt = ARCH_WEIGHTS[dk];
  const keys = Object.keys(wt);
  const ws = new Array(keys.length);
  for (let a = 0; a < keys.length; a++) {
    const A0 = ARCHETYPES[keys[a]];
    const fw = w - 2;
    const fd = d - setSum;
    ws[a] = fw >= A0.minW && fd >= A0.minD ? wt[keys[a]] : (fw >= A0.minD && fd >= A0.minW ? wt[keys[a]] * 0.25 : 0);
  }
  const idx = st.weighted(ws);
  return idx >= 0 ? keys[idx] : null;
}

function makeLot(plan, bi, bj, k, rect, front, extra) {
  const seed = plan.seed;
  const id = lotId(bi, bj, k);
  const w = rect.x1 - rect.x0;
  const d = rect.z1 - rect.z0;
  const cx = (rect.x0 + rect.x1) / 2;
  const cz = (rect.z0 + rect.z1) / 2;
  const dk = plan.districts.districtAt(cx, cz);
  const D0 = DISTRICTS[dk];
  const sf = (extra && extra.forceSet) || null;
  const st = stream(seed, id, TAG.LOT_SET);
  const setback = sf || { f: 0, s: 0, b: 0 };
  let arch = (extra && extra.archetype) || null;
  let built = true;
  if (!arch) {
    const stb = stream(seed, id, TAG.LOT_BUILT);
    built = stb.f() < D0.density;
    if (!built) arch = 'park';
  }
  if (!sf) {
    const open = arch === 'park';
    const shop = dk === 'gece_pazari' || (arch === 'dukkan_sirasi');
    setback.f = open ? 0 : shop ? st.i(2) : 1 + st.i(3);
    setback.s = open || shop ? 0 : st.i(2);
    setback.b = open ? 0 : st.i(3);
  }
  if (!arch) {
    const sta = stream(seed, id, TAG.LOT_ARCH);
    arch = pickArchetype(sta, dk, w, d, setback.f + setback.b);
    if (!arch) {
      arch = 'park';
      built = false;
    }
  }
  const A0 = ARCHETYPES[arch];
  let floors = 0;
  if (A0.building && !A0.special) {
    floors = floorsFor(dk, arch, shf(seed, id, TAG.LOT_H), Math.sqrt(cx * cx + cz * cz));
  } else if (A0.special) floors = arch === 'istasyon_girisi' ? 1 : 0;
  return {
    id, bi, bj, k, x0: rect.x0, z0: rect.z0, x1: rect.x1, z1: rect.z1, w, d, front, corner: false, district: dk, archetype: arch, floors, built,
    owner: null, roof: null, station: (extra && extra.station) || null, hill: false, setback, door: null,
  };
}

/** Çatı parkuru için parsel bilgilerini zorla (aynı kat sayısı, yan/arka set-back 0, ön set-back ≥3 yalnız başlangıç). */
function applyRoute(plan, lot, rinfo, order, total) {
  const seed = plan.seed;
  const archs = ROOF_ROUTE_ARCHS[rinfo.district] || ROOF_ROUTE_ARCHS.konteyner;
  const sa = stream(seed, lot.id, TAG.LOT_ROUTE);
  let arch = archs[sa.i(archs.length)];
  const A0 = ARCHETYPES[arch];
  if (lot.w - 2 < A0.minW || lot.d - 3 < A0.minD) {
    // sığmıyorsa en küçük alçak arketip
    arch = rinfo.district === 'tepe' ? 'ev' : 'dukkan_sirasi';
  }
  lot.archetype = arch;
  lot.built = true;
  lot.district = rinfo.district; // parkur bloğunun bölgesi (sınırdaki parsel başka bölgeye düşmesin: kat aralığı/palet tutarlı)
  lot.floors = rinfo.floors;
  lot.setback = { f: order === 0 ? 3 : 0, s: 0, b: 0 };
  lot.roof = { route: rinfo.route, order, lift: Math.floor(shf(seed, lot.id, TAG.LOT_ROUTE + 5) * 2), start: order === 0, total };
}

/* ------------------------------------------------------------------------------------------------
 * Taban yerleşim
 * ---------------------------------------------------------------------------------------------- */
function hillLayout(plan, bi, bj) {
  const R = blockRect(bi, bj);
  const lot = makeLot(plan, bi, bj, 0, R, 's', { archetype: 'tepe_terasi', forceSet: { f: 0, s: 0, b: 0 } });
  lot.hill = true;
  lot.corner = true;
  lot.floors = 0;
  return [lot];
}

function canalBandLots(plan, bi, bj, kind, P, st, isRoute) {
  const R = blockRect(bi, bj);
  const north = kind === BK.CANAL_N;
  const L = R.x1 - R.x0;
  const dmax = isRoute ? 40 : Math.max(P.depthMax, 56); // rıhtıma kadar derin parseller (kıyı bandı boş avlu kalmasın)
  const part = partitionBand(st, L, P.sideMin, P.sideMax, isRoute ? GAP_ROUTE : GAP_POOL, 0, 0);
  const lots = [];
  const setLots = [];
  for (let q = 0; q < part.lots.length; q++) {
    const xa = R.x0 + part.lots[q].o;
    const xb = xa + part.lots[q].w;
    // kıyı sınırı: örneklemeli en dar/en geniş
    let lim = north ? Infinity : -Infinity;
    for (let x = xa; x <= xb; x += 2) {
      const zc = canalCenterZ(x + 0.5);
      if (north) lim = Math.min(lim, zc - CANAL.half - CANAL.quay - 1);
      else lim = Math.max(lim, zc + CANAL.half + CANAL.quay + 1);
    }
    lim = north ? Math.floor(lim) : Math.ceil(lim);
    const rect = north
      ? { x0: xa, x1: xb, z0: R.z0, z1: Math.min(R.z0 + dmax, lim) }
      : { x0: xa, x1: xb, z0: Math.max(R.z1 - dmax, lim), z1: R.z1 };
    if (rect.z1 - rect.z0 < MIN_DEPTH) continue;
    setLots.push({ rect, front: north ? 'n' : 's' });
  }
  for (let q = 0; q < setLots.length; q++) lots.push(setLots[q]);
  return lots;
}

export function baseLayout(plan, bi, bj) {
  const cache = plan._base;
  const key = blockKey(bi, bj);
  const hit = cache.get(key);
  if (hit) return hit;
  const blocks = plan.roads.blocks;
  const kind = blocks.kindAt(bi, bj);
  const out = { bi, bj, kind, rect: blockRect(bi, bj), district: null, lots: [], axis: null, route: null };
  if (kind === BK.HILL) {
    out.district = blockDistrict(plan, bi, bj);
    out.lots = hillLayout(plan, bi, bj);
    cache.set(key, out);
    return out;
  }
  if (kind === BK.CENTRAL) {
    const ck = CENTRAL_KIOSK[bi + ',' + bj];
    if (ck) {
      out.district = 'merkez';
      const lot = makeLot(plan, bi, bj, 0, ck.rect, ck.front, {
        archetype: 'istasyon_girisi', station: { id: 0, i: 0, j: 0, cx: ck.rect.x0 > 0 ? 'x0' : 'x1', cz: ck.rect.z0 > 0 ? 'z0' : 'z1' },
        forceSet: { f: 1, s: 0, b: 0 }, kiosk: true,
      });
      lot.corner = false;
      lot.door = computeDoor(plan, lot);
      out.lots = [lot];
    }
    cache.set(key, out);
    return out;
  }
  if (kind !== BK.LOTS && kind !== BK.CANAL_N && kind !== BK.CANAL_S) {
    cache.set(key, out);
    return out;
  }
  const seed = plan.seed;
  const dk = blockDistrict(plan, bi, bj);
  const P = DISTRICTS[dk];
  out.district = dk;
  const rb = routeOfBlock(plan, bi, bj);
  const rinfo = rb ? routeInfo(plan, rb) : null;
  out.route = rinfo;
  const R = out.rect;
  const st = stream(seed, key, TAG.LOT_SPLIT);
  const stc = stationCornerOf(bi, bj);
  const specs = []; // {rect, front, extra?}
  if (kind === BK.CANAL_N || kind === BK.CANAL_S) {
    const cl = canalBandLots(plan, bi, bj, kind, P, st, !!rinfo);
    for (let q = 0; q < cl.length; q++) specs.push(cl[q]);
  } else {
    const mega = !rinfo && !stc && shf(seed, key, TAG.LOT_MEGA) < P.mega;
    const Wx = R.x1 - R.x0;
    const Wz = R.z1 - R.z0;
    if (mega) {
      const fronts = ['n', 's', 'w', 'e'];
      specs.push({ rect: { x0: R.x0, x1: R.x1, z0: R.z0, z1: R.z1 }, front: fronts[Math.floor(shf(seed, key, TAG.LOT_FRONT) * 4)] });
    } else {
      const axis = shf(seed, key, TAG.LOT_AXIS) < 0.5 ? 'x' : 'z';
      out.axis = axis;
      const L = axis === 'x' ? Wx : Wz; // bant uzunluğu
      const W = axis === 'x' ? Wz : Wx; // bantlar arası toplam
      const dmax = rinfo ? 40 : P.depthMax;
      const gapPool = rinfo ? GAP_ROUTE : GAP_POOL;
      let gm = rinfo ? 2 + st.i(2) : [0, 2, 3, 4][st.i(4)];
      let d1;
      let d2;
      if (W - gm <= 2 * dmax) {
        d1 = Math.floor((W - gm) / 2) + st.r(-3, 3);
        d1 = Math.max(MIN_DEPTH, Math.min(d1, W - gm - MIN_DEPTH));
        d2 = W - gm - d1;
      } else {
        d1 = dmax;
        d2 = dmax;
        gm = W - 2 * dmax;
      }
      for (let band = 0; band < 2; band++) {
        const d = band === 0 ? d1 : d2;
        const cornerHere = stc && ((axis === 'x' && stc.cz === (band === 0 ? 'z0' : 'z1')) || (axis === 'z' && stc.cx === (band === 0 ? 'x0' : 'x1')));
        let resS = 0;
        let resE = 0;
        let kioskAtStart = false;
        if (cornerHere) {
          kioskAtStart = axis === 'x' ? stc.cx === 'x0' : stc.cz === 'z0';
          if (kioskAtStart) resS = KIOSK;
          else resE = KIOSK;
        }
        const part = partitionBand(st, L, P.sideMin, rinfo ? Math.min(P.sideMax, 22) : P.sideMax, gapPool, resS, resE, !!rinfo);
        const place = (o, w, extra) => {
          let rect;
          let front;
          if (axis === 'x') {
            const x0 = R.x0 + o;
            rect = band === 0 ? { x0, x1: x0 + w, z0: R.z0, z1: R.z0 + (extra && extra.kiosk ? Math.min(KIOSK, d) : d) }
              : { x0, x1: x0 + w, z0: R.z1 - (extra && extra.kiosk ? Math.min(KIOSK, d) : d), z1: R.z1 };
            front = band === 0 ? 'n' : 's';
          } else {
            const z0 = R.z0 + o;
            rect = band === 0 ? { x0: R.x0, x1: R.x0 + (extra && extra.kiosk ? Math.min(KIOSK, d) : d), z0, z1: z0 + w }
              : { x0: R.x1 - (extra && extra.kiosk ? Math.min(KIOSK, d) : d), x1: R.x1, z0, z1: z0 + w };
            front = band === 0 ? 'w' : 'e';
          }
          specs.push({ rect, front, extra });
        };
        if (cornerHere) {
          const extra = { archetype: 'istasyon_girisi', station: { id: stc.id, i: stc.i, j: stc.j, cx: stc.cx, cz: stc.cz }, forceSet: { f: 1, s: 0, b: 0 }, kiosk: true };
          place(kioskAtStart ? 0 : L - KIOSK, KIOSK, extra);
        }
        for (let q = 0; q < part.lots.length; q++) place(part.lots[q].o, part.lots[q].w, null);
      }
    }
  }
  // parsel nesneleri
  let k = 0;
  const lots = [];
  for (let q = 0; q < specs.length && k < 32; q++) {
    const sp = specs[q];
    const r = sp.rect;
    if (r.x1 - r.x0 < 6 || r.z1 - r.z0 < 6) continue;
    const lot = makeLot(plan, bi, bj, k, r, sp.front, sp.extra && sp.extra.kiosk ? sp.extra : null);
    lot.corner = (r.x0 === R.x0 || r.x1 === R.x1) && (r.z0 === R.z0 || r.z1 === R.z1);
    lots.push(lot);
    k++;
  }
  // çatı parkuru: parselleri sıraya diz (kuzey/batı bant → karşı bant ters sırayla), alçak arketip/aynı kat
  if (rinfo) {
    const ordered = routeOrder(lots, out.axis || 'x');
    // başlangıç parselinin ön yüzüne dış merdiven + kapı sığsın: parkur kat sayısı bu genişliğe göre sınırlanır (tüm parsel zinciri aynı kat)
    let ri = rinfo;
    if (ordered.length) {
      const st0 = ordered[0];
      const len0 = st0.front === 'n' || st0.front === 's' ? st0.w : st0.d;
      const cap = floorsFitStair(len0, Math.max(2, Math.ceil(DISTRICTS[rinfo.district].hMin / 4)));
      if (cap < rinfo.floors) ri = Object.assign({}, rinfo, { floors: cap });
    }
    out.route = ri;
    for (let q = 0; q < ordered.length; q++) applyRoute(plan, ordered[q], ri, q, ordered.length);
  }
  for (let q = 0; q < lots.length; q++) lots[q].door = computeDoor(plan, lots[q]);
  out.lots = lots;
  cache.set(key, out);
  return out;
}

/** Parkur sırası: ilk bant kendi yönünde, ikinci bant ters yönde (U dönüşü), yalnız kısa istasyon parselsiz. */
function routeOrder(lots, axis) {
  const side = (l) => (axis === 'x' ? (l.front === 'n' ? 0 : 1) : (l.front === 'w' ? 0 : 1));
  const pos = (l) => (axis === 'x' ? l.x0 : l.z0);
  const a = lots.filter((l) => side(l) === 0 && !l.station).sort((p, q) => pos(p) - pos(q));
  const b = lots.filter((l) => side(l) === 1 && !l.station).sort((p, q) => pos(q) - pos(p));
  const chain = a.concat(b);
  // başlangıç = dış merdiven için daha geniş ön yüzlü uç
  const flen = (l) => (l.front === 'n' || l.front === 's' ? l.w : l.d);
  if (chain.length > 1 && flen(chain[chain.length - 1]) > flen(chain[0])) chain.reverse();
  return chain;
}

/* ------------------------------------------------------------------------------------------------
 * Sahipler (16)
 * ---------------------------------------------------------------------------------------------- */
export function ownerMap(plan) {
  if (plan._owners) return plan._owners;
  const seed = plan.seed;
  const used = new Set();
  const map = new Map();
  const blocks = plan.roads.blocks;
  const eligible = [];
  for (let bj = -9; bj <= 8; bj++) {
    for (let bi = -9; bi <= 8; bi++) {
      if (blocks.kindAt(bi, bj) !== BK.LOTS) continue;
      const key = blockKey(bi, bj);
      if (routeOfBlock(plan, bi, bj) || stationCornerOf(bi, bj)) continue;
      eligible.push({ bi, bj, key, dk: blockDistrict(plan, bi, bj) });
    }
  }
  for (let o = 0; o < OWNERS.length; o++) {
    const ow = OWNERS[o];
    const homes = OWNER_HOME[ow.interior] || DISTRICT_KEYS;
    const order = (hm) => eligible.filter((e) => hm.indexOf(e.dk) >= 0)
      .map((e) => ({ e, h: sh(seed, e.key, TAG.O_BLOCK + o * 131) }))
      .sort((p, q) => p.h - q.h || p.e.key - q.e.key);
    let done = false;
    const tryList = (list) => {
      for (let q = 0; q < list.length && !done; q++) {
        const e = list[q].e;
        const lay = baseLayout(plan, e.bi, e.bj);
        const idx = lay.lots.map((l, n) => ({ n, h: sh(seed, l.id, TAG.O_LOT + o) })).sort((p, r) => p.h - r.h);
        for (let z = 0; z < idx.length && !done; z++) {
          const lot = lay.lots[idx[z].n];
          if (used.has(lot.id) || lot.station || lot.roof || lot.hill) continue;
          const arch = ownerArchetype(plan, lot, ow.interior);
          if (!arch) continue;
          used.add(lot.id);
          map.set(ow.id, { lotId: lot.id, bi: e.bi, bj: e.bj, k: lot.k, archetype: arch, interior: ow.interior });
          done = true;
        }
      }
    };
    tryList(order(homes));
    if (!done) tryList(order(DISTRICT_KEYS));
  }
  plan._owners = map;
  return map;
}

/**
 * İç mekâna ayrılabilecek temiz alan (duvarlar hariç): ayak izinin kapı çizgisi boyunca (w) ve içeri (d) ölçüsü − 2. Çok parçalı arketiplerde
 * (konteyner yığını, ikiz kule) en geniş parça. `lot` yalnız ölçü içindir; arketip `archKey` sorgulanan arketiptir.
 */
function interiorSpace(lot, archKey) {
  const s = lot.setback;
  const along = lot.front === 'n' || lot.front === 's';
  let w = (along ? lot.w : lot.d) - 2 * s.s;
  const d = (along ? lot.d : lot.w) - s.f - s.b;
  if (archKey === 'konteyner_yigini') w = Math.max.apply(null, containerCuts(w).map((c) => c[1] - c[0]));
  else if (archKey === 'kule_ikiz') w = Math.floor((w - 10) / 2);
  return { w: w - 2, d: d - 2 };
}

/** Sahibin iç mekânını barındırabilen arketip (parsel bölgesinin ağırlıkları öncelikli) | null. */
function ownerArchetype(plan, lot, kind) {
  const wt = ARCH_WEIGHTS[lot.district] || {};
  const keys = Object.keys(wt).filter((a) => ARCHETYPES[a].interiors.indexOf(kind) >= 0 && ARCHETYPES[a].building);
  keys.sort((p, q) => wt[q] - wt[p]);
  for (let n = 0; n < keys.length; n++) {
    const A0 = ARCHETYPES[keys[n]];
    const dim = interiorSpace(lot, keys[n]);
    if (dim.w >= A0.minW && dim.d >= A0.minD && interiorFits(kind, dim.w, dim.d)) return keys[n];
  }
  // bölge tablosunda olmayan ama barındıran arketip
  const all = Object.keys(ARCHETYPES).filter((a) => ARCHETYPES[a].building && !ARCHETYPES[a].special && ARCHETYPES[a].interiors.indexOf(kind) >= 0);
  for (let n = 0; n < all.length; n++) {
    const A0 = ARCHETYPES[all[n]];
    const dim = interiorSpace(lot, all[n]);
    if (dim.w >= A0.minW && dim.d >= A0.minD && interiorFits(kind, dim.w, dim.d)) return all[n];
  }
  return null;
}

export function layoutBlock(plan, bi, bj) {
  const cache = plan._layout;
  const key = blockKey(bi, bj);
  const hit = cache.get(key);
  if (hit) return hit;
  const base = baseLayout(plan, bi, bj);
  let owned = null;
  if (base.lots.length) {
    const om = ownerMap(plan);
    om.forEach((v, ownerId) => {
      if (v.bi === bi && v.bj === bj) (owned || (owned = [])).push({ ownerId, v });
    });
  }
  if (!owned) {
    cache.set(key, base);
    return base;
  }
  const lots = base.lots.slice();
  for (let q = 0; q < owned.length; q++) {
    const { ownerId, v } = owned[q];
    const src = lots[v.k];
    const lot = Object.assign({}, src);
    lot.archetype = v.archetype;
    lot.built = true;
    lot.owner = ownerId;
    lot.floors = floorsFor(lot.district, lot.archetype, shf(plan.seed, lot.id, TAG.LOT_H), Math.sqrt(((lot.x0 + lot.x1) / 2) ** 2 + ((lot.z0 + lot.z1) / 2) ** 2));
    lot.door = computeDoor(plan, lot);
    lots[v.k] = lot;
  }
  const out = Object.assign({}, base, { lots });
  cache.set(key, out);
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Ayak izi ve kapı
 * ---------------------------------------------------------------------------------------------- */
export function footprintOf(lot) {
  const A0 = ARCHETYPES[lot.archetype];
  if (!A0 || !A0.building && !A0.special) return null;
  const s = lot.setback;
  let x0 = lot.x0;
  let x1 = lot.x1;
  let z0 = lot.z0;
  let z1 = lot.z1;
  if (lot.hill) return { x0, z0, x1, z1 };
  if (lot.front === 'n') {
    z0 += s.f;
    z1 -= s.b;
    x0 += s.s;
    x1 -= s.s;
  } else if (lot.front === 's') {
    z1 -= s.f;
    z0 += s.b;
    x0 += s.s;
    x1 -= s.s;
  } else if (lot.front === 'w') {
    x0 += s.f;
    x1 -= s.b;
    z0 += s.s;
    z1 -= s.s;
  } else {
    x1 -= s.f;
    x0 += s.b;
    z0 += s.s;
    z1 -= s.s;
  }
  return { x0, z0, x1, z1 };
}

const FACE_VEC = Object.freeze({ n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] });

/** Konteyner yığını parça sınırları [[a,b],…] (ön yüz boyunca uzunluk L → parçalar ≥12, ≤4 adet; tamamen belirlenimci, tohumsuz). */
export function containerCuts(L) {
  const n = Math.max(1, Math.min(4, Math.floor(L / 12)));
  const out = [];
  for (let q = 0; q < n; q++) out.push([Math.round((L * q) / n), Math.round((L * (q + 1)) / n)]);
  return out;
}

function computeDoor(plan, lot) {
  const fp = footprintOf(lot);
  const A0 = ARCHETYPES[lot.archetype];
  if (!fp || !A0.building || lot.hill) return null;
  const face = lot.front;
  const alongX = face === 'n' || face === 's';
  const len = alongX ? fp.x1 - fp.x0 : fp.z1 - fp.z0;
  if (len < 7) return null;
  const st = stream(plan.seed, lot.id, TAG.B_DOOR);
  let u;
  if (lot.archetype === 'kule_ikiz') {
    // ikiz kule: yüz, bölünme ekseni boyunca ise kapı 1. kulenin ortasında (boşluğa düşmesin), değilse ortada
    const splitX = fp.x1 - fp.x0 >= fp.z1 - fp.z0;
    u = alongX === splitX ? Math.floor(len / 4) : Math.floor(len / 2);
  } else if (lot.archetype === 'konteyner_yigini') {
    const cuts = containerCuts(len);
    let best = cuts[0];
    for (let q = 1; q < cuts.length; q++) if (cuts[q][1] - cuts[q][0] > best[1] - best[0]) best = cuts[q];
    u = best[0] + 2 + Math.floor(st.f() * Math.max(1, best[1] - best[0] - 5));
    if (lot.roof && lot.roof.start) u = Math.min(len - 4, best[1] - 3);
  } else if (A0.tower || lot.station) u = Math.floor(len / 2);
  else {
    const lo = 3;
    const hi = len - 4;
    u = lo + Math.floor(st.f() * (hi - lo + 1));
    if (lot.roof && lot.roof.start) u = hi; // kapı merdivenin karşı ucunda (extStairFor: kapı > len/2 → merdiven başta)
  }
  const base = alongX ? fp.x0 + u : fp.z0 + u;
  const fv = FACE_VEC[face];
  let wallX;
  let wallZ;
  if (face === 'n') {
    wallX = base;
    wallZ = fp.z0;
  } else if (face === 's') {
    wallX = base;
    wallZ = fp.z1 - 1;
  } else if (face === 'w') {
    wallX = fp.x0;
    wallZ = base;
  } else {
    wallX = fp.x1 - 1;
    wallZ = base;
  }
  return {
    x: wallX, y: 64, z: wallZ, axis: alongX ? 'x' : 'z', face, w: 3, h: 3, u,
    front: { x: wallX + fv[0], z: wallZ + fv[1] },
    inside: { x: wallX - fv[0], z: wallZ - fv[1] },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Boş duvar (grafiti): ≥6×4 pencere/kapısız ön yüz bölgesi. Parsele göre belirlenimci; 90 grafiti noktası bunlardan seçilir.
 * ---------------------------------------------------------------------------------------------- */
const BLANK_DISTRICTS = Object.freeze({ gece_pazari: 1, konteyner: 1, tepe: 1 });
const BLANK_ARCHS = Object.freeze({
  konteyner_yigini: 1, depo: 1, apartman: 1, ev: 1, garaj: 1, klinik_binasi: 1, ofis_blok: 1,
});
const FACE_IDX = Object.freeze({ n: 0, e: 1, s: 2, w: 3 });

/** {face,faceIdx,u0,u1,w:6,h:4} | null — u: ayak izi başından ön yüz boyunca hücre; zemin katta 4 yüksek. */
export function blankOf(plan, lot) {
  if (!BLANK_DISTRICTS[lot.district] || !lot.built || lot.floors < 1 || lot.hill || lot.station || !BLANK_ARCHS[lot.archetype]) return null;
  const fp = footprintOf(lot);
  const door = lot.door;
  if (!fp || !door) return null;
  if (shf(plan.seed, lot.id, TAG.B_GRAF) >= 0.4) return null;
  const alongX = lot.front === 'n' || lot.front === 's';
  const len = alongX ? fp.x1 - fp.x0 : fp.z1 - fp.z0;
  if (len < 14) return null;
  const leftLen = door.u - 3 - 1;
  const rightLen = len - 1 - (door.u + 3);
  const useLeft = leftLen >= rightLen;
  const room = useLeft ? leftLen : rightLen;
  if (room < 6) return null;
  const start = useLeft ? 1 : door.u + 3;
  const u0 = start + (sh(plan.seed, lot.id, TAG.B_GRAF + 1) % (room - 6 + 1));
  return { face: lot.front, faceIdx: FACE_IDX[lot.front], u0, u1: u0 + 6, w: 6, h: 4 };
}

/* ------------------------------------------------------------------------------------------------
 * Sorgular
 * ---------------------------------------------------------------------------------------------- */
export function lotAt(plan, x, z) {
  const bi = Math.floor(x / GRID);
  const bj = Math.floor(z / GRID);
  if (bi < -9 || bi > 8 || bj < -9 || bj > 8) return null;
  const lay = layoutBlock(plan, bi, bj);
  const lots = lay.lots;
  for (let q = 0; q < lots.length; q++) {
    const l = lots[q];
    if (x >= l.x0 && x < l.x1 && z >= l.z0 && z < l.z1) return l;
  }
  return null;
}

export function lotById(plan, id) {
  const p = lotIdParts(id);
  if (p.bi < -9 || p.bi > 8 || p.bj < -9 || p.bj > 8) return null;
  const lots = layoutBlock(plan, p.bi, p.bj).lots;
  for (let q = 0; q < lots.length; q++) if (lots[q].id === id) return lots[q];
  return null;
}

export function allLots(plan) {
  if (plan._allLots) return plan._allLots;
  const out = [];
  for (let bj = -9; bj <= 8; bj++) {
    for (let bi = -9; bi <= 8; bi++) {
      const lots = layoutBlock(plan, bi, bj).lots;
      for (let q = 0; q < lots.length; q++) out.push(lots[q]);
    }
  }
  plan._allLots = out;
  return out;
}

export function newLotCaches() {
  return { base: new Lru(420), layout: new Lru(420) };
}

