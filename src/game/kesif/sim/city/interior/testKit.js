/*
 * KEŞİF sim/city/interior — iç mekân testleri için ORTAK YARDIMCILAR (yalnız test dosyaları içe aktarır; üretim yolu içe aktarmaz).
 *
 *  interiorLots(seed, o?)       -> [{lot, bp}]  iç mekânı olan binalar. o {limit, kinds:[…], filter(bp), faces:[…]}
 *  BigWriter                    CityWriter arayüzlü, rastgele boyutlu yazıcı ("bütün" inşa referansı)
 *  emitWhole(bp, lot, region)   -> BigWriter   region {x0,z0,x1,z1}; yalnız iç mekân kancası (taban boş)
 *  emitSlices(bp, lot, region)  -> Map('cx,cz' → Uint8Array)  aynı kancayı chunk dilimleriyle (CityWriter, y 0..HEIGHT)
 *  readerOfSlices(map) / readerOfBig(bw)   -> {getBlock(x,y,z)}
 *  regionOf(bp, margin?)        -> {x0,z0,x1,z1}  bina + marj, chunk hizalı
 *  genericImpl(kind) / registerGenericFakes() / unregisterGenericFakes()   16 tür için BSP tabanlı SAHTE iç mekân (boru hattı testleri)
 *  chunkWorld(seed)             -> {getBlock(x,y,z)}  gerçek generateCityChunk ile (kancayla birlikte)
 */
import { CityWriter, ID } from '../cityEmit.js';
import { generateCityChunk } from '../cityGen.js';
import { allLots } from '../cityLots.js';
import { getCityPlan, planBuilding } from '../cityPlan.js';
import { catalogKeysFor, getCatalogDef } from '../../props/propCatalog.js';
import { INTERIOR_KINDS, registerInterior, unregisterInterior } from './registry.js';
import { InteriorBuilder } from './builder.js';
import { bsp, roomAt, spanning } from './kitPlan.js';
import { emitBuildingInterior } from './index.js';

export const HEIGHT = 128;

export class BigWriter {
  constructor(x0, z0, x1, z1, yBase, yEnd) {
    this.x0 = x0;
    this.z0 = z0;
    this.x1 = x1;
    this.z1 = z1;
    this.yBase = yBase;
    this.yEnd = yEnd;
    this.w = x1 - x0;
    this.d = z1 - z0;
    this.blocks = new Uint8Array(this.w * this.d * (yEnd - yBase));
  }

  _i(x, y, z) {
    return ((y - this.yBase) * this.d + (z - this.z0)) * this.w + (x - this.x0);
  }

  _in(x, y, z) {
    return x >= this.x0 && x < this.x1 && z >= this.z0 && z < this.z1 && y >= this.yBase && y < this.yEnd;
  }

  touches(xa, za, xb, zb) {
    return xa < this.x1 && xb > this.x0 && za < this.z1 && zb > this.z0;
  }

  touchesY(ya, yb) {
    return ya < this.yEnd && yb > this.yBase;
  }

  set(x, y, z, id) {
    if (this._in(x, y, z)) this.blocks[this._i(x, y, z)] = id;
  }

  setAir(x, y, z, id) {
    if (this._in(x, y, z) && this.blocks[this._i(x, y, z)] === 0) this.blocks[this._i(x, y, z)] = id;
  }

  get(x, y, z) {
    return this._in(x, y, z) ? this.blocks[this._i(x, y, z)] : 0;
  }

  box(xa, ya, za, xb, yb, zb, id) {
    for (let y = Math.max(ya, this.yBase); y < Math.min(yb, this.yEnd); y++) for (let z = Math.max(za, this.z0); z < Math.min(zb, this.z1); z++) for (let x = Math.max(xa, this.x0); x < Math.min(xb, this.x1); x++) this.blocks[this._i(x, y, z)] = id;
  }

  boxAir(xa, ya, za, xb, yb, zb, id) {
    for (let y = Math.max(ya, this.yBase); y < Math.min(yb, this.yEnd); y++) for (let z = Math.max(za, this.z0); z < Math.min(zb, this.z1); z++) for (let x = Math.max(xa, this.x0); x < Math.min(xb, this.x1); x++) if (this.blocks[this._i(x, y, z)] === 0) this.blocks[this._i(x, y, z)] = id;
  }

  clearBox(xa, ya, za, xb, yb, zb) {
    this.box(xa, ya, za, xb, yb, zb, 0);
  }

  col(x, z, ya, yb, id) {
    this.box(x, ya, z, x + 1, yb, z + 1, id);
  }
}

export function regionOf(bp, margin) {
  const m = margin === undefined ? 4 : margin;
  const it = bp.interior;
  return {
    x0: Math.floor((it.x0 - m) / 16) * 16, z0: Math.floor((it.z0 - m) / 16) * 16, x1: Math.ceil((it.x1 + m) / 16) * 16, z1: Math.ceil((it.z1 + m) / 16) * 16,
  };
}

export function emitWhole(bp, lot, region, fill) {
  const bw = new BigWriter(region.x0, region.z0, region.x1, region.z1, 0, HEIGHT);
  if (fill) bw.blocks.fill(fill);
  emitBuildingInterior(bw, bp, lot);
  return bw;
}

export function emitSlices(bp, lot, region, order) {
  const out = new Map();
  const cks = [];
  for (let cz = region.z0 / 16; cz < region.z1 / 16; cz++) for (let cx = region.x0 / 16; cx < region.x1 / 16; cx++) cks.push([cx, cz]);
  if (order === 'reverse') cks.reverse();
  for (let i = 0; i < cks.length; i++) {
    const [cx, cz] = cks[i];
    const arr = new Uint8Array(HEIGHT * 256);
    const w = new CityWriter(arr, cx * 16, cz * 16, 0, HEIGHT);
    emitBuildingInterior(w, bp, lot);
    out.set(cx + ',' + cz, arr);
  }
  return out;
}

export function readerOfSlices(map) {
  return {
    getBlock(x, y, z) {
      const cx = Math.floor(x / 16);
      const cz = Math.floor(z / 16);
      const arr = map.get(cx + ',' + cz);
      if (!arr || y < 0 || y >= HEIGHT) return 0;
      return arr[(y << 8) + ((z - cz * 16) << 4) + (x - cx * 16)];
    },
  };
}

export function readerOfBig(bw) {
  return { getBlock: (x, y, z) => bw.get(x, y, z) };
}

/** Tüm iç mekânlı binalar (tohum başına) — deterministik sıra (parsel kimliği). */
export function interiorLots(seed, o) {
  const op = o || {};
  const plan = getCityPlan(seed);
  const lots = allLots(plan);
  const out = [];
  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    if (!lot.built) continue;
    const bp = planBuilding(seed, lot);
    if (!bp.interior || !bp.doors[0]) continue;
    if (op.kinds && op.kinds.indexOf(bp.interior.kind) < 0) continue;
    if (op.faces && op.faces.indexOf(bp.doors[0].face) < 0) continue;
    if (op.filter && !op.filter(bp)) continue;
    out.push({ lot, bp });
    if (op.limit && out.length >= op.limit) break;
  }
  return out;
}

export function chunkWorld(seed) {
  const cache = new Map();
  return {
    getBlock(x, y, z) {
      const cx = Math.floor(x / 16);
      const cz = Math.floor(z / 16);
      const k = cx + ',' + cz;
      let c = cache.get(k);
      if (!c) {
        c = generateCityChunk(seed, cx, cz, { light: false });
        cache.set(k, c);
      }
      return c.get(x - cx * 16, y, z - cz * 16);
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Sahte (genel) iç mekân: BSP odaları + katalogdan mobilya
 * ---------------------------------------------------------------------------------------------- */
const FOOT = {
  kapsul_daire: [8, 6, 4], loft: [16, 12, 5], hacker_odasi: [10, 9, 4], oyuncu_odasi: [9, 9, 4], ramen_bari: [14, 9, 4], klinik: [18, 14, 4],
  garaj_atolyesi: [20, 16, 6], kulup: [22, 18, 7], market: [20, 14, 4], cati_bahcesi: [20, 20, 5], kitap_kafe: [14, 12, 4], sanat_studyosu: [16, 12, 6],
  robot_tamirhanesi: [14, 12, 5], arcade: [18, 14, 5], dron_kurye: [16, 12, 5], holo_sinema: [18, 16, 7],
};

function obstacleRects(frame, pad) {
  return frame.obstacles.map((o) => ({ u0: o.u0 - pad, v0: o.v0 - pad, u1: o.u1 + pad, v1: o.v1 + pad }));
}

function planGeneric(lot, rng, variant, ctx) {
  const { frame } = ctx;
  const b = new InteriorBuilder(ctx);
  const du = frame.door.u;
  const noWall = [{ u0: du - 2, v0: 0, u1: du + 3, v1: 3 }].concat(obstacleRects(frame, 1));
  const P = bsp([0, 0, frame.W, frame.D], rng, {
    minU: 4, minV: 4, maxRooms: 1 + variant + rng.i(2), noWall,
  });
  P.rooms.forEach((r) => b.room(r.id, [r.u0, r.v0, r.u1, r.v1], { role: r.id === roomAt(P.rooms, du, 0).id ? 'giris' : 'oda' }));
  const entry = roomAt(P.rooms, du, 0);
  const edges = spanning(P.rooms, P.adj, entry.id, rng, { w: 3, avoid: obstacleRects(frame, 0), extra: 1 });
  edges.forEach((e, i) => {
    b.door('d' + i, e.a, e.b, {
      axis: e.adj.axis, line: e.adj.line, c: e.c, w: e.w, kind: i % 2 ? 'arch' : 'door',
    });
  });
  const keys = catalogKeysFor(ctx.kind).filter((k) => {
    const d = getCatalogDef(k);
    return d.tags.indexOf('door') < 0 && d.tags.indexOf('lockpad') < 0 && d.mount !== 'wall' && d.mount !== 'surface';
  });
  const wallKeys = catalogKeysFor(ctx.kind).filter((k) => getCatalogDef(k).mount === 'wall' && getCatalogDef(k).tags.indexOf('lockpad') < 0);
  let placed = 0;
  const cap = Math.min(40, Math.max(5, Math.floor((frame.W * frame.D) / 7)));
  for (let t = 0; t < 140 && placed < cap; t++) {
    const r = b.rooms[rng.i(b.rooms.length)];
    const u = r.u0 + rng.i(r.u1 - r.u0);
    const v = r.v0 + rng.i(r.v1 - r.v0);
    if (b.prop(keys[rng.i(keys.length)], u, v, rng.i(4))) placed++;
  }
  for (let t = 0; t < 40 && wallKeys.length; t++) {
    const r = b.rooms[rng.i(b.rooms.length)];
    const side = rng.i(4);
    // duvara yakın bir hücre: oda kenarı
    let u = r.u0 + rng.i(r.u1 - r.u0);
    let v = r.v0 + rng.i(r.v1 - r.v0);
    if (side === 0) v = r.v1 - 1;
    else if (side === 2) v = r.v0;
    else if (side === 1) u = r.u1 - 1;
    else u = r.u0;
    b.wallProp(wallKeys[rng.i(wallKeys.length)], u, v, side);
  }
  b.rooms.forEach((r, i) => {
    b.light(r.id, r.u0 + ((r.u1 - r.u0) >> 1), r.v0 + ((r.v1 - r.v0) >> 1), i % 2 ? 'lantern' : 'panel');
  });
  b.signature(entry.u0 + 1, entry.v0 + 1, 0);
  b.chip('oda', entry.u1 - 1, entry.v1 - 1, 0);
  return b.build();
}

export function genericImpl(kind) {
  const f = FOOT[kind];
  return {
    kind,
    name: kind,
    footprint: () => ({ w: f[0], d: f[1], h: f[2] }),
    plan: planGeneric,
    emit(W, interior, ctx) {
      const { kit, pal, frame } = ctx;
      kit.floor(0, 0, frame.W, frame.D, (u, v) => (((u >> 1) + (v >> 1)) & 1 ? pal.floor : pal.floor2));
    },
  };
}

export function registerGenericFakes() {
  INTERIOR_KINDS.forEach((k) => registerInterior(k, genericImpl(k)));
}

export function unregisterGenericFakes() {
  INTERIOR_KINDS.forEach((k) => unregisterInterior(k));
}

export { ID };
