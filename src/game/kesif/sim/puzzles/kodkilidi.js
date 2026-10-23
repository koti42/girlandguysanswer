/*
 * KEŞİF bulmaca ⑩ Kod Kilidi  (tip: 'kodkilidi')  — odaya dağılmış ipuçlarıyla çözülen kod
 *
 * Kod 3–5 basamaklıdır; her basamak 1–6 (ZAR noktası) arasındadır. Her basamağın ipucu panelini duvarlarda bul: panelin üst
 * şeridindeki YANAN kare sayısı basamağın sırasını gösterir (şerit rengi de basamağın renkli kutusuyla aynıdır). Üç tür ipucu:
 *   mum       raftaki YANAN MEŞALE sayısı = basamak                      ("mum say")
 *   say       örnek bloktan mozaikte KAÇ TANE olduğu = basamak            ("şekil say")
 *   sembol    parlak şekil; yerdeki LEGEND tablosunda şekil → zar yüzü (şekil = zar noktaları)
 * Kod, zemindeki 6 zar tuşuna dokunarak girilir (ortadaki ekran son basılanı gösterir; ekrana dokunmak girişi siler).
 * Sınırlı deneme: yanlış kodda hak azalır; haklar bitince kilit süre kadar "soğur" (tuşlar kırmızı) — KALICI kilitlenme yok.
 * İpucu üretimi belirlenimlidir (aynı tohum → aynı kod/ipuçları).
 *
 * Olay sözleşmesi: 'use' → zar tuşu (3×3 zemin yüzeyi) ya da ekran. Renk körlüğü: şerit renk + yanan kare sayısı + sıra.
 */
import { B } from '../blocks.js';
import { registerPuzzle } from './kitRegistry.js';
import {
  chamberSize, frame, fx, localXRange, subRng, worldToLocal,
} from './kit.js';
import {
  COLORS, DICE, EMPTY, SHAPES3, applyDoor, bitmapFloor, bitmapWall, chamberInfo, clearInterior, dynDiff, guardEffect, paintMap,
  put, shell, shuffled, solvedEffects, wrongEffects,
} from './kitP1Common.js';

const TYPE = 'kodkilidi';
const W = 13;
const D = 24;
const H = 6;
const N_BY_DIFF = [3, 3, 4, 4, 5];
const COOL_BY_DIFF = [8, 12, 16, 20, 25];
const MAX_TRIES = 3;
const MOSAIC = [B.COPPER_BLOCK, B.IRON_BLOCK, B.GOLD_BLOCK, B.DIAMOND_BLOCK, B.AMETHYST, B.CRYSTAL_ROCK];
const PIP_Z = [16, 20]; // zar tuşu satırları (lz)
const KEY_X = [-4, 0, 4];
const DISP_Z = 12;
const PIPS_Z = 11;
const TRIES_Z = 10;
const LEGEND_Z = [3, 7];

function clampD(d) {
  const n = Math.round(Number(d));
  return Math.max(1, Math.min(5, Number.isFinite(n) ? n : 1));
}

function footprint(difficulty) {
  clampD(difficulty);
  const s = chamberSize(W, D, H);
  return { w: s.w, d: s.d, h: s.h, margin: 2 };
}

/* ------------------------------------------------------------------------------------------------
 * Üretim
 * ---------------------------------------------------------------------------------------------- */
function generate(ctx) {
  const d = clampD(ctx.difficulty);
  const N = N_BY_DIFF[d - 1];
  const rng = subRng(ctx, 'kod');
  const code = [];
  for (let i = 0; i < N; i++) code.push(rng.int(1, 6));
  const kinds = rng.shuffle(['m', 's', 'g']);
  const glyphs = shuffled(rng, 5);
  let gi = 0;
  const clues = [];
  for (let i = 0; i < N; i++) {
    const kind = kinds[i % 3];
    const v = code[i];
    if (kind === 'm') {
      const order = shuffled(rng, 6);
      const slots = new Array(6).fill(0);
      for (let q = 0; q < v; q++) slots[order[q]] = 1;
      clues.push({ k: 'm', slots });
    } else if (kind === 's') {
      const target = rng.int(0, MOSAIC.length - 1);
      const others = [];
      for (let q = 0; q < MOSAIC.length; q++) if (q !== target) others.push(q);
      rng.shuffle(others);
      const pool = [others[0], others[1]];
      const order = shuffled(rng, 9);
      const cells = new Array(9).fill(0);
      for (let q = 0; q < 9; q++) cells[order[q]] = q < v ? target : pool[rng.int(0, 1)];
      clues.push({ k: 's', cells, target });
    } else {
      clues.push({ k: 'g', g: glyphs[gi++] });
    }
  }
  // legend: kullanılan şekiller + sahte şekil ile 2 satır
  const legend = [];
  for (let i = 0; i < N; i++) if (clues[i].k === 'g') legend.push({ g: clues[i].g, v: code[i] });
  while (legend.length < 2) {
    const used = legend.map((e) => e.g);
    let g = glyphs[gi++ % 5];
    for (let t = 0; t < 5 && used.indexOf(g) >= 0; t++) g = glyphs[gi++ % 5];
    const usedV = legend.map((e) => e.v);
    let v = rng.int(1, 6);
    for (let t = 0; t < 12 && usedV.indexOf(v) >= 0; t++) v = rng.int(1, 6);
    legend.push({ g, v });
  }
  rng.shuffle(legend);
  const xr = localXRange(W);
  return {
    v: 1,
    lv: d,
    done: false,
    N,
    code,
    clues,
    legend,
    entered: [],
    last: 0,
    tries: MAX_TRIES,
    cool: 0,
    cd: COOL_BY_DIFF[d - 1],
    x0: xr.x0,
    x1: xr.x1,
    w: W,
    d: D,
    h: H,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Görünüm
 * ---------------------------------------------------------------------------------------------- */
function stationBase(state, i) {
  return { lx: i % 2 === 0 ? state.x0 : state.x1, lz0: 2 + 6 * (i >> 1) };
}

function dyn(state) {
  const m = new Map();
  // istasyon panelleri
  for (let i = 0; i < state.N; i++) {
    const { lx, lz0 } = stationBase(state, i);
    for (let c = 0; c < 5; c++) {
      for (let y = 0; y <= 4; y++) put(m, lx, y, lz0 + c, B.BASALT);
      put(m, lx, 5, lz0 + c, c <= i ? B.LIGHT_BLOCK : COLORS[i].concrete);
    }
    const cl = state.clues[i];
    if (cl.k === 'm') {
      for (let c = 1; c <= 3; c++) {
        put(m, lx, 1, lz0 + c, B.POLISHED);
        put(m, lx, 3, lz0 + c, B.POLISHED);
      }
      for (let s = 0; s < 6; s++) {
        if (!cl.slots[s]) continue;
        put(m, lx, s < 3 ? 2 : 4, lz0 + 1 + (s % 3), B.TORCH);
      }
    } else if (cl.k === 's') {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) put(m, lx, 2 - r, lz0 + 1 + c, MOSAIC[cl.cells[r * 3 + c]]);
      }
      put(m, lx, 4, lz0 + 2, MOSAIC[cl.target]);
    } else {
      bitmapWall(m, lx, 0, lz0 + 1, SHAPES3[cl.g].rows, B.LIGHT_BLOCK, B.CONCRETE_BLACK);
    }
  }
  // legend (zemin): şekil = zar yüzü
  for (let r = 0; r < 2; r++) {
    const e = state.legend[r];
    const z = LEGEND_Z[r];
    bitmapFloor(m, -3, -1, z, SHAPES3[e.g].rows, B.LIGHT_BLOCK, B.CONCRETE_BLACK);
    put(m, 0, -1, z + 1, B.CONCRETE_YELLOW);
    bitmapFloor(m, 1, -1, z, DICE[e.v], B.LIGHT_BLOCK, B.CONCRETE_BLACK);
  }
  // tries, ilerleme çubuğu, ekran
  for (let i = 0; i < MAX_TRIES; i++) put(m, i - 1, -1, TRIES_Z, i < state.tries ? B.LIGHT_BLOCK : B.CONCRETE_RED);
  const start = -((state.N - 1) >> 1);
  for (let i = 0; i < state.N; i++) {
    put(m, start + i, -1, PIPS_Z, i < state.entered.length ? B.LIGHT_BLOCK : COLORS[i].concrete);
  }
  const dispRows = state.last > 0 ? DICE[state.last] : ['...', '...', '...'];
  bitmapFloor(m, -1, -1, DISP_Z, dispRows, B.LIGHT_BLOCK, B.CONCRETE_BLACK);
  // zar tuşları
  const bg = state.cool > 0 ? B.CONCRETE_RED : B.CONCRETE_BLUE;
  for (let v = 1; v <= 6; v++) {
    const cx = KEY_X[(v - 1) % 3];
    const z0 = PIP_Z[(v - 1) / 3 | 0];
    bitmapFloor(m, cx - 1, -1, z0, DICE[v], B.LIGHT_BLOCK, bg);
  }
  return m;
}

/** Olay hücresi → tuş değeri (1..6), 0 = ekran (sil), −1 = diğer. */
function keyAt(lx, ly, lz) {
  if (ly !== -1 && ly !== 0) return -1;
  for (let v = 1; v <= 6; v++) {
    const cx = KEY_X[(v - 1) % 3];
    const z0 = PIP_Z[(v - 1) / 3 | 0];
    if (lx >= cx - 1 && lx <= cx + 1 && lz >= z0 && lz <= z0 + 2) return v;
  }
  if (lx >= -1 && lx <= 1 && lz >= DISP_Z && lz <= DISP_Z + 2) return 0;
  return -1;
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
  if (ev.type !== 'use' || state.done) return { state, effects, handled: false };
  const l = worldToLocal(ctx.origin, ctx.facing, Math.floor(ev.x), Math.floor(ev.y), Math.floor(ev.z), { x: 0, y: 0, z: 0 });
  const key = keyAt(l.x, l.y, l.z);
  if (key < 0) return { state, effects, handled: false };
  const before = dyn(state);
  if (key === 0) {
    if (state.entered.length === 0 && state.last === 0) return { state, effects, handled: true };
    state.entered = [];
    state.last = 0;
    dynDiff(F, before, dyn(state), effects);
    effects.push(fx.sound('ui_click', ev.x, ev.y, ev.z));
    effects.push(fx.message('Giriş silindi.'));
    return { state, effects, handled: true };
  }
  if (state.cool > 0) {
    wrongEffects(ev.x, ev.y, ev.z, 'Kilit soğuyor: ' + Math.ceil(state.cool) + ' saniye bekle.', effects);
    return { state, effects, handled: true };
  }
  state.entered.push(key);
  state.last = key;
  effects.push(fx.sound('rune:' + ((key - 1) % 5), ev.x, ev.y, ev.z));
  if (state.entered.length >= state.N) {
    let ok = true;
    for (let i = 0; i < state.N; i++) if (state.entered[i] !== state.code[i]) ok = false;
    if (ok) {
      state.done = true;
      dynDiff(F, before, dyn(state), effects);
      solvedEffects(chamberInfo(ctx, state), 'Kod doğru! Kilit açıldı, arka kapı açıldı.', effects);
      return { state, effects, handled: true };
    }
    state.entered = [];
    state.tries -= 1;
    if (state.tries <= 0) {
      state.cool = state.cd;
      wrongEffects(ev.x, ev.y, ev.z, 'Yanlış kod. Kilit ' + state.cd + ' saniye soğuyacak; ipuçlarını yeniden gözden geçir.', effects);
    } else {
      wrongEffects(ev.x, ev.y, ev.z, 'Yanlış kod. ' + state.tries + ' deneme hakkın kaldı.', effects);
    }
  }
  dynDiff(F, before, dyn(state), effects);
  return { state, effects, handled: true };
}

const IDLE = { state: null, effects: EMPTY };

function tick(ctx, state, dt) {
  if (state.done || !(state.cool > 0)) {
    IDLE.state = state;
    return IDLE;
  }
  state.cool -= dt;
  if (state.cool > 0) {
    IDLE.state = state;
    return IDLE;
  }
  const F = frame(ctx);
  const effects = [];
  const before = dyn(Object.assign({}, state, { cool: 1 }));
  state.cool = 0;
  state.tries = MAX_TRIES;
  dynDiff(F, before, dyn(state), effects);
  effects.push(fx.message('Kilit soğudu, yeniden deneyebilirsin.'));
  effects.push(fx.sound('checkpoint', ctx.origin.x, ctx.origin.y, ctx.origin.z));
  return { state, effects };
}

function isSolved(state) {
  return !!(state && state.done);
}

function hint(state) {
  if (state.done) return 'Kod doğru, kilit açık.';
  return 'Kodun ' + state.N + ' basamağı var; her basamak 1 ile 6 arası (zar noktası). Duvar panellerinin üst şeridindeki '
    + 'yanan kare sayısı basamağın sırasını gösterir. Mumlu raf: yanan meşale sayısı; maden mozaiği: örnek bloktan kaç tane olduğu; '
    + 'parlak şekil: yerdeki tabloda şeklin yanındaki zar yüzü. Zar tuşlarına dokun, ortadaki ekrana dokunursan giriş silinir. '
    + (state.cool > 0 ? 'Kilit soğuyor, ' + Math.ceil(state.cool) + ' saniye bekle.'
      : state.tries + ' deneme hakkın var.');
}

function build(ctx) {
  const state = generate(ctx);
  const info = shell(ctx, state);
  const F = frame(ctx);
  paintMap(F, dyn(state));
  const anchors = { keys: [], display: F.toWorld(0, -1, DISP_Z + 1), door: info.doorBack };
  for (let v = 1; v <= 6; v++) anchors.keys.push(F.toWorld(KEY_X[(v - 1) % 3], -1, PIP_Z[(v - 1) / 3 | 0] + 1));
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
  name: 'Kod Kilidi',
  summary: 'Odadaki ipuçlarından kodu çöz ve zar tuşlarıyla gir. Deneme hakkın bitse bile kilit sadece soğur.',
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
