/*
 * KEŞİF bulmaca ③ Renk Kolları  (tip: 'renkkollari')  — kol ↔ kristal mantık (XOR) bulmacası
 *
 * Arka sırada renkli kristaller dizilidir; hepsini yakmak gerekir. Sol duvardaki her kol, yerdeki tabloda gösterilen
 * kristallerin AÇIK/KAPALI durumunu ters çevirir (renkli kare = o sütundaki kristali çevirir). Bir kolu iki kez çekmek onu
 * geri alır; kollar sırasız çalışır. Zorlukla kol/kristal sayısı (3, 4, 5, 6, 6) ve çapraz bağlantı yoğunluğu artar.
 *
 * Çözülebilirlik KANITI: bağlantı matrisi (üçgen + birim köşegen, satırları karıştırılmış) GF(2) üzerinde tersinirdir; başlangıç
 * durumu "hepsi açık" durumundan rastgele bir kol kümesi uygulanarak üretilir → o küme (state.sol) her zaman çözümdür.
 * Renk körlüğü: her kristal rengine ek olarak farklı bir zemin ŞEKLİ (üçgen, daire, kare, yıldız, baklava, çift çizgi) taşır;
 * tablo sütunları kristallerle hizalıdır. Her yerden duvardaki sıfırlama koluyla başa dönülebilir.
 *
 * Olay sözleşmesi: 'use' → kol (sol duvar, ly 0) ya da sıfırlama kolu (sağ duvar, ön).
 */
import { B } from '../blocks.js';
import { registerPuzzle } from './kitRegistry.js';
import {
  chamberSize, frame, fx, localXRange, subRng, worldToLocal,
} from './kit.js';
import {
  COLORS, EMPTY, SHAPES3, applyDoor, bitmapFloor, chamberInfo, clearInterior, dynDiff, guardEffect, paintMap, put, shell,
  shuffled, solvedEffects,
} from './kitP1Common.js';

const TYPE = 'renkkollari';
const M_BY_DIFF = [3, 4, 5, 6, 6];
const P_BY_DIFF = [0.4, 0.45, 0.5, 0.55, 0.7];
const H = 5;
const IDLE = { state: null, effects: EMPTY };

function clampD(d) {
  const n = Math.round(Number(d));
  return Math.max(1, Math.min(5, Number.isFinite(n) ? n : 1));
}

function dims(m) {
  return chamberSize(3 * m + 2, 2 * m + 5, H);
}

function footprint(difficulty) {
  const s = dims(M_BY_DIFF[clampD(difficulty) - 1]);
  return { w: s.w, d: s.d, h: s.h, margin: 2 };
}

/** i. kristalin yerel sütunu. */
function crystalX(m, i) {
  return -Math.floor((3 * (m - 1)) / 2) + 3 * i;
}

function leverZ(j) {
  return 1 + 2 * j;
}

/* ------------------------------------------------------------------------------------------------
 * Üretim: üçgen birim köşegenli matris → satır karıştırma → çözüm kümesinden başlangıç durumu
 * ---------------------------------------------------------------------------------------------- */
function generate(ctx) {
  const d = clampD(ctx.difficulty);
  const m = M_BY_DIFF[d - 1];
  const p = P_BY_DIFF[d - 1];
  const rng = subRng(ctx, 'renk');
  const base = [];
  for (let j = 0; j < m; j++) {
    const row = new Array(m).fill(0);
    row[j] = 1;
    for (let k = j + 1; k < m; k++) if (rng.next() < p) row[k] = 1;
    base.push(row);
  }
  // en az bir çapraz bağlantı (d ≥ 2)
  if (d >= 2) {
    let links = 0;
    for (let j = 0; j < m; j++) for (let k = j + 1; k < m; k++) links += base[j][k];
    if (links === 0) base[0][1] = 1;
  }
  const order = shuffled(rng, m);
  const T = order.map((j) => base[j].slice());
  const cols = shuffled(rng, COLORS.length).slice(0, m);
  // çözüm kümesi: en az ⌈m/2⌉ kol
  const minPulls = Math.ceil(m / 2);
  const idx = shuffled(rng, m);
  const count = rng.int(minPulls, m);
  const sol = new Array(m).fill(0);
  for (let i = 0; i < count; i++) sol[idx[i]] = 1;
  const s = new Array(m).fill(1);
  for (let j = 0; j < m; j++) {
    if (!sol[j]) continue;
    for (let i = 0; i < m; i++) s[i] ^= T[j][i];
  }
  const xr = localXRange(dims(m).w);
  return {
    v: 1,
    lv: d,
    done: false,
    m,
    T,
    cols,
    s,
    p: new Array(m).fill(0),
    sol,
    pulls: 0,
    x0: xr.x0,
    x1: xr.x1,
    cz: 2 * m + 2,
    w: dims(m).w,
    d: dims(m).d,
    h: dims(m).h,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Görünüm
 * ---------------------------------------------------------------------------------------------- */
function dyn(state) {
  const m = state.m;
  const map = new Map();
  for (let i = 0; i < m; i++) {
    const lx = crystalX(m, i);
    const col = COLORS[state.cols[i]];
    const on = state.s[i] === 1;
    put(map, lx, 0, state.cz, col.concrete);
    put(map, lx, 1, state.cz, on ? col.glass : B.CONCRETE_BLACK);
    put(map, lx, 2, state.cz, on ? col.glass : B.CONCRETE_BLACK);
    put(map, lx, 3, state.cz, on ? B.LIGHT_BLOCK : B.BASALT);
    bitmapFloor(map, lx - 1, -1, state.cz - 1, SHAPES3[col.shape].rows, col.concrete, B.CONCRETE_BLACK);
  }
  for (let j = 0; j < m; j++) {
    put(map, state.x0, 0, leverZ(j), state.p[j] ? B.LEVER_ON : B.LEVER);
    for (let i = 0; i < m; i++) {
      put(map, crystalX(m, i), -1, leverZ(j), state.T[j][i] ? COLORS[state.cols[i]].concrete : B.CONCRETE_BLACK);
    }
  }
  put(map, state.x1, 0, 1, B.LEVER);
  return map;
}

function crystalName(state, i) {
  const col = COLORS[state.cols[i]];
  return col.key + ' ' + SHAPES3[col.shape].name;
}

function offCount(state) {
  let n = 0;
  for (let i = 0; i < state.m; i++) if (state.s[i] === 0) n++;
  return n;
}

/* ------------------------------------------------------------------------------------------------
 * Arayüz
 * ---------------------------------------------------------------------------------------------- */
function interact(ctx, state, ev) {
  const effects = [];
  if (!Number.isFinite(ev.x) || !Number.isFinite(ev.y) || !Number.isFinite(ev.z)) return { state, effects, handled: false };
  const F = frame(ctx);
  if (ev.type === 'blockBroken' || ev.type === 'blockPlaced') {
    const g = guardEffect(F, dyn(state), ev);
    if (g) effects.push(g);
    return { state, effects, handled: effects.length > 0 };
  }
  if (ev.type !== 'use') return { state, effects, handled: false };
  const l = worldToLocal(ctx.origin, ctx.facing, Math.floor(ev.x), Math.floor(ev.y), Math.floor(ev.z), { x: 0, y: 0, z: 0 });
  // sıfırlama kolu
  if (l.x === state.x1 && l.y === 0 && l.z === 1) {
    if (state.done) {
      effects.push(fx.message('Kristaller yanıyor, bulmaca çözüldü.'));
    } else {
      effects.push(fx.sound('lever', ev.x, ev.y, ev.z));
      effects.push(fx.message('Kollar ve kristaller başlangıç durumuna döndü.'));
      effects.push(fx.reset());
    }
    return { state, effects, handled: true };
  }
  if (state.done || l.x !== state.x0 || l.y !== 0 || l.z < 1 || ((l.z - 1) & 1) !== 0) return { state, effects, handled: false };
  const j = (l.z - 1) >> 1;
  if (j < 0 || j >= state.m) return { state, effects, handled: false };
  const before = dyn(state);
  const prevS = state.s.slice();
  state.p[j] ^= 1;
  for (let i = 0; i < state.m; i++) state.s[i] ^= state.T[j][i];
  state.pulls += 1;
  dynDiff(F, before, dyn(state), effects);
  effects.push(fx.sound('lever', ev.x, ev.y, ev.z));
  const lit = [];
  const dark = [];
  for (let i = 0; i < state.m; i++) {
    if (prevS[i] === state.s[i]) continue;
    const w = F.toWorld(crystalX(state.m, i), 2, state.cz);
    effects.push(fx.sound('rune:' + (state.cols[i] % 5), w.x, w.y, w.z));
    effects.push(fx.particles('magicBurst', w.x, w.y, w.z, COLORS[state.cols[i]].hex));
    (state.s[i] ? lit : dark).push(crystalName(state, i) + ' kristal');
  }
  const parts = [];
  if (lit.length) parts.push(lit.join(', ') + ' yandı');
  if (dark.length) parts.push(dark.join(', ') + ' söndü');
  if (parts.length) effects.push(fx.message(parts.join('; ') + '.'));
  if (offCount(state) === 0) {
    state.done = true;
    solvedEffects(chamberInfo(ctx, state), 'Tüm kristaller yandı! Arka kapı açıldı.', effects);
  }
  return { state, effects, handled: true };
}

/** Bu bulmacanın zamana bağlı parçası yok (yalnızca olaylarla ilerler). */
function tick(ctx, state) {
  IDLE.state = state;
  return IDLE;
}

function isSolved(state) {
  return !!(state && state.done);
}

function hint(state) {
  if (state.done) return 'Tüm kristaller yanıyor, arka kapı açık.';
  let first = -1;
  for (let j = 0; j < state.m; j++) {
    if ((state.sol[j] ^ state.p[j]) === 1) {
      first = j;
      break;
    }
  }
  const base = 'Yerdeki tablo her kolun hangi kristali çevirdiğini gösterir (renkli kare = çevirir). '
    + offCount(state) + ' kristal sönük. Bir kolu iki kez çekmek onu geri alır.';
  if (first < 0) return base;
  return base + ' İpucu: girişten sayarak ' + (first + 1) + '. kolu çevirmeyi dene.';
}

function build(ctx) {
  const state = generate(ctx);
  const info = shell(ctx, state);
  const F = frame(ctx);
  paintMap(F, dyn(state));
  const anchors = {
    levers: [], crystals: [], reset: F.toWorld(state.x1, 0, 1), door: info.doorBack,
  };
  for (let j = 0; j < state.m; j++) anchors.levers.push(F.toWorld(state.x0, 0, leverZ(j)));
  for (let i = 0; i < state.m; i++) anchors.crystals.push(F.toWorld(crystalX(state.m, i), 0, state.cz));
  return { state, anchors };
}

function restore(ctx, state) {
  const info = chamberInfo(ctx, state);
  const F = frame(ctx);
  clearInterior(F, info);
  paintMap(F, dyn(state));
  applyDoor(ctx, info, state.done);
}

const impl = {
  type: TYPE,
  name: 'Renk Kolları',
  summary: 'Kollar kristallerin ışığını çevirir; yerdeki tabloyu oku ve hepsini yak.',
  difficultyRange: [1, 5],
  footprint,
  build,
  restore,
  interact,
  tick,
  isSolved,
  hint,
};

registerPuzzle(TYPE, impl);

export default impl;
