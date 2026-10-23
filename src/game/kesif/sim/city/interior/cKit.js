/*
 * KEŞİF sim/city/interior — interiors_c ORTAK ARAÇLARI (sanat stüdyosu, robot tamirhanesi, arcade, dron kurye merkezi, holo sinema).
 * Saf, belirlenimci (rng çağıranın tohumlu akışı), worker-güvenli; DOM/three/Math.random/Date.now yok. Sözleşme §8.
 *
 * Bir tür modülü `kinds/<tür>.js` şunu yapar:
 *   plan(lot, rng, variant, ctx):  const p = new CPlan(ctx, rng, variant);  p.room(...) · p.door(...) · p.prop(...) · p.op({t:'floor',...}) · ... · return p.finish(extras)
 *   emit(W, interior, ctx):        paintLayout(ctx.kit, ctx.pal, interior.layout)      (yerleşim verisi `interior.layout.ops` içinde taşınır)
 *
 *  CPlan   InteriorBuilder üstünde: oda/kapı/prop/ışık/kilit yardımcıları + yerleşim işlemleri (ops) + yer ayırma (reserve) + dedektif notları
 *  PAINT / paintLayout   yerleşim işlemleri (floor ceil raise box wall disc frame col strip) → Kit çağrıları (pencere kırpmalı; yalnız tek kez, deterministik)
 *  mkPal(name, over)     varsayılan paletin üstüne donuk palet · NEON · hueNeon(hue)
 *  depthLimit(frame)     kule çekirdeği (engel) varsa kullanılabilir derinlik (v < Dm) · freeRect(frame, rect)
 *  makeCode(rng, n) / packCode(code) / lockId(lotId, tag)     kod kilidi yardımcıları
 */
import { B } from '../../blocks.js';
import { signIndexOf } from '../../props/propSigns.js';
import { ID } from '../cityEmit.js';
import { InteriorBuilder } from './builder.js';
import { OWNER_BY_INTERIOR } from '../ownerData.js';
import { PALETTES } from './kit.js';

/** Aksan (emisyon) hücre üst sınırı: graph.js MAX_ACCENT_CELLS = 120; 2 payı bırakılır. */
export const ACCENT_CAP = 118;
export const PROP_CAP = 40;

export const NEON = Object.freeze({
  cyan: ID.NEON_CYAN, pink: ID.NEON_PINK, amber: ID.NEON_AMBER, lime: ID.NEON_LIME,
});
const HUE_NEON = Object.freeze({
  mor: ID.NEON_PINK, pembe: ID.NEON_PINK, camgobegi: ID.NEON_CYAN, mavi: ID.NEON_CYAN, mint: ID.NEON_CYAN, beyaz: ID.NEON_CYAN, yesil: ID.NEON_LIME,
  kehribar: ID.NEON_AMBER, turuncu: ID.NEON_AMBER, sicak: ID.NEON_AMBER, renkli: ID.NEON_PINK,
});
export function hueNeon(hue) {
  return Object.prototype.hasOwnProperty.call(HUE_NEON, hue) ? HUE_NEON[hue] : ID.NEON_CYAN;
}

/** Varsayılan paletin üstüne alan geçersiz kılar; donuk. `name` yalnız hata ayıklama. */
export function mkPal(name, over) {
  return Object.freeze(Object.assign({}, PALETTES.default, over, { name }));
}

/** Küçük, yerel, belirlenimci hash (u,v,tuz) → uint32. */
export function hash2(u, v, s) {
  let x = (Math.imul(u | 0, 0x27d4eb2d) ^ Math.imul(v | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1)) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d) >>> 0;
  x ^= x >>> 12;
  x = Math.imul(x, 0x297a2d39) >>> 0;
  return (x ^ (x >>> 15)) >>> 0;
}

/* ------------------------------------------------------------------------------------------------
 * Çerçeve yardımcıları
 * ---------------------------------------------------------------------------------------------- */
/** Kule çekirdeği (engel) arkada ise kullanılabilir derinlik: v < Dm. Engel yoksa D. Her zaman ≥ 6 (alttan sınırlı). */
export function depthLimit(f) {
  let m = f.D;
  for (let i = 0; i < f.obstacles.length; i++) {
    const o = f.obstacles[i];
    if (o.v0 < m && o.u1 > 0 && o.u0 < f.W) m = o.v0;
  }
  return Math.max(Math.min(m, f.D), Math.min(6, f.D));
}

/** Yerel dikdörtgen engellerle kesişmiyor mu. */
export function freeRect(f, r) {
  return !f.obstacleAt(r[0], r[1], r[2], r[3]);
}

/* ------------------------------------------------------------------------------------------------
 * Kod kilidi
 * ---------------------------------------------------------------------------------------------- */
export function makeCode(rng, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(1 + rng.i(6));
  return out;
}

/** Kod notu `data` alanı (kindKitB ile AYNI şema): basamak başına 3 bit (1..6), uzunluk << 12 (≤ 4 basamak). */
export function packCode(code) {
  let v = 0;
  for (let i = 0; i < code.length && i < 4; i++) v |= (code[i] & 7) << (3 * i);
  return (v | (Math.min(4, code.length) << 12)) & 0xffff;
}

export function unpackCode(n) {
  const len = (n >> 12) & 7;
  const out = [];
  for (let i = 0; i < len && i < 4; i++) out.push((n >> (3 * i)) & 7);
  return out;
}

/** Kilit kimliği `^[0-9a-z]{1,10}$`: 'k' + parsel(36 tabanı) + etiket (1 harf). */
export function lockId(lotId, tag) {
  return 'k' + (lotId >>> 0).toString(36) + tag;
}

/* ------------------------------------------------------------------------------------------------
 * Yerleşim işlemleri (ops): plan sırasında toplanır, emit'te boyanır
 * ---------------------------------------------------------------------------------------------- */
function floorFn(o) {
  const [u0, v0, u1, v1] = o.rect;
  const a = o.a;
  const b = o.b === undefined ? a : o.b;
  const n = o.n || 2;
  const s = o.s || 0;
  switch (o.pat) {
    case 'checker': return (u, v) => (((((u - u0) / n) | 0) + (((v - v0) / n) | 0)) & 1 ? b : a);
    case 'stripeU': return (u) => ((((u - u0) / n) | 0) & 1 ? b : a);
    case 'stripeV': return (u, v) => ((((v - v0) / n) | 0) & 1 ? b : a);
    case 'border': return (u, v) => (u - u0 < n || u1 - 1 - u < n || v - v0 < n || v1 - 1 - v < n ? b : a);
    case 'hazard': return (u, v) => ((((u + v) / n) | 0) & 1 ? b : a);
    case 'grid': return (u, v) => ((u - u0) % n === 0 || (v - v0) % n === 0 ? b : a);
    case 'speckle': return (u, v) => (hash2(u, v, s) % 100 < (o.pct || 8) ? b : a);
    case 'disc': {
      const cu = o.cu;
      const cv = o.cv;
      const r = o.r;
      return (u, v) => {
        const d = Math.sqrt((u + 0.5 - cu) * (u + 0.5 - cu) + (v + 0.5 - cv) * (v + 0.5 - cv));
        if (d < r - 1) return o.c === undefined ? a : o.c;
        if (d < r) return b;
        return null;
      };
    }
    case 'cross': return (u, v) => ((u - u0) % n === 0 && (v - v0) % n === 0 ? b : a);
    case 'dots': return (u, v) => ((u + v) % 2 === 0 && hash2(u, v, s) % 100 < (o.pct || 40) ? b : a);
    default: return () => a;
  }
}

function wallFn(o) {
  const n = o.n || 1;
  const a = o.a;
  const b = o.b === undefined ? a : o.b;
  const c = o.c === undefined ? b : o.c;
  switch (o.pat) {
    case 'wains': return (u, v, y) => (y - o.y0 < n ? a : y - o.y0 === n ? c : b);
    case 'bands': return (u, v, y) => (((y - o.y0) / n | 0) & 1 ? b : a);
    case 'panels': return (u, v, y) => (((u + v) % (o.m || 4) === 0) ? c : (y - o.y0 < n ? a : b));
    case 'dash': return (u, v, y) => (((u + v + (y & 1)) % (o.m || 3) === 0) ? c : a);
    case 'speckle': return (u, v, y) => (hash2(u + y * 31, v + y * 17, o.s || 0) % 100 < (o.pct || 12) ? b : a);
    default: return () => a;
  }
}

export const PAINT = {
  floor(k, p, o) {
    k.floor(o.rect[0], o.rect[1], o.rect[2], o.rect[3], floorFn(o));
  },
  ceil(k, p, o) {
    k.ceiling(o.rect[0], o.rect[1], o.rect[2], o.rect[3], floorFn(o));
  },
  /** Yükseltilmiş kat (h2 yarım blok): tam küpler + varsa üst plaka; üst küp sırası o.top ile boyanabilir. */
  raise(k, p, o) {
    const [u0, v0, u1, v1] = o.rect;
    const full = o.h2 >> 1;
    const cube = o.cube === undefined ? p.floor2 : o.cube;
    if (full > 0) {
      if (o.top !== undefined && !(o.h2 & 1)) {
        if (full > 1) k.box(u0, v0, u1, v1, 0, full - 1, cube);
        k.box(u0, v0, u1, v1, full - 1, full, o.top);
      } else k.box(u0, v0, u1, v1, 0, full, cube);
    }
    if (o.h2 & 1) k.box(u0, v0, u1, v1, full, full + 1, o.slab === undefined ? B.SLAB : o.slab);
  },
  box(k, p, o) {
    k.box(o.rect[0], o.rect[1], o.rect[2], o.rect[3], o.y0, o.y1, o.id);
  },
  col(k, p, o) {
    k.box(o.u, o.v, o.u + 1, o.v + 1, o.y0, o.y1, o.id);
  },
  /** İçi boş çerçeve (ekran/pano çerçevesi): rect'in çevresi, dikey düzlemde değil YATAY dikdörtgen halkası olarak y0..y1. */
  frame(k, p, o) {
    const [u0, v0, u1, v1] = o.rect;
    k.wallU(v0, u0, u1, o.y0, o.y1, o.id);
    k.wallU(v1 - 1, u0, u1, o.y0, o.y1, o.id);
    k.wallV(u0, v0, v1, o.y0, o.y1, o.id);
    k.wallV(u1 - 1, v0, v1, o.y0, o.y1, o.id);
  },
  /** Duvar boyası: axis 'u' → v=line sabit, u lo..hi; 'v' → u=line sabit, v lo..hi. */
  wall(k, p, o) {
    const fn = wallFn(o);
    if (o.axis === 'u') k.wallU(o.line, o.lo, o.hi, o.y0, o.y1, fn);
    else k.wallV(o.line, o.lo, o.hi, o.y0, o.y1, fn);
  },
  /** Dikey düzlemde dikdörtgen yüz (ekran, tablo): axis 'u' → v=line'da u0..u1 × y0..y1, id sabit ya da dizi desen. */
  face(k, p, o) {
    if (o.axis === 'u') k.box(o.lo, o.line, o.hi, o.line + 1, o.y0, o.y1, o.id);
    else k.box(o.line, o.lo, o.line + 1, o.hi, o.y0, o.y1, o.id);
  },
  /** Seyrek nokta serpintisi (yıldızlı tavan, boya lekeleri): rect içinde pct% hücrede y satırına id yazar. */
  scatter(k, p, o) {
    const [u0, v0, u1, v1] = o.rect;
    for (let v = v0; v < v1; v++) {
      for (let u = u0; u < u1; u++) if (hash2(u, v, o.s || 0) % 100 < (o.pct || 6)) k.set(u, v, o.y, o.id);
    }
  },
};

/** interior.layout.ops'u sırayla boyar. Palet adları: {pal:'floor'} gibi dizgeler gerçek blok kimliğine çözülür. */
export function paintLayout(kit, pal, layout) {
  if (!layout || !layout.ops) return;
  const res = (v) => (typeof v === 'string' ? pal[v] : v);
  for (let i = 0; i < layout.ops.length; i++) {
    const o = layout.ops[i];
    const fn = PAINT[o.t];
    if (!fn) continue;
    const q = Object.assign({}, o);
    ['a', 'b', 'c', 'id', 'cube', 'slab', 'top'].forEach((f) => { if (q[f] !== undefined) q[f] = res(q[f]); });
    if (o.rect && !kit.touches(o.rect[0] - 1, o.rect[1] - 1, o.rect[2] + 1, o.rect[3] + 1)) continue;
    fn(kit, pal, q);
  }
}

/* ------------------------------------------------------------------------------------------------
 * CPlan
 * ---------------------------------------------------------------------------------------------- */
const OPP = [2, 3, 0, 1];

export class CPlan {
  constructor(ctx, rng, variant) {
    this.ctx = ctx;
    this.f = ctx.frame;
    this.rng = rng;
    this.v = variant | 0;
    this.b = new InteriorBuilder(ctx);
    this.W = this.f.W;
    this.D = this.f.D;
    this.H = this.f.H;
    this.du = this.f.door.u;
    this.Dm = depthLimit(this.f);
    // iç kullanım alanı: kabuğa (dış duvar) bitişik yanlarda 1 hücrelik kaplama (liner) bırakılır; bölme duvarı olarak boyanır
    const adj = this.f.adj;
    this.iu0 = adj.l ? 1 : 0;
    this.iu1 = this.W - (adj.r ? 1 : 0);
    this.iv1 = this.Dm - (this.Dm >= this.D && adj.b ? 1 : 0);
    if (this.du - 1 < this.iu0) this.iu0 = Math.max(0, this.du - 1);
    if (this.du + 2 > this.iu1) this.iu1 = Math.min(this.W, this.du + 2);
    this.ops = [];
    this.pois = [];
    this.clues = [];
    this.screens = [];
    this.locks = [];
    this.notes = [];
    this.npc = null;
    this.anchors = [];
    this.rooms = {};
    this.count = 0;
    this.accCells = 0;
    this.essential = new Set(['kasa_masasi', 'kurye_tezgahi', 'odul_tezgahi', 'servo_tezgahi', 'holo_perde', 'skor_tablosu', 'dron_istasyonu', 'neon_tabela_ic']);
  }

  /* ------------------------------------------------------------------ odalar, kapılar, yer ayırma */
  room(id, rect, o) {
    const r = this.b.room(id, rect, o);
    this.rooms[id] = r;
    return r;
  }

  door(id, a, bb, spec) {
    return this.b.door(id, a, bb, spec);
  }

  op(o) {
    this.ops.push(o);
    return o;
  }

  /** Dünya çarpışma kutusu ayırır: sonraki prop yerleşimleri bu hacimle örtüşemez (blokla yapılan sabit dekor için). */
  reserve(rect, y0, y1) {
    const w = this.f.rect(rect[0], rect[1], rect[2], rect[3]);
    this.b._boxes.push({ box: [w[0], this.b.base + y0, w[1], w[2], this.b.base + y1, w[3]], slot: -1 });
  }

  /** Yerel hücre (u,v), zeminden y yüksekliğinde (satır) ayak/baş boşluğu serbest mi (prop çarpışmalarına göre). */
  clear(u, v, y) {
    const c = this.f.cell(u, v);
    const ya = this.b.base + (y || 0);
    for (let i = 0; i < this.b._boxes.length; i++) {
      const bx = this.b._boxes[i].box;
      if (bx[0] < c[0] + 1 && bx[3] > c[0] && bx[2] < c[1] + 1 && bx[5] > c[1] && bx[4] > ya + 0.01 && bx[1] < ya + 1.8) return false;
    }
    return true;
  }

  /* ------------------------------------------------------------------ proplar */
  prop(key, u, v, ly, o) {
    const s = this.b.prop(key, u, v, ly, o || undefined);
    if (s) this.count++;
    else if (CPlan.onFail) CPlan.onFail('prop', key, u, v, ly);
    return s;
  }

  wallProp(key, u, v, side, o) {
    const s = this.b.wallProp(key, u, v, side, o || undefined);
    if (s) this.count++;
    else if (CPlan.onFail) CPlan.onFail('wall', key, u, v, side);
    return s;
  }

  /** (u,v) etrafında en yakın geçerli yerleşim (halka halka, belirlenimci sıra); rad hücre yarıçapı. */
  near(key, u, v, ly, o, rad) {
    const R = rad === undefined ? 3 : rad;
    for (let r = 0; r <= R; r++) {
      for (let dv = -r; dv <= r; dv++) {
        for (let du = -r; du <= r; du++) {
          if (Math.max(Math.abs(du), Math.abs(dv)) !== r) continue;
          const s = this.prop(key, u + du, v + dv, ly, o);
          if (s) return s;
        }
      }
    }
    return null;
  }

  /** Aday listesinden ilk geçerli: cands = [[u,v,ly,o?], …]. */
  first(key, cands, o) {
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      const s = this.prop(key, c[0], c[1], c[2], c[3] || o);
      if (s) return s;
    }
    return null;
  }

  /** Oda dikdörtgeni içinde kesirli konum (a,b ∈ [0,1]) → [u,v] (her zaman odanın içinde). */
  rel(roomId, a, b) {
    const r = this.rooms[roomId];
    return [r.u0 + Math.max(0, Math.min(r.u1 - r.u0 - 1, Math.floor((r.u1 - r.u0 - 1) * a + 0.5))), r.v0 + Math.max(0, Math.min(r.v1 - r.v0 - 1, Math.floor((r.v1 - r.v0 - 1) * b + 0.5)))];
  }

  /** Odanın bir duvarına bitişik hücreler (duvar boyunca sıralı). side: 0 arka(+v), 1 sağ(+u), 2 ön(-v), 3 sol(-u). */
  wallCells(roomId, side) {
    const r = this.rooms[roomId];
    const out = [];
    if (side === 0) for (let u = r.u0; u < r.u1; u++) out.push([u, r.v1 - 1]);
    else if (side === 2) for (let u = r.u0; u < r.u1; u++) out.push([u, r.v0]);
    else if (side === 1) for (let v = r.v0; v < r.v1; v++) out.push([r.u1 - 1, v]);
    else for (let v = r.v0; v < r.v1; v++) out.push([r.u0, v]);
    return out;
  }

  /**
   * Duvar boyunca zemin propu dizisi (odaya bakar). keys: dizge ya da dizi (döngüsel); o: {from=0, step=1, count=∞, rev:bool, only:[idx], y, variant:true}.
   * Yerleşemeyen hücre atlanır (1 ilerler); yerleşince `step` ilerler. Dönen: yerleşen PropSpec dizisi.
   */
  fillWall(roomId, side, keys, o) {
    const op = o || {};
    const ks = Array.isArray(keys) ? keys : [keys];
    let cells = this.wallCells(roomId, side);
    if (op.rev) cells = cells.slice().reverse();
    const ly = (side + 2) & 3;
    const out = [];
    let i = op.from || 0;
    const step = op.step || 1;
    const count = op.count === undefined ? 1e9 : op.count;
    while (i < cells.length && out.length < count) {
      const c = cells[i];
      const po = op.y !== undefined ? { y: op.y } : {};
      if (op.variant !== false) po.variant = (out.length + i) & 3;
      const s = this.prop(ks[out.length % ks.length], c[0], c[1], ly, po);
      i += s ? step : 1;
      if (s) out.push(s);
    }
    return out;
  }

  /** Duvara monte prop dizisi (wallProp): cells = wallCells indeksleri ya da kesirler; o: {y, count, from, step, variant}. */
  mountWall(roomId, side, key, o) {
    const op = o || {};
    const cells = this.wallCells(roomId, side);
    const out = [];
    let i = op.from || 0;
    const step = op.step || 1;
    const count = op.count === undefined ? 1e9 : op.count;
    while (i < cells.length && out.length < count) {
      const c = cells[i];
      const po = { y: op.y === undefined ? 1.4 : op.y };
      if (op.data !== undefined) po.data = op.data;
      po.variant = op.variant === undefined ? (out.length + i) & 7 : op.variant;
      const s = this.wallProp(key, c[0], c[1], side, po);
      i += s ? step : 1;
      if (s) out.push(s);
    }
    return out;
  }

  /** Satır: (u,v)'den (du,dv) adımıyla n adet; yerleşenleri dizi olarak döner. */
  row(key, u, v, du, dv, n, ly, o) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const s = this.prop(key, u + du * i, v + dv * i, ly, o);
      if (s) out.push(s);
    }
    return out;
  }

  /** Duvar boyunca (oda hücresi sırası) duvara monte prop: side = hücreden duvara yön. cells = [[u,v], …]. */
  wallRow(key, cells, side, o) {
    const out = [];
    for (let i = 0; i < cells.length; i++) {
      const s = this.wallProp(key, cells[i][0], cells[i][1], side, o);
      if (s) out.push(s);
    }
    return out;
  }

  /** Rastgele serpiştirme (belirlenimci): rect içinde keys'ten n adet; tries deneme. */
  scatter(keys, rect, n, tries, o) {
    let placed = 0;
    for (let t = 0; t < tries && placed < n; t++) {
      const u = rect[0] + this.rng.i(rect[2] - rect[0]);
      const v = rect[1] + this.rng.i(rect[3] - rect[1]);
      const key = keys[this.rng.i(keys.length)];
      if (this.prop(key, u, v, this.rng.i(4), o)) placed++;
    }
    return placed;
  }

  /* ------------------------------------------------------------------ ışık, imza, çip, pano */
  light(roomId, u, v, type, o) {
    return this.b.light(roomId, u, v, type, o);
  }

  lightGrid(roomId, n, type, o) {
    return this.b.lightGrid(roomId, n, type, o);
  }

  accent(u0, v0, u1, v1, y0, y1, block) {
    const cells = Math.max(0, (u1 - u0) * (v1 - v0) * (y1 - y0));
    if (this.accCells + cells > ACCENT_CAP) return false;
    this.accCells += cells;
    this.b.accent(u0, v0, u1, v1, y0, y1, block);
    return true;
  }

  /** Tavana gömülü (flush) ışık: panel → tavan satırı; neon/holo → tavan satırına gömülür (asılı küp değil). */
  lamp(roomId, u, v, type) {
    return this.b.light(roomId, u, v, type, type === 'panel' ? undefined : { drop: -1 });
  }

  /** Tavan ışık şeridi (flush, aksan bütçesine sayılır): yerel dikdörtgen, blok. */
  ceilStrip(u0, v0, u1, v1, block) {
    return this.accent(u0, v0, u1, v1, this.H, this.H + 1, block);
  }

  /**
   * Kullanılabilir genişliği ikiye böler: ikincil oda (genişlik sw) kapıdan UZAK yanda (giriş hücresi ana odada kalır).
   * Dönen: {right, m0, m1 (ana oda u aralığı), s0, s1 (ikincil), wl (aradaki duvar sütunu)}.
   */
  split(sw) {
    const dl = this.du - 1; // kapı hücreleri [dl, dr)
    const dr = this.du + 2;
    const maxR = this.iu1 - dr - 1;
    const maxL = dl - this.iu0 - 1;
    const wi = this.iu1 - this.iu0;
    const cap = Math.max(3, wi - 7);
    let right = this.du < (this.iu0 + this.iu1) / 2;
    if ((right ? maxR : maxL) < 3) right = !right;
    const avail = Math.min(right ? maxR : maxL, cap);
    const w = Math.max(3, Math.min(sw, avail));
    if (avail < 3) {
      // ikincil oda sığmaz: tek oda (ikincil boş)
      return {
        right: true, m0: this.iu0, m1: this.iu1, s0: this.iu1, s1: this.iu1, wl: this.iu1, none: true,
      };
    }
    if (right) {
      const m1 = this.iu1 - w - 1;
      return {
        right, m0: this.iu0, m1, s0: m1 + 1, s1: this.iu1, wl: m1, none: false,
      };
    }
    const s1 = this.iu0 + w;
    return {
      right, m0: s1 + 1, m1: this.iu1, s0: this.iu0, s1, wl: s1, none: false,
    };
  }

  /** Oda içinde düzenli 4 (ya da n) gömülü tavan lambası; types döngüsel. */
  lampGrid(roomId, types, n) {
    const r = this.rooms[roomId];
    const w = r.u1 - r.u0;
    const d = r.v1 - r.v0;
    const q = (a, b) => [r.u0 + Math.min(w - 1, Math.floor(w * a)), r.v0 + Math.min(d - 1, Math.floor(d * b))];
    const spots = (n || 4) <= 1 ? [q(0.5, 0.5)] : n === 2 ? (w >= d ? [q(0.25, 0.5), q(0.75, 0.5)] : [q(0.5, 0.25), q(0.5, 0.75)])
      : n === 3 ? [q(0.25, 0.3), q(0.75, 0.3), q(0.5, 0.75)] : [q(0.25, 0.3), q(0.75, 0.3), q(0.25, 0.75), q(0.75, 0.75)];
    spots.forEach((c, i) => this.lamp(roomId, c[0], c[1], types[i % types.length]));
  }

  /** Duvar boyunca (kaplama sütunu/satırı) gömülü neon çizgisi; side: 'l' | 'r' | 'b' (arka). Aksan bütçesine sayılır. */
  wallStrip(side, y, lo, hi, block) {
    if (side === 'l') this.accent(this.iu0 - 1, lo, this.iu0, hi, y, y + 1, block);
    else if (side === 'r') this.accent(this.iu1, lo, this.iu1 + 1, hi, y, y + 1, block);
    else this.accent(lo, this.iv1, hi, this.iv1 + 1, y, y + 1, block);
  }

  /** Gizli/kapı propu (door etiketli): kapı hücresine elle koyar (builder `prop:false` kapıları için). */
  doorProp(door, key, o) {
    const spec = {
      kind: key, x: door.x + 0.5, y: door.y, z: door.z + 0.5, yaw: door.axis === 'x' ? 0 : 1, variant: (o && o.variant) || 0, lotId: this.ctx.lot.id, slot: this.b._slot++,
    };
    this.b._props.push(spec);
    this.count++;
    return spec;
  }

  /** Kabuğa bitişik yanlardaki kaplama (liner) duvarlarını boyar (ops): pat/a/b/c/n/m `wall` işlemi seçenekleri. */
  liner(o) {
    const y0 = o.y0 === undefined ? 0 : o.y0;
    const y1 = o.y1 === undefined ? this.H : o.y1;
    const base = Object.assign({ t: 'wall', y0, y1 }, o);
    if (this.iu0 > 0) this.op(Object.assign({}, base, { axis: 'v', line: this.iu0 - 1, lo: 0, hi: this.iv1 + 1 }));
    if (this.iu1 < this.W) this.op(Object.assign({}, base, { axis: 'v', line: this.iu1, lo: 0, hi: this.iv1 + 1 }));
    if (this.iv1 < this.Dm) this.op(Object.assign({}, base, { axis: 'u', line: this.iv1, lo: this.iu0, hi: this.iu1 }));
  }

  /** Sahibin duracağı yer (NPC sistemi okur): en yakın boş hücre. */
  stand(u, v, ly, rad) {
    const R = rad === undefined ? 2 : rad;
    for (let r = 0; r <= R; r++) {
      for (let dv = -r; dv <= r; dv++) {
        for (let du = -r; du <= r; du++) {
          if (Math.max(Math.abs(du), Math.abs(dv)) !== r) continue;
          const uu = u + du;
          const vv = v + dv;
          if (!this.f.inRect(uu, vv) || this.f.isObstacle(uu, vv)) continue;
          if (!this.inAnyRoom(uu, vv) || !this.clear(uu, vv, 0)) continue;
          const c = this.f.pt(uu, vv);
          this.npc = {
            x: c[0], y: this.b.base, z: c[1], yaw: this.f.yaw(ly), room: this.roomIdAt(uu, vv), u: uu, v: vv,
          };
          this.anchors.push({
            type: 'owner', x: c[0], y: this.b.base, z: c[1], yaw: this.f.yaw(ly), room: this.npc.room,
          });
          return this.npc;
        }
      }
    }
    return null;
  }

  roomIdAt(u, v) {
    for (let i = 0; i < this.b.rooms.length; i++) {
      const r = this.b.rooms[i];
      if (u >= r.u0 && u < r.u1 && v >= r.v0 && v < r.v1 && r.y0 === 0) return r.id;
    }
    return null;
  }

  /** Çapa kaydı (Interior.anchors): {type,x,y,z,yaw,...} — courier_desk, owner, park vb. */
  anchor(type, u, v, ly, y, extra) {
    const c = this.f.pt(Math.floor(u), Math.floor(v));
    const a = Object.assign({
      type, x: c[0], y: this.b.base + (y || 0), z: c[1], yaw: this.f.yaw(ly), room: this.roomIdAt(Math.floor(u), Math.floor(v)),
    }, extra || null);
    this.anchors.push(a);
    return a;
  }

  inAnyRoom(u, v) {
    for (let i = 0; i < this.b.rooms.length; i++) {
      const r = this.b.rooms[i];
      if (u >= r.u0 && u < r.u1 && v >= r.v0 && v < r.v1 && r.y0 === 0) return true;
    }
    return false;
  }

  /** İmza eşyası konumu: (u,v) çevresinde boş hücre (y satır, tezgâh üstü için 1). */
  signature(u, v, y, rad) {
    const R = rad === undefined ? 2 : rad;
    for (let r = 0; r <= R; r++) {
      for (let dv = -r; dv <= r; dv++) {
        for (let du = -r; du <= r; du++) {
          if (Math.max(Math.abs(du), Math.abs(dv)) !== r) continue;
          const uu = u + du;
          const vv = v + dv;
          if (!this.f.inRect(uu, vv) || this.f.isObstacle(uu, vv) || !this.inAnyRoom(uu, vv)) continue;
          return this.b.signature(uu, vv, y);
        }
      }
    }
    return this.b.signature(u, v, y);
  }

  /** Çip: (u,v) çevresinde engelsiz hücre. */
  chip(slot, u, v, y, rad) {
    const R = rad === undefined ? 3 : rad;
    for (let r = 0; r <= R; r++) {
      for (let dv = -r; dv <= r; dv++) {
        for (let du = -r; du <= r; du++) {
          if (Math.max(Math.abs(du), Math.abs(dv)) !== r) continue;
          const uu = u + du;
          const vv = v + dv;
          if (!this.f.inRect(uu, vv) || this.f.isObstacle(uu, vv) || !this.inAnyRoom(uu, vv) || !this.clear(uu, vv, y || 0)) continue;
          this.b.chip(slot, uu, vv, y);
          return true;
        }
      }
    }
    return false;
  }

  /** Tabela/pano `data` alanı: dükkân kimliği → SIGN indeksi (yoksa 0). */
  brandData(id) {
    const i = signIndexOf('brand', id);
    return i >= 0 ? i : 0;
  }

  adData(id) {
    const i = signIndexOf('ad', id);
    return i >= 0 ? i : 0;
  }

  /* ------------------------------------------------------------------ kilit */
  /**
   * Kod kilidi + ipucu. `lock` kapıya verilir; ipucu (kod_notu) `clueRoom` odasında duvara asılır (kilidin ÖNÜNDEKİ oda).
   * Dönen: {lock, code} — ipucu yerleşemezse kilit 'serbest' olur (asla çözümsüz kilit üretilmez).
   */
  makeKod(tag, tier, n) {
    const code = makeCode(this.rng, n);
    const lot = this.ctx.lot.id;
    const lock = { id: lockId(lot, tag), kind: 'kod', tier, data: { code, len: n, kod: code.slice() } };
    return lock;
  }

  makeHack(tag, tier, game) {
    const lot = this.ctx.lot.id;
    return { id: lockId(lot, tag), kind: 'mini_hack', tier, data: { game, seed: this.rng.u() & 0xffff } };
  }

  /** İpucu notunu oda duvarına asar; konum adayları (oda içi duvar hücreleri) taranır. Dönen: PropSpec | null. */
  clueNote(lock, roomId, prefer) {
    const r = this.rooms[roomId];
    const cand = [];
    const pushWall = (side) => {
      if (side === 0) for (let u = r.u0; u < r.u1; u++) cand.push([u, r.v1 - 1, 0]);
      else if (side === 2) for (let u = r.u0; u < r.u1; u++) cand.push([u, r.v0, 2]);
      else if (side === 1) for (let v = r.v0; v < r.v1; v++) cand.push([r.u1 - 1, v, 1]);
      else for (let v = r.v0; v < r.v1; v++) cand.push([r.u0, v, 3]);
    };
    const order = prefer && prefer.length ? prefer : [0, 1, 3, 2];
    for (let i = 0; i < order.length; i++) pushWall(order[i]);
    // belirlenimci karıştırma: başlangıç kayması
    const off = cand.length ? this.rng.i(cand.length) : 0;
    for (let k = 0; k < cand.length; k++) {
      const c = cand[(k + off) % cand.length];
      const s = this.b.wallProp('kod_notu', c[0], c[1], c[2], { data: packCode(lock.data.code), room: roomId, y: 1.25 });
      if (s) {
        this.count++;
        this.clues.push({ lockId: lock.id, slot: s.slot, room: roomId, x: s.x, y: s.y, z: s.z });
        return s;
      }
    }
    return null;
  }

  /**
   * Kilit düzeneğini (kod_paneli/kart_okuyucu/hack_terminali) kapının A odası tarafına, olmazsa B tarafına koyar. front: kapının ÖNÜNDEKİ (oyuncunun yaklaştığı, kilitli) oda kimliği;
   * kapı `p.door(id, right ? A : B, right ? B : A)` gibi aynalı verilmişse A derin oda olabilir → düzenek derinde kalır, oyuncu dışarıdan açamaz (qa_gpu QA5-G-006): front kapının odalarından biriyse o taraf önce denenir.
   */
  pad(door, kind, front) {
    const gr = front ? this.b._graph.find((e) => e[2] === door.id) : null;
    const first = gr && gr[1] === front && gr[0] !== front ? 'b' : 'a';
    const second = first === 'a' ? 'b' : 'a';
    const s = this.b.lockPad(door, first, kind) || this.b.lockPad(door, second, kind);
    if (s) this.count++;
    return s;
  }

  /** Prop sayısı hedefin altındaysa duvara/zemine dekor ekler (belirlenimci). floorKeys: zemin, wallKeys: duvar propları. */
  topUp(target, floorKeys, wallKeys) {
    const rs = this.b.rooms.filter((r) => r.y0 === 0);
    for (let t = 0; t < 240 && this.b._props.length < target && rs.length; t++) {
      const r = rs[this.rng.i(rs.length)];
      if (wallKeys && wallKeys.length && (!floorKeys || !floorKeys.length || this.rng.chance(0.5))) {
        const side = this.rng.i(4);
        let u = r.u0 + this.rng.i(r.u1 - r.u0);
        let v = r.v0 + this.rng.i(r.v1 - r.v0);
        if (side === 0) v = r.v1 - 1;
        else if (side === 2) v = r.v0;
        else if (side === 1) u = r.u1 - 1;
        else u = r.u0;
        this.wallProp(wallKeys[this.rng.i(wallKeys.length)], u, v, side, { variant: this.rng.i(8), y: 1.4 });
      } else if (floorKeys && floorKeys.length) {
        const u = r.u0 + this.rng.i(r.u1 - r.u0);
        const v = r.v0 + this.rng.i(r.v1 - r.v0);
        this.prop(floorKeys[this.rng.i(floorKeys.length)], u, v, this.rng.i(4), { variant: this.rng.i(4) });
      }
    }
  }

  /** Prop sayısını üst sınıra indirir: sondan başlayıp 'essential' olmayan, kapı/kilit olmayan çarpışmasız/dekor propları atar. */
  trimProps(max) {
    const props = this.b._props;
    for (let i = props.length - 1; i >= 0 && props.length > max; i--) {
      const s = props[i];
      if (this.essential.has(s.kind) || s.kind === 'kapi' || s.kind === 'kapi_genis' || s.kind === 'gizli_kapi_raf' || s.kind === 'kod_paneli' || s.kind === 'kart_okuyucu' || s.kind === 'hack_terminali' || s.kind === 'kod_notu') continue;
      props.splice(i, 1);
      for (let k = this.b._boxes.length - 1; k >= 0; k--) if (this.b._boxes[k].slot === s.slot) this.b._boxes.splice(k, 1);
    }
  }

  /**
   * Kilitli kapı kurar: düzenek (pad) + (kod ise) ipucu notu (kilidin ÖNÜNDEKİ `clueRoom` odasında) + kayıt. Düzenek ya da ipucu
   * yerleşemezse kilit 'serbest' olur (asla çözümsüz/ulaşılamaz kilit üretilmez). Dönen: kayıt.
   */
  guard(door, lock, clueRoom, prefer) {
    const pad = this.pad(door, lock.kind, clueRoom);
    let note = null;
    if (!pad) {
      lock.kind = 'serbest';
      lock.tier = 0;
      lock.data = {};
    } else if (lock.kind === 'kod') {
      note = this.clueNote(lock, clueRoom, prefer);
      if (!note) {
        lock.kind = 'serbest';
        lock.tier = 0;
        lock.data = {};
      } else lock.data.clue = { slot: note.slot, key: 'kod_notu' };
    }
    const rec = {
      id: lock.id, kind: lock.kind, tier: lock.tier, data: lock.data, door: door.id, clue: note ? { type: 'prop', key: 'kod_notu', room: clueRoom, slot: note.slot } : null,
      pad: pad ? pad.slot : -1,
    };
    this.locks.push(rec);
    return rec;
  }

  /* ------------------------------------------------------------------ çıktı */
  finish(extra) {
    this.trimProps(PROP_CAP);
    if (!this.npc) {
      const s = this.b._sig;
      const l = s ? this.f.local(Math.floor(s.x), Math.floor(s.z)) : [this.du, 2];
      this.stand(l[0], l[1], 0, 8) || this.stand(this.du, 2, 0, 12);
    }
    const it = this.b.build();
    const ex = extra || {};
    it.layout = {
      v: this.v, W: this.W, D: this.D, H: this.H, Dm: this.Dm, ops: this.ops, rooms: this.b.rooms.map((r) => [r.u0, r.v0, r.u1, r.v1, r.y0, r.y1, r.id]),
    };
    const base = it.mood || { hue: 'beyaz', light: 10, ambient: 'vent' };
    const mo = ex.mood || {};
    it.mood = { hue: mo.hue || base.hue, light: mo.light || base.light, ambient: base.ambient };
    it.ambient = base.ambient;
    it.kindOwnerId = this.b.owner ? this.b.owner.id : (OWNER_BY_INTERIOR[this.ctx.kind] ? OWNER_BY_INTERIOR[this.ctx.kind].id : null);
    it.ownerPost = this.npc ? { x: this.npc.x, y: this.npc.y, z: this.npc.z, yaw: this.npc.yaw, room: this.npc.room } : null;
    it.anchors = this.anchors;
    it.pois = this.pois;
    it.clues = this.clues;
    const have = new Set(it.props.map((s) => s.slot));
    this.screens.forEach((s) => {
      if (s.slots) s.slots = s.slots.filter((q) => have.has(q));
      if (s.games) s.games = s.games.filter((q) => have.has(q.slot));
    });
    it.screens = this.screens;
    it.locks = this.locks;
    it.hidden = ex.hidden || null;
    if (ex.post) ex.post(it);
    return it;
  }
}

/** Hata ayıklama: yerleşemeyen prop denemelerini bildirir (testler/araçlar atar; varsayılan null). */
CPlan.onFail = null;

export { OPP };
