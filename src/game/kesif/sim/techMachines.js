/*
 * KEŞİF sim — TEKNOLOJİ: makine durum makineleri (saf; DOM/three yok, Math.random/Date.now yok, belirlenimci).
 *
 * Her makine türünün durumu düz JSON nesnesidir ({t:tür, …alanlar}). Bu modül varsayılan durumu, katı doğrulamayı,
 * üretim/talep hızlarını ve (beslenme bayrağıyla) adım işlevlerini verir. Ağ kurma/dengeleme techPower.js'te, kayıt defteri
 * ve zamanlama techState.js'tedir.
 *
 *   createMachine(type, blockId?) · sanitizeMachine(type, raw) → durum | null
 *   machineRole(type) → 'gen'|'store'|'load'|'switch'          machinePrio(type)
 *   generationRate(type, st, mctx, key) → EU/sn                loadDemand(type, st, dt) → EU/sn
 *   stepMachine(type, st, key, powered, dt, mctx)               makineyi dt sn ilerletir
 *   visualOn(type, st) → bool       visualBlockId(type, on) → blok kimliği
 *   furnaceRecipe(itemKey) → {in,out,count,inCount} | null     insertIntoSlots(slots, item, count) → kalan
 *   drill/furnace/generator yardımcıları (insertFuel, takeOutput …)
 *
 * mctx (adım bağlamı; hepsi isteğe bağlı olanlar belirtilmiştir):
 *   getBlock(x,y,z)→id|null · setBlock(x,y,z,id)→bool|void · ensure?(x,y,z) (üretilmemiş derin kesiti üret)
 *   chestAt?(x,y,z)→slots[]|null · drop?({item,count,x,y,z}) · isOccupied?(x,y,z)→bool · player?{x,y,z}
 *   daylight 0..1 · weather 'clear'|'rain'|'storm' · skyOpen?(x,y,z)→bool · minY · maxY · seed · events:[] · stats:{…}
 */
import { BLOCKS, B, resolveDrops } from './blocks.js';
import { RECIPES, itemByKey } from './items.js';
import { hash3, seededRandom } from './rng.js';
import {
  DRILL_TOOL, FREQ_LENGTH, GENERATOR_FUEL, TECH_BLOCK_IDS, TECH_RATES, techBaseId, techOnId,
} from './techData.js';
import { parseKey } from './techPower.js';

const R = TECH_RATES;

/** Makine türü → taban blok kimliği. */
export const TYPE_BASE = Object.freeze({
  gunes: TECH_BLOCK_IDS.SOLAR,
  jenerator: TECH_BLOCK_IDS.GENERATOR,
  pil: TECH_BLOCK_IDS.BATTERY,
  ocak: TECH_BLOCK_IDS.FURNACE,
  matkap: TECH_BLOCK_IDS.DRILL,
  lamba: TECH_BLOCK_IDS.LAMP,
  isinlayici: TECH_BLOCK_IDS.TELEPORTER,
  asansor: TECH_BLOCK_IDS.LIFT,
  kapi: TECH_BLOCK_IDS.DOOR,
  dugme: TECH_BLOCK_IDS.BUTTON,
  sensor: TECH_BLOCK_IDS.SENSOR,
  sarj: TECH_BLOCK_IDS.CHARGER,
});
const ROLE = Object.freeze({
  gunes: 'gen', jenerator: 'gen', pil: 'store', ocak: 'load', matkap: 'load', lamba: 'load', isinlayici: 'load', asansor: 'load',
  kapi: 'load', dugme: 'switch', sensor: 'switch', sarj: 'load',
});
const PRIO = Object.freeze({
  lamba: 0, kapi: 0, ocak: 1, matkap: 1, isinlayici: 2, asansor: 2, sarj: 2,
});

/** Elle açılıp kapatılabilen makineler (st.off = true: talep etmez, çalışmaz; jeneratör yakmaz ve üretmez). */
const SWITCHABLE = Object.freeze({
  jenerator: 1, ocak: 1, matkap: 1, lamba: 1, isinlayici: 1, asansor: 1, sarj: 1,
});
export function isSwitchable(type) {
  return SWITCHABLE[type] === 1;
}
/** Lamba renkleri (indeks st.hue; 0 = beyaz/varsayılan). Işık değeri aynı kalır, yalnız hale rengi değişir. */
export const LAMP_HUES = Object.freeze([
  { key: 'beyaz', name: 'Beyaz', rgb: [1, 1, 0.92] },
  { key: 'sicak', name: 'Sıcak sarı', rgb: [1, 0.72, 0.3] },
  { key: 'kirmizi', name: 'Kırmızı', rgb: [1, 0.25, 0.22] },
  { key: 'yesil', name: 'Yeşil', rgb: [0.3, 1, 0.45] },
  { key: 'mavi', name: 'Mavi', rgb: [0.3, 0.55, 1] },
  { key: 'mor', name: 'Mor', rgb: [0.72, 0.4, 1] },
  { key: 'turkuaz', name: 'Turkuaz', rgb: [0.3, 1, 0.92] },
  { key: 'pembe', name: 'Pembe', rgb: [1, 0.5, 0.82] },
]);

export const DRILL_MODES = Object.freeze(['column', 'alan']);
export const BUTTON_MODES = Object.freeze(['toggle', 'pulse']);
export const DRILL_STOPS = Object.freeze(['ana_kaya', 'dip', 'derinlik', 'korumali']);

export function machineRole(type) {
  return ROLE[type] || null;
}
/** Tampon (depo) makineleri kısmi beslenir: tüketici ya tam ya hiç kuralı onlara uygulanmaz. */
export function isPartialLoad(type) {
  return type === 'isinlayici' || type === 'asansor' || type === 'sarj';
}
export function machinePrio(type) {
  return PRIO[type] === undefined ? 1 : PRIO[type];
}
export function isMachineType(type) {
  return typeof type === 'string' && Object.prototype.hasOwnProperty.call(TYPE_BASE, type);
}

function clampNum(v, lo, hi, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return n < lo ? lo : n > hi ? hi : n;
}
function clampInt(v, lo, hi, def) {
  return Math.floor(clampNum(v, lo, hi, def));
}
function r3(v) {
  return Math.round(v * 1000) / 1000;
}

/* ------------------------------------------------------------------------------------------------
 * Varsayılan durum + katı doğrulama
 * ---------------------------------------------------------------------------------------------- */
/** Yeni makine durumu. blockId: blok ETKİN varyantıysa anahtar/düğme/sensör açık başlar. */
export function createMachine(type, blockId) {
  switch (type) {
    case 'gunes': return { t: type, sky: 1, skyT: 0 };
    case 'jenerator': return { t: type, fuel: null, burnT: 0, burnTotal: 0 };
    case 'pil': return { t: type, stored: 0 };
    case 'ocak': return {
      t: type, inItem: null, inCount: 0, outItem: null, outCount: 0, prog: 0, on: false,
    };
    case 'matkap': return {
      t: type, mode: 'column', ly: null, ci: 0, prog: 0, buf: [], mined: 0, stop: null, blocked: false, wait: null, on: false,
    };
    case 'lamba': return { t: type, on: false };
    case 'kapi': return { t: type, open: false };
    case 'dugme': return { t: type, on: blockId === TECH_BLOCK_IDS.BUTTON_ON, mode: 'toggle', left: 0 };
    case 'sensor': return { t: type, on: blockId === TECH_BLOCK_IDS.SENSOR_ON, radius: R.sensor.radius };
    case 'isinlayici': return { t: type, freq: null, buf: 0, cd: 0, on: false };
    case 'asansor': return { t: type, buf: 0, cd: 0 };
    case 'sarj': return { t: type, buf: 0, on: false };
    default: return null;
  }
}

function cleanItem(raw) {
  if (typeof raw !== 'string' || raw.length > 48) return null;
  const it = itemByKey(raw);
  return it ? it.key : null;
}
function cleanStack(item, count, max) {
  const key = cleanItem(item);
  if (!key) return null;
  const it = itemByKey(key);
  const n = clampInt(count, 0, Math.min(max, it.stack), 0);
  return n > 0 ? { item: key, count: n } : null;
}
export function cleanFreq(raw) {
  if (typeof raw !== 'string' || raw.length !== FREQ_LENGTH) return null;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c < 48 || c > 55) return null;
  }
  return raw;
}

/** Dış kaynaktan gelen makine durumunu varsayılanlar üzerine katı doğrulayarak oturtur (bilinmeyen alan atılır). */
export function sanitizeMachine(type, raw, ctx) {
  if (!isMachineType(type)) return null;
  const st = createMachine(type);
  const d = raw && typeof raw === 'object' ? raw : {};
  const has = (k) => Object.prototype.hasOwnProperty.call(d, k);
  switch (type) {
    case 'gunes':
      st.sky = d.sky ? 1 : 0;
      st.skyT = r3(clampNum(has('skyT') ? d.skyT : 0, 0, 60, 0));
      break;
    case 'jenerator': {
      const f = d.fuel && typeof d.fuel === 'object' ? cleanStack(d.fuel.item, d.fuel.count, R.generator.maxFuel) : null;
      st.fuel = f && GENERATOR_FUEL[f.item] ? f : null;
      st.burnTotal = r3(clampNum(d.burnTotal, 0, 60, 0));
      st.burnT = r3(clampNum(d.burnT, 0, st.burnTotal, 0));
      break;
    }
    case 'pil':
      st.stored = r3(clampNum(d.stored, 0, R.battery.cap, 0));
      break;
    case 'ocak': {
      const a = cleanStack(d.inItem, d.inCount, R.furnace.stack);
      st.inItem = a && furnaceRecipe(a.item) ? a.item : null;
      st.inCount = st.inItem ? a.count : 0;
      const o = cleanStack(d.outItem, d.outCount, R.furnace.stack);
      st.outItem = o ? o.item : null;
      st.outCount = o ? o.count : 0;
      st.prog = r3(clampNum(d.prog, 0, 1, 0));
      st.on = !!d.on;
      break;
    }
    case 'matkap': {
      st.mode = DRILL_MODES.indexOf(d.mode) >= 0 ? d.mode : 'column';
      const lo = ctx && Number.isFinite(ctx.minY) ? ctx.minY : -1000;
      const hi = ctx && Number.isFinite(ctx.maxY) ? ctx.maxY : 1000;
      const lyN = d.ly === null || d.ly === undefined || typeof d.ly === 'boolean' ? NaN : Number(d.ly);
      st.ly = Number.isFinite(lyN) ? Math.floor(Math.min(hi, Math.max(lo - 1, lyN))) : null;
      st.ci = clampInt(d.ci, 0, 24, 0);
      st.prog = r3(clampNum(d.prog, 0, 60, 0));
      st.mined = clampInt(d.mined, 0, 1e9, 0);
      st.stop = DRILL_STOPS.indexOf(d.stop) >= 0 ? d.stop : null;
      st.blocked = d.blocked === 2 ? 2 : !!d.blocked; // 2 = korumalı blok (sandık/istasyon/makine/bulmaca/yapı), true = kırılamaz
      st.wait = d.wait === 'yuk' || d.wait === 'dolu' ? d.wait : null;
      st.on = !!d.on;
      const src = Array.isArray(d.buf) ? d.buf : [];
      let total = 0;
      for (let i = 0; i < src.length && i < 64 && total < R.drill.bufferCap; i++) {
        const s = src[i] && typeof src[i] === 'object' ? cleanStack(src[i].item, src[i].count, R.drill.bufferCap) : null;
        if (s) {
          st.buf.push(s);
          total += s.count;
        }
      }
      break;
    }
    case 'lamba': st.on = !!d.on; break;
    case 'kapi': st.open = !!d.open; break;
    case 'dugme':
      st.on = !!d.on;
      st.mode = BUTTON_MODES.indexOf(d.mode) >= 0 ? d.mode : 'toggle';
      st.left = r3(clampNum(d.left, 0, 60, 0));
      break;
    case 'sensor':
      st.on = !!d.on;
      st.radius = clampInt(d.radius, R.sensor.minRadius, R.sensor.maxRadius, R.sensor.radius);
      break;
    case 'isinlayici':
      st.freq = cleanFreq(d.freq);
      st.buf = r3(clampNum(d.buf, 0, R.teleporter.cap, 0));
      st.cd = r3(clampNum(d.cd, 0, 120, 0));
      st.on = st.buf >= R.teleporter.minReady;
      break;
    case 'asansor':
      st.buf = r3(clampNum(d.buf, 0, R.lift.cap, 0));
      st.cd = r3(clampNum(d.cd, 0, 60, 0));
      break;
    case 'sarj':
      st.buf = r3(clampNum(d.buf, 0, R.charger.cap, 0));
      st.on = !!d.on;
      break;
    default: return null;
  }
  if (SWITCHABLE[type] === 1 && d.off === true) st.off = true;
  if (type === 'lamba') {
    const h = clampInt(d.hue, 0, LAMP_HUES.length - 1, 0);
    if (h > 0) st.hue = h;
  }
  return st;
}

/* ------------------------------------------------------------------------------------------------
 * Ortak yardımcılar
 * ---------------------------------------------------------------------------------------------- */
/** Slot dizisine (sandık: null | {item,count,dur?,ench?}) eşya ekler; sığmayan adedi döner. Yığılmayan eşya tek tek. */
export function insertIntoSlots(slots, itemKey, count) {
  const it = itemByKey(itemKey);
  let left = Math.floor(count);
  if (!it || !Array.isArray(slots) || !(left > 0)) return Math.max(0, left || 0);
  if (!it.durability && !(it.tech && it.tech.chargeMax > 0)) {
    for (let i = 0; i < slots.length && left > 0; i++) {
      const s = slots[i];
      if (s && s.item === it.key && s.dur === undefined && s.count < it.stack) {
        const n = Math.min(it.stack - s.count, left);
        s.count += n;
        left -= n;
      }
    }
  }
  for (let i = 0; i < slots.length && left > 0; i++) {
    if (!slots[i]) {
      const stackable = !it.durability && !(it.tech && it.tech.chargeMax > 0);
      const n = stackable ? Math.min(it.stack, left) : 1;
      slots[i] = { item: it.key, count: n };
      left -= n;
    }
  }
  return left;
}

function bufTotal(buf) {
  let n = 0;
  for (let i = 0; i < buf.length; i++) n += buf[i].count;
  return n;
}
function bufAdd(buf, item, count) {
  const it = itemByKey(item);
  if (!it) return;
  let left = count;
  for (let i = 0; i < buf.length && left > 0; i++) {
    if (buf[i].item === it.key && buf[i].count < it.stack) {
      const n = Math.min(it.stack - buf[i].count, left);
      buf[i].count += n;
      left -= n;
    }
  }
  while (left > 0) {
    const n = Math.min(it.stack, left);
    buf.push({ item: it.key, count: n });
    left -= n;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Ocak (elektrikli): tek girdili 'ocak' istasyonu tarifleri
 * ---------------------------------------------------------------------------------------------- */
let furnaceMap = null;
function buildFurnaceMap() {
  furnaceMap = new Map();
  for (let i = 0; i < RECIPES.length; i++) {
    const r = RECIPES[i];
    if (r.station !== 'ocak' || r.in.length !== 1) continue;
    if (!furnaceMap.has(r.in[0].item)) {
      furnaceMap.set(r.in[0].item, {
        id: r.id, in: r.in[0].item, inCount: r.in[0].count, out: r.out.item, count: r.out.count,
      });
    }
  }
}
/** Girdi eşyası → {id, in, inCount, out, count} | null (yalnız 'ocak' istasyonu, tek girdili tarifler). */
export function furnaceRecipe(itemKey) {
  if (!furnaceMap) buildFurnaceMap();
  const it = itemByKey(itemKey);
  return it ? furnaceMap.get(it.key) || null : null;
}
export function furnaceInputs() {
  if (!furnaceMap) buildFurnaceMap();
  return Array.from(furnaceMap.keys());
}
/** Girdi yığınına eşya ekler; kabul edilen adedi döner (tarifi yoksa / başka eşya doluysa 0). */
export function furnaceInsert(st, itemKey, count) {
  const rec = furnaceRecipe(itemKey);
  const n = Math.floor(count);
  if (!rec || !(n > 0)) return 0;
  if (st.inItem && st.inItem !== rec.in) return 0;
  const room = Math.min(itemByKey(rec.in).stack, R.furnace.stack) - (st.inItem ? st.inCount : 0);
  const take = Math.max(0, Math.min(room, n));
  if (take <= 0) return 0;
  if (!st.inItem) {
    st.inItem = rec.in;
    st.inCount = 0;
    st.prog = 0;
  }
  st.inCount += take;
  return take;
}
/** Çıktı yığınını alır → {item,count} | null. */
export function furnaceTake(st) {
  if (!st.outItem || st.outCount <= 0) return null;
  const out = { item: st.outItem, count: st.outCount };
  st.outItem = null;
  st.outCount = 0;
  return out;
}
/** Girdi yığınını geri alır (kırılma/iade). */
export function furnaceTakeInput(st) {
  if (!st.inItem || st.inCount <= 0) return null;
  const out = { item: st.inItem, count: st.inCount };
  st.inItem = null;
  st.inCount = 0;
  st.prog = 0;
  return out;
}
function furnaceCanWork(st) {
  if (!st.inItem) return false;
  const rec = furnaceRecipe(st.inItem);
  if (!rec || st.inCount < rec.inCount) return false;
  if (!st.outItem) return true;
  return st.outItem === rec.out && st.outCount + rec.count <= Math.min(R.furnace.stack, itemByKey(rec.out).stack);
}
/** Ocakta bir parçanın işlenme süresi (sn). */
export function furnaceTime() {
  return R.furnace.baseTime / R.furnace.speed;
}

/* ------------------------------------------------------------------------------------------------
 * Yakıt jeneratörü
 * ---------------------------------------------------------------------------------------------- */
/** Yakıt yığınına ekler (aynı eşya, en çok 64); kabul edilen adedi döner. */
export function insertFuel(st, itemKey, count) {
  const it = itemByKey(itemKey);
  const n = Math.floor(count);
  if (!it || !GENERATOR_FUEL[it.key] || !(n > 0)) return 0;
  if (st.fuel && st.fuel.item !== it.key) return 0;
  const room = Math.min(R.generator.maxFuel, it.stack) - (st.fuel ? st.fuel.count : 0);
  const take = Math.max(0, Math.min(room, n));
  if (take <= 0) return 0;
  if (st.fuel) st.fuel.count += take;
  else st.fuel = { item: it.key, count: take };
  return take;
}
export function takeFuel(st) {
  if (!st.fuel) return null;
  const out = { item: st.fuel.item, count: st.fuel.count };
  st.fuel = null;
  return out;
}
/** Yakıt yakmaya başlayabilir mi (yanmıyor ve yakıt var)? */
export function canStartBurn(st) {
  return !st.off && st.burnT <= 1e-9 && !!st.fuel && st.fuel.count > 0;
}
/** Yanmayı başlatır (1 yakıt tüketir). */
export function startBurn(st) {
  if (!canStartBurn(st)) return false;
  const secs = GENERATOR_FUEL[st.fuel.item] || 0;
  if (!(secs > 0)) return false;
  st.fuel.count -= 1;
  if (st.fuel.count <= 0) st.fuel = null;
  st.burnTotal = secs;
  st.burnT = secs;
  return true;
}

/* ------------------------------------------------------------------------------------------------
 * Güneş: gökyüzü erişimi
 * ---------------------------------------------------------------------------------------------- */
/** Üstü açık mı? Opak blok ya da toplam ışık süzgeci ≥ 8 engeller; üretilmemiş chunk açık sayılır. */
export function skyAccess(getBlock, x, y, z, maxY) {
  let filter = 0;
  const top = Math.min(maxY, y + 400);
  for (let yy = y + 1; yy <= top; yy++) {
    const id = getBlock(x, yy, z);
    if (id === null || id === undefined) return true;
    if (id === 0) continue;
    const b = BLOCKS[id];
    if (!b) continue;
    if (b.opaque) return false;
    filter += b.lightFilter;
    if (filter >= 8) return false;
  }
  return true;
}

/* ------------------------------------------------------------------------------------------------
 * Üretim / talep
 * ---------------------------------------------------------------------------------------------- */
/** Anlık üretim hızı (EU/sn). Güneş: gün ışığı × hava × gökyüzü erişimi. Jeneratör: yanıyorsa. */
export function generationRate(type, st, mctx, key) {
  if (type === 'gunes') {
    const p = parseKey(key);
    if (st.skyT <= 0 && p) {
      const maxY = mctx.maxY !== undefined ? mctx.maxY : 1000;
      const open = typeof mctx.skyOpen === 'function' ? !!mctx.skyOpen(p[0], p[1], p[2]) : skyAccess(mctx.getBlock, p[0], p[1], p[2], maxY);
      st.sky = open ? 1 : 0;
      st.skyT = R.solar.skyCheckEvery;
    }
    const day = clampNum(mctx.daylight, 0, 1, 0);
    const w = mctx.weather === 'storm' ? R.solar.stormMul : mctx.weather === 'rain' ? R.solar.rainMul : 1;
    return r3(R.solar.peak * day * w * (st.sky ? 1 : 0));
  }
  if (type === 'jenerator') return st.burnT > 1e-9 && !st.off ? R.generator.rate : 0;
  return 0;
}

/** Talep hızı (EU/sn). dt: adım süresi (tampon makineler dolana kadar). */
export function loadDemand(type, st, dt) {
  if (st.off) return 0;
  const step = dt > 0 ? dt : 1;
  switch (type) {
    case 'lamba': return R.lamp.power;
    case 'kapi': return R.door.power;
    case 'ocak': return furnaceCanWork(st) ? R.furnace.power : 0;
    case 'matkap': return drillWants(st) ? R.drill.power : 0;
    case 'isinlayici': return st.buf < R.teleporter.cap ? Math.min(R.teleporter.charge, (R.teleporter.cap - st.buf) / step) : 0;
    case 'asansor': return st.buf < R.lift.cap ? Math.min(R.lift.charge, (R.lift.cap - st.buf) / step) : 0;
    case 'sarj': return st.buf < R.charger.cap ? Math.min(R.charger.intake, (R.charger.cap - st.buf) / step) : 0;
    default: return 0;
  }
}

/** Görsel durum (ETKİN blok varyantı mı?). */
export function visualOn(type, st) {
  switch (type) {
    case 'jenerator': return st.burnT > 1e-9 && !st.off;
    case 'ocak': return !!st.on;
    case 'matkap': return !!st.on;
    case 'lamba': return !!st.on;
    case 'kapi': return !!st.open;
    case 'dugme': return !!st.on;
    case 'sensor': return !!st.on;
    case 'isinlayici': return st.buf >= R.teleporter.minReady;
    case 'sarj': return !!st.on;
    default: return false;
  }
}
export function visualBlockId(type, on) {
  const base = TYPE_BASE[type];
  return on ? techOnId(base) : base;
}

/* ------------------------------------------------------------------------------------------------
 * Matkap
 * ---------------------------------------------------------------------------------------------- */
/** Matkap hücre sapmaları (belirlenimci sıra: merkezden dışa). */
const AREA_CELLS = (() => {
  const out = [];
  const a = R.drill.area;
  for (let dz = -a; dz <= a; dz++) for (let dx = -a; dx <= a; dx++) out.push([dx, dz]);
  out.sort((p, q) => (p[0] * p[0] + p[1] * p[1]) - (q[0] * q[0] + q[1] * q[1]) || p[1] - q[1] || p[0] - q[0]);
  return Object.freeze(out.map((p) => Object.freeze(p)));
})();
const COLUMN_CELLS = Object.freeze([Object.freeze([0, 0])]);
export function drillCells(mode) {
  return mode === 'alan' ? AREA_CELLS : COLUMN_CELLS;
}
/**
 * Matkabın ASLA kırmayacağı bloklar: oyuncunun kurduğu etkileşimli bloklar (sandık, istasyon, kapı, yatak, büyü masası …) ve teknoloji
 * blokları (kablo, makine, laboratuvar). Aksi halde bir sandığın içeriği sessizce yok olur ya da altındaki pil bankası/kablo sökülürdü.
 */
export function drillProtectsBlock(id) {
  const b = BLOCKS[id];
  return !!b && (!!b.interact || techBaseId(id) > 0);
}
function drillWants(st) {
  return !st.stop && st.wait !== 'dolu' && bufTotal(st.buf) < R.drill.bufferCap;
}
/** Bloğu kırma süresi (sn). */
export function drillTimeFor(id) {
  const b = BLOCKS[id];
  const h = b && b.hardness > 0 ? b.hardness : 0;
  return Math.max(R.drill.minTime, h * R.drill.timePerHardness);
}

function readBlock(mctx, x, y, z) {
  let id = mctx.getBlock(x, y, z);
  if ((id === null || id === undefined) && typeof mctx.ensure === 'function') {
    mctx.ensure(x, y, z);
    id = mctx.getBlock(x, y, z);
  }
  return id;
}

function deliverDrill(st, key, items, mctx) {
  const p = parseKey(key);
  for (let i = 0; i < items.length; i++) {
    let left = items[i].count;
    if (typeof mctx.chestAt === 'function') {
      for (let d = 0; d < 6 && left > 0; d++) {
        const nx = p[0] + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const ny = p[1] + (d === 2 ? 1 : d === 3 ? -1 : 0);
        const nz = p[2] + (d === 4 ? 1 : d === 5 ? -1 : 0);
        if (mctx.getBlock(nx, ny, nz) !== B.CHEST) continue;
        const slots = mctx.chestAt(nx, ny, nz);
        if (slots) left = insertIntoSlots(slots, items[i].item, left);
      }
    }
    if (left > 0) bufAdd(st.buf, items[i].item, left);
  }
}

/** Tampondaki eşyaları yere bırakır (yakında sandık yoksa). Bırakılan yığın sayısını döner. */
export function flushDrillBuffer(st, key, mctx, maxStacks) {
  if (typeof mctx.drop !== 'function' || st.buf.length === 0) return 0;
  const p = parseKey(key);
  let n = 0;
  while (st.buf.length > 0 && n < maxStacks) {
    const s = st.buf.shift();
    mctx.drop({ item: s.item, count: s.count, x: p[0] + 0.5, y: p[1] + 1.1, z: p[2] + 0.5 });
    n++;
  }
  return n;
}
/** Matkap tamponunu alır (arayüz: "boşalt"). */
export function drillTakeBuffer(st) {
  const out = st.buf;
  st.buf = [];
  st.wait = st.wait === 'dolu' ? null : st.wait;
  return out;
}

function stepDrill(st, key, powered, dt, mctx) {
  st.on = false;
  if (st.stop || !powered) return;
  const p = parseKey(key);
  const minY = mctx.minY !== undefined ? mctx.minY : -1000;
  const cells = drillCells(st.mode);
  let budget = dt;
  let layerSteps = 0;
  let worked = false;
  st.wait = null;
  while (budget > 1e-9) {
    if (bufTotal(st.buf) >= R.drill.bufferCap) {
      st.wait = 'dolu';
      break;
    }
    if (st.ly === null) {
      st.ly = p[1] - 1;
      st.ci = 0;
      st.prog = 0;
      st.blocked = false;
    }
    if (st.ly < minY) {
      st.stop = 'dip';
      break;
    }
    if (p[1] - st.ly > R.drill.maxDepth) {
      st.stop = 'derinlik';
      break;
    }
    let target = null;
    let unloaded = false;
    for (let i = st.ci; i < cells.length; i++) {
      const bx = p[0] + cells[i][0];
      const bz = p[2] + cells[i][1];
      const id = readBlock(mctx, bx, st.ly, bz);
      if (id === null || id === undefined) {
        unloaded = true;
        break;
      }
      if (id === 0) continue;
      const b = BLOCKS[id];
      if (!b || b.liquid) continue;
      if (drillProtectsBlock(id) || (typeof mctx.canMine === 'function' && !mctx.canMine(bx, st.ly, bz, id))) {
        st.blocked = 2;
        continue;
      }
      if (b.unbreakable) {
        if (st.blocked !== 2) st.blocked = true;
        continue;
      }
      target = { bx, bz, id, i };
      break;
    }
    if (unloaded) {
      st.wait = 'yuk';
      break;
    }
    if (!target) {
      if (st.blocked) {
        st.stop = st.blocked === 2 ? 'korumali' : 'ana_kaya';
        break;
      }
      st.ly -= 1;
      st.ci = 0;
      st.prog = 0;
      st.blocked = false;
      layerSteps++;
      if (layerSteps > R.drill.layerStepsPerTick) break;
      continue;
    }
    st.ci = target.i;
    const need = drillTimeFor(target.id);
    const left = need - st.prog;
    worked = true;
    if (budget + 1e-9 < left) {
      st.prog = r3(st.prog + budget);
      budget = 0;
      break;
    }
    budget -= Math.max(0, left);
    st.prog = 0;
    const rng = seededRandom(hash3(target.bx, st.ly, target.bz, ((mctx.seed | 0) ^ (st.mined * 2654435761)) | 0));
    const drops = resolveDrops(target.id, rng, DRILL_TOOL, null);
    const ok = mctx.setBlock(target.bx, st.ly, target.bz, 0);
    if (ok === false) {
      st.wait = 'yuk';
      break;
    }
    st.mined += 1;
    st.ci = target.i + 1;
    if (mctx.stats) mctx.stats.drilled = (mctx.stats.drilled || 0) + 1;
    if (drops.length > 0) deliverDrill(st, key, drops, mctx);
    if (mctx.events) {
      mctx.events.push({
        type: 'drilled', x: p[0], y: p[1], z: p[2], bx: target.bx, by: st.ly, bz: target.bz, id: target.id,
        items: drops.map((d) => ({ item: d.item, count: d.count })),
      });
    }
  }
  st.on = worked && !st.stop && st.wait !== 'dolu';
  if (st.stop && mctx.events) {
    mctx.events.push({
      type: 'drillStopped', x: p[0], y: p[1], z: p[2], reason: st.stop, mined: st.mined,
    });
  }
}

/** Matkabı yeniden başlatır (durduktan sonra; ayar değişince ya da "devam"). */
export function resetDrill(st) {
  st.ly = null;
  st.ci = 0;
  st.prog = 0;
  st.stop = null;
  st.blocked = false;
  st.wait = null;
  st.on = false;
}

/* ------------------------------------------------------------------------------------------------
 * Adım
 * ---------------------------------------------------------------------------------------------- */
/**
 * Makineyi dt sn ilerletir. powered: ağ dengesi bu makineyi besledi mi (tampon makinelerde: şarj oluyor mu).
 * Güneş/pil/anahtarlar burada iş yapmaz (üretim/depo techState'te; anahtarlar control adımında).
 */
export function stepMachine(type, st, key, powerArg, dt, mctx) {
  // powerArg: bool ya da 0..1 pay (tampon makineler kısmi beslenebilir: bkz. isPartialLoad)
  const share = st.off ? 0 : typeof powerArg === 'number' ? Math.max(0, Math.min(1, powerArg)) : powerArg ? 1 : 0;
  const powered = share > 0;
  switch (type) {
    case 'gunes':
      if (st.skyT > 0) st.skyT = r3(Math.max(0, st.skyT - dt));
      break;
    case 'jenerator':
      if (st.burnT > 0 && !st.off) {
        st.burnT = r3(Math.max(0, st.burnT - dt));
        if (st.burnT <= 1e-9) {
          st.burnT = 0;
          st.burnTotal = 0;
        }
      }
      break;
    case 'lamba':
      st.on = powered;
      break;
    case 'kapi': {
      if (powered) st.open = true;
      else if (st.open) {
        const p = parseKey(key);
        const blocked = typeof mctx.isOccupied === 'function' && p && mctx.isOccupied(p[0], p[1], p[2]);
        if (!blocked) st.open = false;
      }
      break;
    }
    case 'ocak': {
      st.on = false;
      if (!powered || !furnaceCanWork(st)) break;
      st.on = true;
      st.prog += dt / furnaceTime();
      let guard = 0;
      while (st.prog >= 1 - 1e-9 && furnaceCanWork(st) && guard++ < 64) {
        const rec = furnaceRecipe(st.inItem);
        st.inCount -= rec.inCount;
        if (st.inCount <= 0) {
          st.inItem = null;
          st.inCount = 0;
        }
        st.outItem = rec.out;
        st.outCount += rec.count;
        st.prog -= 1;
        if (mctx.stats) mctx.stats.smelted = (mctx.stats.smelted || 0) + 1;
        if (mctx.events) {
          const p = parseKey(key);
          mctx.events.push({
            type: 'smelted', x: p[0], y: p[1], z: p[2], item: rec.out, count: rec.count,
          });
        }
        if (!st.inItem) st.prog = 0;
      }
      if (st.prog < 0) st.prog = 0;
      st.prog = r3(Math.min(st.prog, 1));
      break;
    }
    case 'matkap':
      stepDrill(st, key, powered, dt, mctx);
      if (!st.stop && typeof mctx.drop === 'function' && st.buf.length > 0) flushDrillBuffer(st, key, mctx, 6);
      break;
    case 'isinlayici':
      if (powered) st.buf = r3(Math.min(R.teleporter.cap, st.buf + R.teleporter.charge * dt * share));
      if (st.cd > 0) st.cd = r3(Math.max(0, st.cd - dt));
      st.on = st.buf >= R.teleporter.minReady;
      break;
    case 'asansor':
      if (powered) st.buf = r3(Math.min(R.lift.cap, st.buf + R.lift.charge * dt * share));
      if (st.cd > 0) st.cd = r3(Math.max(0, st.cd - dt));
      break;
    case 'sarj':
      if (powered) st.buf = r3(Math.min(R.charger.cap, st.buf + R.charger.intake * dt * share));
      break;
    default:
      break;
  }
}

/**
 * Anahtarlar (düğme/sensör): her tick çağrılır. Durum değiştiyse true. mctx.player {x,y,z} ile sensör yakınlığı.
 */
export function controlSwitch(type, st, key, dt, mctx) {
  if (type === 'dugme') {
    if (st.on && st.mode === 'pulse') {
      st.left = r3(Math.max(0, st.left - dt));
      if (st.left <= 0) {
        st.on = false;
        return true;
      }
    }
    return false;
  }
  if (type === 'sensor') {
    const p = parseKey(key);
    const pl = mctx.player;
    let near = false;
    if (p && pl && Number.isFinite(pl.x) && Number.isFinite(pl.y) && Number.isFinite(pl.z)) {
      const dx = pl.x - (p[0] + 0.5);
      const dy = (pl.y + 0.9) - (p[1] + 0.5);
      const dz = pl.z - (p[2] + 0.5);
      near = dx * dx + dy * dy + dz * dz <= st.radius * st.radius;
    }
    if (near !== st.on) {
      st.on = near;
      return true;
    }
  }
  return false;
}

/** Düğmeye basma: açık/kapalı çevirir (pulse modunda açar ve geri sayımı kurar). Yeni açık durumunu döner. */
export function pressButton(st) {
  if (st.mode === 'pulse') {
    st.on = true;
    st.left = R.button.pulse;
  } else {
    st.on = !st.on;
    st.left = 0;
  }
  return st.on;
}
