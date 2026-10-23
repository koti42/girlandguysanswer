/*
 * KEŞİF sim/props — PROP YERLEŞİMİ (saf, belirlenimci, worker-güvenli). Sözleşme KESIF_CITY_CONTRACT §6.
 *
 *   propsForChunk(citySeed, cx, cz, opts?) → Prop[]   (id'ye göre sıralı; aynı girdi → aynı çıktı, sıra/iş parçacığından bağımsız)
 *   Prop = {id:u32, t, x, y, z (1/16 nicemli), yaw 0..3, variant 0..7, flags:u32}   flags & 0xffff = `data` (propDefs üst yorumu)
 *   propIdFor(citySeed, lotId, slot) → u32            (lotId<2^20, slot<4096 iken ÇAKIŞMASIZ: bijektif karıştırma)
 *   normalizeSpec(citySeed, spec) → Prop | null       (PropSpec → Prop; geçersiz/bilinmeyen anahtar → null)
 *   chunkOfProp(prop) → [cx,cz]                       (sahip chunk = çapa hücresinin chunk'ı)
 *   setPlanSource(fn|null)                            testler/galeri için kaynak değiştirir (null = şehir planı)
 *
 * PropSpec (cityplan `getBlockPlan(seed,bi,bj)` → props[] ve streetFurniture[] dizileri; cityBlocks.mkProp):
 *   {kind|key: string (PROP_DEFS anahtarı ya da takma adı; yoksa 'lamba'),
 *    x, y, z: blok koordinatı (y AYAK SEVİYESİ; sokak 64) — çapa = taban merkezi, yaw|rot: 0..3 = prop ÖN yüzünün baktığı yön (cityPlanKit.FACE_YAW ile aynı:
 *    0:+Z (G) 1:+X (D) 2:−Z (K) 3:−X (B)),
 *    variant?: 0..7, data?: 0..65535 (yoksa tabela için seçilir), lotId: tamsayı, slot: lotId içinde benzersiz tamsayı,
 *    district?: bölge anahtarı (tabela/reklam seçimi), brand?|ad?: dükkân/reklam kimliği, sign?: SIGN_ENTRIES indeksi, terminal?: 0..15}
 * Kaynak plan kayıtları yalnız `lotId/slot` ile kimliklenir → aynı planı yeniden üreten hiçbir yazıcı id'leri değiştirmez.
 *
 * `lamps[]` (cityplan: BLOK olarak yazılan sokak lambaları, demir direk + fener 89) varsayılan olarak ALINMAZ (çift çizim olmasın); opts.lamps=true ile
 * `lamba` propu olarak dahil edilir (galeri/iç mekân/prop'u görsel olarak kullanan yazıcı).
 *
 * Seyreltme (kalite kademesi): opts.density (0..1, varsayılan 1) yalnız 'dekor' etiketli tanımları, id hash'ine göre belirlenimci
 * olarak azaltır; 'zorunlu' (lamba, trafik, terminal) asla azalmaz.
 */
import { getBlockPlan } from '../city/cityPlan.js';
import { interiorPropSpecs } from '../city/interior/index.js';
import { elevatorPropSpecs } from '../city/elevators.js';
import { undergroundPropSpecs } from '../city/cityUnderground.js';
import { roofPropSpecs } from '../city/cityRoofs.js';
import { getPropDef } from './propDefs.js';
import { SIGN_COUNT, pickSignIndex, signIndexOf } from './propSigns.js';
import { hash32 } from '../rng.js';
import { NEON_BOUNDS } from '../dim/dimensions.js';

export const PLAN_CHUNK = 16;
/** Şehir ızgara blok hücresi (cityplan getBlockPlan(bi,bj) 80×80). */
export const PLAN_BLOCK = 80;
const INV_Q = 16;
const DATA_MASK = 0xffff;

let SOURCE = null;

/** Testler/galeri için kaynağı değiştirir: fn(citySeed, bi, bj) → {props?, streetFurniture?, lamps?} | null. null = şehir planı (getBlockPlan). */
export function setPlanSource(fn) {
  SOURCE = typeof fn === 'function' ? fn : null;
}

function source() {
  return SOURCE || getBlockPlan;
}

/** (lotId, slot) → u32. lotId<2^20 ve slot<4096 ise bijektiftir (hash32 bijektif; XOR tohum sabiti): hiçbir çakışma olmaz. */
export function propIdFor(citySeed, lotId, slot) {
  const n = (Math.imul(lotId | 0, 4096) + (slot & 4095)) | 0;
  return hash32(n ^ hash32(citySeed | 0)) >>> 0;
}

function q16(v) {
  return Math.round(v * INV_Q) / INV_Q;
}

function pickDataFor(citySeed, d, spec, lotId, slot) {
  if (Number.isInteger(spec.data)) return spec.data & DATA_MASK;
  if (Number.isInteger(spec.flags)) return spec.flags & DATA_MASK;
  if (d.key === 'terminal' || d.key === 'boyut_terminali') {
    return Number.isInteger(spec.terminal) ? spec.terminal & 15 : 0;
  }
  if (d.sign) {
    const kind = d.key === 'billboard' ? 'ad' : 'brand';
    if (Number.isInteger(spec.sign) && spec.sign >= 0 && spec.sign < SIGN_COUNT) return spec.sign;
    if (typeof spec.brand === 'string' && kind === 'brand') {
      const i = signIndexOf('brand', spec.brand);
      if (i >= 0) return i;
    }
    if (typeof spec.ad === 'string' && kind === 'ad') {
      const i = signIndexOf('ad', spec.ad);
      if (i >= 0) return i;
    }
    return pickSignIndex(citySeed, kind, typeof spec.district === 'string' ? spec.district : 'merkez', (lotId * 31 + slot) | 0);
  }
  return 0;
}

/** PropSpec → Prop | null. */
export function normalizeSpec(citySeed, spec) {
  if (!spec || typeof spec !== 'object') return null;
  const d = getPropDef(spec.kind !== undefined ? spec.kind : spec.key !== undefined ? spec.key : 'lamba');
  if (!d) return null;
  const x = +spec.x;
  const y = +spec.y;
  const z = +spec.z;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  const lotId = Number.isInteger(spec.lotId) ? spec.lotId : 0;
  const slot = Number.isInteger(spec.slot) ? spec.slot : 0;
  const rot = spec.rot !== undefined ? spec.rot : spec.yaw !== undefined ? spec.yaw : 0;
  return {
    id: propIdFor(citySeed, lotId, slot),
    t: d.t,
    x: q16(x),
    y: q16(y),
    z: q16(z),
    yaw: Number.isFinite(rot) ? (Math.round(rot) & 3) : 0,
    variant: Number.isFinite(spec.variant) ? (Math.round(spec.variant) & 7) : 0,
    flags: pickDataFor(citySeed, d, spec, lotId, slot) >>> 0,
  };
}

export function chunkOfProp(p) {
  return [Math.floor(p.x / PLAN_CHUNK), Math.floor(p.z / PLAN_CHUNK)];
}

function inBounds(cx, cz) {
  return cx >= NEON_BOUNDS.minCx && cx <= NEON_BOUNDS.maxCx && cz >= NEON_BOUNDS.minCz && cz <= NEON_BOUNDS.maxCz;
}

function collect(out, list, defaultKind) {
  if (!list || typeof list.length !== 'number') return;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (!s) continue;
    if (defaultKind && s.kind === undefined && s.key === undefined) out.push(Object.assign({}, s, { kind: defaultKind }));
    else out.push(s);
  }
}

/**
 * chunk (cx,cz) çapalı proplar. Kaynak blok planları: chunk'ı ±2 blok payla kesen 1–4 blok hücresi (komşu blokta listelenen
 * sokak mobilyası da çapa chunk'ında bulunur); aynı id iki planda geçerse bir kez alınır.
 */
export function propsForChunk(citySeed, cx, cz, opts) {
  const src = source();
  if (!src || !inBounds(cx, cz)) return [];
  const o = opts || {};
  const density = o.density === undefined ? 1 : o.density;
  const withLamps = o.lamps === true;
  const x0 = cx * PLAN_CHUNK;
  const z0 = cz * PLAN_CHUNK;
  const bi0 = Math.floor((x0 - 2) / PLAN_BLOCK);
  const bi1 = Math.floor((x0 + PLAN_CHUNK + 1) / PLAN_BLOCK);
  const bj0 = Math.floor((z0 - 2) / PLAN_BLOCK);
  const bj1 = Math.floor((z0 + PLAN_CHUNK + 1) / PLAN_BLOCK);
  const raw = [];
  for (let bi = bi0; bi <= bi1; bi++) {
    for (let bj = bj0; bj <= bj1; bj++) {
      const plan = src(citySeed, bi, bj);
      if (!plan) continue;
      collect(raw, plan.props, null);
      collect(raw, plan.streetFurniture, null);
      collect(raw, interiorPropSpecs(citySeed, plan, { x0: x0 - 2, z0: z0 - 2, x1: x0 + PLAN_CHUNK + 2, z1: z0 + PLAN_CHUNK + 2 }), null); // Faz 2: iç mekân propları
      collect(raw, elevatorPropSpecs(citySeed, plan, { x0: x0 - 2, z0: z0 - 2, x1: x0 + PLAN_CHUNK + 2, z1: z0 + PLAN_CHUNK + 2 }), null); // Faz 2: kule asansörü durak düğmeleri
      if (withLamps) collect(raw, plan.lamps, 'lamba');
    }
  }
  // Faz 2 (interiors_d): yeraltı proplarını yalnız gerçek şehir planında ekle (sahte kaynaklı testler etkilenmez)
  if (SOURCE === null) {
    const rr = { x0: x0 - 2, z0: z0 - 2, x1: x0 + PLAN_CHUNK + 2, z1: z0 + PLAN_CHUNK + 2 };
    collect(raw, undergroundPropSpecs(citySeed, rr), null);
    collect(raw, roofPropSpecs(citySeed, rr), null);
  }
  const out = [];
  const seen = new Set();
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i];
    // ucuz ön süzgeç (nicemleme ±1/32 oynatabilir); kesin sahiplik nicemli çapaya göre aşağıda
    if (!(s.x >= x0 - 0.05 && s.x < x0 + PLAN_CHUNK + 0.05 && s.z >= z0 - 0.05 && s.z < z0 + PLAN_CHUNK + 0.05)) continue;
    const p = normalizeSpec(citySeed, s);
    if (p === null) continue;
    if (p.x < x0 || p.x >= x0 + PLAN_CHUNK || p.z < z0 || p.z >= z0 + PLAN_CHUNK) continue;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    if (density < 1) {
      const d = getPropDef(p.t);
      if (d && d.tags.indexOf('dekor') >= 0 && d.tags.indexOf('zorunlu') < 0
        && hash32(p.id ^ 0x5d5d5d5d) / 4294967296 >= density) continue;
    }
    out.push(p);
  }
  out.sort((a, b) => a.id - b.id);
  return out;
}
