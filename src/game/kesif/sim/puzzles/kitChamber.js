/*
 * KEŞİF bulmaca altyapısı — ortak oda kabuğu `buildChamber` (saf).
 *
 * Yerel çerçeve için bkz. kitGeometry.js. Kabuk düzeni (yerel koordinatlar, iç hacim w×d×h):
 *   oda içi        lx∈[x0,x1] (ortalı), ly∈[0,h−1], lz∈[0,d−1]       (havayla oyulur, arazi silinir)
 *   zemin          ly=−1 (dama dokulu), ly=−2 (temel taş)            → düşme/boşluk yok (güvenli zemin)
 *   tavan          ly=h, h+1
 *   duvarlar       CHAMBER_WALL = 2 hücre kalınlık (iç katman + dış katman); köşeler 2×2 sütun
 *   ön kapı        lz=−2,−1 duvarında, ortada, her zaman AÇIK (çıkış garantisi): genişlik 3 (w≥5) ya da 1, yükseklik
 *                  min(3,h−1); sütun+lento çerçeve; dış yüzde parlayan rün süsü; önünde 2 hücrelik düz yaklaşım
 *   arka kapı      opsiyonel (lz=d,d+1): 'locked' (kilitli kapı bloğu; bulmaca çözülünce doorEffects ile açılır),
 *                  'open' (açık) ya da false (düz duvar); arkasında yine 2 hücrelik yaklaşım
 *   ışık           iç duvar katmanında fener oyukları (+ geniş odada tavan oyuğu); kapı dışında meşaleler
 *   süs            tavan altında parlayan rün şeridi + sütun başlıkları (tema `glow` bloğu; etkileşimsiz, dekor)
 *
 * Zincirleme: ardışık odalar `chainOrigin(origin, facing, d)` ile yerleştirilirse önceki odanın arka yaklaşımı ile
 * sonrakinin ön yaklaşımı AYNI hücrelerde buluşur (6 hücrelik kesintisiz koridor).
 * Dekor rastgeleliği konum-hash'idir (rng değil): her chunk aynı odayı yeniden kurup kendi kesitini alınca sonuç özdeş.
 */
import { B } from '../blocks.js';
import {
  frame, localBoxToWorld, localToWorld, localXRange,
} from './kitGeometry.js';
import { resolveTheme } from './kitThemes.js';

/** Duvar kalınlığı (hücre). Oda dış kutusu = iç kutu + CHAMBER_WALL her yöne. */
export const CHAMBER_WALL = 2;
/** Kapı dışındaki düz yaklaşım hücre sayısı. */
export const CHAMBER_APPROACH = 2;

/** İç derinlik d olan odadan sonra zincirdeki sonraki odanın origin'i için yerel lz kayması. */
export function chamberChainOffset(d) {
  return d + 2 * CHAMBER_WALL + CHAMBER_APPROACH;
}

/** Zincirdeki sonraki odanın dünya origin'i (aynı facing ile kullan). */
export function chainOrigin(origin, facing, d) {
  return localToWorld(origin, facing, 0, 0, chamberChainOffset(d));
}

/** buildChamber boyut sınırlayıcı: bulmaca `footprint()` içinde de aynı sıkıştırmayı kullan. */
export function chamberSize(w, d, h) {
  const c = (v, lo, hi, def) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return def;
    return Math.max(lo, Math.min(hi, n));
  };
  return { w: c(w, 3, 41, 7), d: c(d, 3, 41, 7), h: c(h, 3, 24, 5) };
}

/** Kapı hücrelerini dünya hücre listesi olarak döner. */
function doorCells(F, hd, doorH, lzA, lzB) {
  const cells = [];
  for (let lz = lzA; lz <= lzB; lz++) {
    for (let lx = -hd; lx <= hd; lx++) {
      for (let ly = 0; ly < doorH; ly++) cells.push(F.toWorld(lx, ly, lz));
    }
  }
  return cells;
}

function buildDoor(F, t, side, mode, g) {
  const { d, hd, doorH } = g;
  const front = side === 'front';
  const wallA = front ? -2 : d;
  const wallB = wallA + 1;
  const outerLz = front ? -2 : d + 1;
  const innerLz = front ? -1 : d;
  const appA = front ? -4 : d + 2;
  const appB = front ? -3 : d + 3;
  const nearApp = front ? -3 : d + 2;
  const fillId = mode === 'locked' ? t.lock : 0;
  // çerçeve: iki sütun + lento
  F.fill(-hd - 1, 0, wallA, -hd - 1, doorH - 1, wallB, t.pillar);
  F.fill(hd + 1, 0, wallA, hd + 1, doorH - 1, wallB, t.pillar);
  F.fill(-hd - 1, doorH, wallA, hd + 1, doorH, wallB, t.pillar);
  // açıklık
  F.fill(-hd, 0, wallA, hd, doorH - 1, wallB, fillId);
  // dış yüz rün süsü (lento üstü)
  for (let lx = -hd - 1; lx <= hd + 1; lx++) {
    if ((lx & 1) === 0) F.set(lx, doorH + 1, outerLz, t.glow);
  }
  F.fill(-hd, -1, wallA, hd, -1, wallB, t.floor);
  // düz yaklaşım: temel + zemin + baş boşluğu + meşaleler
  F.fill(-hd - 1, -2, appA, hd + 1, -2, appB, t.base);
  F.fill(-hd - 1, -1, appA, hd + 1, -1, appB, t.wall);
  F.fill(-hd, -1, appA, hd, -1, appB, t.floor);
  F.fill(-hd, 0, appA, hd, doorH - 1, appB, 0);
  F.set(-hd - 1, 0, nearApp, t.torch);
  F.set(hd + 1, 0, nearApp, t.torch);
  const c = F.toWorld(0, 0, innerLz);
  return {
    side,
    mode,
    open: mode !== 'locked',
    lockId: t.lock,
    width: 2 * hd + 1,
    height: doorH,
    lz: innerLz,
    x: c.x,
    y: c.y,
    z: c.z,
    cells: doorCells(F, hd, doorH, wallA, wallB),
  };
}

function pickEvenly(list, n) {
  if (n <= 0) return [];
  if (n >= list.length) return list;
  const out = [];
  for (let i = 0; i < n; i++) out.push(list[Math.floor(((i + 0.5) * list.length) / n)]);
  return out;
}

/**
 * Bölge temalı oda kabuğunu kurar (yalnızca ctx.setBlock; chunk dışı yazımlar çağıranca atılır).
 *
 * opts: { w,d,h, theme?: tema|anahtar|bölge (varsayılan ctx.theme), doorFront=true, doorBack=false|'locked'|'open'|true,
 *         lights='auto'|sayı, trim=true }
 * Döner: {
 *   inner:{x0,y0,z0,x1,y1,z1}      YEREL iç kutu (uçlar dahil),   innerWorld / outerWorld: dünya AABB,
 *   w,d,h, theme, floorY (dünya zemin bloğu y'si),
 *   doorFront:{x,y,z,cells,open,lockId,...}   dünya hücresi (iç uçta zemin hücresi) + tüm kapı hücreleri,
 *   doorBack: aynı biçim | null,   lights:[{lx,ly,lz,kind}]
 * }
 */
export function buildChamber(ctx, opts) {
  const o = opts || {};
  const size = chamberSize(o.w, o.d, o.h);
  const { w, d, h } = size;
  const t = resolveTheme(o.theme !== undefined ? o.theme : ctx.theme, ctx.zone);
  const F = frame(ctx);
  const xr = localXRange(w);
  const x0 = xr.x0;
  const x1 = xr.x1;
  const W = CHAMBER_WALL;
  const hd = w >= 5 ? 1 : 0;
  const doorH = Math.min(3, h - 1);
  const lightY = Math.max(1, Math.min(2, h - 2));
  const g = { d, hd, doorH };

  /* 1) Kabuk: temel, zemin, duvar, tavan, köşe sütunları */
  F.paint(x0 - W, -2, -W, x1 + W, h + 1, d - 1 + W, (lx, ly, lz) => {
    if (ly === -2) return t.base;
    const inside = lx >= x0 && lx <= x1 && lz >= 0 && lz <= d - 1;
    if (ly === -1) {
      if (!inside) return t.wall;
      return ((lx + lz) & 1) === 0 ? t.floor : t.floorAlt;
    }
    if (ly >= h) return F.chance(lx, ly, lz, t.altChance * 0.5, 7) ? t.wallAlt : t.ceiling;
    if ((lx < x0 || lx > x1) && (lz < 0 || lz > d - 1)) return t.pillar;
    return F.chance(lx, ly, lz, t.altChance) ? t.wallAlt : t.wall;
  });

  /* 2) İç hacmi oy (araziyi/duvarı siler); zemin ve tavan yerinde kalır */
  F.carve(x0, 0, 0, x1, h - 1, d - 1);

  /* 3) Kapılar */
  const doorFront = o.doorFront === false ? null : buildDoor(F, t, 'front', 'open', g);
  const backMode = o.doorBack === true || o.doorBack === 'locked' ? 'locked' : (o.doorBack === 'open' ? 'open' : null);
  const doorBack = backMode ? buildDoor(F, t, 'back', backMode, g) : null;

  /* 4) Işıklar (iç duvar katmanında fener oyukları) */
  let cand = [];
  if (w >= 7 && d >= 7 && h >= 5) cand.push({ lx: (x0 + x1) >> 1, ly: h, lz: d >> 1, kind: 'ceiling' });
  const sideCount = Math.max(1, Math.round(d / 4));
  for (let k = 0; k < sideCount; k++) {
    const lz = Math.min(d - 1, Math.floor(((k + 0.5) * d) / sideCount));
    cand.push({ lx: x0 - 1, ly: lightY, lz, kind: 'wall' });
    cand.push({ lx: x1 + 1, ly: lightY, lz, kind: 'wall' });
  }
  if (typeof o.lights === 'number') cand = pickEvenly(cand, Math.max(0, Math.floor(o.lights)));
  for (let i = 0; i < cand.length; i++) F.set(cand[i].lx, cand[i].ly, cand[i].lz, t.light);

  /* 5) Parlayan rün şeridi + sütun başlıkları (dekor) */
  if (o.trim !== false) {
    const ty = h - 1;
    const doorSpan = (lx) => ty <= doorH && lx >= -hd - 1 && lx <= hd + 1;
    for (let lz = 0; lz < d; lz += 2) {
      F.set(x0 - 1, ty, lz, t.glow);
      F.set(x1 + 1, ty, lz, t.glow);
    }
    for (let lx = x0; lx <= x1; lx++) {
      if (((lx - x0) & 1) !== 0 || doorSpan(lx)) continue;
      F.set(lx, ty, -1, t.glow);
      F.set(lx, ty, d, t.glow);
    }
    F.set(x0 - 1, ty, -1, t.glow);
    F.set(x1 + 1, ty, -1, t.glow);
    F.set(x0 - 1, ty, d, t.glow);
    F.set(x1 + 1, ty, d, t.glow);
  }

  const innerWorld = localBoxToWorld(ctx.origin, ctx.facing, x0, 0, 0, x1, h - 1, d - 1);
  const outerWorld = localBoxToWorld(ctx.origin, ctx.facing, x0 - W, -W, -W, x1 + W, h - 1 + W, d - 1 + W);
  return {
    inner: { x0, y0: 0, z0: 0, x1, y1: h - 1, z1: d - 1 },
    innerWorld,
    outerWorld,
    w,
    d,
    h,
    theme: t,
    floorY: ctx.origin.y - 1,
    doorFront,
    doorBack,
    lights: cand,
  };
}

/** Kapıyı açan/kapatan setBlock efektleri (açık → hava, kapalı → kilitli kapı bloğu). */
export function doorEffects(door, open) {
  const id = open ? 0 : (door.lockId || B.LOCKED_DOOR);
  const out = [];
  for (let i = 0; i < door.cells.length; i++) {
    const c = door.cells[i];
    out.push({ kind: 'setBlock', x: c.x, y: c.y, z: c.z, id });
  }
  return out;
}

/** Kapıyı doğrudan ctx.setBlock ile açar/kapatır (restore sırasında kullanışlı). */
export function setDoorOpen(ctx, door, open) {
  const id = open ? 0 : (door.lockId || B.LOCKED_DOOR);
  for (let i = 0; i < door.cells.length; i++) {
    const c = door.cells[i];
    ctx.setBlock(c.x, c.y, c.z, id);
  }
}
