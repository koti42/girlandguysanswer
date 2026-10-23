/*
 * KEŞİF sim/city/interior — İÇ MEKÂN GİRİŞ NOKTASI (kayıt, planlama, chunk-dilimli yayım, prop çıktısı). Saf, belirlenimci, worker-güvenli. Sözleşme §8.
 *
 *  emitBuildingInterior(w, bp, lot)        cityGen'in kabuktan SONRA çağırdığı kanca (w = CityWriter, yalnız kendi chunk dilimini yazar).
 *                                          sıra: prepareVolume (hacim temizle + zemin/tavan + dış-duvar-dışı çevre) → bölme duvarları (odalar dışındaki hücreler
 *                                          dolu) → impl.emit(w, interior, ctx) → iç kapı açıklıkları → ışıklar → aksanlar.  Kayıtsız tür: hacme dokunulmaz.
 *  planInterior(bp, lot) -> Interior|null  belirlenimci (tohum = bp.style.seed türevi; subHash(seed, lotId, tag)), LRU önbellekli; kopya paylaşılır (DEĞİŞTİRME)
 *  frameOf(interior) -> Frame|null · ctxOf(interior) -> {frame, pal, impl} · kitFor(W, interior) -> Kit
 *  interiorPropSpecs(citySeed, blockPlan, rect?) -> PropSpec[]   blok planındaki parsellerin iç mekân propları (rect {x0,z0,x1,z1}: yalnız kesişenler; propPlan toplar)
 *  interiorRoomAt(citySeed, x, y, z) -> {lotId,kind,room,role,mood}|null      oda sorgusu (HUD/ambiyans)
 *  registerInterior · unregisterInterior · getInterior · listInteriors · INTERIOR_KINDS  (registry.js)
 *  setInteriorStrict(bool)                 true: tür planı/yayımı hata verirse fırlatır (testler); varsayılan false: hata yutulur, INTERIOR_ERRORS'a yazılır, hacim boş kalır
 *  clearInteriorCache()
 *
 * Tür modülleri `interior/kinds/*.js` dosyalarıdır: `export default impl` | `export const interior = impl` (impl = {kind, name, footprint, plan, emit}) —
 * `import.meta.glob` ile otomatik yüklenir (genRegistry örüntüsü). Tür modülleri index.js'i İÇE AKTARMAZ (graph/kit/builder/frame/kitPlan/registry yeterli).
 */
import { Lru, sh, stream } from '../cityPlanKit.js';
import { lotAt, planBuilding } from '../cityPlan.js';
import { OWNER_BY_INTERIOR } from '../ownerData.js';
import {
  INTERIOR_KINDS, getInterior as regGet, isInteriorImpl, listInteriors, registerInterior, unregisterInterior,
} from './registry.js';
import { makeFrame } from './frame.js';
import { Kit, paletteFor, prepareVolume } from './kit.js';

export {
  INTERIOR_KINDS, listInteriors, registerInterior, unregisterInterior,
};

const TAG_PLAN = 0xc01;
const TAG_MIRROR = 0xc02;

let KIND_MODS = null;
try {
  KIND_MODS = import.meta.glob(['./kinds/*.js', '!./kinds/*.test.js'], { eager: true });
} catch {
  KIND_MODS = null; // Vite dışı (düz node): registerInterior ile elle kaydedin
}
let loaded = false;
function loadKinds() {
  if (loaded) return;
  loaded = true;
  if (!KIND_MODS) return;
  const ks = Object.keys(KIND_MODS).sort();
  for (let i = 0; i < ks.length; i++) {
    const m = KIND_MODS[ks[i]];
    const impl = m && (m.default || m.interior);
    if (isInteriorImpl(impl) && typeof impl.kind === 'string' && !regGet(impl.kind)) registerInterior(impl.kind, impl);
  }
}

export function getInterior(kind) {
  loadKinds();
  return regGet(kind);
}

let STRICT = false;
export const INTERIOR_ERRORS = [];
export function setInteriorStrict(v) {
  STRICT = !!v;
}
function fail(e, where) {
  if (STRICT) throw e;
  if (INTERIOR_ERRORS.length < 20) INTERIOR_ERRORS.push(where + ': ' + (e && e.message ? e.message : String(e)));
}

const CACHE = new Lru(160);
const CTX = new WeakMap();
export function clearInteriorCache() {
  CACHE.clear();
}

function seedOf(bp) {
  if (Number.isFinite(bp.interiorSeed)) return bp.interiorSeed | 0;
  if (Number.isFinite(bp.seed)) return bp.seed | 0;
  return bp.style && Number.isFinite(bp.style.seed) ? bp.style.seed | 0 : 0;
}

function fits(frame, fp) {
  return (frame.W >= fp.w && frame.D >= fp.d) || (frame.W >= fp.d && frame.D >= fp.w);
}

export function planInterior(bp, lotIn) {
  const it = bp && bp.interior;
  const lot = lotIn || { id: bp && bp.id };
  if (!it || !bp.doors || !bp.doors[0]) return null;
  const impl = getInterior(it.kind);
  if (!impl) return null;
  const seed = seedOf(bp);
  const key = bp.id + ':' + seed + ':' + it.kind + ':' + it.variant + ':' + it.x0 + ',' + it.z0;
  const hit = CACHE.get(key);
  if (hit !== undefined && hit.impl === impl) return hit.interior;
  let interior = null;
  try {
    const variant = it.variant | 0;
    const fp = impl.footprint(variant);
    const mirror = impl.mirror === false ? false : (sh(seed, bp.id, TAG_MIRROR) & 1) === 1;
    const frame = makeFrame(bp, lot, { mirror, h: fp && fp.h });
    if (frame && fits(frame, fp) && frame.door.ok) {
      const own = OWNER_BY_INTERIOR[it.kind];
      const pal = impl.palette ? impl.palette(it, frame) : paletteFor(own ? own.mood.hue : null);
      const rng = stream(seed, bp.id, TAG_PLAN);
      const ctx = { frame, bp, lot, kind: it.kind, variant, seed, pal };
      interior = impl.plan(lot, rng, variant, ctx);
      if (interior) CTX.set(interior, { frame, pal, impl });
    }
  } catch (e) {
    fail(e, 'plan ' + it.kind + '#' + bp.id);
    interior = null;
  }
  CACHE.set(key, { impl, interior });
  return interior;
}


export function frameOf(interior) {
  const c = interior && CTX.get(interior);
  return c ? c.frame : null;
}

export function ctxOf(interior) {
  return (interior && CTX.get(interior)) || null;
}

export function kitFor(W, interior) {
  const c = CTX.get(interior);
  if (!c) throw new Error('kitFor: Interior planInterior ile üretilmemiş');
  return new Kit(W, c.frame, c.pal);
}

/* bölme duvarları: şimdilik her oda ayak izinin DIŞINDaki dikdörtgen hücreler dolu (tam yükseklik) */
function partitionWalls(kit, interior, frame, pal) {
  const f = frame;
  const inRoom = (x, z) => {
    const rs = interior.rooms;
    for (let i = 0; i < rs.length; i++) if (x >= rs[i].x0 && x < rs[i].x1 && z >= rs[i].z0 && z < rs[i].z1) return true;
    return false;
  };
  const W = kit.W;
  const x0 = Math.max(f.x0, W.x0);
  const x1 = Math.min(f.x1, W.x1);
  const z0 = Math.max(f.z0, W.z0);
  const z1 = Math.min(f.z1, W.z1);
  for (let x = x0; x < x1; x++) {
    for (let z = z0; z < z1; z++) {
      if (inRoom(x, z)) continue;
      const lc = f.local(x, z);
      if (f.solids.length && f.isSolid(lc[0], lc[1])) continue;
      W.box(x, f.floorY, z, x + 1, f.ceilY + 1, z + 1, pal.wall);
    }
  }
}

export function emitBuildingInterior(w, bp, lot) {
  const it = bp && bp.interior;
  if (!it || !w.touches(it.x0 - 2, it.z0 - 2, it.x1 + 2, it.z1 + 2)) return;
  const interior = planInterior(bp, lot);
  if (!interior) return;
  const c = CTX.get(interior);
  if (!c) return;
  try {
    const { frame, pal, impl } = c;
    const kit = prepareVolume(w, frame, pal);
    if (impl.shell !== false) partitionWalls(kit, interior, frame, pal);
    impl.emit(w, interior, { frame, pal, kit, bp, lot });
    if (impl.autoDoors !== false) {
      for (let i = 0; i < interior.doors.length; i++) {
        const d = interior.doors[i];
        if (d.kind === 'door' || d.kind === 'arch') kit.doorway(d, d.doorway);
      }
    }
    if (impl.autoLights !== false) {
      kit.lights(interior);
      kit.accents(interior);
    }
  } catch (e) {
    fail(e, 'emit ' + it.kind + '#' + bp.id);
  }
}

/* ------------------------------------------------------------------------------------------------
 * Prop çıktısı + oda sorgusu
 * ---------------------------------------------------------------------------------------------- */
/** Blok planındaki parsellerin iç mekân PropSpec'leri (kimlik: lotId + slot≥64; propPlan.normalizeSpec girdisi). */
export function interiorPropSpecs(citySeed, blockPlan, rect) {
  const out = [];
  const lots = blockPlan && blockPlan.lots;
  if (!lots) return out;
  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    if (!lot.built || lot.hill) continue;
    let bp;
    try {
      bp = planBuilding(citySeed, lot);
    } catch (e) {
      fail(e, 'planBuilding');
      continue;
    }
    if (!bp || !bp.interior) continue;
    const r = bp.interior;
    if (rect && (r.x0 >= rect.x1 || r.x1 <= rect.x0 || r.z0 >= rect.z1 || r.z1 <= rect.z0)) continue;
    const it = planInterior(bp, lot);
    if (it) for (let k = 0; k < it.props.length; k++) out.push(it.props[k]);
  }
  return out;
}

export function interiorRoomAt(citySeed, x, y, z) {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const fz = Math.floor(z);
  const lot = lotAt(citySeed, fx, fz);
  if (!lot || !lot.built) return null;
  const bp = planBuilding(citySeed, lot);
  if (!bp || !bp.interior) return null;
  const it = bp.interior;
  if (fx < it.x0 || fx >= it.x1 || fz < it.z0 || fz >= it.z1) return null;
  const interior = planInterior(bp, lot);
  if (!interior) return null;
  for (let i = 0; i < interior.rooms.length; i++) {
    const r = interior.rooms[i];
    if (fx >= r.x0 && fx < r.x1 && fz >= r.z0 && fz < r.z1 && fy >= r.y0 && fy < r.y1) return { lotId: lot.id, kind: interior.kind, room: r.id, role: r.role, mood: interior.mood };
  }
  return null;
}

