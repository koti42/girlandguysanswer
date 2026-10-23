/*
 * KEŞİF bulmaca ⑤ İtilebilir Blok (Sokoban)  (tip: 'itilebilirblok')
 *
 * Izgara üstünde itilebilir bloklar (sistem bloğu "itilebilir blok") sarı zemin karolu hedef plakalara itilir. Blok yalnızca
 * İTİLEBİLİR (çekilmez); yürüyerek ya da sağ tıklayarak itilir. Bir blok hedefe oturunca üstünde fener yanar; hepsi oturunca
 * arka kapı açılır. Seviye çözülmüş durumdan ters hamlelerle üretilir → her zaman çözülebilir (kitP1Soko.js).
 * Hata affı: sol kol son hamleyi GERİ ALIR (en çok 60 hamle), sağ kol seviyeyi sıfırlar; bloğu köşeye sıkıştıran (hedef
 * dışındaki) hamle otomatik geri alınır.
 *
 * Olay sözleşmesi: 'step' | 'use' | 'push' blok hücresinde (ly 0..1): yön ev.dx/ev.dz (dünya) ya da ev.px/ev.pz (oyuncu konumu);
 * yön yoksa 'use' bloğu odanın içine doğru (+lz) iter. 'use' sol/sağ kolda: geri al / sıfırla.
 */
import { B } from '../blocks.js';
import { registerPuzzle } from './kitRegistry.js';
import {
  chamberSize, frame, fx, localXRange, subRng, worldToLocal,
} from './kit.js';
import {
  SOKO_SIZES, cornerDead, generateSokoLevel, makeGrid,
} from './kitP1Soko.js';
import {
  EMPTY, applyDoor, chamberInfo, clearInterior, dynDiff, guardEffect, paintMap, put, pushDirection, shell, solvedEffects,
} from './kitP1Common.js';

const TYPE = 'itilebilirblok';
const H = 5;
const GZ0 = 2; // ızgara ilk sırasının lz değeri
const MAX_HIST = 60;
const PUSH_COOLDOWN = 0.25;

function clampD(d) {
  const n = Math.round(Number(d));
  return Math.max(1, Math.min(5, Number.isFinite(n) ? n : 1));
}

function sizeOf(d) {
  const g = SOKO_SIZES[d - 1];
  return chamberSize(g[0] + 2, g[1] + 3, H);
}

function footprint(difficulty) {
  const s = sizeOf(clampD(difficulty));
  return { w: s.w, d: s.d, h: s.h, margin: 2 };
}

function generate(ctx) {
  const d = clampD(ctx.difficulty);
  const L = generateSokoLevel(d, (a) => subRng(ctx, 'soko' + a));
  const s = sizeOf(d);
  const xr = localXRange(s.w);
  return {
    v: 1,
    lv: d,
    done: false,
    w: s.w,
    d: s.d,
    h: s.h,
    x0: xr.x0,
    x1: xr.x1,
    GW: L.GW,
    GZ: L.GZ,
    walls: L.walls,
    targets: L.targets,
    start: L.boxes.map((b) => [b[0], b[1]]),
    boxes: L.boxes.map((b) => [b[0], b[1]]),
    sol: L.sol,
    hist: [],
    pushes: 0,
    cool: 0,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Koordinatlar ve görünüm
 * ---------------------------------------------------------------------------------------------- */
function lxOf(state, gx) {
  return state.x0 + 1 + gx;
}

function lzOf(gz) {
  return GZ0 + gz;
}

function isTarget(state, gx, gz) {
  for (let i = 0; i < state.targets.length; i++) if (state.targets[i][0] === gx && state.targets[i][1] === gz) return true;
  return false;
}

function coveredCount(state) {
  let n = 0;
  for (let i = 0; i < state.boxes.length; i++) if (isTarget(state, state.boxes[i][0], state.boxes[i][1])) n++;
  return n;
}

function dyn(state, info) {
  const m = new Map();
  const wall = info.theme.wall;
  for (let i = 0; i < state.walls.length; i++) {
    for (let y = 0; y <= 2; y++) put(m, lxOf(state, state.walls[i][0]), y, lzOf(state.walls[i][1]), wall);
  }
  for (let i = 0; i < state.targets.length; i++) {
    const lx = lxOf(state, state.targets[i][0]);
    const lz = lzOf(state.targets[i][1]);
    put(m, lx, -1, lz, B.CONCRETE_YELLOW);
    put(m, lx, 0, lz, B.PRESSURE_PLATE);
  }
  for (let i = 0; i < state.boxes.length; i++) {
    const lx = lxOf(state, state.boxes[i][0]);
    const lz = lzOf(state.boxes[i][1]);
    put(m, lx, 0, lz, B.PUSH_BLOCK);
    if (isTarget(state, state.boxes[i][0], state.boxes[i][1])) put(m, lx, 1, lz, B.LANTERN);
  }
  put(m, state.x0, 0, 0, B.LEVER); // geri al
  put(m, state.x1, 0, 0, B.LEVER); // sıfırla
  return m;
}

function boxAt(state, gx, gz) {
  for (let i = 0; i < state.boxes.length; i++) if (state.boxes[i][0] === gx && state.boxes[i][1] === gz) return i;
  return -1;
}

function wallAt(state, gx, gz) {
  for (let i = 0; i < state.walls.length; i++) if (state.walls[i][0] === gx && state.walls[i][1] === gz) return true;
  return false;
}

/** Bloğu (gx,gz)'den (dx,dz) yönünde bir hücre iter; başarılıysa true. */
function movePush(ctx, state, bi, dx, dz) {
  const nx = state.boxes[bi][0] + dx;
  const nz = state.boxes[bi][1] + dz;
  if (nx < 0 || nx >= state.GW || nz < 0 || nz >= state.GZ || wallAt(state, nx, nz) || boxAt(state, nx, nz) >= 0) return false;
  const lx = lxOf(state, nx);
  const lz = lzOf(nz);
  const w = frame(ctx).toWorld(lx, 0, lz);
  const b = ctx.getBlock ? ctx.getBlock(w.x, w.y, w.z) : 0;
  if (b !== null && b !== undefined && b !== 0 && b !== B.PRESSURE_PLATE) return false;
  state.hist.push([bi, state.boxes[bi][0], state.boxes[bi][1]]);
  if (state.hist.length > MAX_HIST) state.hist.shift();
  state.boxes[bi][0] = nx;
  state.boxes[bi][1] = nz;
  state.pushes += 1;
  return true;
}

function deadBox(state, bi) {
  const g = makeGrid(state.GW, state.GZ, state.walls, state.boxes);
  const ts = new Set(state.targets.map((t) => t[0] + ',' + t[1]));
  return cornerDead(state.GW, state.GZ, g, ts, state.boxes[bi][0], state.boxes[bi][1]);
}

/* ------------------------------------------------------------------------------------------------
 * Arayüz
 * ---------------------------------------------------------------------------------------------- */
const TMP = { x: 0, y: 0, z: 0 };
const IDLE = { state: null, effects: EMPTY };

function interact(ctx, state, ev) {
  const t = ev.type;
  if (!Number.isFinite(ev.x) || !Number.isFinite(ev.y) || !Number.isFinite(ev.z)) return { state, effects: [], handled: false };
  if (state.done && t !== 'blockBroken' && t !== 'blockPlaced') return { state, effects: [], handled: false };
  const l = worldToLocal(ctx.origin, ctx.facing, Math.floor(ev.x), Math.floor(ev.y), Math.floor(ev.z), TMP);
  const lx = l.x;
  const ly = l.y;
  const lz = l.z;
  const F = frame(ctx);
  const info = chamberInfo(ctx, state);
  const effects = [];
  if (t === 'blockBroken' || t === 'blockPlaced') {
    const g = guardEffect(F, dyn(state, info), ev);
    if (g) effects.push(g);
    return { state, effects, handled: effects.length > 0 };
  }
  if (t !== 'use' && t !== 'step' && t !== 'push') return { state, effects, handled: false };
  // kollar
  if (t === 'use' && ly === 0 && lz === 0 && (lx === state.x0 || lx === state.x1)) {
    if (lx === state.x1) {
      effects.push(fx.sound('lever', ev.x, ev.y, ev.z));
      effects.push(fx.message('Seviye sıfırlandı.'));
      effects.push(fx.reset());
      return { state, effects, handled: true };
    }
    if (state.hist.length === 0) {
      effects.push(fx.message('Geri alınacak hamle yok.'));
      return { state, effects, handled: true };
    }
    const pre = dyn(state, info);
    const h = state.hist.pop();
    state.boxes[h[0]][0] = h[1];
    state.boxes[h[0]][1] = h[2];
    dynDiff(F, pre, dyn(state, info), effects);
    effects.push(fx.sound('lever', ev.x, ev.y, ev.z));
    effects.push(fx.message('Son hamle geri alındı.'));
    return { state, effects, handled: true };
  }
  if (ly !== 0 && ly !== 1) return { state, effects, handled: false };
  const gx = lx - (state.x0 + 1);
  const gz = lz - GZ0;
  const bi = boxAt(state, gx, gz);
  if (bi < 0) return { state, effects, handled: false };
  if (t !== 'use' && state.cool > 0) return { state, effects, handled: true };
  let dir = pushDirection(F, ev, lx, lz);
  if (!dir) {
    if (t !== 'use') return { state, effects, handled: false };
    dir = { x: 0, z: 1 };
  }
  const pre = dyn(state, info);
  const was = coveredCount(state);
  if (!movePush(ctx, state, bi, dir.x, dir.z)) {
    return { state, effects, handled: t === 'use' };
  }
  state.cool = PUSH_COOLDOWN;
  const w = F.toWorld(lxOf(state, state.boxes[bi][0]), 0, lzOf(state.boxes[bi][1]));
  effects.push(fx.sound('place:taş', w.x, w.y, w.z));
  if (deadBox(state, bi)) {
    // köşeye sıkışma: hamleyi geri al (nazikçe)
    const h = state.hist.pop();
    state.boxes[h[0]][0] = h[1];
    state.boxes[h[0]][1] = h[2];
    state.pushes -= 1;
    dynDiff(F, pre, dyn(state, info), effects);
    effects.push(fx.sound('puzzle_wrong', w.x, w.y, w.z));
    effects.push(fx.message('Bu hamle bloğu köşeye sıkıştırır; geri alındı.'));
    return { state, effects, handled: true };
  }
  dynDiff(F, pre, dyn(state, info), effects);
  const now = coveredCount(state);
  if (now > was) {
    effects.push(fx.sound('plate', w.x, w.y, w.z));
    effects.push(fx.particles('magicBurst', w.x, w.y + 1, w.z, 0xf2c91e));
    if (now < state.targets.length) effects.push(fx.message('Hedef dolu: ' + now + '/' + state.targets.length));
  }
  if (now === state.targets.length) {
    state.done = true;
    solvedEffects(info, 'Tüm bloklar yerine oturdu! Arka kapı açıldı.', effects);
  }
  return { state, effects, handled: true };
}

function tick(ctx, state, dt) {
  if (state.cool > 0) state.cool = Math.max(0, state.cool - dt);
  IDLE.state = state;
  return IDLE;
}

function isSolved(state) {
  return !!(state && state.done);
}

function hint(state) {
  if (state.done) return 'Tüm bloklar yerine oturdu, arka kapı açık.';
  return 'Blokları sarı karolu hedef plakalara it: yürüyerek ya da sağ tıklayarak itilir, çekilmez. Köşeye ya da duvar dibine '
    + 'sıkıştırma. Hedef dolu: ' + coveredCount(state) + '/' + state.targets.length
    + '. Sol kol son hamleyi geri alır, sağ kol seviyeyi sıfırlar.';
}

function build(ctx) {
  const state = generate(ctx);
  const info = shell(ctx, state);
  const F = frame(ctx);
  paintMap(F, dyn(state, info));
  const anchors = {
    undo: F.toWorld(state.x0, 0, 0),
    reset: F.toWorld(state.x1, 0, 0),
    boxes: state.boxes.map((b) => F.toWorld(lxOf(state, b[0]), 0, lzOf(b[1]))),
    targets: state.targets.map((b) => F.toWorld(lxOf(state, b[0]), 0, lzOf(b[1]))),
    door: info.doorBack,
  };
  return { state, anchors };
}

function restore(ctx, state) {
  const info = chamberInfo(ctx, state);
  const F = frame(ctx);
  clearInterior(F, info);
  paintMap(F, dyn(state, info));
  applyDoor(ctx, info, state.done);
}

const impl = {
  type: TYPE,
  name: 'İtilebilir Blok',
  summary: 'Blokları hedef plakalara it; çekemezsin, o yüzden önce düşün. Geri alma kolu yanında.',
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
