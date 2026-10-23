/*
 * KEŞİF sim — tohumlu rastgelelik (saf).
 *
 * Sim'de Math.random/Date.now YASAK: aynı seed → aynı dünya. Tüm rastgelelik buradan gelir.
 *  - mulberry32(seed)        hızlı 32-bit PRNG (kapanış); [0,1) döner
 *  - hash32/hash2/hash3      tamsayı kafes hash'leri (uint32); chunk/hücre tabanlı belirlenimci seçimler için
 *  - seededRandom(seed)      durumu dışarı alınabilir nesne (next/int/pick/chance/shuffle…)
 *  - Dünya Kodu              base36 8 hane; parseWorldCode → uint32 seed
 */

const TWO32 = 4294967296;

/** mulberry32: kapanış, her çağrıda [0,1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / TWO32;
  };
}

/** murmur3 fmix32 tabanlı karıştırıcı; hash32(0) ≠ 0. */
export function hash32(x) {
  let h = (x + 0x9e3779b9) | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** 2B tamsayı kafes hash'i (uint32). */
export function hash2(x, z, seed = 0) {
  let h = hash32((seed | 0) + Math.imul(x | 0, 0x27d4eb2f));
  h = hash32(h + Math.imul(z | 0, 0x165667b1));
  return h;
}

/** 3B tamsayı kafes hash'i (uint32). */
export function hash3(x, y, z, seed = 0) {
  let h = hash32((seed | 0) + Math.imul(x | 0, 0x27d4eb2f));
  h = hash32(h + Math.imul(y | 0, 0x9e3779b1));
  h = hash32(h + Math.imul(z | 0, 0x165667b1));
  return h;
}

/** hash2/hash3'ün [0,1) kayan nokta karşılıkları. */
export function hash2f(x, z, seed = 0) {
  return hash2(x, z, seed) / TWO32;
}
export function hash3f(x, y, z, seed = 0) {
  return hash3(x, y, z, seed) / TWO32;
}

/** Metin (veya herhangi bir değer) → uint32 tohum (FNV-1a + son karıştırma). */
export function stringSeedToInt(str) {
  const s = String(str);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return hash32(h);
}

/** Sayı → uint32 (NaN/Infinity → 0); metin → stringSeedToInt. */
export function toSeedInt(seed) {
  if (typeof seed === 'number') {
    return Number.isFinite(seed) ? (Math.floor(seed) >>> 0) : 0;
  }
  if (seed === null || seed === undefined) return 0;
  return stringSeedToInt(seed);
}

/**
 * Durumu alınıp geri yüklenebilen PRNG nesnesi.
 * int(min,max) iki ucu da dahil; float(min,max) [min,max).
 */
export function seededRandom(seed) {
  let a = toSeedInt(seed);
  const rng = {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / TWO32;
    },
    int(min, max) {
      if (max === undefined) {
        max = min;
        min = 0;
      }
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      if (hi <= lo) return lo;
      return lo + Math.floor(rng.next() * (hi - lo + 1));
    },
    float(min = 0, max = 1) {
      return min + rng.next() * (max - min);
    },
    pick(arr) {
      if (!arr || arr.length === 0) return undefined;
      return arr[Math.floor(rng.next() * arr.length)];
    },
    chance(p) {
      return rng.next() < p;
    },
    /** Yerinde Fisher–Yates; aynı diziyi döner. */
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
      }
      return arr;
    },
    /** Ağırlık dizisinden indeks seçer (negatif/NaN ağırlık 0 sayılır); hepsi 0 ise -1. */
    weighted(weights) {
      let total = 0;
      for (let i = 0; i < weights.length; i++) {
        const w = weights[i];
        if (w > 0) total += w;
      }
      if (total <= 0) return -1;
      let r = rng.next() * total;
      for (let i = 0; i < weights.length; i++) {
        const w = weights[i];
        if (!(w > 0)) continue;
        if (r < w) return i;
        r -= w;
      }
      return weights.length - 1;
    },
    /** Bu akıştan bağımsız, etiketle türetilmiş yeni akış (ana akışı ilerletmez). */
    fork(label) {
      return seededRandom(hash32(a ^ stringSeedToInt(label)));
    },
    getState() {
      return a;
    },
    setState(s) {
      a = s >>> 0;
    },
  };
  return rng;
}

/* ------------------------------------------------------------------------------------------------
 * Dünya Kodu: base36, 8 hane (BÜYÜK harf). 36^8 ≈ 2,8e12 > 2^32; seed'e katlanarak indirgenir.
 * ---------------------------------------------------------------------------------------------- */
const CODE_LEN = 8;
const CODE_RE = /^[0-9A-Z]{8}$/;
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** rng: {next()} nesnesi ya da () => [0,1) fonksiyonu. */
export function makeWorldCode(rng) {
  const nx = typeof rng === 'function' ? rng : () => rng.next();
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    out += DIGITS.charAt(Math.min(35, Math.floor(nx() * 36)));
  }
  return out;
}

/** Kullanıcı girdisini temizler (boşluk/tire/küçük harf); geçerli değilse null. */
export function normalizeWorldCode(code) {
  if (typeof code !== 'string') return null;
  const c = code.replace(/[\s-]+/g, '').toUpperCase();
  return CODE_RE.test(c) ? c : null;
}

/** Dünya Kodu → uint32 seed (belirlenimci); geçersizse null. */
export function parseWorldCode(code) {
  const c = normalizeWorldCode(code);
  if (!c) return null;
  const n = parseInt(c, 36); // < 2^53, tam
  const lo = n % TWO32;
  const hi = Math.floor(n / TWO32);
  return hash32((lo ^ hash32(hi + 0x51ed270b)) | 0);
}

/**
 * Oyuncu girdisi (kod, sayı ya da serbest metin) → uint32 seed.
 * Geçerli Dünya Kodu ise parseWorldCode, sayı ise kendisi, aksi halde metin hash'i.
 */
export function seedFromInput(input) {
  if (typeof input === 'number') return toSeedInt(input);
  if (typeof input === 'string') {
    const fromCode = parseWorldCode(input);
    if (fromCode !== null) return fromCode;
    const t = input.trim();
    if (/^\d{1,10}$/.test(t)) return toSeedInt(Number(t));
    return stringSeedToInt(t);
  }
  return toSeedInt(input);
}
