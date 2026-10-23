/*
 * KEŞİF bulmaca altyapısı — kayıt defteri (saf; DOM/three yok, worker-güvenli).
 *
 * `registerPuzzle(type, impl)` bulmaca tipini kaydeder; `getPuzzle(type)` normalleştirilmiş uygulamayı döner.
 * Bu dosya BİLEREK index.js'ten ayrıdır: bulmaca modülleri `./index.js` içinden `registerPuzzle` alır, index.js ise
 * bulmaca modüllerini yükler (dairesel içe aktarma); kayıt defteri burada, her iki taraftan da önce
 * değerlendirilen bağımsız bir modülde durduğu için döngü güvenlidir.
 */

/** Sözleşmedeki 11 kurallı tip anahtarı (ASCII). Sıra SABİTTİR: belirlenimli seçim bu sıraya dayanır. */
export const PUZZLE_TYPES = Object.freeze([
  'basincplakasi',
  'runedizisi',
  'renkkollari',
  'isinayna',
  'itilebilirblok',
  'hareketliplatform',
  'golgekopru',
  'portaloda',
  'terazi',
  'kodkilidi',
  'suakisi',
]);

const REGISTRY = new Map();
/** Kayıt sırası (kurallı olmayan ek tipler için). */
const EXTRA_ORDER = [];

const TYPE_RE = /^[a-z][a-z0-9]*$/;
const REQUIRED_FUNCS = ['footprint', 'build', 'restore', 'interact', 'isSolved'];

function noopTick(ctx, state) {
  return { state, effects: [] };
}

function noopHint() {
  return '';
}

/**
 * Bulmaca tipini kaydeder (aynı tip yeniden kaydedilirse değiştirilir). Eksik/yanlış arayüzde açık hata fırlatır.
 * Döner: normalleştirilmiş (dondurulmuş) uygulama.
 *
 * impl: { type?, name, summary?, difficultyRange?:[min,max], footprint(d), build(ctx), restore(ctx,state),
 *         interact(ctx,state,ev), tick?(ctx,state,dt), isSolved(state), hint?(state) }
 */
export function registerPuzzle(type, impl) {
  if (typeof type !== 'string' || !TYPE_RE.test(type)) {
    throw new TypeError('registerPuzzle: tip anahtarı küçük harfli ASCII olmalı: ' + String(type));
  }
  if (!impl || typeof impl !== 'object') {
    throw new TypeError('registerPuzzle(' + type + '): impl nesne olmalı');
  }
  if (impl.type !== undefined && impl.type !== type) {
    throw new TypeError('registerPuzzle(' + type + '): impl.type uyuşmuyor: ' + String(impl.type));
  }
  for (let i = 0; i < REQUIRED_FUNCS.length; i++) {
    if (typeof impl[REQUIRED_FUNCS[i]] !== 'function') {
      throw new TypeError('registerPuzzle(' + type + '): "' + REQUIRED_FUNCS[i] + '" işlevi eksik');
    }
  }
  if (typeof impl.name !== 'string' || impl.name.length === 0) {
    throw new TypeError('registerPuzzle(' + type + '): Türkçe "name" gerekli');
  }
  let range = [1, 5];
  if (impl.difficultyRange !== undefined) {
    const r = impl.difficultyRange;
    if (!Array.isArray(r) || r.length !== 2 || !Number.isInteger(r[0]) || !Number.isInteger(r[1])
      || r[0] < 1 || r[1] > 5 || r[0] > r[1]) {
      throw new RangeError('registerPuzzle(' + type + '): difficultyRange [min,max] 1..5 olmalı');
    }
    range = [r[0], r[1]];
  }
  const norm = Object.freeze(Object.assign({}, impl, {
    type,
    summary: typeof impl.summary === 'string' ? impl.summary : '',
    difficultyRange: Object.freeze(range),
    tick: typeof impl.tick === 'function' ? impl.tick : noopTick,
    hint: typeof impl.hint === 'function' ? impl.hint : noopHint,
  }));
  if (!REGISTRY.has(type) && PUZZLE_TYPES.indexOf(type) < 0) EXTRA_ORDER.push(type);
  REGISTRY.set(type, norm);
  return norm;
}

/** Kayıtlı uygulama ya da null. */
export function getPuzzle(type) {
  return REGISTRY.get(type) || null;
}

/** Kayıtlı mı? */
export function hasPuzzle(type) {
  return REGISTRY.has(type);
}

/** Tip kaydını siler (testler için). Silindiyse true. */
export function unregisterPuzzle(type) {
  const had = REGISTRY.delete(type);
  const i = EXTRA_ORDER.indexOf(type);
  if (i >= 0) EXTRA_ORDER.splice(i, 1);
  return had;
}

/**
 * Kayıtlı tiplerin BELİRLENİMLİ sıralı listesi: önce kurallı 11 (sabit sıra), sonra ek tipler (alfabetik).
 * İçe aktarma/kayıt sırasından bağımsızdır → aynı seed her zaman aynı bulmacayı seçer.
 */
export function registeredPuzzleTypes() {
  const out = [];
  for (let i = 0; i < PUZZLE_TYPES.length; i++) if (REGISTRY.has(PUZZLE_TYPES[i])) out.push(PUZZLE_TYPES[i]);
  const extra = EXTRA_ORDER.filter((t) => REGISTRY.has(t)).sort();
  for (let i = 0; i < extra.length; i++) out.push(extra[i]);
  return out;
}

/** Zorluk d (1..5) için uygun kayıtlı tip anahtarları (belirlenimli sıralı). */
export function puzzleTypesForDifficulty(d) {
  const diff = Number(d);
  const all = registeredPuzzleTypes();
  const out = [];
  for (let i = 0; i < all.length; i++) {
    const r = REGISTRY.get(all[i]).difficultyRange;
    if (diff >= r[0] && diff <= r[1]) out.push(all[i]);
  }
  return out;
}

/** Zorluğu tipin aralığına sıkıştırır (tam sayı). */
export function clampDifficulty(impl, d) {
  const r = impl && impl.difficultyRange ? impl.difficultyRange : [1, 5];
  let v = Math.round(Number(d));
  if (!Number.isFinite(v)) v = r[0];
  return Math.max(r[0], Math.min(r[1], v));
}
