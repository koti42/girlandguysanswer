/*
 * KEŞİF bulmaca ② Rün Dizisi  (tip: 'runedizisi')  — Simon tarzı hafıza bulmacası
 *
 * Arka sırada 5 rün taşı vardır; her birinin RENGİ, ZEMİN ŞEKLİ (üçgen, daire, kare, yıldız, baklava) ve SESİ (rune:0..4)
 * ayrıdır. Kola ya da bir taşa dokununca dizi sırayla yanıp sönerek (ışık + ses + parçacık) oynatılır; oyuncu aynı sırayı
 * tekrar eder. Bölüm bölüm ilerler: 2, 3, … N uzunlukta diziler (N = 3, 4, 5, 6, 8; zorluğa göre hız da artar).
 * Hata "yumuşaktır": uyarı sesi + nazik ileti, aynı dizi yeniden oynatılır; aynı turda 3 hata → bir tur geri (en az başlangıç).
 * Hiçbir zaman kilitlenmez; zamanlayıcı yok, kola her an basılıp dizi yeniden izlenebilir.
 *
 * Olay sözleşmesi: 'use' → rün taşı (ly 0/1), zemindeki şekil süsü ya da kol (sağ duvar, ön tarafta).
 * Zemin ön yanındaki ilerleme çubuğu: sarı = girilecek, parlak = doğru girilen; kırmızı üç hücre = hata sayacı.
 */
import { B, RUNES } from '../blocks.js';
import { registerPuzzle } from './kitRegistry.js';
import {
  chamberSize, frame, fx, localXRange, subRng, worldToLocal,
} from './kit.js';
import {
  COLORS, EMPTY, SHAPES3, applyDoor, bitmapFloor, chamberInfo, clearInterior, dynDiff, guardEffect, paintMap, put, shell,
  solvedEffects,
} from './kitP1Common.js';

const TYPE = 'runedizisi';
const W = 15;
const D = 13;
const H = 5;
const N_BY_DIFF = [3, 4, 5, 6, 8];
const SPEED = [1, 0.92, 0.82, 0.72, 0.62];
const RUNE_X = [-6, -3, 0, 3, 6];
const STONE_Z = D - 3; // taş sırası
const LEVER_Z = 2;

function clampD(d) {
  const n = Math.round(Number(d));
  return Math.max(1, Math.min(5, Number.isFinite(n) ? n : 1));
}

function footprint(difficulty) {
  clampD(difficulty);
  const s = chamberSize(W, D, H);
  return { w: s.w, d: s.d, h: s.h, margin: 2 };
}

function generate(ctx) {
  const d = clampD(ctx.difficulty);
  const N = N_BY_DIFF[d - 1];
  const rng = subRng(ctx, 'runeseq');
  const seq = [];
  for (let i = 0; i < N; i++) {
    let v = rng.int(0, 4);
    for (let g = 0; g < 8 && i >= 2 && seq[i - 1] === v && seq[i - 2] === v; g++) v = rng.int(0, 4);
    if (i >= 2 && seq[i - 1] === v && seq[i - 2] === v) v = (v + 1) % 5;
    seq.push(v);
  }
  const k0 = Math.min(N, 2);
  const xr = localXRange(W);
  return {
    v: 1,
    lv: d,
    done: false,
    N,
    k0,
    seq,
    round: k0,
    pos: 0,
    mode: 'idle', // idle | show | input | win
    ph: 'gap',
    t: 0,
    showI: 0,
    strikes: 0,
    lit: -1,
    litT: 0,
    wi: 0,
    spd: SPEED[d - 1],
    x0: xr.x0,
    x1: xr.x1,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Görünüm
 * ---------------------------------------------------------------------------------------------- */
function pipRow(state) {
  const start = -((state.N - 1) >> 1);
  return { start };
}

function dyn(state) {
  const m = new Map();
  for (let r = 0; r < 5; r++) {
    const lx = RUNE_X[r];
    const lit = state.done || state.lit === r;
    put(m, lx, 0, STONE_Z, RUNES[r].id);
    if (lit) put(m, lx, 1, STONE_Z, B.LIGHT_BLOCK);
    bitmapFloor(m, lx - 1, -1, STONE_Z - 3, SHAPES3[r].rows, lit ? B.LIGHT_BLOCK : COLORS[r].concrete, B.CONCRETE_BLACK);
  }
  const { start } = pipRow(state);
  for (let i = 0; i < state.N; i++) {
    let id = B.CONCRETE_BLACK;
    if (state.done) id = B.LIGHT_BLOCK;
    else if (state.mode === 'show') id = i < state.showI ? B.CONCRETE_BLUE : (i < state.round ? B.CONCRETE_YELLOW : B.CONCRETE_BLACK);
    else if (i < state.pos) id = B.LIGHT_BLOCK;
    else if (i < state.round) id = B.CONCRETE_YELLOW;
    put(m, start + i, -1, 1, id);
  }
  for (let i = 0; i < 3; i++) put(m, state.x0 + 1 + i, -1, 1, i < state.strikes ? B.CONCRETE_RED : B.CONCRETE_BLACK);
  put(m, state.x1, 0, LEVER_Z, state.mode === 'show' ? B.LEVER_ON : B.LEVER);
  return m;
}

/** Olay hücresi → rün indeksi (0..4) ya da −1. */
function runeAt(lx, ly, lz) {
  for (let r = 0; r < 5; r++) {
    const cx = RUNE_X[r];
    if (lz === STONE_Z && lx === cx && (ly === 0 || ly === 1)) return r;
    if (ly === -1 && lz >= STONE_Z - 3 && lz <= STONE_Z - 1 && lx >= cx - 1 && lx <= cx + 1) return r;
  }
  return -1;
}

/* ------------------------------------------------------------------------------------------------
 * Oyun akışı
 * ---------------------------------------------------------------------------------------------- */
function onDur(state) {
  return 0.62 * state.spd;
}

function gapDur(state) {
  return 0.3 * state.spd;
}

function runePos(F, r, ly) {
  return F.toWorld(RUNE_X[r], ly === undefined ? 1 : ly, STONE_Z);
}

function flashFx(F, effects, r) {
  const w = runePos(F, r, 2);
  effects.push(fx.sound('rune:' + r, w.x, w.y, w.z));
  effects.push(fx.particles('magicBurst', w.x, w.y, w.z, RUNES[r].hex));
}

function startShow(state, delay) {
  state.mode = 'show';
  state.ph = 'gap';
  state.t = delay;
  state.showI = 0;
  state.pos = 0;
  state.lit = -1;
  state.litT = 0;
}

/** Durumu değiştirip eski/yeni görünümü karşılaştırarak setBlock efektlerini ekler. */
function withDiff(state, F, effects, fn) {
  const before = dyn(state);
  fn();
  dynDiff(F, before, dyn(state), effects);
}

function interact(ctx, state, ev) {
  const t = ev.type;
  if (!Number.isFinite(ev.x) || !Number.isFinite(ev.y) || !Number.isFinite(ev.z)) return { state, effects: [], handled: false };
  const l = worldToLocal(ctx.origin, ctx.facing, Math.floor(ev.x), Math.floor(ev.y), Math.floor(ev.z), { x: 0, y: 0, z: 0 });
  const F = frame(ctx);
  const effects = [];
  if (t === 'blockBroken' || t === 'blockPlaced') {
    const g = guardEffect(F, dyn(state), ev);
    if (g) effects.push(g);
    return { state, effects, handled: effects.length > 0 };
  }
  if (t !== 'use' || state.done) return { state, effects, handled: false };
  // kol: diziyi yeniden oynat
  if (l.x === state.x1 && l.y === 0 && l.z === LEVER_Z) {
    if (state.mode === 'win') return { state, effects, handled: true };
    withDiff(state, F, effects, () => startShow(state, 0.6));
    effects.push(fx.sound('lever', ev.x, ev.y, ev.z));
    effects.push(fx.message('Dizi yeniden oynatılıyor: ' + state.round + ' rün. Dikkatle izle.'));
    return { state, effects, handled: true };
  }
  const r = runeAt(l.x, l.y, l.z);
  if (r < 0) return { state, effects, handled: false };
  if (state.mode === 'idle') {
    withDiff(state, F, effects, () => startShow(state, 0.8));
    effects.push(fx.message('Dizi başlıyor. Rünlerin yanış sırasını ezberle, sonra aynı sırayla dokun.'));
    return { state, effects, handled: true };
  }
  if (state.mode === 'show' || state.mode === 'win') {
    effects.push(fx.message('Önce diziyi izle; sıra sana geçince dokun.'));
    return { state, effects, handled: true };
  }
  // giriş modu
  const ok = state.seq[state.pos] === r;
  withDiff(state, F, effects, () => {
    state.lit = r;
    state.litT = 0.4;
    flashFx(F, effects, r);
    if (ok) {
      state.pos += 1;
      if (state.pos >= state.round) {
        state.pos = 0;
        if (state.round >= state.N) {
          state.mode = 'win';
          state.wi = 0;
          state.t = 0.45;
          state.ph = 'gap';
        } else {
          state.round += 1;
          state.strikes = 0;
          startShow(state, 1.1);
          state.lit = r;
          state.litT = 0.4;
          effects.push(fx.sound('checkpoint', ev.x, ev.y, ev.z));
          effects.push(fx.message('Doğru! Şimdi ' + state.round + ' rünlük dizi var.'));
        }
      }
    } else {
      state.strikes += 1;
      const w = F.toWorld(l.x, 1, l.z);
      effects.push(fx.sound('puzzle_wrong', w.x, w.y, w.z));
      if (state.strikes >= 3) {
        state.strikes = 0;
        if (state.round > state.k0) state.round -= 1;
        effects.push(fx.message('Sorun değil, biraz geri gidiyoruz. Diziyi yeniden izle.'));
      } else {
        effects.push(fx.message('Olmadı, sorun değil! Diziyi tekrar izle (' + state.strikes + '/3).'));
      }
      startShow(state, 1.2);
      state.lit = r;
      state.litT = 0.25;
    }
  });
  return { state, effects, handled: true };
}

const IDLE = { state: null, effects: EMPTY };

function tick(ctx, state, dt) {
  if (state.done || (state.mode === 'idle') || (state.mode === 'input' && state.lit < 0)) {
    IDLE.state = state;
    return IDLE;
  }
  const F = frame(ctx);
  const effects = [];
  const info = chamberInfo(ctx, { w: W, d: D, h: H });
  const prev = Object.assign({}, state);
  let touched = false;
  if (state.lit >= 0) {
    state.litT -= dt;
    if (state.litT <= 0) {
      state.lit = -1;
      state.litT = 0;
      touched = true;
    }
  }
  if (state.mode === 'show') {
    state.t -= dt;
    if (state.t <= 0) {
      if (state.ph === 'on') {
        state.lit = -1;
        touched = true;
        if (state.showI >= state.round) {
          state.mode = 'input';
          state.pos = 0;
          state.t = 0;
          effects.push(fx.message('Sıra sende! ' + state.round + ' rünü aynı sırayla dokun.'));
        } else {
          state.ph = 'gap';
          state.t = gapDur(state);
        }
      } else {
        const r = state.seq[state.showI];
        state.showI += 1;
        state.lit = r;
        state.litT = onDur(state) + 0.05;
        state.ph = 'on';
        state.t = onDur(state);
        touched = true;
        flashFx(F, effects, r);
      }
    }
  } else if (state.mode === 'win') {
    state.t -= dt;
    if (state.t <= 0) {
      if (state.wi < 5) {
        state.lit = state.wi;
        state.litT = 0.3;
        flashFx(F, effects, state.wi);
        state.wi += 1;
        state.t = 0.16;
        touched = true;
      } else {
        state.done = true;
        state.lit = -1;
        state.mode = 'win';
        touched = true;
        solvedEffects(info, 'Rünler uyum içinde! Arka kapı açıldı.', effects);
      }
    }
  }
  if (touched) dynDiff(F, dyn(prev), dyn(state), effects);
  return { state, effects };
}

function isSolved(state) {
  return !!(state && state.done);
}

function hint(state) {
  if (state.done) return 'Rünler uyum içinde, arka kapı açık.';
  const shapes = RUNES.map((r) => r.color + ' ' + r.symbol).join(', ');
  if (state.mode === 'idle') {
    return 'Kola ya da bir rün taşına dokun: taşlar sırayla yanıp ses verecek. Aynı sırayı tekrarla. Taşlar: ' + shapes + '.';
  }
  if (state.mode === 'show') return 'Dikkatle izle ve dinle: ' + state.round + ' rün yanacak.';
  return 'Sıra sende: ' + state.pos + '/' + state.round + '. Her taşın rengi, zemindeki şekli ve sesi ayrıdır. '
    + 'Unuttuysan sağdaki kolla diziyi yeniden izle; hata yapmak serbest.';
}

function build(ctx) {
  const state = generate(ctx);
  const info = shell(ctx, { w: W, d: D, h: H });
  const F = frame(ctx);
  paintMap(F, dyn(state));
  const anchors = { runes: [], lever: F.toWorld(state.x1, 0, LEVER_Z), door: info.doorBack };
  for (let r = 0; r < 5; r++) anchors.runes.push(F.toWorld(RUNE_X[r], 0, STONE_Z));
  return { state, anchors };
}

function restore(ctx, state) {
  const info = chamberInfo(ctx, { w: W, d: D, h: H });
  const F = frame(ctx);
  clearInterior(F, info);
  paintMap(F, dyn(state));
  applyDoor(ctx, info, state.done);
}

const impl = {
  type: TYPE,
  name: 'Rün Dizisi',
  summary: 'Rünlerin yanış sırasını izle, dinle ve aynı sırayla tekrar et. Hata yapmak serbest.',
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
