/*
 * KEŞİF sim/city — şehir PLANLAYICILARININ ortak çekirdeği (saf; worker-güvenli; three/DOM/Math.random/Date.now yok).
 *
 * Sözleşme §1.3: her alt akış `subHash(seed,id,tag)=hash3(id|0,tag|0,0,seed|0)`; paylaşımlı rng YOK. Burada:
 *   TAG                  alt akış etiketleri (her kullanım benzersiz sayı; tablo donmuş)
 *   sh(seed,id,tag)      uint32 hash                  shf(...) → [0,1)           shi(seed,id,tag,n) → 0..n-1
 *   stream(seed,id,tag)  durumlu ama TAMAMEN yerel akış {f(), i(n), r(lo,hi), pick(arr), chance(p)} — her çağrı hash'tir, ortak durum yok
 *   Lru(max)             Map tabanlı LRU (get/set/has/delete/clear/size)
 *   clamp/lerp/imod/rectsOverlap/rectContains
 *
 * Koordinatlar: dünya blok koordinatı, x doğu (+), z güney (+; kuzey = −z), y yukarı. "y" alanları AYAK SEVİYESİDİR (zemin bloğunun
 * üst yüzü): sokak y=64 → asfalt bloğu y=63'tedir.
 */
import { subHash } from '../dim/dimensions.js';

const INV32 = 1 / 4294967296;

/** Alt akış etiketleri — hepsi benzersiz (test: cityPlanKit.test.js). */
export const TAG = Object.freeze({
  SITE_ANG: 0x101, SITE_R: 0x102, WARP_A: 0x103, WARP_B: 0x104, NOISE: 0x105,
  BLOCK_OPEN: 0x201, BLOCK_OPEN_KIND: 0x202, CUT: 0x203, DPLAZA: 0x204, HILL: 0x205, MPLAZA: 0x206,
  RACE_VAR: 0x301, RACE_OFF: 0x302, ROOF_PICK: 0x303, ROOF_FLOORS: 0x304,
  LOT_AXIS: 0x401, LOT_GAP: 0x402, LOT_SPLIT: 0x403, LOT_W: 0x404, LOT_ARCH: 0x405, LOT_BUILT: 0x406, LOT_H: 0x407,
  LOT_MEGA: 0x408, LOT_FRONT: 0x409, LOT_DEPTH: 0x40a, LOT_SET: 0x40b, LOT_OWNER: 0x40c, LOT_ROUTE: 0x40d,
  B_TIER: 0x501, B_STYLE: 0x502, B_ROOF: 0x503, B_SIGN: 0x504, B_ANT: 0x505, B_INT: 0x506, B_DOOR: 0x507, B_CHIP: 0x508,
  B_ITEM: 0x509, B_UNIT: 0x50a, B_GRAF: 0x50b, B_VAR: 0x50c,
  F_LIT: 0x601, F_HUE: 0x602, F_BAY: 0x603, F_PAL: 0x604, F_RIB: 0x605, F_WARM: 0x606,
  P_LAMP: 0x701, P_FURN: 0x702, P_KIND: 0x703, P_PARK: 0x704, P_PLAZA: 0x705, P_PHASE: 0x706, P_PARKUR: 0x707, P_TREE: 0x708,
  U_LAB: 0x801, U_VAULT: 0x802, U_SHAFT: 0x803, U_KIND: 0x804,
  O_HOME: 0x901, O_BLOCK: 0x902, O_LOT: 0x903,
  POI: 0xa01, POI_GRAF: 0xa02, POI_PHOTO: 0xa03, POI_SHELTER: 0xa04, POI_PARK: 0xa05, POI_CHIP: 0xa06, POI_ROOM: 0xa07,
  SKY: 0xb01,
});

/** uint32 alt akış hash'i. */
export function sh(seed, id, tag) {
  return subHash(seed, id, tag) >>> 0;
}

/** [0,1) kayan nokta karşılığı. */
export function shf(seed, id, tag) {
  return (subHash(seed, id, tag) >>> 0) * INV32;
}

/** 0..n-1 tamsayı. */
export function shi(seed, id, tag, n) {
  return Math.floor((subHash(seed, id, tag) >>> 0) * INV32 * n);
}

/**
 * (seed,id,tag)'a bağlı yerel akış. Her değer `sh(seed,id,tag + 0x9e3779b1·n)` — başka hiçbir akışla paylaşılan durum yok;
 * aynı (seed,id,tag) → aynı dizi. Sıra bağımlılığı yalnızca BU akışın kendi çağrı sırasıdır.
 */
export function stream(seed, id, tag) {
  let n = 0;
  const s = {
    u() {
      return subHash(seed, id, (tag + Math.imul(n++, 0x9e3779b1)) | 0) >>> 0;
    },
    f() {
      return s.u() * INV32;
    },
    /** 0..k-1 */
    i(k) {
      return Math.floor(s.f() * k);
    },
    /** lo..hi (dahil) */
    r(lo, hi) {
      return lo + Math.floor(s.f() * (hi - lo + 1));
    },
    pick(arr) {
      return arr[Math.floor(s.f() * arr.length)];
    },
    chance(p) {
      return s.f() < p;
    },
    /** Ağırlıklı seçim: weights[i] > 0 olanlardan; hepsi 0 ise -1. */
    weighted(weights) {
      let total = 0;
      for (let i = 0; i < weights.length; i++) if (weights[i] > 0) total += weights[i];
      if (total <= 0) return -1;
      let x = s.f() * total;
      for (let i = 0; i < weights.length; i++) {
        const w = weights[i];
        if (!(w > 0)) continue;
        if (x < w) return i;
        x -= w;
      }
      return weights.length - 1;
    },
  };
  return s;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Negatif sayılarda da 0..m-1 dönen mod. */
export function imod(a, m) {
  return ((a % m) + m) % m;
}

/** [x0,x1)×[z0,z1) dikdörtgenleri kesişiyor mu (kenar paylaşımı kesişim DEĞİL). */
export function rectsOverlap(a, b) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
}

export function rectContains(r, x, z) {
  return x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;
}

/** Basit LRU (Map ekleme sırası). get() erişileni sona taşır. */
export class Lru {
  constructor(max) {
    this.max = max > 0 ? max | 0 : 1;
    this.map = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  get size() {
    return this.map.size;
  }

  has(k) {
    return this.map.has(k);
  }

  get(k) {
    const m = this.map;
    if (!m.has(k)) {
      this.misses++;
      return undefined;
    }
    const v = m.get(k);
    m.delete(k);
    m.set(k, v);
    this.hits++;
    return v;
  }

  set(k, v) {
    const m = this.map;
    if (m.has(k)) m.delete(k);
    m.set(k, v);
    while (m.size > this.max) m.delete(m.keys().next().value);
    return v;
  }

  delete(k) {
    return this.map.delete(k);
  }

  clear() {
    this.map.clear();
  }
}

/**
 * Prop yönü (sim/props sözleşmesi): yaw k → yerel +Z'nin baktığı yön: 0 +Z (G), 1 +X (D), 2 −Z (K), 3 −X (B).
 * FACE_YAW[yüz] = o yüze (K/D/G/B) BAKAN prop yaw'ı; yawOfFacing(i) = i ∈ {0 K, 1 D, 2 G, 3 B} yönüne bakan yaw.
 */
export const FACE_YAW = Object.freeze({ n: 2, e: 1, s: 0, w: 3 });
const YAW_OF_FACING = Object.freeze([2, 1, 0, 3]);
export function yawOfFacing(i) {
  return YAW_OF_FACING[i & 3];
}

/** Blok anahtarı: bi,bj ∈ [-10, 9] → 0..399. */
export function blockKey(bi, bj) {
  return (bj + 10) * 20 + (bi + 10);
}
