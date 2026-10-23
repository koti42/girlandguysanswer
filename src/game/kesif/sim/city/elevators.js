/*
 * KEŞİF sim/city — KULE ASANSÖRLERİ (sözleşme §1.11, §8, §21 risk #10). SAF: three/DOM/Math.random/Date.now yok, belirlenimci, worker-güvenli, es2020.
 *
 * Bir kule çekirdeği (buildingPlan `core`: 4×4 halka, 2×2 boşluk = KUYU) başına BİR asansör. Durak = zemin fuaye (y64) + her gökyüzü lobisi (kat 14, 29, 44…;
 * cityBuildings `lobbyOf` kuralı). Güç gerektirmez. Kabin = 2×2 platform (dinamik prop; ColliderIndex "platform riding"), hız 8 b/sn (yumuşak kalkış/duruş).
 * Durak kapısı: çekirdek halkasında 2 geniş × 3 yüksek kayar kapı (239 kapalı / 240 açık); kabin durakta DEĞİLKEN kapı KAPALIDIR (kuyuya düşme yok), kabin
 * durakta dururken AÇIKTIR. Kabin ancak kapı önü boşken kapanır (güvenli kapı mantığı). Düğme prop'u (`asansor_dugmesi`) kapının yanında dışarıdadır;
 * kabinde de bir düğme dinamik prop olarak kabinle birlikte gider. HAPİS YOK: kabin hep bir durağa varır (kat seçimi ya da en yakın durak), oyuncu kuyuda
 * ve kabinin dışındaysa en yakın durağın önüne yerleştirilir (rescue), kayıt: kabin konumu.
 *
 *   ELEVATOR_SPEED · ELEVATOR_T (kabin prop türü) · CABIN_DEF (PropWorld.getDef sarmalayıcısı için) · cabinPropId(elId) · buttonPropId(elId)
 *   planElevators(bp, opts?) → Elevator[]     opts.interior: planInterior çıktısı (kapı önü boşluğu denetimi); bp.core yoksa []
 *   elevatorsOfLot(seed, lot) → Elevator[]    (planBuilding + planInterior + planElevators; önbellekli)
 *   allElevators(seed) → Elevator[]           şehirdeki tüm kuleler (tembel, önbellekli)
 *   elevatorPropSpecs(seed, blockPlan, rect?) → PropSpec[]   durak düğmeleri (propPlan toplar)
 *   doorCells(el, stopIdx) → [[x,y,z]…]       elevatorAt(seed, x, y, z) → {el, stop}|null   nearestStop(el, y)
 *   createElevatorSim(el, saved?) → sim       sim.call(i) · sim.abort() · sim.step(dt, env) · sim.serialize() · sim.view() · sim.y
 *   restoreElevatorState(el, raw) → sim durumu (güvenli)
 * Elevator = {id, lotId, part, front, bore:{x0,z0,x1,z1}, cx, cz, face, dir:[dx,dz], stops:[Stop], yMin, yMax}
 * Stop = {i, floor, y (ayakta durma yüksekliği), kind:'zemin'|'sky', name, cells:[[x,z],[x,z]], out:[ox,oz] (kapı önü hücresi), button:{x,y,z,yaw}}
 */
import { hash32 } from '../rng.js';
import { ARCHETYPES } from './archetypes.js';
import { allLots } from './cityLots.js';
import { getCityPlan, planBuilding } from './cityPlan.js';
import { Lru } from './cityPlanKit.js';
import { planInterior } from './interior/index.js';

export const ELEVATOR_SPEED = 8;
export const ELEVATOR_ACCEL = 12;
/** Duruş profili ivmesi (≤ ELEVATOR_ACCEL: denetleyici profili izleyebilir, aşım/ani duruş yok). */
export const ELEVATOR_BRAKE = 10;
export const ELEVATOR_T = 60001;
export const DOOR_HEIGHT = 3;
export const PLATFORM_THICK = 0.25;
/** Hedefe son ~0,3 blokta hız ∝ kalan mesafe (üstel yaklaşma): duruşta ani hız farkı yok (geçiş ivmesi 2·BRAKE'den küçük). */
const SETTLE_RATE = 8;
const FLOOR_H = 4;
const PLAN_CHUNK = 16;
const CLEAR_OUT = 2; // kapı önünde boş olması gereken derinlik (hücre)

/* Kabin prop tanımı: PropWorld.addDynamic için (propDefs.js'te yoktur; sistem pw.getDef'i sarmalar). Çarpışma = 2×2 platform (yerel y 0..0.25). */
export const CABIN_DEF = Object.freeze({
  t: ELEVATOR_T,
  key: 'asansor_kabini',
  name: 'Asansör Kabini',
  model: Object.freeze({ meshKey: 'asansor_kabini' }),
  size: Object.freeze([2, 0.25, 2]),
  colliders: Object.freeze([Object.freeze([-1, 0, -1, 1, PLATFORM_THICK, 1])]),
  trigger: undefined,
  interact: null,
  states: 1,
  emissive: 0.5,
  light: undefined,
  holo: false,
  sign: undefined,
  tags: Object.freeze(['asansor', 'dinamik']),
  dimBound: undefined,
  dyn: true,
});

const FACES = Object.freeze(['n', 'e', 's', 'w']);
const DIR = Object.freeze({
  n: Object.freeze([0, -1]), s: Object.freeze([0, 1]), w: Object.freeze([-1, 0]), e: Object.freeze([1, 0]),
});
/** Duvar propu ön yüzünün yönü (propPlan: 0:+Z 1:+X 2:−Z 3:−X) — dışa bakan yüz. */
const OUT_YAW = Object.freeze({ n: 2, s: 0, w: 3, e: 1 });
const IN_YAW = Object.freeze({ n: 0, s: 2, w: 1, e: 3 });

export function cabinPropId(elId) {
  return hash32(hashStr(elId) ^ 0x4341424e) >>> 0;
}

export function buttonPropId(elId) {
  return hash32(hashStr(elId) ^ 0x42544e31) >>> 0;
}

function hashStr(s) {
  let h = 0x811c9dc5;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return hash32(h | 0) >>> 0;
}

/* ------------------------------------------------------------------------------------------------
 * Plan
 * ---------------------------------------------------------------------------------------------- */
function stopName(kind, floor, n) {
  if (kind === 'zemin') return 'Zemin kat (giriş holü)';
  return 'Gökyüzü lobisi' + (n > 1 ? ' ' + n : '') + ' (' + (floor + 1) + '. kat)';
}

/** Çekirdeğin çizildiği (kademeye sığan) en üst kat sınırı (dışlayıcı) ve bu katlardaki en dar duvar payı (face → hücre). */
function coreReach(bp, c) {
  let reach = 0;
  const clear = { n: 1e9, s: 1e9, w: 1e9, e: 1e9 };
  const tiers = bp.tiers.filter((t) => t.part === c.part).sort((a, b) => a.f0 - b.f0);
  for (let k = 0; k < tiers.length; k++) {
    const t = tiers[k];
    if (c.x0 < t.x0 + 1 || c.x1 > t.x0 + t.w - 1 || c.z0 < t.z0 + 1 || c.z1 > t.z0 + t.d - 1) break;
    if (t.f0 > reach) break; // kesinti: çekirdek yalnız bitişik kademelerde sürer
    reach = Math.max(reach, t.f1);
    clear.n = Math.min(clear.n, c.z0 - (t.z0 + 1));
    clear.s = Math.min(clear.s, t.z0 + t.d - 1 - c.z1);
    clear.w = Math.min(clear.w, c.x0 - (t.x0 + 1));
    clear.e = Math.min(clear.e, t.x0 + t.w - 1 - c.x1);
  }
  return { reach, clear };
}

function faceCells(c, face) {
  if (face === 'n') return { cells: [[c.x0 + 1, c.z0], [c.x0 + 2, c.z0]], out: [c.x0 + 1, c.z0 - 1] };
  if (face === 's') return { cells: [[c.x0 + 1, c.z0 + 3], [c.x0 + 2, c.z0 + 3]], out: [c.x0 + 1, c.z0 + 4] };
  if (face === 'w') return { cells: [[c.x0, c.z0 + 1], [c.x0, c.z0 + 2]], out: [c.x0 - 1, c.z0 + 1] };
  return { cells: [[c.x0 + 3, c.z0 + 1], [c.x0 + 3, c.z0 + 2]], out: [c.x0 + 4, c.z0 + 1] };
}

/** Kapı önü (2 hücre derin × 2 geniş) hacmi ve bu hacmin zemin kat iç mekân dikdörtgeni / prop çarpışmalarıyla çakışması. */
function outsideBox(c, face) {
  const f = faceCells(c, face);
  const d = DIR[face];
  const xs = f.cells.map((q) => q[0]);
  const zs = f.cells.map((q) => q[1]);
  let x0 = Math.min.apply(null, xs);
  let x1 = Math.max.apply(null, xs) + 1;
  let z0 = Math.min.apply(null, zs);
  let z1 = Math.max.apply(null, zs) + 1;
  if (d[0] > 0) { x0 = x1; x1 = x0 + CLEAR_OUT; }
  else if (d[0] < 0) { x1 = x0; x0 = x1 - CLEAR_OUT; }
  else if (d[1] > 0) { z0 = z1; z1 = z0 + CLEAR_OUT; }
  else { z1 = z0; z0 = z1 - CLEAR_OUT; }
  return { x0, z0, x1, z1 };
}

function overlapsRect(b, r) {
  return b.x0 < r.x1 && b.x1 > r.x0 && b.z0 < r.z1 && b.z1 > r.z0;
}

function blockedByInterior(box, bp, interior) {
  const r0 = bp.interior;
  // iç mekân hacminin duvar halkası dikdörtgenin 1 hücre dışına da yazılır
  const r = r0 ? {
    x0: r0.x0 - 1, z0: r0.z0 - 1, x1: r0.x1 + 1, z1: r0.z1 + 1,
  } : null;
  if (r && overlapsRect(box, r)) {
    // iç mekân dikdörtgeni: yalnız odalarından biri kapı önünü tamamen içeriyorsa VE hiçbir prop çarpışması kapı önüne girmiyorsa serbest
    if (!interior || !Array.isArray(interior.rooms)) return true;
    const inRoom = interior.rooms.some((rm) => box.x0 >= rm.x0 && box.x1 <= rm.x1 && box.z0 >= rm.z0 && box.z1 <= rm.z1 && rm.y0 <= 65);
    if (!inRoom) return true;
    const props = Array.isArray(interior.props) ? interior.props : [];
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z) || (p.y !== undefined && p.y > 66)) continue;
      // kaba: prop çapası kapı önü + 1 hücre payı içinde ise engel say (çarpışması olmayanlar da dahil, güvenli taraf)
      if (p.x > box.x0 - 0.9 && p.x < box.x1 + 0.9 && p.z > box.z0 - 0.9 && p.z < box.z1 + 0.9 && !(p.kind === 'asansor_dugmesi')) return true;
    }
  }
  return false;
}

export function planElevators(bp, opts) {
  const o = opts || {};
  if (!bp || !Array.isArray(bp.core) || bp.core.length === 0 || !Array.isArray(bp.tiers)) return [];
  const A0 = ARCHETYPES[bp.archetype];
  if (!A0 || !A0.tower) return [];
  const out = [];
  for (let q = 0; q < bp.core.length; q++) {
    const c = bp.core[q];
    const { reach, clear } = coreReach(bp, c);
    if (reach <= 0) continue;
    const top = bp.tiers.filter((t) => t.part === c.part).reduce((m, t) => Math.max(m, t.f1), 0);
    if (top < 8) continue;
    // kat listesi: zemin + gökyüzü lobileri (cityBuildings.lobbyOf ile aynı kural), çekirdeğin çizildiği katlarda
    const floors = [{ floor: 0, kind: 'zemin' }];
    for (let lf = 14; lf < top - 1; lf += 15) if (lf + 1 <= reach) floors.push({ floor: lf, kind: 'sky' });
    if (floors.length < 2) continue;
    // kapı yüzü: bina cephesine bakan tercih; yeterli boşluğu (≥ CLEAR_OUT) ve iç mekân çakışması olmayan yüz
    const order = FACES.slice().sort((a, b) => (a === bp.front ? -1 : 0) - (b === bp.front ? -1 : 0) || (clear[b] - clear[a]));
    let face = null;
    for (let k = 0; k < order.length; k++) {
      const f = order[k];
      if (clear[f] < CLEAR_OUT) continue;
      if (blockedByInterior(outsideBox(c, f), bp, o.interior)) continue;
      face = f;
      break;
    }
    if (face === null) continue;
    const fc = faceCells(c, face);
    const id = 'e' + (((bp.id | 0) * 8 + (c.part | 0)) >>> 0).toString(36);
    const stops = floors.map((fl, i) => {
      const y = 64 + FLOOR_H * fl.floor;
      const nSky = floors.slice(0, i + 1).filter((x) => x.kind === 'sky').length;
      return Object.freeze({
        i,
        floor: fl.floor,
        y,
        kind: fl.kind,
        name: stopName(fl.kind, fl.floor, floors.length - 1 > 1 ? nSky : 1),
        cells: Object.freeze(fc.cells.map((p) => Object.freeze(p.slice()))),
        out: Object.freeze(fc.out.slice()),
        button: buttonSpot(c, face, y),
      });
    });
    out.push(Object.freeze({
      id,
      lotId: bp.id,
      part: c.part,
      front: bp.front,
      core: Object.freeze({ x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1 }),
      bore: Object.freeze({
        x0: c.x0 + 1, z0: c.z0 + 1, x1: c.x0 + 3, z1: c.z0 + 3,
      }),
      cx: c.x0 + 2,
      cz: c.z0 + 2,
      face,
      dir: DIR[face],
      stops: Object.freeze(stops),
      yMin: stops[0].y,
      yMax: stops[stops.length - 1].y,
    }));
  }
  return out;
}

function buttonSpot(c, face, y) {
  const d = 0.0625;
  if (face === 'n') return Object.freeze({ x: c.x0 + 3.5, y: y + 1, z: c.z0 - d, yaw: OUT_YAW.n });
  if (face === 's') return Object.freeze({ x: c.x0 + 3.5, y: y + 1, z: c.z1 + d, yaw: OUT_YAW.s });
  if (face === 'w') return Object.freeze({ x: c.x0 - d, y: y + 1, z: c.z0 + 3.5, yaw: OUT_YAW.w });
  return Object.freeze({ x: c.x1 + d, y: y + 1, z: c.z0 + 3.5, yaw: OUT_YAW.e });
}

/** Kabin içi düğme: kuyunun kapının TAM karşısındaki iç duvarında; y = kabin zemini + 1. */
export function cabinButtonSpot(el, platformTop) {
  const c = el.core;
  const d = 0.0625;
  const y = platformTop + 1;
  if (el.face === 'n') return { x: c.x0 + 2, y, z: c.z0 + 3 - d, yaw: IN_YAW.n };
  if (el.face === 's') return { x: c.x0 + 2, y, z: c.z0 + 1 + d, yaw: IN_YAW.s };
  if (el.face === 'w') return { x: c.x0 + 3 - d, y, z: c.z0 + 2, yaw: IN_YAW.w };
  return { x: c.x0 + 1 + d, y, z: c.z0 + 2, yaw: IN_YAW.e };
}

/* ------------------------------------------------------------------------------------------------
 * Şehir çapı sorgular
 * ---------------------------------------------------------------------------------------------- */
const LOT_CACHE = new Lru(256);
const CITY_CACHE = new Lru(4);

let planInteriorFn = planInterior;
/** Test geçersiz kılması: bindInterior(fn) iç mekân planlayıcısını değiştirir (null: yalnız dikdörtgen denetimi); bindInterior() varsayılana döner. Önbellekleri siler. */
export function bindInterior(fn) {
  planInteriorFn = fn === undefined ? planInterior : (typeof fn === 'function' ? fn : null);
  LOT_CACHE.clear();
  CITY_CACHE.clear();
}

export function elevatorsOfLot(seed, lot) {
  const key = (seed >>> 0) + ':' + lot.id;
  const hit = LOT_CACHE.get(key);
  if (hit !== undefined) return hit;
  let res = [];
  const A0 = ARCHETYPES[lot.archetype];
  if (A0 && A0.tower && lot.built) {
    const bp = planBuilding(seed, lot);
    if (bp && bp.core && bp.core.length) {
      let it = null;
      if (planInteriorFn && bp.interior) {
        try {
          it = planInteriorFn(bp, lot);
        } catch {
          it = null;
        }
      }
      res = planElevators(bp, { interior: it });
    }
  }
  LOT_CACHE.set(key, res);
  return res;
}

export function allElevators(seed) {
  const key = seed >>> 0;
  const hit = CITY_CACHE.get(key);
  if (hit !== undefined) return hit;
  const plan = getCityPlan(seed);
  const lots = allLots(plan);
  const out = [];
  for (let i = 0; i < lots.length; i++) {
    const l = lots[i];
    const A0 = ARCHETYPES[l.archetype];
    if (!A0 || !A0.tower || !l.built) continue;
    const e = elevatorsOfLot(seed, l);
    for (let k = 0; k < e.length; k++) out.push(e[k]);
  }
  CITY_CACHE.set(key, out);
  return out;
}

/** (x,z) kuyu içinde mi (2×2). */
export function inBore(el, x, z, pad) {
  const p = pad || 0;
  return x >= el.bore.x0 - p && x < el.bore.x1 + p && z >= el.bore.z0 - p && z < el.bore.z1 + p;
}

export function nearestStop(el, y) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < el.stops.length; i++) {
    const d = Math.abs(el.stops[i].y - y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

export function doorCells(el, i) {
  const s = el.stops[i];
  const out = [];
  for (let k = 0; k < s.cells.length; k++) for (let y = s.y; y < s.y + DOOR_HEIGHT; y++) out.push([s.cells[k][0], y, s.cells[k][1]]);
  return out;
}

/** Durak düğmesi PropSpec yuvası (lotId içinde benzersiz; iç mekân yuvaları (≥64, tipik < 200) ile çakışmasın diye 3800+; propIdFor için < 4096). */
export function stopButtonSlot(el, i) {
  return 3800 + (el.part & 3) * 16 + (i & 15);
}

/** Düğme PropSpec'leri (propPlan toplar): blok planındaki kulelerin durak düğmeleri; rect {x0,z0,x1,z1} ile yalnız kesişenler. */
export function elevatorPropSpecs(seed, blockPlan, rect) {
  const out = [];
  const lots = blockPlan && blockPlan.lots;
  if (!lots) return out;
  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    if (!lot.built || lot.hill) continue;
    const A0 = ARCHETYPES[lot.archetype];
    if (!A0 || !A0.tower) continue;
    const els = elevatorsOfLot(seed, lot);
    for (let e = 0; e < els.length; e++) {
      const el = els[e];
      for (let s = 0; s < el.stops.length; s++) {
        const b = el.stops[s].button;
        if (rect && (b.x < rect.x0 || b.x >= rect.x1 || b.z < rect.z0 || b.z >= rect.z1)) continue;
        out.push({
          kind: 'asansor_dugmesi', x: b.x, y: b.y, z: b.z, yaw: b.yaw, variant: 0, data: s, lotId: el.lotId, slot: stopButtonSlot(el, s),
        });
      }
    }
  }
  return out;
}

export function elevatorAt(seed, x, y, z, radius) {
  const r = radius === undefined ? 1.2 : radius;
  const lots = allElevators(seed);
  for (let i = 0; i < lots.length; i++) {
    const el = lots[i];
    for (let s = 0; s < el.stops.length; s++) {
      const b = el.stops[s].button;
      if (Math.abs(b.x - x) < r && Math.abs(b.z - z) < r && Math.abs(b.y - y) < 1.2) return { el, stop: s };
    }
  }
  return null;
}

export { PLAN_CHUNK };

/**
 * Oyuncu kabinde mi: platform yükselirken zıplayan oyuncu geride kalıp platformun İÇİNE/ALTINA düşmesin diye her adımdan SONRA (kabin konumu güncellenince)
 * çağrılır. body {x,y,z,vy}; top = platform üst yüzü, platVy = kabin hızı. Dönüş: 0 (işlem yok) | 1 (platforma çıkarıldı) | 2 (kuyuda platformun >1,2 altındaydı:
 * platformun üstüne alındı = KURTARMA; kuyuya düşme yok) | 3 (kuyuda kabinin çok üstünde: platforma indirildi).
 */
export function rideAssist(el, top, platVy, body) {
  if (!inBore(el, body.x, body.z, 0.25)) return 0;
  const dy = body.y - top;
  if (dy >= -1e-6) {
    // kabinin çok üstünde (bozuk/uyumsuz kayıt: oyuncu kuyuda, kabin aşağıda) ya da durağan kabinin >2,5 üstünde: platforma indir (uzun düşüş/hasar yok)
    if (dy > 8 || (platVy === 0 && dy > 2.5)) {
      body.y = top;
      body.vy = 0;
      return 3;
    }
    return 0; // ayaklar platform yüzünde ya da üstünde: fizik taşıyor (fizik EPS'inden küçük gömülme bile 'iç içe' sayılıp düşürür → her adım onarılır)
  }
  const code = dy < -1.2 ? 2 : 1;
  body.y = top;
  if (code === 2 || body.vy < 0) body.vy = 0; // yukarı hız YAZILMAZ (fizik zemindeyken taşımayı vy ≤ 0 ister)
  return code;
}

/* ------------------------------------------------------------------------------------------------
 * Kabin simülasyonu
 * ---------------------------------------------------------------------------------------------- */
/**
 * Durum: y (platform üst yüzü), vy, phase ('idle' | 'closing' | 'moving'), at (durakta duruyorsa dizin, değilse −1), target, queue.
 * step(dt, env): env.blocked(i) → bool (kapı önünde biri var); olay dizisi döner: {type:'arrived',stop} {type:'doorClosed',stop} {type:'depart',from,to}.
 */
export function createElevatorSim(el, saved) {
  const n = el.stops.length;
  const S = {
    y: el.stops[0].y, vy: 0, phase: 'idle', at: 0, target: -1, queue: [], closeT: 0,
  };
  const st = restoreElevatorState(el, saved);
  if (st) {
    S.y = st.y;
    S.at = st.at;
    S.target = st.target;
    S.phase = st.target >= 0 ? 'moving' : 'idle';
    S.vy = 0;
  }
  const ev = [];

  function request(i) {
    if (!(i >= 0 && i < n)) return false;
    if (S.phase === 'idle' && S.at === i) return false;
    if (S.target === i || S.queue.indexOf(i) >= 0) return false;
    if (S.queue.length >= 3) S.queue.shift();
    S.queue.push(i);
    return true;
  }

  const sim = {
    get y() {
      return S.y;
    },
    get vy() {
      return S.vy;
    },
    get phase() {
      return S.phase;
    },
    /** Durakta duran kabin: durak dizini; yolda −1. Kapı yalnız burada AÇIKTIR. */
    get doorStop() {
      return S.phase === 'idle' || S.phase === 'closing' ? S.at : -1;
    },
    get at() {
      return S.at;
    },
    get queue() {
      return S.queue;
    },
    get target() {
      return S.target;
    },
    call(i) {
      return request(i);
    },
    /** Acil: yoldaki kabin en yakın durağa varır (kuyuda takılma yok). */
    abort() {
      if (S.phase === 'moving') {
        S.queue.length = 0;
        S.target = nearestStop(el, S.y + S.vy * Math.abs(S.vy) / (2 * ELEVATOR_ACCEL));
        return true;
      }
      return false;
    },
    step(dt, env) {
      ev.length = 0;
      if (!(dt > 0) || !Number.isFinite(dt)) return ev;
      const d = dt > 0.1 ? 0.1 : dt;
      if (S.phase === 'idle') {
        if (S.queue.length > 0) {
          const nxt = S.queue.shift();
          if (nxt === S.at) return ev;
          S.target = nxt;
          S.phase = 'closing';
          S.closeT = 0;
        }
        return ev;
      }
      if (S.phase === 'closing') {
        if (env && env.blocked && env.blocked(S.at)) {
          S.closeT = 0; // kapıda biri: kapı açık kalır
          return ev;
        }
        S.closeT += d;
        if (S.closeT >= 0.5) {
          ev.push({ type: 'doorClosed', stop: S.at });
          ev.push({ type: 'depart', from: S.at, to: S.target });
          S.phase = 'moving';
          S.from = S.at;
          S.at = -1;
        }
        return ev;
      }
      // moving. SIRA ÖNEMLİ (platform taşıma): önce ESKİ hızla ilerle (oyuncu fiziği bu adımı ColliderIndex'teki hızla önceden kestirdi), sonra hızı güncelle
      // (yeni hız bir sonraki adımın kestirimi olarak dinamik kutuya yazılır) → kestirim ile gerçek ötelenme birebir; oyuncu hızlanırken geride kalmaz.
      const goal = el.stops[S.target].y;
      let ny = S.y + S.vy * d;
      if ((goal - S.y) * (goal - ny) <= 0) ny = goal;
      const dist = goal - ny;
      const dir = dist >= 0 ? 1 : -1;
      const ad = Math.abs(dist);
      const vd = dir * Math.min(ELEVATOR_SPEED, Math.sqrt(2 * ELEVATOR_BRAKE * ad), SETTLE_RATE * ad);
      const maxDv = ELEVATOR_ACCEL * d;
      let dv = vd - S.vy;
      if (dv > maxDv) dv = maxDv;
      else if (dv < -maxDv) dv = -maxDv;
      const v = S.vy + dv;
      if (ny === goal || (Math.abs(dist) < 0.004 && Math.abs(v) < 1.2)) {
        S.y = goal;
        S.vy = 0;
        S.at = S.target;
        S.target = -1;
        S.phase = 'idle';
        ev.push({ type: 'arrived', stop: S.at });
        return ev;
      }
      S.y = ny;
      S.vy = v;
      return ev;
    },
    serialize() {
      if (S.phase === 'idle' && S.at === 0 && S.queue.length === 0) return null;
      if (S.phase === 'idle') return { s: S.at };
      return { s: S.at >= 0 ? S.at : (S.from === undefined ? 0 : S.from), t: S.target >= 0 ? S.target : -1, y: Math.round(S.y * 16) / 16 };
    },
    view() {
      return {
        y: S.y, vy: S.vy, phase: S.phase, at: S.at, target: S.target, queue: S.queue.slice(),
      };
    },
  };
  return sim;
}

/** Kayıt değeri → {y, at, target} | null (bozuk/yanıltıcı veri → null: kabin zemin katta). */
export function restoreElevatorState(el, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const n = el.stops.length;
  const s = Math.floor(Number(raw.s));
  if (!(s >= 0 && s < n)) return null;
  const t = raw.t === undefined ? -1 : Math.floor(Number(raw.t));
  if (t >= 0 && t < n && t !== s) {
    let y = Number(raw.y);
    const lo = Math.min(el.stops[s].y, el.stops[t].y);
    const hi = Math.max(el.stops[s].y, el.stops[t].y);
    if (!Number.isFinite(y)) y = el.stops[s].y;
    y = Math.min(Math.max(y, lo), hi);
    return { y, at: -1, target: t };
  }
  return { y: el.stops[s].y, at: s, target: -1 };
}
