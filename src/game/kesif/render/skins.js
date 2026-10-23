/*
 * KEŞİF — Mağaza görünümleri (Keşif Koleksiyonu) → motor PARAMETRELERİ. Saf: three/DOM/ağ yok, tahsis yalnız çözümleme anında.
 *
 *   resolveSkin(slot, key)            → donmuş skin | null      (null = varsayılan görünüm; bilinmeyen/bozuk her şey sessizce null)
 *   resolveSkinSet(loadout, env?)     → donmuş küme {portal,alet,asa,jet,arac,gecis, anim, key}   env: {tier, reduced}
 *   applySkinToSpec(spec, skin)       → yeni (önbellekli) eşya tarifi; önbellekli itemSpec nesnesi DONMUŞ KALIR
 *   skinForKind(set, kind)            → model türüne (portalgun/pick/axe/shovel/staff/jetpack) uyan skin | null
 *   animAllowed(tier, reduced)        → ton döngüsü/nabız açık mı (low kademe ve kısıtlı harekette KAPALI)
 *   hueRotate(rgb, turn) · lerpRgb(a, b, t) · lstar(rgb) · hueOf(rgb)   küçük renk yardımcıları (tahsissiz)
 *
 * Skin yalnızca renk / emissive / iz rengi / halka rengi gibi sayıl parametredir: yeni malzeme TÜRÜ, shader, geometri
 * ya da çizim çağrısı eklemez (K16). Salt kozmetik: sim, fizik, istatistik, kayıt ve belirlenimlilik ETKİLENMEZ.
 * Veri kaynağı: src/game/shop/designs/kesif.js (tek doğruluk kaynağı; '#RRGGBB' → 0xRRGGBB bir kez, Object.freeze).
 * Portal çifti şekille de ayrışır (düz / kesikli halka — techPortalVisual `kind` ASLA değişmez); ayrıca renk çifti
 * parlaklık (CIE L*) farkı ≥ 25 veya ton farkı ≥ 60° değilse skin reddedilir (renk körü oyuncu için).
 */
import { KESIF } from '../../shop/designs/kesif.js';

export const SKIN_SLOTS = Object.freeze(['portal', 'alet', 'asa', 'jet', 'arac', 'gecis']);

/** Model türü → yuva. */
const KIND_SLOT = Object.freeze({
  portalgun: 'portal', pick: 'alet', axe: 'alet', shovel: 'alet', staff: 'asa', jetpack: 'jet',
});

const HEX = /^#[0-9A-Fa-f]{6}$/;
const hexInt = (s) => (typeof s === 'string' && HEX.test(s) ? parseInt(s.slice(1), 16) : -1);
const isNum = (n, lo, hi) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;

/* ---------------------------------------------------------------- renk yardımcıları */
const chan = (c, sh) => (c >> sh) & 255;

/** 0xRRGGBB → ton (0..360), gri için 0. */
export function hueOf(c) {
  const r = chan(c, 16) / 255;
  const g = chan(c, 8) / 255;
  const b = chan(c, 0) / 255;
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  if (d < 1e-6) return 0;
  let h;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

const lin = (v) => {
  const x = v / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};
/** CIE L* (0..100). */
export function lstar(c) {
  const y = 0.2126 * lin(chan(c, 16)) + 0.7152 * lin(chan(c, 8)) + 0.0722 * lin(chan(c, 0));
  const f = y > 0.008856 ? Math.cbrt(y) : 7.787 * y + 16 / 116;
  return 116 * f - 16;
}

/** İki rengi (0xRRGGBB) ayırt etmek için yeterli fark var mı: ΔL* ≥ 25 veya ton farkı ≥ 60°. */
export function distinguishable(a, b) {
  const dl = Math.abs(lstar(a) - lstar(b));
  let dh = Math.abs(hueOf(a) - hueOf(b));
  if (dh > 180) dh = 360 - dh;
  return dl >= 25 || dh >= 60;
}

/** Doğrusal renk karışımı (0xRRGGBB). */
export function lerpRgb(a, b, t) {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const r = Math.round(chan(a, 16) + (chan(b, 16) - chan(a, 16)) * k);
  const g = Math.round(chan(a, 8) + (chan(b, 8) - chan(a, 8)) * k);
  const bl = Math.round(chan(a, 0) + (chan(b, 0) - chan(a, 0)) * k);
  return (r << 16) | (g << 8) | bl;
}

/** Tonu `turn` (0..1 tur) kadar döndürür; parlaklık/doygunluk korunur (HSV). */
export function hueRotate(c, turn) {
  const r = chan(c, 16) / 255;
  const g = chan(c, 8) / 255;
  const b = chan(c, 0) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  if (d < 1e-6) return c;
  let h = hueOf(c) / 360 + turn;
  h -= Math.floor(h);
  const s = d / mx;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = mx * (1 - s);
  const q = mx * (1 - f * s);
  const t = mx * (1 - (1 - f) * s);
  let o;
  switch (i % 6) {
    case 0: o = [mx, t, p]; break;
    case 1: o = [q, mx, p]; break;
    case 2: o = [p, mx, t]; break;
    case 3: o = [p, q, mx]; break;
    case 4: o = [t, p, mx]; break;
    default: o = [mx, p, q]; break;
  }
  return (Math.round(o[0] * 255) << 16) | (Math.round(o[1] * 255) << 8) | Math.round(o[2] * 255);
}

/** Ton döngüsü/nabız yalnız low-dışı kademede ve kısıtlı hareket kapalıyken. */
export function animAllowed(tier, reduced) {
  return tier !== 'low' && !reduced;
}

/* ---------------------------------------------------------------- slot çözücüler (bozuk veri → null) */
function rgbOrNull(s) {
  const v = hexInt(s);
  return v < 0 ? null : v;
}

function portalSkin(s) {
  if (!s || typeof s !== 'object') return null;
  const body = hexInt(s.body);
  const trim = hexInt(s.trim);
  const a = s.a && typeof s.a === 'object' ? { c: hexInt(s.a.c), c2: hexInt(s.a.c2) } : null;
  const b = s.b && typeof s.b === 'object' ? { c: hexInt(s.b.c), c2: hexInt(s.b.c2) } : null;
  if (body < 0 || trim < 0 || !a || !b || a.c < 0 || a.c2 < 0 || b.c < 0 || b.c2 < 0) return null;
  if (!distinguishable(a.c, b.c)) return null; // renk körü: iki portal ayırt edilemiyorsa varsayılan görünüm
  return { body, trim, a: Object.freeze(a), b: Object.freeze(b) };
}

const PAL_COLORS = ['head', 'light', 'dark', 'edge', 'handle', 'handleDark', 'wrap'];
function aletSkin(s) {
  const p = s && typeof s === 'object' ? s.palette : null;
  if (!p || typeof p !== 'object') return null;
  const out = {};
  for (let i = 0; i < PAL_COLORS.length; i++) {
    const v = hexInt(p[PAL_COLORS[i]]);
    if (v < 0) return null;
    out[PAL_COLORS[i]] = v;
  }
  if (p.glow === null || p.glow === undefined) out.glow = null;
  else {
    const gl = hexInt(p.glow);
    if (gl < 0) return null;
    out.glow = gl;
  }
  if (!isNum(p.rough, 0, 1) || !isNum(p.metal, 0, 1)) return null;
  out.rough = p.rough;
  out.metal = p.metal;
  out.emitOnly = true; // glow yalnız emissive rengi; ek mesh yok (heldItemsTools.toolMats)
  return { palette: Object.freeze(out) };
}

function asaSkin(s) {
  if (!s || typeof s !== 'object') return null;
  const crystal = hexInt(s.crystal);
  if (crystal < 0) return null;
  const ring = s.ring === undefined || s.ring === null ? null : rgbOrNull(s.ring);
  if (s.ring !== undefined && s.ring !== null && ring === null) return null;
  return { crystal, ring, cycle: s.cycle === true };
}

function jetSkin(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.flame) || s.flame.length !== 3) return null;
  const flame = s.flame.map(hexInt);
  const smoke = hexInt(s.smoke);
  if (flame.some((v) => v < 0) || smoke < 0) return null;
  const tank = s.tank === undefined || s.tank === null ? null : rgbOrNull(s.tank);
  if (s.tank !== undefined && s.tank !== null && tank === null) return null;
  return { flame: Object.freeze(flame), smoke, tank, spark: s.spark === true };
}

function aracSkin(s) {
  if (!s || typeof s !== 'object') return null;
  const body = hexInt(s.body);
  const accent = hexInt(s.accent);
  const neon = hexInt(s.neon);
  if (body < 0 || accent < 0 || neon < 0) return null;
  if (!Number.isInteger(s.under) || s.under < 0 || s.under > 2) return null;
  if (!Number.isInteger(s.wheels) || s.wheels < 0 || s.wheels > 3) return null;
  const rim = s.rim === undefined || s.rim === null ? null : rgbOrNull(s.rim);
  if (s.rim !== undefined && s.rim !== null && rim === null) return null;
  let nitro = null;
  if (s.nitro !== undefined && s.nitro !== null) {
    if (!Array.isArray(s.nitro) || s.nitro.length !== 2) return null;
    nitro = s.nitro.map(hexInt);
    if (nitro.some((v) => v < 0)) return null;
    nitro = Object.freeze(nitro);
  }
  return {
    body, accent, neon, under: s.under, wheels: s.wheels, rim, nitro, cycle: s.cycle === true,
  };
}

function gecisSkin(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.ring) || s.ring.length !== 2) return null;
  const ring = s.ring.map(hexInt);
  if (ring.some((v) => v < 0)) return null;
  const spark = s.spark === undefined || s.spark === null ? null : rgbOrNull(s.spark);
  if (s.spark !== undefined && s.spark !== null && spark === null) return null;
  return { ring: Object.freeze(ring), spark };
}

const BUILD = {
  portal: portalSkin, alet: aletSkin, asa: asaSkin, jet: jetSkin, arac: aracSkin, gecis: gecisSkin,
};

/* ---------------------------------------------------------------- kayıt ve önbellek (üst sınır = kayıt boyutu) */
let byKey = null;
const resolved = new Map(); // anahtar → skin | null (yalnız kayıtlı anahtarlar; boyut ≤ öğe sayısı)

function registry() {
  if (!byKey) {
    byKey = new Map();
    const list = Array.isArray(KESIF) ? KESIF : [];
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (d && typeof d.id === 'string' && typeof d.kind === 'string') byKey.set(d.id, { design: d, n: i + 1 });
    }
  }
  return byKey;
}

/** Ham skin verisi → doğrulanmış parametre nesnesi | null (bozuk veri). Test/teşhis; çözücü bunu kullanır. */
export function validateSkinData(slot, data) {
  const fn = typeof slot === 'string' && Object.prototype.hasOwnProperty.call(BUILD, slot) ? BUILD[slot] : null;
  if (!fn) return null;
  try {
    return fn(data) || null;
  } catch {
    return null;
  }
}

/** Kayıtlı Keşif görünüm anahtarları (test/teşhis). */
export function skinKeys() {
  return Array.from(registry().keys());
}

/** (yuva, anahtar) → donmuş skin | null. Bilinmeyen anahtar, yanlış yuva, bozuk veri → null (sessiz). */
export function resolveSkin(slot, key) {
  if (typeof slot !== 'string' || typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(BUILD, slot)) return null;
  const hit = registry().get(key);
  if (!hit || hit.design.kind !== slot) return null;
  if (resolved.has(key)) return resolved.get(key);
  const raw = validateSkinData(slot, hit.design.skin);
  const sk = raw ? Object.freeze(Object.assign({ slot, key, n: hit.n }, raw)) : null;
  resolved.set(key, sk);
  return sk;
}

const EMPTY_SET = Object.freeze({
  portal: null, alet: null, asa: null, jet: null, arac: null, gecis: null, anim: false, key: '',
});

/** Yük nesnesi (+ ortam) → donmuş skin kümesi. Geçersiz girdi → boş küme. */
export function resolveSkinSet(loadout, env) {
  const e = env || {};
  const anim = animAllowed(e.tier, !!e.reduced);
  const out = { anim };
  const parts = [];
  let any = false;
  const src = loadout && typeof loadout === 'object' ? (loadout.loadout && typeof loadout.loadout === 'object' ? loadout.loadout : loadout) : null;
  for (let i = 0; i < SKIN_SLOTS.length; i++) {
    const s = SKIN_SLOTS[i];
    const sk = src ? resolveSkin(s, src[s]) : null;
    out[s] = sk;
    if (sk) any = true;
    parts.push(sk ? sk.key : '');
  }
  if (!any) return EMPTY_SET;
  out.key = parts.join('|') + (anim ? '+a' : '');
  return Object.freeze(out);
}

export const emptySkinSet = () => EMPTY_SET;

/** Model türü için kümeden skin (yoksa null). */
export function skinForKind(set, kind) {
  const slot = KIND_SLOT[kind];
  return slot && set ? set[slot] || null : null;
}

/** Skin'in önbellek anahtarı (modelde userData.skinKey). */
export function skinKey(skin) {
  return skin ? skin.key : '';
}

const specCache = new Map();
const SPEC_CAP = 96;

/**
 * Eşya tarifine skin uygular: yeni, donmuş nesne (girdi spec DEĞİŞMEZ). Yalnız portal tabancası, kazma/balta/kürek, büyü asası
 * ve jetpack skinlenir (kılıç/yay/ışın tüfeği/kalkan HİÇ). Uygun değilse aynı spec döner.
 */
export function applySkinToSpec(spec, skin) {
  if (!spec || !skin) return spec;
  const slot = KIND_SLOT[spec.kind];
  if (!slot || skin.slot !== slot) return spec;
  const ck = spec.key + '|' + skin.key;
  const hit = specCache.get(ck);
  if (hit) return hit;
  const o = Object.assign({}, spec, { skin });
  if (slot === 'alet') o.palette = skin.palette;
  else if (slot === 'asa') o.color = skin.crystal;
  else if (slot === 'jet' && skin.tank !== null) o.color = skin.tank;
  const frozen = Object.freeze(o);
  if (specCache.size >= SPEC_CAP) specCache.clear();
  specCache.set(ck, frozen);
  return frozen;
}

/** Önbellekleri boşaltır (oyun kapanışı/test). */
export function clearSkinCaches() {
  specCache.clear();
  resolved.clear();
}
