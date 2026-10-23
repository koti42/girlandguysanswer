/*
 * KEŞİF sim/city — ŞEHİR YAZICI ÇEKİRDEĞİ (saf; DOM/three/Math.random/Date.now yok; worker-güvenli). Sözleşme §7 "Kurallar".
 *
 * Bir `CityWriter` tek bir blok penceresine (bir chunk'ın y aralığı ya da tek bir derin kesit) bağlanır; yazıcılar DÜNYA koordinatı ile
 * çalışır, pencere dışını sessizce atar. Böylece her yapı tüm planı çalıştırır ama yalnız o chunk'ın dilimini yazar (chunk = bölüt belirlenimciliği).
 *
 *   new CityWriter(blocks, x0, z0, yBase, height)   blocks: Uint8Array(height·256), indeks ((y−yBase)<<8)+(lz<<4)+lx; (x0,z0) chunk başlangıcı
 *   w.set(x,y,z,id) · w.get(x,y,z) · w.box(xa,ya,za,xb,yb,zb,id)  [a,b) yarı açık kutu · w.col(x,z,ya,yb,id) · w.touches(xa,za,xb,za) hızlı kesişim
 *   w.boxAir(...)   yalnız hava hücrelerini doldurur · w.clearBox(...) = box(…,0)
 *   w.chunkRect → {x0,z0,x1,z1}
 *
 * Arayüz (Faz 2 sahipleri): `sim/city/interior/index.js` `emitBuildingInterior(w, buildingPlan, lot)` dışa açarsa cityGen yapı kabuğundan SONRA çağırır;
 * w aynı CityWriter'dır (dünya koordinatı, pencere kırpması otomatik).
 */
import { B } from '../blocks.js';

/** Şehir yazıcılarının kullandığı blok kimlikleri (blocks.js B tablosundan; tek yerde toplanır). */
export const ID = Object.freeze({
  AIR: 0,
  STONE: B.STONE,
  COBBLE: B.COBBLE,
  DIRT: B.DIRT,
  GRASS: B.GRASS,
  SAND: B.SAND,
  GRAVEL: B.GRAVEL,
  BASALT: B.BASALT,
  WATER: B.WATER,
  BRICK: B.BRICK,
  STONE_BRICK: B.STONE_BRICK,
  POLISHED: B.POLISHED,
  PILLAR: B.PILLAR,
  GLASS: B.GLASS,
  SLAB: B.SLAB,
  FENCE: B.FENCE,
  LANTERN: B.LANTERN,
  LIGHT: B.LIGHT_BLOCK,
  IRON: B.IRON_BLOCK,
  LADDER: B.LADDER,
  WHITE: B.CONCRETE_WHITE,
  BLACK: B.CONCRETE_BLACK,
  RED: B.CONCRETE_RED,
  ORANGE: B.CONCRETE_ORANGE,
  YELLOW: B.CONCRETE_YELLOW,
  GREEN: B.CONCRETE_GREEN,
  BLUE: B.CONCRETE_BLUE,
  PURPLE: B.CONCRETE_PURPLE,
  ASPHALT: B.ASPHALT,
  LANE_X: B.LANE_X,
  LANE_Z: B.LANE_Z,
  ZEBRA_X: B.ZEBRA_X,
  ZEBRA_Z: B.ZEBRA_Z,
  SIDEWALK: B.SIDEWALK,
  NEON_CYAN: B.NEON_CYAN,
  NEON_PINK: B.NEON_PINK,
  NEON_AMBER: B.NEON_AMBER,
  NEON_LIME: B.NEON_LIME,
  WINDOW_DARK: B.WINDOW_DARK,
  WINDOW_WARM: B.WINDOW_WARM,
  WINDOW_COOL: B.WINDOW_COOL,
  FACADE_DARK: B.FACADE_DARK,
  FACADE_LIGHT: B.FACADE_LIGHT,
  HOLO: B.HOLO_PANEL,
  DOOR: B.SLIDING_DOOR,
  DOOR_OPEN: B.SLIDING_DOOR_OPEN,
});

/** Dikey sabitler (sözleşme §7): sokak ayak seviyesi 64 → yüzey bloğu y63; taş 0..60, beton 61–62. */
export const Y = Object.freeze({
  STONE_TOP: 60,
  CONCRETE_LO: 61,
  CONCRETE_HI: 62,
  SURFACE: 63,
  FOOT: 64,
  WATER_TOP: 58,
  BED: 43,
});

/** Neon ton indeksi (0 camgöbeği … 3 limon) → blok. */
export const NEON_BY_HUE = Object.freeze([ID.NEON_CYAN, ID.NEON_PINK, ID.NEON_AMBER, ID.NEON_LIME]);

export class CityWriter {
  /**
   * @param {Uint8Array} blocks pencere dizisi
   * @param {number} x0 chunk başlangıç x (dünya)
   * @param {number} z0 chunk başlangıç z (dünya)
   * @param {number} yBase pencerenin en alçak mutlak y'si
   * @param {number} height pencere yüksekliği (satır)
   */
  constructor(blocks, x0, z0, yBase, height) {
    this.blocks = blocks;
    this.x0 = x0;
    this.z0 = z0;
    this.x1 = x0 + 16;
    this.z1 = z0 + 16;
    this.yBase = yBase;
    this.yEnd = yBase + height;
  }

  /** Pencereyi yeniden bağlar (aynı dizi, başka chunk/kesit). */
  rebind(x0, z0, yBase, height) {
    this.x0 = x0;
    this.z0 = z0;
    this.x1 = x0 + 16;
    this.z1 = z0 + 16;
    this.yBase = yBase;
    this.yEnd = yBase + height;
    return this;
  }

  /** [xa,xb)×[za,zb) dikdörtgeni bu chunk ile kesişiyor mu. */
  touches(xa, za, xb, zb) {
    return xa < this.x1 && xb > this.x0 && za < this.z1 && zb > this.z0;
  }

  /** [ya,yb) bu pencereyle kesişiyor mu. */
  touchesY(ya, yb) {
    return ya < this.yEnd && yb > this.yBase;
  }

  set(x, y, z, id) {
    const lx = x - this.x0;
    const lz = z - this.z0;
    if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < this.yBase || y >= this.yEnd) return;
    this.blocks[((y - this.yBase) << 8) + (lz << 4) + lx] = id;
  }

  /** Yalnız hücre hava ise yazar. */
  setAir(x, y, z, id) {
    const lx = x - this.x0;
    const lz = z - this.z0;
    if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < this.yBase || y >= this.yEnd) return;
    const i = ((y - this.yBase) << 8) + (lz << 4) + lx;
    if (this.blocks[i] === 0) this.blocks[i] = id;
  }

  get(x, y, z) {
    const lx = x - this.x0;
    const lz = z - this.z0;
    if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < this.yBase || y >= this.yEnd) return 0;
    return this.blocks[((y - this.yBase) << 8) + (lz << 4) + lx];
  }

  /** Yarı açık kutu [xa,xb)×[ya,yb)×[za,zb) → id (pencereye kırpılır). */
  box(xa, ya, za, xb, yb, zb, id) {
    let lx0 = xa - this.x0;
    let lx1 = xb - this.x0;
    let lz0 = za - this.z0;
    let lz1 = zb - this.z0;
    if (lx0 < 0) lx0 = 0;
    if (lz0 < 0) lz0 = 0;
    if (lx1 > 16) lx1 = 16;
    if (lz1 > 16) lz1 = 16;
    if (lx0 >= lx1 || lz0 >= lz1) return;
    const y0 = ya < this.yBase ? this.yBase : ya;
    const y1 = yb > this.yEnd ? this.yEnd : yb;
    if (y0 >= y1) return;
    const b = this.blocks;
    const full = lx0 === 0 && lx1 === 16 && lz0 === 0 && lz1 === 16;
    for (let y = y0; y < y1; y++) {
      const base = (y - this.yBase) << 8;
      if (full) {
        b.fill(id, base, base + 256);
      } else {
        for (let z = lz0; z < lz1; z++) {
          const o = base + (z << 4);
          b.fill(id, o + lx0, o + lx1);
        }
      }
    }
  }

  clearBox(xa, ya, za, xb, yb, zb) {
    this.box(xa, ya, za, xb, yb, zb, 0);
  }

  /** Yalnız hava hücrelerini doldurur. */
  boxAir(xa, ya, za, xb, yb, zb, id) {
    let lx0 = xa - this.x0;
    let lx1 = xb - this.x0;
    let lz0 = za - this.z0;
    let lz1 = zb - this.z0;
    if (lx0 < 0) lx0 = 0;
    if (lz0 < 0) lz0 = 0;
    if (lx1 > 16) lx1 = 16;
    if (lz1 > 16) lz1 = 16;
    if (lx0 >= lx1 || lz0 >= lz1) return;
    const y0 = ya < this.yBase ? this.yBase : ya;
    const y1 = yb > this.yEnd ? this.yEnd : yb;
    const b = this.blocks;
    for (let y = y0; y < y1; y++) {
      const base = (y - this.yBase) << 8;
      for (let z = lz0; z < lz1; z++) {
        const o = base + (z << 4);
        for (let x = lx0; x < lx1; x++) if (b[o + x] === 0) b[o + x] = id;
      }
    }
  }

  /** Tek sütun [ya,yb). */
  col(x, z, ya, yb, id) {
    const lx = x - this.x0;
    const lz = z - this.z0;
    if (lx < 0 || lx > 15 || lz < 0 || lz > 15) return;
    const y0 = ya < this.yBase ? this.yBase : ya;
    const y1 = yb > this.yEnd ? this.yEnd : yb;
    const b = this.blocks;
    const o = (lz << 4) + lx;
    for (let y = y0; y < y1; y++) b[((y - this.yBase) << 8) + o] = id;
  }
}

/** Chunk dilimi boyunca [a,b) tamsayı aralığını kırpar → [lo,hi) (boşsa lo>=hi). */
export function clipRange(a, b, lo, hi) {
  return [a < lo ? lo : a, b > hi ? hi : b];
}

/** Hücre (x,z) için karma sayı (0..2^32): konuma bağlı süs kararları (sıra bağımsız). */
export function cellHash(x, z, salt) {
  let h = Math.imul(x | 0, 0x2c1b3c6d) ^ Math.imul(z | 0, 0x297a2d39) ^ Math.imul((salt | 0) + 0x9e3779b9, 0x1b873593);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
