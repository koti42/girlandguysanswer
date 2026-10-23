/*
 * KEŞİF sim/city — YERALTI + ÇATI İÇERİĞİ ORTAK ARAÇLARI (saf; DOM/three/Math.random/Date.now yok; worker-güvenli). Paket interiors_d.
 *
 *  UT                       alt akış etiketleri (0xe4xx; yalnız bu paket)
 *  hh(seed,id,tag) / hf / hi  subHash tabanlı uint32 / [0,1) / 0..n-1
 *  rectsTouch(a,b,pad)      [x0,x1)×[z0,z1) kesişimi
 *  textCells(str) / textWidth(str)   3×5 piksel yazı tipi (Türkçe ç ğ ı i ö ş ü işaretleri dahil): [{c,r}] c sütun, r satır (0 alt)
 *  drawText(w, str, o)      dünya düzlemine yazı: o {x,y,z (sol-alt başlangıç hücresi), axis:'x'|'z' (yazının aktığı eksen), dir:±1, block, scale?:1}
 *  codeOf(seed,id,digits)   1..6 hanelerden kod dizgesi
 *  DOOR_STATE               kapı blok durumları (kapalı 239 / açık 240)
 *  mkLock(id,kind,tier,data) / validateLockShape(lock)
 *  boxCells / indexRects    küçük yardımcılar
 */
import { subHash } from '../dim/dimensions.js';
import { ID } from './cityEmit.js';

const INV32 = 1 / 4294967296;

/** Alt akış etiketleri (benzersiz; hack/ 0xd11–0xd31, cityPlanKit TAG 0x101–0xb01 ile çakışmaz). */
export const UT = Object.freeze({
  JR_PICK: 0xe401, JR_KIND: 0xe402, JR_PROP: 0xe403, JR_GRAF: 0xe404,
  HR_LINE: 0xe411, HR_POS: 0xe412, HR_SIDE: 0xe413, HR_THEME: 0xe414, HR_UNLOCK: 0xe415, HR_CODE: 0xe416, HR_PROP: 0xe417, HR_CLUE: 0xe418,
  MT_TRAIN: 0xe421, MT_PROP: 0xe422, MT_STAFF: 0xe423, MT_SIDE: 0xe424,
  LB_THEME: 0xe431, LB_PROP: 0xe432, LB_CODE: 0xe433, LB_KIND: 0xe434, LB_CLUE: 0xe435,
  VT_CODE: 0xe441, VT_PROP: 0xe442,
  RF_THEME: 0xe451, RF_POS: 0xe452, RF_KIND: 0xe453, RF_PROP: 0xe454, RF_ALT: 0xe455, RF_BRIDGE: 0xe456, RF_COLOR: 0xe457,
  CH_PICK: 0xe461, DG_PICK: 0xe462,
});

export function hh(seed, id, tag) {
  return subHash(seed, id, tag) >>> 0;
}
export function hf(seed, id, tag) {
  return (subHash(seed, id, tag) >>> 0) * INV32;
}
export function hi(seed, id, tag, n) {
  return Math.floor((subHash(seed, id, tag) >>> 0) * INV32 * n);
}

/** [x0,x1)×[z0,z1) dikdörtgenleri (pad bloklu) kesişiyor mu. */
export function rectsTouch(a, b, pad) {
  const p = pad || 0;
  return a.x0 < b.x1 + p && b.x0 < a.x1 + p && a.z0 < b.z1 + p && b.z0 < a.z1 + p;
}

/* ------------------------------------------------------------------------------------------------
 * 3×5 piksel yazı tipi (büyük harf). '#'=dolu. Türkçe işaretler: ç/ş altlık (r=-1), ü/ö nokta, ğ yay, İ nokta (r=5/6)
 * ---------------------------------------------------------------------------------------------- */
const GL = {
  A: '.#.|#.#|###|#.#|#.#',
  B: '##.|#.#|##.|#.#|##.',
  C: '.##|#..|#..|#..|.##',
  D: '##.|#.#|#.#|#.#|##.',
  E: '###|#..|##.|#..|###',
  F: '###|#..|##.|#..|#..',
  G: '.##|#..|#.#|#.#|.##',
  H: '#.#|#.#|###|#.#|#.#',
  I: '###|.#.|.#.|.#.|###',
  J: '..#|..#|..#|#.#|.#.',
  K: '#.#|#.#|##.|#.#|#.#',
  L: '#..|#..|#..|#..|###',
  M: '#.#|###|###|#.#|#.#',
  N: '###|#.#|#.#|#.#|#.#',
  O: '.#.|#.#|#.#|#.#|.#.',
  P: '##.|#.#|##.|#..|#..',
  R: '##.|#.#|##.|#.#|#.#',
  S: '.##|#..|.#.|..#|##.',
  T: '###|.#.|.#.|.#.|.#.',
  U: '#.#|#.#|#.#|#.#|###',
  V: '#.#|#.#|#.#|#.#|.#.',
  W: '#.#|#.#|###|###|#.#',
  X: '#.#|#.#|.#.|#.#|#.#',
  Y: '#.#|#.#|.#.|.#.|.#.',
  Z: '###|..#|.#.|#..|###',
  0: '###|#.#|#.#|#.#|###',
  1: '.#.|##.|.#.|.#.|###',
  2: '##.|..#|.#.|#..|###',
  3: '##.|..#|.#.|..#|##.',
  4: '#.#|#.#|###|..#|..#',
  5: '###|#..|##.|..#|##.',
  6: '.##|#..|###|#.#|###',
  7: '###|..#|.#.|.#.|.#.',
  8: '###|#.#|###|#.#|###',
  9: '###|#.#|###|..#|##.',
  '-': '...|...|###|...|...',
  ' ': '...|...|...|...|...',
};
const MARKS = {
  Ü: ['U', [[0, 6], [2, 6]]],
  Ö: ['O', [[0, 6], [2, 6]]],
  Ç: ['C', [[1, -1]]],
  Ş: ['S', [[1, -1]]],
  Ğ: ['G', [[1, 6]]],
  İ: ['I', [[1, 6]]],
};

function glyph(ch) {
  const m = MARKS[ch];
  const base = m ? m[0] : ch;
  const rows = (GL[base] || GL[' ']).split('|');
  const cells = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 3; c++) if (rows[4 - r][c] === '#') cells.push([c, r]);
  }
  if (m) for (let k = 0; k < m[1].length; k++) cells.push([m[1][k][0], m[1][k][1]]);
  return cells;
}

const UP = { ç: 'Ç', ğ: 'Ğ', ı: 'I', i: 'İ', ö: 'Ö', ş: 'Ş', ü: 'Ü' };
function up(s) {
  let o = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    o += UP[ch] !== undefined ? UP[ch] : ch.toUpperCase();
  }
  return o;
}

export function textWidth(str) {
  return str.length * 4 - 1;
}

/** Yazı hücreleri: [{c,r}] (c: sütun, r: satır; 0 = taban çizgisi; diakritik r=-1 ya da 5..6). */
export function textCells(str) {
  const s = up(String(str));
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const g = glyph(s[i]);
    for (let k = 0; k < g.length; k++) out.push({ c: i * 4 + g[k][0], r: g[k][1] });
  }
  return out;
}

/**
 * Yazıyı dünya düzlemine yazar. o: {x,y,z (sol-alt başlangıç), axis:'x'|'z' (yazının uzandığı eksen), dir:±1, block, scale}. Pencere dışı atılır.
 */
export function drawText(w, str, o) {
  const cells = textCells(str);
  const sc = o.scale || 1;
  const dir = o.dir === -1 ? -1 : 1;
  for (let i = 0; i < cells.length; i++) {
    for (let a = 0; a < sc; a++) {
      for (let b = 0; b < sc; b++) {
        const c = cells[i].c * sc + a;
        const r = cells[i].r * sc + b;
        const x = o.axis === 'x' ? o.x + c * dir : o.x;
        const z = o.axis === 'z' ? o.z + c * dir : o.z;
        if (o.keep && o.keep(w.get(x, o.y + r, z))) continue; // keep(id) true ise hücreye YAZMA (ör. boş hücre)
        w.set(x, o.y + r, z, o.block);
      }
    }
  }
}

/** 1..6 rakamlı kod dizgesi (tasarım: 3–4 hane, 1–6). */
export function codeOf(seed, id, digits) {
  let s = '';
  for (let i = 0; i < digits; i++) s += String(1 + (hh(seed, id * 8 + i, UT.HR_CODE) % 6));
  return s;
}

/** Kapı blok durumları: sürgülü kapı 239 kapalı / 240 açık. */
export const DOOR_STATE = Object.freeze({ closed: ID.DOOR, open: ID.DOOR_OPEN });

export const LOCK_KINDS = Object.freeze(['serbest', 'kod', 'mini_hack', 'kart']);

export function mkLock(id, kind, tier, data) {
  return { id, kind, tier, data: data || {} };
}

/** Kilit biçimi denetimi (hata dizisi). */
export function validateLockShape(l) {
  const e = [];
  if (!l || typeof l.id !== 'string' || !/^[0-9a-z]{1,10}$/.test(l.id)) e.push('id');
  if (!l || LOCK_KINDS.indexOf(l.kind) < 0) e.push('kind');
  if (!l || !Number.isInteger(l.tier) || l.tier < 0 || l.tier > 3) e.push('tier');
  if (!l || typeof l.data !== 'object' || l.data === null) e.push('data');
  return e;
}

/** Yeraltı/çatı PropSpec'leri için sahte parsel kimlikleri (gerçek parsel kimlikleri < 12800; propIdFor lotId<2^20 ⇒ çakışmasız). */
export const PSEUDO = Object.freeze({
  sewer: 500000, hidden: 500400, metro: 500500, lab: 500600, vault: 500700, roof: 600000,
});

/** Bakış yönü (dx,dz) → prop yaw (0:+Z 1:+X 2:−Z 3:−X). */
export function dirYaw(dx, dz) {
  if (Math.abs(dx) >= Math.abs(dz)) return dx > 0 ? 1 : 3;
  return dz > 0 ? 0 : 2;
}

/** PropSpec (propPlan.normalizeSpec girdisi). */
export function mkSpec(lotId, slot, kind, x, y, z, yaw, variant, extra) {
  const p = { kind, x, y, z, yaw, variant: variant || 0, lotId, slot };
  if (extra) Object.assign(p, extra);
  return p;
}

/** Dikdörtgen listesinden chunk dizini: Map("cx,cz") → öğe listesi (öğe {x0,z0,x1,z1}). */
export function indexRects(items, getRect) {
  const m = new Map();
  for (let i = 0; i < items.length; i++) {
    const r = getRect(items[i]);
    const cx0 = Math.floor(r.x0 / 16);
    const cx1 = Math.floor((r.x1 - 1) / 16);
    const cz0 = Math.floor(r.z0 / 16);
    const cz1 = Math.floor((r.z1 - 1) / 16);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const k = cx + ',' + cz;
        let l = m.get(k);
        if (!l) {
          l = [];
          m.set(k, l);
        }
        l.push(items[i]);
      }
    }
  }
  return m;
}

/** (x,z) → dizin anahtarı ("cx,cz"). */
export function chunkKey(w) {
  return Math.floor(w.x0 / 16) + ',' + Math.floor(w.z0 / 16);
}
