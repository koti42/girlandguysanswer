/*
 * KEŞİF sim — üretici kayıt defteri (saf; worker-güvenli). Sözleşme §5.
 *
 *   getDimGen(key) → {key, generateChunk(seed,cx,cz,opts), generateSection(seed,cx,cz,si,opts), decorate:null, canGenerate(cx,cz)}
 *       İmza ve dönüş biçimi worldgen.js ile aynıdır (chunk: Chunk; kesit: {blocks:Uint8Array(4096)|null, uniform}).
 *   registerDimGen(key, impl) / unregisterDimGen(key)   özel üretici (test/araç); kayıtlı olan yerleşikten önce gelir
 *   hasDimGen(key) → bool                               üretici şu an çözülebiliyor mu
 *   getCityRules(world?) → {isNaturalFill(x,y,z), isNoBuild(x,y,z)} | null     şehir koruma sorguları (dimRules kullanır)
 *   DIM_GEN_KEYS
 *
 *  - 'overworld': mevcut worldgen.js AYNEN (aynı işlev nesneleri; sıfır davranış değişikliği). `decorate` null: yapılar
 *    World'ün `decorate` seçeneğiyle (structures.decorateChunk) opts üzerinden gelir.
 *  - 'city': sim/city/cityGen.js varsa ona devreder (generateCityChunk / generateCitySection). Çözümleme Vite'ın
 *    `import.meta.glob` kancasıyla yapılır (gameSystems.js ile aynı örüntü): dosya henüz yoksa derleme kırılmaz; üretici çağrısında
 *    açık bir hata fırlar. Şehir kuralları (`isNaturalFill/isNoBuild`) dünyaya `world.cityRules` ile elle de verilebilir.
 */
import { CHUNK_SIZE, WORLD_RADIUS } from '../constants.js';
import { generateChunk as overworldChunk, generateSection as overworldSection } from '../worldgen.js';
import { dimChunkInBounds } from './dimensions.js';

export const DIM_GEN_KEYS = Object.freeze(['overworld', 'city']);

const CS = CHUNK_SIZE;
const CUSTOM = new Map();

let CITY_MODS = null;
try {
  CITY_MODS = import.meta.glob('../city/cityGen.js', { eager: true });
} catch {
  CITY_MODS = null; // Vite dışı (düz node) ortam: registerDimGen('city', ...) kullanılır
}

function cityModule() {
  if (!CITY_MODS) return null;
  const ks = Object.keys(CITY_MODS);
  return ks.length > 0 ? CITY_MODS[ks[0]] : null;
}

function pick(mod, names) {
  for (let i = 0; i < names.length; i++) {
    const f = mod && mod[names[i]];
    if (typeof f === 'function') return f;
  }
  const g = mod && (mod.cityGen || mod.default);
  if (g && typeof g === 'object') {
    for (let i = 0; i < names.length; i++) if (typeof g[names[i]] === 'function') return g[names[i]];
  }
  return null;
}

function cityImpl() {
  const mod = cityModule();
  if (!mod) return null;
  const chunk = pick(mod, ['generateCityChunk', 'generateChunk']);
  const section = pick(mod, ['generateCitySection', 'generateSection']);
  return chunk && section ? { generateChunk: chunk, generateSection: section } : null;
}

const OVERWORLD_GEN = Object.freeze({
  key: 'overworld',
  generateChunk: overworldChunk,
  generateSection: overworldSection,
  decorate: null,
  canGenerate(cx, cz) {
    const mx = cx * CS + 8;
    const mz = cz * CS + 8;
    const lim = WORLD_RADIUS + CS;
    return mx * mx + mz * mz <= lim * lim;
  },
});

const MISSING =
  'Şehir üreticisi (sim/city/cityGen.js: generateCityChunk/generateCitySection) bulunamadı; registerDimGen(\'city\', ...) ile verin.';

/** 'city' → cityGen'e devreden ince katman (çağrı anında çözülür; yoksa açık hata). */
const CITY_GEN = Object.freeze({
  key: 'city',
  generateChunk(seed, cx, cz, opts) {
    const im = CUSTOM.get('city') || cityImpl();
    if (!im) throw new Error(MISSING);
    return im.generateChunk(seed, cx, cz, opts);
  },
  generateSection(seed, cx, cz, si, opts) {
    const im = CUSTOM.get('city') || cityImpl();
    if (!im) throw new Error(MISSING);
    return im.generateSection(seed, cx, cz, si, opts);
  },
  decorate: null,
  canGenerate(cx, cz) {
    const c = CUSTOM.get('city');
    if (c && typeof c.canGenerate === 'function') return !!c.canGenerate(cx, cz);
    return dimChunkInBounds('neon', cx, cz);
  },
});

/** Üretici | atar (bilinmeyen anahtar). */
export function getDimGen(key) {
  if (typeof key === 'string' && CUSTOM.has(key) && key !== 'city') return wrapCustom(key, CUSTOM.get(key));
  if (key === 'overworld') return OVERWORLD_GEN;
  if (key === 'city') return CITY_GEN;
  throw new Error('Bilinmeyen üretici: ' + String(key));
}

function wrapCustom(key, impl) {
  return {
    key,
    generateChunk: impl.generateChunk,
    generateSection: impl.generateSection,
    decorate: impl.decorate || null,
    canGenerate: typeof impl.canGenerate === 'function' ? impl.canGenerate : () => true,
  };
}

/** Özel üretici kaydı (impl: {generateChunk, generateSection, canGenerate?, cityRules?}). */
export function registerDimGen(key, impl) {
  if (typeof key !== 'string' || !impl || typeof impl.generateChunk !== 'function' || typeof impl.generateSection !== 'function') {
    throw new Error('registerDimGen: geçersiz üretici');
  }
  CUSTOM.set(key, impl);
}

export function unregisterDimGen(key) {
  return CUSTOM.delete(key);
}

export function hasDimGen(key) {
  if (key === 'overworld') return true;
  if (key === 'city') return CUSTOM.has('city') || cityImpl() !== null;
  return typeof key === 'string' && CUSTOM.has(key);
}

/**
 * Şehir koruma sorguları. Öncelik: world.cityRules → registerDimGen('city',{cityRules}) → cityGen modülü
 * (`isNaturalFill/isNoBuild`; modül tohuma bağlıysa `cityRulesFor(seed)` ya da 4. argüman olarak tohum). Yoksa null.
 */
export function getCityRules(world) {
  if (world && world.cityRules && typeof world.cityRules.isNaturalFill === 'function') return world.cityRules;
  const c = CUSTOM.get('city');
  if (c && c.cityRules) return c.cityRules;
  const mod = cityModule();
  if (!mod) return null;
  if (world && world._cityMemo) return world._cityMemo;
  const seed = world ? world.seed : 0;
  let rules = null;
  if (typeof mod.cityRulesFor === 'function') {
    const r = mod.cityRulesFor(seed);
    if (r && typeof r.isNaturalFill === 'function') rules = r;
  }
  if (rules === null) {
    const nat = pick(mod, ['isNaturalFill']);
    const nob = pick(mod, ['isNoBuild']);
    if (nat && nob) {
      rules = {
        isNaturalFill: (x, y, z) => !!nat(x, y, z, seed),
        isNoBuild: (x, y, z) => !!nob(x, y, z, seed),
      };
    }
  }
  if (rules !== null && world) world._cityMemo = rules; // dünya başına bir kez kur (setBlock başına ayırma yok)
  return rules;
}
