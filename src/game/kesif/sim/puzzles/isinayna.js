/*
 * KEŞİF bulmaca ④ Işın & Ayna  (tip: 'isinayna')
 *
 * Kaynak bloktan çıkan ışık huzmesi (baş üstünde, yerden 3. sırada parlayan bloklar; altından rahatça geçilir) aynalara
 * çarparak alıcı kristale ulaşmalı. Aynalar tek yüzlü köşegen aynadır: sağ tık onları 90° çevirir (4 yönelim). Yansıtan yüzün
 * baktığı köşe, aynanın dibinde PARLAYAN zemin hücresi ve üstündeki fenerle gösterilir; ışık aynanın arkasına çarparsa söner.
 * Engel sütunları ışığı keser; sahte aynalar yanıltır. Yüksek zorlukta BÖLÜCÜ (mantık kapısı) ışını ikiye ayırır (sağ tık
 * yan yönü çevirir) ve birden çok alıcı/kaynak vardır — hepsi yanmalı.
 *
 * Çözülebilirlik: yerleşim önce çözüm yolu kurularak üretilir, sonra aynalar saptırılır (kitP1Beam.js; üreticide izleme ile doğrulanır).
 * Olay sözleşmesi: 'use' → ayna ya da bölücü (sütun ve ayna hücreleri, ly 0..2).
 */
import { B } from '../blocks.js';
import { registerPuzzle } from './kitRegistry.js';
import {
  chamberSize, frame, fx, localXRange, subRng, worldToLocal,
} from './kit.js';
import {
  DIRS, NORMS, SIZES, allLit, generateBeamLayout, traceBeams,
} from './kitP1Beam.js';
import {
  EMPTY, applyDoor, chamberInfo, clearInterior, dynDiff, guardEffect, paintMap, put, shell, solvedEffects,
} from './kitP1Common.js';

const TYPE = 'isinayna';
const H = 5;
const BEAM_Y = 2;
const IDLE = { state: null, effects: EMPTY };

function clampD(d) {
  const n = Math.round(Number(d));
  return Math.max(1, Math.min(5, Number.isFinite(n) ? n : 1));
}

function footprint(difficulty) {
  const sz = SIZES[clampD(difficulty) - 1];
  const s = chamberSize(sz[0], sz[1], H);
  return { w: s.w, d: s.d, h: s.h, margin: 2 };
}

function generate(ctx) {
  const d = clampD(ctx.difficulty);
  const sz = SIZES[d - 1];
  const s = chamberSize(sz[0], sz[1], H);
  const xr = localXRange(s.w);
  const L = generateBeamLayout(d, xr.x0, xr.x1, s.d, (a) => subRng(ctx, 'isin' + a));
  return {
    v: 1,
    lv: d,
    done: false,
    w: s.w,
    d: s.d,
    h: s.h,
    x0: xr.x0,
    x1: xr.x1,
    gx0: L.gx0,
    gx1: L.gx1,
    gz0: L.gz0,
    gz1: L.gz1,
    src: L.src,
    mir: L.mir,
    spl: L.spl,
    rec: L.rec,
    obs: L.obs,
    sol: L.sol,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Görünüm
 * ---------------------------------------------------------------------------------------------- */
function pedestal(m, x, z, top) {
  put(m, x, 0, z, B.PILLAR);
  put(m, x, 1, z, B.PILLAR);
  put(m, x, BEAM_Y, z, top);
}

function dyn(state, tr) {
  const m = new Map();
  for (let i = 0; i < state.src.length; i++) pedestal(m, state.src[i][0], state.src[i][1], B.BEAM_SOURCE);
  for (let i = 0; i < state.mir.length; i++) {
    const [x, z, o] = state.mir[i];
    pedestal(m, x, z, B.MIRROR);
    for (let k = 0; k < 4; k++) put(m, x + NORMS[k][0], -1, z + NORMS[k][1], k === o ? B.LIGHT_BLOCK : B.CONCRETE_BLACK);
    put(m, x + NORMS[o][0], 3, z + NORMS[o][1], B.LANTERN);
  }
  for (let i = 0; i < state.spl.length; i++) {
    const [x, z, o] = state.spl[i];
    pedestal(m, x, z, B.LOGIC_GATE);
    for (let k = 0; k < 4; k++) put(m, x + DIRS[k][0], -1, z + DIRS[k][1], k === o ? B.LIGHT_BLOCK : B.CONCRETE_BLACK);
    put(m, x + DIRS[o][0], 3, z + DIRS[o][1], B.LANTERN);
  }
  for (let i = 0; i < state.rec.length; i++) {
    const [x, z] = state.rec[i];
    const on = tr.lit[i];
    pedestal(m, x, z, on ? B.RECEIVER_ON : B.RECEIVER);
    for (let k = 0; k < 4; k++) put(m, x + NORMS[k][0], -1, z + NORMS[k][1], on ? B.LIGHT_BLOCK : B.CONCRETE_BLACK);
  }
  for (let i = 0; i < state.obs.length; i++) {
    for (let y = 0; y <= 3; y++) put(m, state.obs[i][0], y, state.obs[i][1], B.BASALT);
  }
  tr.beam.forEach((k) => {
    const p = k.split(',');
    put(m, Number(p[0]), BEAM_Y, Number(p[1]), B.LIGHT_BLOCK);
  });
  return m;
}

function itemAt(state, x, z) {
  for (let i = 0; i < state.mir.length; i++) if (state.mir[i][0] === x && state.mir[i][1] === z) return { t: 'm', i };
  for (let i = 0; i < state.spl.length; i++) if (state.spl[i][0] === x && state.spl[i][1] === z) return { t: 's', i };
  return null;
}

function litCount(tr) {
  let n = 0;
  for (let i = 0; i < tr.lit.length; i++) if (tr.lit[i]) n++;
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
    const g = guardEffect(F, dyn(state, traceBeams(state)), ev);
    if (g) effects.push(g);
    return { state, effects, handled: effects.length > 0 };
  }
  if (ev.type !== 'use') return { state, effects, handled: false };
  const l = worldToLocal(ctx.origin, ctx.facing, Math.floor(ev.x), Math.floor(ev.y), Math.floor(ev.z), { x: 0, y: 0, z: 0 });
  if (l.y < 0 || l.y > BEAM_Y) return { state, effects, handled: false };
  const it = itemAt(state, l.x, l.z);
  if (!it) return { state, effects, handled: false };
  if (state.done) {
    effects.push(fx.message('Işık yolu tamamlandı; aynalar kilitli.'));
    return { state, effects, handled: true };
  }
  const trBefore = traceBeams(state);
  const before = dyn(state, trBefore);
  const arr = it.t === 'm' ? state.mir : state.spl;
  arr[it.i][2] = (arr[it.i][2] + 1) % 4;
  const tr = traceBeams(state);
  dynDiff(F, before, dyn(state, tr), effects);
  const w = F.toWorld(l.x, BEAM_Y, l.z);
  effects.push(fx.sound('lever', w.x, w.y, w.z));
  effects.push(fx.particles('hitSpark', w.x, w.y, w.z, 0x9affff));
  if (it.t === 'm' && tr.mirDead.indexOf(it.i) >= 0) {
    effects.push(fx.message('Işık aynanın arkasına çarpıyor. Aynayı biraz daha çevir.'));
  }
  const nb = litCount(trBefore);
  const na = litCount(tr);
  for (let i = 0; i < tr.lit.length; i++) {
    if (tr.lit[i] && !trBefore.lit[i]) {
      const rw = F.toWorld(state.rec[i][0], BEAM_Y, state.rec[i][1]);
      effects.push(fx.sound('checkpoint', rw.x, rw.y, rw.z));
      effects.push(fx.particles('beamImpact', rw.x, rw.y, rw.z, 0x9affff));
    }
  }
  if (na > nb && !allLit(tr)) effects.push(fx.message('Alıcı yandı! ' + na + '/' + tr.lit.length));
  if (allLit(tr)) {
    state.done = true;
    solvedEffects(chamberInfo(ctx, state), 'Işık alıcıya ulaştı! Arka kapı açıldı.', effects);
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
  if (state.done) return 'Işık tüm alıcılara ulaştı, arka kapı açık.';
  const tr = traceBeams(state);
  const base = 'Işık kaynağından başla: bir aynayı sağ tıklayarak 90° çevir. Aynanın dibinde parlayan köşe, yansıtan yüzün baktığı yöndür; '
    + 'ışık aynanın arkasına çarparsa söner.';
  const extra = state.spl.length > 0
    ? ' Mantık kapısı ışını ikiye böler; yan ışının yönünü sağ tıkla çevir.' : '';
  return base + extra + ' Alıcı: ' + litCount(tr) + '/' + tr.lit.length + ' yanıyor.';
}

function build(ctx) {
  const state = generate(ctx);
  const info = shell(ctx, state);
  const F = frame(ctx);
  paintMap(F, dyn(state, traceBeams(state)));
  const anchors = {
    sources: [], mirrors: [], splitters: [], receivers: [], door: info.doorBack,
  };
  for (let i = 0; i < state.src.length; i++) anchors.sources.push(F.toWorld(state.src[i][0], BEAM_Y, state.src[i][1]));
  for (let i = 0; i < state.mir.length; i++) anchors.mirrors.push(F.toWorld(state.mir[i][0], BEAM_Y, state.mir[i][1]));
  for (let i = 0; i < state.spl.length; i++) anchors.splitters.push(F.toWorld(state.spl[i][0], BEAM_Y, state.spl[i][1]));
  for (let i = 0; i < state.rec.length; i++) anchors.receivers.push(F.toWorld(state.rec[i][0], BEAM_Y, state.rec[i][1]));
  return { state, anchors };
}

function restore(ctx, state) {
  const info = chamberInfo(ctx, state);
  const F = frame(ctx);
  clearInterior(F, info);
  paintMap(F, dyn(state, traceBeams(state)));
  applyDoor(ctx, info, state.done);
}

const impl = {
  type: TYPE,
  name: 'Işın ve Ayna',
  summary: 'Aynaları çevirerek ışık huzmesini alıcı kristale ulaştır.',
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
