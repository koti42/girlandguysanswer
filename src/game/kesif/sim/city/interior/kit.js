/*
 * KEŞİF sim/city/interior — YAYIM ARAÇ TAKIMI (CityWriter üstünde yerel-koordinatlı yazıcı + mood paletleri + ışık/merdiven/kapı yardımcıları).
 * Saf, belirlenimci; yalnız pencere (chunk dilimi) içini yazar (CityWriter kırpar). Sözleşme §7, §8.
 *
 *  paletteFor(hue) -> Palette          PALETTES (11 mood tonu + 'default')
 *  LIGHT_TYPES                          {panel:{block:38,level:15}, lantern:{89,14}, neon_cyan|neon_pink|neon_amber|neon_lime:{12}, holo:{238,8}}
 *  lightTypeFor(level, hue?) -> tür adı (mood ışık seviyesi 8..14 → uygun blok)
 *  prepareVolume(W, frame, pal)         ayrılan hacmi temizler (kat döşemelerini keser), zemin + tavan satırı + gerekli çevre duvarları yazar
 *  new Kit(W, frame, pal)               yerel koordinatlı yazıcı:
 *     box(u0,v0,u1,v1, y0,y1, id) · boxAir(...) · set(u,v,y,id) · setAir · get · col(u,v,y0,y1,id) · clear/carve(u0,v0,u1,v1,y0,y1) · window(u0,v0,u1,v1,y0,y1,id?)
 *     floor(u0,v0,u1,v1, id|fn(u,v)) · ceiling(u0,v0,u1,v1, id|fn) · fill(u0,v0,u1,v1,y0,y1, fn(u,v,y)->id)
 *     wallU(v, u0,u1, y0,y1, id|fn)  [v sabit, u boyunca]  · wallV(u, v0,v1, y0,y1, id|fn)  [u sabit, v boyunca]
 *     room(rect, y0,y1, o)  odanın çevre duvarlarını (1 kalınlık, odanın DIŞINDA) yazar
 *     doorway(door, o) iç kapı/geçit açar · stair(o) · ladder(o) · strip(...) neon şerit · light(l) · lights(interior) · trimBand(rect,y,id)
 *  y değerleri KAT SATIRI (0 = ilk hava satırı, -1 = zemin, frame.H = tavan). u,v yerel hücre; dikdörtgenler yarı açık.
 *  Engel (kule çekirdeği) hücrelerine hiçbir işlev yazmaz.
 */
import { B } from '../../blocks.js';
import { ID } from '../cityEmit.js';

export const LIGHT_TYPES = Object.freeze({
  panel: Object.freeze({ block: B.LIGHT_BLOCK, level: 15 }),
  lantern: Object.freeze({ block: B.LANTERN, level: 14 }),
  neon_cyan: Object.freeze({ block: ID.NEON_CYAN, level: 12 }),
  neon_pink: Object.freeze({ block: ID.NEON_PINK, level: 12 }),
  neon_amber: Object.freeze({ block: ID.NEON_AMBER, level: 12 }),
  neon_lime: Object.freeze({ block: ID.NEON_LIME, level: 12 }),
  holo: Object.freeze({ block: ID.HOLO, level: 8 }),
});

const NEON_OF_HUE = Object.freeze({
  mor: 'neon_pink', camgobegi: 'neon_cyan', mavi: 'neon_cyan', yesil: 'neon_lime', pembe: 'neon_pink', kehribar: 'neon_amber', beyaz: 'neon_cyan',
  mint: 'neon_cyan', turuncu: 'neon_amber', renkli: 'neon_pink', sicak: 'neon_amber',
});

/** Mood ışık seviyesi (8..14) + ton → ışık türü. */
export function lightTypeFor(level, hue) {
  if (level >= 14) return 'panel';
  if (level >= 13) return 'lantern';
  if (level >= 9) return NEON_OF_HUE[hue] || 'neon_cyan';
  return 'holo';
}

const P = (o) => Object.freeze(o);
/*
 * floor/floor2: zemin (dama/şerit için ikinci tonu); wall/wall2: bölme duvarı + vurgu; ceil; trim: söve/süpürgelik; glow/glow2: neon blokları;
 * cloth/cloth2: kumaş (halı/koltuk bloğu); glass; lamp: önerilen ışık türü
 */
export const PALETTES = Object.freeze({
  default: P({
    floor: ID.POLISHED, floor2: ID.WHITE, wall: ID.WHITE, wall2: ID.FACADE_LIGHT, ceil: ID.WHITE, trim: ID.FACADE_DARK, glow: ID.NEON_CYAN, glow2: ID.NEON_PINK,
    cloth: B.CLOTH_BLUE, cloth2: B.CLOTH_WHITE, glass: B.GLASS, lamp: 'lantern',
  }),
  mor: P({
    floor: ID.BLACK, floor2: ID.PURPLE, wall: ID.FACADE_DARK, wall2: ID.PURPLE, ceil: ID.BLACK, trim: ID.NEON_PINK, glow: ID.NEON_PINK, glow2: ID.NEON_CYAN,
    cloth: B.CLOTH_PURPLE, cloth2: B.CLOTH_BLACK, glass: B.GLASS_PURPLE, lamp: 'holo',
  }),
  camgobegi: P({
    floor: ID.POLISHED, floor2: ID.WHITE, wall: ID.WHITE, wall2: ID.FACADE_LIGHT, ceil: ID.WHITE, trim: ID.NEON_CYAN, glow: ID.NEON_CYAN, glow2: ID.NEON_PINK,
    cloth: B.CLOTH_BLUE, cloth2: B.CLOTH_WHITE, glass: B.GLASS_BLUE, lamp: 'neon_cyan',
  }),
  mavi: P({
    floor: ID.FACADE_DARK, floor2: ID.BLACK, wall: ID.BLACK, wall2: ID.BLUE, ceil: ID.BLACK, trim: ID.NEON_CYAN, glow: ID.NEON_CYAN, glow2: ID.NEON_LIME,
    cloth: B.CLOTH_BLUE, cloth2: B.CLOTH_BLACK, glass: B.GLASS_BLUE, lamp: 'holo',
  }),
  yesil: P({
    floor: ID.POLISHED, floor2: ID.GREEN, wall: ID.WHITE, wall2: ID.GREEN, ceil: ID.WHITE, trim: ID.GREEN, glow: ID.NEON_LIME, glow2: ID.NEON_AMBER,
    cloth: B.CLOTH_GREEN, cloth2: B.CLOTH_WHITE, glass: B.GLASS_GREEN, lamp: 'panel',
  }),
  pembe: P({
    floor: ID.BLACK, floor2: ID.FACADE_DARK, wall: ID.FACADE_DARK, wall2: ID.PURPLE, ceil: ID.BLACK, trim: ID.NEON_PINK, glow: ID.NEON_PINK, glow2: ID.NEON_CYAN,
    cloth: B.CLOTH_PURPLE, cloth2: B.CLOTH_RED, glass: B.GLASS_PURPLE, lamp: 'neon_pink',
  }),
  kehribar: P({
    floor: B.PLANKS_OAK, floor2: B.PLANKS_ACACIA, wall: B.PLANKS_ACACIA, wall2: ID.BRICK, ceil: B.PLANKS_OAK, trim: ID.NEON_AMBER, glow: ID.NEON_AMBER, glow2: ID.NEON_PINK,
    cloth: B.CLOTH_RED, cloth2: B.CLOTH_ORANGE, glass: B.GLASS_ORANGE, lamp: 'neon_amber',
  }),
  beyaz: P({
    floor: ID.WHITE, floor2: ID.POLISHED, wall: ID.WHITE, wall2: ID.BLUE, ceil: ID.WHITE, trim: ID.BLUE, glow: ID.NEON_CYAN, glow2: ID.NEON_LIME,
    cloth: B.CLOTH_BLUE, cloth2: B.CLOTH_WHITE, glass: B.GLASS, lamp: 'panel',
  }),
  mint: P({
    floor: ID.WHITE, floor2: ID.POLISHED, wall: ID.FACADE_LIGHT, wall2: ID.GREEN, ceil: ID.WHITE, trim: ID.NEON_CYAN, glow: ID.NEON_CYAN, glow2: ID.NEON_LIME,
    cloth: B.CLOTH_GREEN, cloth2: B.CLOTH_WHITE, glass: B.GLASS_GREEN, lamp: 'panel',
  }),
  turuncu: P({
    floor: ID.FACADE_DARK, floor2: ID.IRON, wall: ID.FACADE_LIGHT, wall2: ID.ORANGE, ceil: ID.FACADE_DARK, trim: ID.NEON_AMBER, glow: ID.NEON_AMBER, glow2: ID.NEON_CYAN,
    cloth: B.CLOTH_ORANGE, cloth2: B.CLOTH_BLACK, glass: B.GLASS_ORANGE, lamp: 'lantern',
  }),
  renkli: P({
    floor: ID.BLACK, floor2: ID.FACADE_DARK, wall: ID.FACADE_DARK, wall2: ID.PURPLE, ceil: ID.BLACK, trim: ID.NEON_PINK, glow: ID.NEON_PINK, glow2: ID.NEON_CYAN,
    cloth: B.CLOTH_PURPLE, cloth2: B.CLOTH_YELLOW, glass: B.GLASS_PURPLE, lamp: 'neon_pink',
  }),
  sicak: P({
    floor: B.PLANKS_OAK, floor2: B.PLANKS_BIRCH, wall: ID.BRICK, wall2: B.PLANKS_BIRCH, ceil: B.PLANKS_OAK, trim: B.PLANKS_ACACIA, glow: ID.NEON_AMBER, glow2: ID.NEON_PINK,
    cloth: B.CLOTH_RED, cloth2: B.CLOTH_YELLOW, glass: B.GLASS_ORANGE, lamp: 'lantern',
  }),
});

export function paletteFor(hue) {
  return Object.prototype.hasOwnProperty.call(PALETTES, hue) ? PALETTES[hue] : PALETTES.default;
}

/* ------------------------------------------------------------------------------------------------
 * Kit
 * ---------------------------------------------------------------------------------------------- */
export class Kit {
  constructor(W, frame, pal) {
    this.W = W;
    this.f = frame;
    this.pal = pal || PALETTES.default;
    this.y0 = frame.y0;
  }

  /** Yerel dikdörtgen bu pencereyle kesişiyor mu (hızlı ret). */
  touches(u0, v0, u1, v1) {
    const r = this.f.rect(u0, v0, u1, v1);
    return this.W.touches(r[0], r[1], r[2], r[3]);
  }

  _each(u0, v0, u1, v1, cb) {
    const f = this.f;
    for (let v = v0; v < v1; v++) {
      for (let u = u0; u < u1; u++) {
        if (f.solids.length && f.isSolid(u, v)) continue;
        const c = f.cell(u, v);
        if (c[0] < this.W.x0 || c[0] >= this.W.x1 || c[1] < this.W.z0 || c[1] >= this.W.z1) continue;
        cb(u, v, c[0], c[1]);
      }
    }
  }

  box(u0, v0, u1, v1, y0, y1, id) {
    if (u1 <= u0 || v1 <= v0 || y1 <= y0) return;
    const r = this.f.rect(u0, v0, u1, v1);
    if (!this.W.touches(r[0], r[1], r[2], r[3])) return;
    const ya = this.y0 + y0;
    const yb = this.y0 + y1;
    if (!this.W.touchesY(ya, yb)) return;
    if (this.f.solids.length && this.f.solidAt(u0, v0, u1, v1)) {
      this._each(u0, v0, u1, v1, (u, v, x, z) => this.W.box(x, ya, z, x + 1, yb, z + 1, id));
    } else this.W.box(r[0], ya, r[1], r[2], yb, r[3], id);
  }

  boxAir(u0, v0, u1, v1, y0, y1, id) {
    if (u1 <= u0 || v1 <= v0 || y1 <= y0) return;
    const r = this.f.rect(u0, v0, u1, v1);
    if (!this.W.touches(r[0], r[1], r[2], r[3])) return;
    const ya = this.y0 + y0;
    const yb = this.y0 + y1;
    if (this.f.solids.length && this.f.solidAt(u0, v0, u1, v1)) {
      this._each(u0, v0, u1, v1, (u, v, x, z) => this.W.boxAir(x, ya, z, x + 1, yb, z + 1, id));
    } else this.W.boxAir(r[0], ya, r[1], r[2], yb, r[3], id);
  }

  clear(u0, v0, u1, v1, y0, y1) {
    this.box(u0, v0, u1, v1, y0, y1, 0);
  }

  /** clear takma adı (hacim oyma). */
  carve(u0, v0, u1, v1, y0, y1) {
    this.box(u0, v0, u1, v1, y0, y1, 0);
  }

  /** Cam pencere/cam bölme: id verilmezse palet camı. */
  window(u0, v0, u1, v1, y0, y1, id) {
    this.box(u0, v0, u1, v1, y0, y1, id === undefined ? this.pal.glass : id);
  }

  set(u, v, y, id) {
    if (this.f.solids.length && this.f.isSolid(u, v)) return;
    const c = this.f.cell(u, v);
    this.W.set(c[0], this.y0 + y, c[1], id);
  }

  setAir(u, v, y, id) {
    if (this.f.solids.length && this.f.isSolid(u, v)) return;
    const c = this.f.cell(u, v);
    this.W.setAir(c[0], this.y0 + y, c[1], id);
  }

  get(u, v, y) {
    const c = this.f.cell(u, v);
    return this.W.get(c[0], this.y0 + y, c[1]);
  }

  col(u, v, y0, y1, id) {
    this.box(u, v, u + 1, v + 1, y0, y1, id);
  }

  /** Desenli yazım: fn(u,v,y) → blok kimliği (0 = hava yaz, undefined/null = dokunma). */
  fill(u0, v0, u1, v1, y0, y1, fn) {
    const W = this.W;
    this._each(u0, v0, u1, v1, (u, v, x, z) => {
      for (let y = y0; y < y1; y++) {
        const id = fn(u, v, y);
        if (id !== undefined && id !== null) W.set(x, this.y0 + y, z, id);
      }
    });
  }

  floor(u0, v0, u1, v1, idOrFn) {
    if (typeof idOrFn === 'function') {
      this._each(u0, v0, u1, v1, (u, v, x, z) => { const id = idOrFn(u, v); if (id !== undefined && id !== null) this.W.set(x, this.y0 - 1, z, id); });
    } else this.box(u0, v0, u1, v1, -1, 0, idOrFn);
  }

  ceiling(u0, v0, u1, v1, idOrFn) {
    const H = this.f.H;
    if (typeof idOrFn === 'function') {
      this._each(u0, v0, u1, v1, (u, v, x, z) => { const id = idOrFn(u, v); if (id !== undefined && id !== null) this.W.set(x, this.y0 + H, z, id); });
    } else this.box(u0, v0, u1, v1, H, H + 1, idOrFn);
  }

  /** v sabit, u0..u1 boyunca 1 kalın duvar. */
  wallU(v, u0, u1, y0, y1, idOrFn) {
    if (typeof idOrFn === 'function') this.fill(u0, v, u1, v + 1, y0, y1, (u, vv, y) => idOrFn(u, vv, y));
    else this.box(u0, v, u1, v + 1, y0, y1, idOrFn);
  }

  /** u sabit, v0..v1 boyunca 1 kalın duvar. */
  wallV(u, v0, v1, y0, y1, idOrFn) {
    if (typeof idOrFn === 'function') this.fill(u, v0, u + 1, v1, y0, y1, (uu, v, y) => idOrFn(uu, v, y));
    else this.box(u, v0, u + 1, v1, y0, y1, idOrFn);
  }

  /**
   * Odanın (yerel dikdörtgen) dört yan duvarını odanın DIŞINA (1 kalın halka) yazar; y0..y1 satır aralığı (varsayılan zeminden tavana).
   * o.skip: {l,r,f,b} true olan kenar yazılmaz (l: u0-1, r: u1, f: v0-1, b: v1).
   */
  room(rect, y0, y1, id, skip) {
    const [u0, v0, u1, v1] = rect;
    const s = skip || {};
    const ya = y0 === undefined ? -1 : y0;
    const yb = y1 === undefined ? this.f.H + 1 : y1;
    if (!s.f) this.wallU(v0 - 1, u0 - 1, u1 + 1, ya, yb, id);
    if (!s.b) this.wallU(v1, u0 - 1, u1 + 1, ya, yb, id);
    if (!s.l) this.wallV(u0 - 1, v0, v1, ya, yb, id);
    if (!s.r) this.wallV(u1, v0, v1, ya, yb, id);
  }

  /**
   * Bölme duvarında geçit açar. door: {x,y,z,axis,w,h} (dünya, graph.js kapı şeması) + o.lintel (üst blok, varsayılan pal.trim), o.frame (yan söve).
   * Açıklık w×h temizlenir, üstündeki satır (varsa) lento ile doldurulur; zemin satırı pal.floor2 (eşik).
   */
  doorway(door, o) {
    const op = o || {};
    const half = (door.w - 1) / 2;
    const lintel = op.lintel === undefined ? this.pal.trim : op.lintel;
    for (let k = -half; k <= half; k++) {
      const x = door.axis === 'x' ? door.x + k : door.x;
      const z = door.axis === 'x' ? door.z : door.z + k;
      this.W.box(x, door.y, z, x + 1, door.y + door.h, z + 1, 0);
      this.W.set(x, door.y - 1, z, op.sill === undefined ? this.pal.floor2 : op.sill);
      if (door.y + door.h < this.y0 + this.f.H + 1) this.W.set(x, door.y + door.h, z, lintel);
    }
    if (op.frame !== undefined) {
      const sides = [-half - 1, half + 1];
      for (let s = 0; s < 2; s++) {
        const x = door.axis === 'x' ? door.x + sides[s] : door.x;
        const z = door.axis === 'x' ? door.z : door.z + sides[s];
        this.W.box(x, door.y, z, x + 1, door.y + door.h, z + 1, op.frame);
      }
    }
  }

  /**
   * Yarım basamaklı merdiven (plaka/küp; yürünür, zıplama gerekmez). o: {u,v (başlangıç hücresi: ilk basamak), dir (yerel yön 0..3), rise (blok), width (varsayılan 2),
   * y0 (taban satırı, varsayılan 0), cube, slab, hole (üst kat zemin satırı: basamak yolu üstünde temizlenir)}. Dönen: {rect:[u0,v0,u1,v1], from:[u,v], to:[u,v], run}.
   * Her basamak yarım blok (2 hücre = 1 blok yükseklik); `to` son basamaktan sonraki üst-kat hücresidir.
   */
  stair(o) {
    const rise = o.rise;
    const width = o.width || 2;
    const dir = o.dir & 3;
    const du = dir === 1 ? 1 : dir === 3 ? -1 : 0;
    const dv = dir === 0 ? 1 : dir === 2 ? -1 : 0;
    const pu = dv !== 0 ? 1 : 0; // genişlik ekseni
    const pv = du !== 0 ? 1 : 0;
    const base = o.y0 === undefined ? 0 : o.y0;
    const cube = o.cube === undefined ? this.pal.floor2 : o.cube;
    const slab = o.slab === undefined ? B.SLAB : o.slab;
    const run = rise * 2;
    if (o.hole !== undefined) {
      for (let i = Math.max(0, run - 8); i < run; i++) {
        for (let w = 0; w < width; w++) this.set(o.u + du * i + pu * w, o.v + dv * i + pv * w, o.hole, 0);
      }
    }
    for (let i = 0; i < run; i++) {
      const hh = i + 1;
      const m = hh >> 1;
      for (let w = 0; w < width; w++) {
        const u = o.u + du * i + pu * w;
        const v = o.v + dv * i + pv * w;
        if (m > 0) this.col(u, v, base, base + m, cube);
        if (hh & 1) this.set(u, v, base + m, slab);
      }
    }
    const lastU = o.u + du * (run - 1);
    const lastV = o.v + dv * (run - 1);
    const uu = [o.u, lastU, o.u + pu * (width - 1), lastU + pu * (width - 1)];
    const vv = [o.v, lastV, o.v + pv * (width - 1), lastV + pv * (width - 1)];
    return {
      rect: [Math.min.apply(null, uu), Math.min.apply(null, vv), Math.max.apply(null, uu) + 1, Math.max.apply(null, vv) + 1],
      from: [o.u - du, o.v - dv],
      to: [lastU + du, lastV + dv],
      run,
    };
  }

  /** Merdiven (tırmanılır blok) sütunu: (u,v) hücresinde y0..y1. */
  ladder(o) {
    this.col(o.u, o.v, o.y0 === undefined ? 0 : o.y0, o.y1, B.LADDER);
  }

  /** Neon şerit (yerel dikdörtgen, tek satır y): blok = ID.NEON_* ya da pal.glow. */
  strip(u0, v0, u1, v1, y, block) {
    this.box(u0, v0, u1, v1, y, y + 1, block === undefined ? this.pal.glow : block);
  }

  /** Işık yerleştirir: l = Interior.lights[i] (dünya hücresi + tür). */
  light(l) {
    const t = LIGHT_TYPES[l.type];
    if (!t) return;
    const fx = Math.floor(l.x);
    const fz = Math.floor(l.z);
    if (this.f.obstacles.some((o) => fx >= o.x0 && fx < o.x1 && fz >= o.z0 && fz < o.z1)) return;
    this.W.set(Math.floor(l.x), Math.floor(l.y), Math.floor(l.z), t.block);
  }

  lights(interior) {
    for (let i = 0; i < interior.lights.length; i++) this.light(interior.lights[i]);
  }

  /** Aksan listesini (Interior.accents) yazar. */
  accents(interior) {
    const a = interior.accents || [];
    const ob = this.f.obstacles;
    for (let i = 0; i < a.length; i++) {
      const q = a[i];
      if (!ob.length) { this.W.box(q.x0, q.y0, q.z0, q.x1, q.y1, q.z1, q.block); continue; }
      for (let x = q.x0; x < q.x1; x++) {
        for (let z = q.z0; z < q.z1; z++) {
          if (ob.some((o) => x >= o.x0 && x < o.x1 && z >= o.z0 && z < o.z1)) continue;
          this.W.box(x, q.y0, z, x + 1, q.y1, z + 1, q.block);
        }
      }
    }
  }

  /** Satır boyunca (y) süpürgelik/söve bandı: dikdörtgenin çevresi (iç yüz). */
  trimBand(rect, y, id) {
    const [u0, v0, u1, v1] = rect;
    this.wallU(v0, u0, u1, y, y + 1, id);
    this.wallU(v1 - 1, u0, u1, y, y + 1, id);
    this.wallV(u0, v0, v1, y, y + 1, id);
    this.wallV(u1 - 1, v0, v1, y, y + 1, id);
  }
}

/**
 * Ayrılan hacmi hazırlar (her iç mekânın İLK adımı; index.emitBuildingInterior çağırır):
 *  1) [0,W)×[0,D) × satır 0..H-1 temizlenir (üst kat döşemeleri dahil) — kule çekirdeği hücreleri hariç
 *  2) zemin satırı (pal.floor) ve tavan satırı H (pal.ceil)
 *  3) bina dış duvarına bitişik olmayan kenarlara 1 kalın çevre duvarı (pal.wall), zemin–tavan arası
 */
export function prepareVolume(W, frame, pal) {
  const k = new Kit(W, frame, pal);
  const { W: fw, D: fd, H } = frame;
  if (!k.touches(-1, -1, fw + 1, fd + 1)) return k;
  k.clear(0, 0, fw, fd, 0, H);
  k.floor(0, 0, fw, fd, pal.floor);
  k.ceiling(0, 0, fw, fd, pal.ceil);
  const wall = pal.wall;
  if (!frame.adj.b) k.wallU(fd, -1, fw + 1, -1, H + 1, wall);
  if (!frame.adj.l) k.wallV(-1, 0, fd, -1, H + 1, wall);
  if (!frame.adj.r) k.wallV(fw, 0, fd, -1, H + 1, wall);
  return k;
}
