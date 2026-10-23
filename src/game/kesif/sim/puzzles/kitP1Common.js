/*
 * KEŞİF bulmaca (dalga 2 / puzzles1) — ortak yardımcılar (saf; DOM/three yok, worker-güvenli).
 *
 * `basincplakasi runedizisi renkkollari isinayna itilebilirblok kodkilidi` bulmacaları bunu paylaşır. Dosya adı `kit`
 * ile başladığı için bulmaca yükleyicisi (kitLoader) onu bir bulmaca modülü sanmaz.
 *
 * Ortak model ("iç çizim"): her bulmacanın odası = kit kabuğu (buildChamber) + iç hacmin durumdan türeyen çizimi.
 *   - `dyn` haritası: "lx,ly,lz" → blok kimliği (YEREL koordinat). Durumun görünümüdür; build ve restore AYNI haritayı çizer
 *     (restore önce iç hacmi oyar → reset/yükleme her zaman baştan çizer; build sonrası restore dünyayı değiştirmez).
 *   - Etkileşimde eski/yeni harita karşılaştırılır (`dynDiff`): yalnızca değişen hücreler `setBlock` efekti olur;
 *     yeni haritada artık bulunmayan hücre hava (0) olur → haritada HER ZAMAN bulunan hücreler (zemin süsü, plaka…) için
 *     iki durumda da açık bir kimlik yaz.
 *   - Kapı: arka kapı kilitli doğar, çözülünce `setDoorOpen` (restore) / `doorEffects` (efekt) ile açılır; ön kapı hep açık.
 */
import { B, RUNES } from '../blocks.js';
import {
  buildChamber, doorEffects, frame, fx, setDoorOpen, worldDirToLocal,
} from './kit.js';

export const EMPTY = Object.freeze([]);

function noop() {}

/** Yazımsız ctx kopyası (kapı hücrelerini/geometriyi hesaplamak için buildChamber kuru çalıştırma). */
export function dryCtx(ctx) {
  return Object.assign({}, ctx, { setBlock: noop, clip: null });
}

const CHAMBERS = new WeakMap();

/** buildChamber sonucunun (kapı hücreleri, iç kutu…) önbellekli, yazımsız kopyası. size: {w,d,h}. */
export function chamberInfo(ctx, size) {
  let per = CHAMBERS.get(ctx);
  if (!per) {
    per = new Map();
    CHAMBERS.set(ctx, per);
  }
  const key = size.w + 'x' + size.d + 'x' + size.h;
  let c = per.get(key);
  if (!c) {
    c = buildChamber(dryCtx(ctx), { w: size.w, d: size.d, h: size.h, doorBack: 'locked' });
    per.set(key, c);
  }
  return c;
}

/** Gerçek oda kabuğunu kurar (arka kapı kilitli). */
export function shell(ctx, size) {
  return buildChamber(ctx, { w: size.w, d: size.d, h: size.h, doorBack: 'locked' });
}

/** İç hacmi havayla oyar (restore başlangıcı). */
export function clearInterior(F, info) {
  const i = info.inner;
  F.carve(i.x0, i.y0, i.z0, i.x1, i.y1, i.z1);
}

/* -------------------------------------------------------------------------------------------------
 * Dyn haritası
 * ----------------------------------------------------------------------------------------------- */
export function mk(lx, ly, lz) {
  return lx + ',' + ly + ',' + lz;
}

export function parseMk(k) {
  const p = k.split(',');
  return { x: Number(p[0]), y: Number(p[1]), z: Number(p[2]) };
}

export function put(m, lx, ly, lz, id) {
  m.set(lx + ',' + ly + ',' + lz, id);
}

export function putFill(m, lx0, ly0, lz0, lx1, ly1, lz1, id) {
  for (let z = Math.min(lz0, lz1); z <= Math.max(lz0, lz1); z++) {
    for (let y = Math.min(ly0, ly1); y <= Math.max(ly0, ly1); y++) {
      for (let x = Math.min(lx0, lx1); x <= Math.max(lx0, lx1); x++) m.set(x + ',' + y + ',' + z, id);
    }
  }
}

/** Haritayı çizer (F.set; chunk kesiti uyumlu). */
export function paintMap(F, m) {
  m.forEach((id, k) => {
    const p = k.split(',');
    F.set(Number(p[0]), Number(p[1]), Number(p[2]), id);
  });
}

/** Eski → yeni harita farkı: değişen hücreler için setBlock efektleri (kaybolan hücre → 0). */
export function dynDiff(F, before, after, out) {
  const list = out || [];
  after.forEach((id, k) => {
    if (before.get(k) === id) return;
    const p = k.split(',');
    const w = F.toWorld(Number(p[0]), Number(p[1]), Number(p[2]));
    list.push(fx.setBlock(w.x, w.y, w.z, id));
  });
  before.forEach((id, k) => {
    if (after.has(k)) return;
    const p = k.split(',');
    const w = F.toWorld(Number(p[0]), Number(p[1]), Number(p[2]));
    list.push(fx.setBlock(w.x, w.y, w.z, 0));
  });
  return list;
}

/** Oyuncu dinamik bir hücreyi kırdı/üstüne blok koydu → o hücreyi haritadaki değere geri çeken efekt (yoksa null). */
export function guardEffect(F, map, ev) {
  if (ev.type !== 'blockBroken' && ev.type !== 'blockPlaced') return null;
  const l = F.toLocal(ev.x, ev.y, ev.z);
  const id = map.get(mk(l.x, l.y, l.z));
  if (id === undefined) return null;
  return fx.setBlock(ev.x, ev.y, ev.z, id);
}

/* -------------------------------------------------------------------------------------------------
 * Olay yardımcıları
 * ----------------------------------------------------------------------------------------------- */
/** Olay hücresi YEREL koordinatta (tam sayılar). */
export function evLocal(F, ev) {
  return F.toLocal(Math.floor(ev.x), Math.floor(ev.y), Math.floor(ev.z));
}

function dominant(a, b) {
  if (Math.abs(a) >= Math.abs(b)) return { x: a > 0 ? 1 : -1, z: 0 };
  return { x: 0, z: b > 0 ? 1 : -1 };
}

/**
 * İtme yönü (YEREL, eksen hizalı {x,z}) ya da null.
 *   1) ev.dx/ev.dz  (dünya yönü; oyuncunun hareketi/bakışı)   2) ev.px/ev.pz (oyuncu konumu → bloktan uzağa)
 */
export function pushDirection(F, ev, lx, lz) {
  const dx = Number(ev.dx);
  const dz = Number(ev.dz);
  if ((Number.isFinite(dx) && dx !== 0) || (Number.isFinite(dz) && dz !== 0)) {
    const l = worldDirToLocal(F.facing, Number.isFinite(dx) ? dx : 0, Number.isFinite(dz) ? dz : 0);
    return dominant(l.x, l.z);
  }
  const px = Number(ev.px);
  const pz = Number(ev.pz);
  if (Number.isFinite(px) && Number.isFinite(pz)) {
    const c = F.toWorld(lx, 0, lz);
    const l = worldDirToLocal(F.facing, (c.x + 0.5) - px, (c.z + 0.5) - pz);
    if (l.x !== 0 || l.z !== 0) return dominant(l.x, l.z);
  }
  return null;
}

/* -------------------------------------------------------------------------------------------------
 * Çözüm / hata efektleri
 * ----------------------------------------------------------------------------------------------- */
/** Arka kapıyı açan + kutlama efektleri. */
export function solvedEffects(info, text, out) {
  const list = out || [];
  const door = info.doorBack;
  const e = doorEffects(door, true);
  for (let i = 0; i < e.length; i++) list.push(e[i]);
  list.push(fx.sound('puzzle_solved', door.x, door.y, door.z));
  list.push(fx.sound('door_open', door.x, door.y + 1, door.z));
  list.push(fx.particles('levelUp', door.x, door.y + 1, door.z, 0xffd24a));
  list.push(fx.message(text));
  return list;
}

export function wrongEffects(x, y, z, text, out) {
  const list = out || [];
  list.push(fx.sound('puzzle_wrong', x, y, z));
  if (text) list.push(fx.message(text));
  return list;
}

/** restore için: arka kapıyı çözülmüşlüğe göre kur. */
export function applyDoor(ctx, info, solved) {
  if (info.doorBack) setDoorOpen(ctx, info.doorBack, !!solved);
}

/* -------------------------------------------------------------------------------------------------
 * Renk / şekil tabloları (renk körlüğü: her renk bir şekille eşlenir)
 * ----------------------------------------------------------------------------------------------- */
/** Yedi renk: 5 rün rengi + turuncu + beyaz. concrete/glass/hex/ad/şekil. */
export const COLORS = Object.freeze([
  { key: 'kırmızı', concrete: B.CONCRETE_RED, glass: B.GLASS_RED, hex: 0xe0443e, shape: 0 },
  { key: 'mavi', concrete: B.CONCRETE_BLUE, glass: B.GLASS_BLUE, hex: 0x3d7be0, shape: 1 },
  { key: 'yeşil', concrete: B.CONCRETE_GREEN, glass: B.GLASS_GREEN, hex: 0x3fbf5a, shape: 2 },
  { key: 'sarı', concrete: B.CONCRETE_YELLOW, glass: B.GLASS_YELLOW, hex: 0xf2c91e, shape: 3 },
  { key: 'mor', concrete: B.CONCRETE_PURPLE, glass: B.GLASS_PURPLE, hex: 0x9a4fe0, shape: 4 },
  { key: 'turuncu', concrete: B.CONCRETE_ORANGE, glass: B.GLASS_ORANGE, hex: 0xe8842a, shape: 5 },
  { key: 'beyaz', concrete: B.CONCRETE_WHITE, glass: B.GLASS_WHITE, hex: 0xf0f0f0, shape: 6 },
]);

/** Rün taşı (0..4) → blok kimliği / renk hex / ad / şekil adı (blocks.js RUNES). */
export function runeInfo(i) {
  return RUNES[((i % RUNES.length) + RUNES.length) % RUNES.length];
}

/** 3×3 şekil bit eşlemleri (üstten alta; 'X' dolu). Yedi ayrı şekil, renkle birebir eşlenir. */
export const SHAPES3 = Object.freeze([
  Object.freeze({ name: 'üçgen', rows: ['.X.', 'X.X', 'XXX'] }),
  Object.freeze({ name: 'daire', rows: ['XXX', 'X.X', 'XXX'] }),
  Object.freeze({ name: 'kare', rows: ['XXX', 'XXX', 'XXX'] }),
  Object.freeze({ name: 'yıldız', rows: ['X.X', '.X.', 'X.X'] }),
  Object.freeze({ name: 'baklava', rows: ['.X.', 'XXX', '.X.'] }),
  Object.freeze({ name: 'çift çizgi', rows: ['XXX', '...', 'XXX'] }),
  Object.freeze({ name: 'köşe', rows: ['X..', 'X..', 'XXX'] }),
]);

/** Zar yüzü (1..6) 3×3 desenleri (üstten alta). */
export const DICE = Object.freeze([
  null,
  ['...', '.X.', '...'],
  ['X..', '...', '..X'],
  ['X..', '.X.', '..X'],
  ['X.X', '...', 'X.X'],
  ['X.X', '.X.', 'X.X'],
  ['X.X', 'X.X', 'X.X'],
]);

/** Bit eşlemi yatay düzleme (zemin, ly sabit) çizer: satır 0 → en küçük lz. on/off kimlikleri. */
export function bitmapFloor(m, lx0, ly, lz0, rows, onId, offId) {
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      put(m, lx0 + c, ly, lz0 + r, rows[r].charAt(c) === 'X' ? onId : offId);
    }
  }
}

/** Bit eşlemi dikey düzleme (yan duvar; lx sabit, satır 0 → en üst ly) çizer; sütun c → lz0+c. */
export function bitmapWall(m, lx, ly0, lz0, rows, onId, offId) {
  const h = rows.length;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      put(m, lx, ly0 + (h - 1 - r), lz0 + c, rows[r].charAt(c) === 'X' ? onId : offId);
    }
  }
}

/* -------------------------------------------------------------------------------------------------
 * Küçük yardımcılar
 * ----------------------------------------------------------------------------------------------- */
export function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

/** [0..n-1] karıştırılmış dizi (verilen rng ile). */
export function shuffled(rng, n) {
  const a = [];
  for (let i = 0; i < n; i++) a.push(i);
  return rng.shuffle(a);
}

/** Dünya hücresi için ses/parçacık konumu (yerel hücre merkezi). */
export function at(F, lx, ly, lz) {
  return F.toWorld(lx, ly, lz);
}

export { frame, fx };
