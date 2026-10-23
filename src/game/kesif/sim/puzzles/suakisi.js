/*
 * KEŞİF bulmaca: SU AKIŞI ('suakisi') — oluklu karoları çevirerek suyu kaynaktan alıcıya yönlendir; lavı uzak tut.
 *
 * Zemindeki ızgara 3×3 bloklu karolardan oluşur. Sarı YILDIZ rünlü köşesi olan karolar sağ tıkla (use) saat yönünde 90° döner;
 * siyah köşe işaretli karolar (kaynak, alıcı) ve kaya karolar sabittir. Oluklar camın altındadır: suyu ve lavı camın altından
 * görürsün (su: mavi cam + altında ışıldayan zemin, lav: turuncu cam + parlayan lav), üstünde yürüyebilirsin — lav ASLA hasar vermez (cama temas yok). Mavi camlı karo SU KAYNAĞI, kristal blok SU ALICISI
 * (etkinleşince ışıldar). Su kaynaktan bağlı olukları kademeli doldurur (kademe = karo; her karoda su sesi yükselir).
 * Lav (kırmızı ocak taşlı kaynak) bağlı olukları parlak lavla doldurur; lav ve su bileşenleri birbirine bağlanırsa karışır ve
 * obsidyene (siyah) dönüşür: bulmaca çözülmez. d4'te lav yalnızca su yolundan ayrık kalmalıdır; d5'te lav ayrıca kendi
 * havuzuna (kırmızı beton, dolunca parlar) ulaştırılmalıdır. Çözüm 1 sn sürerse arka kapı açılır.
 * Sıfırlama kolu (kırmızı alt blok) karoları başlangıç dönüşlerine döndürür.
 *
 * Çözülebilirlik: üretici çözüm dönüşlerini kurar, evaluate ile kanıtlar ve ardından karıştırır; başlangıç çözülmüş değildir.
 * Kare başı ayırma yok: akış hesabı (evaluate) dönüş sürümüne (state.rv) göre önbelleklenir.
 *
 * state: { v, lay, rots[], ft (son dönüşten beri süre), rv (dönüş sürümü), done, hold, flag (ileti durumu), falls }
 */
import { B } from '../blocks.js';
import { frame } from './kitGeometry.js';
import { buildChamber, setDoorOpen, doorEffects } from './kitChamber.js';
import { subRng } from './kitCtx.js';
import { fx } from './kitEffects.js';
import { registerPuzzle } from './kitRegistry.js';
import { chamberOf, clamp, sfx } from './ps2Shared.js';
import {
  REVEAL_STEP, SU_HOLD, TILE, clampSuDifficulty, evaluate, generateSu, grooveCells, suSize,
} from './suakisiLogic.js';

const TYPE = 'suakisi';
const EMPTY = Object.freeze([]);

const FRAMES = new WeakMap();
const DOORS = new WeakMap();
const GEN = new Map();
const EVALS = new WeakMap();

function frameOf(ctx) {
  let F = FRAMES.get(ctx);
  if (!F) {
    F = frame(ctx);
    FRAMES.set(ctx, F);
  }
  return F;
}

function genFor(ctx) {
  const diff = clampSuDifficulty(ctx.difficulty);
  const key = ctx.seed + ':' + diff;
  let json = GEN.get(key);
  if (json === undefined) {
    json = JSON.stringify(generateSu(diff, subRng(ctx, 'suakisi')));
    if (GEN.size > 64) GEN.clear();
    GEN.set(key, json);
  }
  return JSON.parse(json);
}

function chamberOpts(L) {
  return {
    w: L.w, d: L.d, h: L.h, doorBack: 'locked',
  };
}

function doorOf(ctx, L) {
  let d = DOORS.get(ctx);
  if (!d) {
    d = chamberOf(ctx, chamberOpts(L)).doorBack;
    DOORS.set(ctx, d);
  }
  return d;
}

/** Dönüş sürümüne bağlı önbellekli akış hesabı. */
function evalOf(S) {
  let e = EVALS.get(S);
  if (!e || e.rv !== S.rv) {
    e = { rv: S.rv, ev: evaluate(S.lay, S.rots) };
    EVALS.set(S, e);
  }
  return e.ev;
}

/* ------------------------------------------------------------------------------------------------
 * Hücreler: her karo 9 hücre × 3 katman (ly=−1 yüzey/cam, ly=−2 sıvı, ly=−3 taban / ıslakta ışıldayan zemin)
 * ---------------------------------------------------------------------------------------------- */
function visible(dist, i, ft) {
  return dist !== null && dist[i] >= 0 && dist[i] * REVEAL_STEP <= ft;
}

function boardCells(lay, rots, ev, ft) {
  const out = [];
  const C = lay.C;
  const n = C * lay.R;
  for (let i = 0; i < n; i++) {
    const gx = i % C;
    const gz = (i - gx) / C;
    const tile = lay.tiles[i];
    const groove = grooveCells(tile.t, rots[i]);
    const gset = new Set();
    for (let g = 0; g < groove.length; g++) gset.add(groove[g][0] + groove[g][1] * 3);
    const wv = visible(ev.W, i, ft);
    const lv = visible(ev.V, i, ft);
    const bothSeen = ev.W[i] >= 0 && ev.V && ev.V[i] >= 0 && (wv || lv);
    let liquid = 0;
    let cover = B.GLASS;
    let base = B.BASALT;
    if (bothSeen) {
      liquid = B.BASALT;
      cover = B.GLASS_BLACK;
    } else if (wv) {
      liquid = B.WATER;
      cover = B.GLASS_BLUE;
      base = B.LIGHT_BLOCK;
    } else if (lv) {
      liquid = B.LAVA;
      cover = B.GLASS_ORANGE;
    }
    for (let cz = 0; cz < 3; cz++) {
      for (let cx = 0; cx < 3; cx++) {
        const lx = lay.bx + gx * TILE + cx;
        const lz = lay.bz + gz * TILE + cz;
        const isGroove = gset.has(cx + cz * 3);
        let top;
        let under;
        let floor = B.BASALT;
        if (isGroove) {
          under = liquid;
          floor = base;
          top = cover;
          if (cx === 1 && cz === 1) {
            if (tile.t === 'ws') top = B.GLASS_BLUE;
            else if (tile.t === 'wk') top = ev.waterOk && wv ? B.RECEIVER_ON : (ev.V && ev.V[i] >= 0 && lv ? B.CONCRETE_RED : B.RECEIVER);
            else if (tile.t === 'ls') top = B.REDSTONE_ORE;
            else if (tile.t === 'lk') top = ev.V && lv ? B.LIGHT_BLOCK : B.CONCRETE_RED;
          }
        } else {
          under = B.BASALT;
          if (tile.t === 'blank') top = B.BASALT;
          else if (cx === 0 && cz === 0) top = tile.fixed ? B.CONCRETE_BLACK : B.RUNE_YELLOW;
          else top = ((gx + gz + cx + cz) & 1) === 0 ? B.POLISHED : B.STONE_BRICK;
        }
        out.push([lx, -1, lz, top]);
        out.push([lx, -2, lz, under]);
        out.push([lx, -3, lz, floor]);
      }
    }
  }
  return out;
}

function diffEffects(F, before, after) {
  const blocks = [];
  for (let i = 0; i < after.length; i++) {
    if (before[i][3] === after[i][3]) continue;
    const w = F.toWorld(after[i][0], after[i][1], after[i][2]);
    blocks.push([w.x, w.y, w.z, after[i][3]]);
  }
  return blocks.length > 0 ? fx.setBlocks(blocks) : null;
}

function visibleCount(ev, ft) {
  let n = 0;
  for (let i = 0; i < ev.W.length; i++) {
    if (ev.W[i] >= 0 && ev.W[i] * REVEAL_STEP <= ft) n++;
    if (ev.V && ev.V[i] >= 0 && ev.V[i] * REVEAL_STEP <= ft) n++;
  }
  return n;
}

function paintStatic(F, L) {
  F.fill(L.bx, -3, L.bz, L.bx + TILE * L.C - 1, -3, L.bz + TILE * L.R - 1, B.BASALT);
  F.set(L.reset.lx, -1, L.reset.lz, B.CONCRETE_RED);
  // kaynak yanı fenerler
  const sx = L.bx - 1;
  const sz = L.bz + ((L.src / L.C) | 0) * TILE + 1;
  F.set(sx, 0, sz, B.LANTERN);
}

function paintDynamic(ctx, F, L, S) {
  F.lever(L.reset.lx, 0, L.reset.lz, false);
  const cells = boardCells(L, S.rots, evalOf(S), S.ft);
  for (let i = 0; i < cells.length; i++) F.set(cells[i][0], cells[i][1], cells[i][2], cells[i][3]);
  setDoorOpen(ctx, doorOf(ctx, L), S.done);
}

/* ------------------------------------------------------------------------------------------------
 * Metin
 * ---------------------------------------------------------------------------------------------- */
function hintText(S) {
  if (S.done) return 'Tamamlandı: su alıcıya ulaştı, arka kapı açık.';
  const L = S.lay;
  const ev = evalOf(S);
  const parts = [];
  if (ev.conflict.length > 0) {
    parts.push('Su ve lav birbirine karışıyor (siyah obsidyen): karoları çevirerek lav yolunu su yolundan ayır.');
  } else if (L.lsrc >= 0 && ev.V[L.sink] >= 0) {
    parts.push('Dikkat: lav su alıcısına ulaşıyor! Karoları çevirerek lavı başka yöne ver.');
  } else {
    parts.push('Sarı yıldız işaretli karolara sağ tıkla: oluk 90° döner. Mavi camlı kaynaktan kristal alıcıya sürekli bir su yolu kur.');
  }
  if (L.needLava) parts.push('Lavı da kırmızı havuza ulaştır, ama suya karıştırma.');
  else if (L.lsrc >= 0) parts.push('Lav (kırmızı, parlak) su yoluna bağlanmamalı; camın üstünde yürümek güvenlidir.');
  parts.push('Kırmızı alt blokla işaretli kol karoları başlangıca döndürür.');
  return parts.join(' ');
}

/* ------------------------------------------------------------------------------------------------
 * Etkileşim
 * ---------------------------------------------------------------------------------------------- */
const _loc = { x: 0, y: 0, z: 0 };

function tileAt(L, loc) {
  if (loc.y !== -1 && loc.y !== -2) return -1;
  const dx = loc.x - L.bx;
  const dz = loc.z - L.bz;
  if (dx < 0 || dz < 0 || dx >= TILE * L.C || dz >= TILE * L.R) return -1;
  return Math.floor(dz / TILE) * L.C + Math.floor(dx / TILE);
}

function tileCenterWorld(F, L, i) {
  const gx = i % L.C;
  const gz = (i - gx) / L.C;
  return F.toWorld(L.bx + gx * TILE + 1, -1, L.bz + gz * TILE + 1);
}

const impl = {
  type: TYPE,
  name: 'Su Akışı',
  summary: 'Oluklu karoları çevirerek suyu kaynaktan alıcıya ulaştır; lavı su yolundan uzak tut.',
  difficultyRange: [1, 5],

  footprint(difficulty) {
    return Object.assign(suSize(difficulty), { margin: 2 });
  },

  build(ctx) {
    const g = genFor(ctx);
    const L = g.lay;
    const F = frameOf(ctx);
    const ch = buildChamber(ctx, chamberOpts(L));
    DOORS.set(ctx, ch.doorBack);
    paintStatic(F, L);
    const S = {
      v: 1,
      lay: L,
      rots: g.rots,
      ft: 0,
      rv: 0,
      done: false,
      hold: 0,
      flag: '',
      falls: 0,
    };
    paintDynamic(ctx, F, L, S);
    const door = ch.doorBack;
    return {
      state: S,
      anchors: {
        reset: F.toWorld(L.reset.lx, 0, L.reset.lz),
        source: tileCenterWorld(F, L, L.src),
        sink: tileCenterWorld(F, L, L.sink),
        door: { x: door.x, y: door.y, z: door.z },
      },
    };
  },

  restore(ctx, S) {
    paintDynamic(ctx, frameOf(ctx), S.lay, S);
  },

  interact(ctx, S, ev) {
    if (ev.type !== 'use') return { state: S, effects: EMPTY };
    const F = frameOf(ctx);
    const L = S.lay;
    const loc = F.toLocal(ev.x, ev.y, ev.z, _loc);
    const effects = [];
    if (loc.x === L.reset.lx && loc.y === 0 && loc.z === L.reset.lz) {
      effects.push(sfx('lever', ev.x, ev.y, ev.z));
      effects.push(fx.message('Oda sıfırlanıyor: karolar başlangıç dönüşüne gitti.'));
      effects.push(fx.reset());
      return { state: S, effects };
    }
    const i = tileAt(L, loc);
    if (i < 0) return { state: S, effects };
    if (S.done) {
      effects.push(fx.message('Su yolu tamamlandı.'));
      return { state: S, effects };
    }
    if (L.tiles[i].fixed) {
      effects.push(sfx('puzzle_wrong', ev.x, ev.y, ev.z, 1.1));
      effects.push(fx.message(L.tiles[i].t === 'blank' ? 'Bu kaya karo çevrilemez.' : 'Bu karo sabit: yalnızca sarı yıldız işaretli karolar döner.'));
      return { state: S, effects };
    }
    const before = boardCells(L, S.rots, evalOf(S), S.ft);
    S.rots[i] = (S.rots[i] + 1) % 4;
    S.rv += 1;
    S.ft = 0;
    S.hold = 0;
    const after = boardCells(L, S.rots, evalOf(S), S.ft);
    const eff = diffEffects(F, before, after);
    if (eff) effects.push(eff);
    const w = tileCenterWorld(F, L, i);
    effects.push(sfx('place', w.x, w.y, w.z, 0.9 + 0.1 * S.rots[i]));
    return { state: S, effects };
  },

  tick(ctx, S, dt) {
    const L = S.lay;
    const ev = evalOf(S);
    const reveal = ev.maxDist * REVEAL_STEP + 0.4;
    const F = frameOf(ctx);
    const ftPrev = S.ft;
    S.ft = Math.min(ftPrev + dt, reveal + 5);
    let effects = EMPTY;
    const add = (e) => {
      if (effects === EMPTY) effects = [];
      effects.push(e);
    };
    if (visibleCount(ev, ftPrev) !== visibleCount(ev, S.ft)) {
      const eff = diffEffects(F, boardCells(L, S.rots, ev, ftPrev), boardCells(L, S.rots, ev, S.ft));
      if (eff) add(eff);
      const n = L.C * L.R;
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 2; k++) {
          const dist = k === 0 ? ev.W : ev.V;
          if (!dist || dist[i] < 0) continue;
          const t = dist[i] * REVEAL_STEP;
          if (!(t > ftPrev && t <= S.ft)) continue;
          const w = tileCenterWorld(F, L, i);
          add(sfx(k === 0 ? 'splash' : 'lava', w.x, w.y, w.z, clamp(0.8 + 0.06 * dist[i], 0.8, 2)));
          add(fx.particles('blockDust', w.x + 0.5, w.y + 0.2, w.z + 0.5, k === 0 ? 0x4aa8ff : 0xff6a1f));
        }
      }
      let flag = 'ok';
      if (ev.conflict.length > 0) flag = 'conflict';
      else if (L.lsrc >= 0 && ev.V[L.sink] >= 0 && ev.V[L.sink] * REVEAL_STEP <= S.ft) flag = 'lava-sink';
      else if (ev.W[L.sink] >= 0 && ev.W[L.sink] * REVEAL_STEP <= S.ft) flag = 'water-sink';
      if (flag !== S.flag) {
        S.flag = flag;
        const ws = tileCenterWorld(F, L, L.sink);
        if (flag === 'conflict') {
          add(sfx('puzzle_wrong', ws.x, ws.y, ws.z));
          add(fx.message('Su ve lav karıştı, obsidyene dönüştü! Lav yolunu su yolundan ayır.'));
        } else if (flag === 'lava-sink') {
          add(sfx('puzzle_wrong', ws.x, ws.y, ws.z));
          add(fx.message('Dikkat: lav su alıcısına ulaştı! Karoları çevirerek lavı başka yöne ver.'));
        } else if (flag === 'water-sink') {
          add(sfx('rune:3', ws.x, ws.y, ws.z, 1.1));
          add(fx.particles('magicBurst', ws.x + 0.5, ws.y + 1, ws.z + 0.5, 0x4aa8ff));
          add(fx.message('Su alıcıya ulaştı!'));
        }
      }
    }
    if (ev.solved && S.ft >= reveal) {
      S.hold += dt;
      if (S.hold >= SU_HOLD && !S.done) {
        S.done = true;
        const door = doorOf(ctx, L);
        const dEff = doorEffects(door, true);
        for (let i = 0; i < dEff.length; i++) add(dEff[i]);
        add(sfx('door_open', door.x, door.y, door.z));
        add(fx.message('Su yolu tamamlandı: arka kapı açıldı!'));
      }
    } else if (S.hold > 0 && !S.done) {
      S.hold = 0;
    }
    return { state: S, effects };
  },

  isSolved(S) {
    return S.done === true;
  },

  hint(S) {
    return hintText(S);
  },
};

export const suakisi = registerPuzzle(TYPE, impl);
export default suakisi;
