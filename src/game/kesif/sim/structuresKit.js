/*
 * KEŞİF sim — yapı kiti (saf; DOM/three yok, worker-güvenli).
 *
 * Bir chunk'a yazan hızlı yazıcı (ChunkW), yerel çerçeve (Local: yerel x sağ, y yukarı, z ileri; facing 0..3) ve ortak
 * paletler/işaret ışığı yardımcıları. Her yapı "şablon hücresinden" belirlenimci türetildiği için her chunk yapının
 * tamamını yeniden çalıştırır ve YALNIZCA kendi kesitini yazar: bütün yazma işlevleri chunk dışı hücreleri atar, kutu
 * işlemleri döngüyü önce chunk kesişimine kırpar (chunk dışı iş ≈ 0).
 *
 *   makeChunkW(chunk, ctx) → W      (W.set/get/fill/paint/cyl/disc/ringWall/pillarDown/ground/line)
 *   W.local(origin, facing) → L     (aynı işlevler yerel koordinatlarda + toWorld/hash)
 *   NullW                           hiçbir şey yazmayan yazıcı (kuru çalıştırma/test)
 *   paletteFor(zone, biomeKey) → palet,  beaconBlock(color) / buildBeacon(W,...)
 */
import { B } from './blocks.js';
import { isBiomeFlora } from './biomeData.js';
import { WORLD_Y_MAX, ZONES } from './constants.js';
import { hash2, hash3 } from './rng.js';
import { FACINGS, localToWorld, normFacing } from './puzzles/kitGeometry.js';

export const MAX_Y = WORLD_Y_MAX - 12;

/** Yaprak/kütük/bitki/kaktüs/sarmaşık/mantar gibi "zemin olmayan" doğa blokları. */
export function isFloraId(id) {
  return (id >= 40 && id <= 43) || (id >= 48 && id <= 59) || isBiomeFlora(id);
}

function isLiquidId(id) {
  return id >= 20 && id <= 23;
}

/** Zemin sayılan blok (worldgen.isGroundBlock ile aynı kural). */
export function isGroundId(id) {
  if (id === 0 || isLiquidId(id)) return false;
  if (isFloraId(id)) return false;
  if (id === B.SEAL_BARRIER) return false;
  if (id === B.TORCH || id === B.LANTERN || id === B.PRESSURE_PLATE) return false;
  return true;
}

/* ------------------------------------------------------------------------------------------------
 * ChunkW: chunk'a yazan yazıcı
 * ---------------------------------------------------------------------------------------------- */
class ChunkW {
  constructor(chunk, ctx) {
    this.chunk = chunk;
    this.ctx = ctx || null;
    this.blocks = chunk.blocks;
    this.top = (chunk.blocks.length >> 8) - 1;
    this.bx0 = chunk.cx * 16;
    this.bz0 = chunk.cz * 16;
    this.bx1 = this.bx0 + 15;
    this.bz1 = this.bz0 + 15;
    this._g0 = null;
    this._gTop = null;
    this._gFill = null;
    this.writes = 0;
  }

  /** Dikdörtgen (dünya, uçlar dahil) bu chunk ile kesişiyor mu? */
  has(x0, z0, x1, z1) {
    return x1 >= this.bx0 && x0 <= this.bx1 && z1 >= this.bz0 && z0 <= this.bz1;
  }

  set(x, y, z, id) {
    if (x < this.bx0 || x > this.bx1 || z < this.bz0 || z > this.bz1 || y < 1 || y > this.top) return false;
    this.blocks[(y << 8) + ((z - this.bz0) << 4) + (x - this.bx0)] = id;
    this.writes++;
    return true;
  }

  /** Yalnızca hedef hücre hava ise yazar (süs). */
  setAir(x, y, z, id) {
    if (x < this.bx0 || x > this.bx1 || z < this.bz0 || z > this.bz1 || y < 1 || y > this.top) return false;
    const i = (y << 8) + ((z - this.bz0) << 4) + (x - this.bx0);
    if (this.blocks[i] !== 0) return false;
    this.blocks[i] = id;
    return true;
  }

  get(x, y, z) {
    if (x < this.bx0 || x > this.bx1 || z < this.bz0 || z > this.bz1) return -1;
    if (y < 0 || y > this.top) return 0;
    return this.blocks[(y << 8) + ((z - this.bz0) << 4) + (x - this.bx0)];
  }

  fill(x0, y0, z0, x1, y1, z1, id) {
    let ax = x0 < x1 ? x0 : x1;
    let bx = x0 < x1 ? x1 : x0;
    let ay = y0 < y1 ? y0 : y1;
    let by = y0 < y1 ? y1 : y0;
    let az = z0 < z1 ? z0 : z1;
    let bz = z0 < z1 ? z1 : z0;
    if (ax < this.bx0) ax = this.bx0;
    if (bx > this.bx1) bx = this.bx1;
    if (az < this.bz0) az = this.bz0;
    if (bz > this.bz1) bz = this.bz1;
    if (ay < 1) ay = 1;
    if (by > this.top) by = this.top;
    if (ax > bx || az > bz || ay > by) return 0;
    const blocks = this.blocks;
    let n = 0;
    for (let y = ay; y <= by; y++) {
      for (let z = az; z <= bz; z++) {
        const row = (y << 8) + ((z - this.bz0) << 4) - this.bx0;
        for (let x = ax; x <= bx; x++) {
          blocks[row + x] = id;
          n++;
        }
      }
    }
    this.writes += n;
    return n;
  }

  /** Kutuyu hücre başına fn(x,y,z) → id (−1/null atlar) ile boyar. */
  paint(x0, y0, z0, x1, y1, z1, fn) {
    let ax = x0 < x1 ? x0 : x1;
    let bx = x0 < x1 ? x1 : x0;
    let ay = y0 < y1 ? y0 : y1;
    let by = y0 < y1 ? y1 : y0;
    let az = z0 < z1 ? z0 : z1;
    let bz = z0 < z1 ? z1 : z0;
    if (ax < this.bx0) ax = this.bx0;
    if (bx > this.bx1) bx = this.bx1;
    if (az < this.bz0) az = this.bz0;
    if (bz > this.bz1) bz = this.bz1;
    if (ay < 1) ay = 1;
    if (by > this.top) by = this.top;
    if (ax > bx || az > bz || ay > by) return 0;
    let n = 0;
    for (let y = ay; y <= by; y++) {
      for (let z = az; z <= bz; z++) {
        for (let x = ax; x <= bx; x++) {
          const id = fn(x, y, z);
          if (id === null || id === undefined || id < 0) continue;
          this.blocks[(y << 8) + ((z - this.bz0) << 4) + (x - this.bx0)] = id;
          n++;
        }
      }
    }
    this.writes += n;
    return n;
  }

  /** Kutudaki bitki/ağaç bloklarını (isFloraId: yaprak, kütük, sarmaşık, mantar, bambu…) siler; havada asılı yapıların hava hacmi için. */
  clearFloraBox(x0, y0, z0, x1, y1, z1) {
    const ax = Math.max(Math.min(x0, x1), this.bx0);
    const bx = Math.min(Math.max(x0, x1), this.bx1);
    const az = Math.max(Math.min(z0, z1), this.bz0);
    const bz = Math.min(Math.max(z0, z1), this.bz1);
    const ay = Math.max(Math.min(y0, y1), 1);
    const by = Math.min(Math.max(y0, y1), this.top);
    if (ax > bx || az > bz || ay > by) return 0;
    let n = 0;
    for (let y = ay; y <= by; y++) {
      for (let z = az; z <= bz; z++) {
        const row = (y << 8) + ((z - this.bz0) << 4) - this.bx0;
        for (let x = ax; x <= bx; x++) {
          const b = this.blocks[row + x];
          if (b !== 0 && isFloraId(b)) {
            this.blocks[row + x] = 0;
            n++;
          }
        }
      }
    }
    this.writes += n;
    return n;
  }

  /** Yatay dolu daire (merkez dahil tam sayı koordinat), y tek katman. */
  disc(cx, cz, y, r, id) {
    return this.cyl(cx, cz, y, y, r, id);
  }

  /** Dolu silindir. */
  cyl(cx, cz, y0, y1, r, id) {
    const rr = r * r + r;
    return this.paint(cx - r, y0, cz - r, cx + r, y1, cz + r, (x, y, z) => {
      const dx = x - cx;
      const dz = z - cz;
      return dx * dx + dz * dz <= rr ? id : -1;
    });
  }

  /** Silindirik duvar halkası: rIn² < d² ≤ rOut² (cx,cz merkez). */
  ringWall(cx, cz, y0, y1, rIn, rOut, id) {
    const ro = rOut * rOut + rOut;
    const ri = rIn * rIn + rIn;
    return this.paint(cx - rOut, y0, cz - rOut, cx + rOut, y1, cz + rOut, (x, y, z) => {
      const dx = x - cx;
      const dz = z - cz;
      const d = dx * dx + dz * dz;
      return d <= ro && d > ri ? id : -1;
    });
  }

  /** 3B tam sayı doğrusu. */
  line(x0, y0, z0, x1, y1, z1, id) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      this.set(Math.round(x0 + dx * t), Math.round(y0 + dy * t), Math.round(z0 + dz * t), id);
    }
  }

  /**
   * Bu sütunun ORİJİNAL (yapılar yazmadan önceki) zemin y'si, yoksa -1. İlk çağrıda tüm chunk için hesaplanır.
   */
  ground(x, z) {
    if (x < this.bx0 || x > this.bx1 || z < this.bz0 || z > this.bz1) return -1;
    if (this._g0 === null) this._initGround();
    return this._g0[((z - this.bz0) << 4) + (x - this.bx0)];
  }

  _initGround() {
    const g = new Int16Array(256);
    const top = new Uint8Array(256);
    const fill = new Uint8Array(256);
    const blocks = this.blocks;
    const hm = this.chunk.heightMap;
    for (let i = 0; i < 256; i++) {
      let y = hm[i];
      let r = -1;
      for (; y >= 1; y--) {
        if (isGroundId(blocks[(y << 8) + i])) {
          r = y;
          break;
        }
      }
      g[i] = r;
      if (r > 0) {
        top[i] = blocks[(r << 8) + i];
        const b2 = r > 1 ? blocks[((r - 1) << 8) + i] : 0;
        fill[i] = b2 !== 0 && isGroundId(b2) && b2 !== B.BEDROCK ? b2 : B.DIRT;
      }
    }
    this._g0 = g;
    this._gTop = top;
    this._gFill = fill;
  }

  /** Güncel sütunda en üstteki zemin bloğu y'si (yapılar dahil), yoksa -1. */
  surfaceY(x, z) {
    if (x < this.bx0 || x > this.bx1 || z < this.bz0 || z > this.bz1) return -1;
    const idx = ((z - this.bz0) << 4) + (x - this.bx0);
    for (let y = this.top; y >= 1; y--) {
      const b = this.blocks[(y << 8) + idx];
      if (b !== 0 && isGroundId(b)) return y;
    }
    return -1;
  }

  /** Orijinal zemin üst bloğu (yüzey) ve altındaki katman. */
  groundTop(x, z) {
    if (this._g0 === null) this._initGround();
    return this._gTop[((z - this.bz0) << 4) + (x - this.bx0)];
  }

  groundFill(x, z) {
    if (this._g0 === null) this._initGround();
    return this._gFill[((z - this.bz0) << 4) + (x - this.bx0)];
  }

  /** (x,topY,z)'den aşağı: zemine değene kadar id yaz (havada asılı kalan yapıların ayakları). */
  pillarDown(x, topY, z, id, maxLen) {
    if (x < this.bx0 || x > this.bx1 || z < this.bz0 || z > this.bz1) return 0;
    const lim = maxLen || 80;
    let n = 0;
    for (let y = Math.min(this.top, topY); y >= 1 && n < lim; y--) {
      const i = (y << 8) + ((z - this.bz0) << 4) + (x - this.bx0);
      const b = this.blocks[i];
      if (b !== 0 && isGroundId(b) && b !== id) break;
      this.blocks[i] = id;
      n++;
    }
    return n;
  }

  local(origin, facing) {
    return new Local(this, origin, facing);
  }
}

export function makeChunkW(chunk, ctx) {
  return new ChunkW(chunk, ctx);
}

/** Hiçbir şey yazmayan yazıcı (her dikdörtgen kesişimi false). */
export const NullW = Object.freeze({
  bx0: 1, bz0: 1, bx1: 0, bz1: 0,
  has: () => false,
  set: () => false,
  setAir: () => false,
  get: () => -1,
  fill: () => 0,
  paint: () => 0,
  disc: () => 0,
  cyl: () => 0,
  ringWall: () => 0,
  line: () => 0,
  ground: () => -1,
  surfaceY: () => -1,
  groundBlock: () => 0,
  pillarDown: () => 0,
  local(origin, facing) {
    return new Local(NullW, origin, facing);
  },
});

/* ------------------------------------------------------------------------------------------------
 * Local: yerel çerçeve (origin = yerel (0,0,0) hücresi; ly=0 oyuncunun durduğu hava hücresi → zemin bloğu ly=-1)
 * ---------------------------------------------------------------------------------------------- */
export class Local {
  constructor(W, origin, facing) {
    this.W = W;
    this.origin = { x: origin.x | 0, y: origin.y | 0, z: origin.z | 0 };
    this.facing = normFacing(facing);
    const f = FACINGS[this.facing];
    this.f = f;
    this.ox = this.origin.x;
    this.oy = this.origin.y;
    this.oz = this.origin.z;
  }

  wx(lx, lz) {
    return this.ox + lx * this.f.rx + lz * this.f.fx;
  }

  wz(lx, lz) {
    return this.oz + lx * this.f.rz + lz * this.f.fz;
  }

  toWorld(lx, ly, lz, out) {
    return localToWorld(this.origin, this.facing, lx, ly, lz, out);
  }

  hash(lx, ly, lz, salt) {
    return hash3(lx, ly, lz, (salt | 0) + 0x51ed);
  }

  chance(lx, ly, lz, p, salt) {
    return hash3(lx, ly, lz, (salt | 0) + 0x51ed) / 4294967296 < p;
  }

  set(lx, ly, lz, id) {
    return this.W.set(this.wx(lx, lz), this.oy + ly, this.wz(lx, lz), id);
  }

  setAir(lx, ly, lz, id) {
    return this.W.setAir(this.wx(lx, lz), this.oy + ly, this.wz(lx, lz), id);
  }

  get(lx, ly, lz) {
    return this.W.get(this.wx(lx, lz), this.oy + ly, this.wz(lx, lz));
  }

  fill(lx0, ly0, lz0, lx1, ly1, lz1, id) {
    return this.W.fill(
      this.wx(lx0, lz0), this.oy + ly0, this.wz(lx0, lz0),
      this.wx(lx1, lz1), this.oy + ly1, this.wz(lx1, lz1), id,
    );
  }

  carve(lx0, ly0, lz0, lx1, ly1, lz1) {
    return this.fill(lx0, ly0, lz0, lx1, ly1, lz1, 0);
  }

  /** fn(lx,ly,lz) → id (−1 atlar). */
  paint(lx0, ly0, lz0, lx1, ly1, lz1, fn) {
    const f = this.f;
    const ox = this.ox;
    const oz = this.oz;
    const oy = this.oy;
    return this.W.paint(
      this.wx(lx0, lz0), oy + ly0, this.wz(lx0, lz0),
      this.wx(lx1, lz1), oy + ly1, this.wz(lx1, lz1),
      (x, y, z) => {
        const dx = x - ox;
        const dz = z - oz;
        return fn(dx * f.rx + dz * f.rz, y - oy, dx * f.fx + dz * f.fz);
      },
    );
  }

  /** Kutunun yalnızca yüzeyi. */
  hollow(lx0, ly0, lz0, lx1, ly1, lz1, id, o) {
    const ax = Math.min(lx0, lx1);
    const bx = Math.max(lx0, lx1);
    const ay = Math.min(ly0, ly1);
    const by = Math.max(ly0, ly1);
    const az = Math.min(lz0, lz1);
    const bz = Math.max(lz0, lz1);
    const op = o || {};
    return this.paint(ax, ay, az, bx, by, bz, (lx, ly, lz) => {
      if (ly === ay && op.bottom === false) return -1;
      if (ly === by && op.top === false) return -1;
      return (lx === ax || lx === bx || lz === az || lz === bz || ly === ay || ly === by) ? id : -1;
    });
  }

  cyl(lcx, lcz, ly0, ly1, r, id) {
    return this.W.cyl(this.wx(lcx, lcz), this.wz(lcx, lcz), this.oy + ly0, this.oy + ly1, r, id);
  }

  disc(lcx, lcz, ly, r, id) {
    return this.W.cyl(this.wx(lcx, lcz), this.wz(lcx, lcz), this.oy + ly, this.oy + ly, r, id);
  }

  ringWall(lcx, lcz, ly0, ly1, rIn, rOut, id) {
    return this.W.ringWall(this.wx(lcx, lcz), this.wz(lcx, lcz), this.oy + ly0, this.oy + ly1, rIn, rOut, id);
  }

  line(lx0, ly0, lz0, lx1, ly1, lz1, id) {
    this.W.line(
      this.wx(lx0, lz0), this.oy + ly0, this.wz(lx0, lz0),
      this.wx(lx1, lz1), this.oy + ly1, this.wz(lx1, lz1), id,
    );
  }

  /** Yerel sütunun güncel yüzey y'si (dünya y) ya da -1. */
  surfaceY(lx, lz) {
    return this.W.surfaceY(this.wx(lx, lz), this.wz(lx, lz));
  }

  pillarDown(lx, ly, lz, id, maxLen) {
    return this.W.pillarDown(this.wx(lx, lz), this.oy + ly, this.wz(lx, lz), id, maxLen);
  }

  /** Dünya kutusu → yerel kutu içinde mi: (yerel kutu dünyada AABB) */
  worldBox(lx0, ly0, lz0, lx1, ly1, lz1) {
    const ax = this.wx(lx0, lz0);
    const bx = this.wx(lx1, lz1);
    const az = this.wz(lx0, lz0);
    const bz = this.wz(lx1, lz1);
    return {
      x0: Math.min(ax, bx),
      y0: this.oy + Math.min(ly0, ly1),
      z0: Math.min(az, bz),
      x1: Math.max(ax, bx),
      y1: this.oy + Math.max(ly0, ly1),
      z1: Math.max(az, bz),
    };
  }
}

/* ------------------------------------------------------------------------------------------------
 * Paletler
 * ---------------------------------------------------------------------------------------------- */
function pal(o) {
  return Object.freeze(Object.assign({
    torch: B.TORCH,
    lamp: B.LANTERN,
    plank: B.PLANKS_OAK,
    log: B.LOG_OAK,
    fence: B.FENCE,
    slab: B.SLAB,
    stair: B.STAIRS,
    glass: B.GLASS,
    lock: B.LOCKED_DOOR,
    grass: B.GRASS,
    dirt: B.DIRT,
  }, o));
}

export const PALETTES = Object.freeze([
  // 0 Başlangıç Vadisi: taş tuğla harabe
  pal({
    key: 'harabe', wall: B.STONE_BRICK, wallAlt: B.COBBLE, floor: B.POLISHED, floorAlt: B.STONE_BRICK,
    base: B.STONE, pillar: B.PILLAR, roof: B.BRICK, roofAlt: B.STONE_BRICK, trim: B.POLISHED,
    glow: B.CRYSTAL_ROCK, accent: B.CLOTH_RED, accent2: B.CLOTH_WHITE, moss: B.MOSS, path: B.GRAVEL,
  }),
  // 1 Fısıldayan Ormanlar: yosunlu kalıntı, ahşap
  pal({
    key: 'yosunlu', wall: B.STONE_BRICK, wallAlt: B.MOSS, floor: B.COBBLE, floorAlt: B.MOSS,
    base: B.STONE, pillar: B.PILLAR, roof: B.PLANKS_PINE, roofAlt: B.PLANKS_OAK, trim: B.LOG_PINE,
    glow: B.AMETHYST, accent: B.CLOTH_GREEN, accent2: B.CLOTH_YELLOW, moss: B.MOSS, path: B.DIRT,
    plank: B.PLANKS_PINE, log: B.LOG_PINE,
  }),
  // 2 Yanık Kanyonlar: kumtaşı
  pal({
    key: 'kumtasi', wall: B.SANDSTONE, wallAlt: B.CANYON_ROCK, floor: B.CANYON_ROCK, floorAlt: B.SANDSTONE,
    base: B.SANDSTONE, pillar: B.PILLAR, roof: B.BRICK, roofAlt: B.CANYON_ROCK, trim: B.RED_SAND,
    glow: B.REDSTONE_ORE, accent: B.CLOTH_ORANGE, accent2: B.CLOTH_RED, moss: B.RED_SAND, path: B.SAND,
    plank: B.PLANKS_ACACIA, log: B.LOG_ACACIA,
  }),
  // 3 Donmuş Zirveler: buz mavisi taş
  pal({
    key: 'buz', wall: B.CONCRETE_BLUE, wallAlt: B.ICE, floor: B.POLISHED, floorAlt: B.CONCRETE_BLUE,
    base: B.STONE, pillar: B.PILLAR, roof: B.CONCRETE_WHITE, roofAlt: B.SNOW, trim: B.POLISHED,
    glow: B.CRYSTAL_ROCK, accent: B.CLOTH_BLUE, accent2: B.CLOTH_WHITE, moss: B.SNOW, path: B.SNOW,
    plank: B.PLANKS_BIRCH, log: B.LOG_BIRCH,
  }),
  // 4 Çekirdek: obsidyen/rün
  pal({
    key: 'golge', wall: B.BASALT, wallAlt: B.CONCRETE_BLACK, floor: B.CONCRETE_BLACK, floorAlt: B.BASALT,
    base: B.BASALT, pillar: B.PILLAR, roof: B.CONCRETE_PURPLE, roofAlt: B.CONCRETE_BLACK, trim: B.QUANTUM_BLOCK,
    glow: B.QUANTUM_BLOCK, accent: B.CLOTH_PURPLE, accent2: B.CLOTH_BLACK, moss: B.AMETHYST, path: B.BASALT,
    plank: B.PLANKS_ACACIA, log: B.LOG_ACACIA,
  }),
]);

/** Bölge + biyom anahtarına göre palet (biyom malzemeyi hafifçe değiştirir). */
export function paletteFor(zone, biomeKey) {
  const z = Math.max(0, Math.min(PALETTES.length - 1, zone | 0));
  const p = PALETTES[z];
  if (biomeKey === 'col' && z < 2) {
    return Object.freeze(Object.assign({}, p, {
      wall: B.SANDSTONE, wallAlt: B.CANYON_ROCK, floor: B.SANDSTONE, floorAlt: B.CANYON_ROCK, base: B.SANDSTONE,
      roof: B.BRICK, path: B.SAND, accent: B.CLOTH_ORANGE, plank: B.PLANKS_ACACIA, log: B.LOG_ACACIA,
    }));
  }
  if (biomeKey === 'tundra' && z < 3) {
    return Object.freeze(Object.assign({}, p, {
      roof: B.CONCRETE_WHITE, roofAlt: B.SNOW, accent: B.CLOTH_BLUE, path: B.SNOW, plank: B.PLANKS_PINE, log: B.LOG_PINE,
    }));
  }
  if (biomeKey === 'bataklik' && z < 3) {
    return Object.freeze(Object.assign({}, p, { wallAlt: B.MOSS, floorAlt: B.MOSS, path: B.MUD, accent: B.CLOTH_GREEN }));
  }
  return p;
}

/** Zorluk (1..5) → işaret rengi etiketi. */
export const TIER_COLORS = Object.freeze([
  null,
  Object.freeze({ key: 'bronz', name: 'Bronz', hex: 0xd1773f }),
  Object.freeze({ key: 'gumus', name: 'Gümüş', hex: 0xd9dde2 }),
  Object.freeze({ key: 'altin', name: 'Altın', hex: 0xf4c940 }),
  Object.freeze({ key: 'mavi', name: 'Elmas', hex: 0x4fb4ff }),
  Object.freeze({ key: 'mor', name: 'Kuantum', hex: 0xb25cff }),
]);

/** Işık hüzmesi cam bloğu: 1 bronz (turuncu), 2 gümüş (beyaz), 3 altın (sarı), 4 mavi, 5 mor, 6 kırmızı (boss). */
export function beaconBlock(tier) {
  switch (Math.max(1, Math.min(6, tier | 0))) {
    case 1: return B.GLASS_ORANGE;
    case 2: return B.GLASS_WHITE;
    case 3: return B.GLASS_YELLOW;
    case 4: return B.GLASS_BLUE;
    case 5: return B.GLASS_PURPLE;
    default: return B.GLASS_RED;
  }
}

/**
 * Uzaktan görünür ışık hüzmesi: (x,z) sütununda y0..y1 arası renkli cam sütunu; her 4 blokta bir parlayan ışık bloğu (gece de
 * görünür). Taban ve tepede ışık haçı. Döner {x,z,y0,y1,block}.
 */
export function buildBeacon(W, x, z, y0, y1, tier) {
  const top = Math.min(MAX_Y, y1);
  const blk = beaconBlock(tier);
  if (top < y0) return { x, z, y0, y1: top, block: blk };
  if (!W.has(x - 1, z - 1, x + 1, z + 1)) return { x, z, y0, y1: top, block: blk };
  for (let y = y0; y <= top; y++) W.set(x, y, z, ((y - y0) & 3) === 3 ? B.LIGHT_BLOCK : blk);
  W.set(x + 1, y0, z, B.LIGHT_BLOCK);
  W.set(x - 1, y0, z, B.LIGHT_BLOCK);
  W.set(x, y0, z + 1, B.LIGHT_BLOCK);
  W.set(x, y0, z - 1, B.LIGHT_BLOCK);
  W.set(x + 1, top, z, B.LIGHT_BLOCK);
  W.set(x - 1, top, z, B.LIGHT_BLOCK);
  W.set(x, top, z + 1, B.LIGHT_BLOCK);
  W.set(x, top, z - 1, B.LIGHT_BLOCK);
  return { x, z, y0, y1: top, block: blk };
}

/* ------------------------------------------------------------------------------------------------
 * Küçük yardımcılar
 * ---------------------------------------------------------------------------------------------- */
/** Konum-hash'i [0,1): dekor belirlenimi için. */
export function hf(x, y, z, salt) {
  return hash3(x, y, z, salt | 0) / 4294967296;
}

export function hf2(x, z, salt) {
  return hash2(x, z, salt | 0) / 4294967296;
}

/** Bölge adı (Türkçe). */
export function zoneName(zone) {
  return ZONES[Math.max(0, Math.min(ZONES.length - 1, zone | 0))].name;
}

/** Kapalı aralıkta kesişim. */
export function rectsOverlap(a, b, gap) {
  const g = gap || 0;
  return a.x1 + g >= b.x0 && a.x0 - g <= b.x1 && a.z1 + g >= b.z0 && a.z0 - g <= b.z1;
}

export function rectFromCenter(cx, cz, hx, hz) {
  return { x0: Math.floor(cx - hx), z0: Math.floor(cz - hz), x1: Math.ceil(cx + hx), z1: Math.ceil(cz + hz) };
}

export function rectUnion(a, b) {
  return {
    x0: Math.min(a.x0, b.x0), z0: Math.min(a.z0, b.z0), x1: Math.max(a.x1, b.x1), z1: Math.max(a.z1, b.z1),
  };
}

/**
 * Yerel kutuda 3 geniş tünel/koridor: kabuk (duvar+zemin+tavan) + iç oyuk. Çağıran sonradan kurduğu odalar
 * kabuğun üzerine yazar (odalar kendi oyuklarını açar).
 * box: {lx0,lz0,lx1,lz1} iç hücre aralığı; h = iç yükseklik.
 */
export function corridor(L, box, h, p, salt) {
  const s = salt | 0;
  L.paint(box.lx0 - 1, -2, box.lz0 - 1, box.lx1 + 1, h + 1, box.lz1 + 1, (lx, ly, lz) => {
    if (ly === -2) return p.base;
    const inside = lx >= box.lx0 && lx <= box.lx1 && lz >= box.lz0 && lz <= box.lz1;
    if (ly === -1) return inside ? p.floor : p.wall;
    if (ly >= h) return p.wall;
    if (inside) return 0;
    return L.chance(lx, ly, lz, 0.2, 77 + s) ? p.wallAlt : p.wall;
  });
}
