/*
 * KEŞİF bulmaca: DENGE ODASI ('terazi') — ağırlık blokları, iki kefe, hareketli teraziler.
 *
 * Ağırlıklar: TAŞ=1, DEMİR=2, ALTIN=3, KUANTUM=5 (dört ayrı blok türü). Soldaki RAF'ta her türden sınırlı sayıda blok
 * istiflidir (zeminde yanan rün sayısı = ağırlık değeri). Oyun akışı (hepsi 'use' = sağ tık):
 *   1) Raf sütununa sağ tık → bir ağırlığı ELİNE al (duvardaki rün lambası eldeki türü gösterir). Elin doluyken rafa sağ tık = geri bırak.
 *   2) Bir kefeye (kefe/zincir/üstündeki bloklar) sağ tık → eldeki ağırlığı kefeye koy. Elin boşken kefeye sağ tık → en son
 *      eklediğin ağırlığı geri al (ön yüklü ve gizli kutular alınamaz).
 *   3) Sarı alt blokla işaretli kol: her şeyi rafa geri boşaltır; kırmızı alt blokla işaretli kol odayı sıfırlar.
 * Kefeler ağır olan aşağı, hafif olan yukarı hareket eder (katman katman, kısa animasyonla; ağırlıklar kefeyle birlikte taşınır).
 * Görünür hedef sayılarda (d3, d5) zeminde yanan rün sayısı hedef/anlık toplamı gösterir. Gizli kutular (d4–5) 'mantık kapısı'
 * bloğu olarak görünür; ağırlığı yalnızca terazinin eğiminden çıkarılır. Dengede kalan terazinin tepe lambası yanar;
 * hepsi 1 sn dengede kalınca bulmaca çözülür ve arka kapı açılır.
 *
 * Neden 'elde taşıma' sanal: ağırlıklar gerçek eşya olarak envantere verilmez (tezgâhta külçeye dönüşüp çoğaltma yapmasın,
 * sıfırlamada raf yenilenince eşya kopyalanmasın). Durum tamamen state'tedir; kayıt/sıfırlama tam geri gelir.
 *
 * ── OYUN İÇİN NOT (isteğe bağlı efekt) ───────────────────────────────────────────────────────────
 * Raf/kefe gösterim blokları gerçek bloktur. Oyuncu birini KIRARSA ('blockBroken' olayı) oda bloğu geri koyar ve
 *   { kind:'takeItem', item:'blok:…', count:1 } efekti üretir: oyun destekliyorsa düşen kopyayı envanterden düşmelidir
 *   (kit bilinmeyen efekt kuralıyla onEffect'e gider). Desteklenmezse yalnızca o tek kopya kazanılır.
 *
 * state: { v, lay, t, hand, stock:[1,2,3,5 türleri], sc:[{fixL,fixR,hidL,hidR,addL,addR,pL,pR,anim,ok}], hold, done, falls }
 */
import { B, RUNES } from '../blocks.js';
import { frame } from './kitGeometry.js';
import { buildChamber, setDoorOpen, doorEffects } from './kitChamber.js';
import { subRng } from './kitCtx.js';
import { fx } from './kitEffects.js';
import { registerPuzzle } from './kitRegistry.js';
import { chamberOf, sfx } from './ps2Shared.js';
import {
  HOLD_TIME, PAN_CAPACITY, RACK_MAX, WEIGHTS, WEIGHT_BLOCK, WEIGHT_ITEM, WEIGHT_NAME, clampTeraziDifficulty, generateTerazi,
  panSum, scaleBalanced, targetLayers, teraziSize, visibleSum, weightCount,
} from './teraziLogic.js';

const TYPE = 'terazi';
const PAN_BLOCK = B.MOVING_PLATFORM;
const CHAIN = B.FENCE;
const MYSTERY = B.LOGIC_GATE;
const EMPTY = Object.freeze([]);
const RING = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
const PAN_X = { L: -3, R: 3 };
const ANIM_STEP = 0.3;

const FRAMES = new WeakMap();
const DOORS = new WeakMap();
const GEN = new Map();

function frameOf(ctx) {
  let F = FRAMES.get(ctx);
  if (!F) {
    F = frame(ctx);
    FRAMES.set(ctx, F);
  }
  return F;
}

function genFor(ctx) {
  const diff = clampTeraziDifficulty(ctx.difficulty);
  const key = ctx.seed + ':' + diff;
  let json = GEN.get(key);
  if (json === undefined) {
    json = JSON.stringify(generateTerazi(diff, subRng(ctx, 'terazi')));
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

function runeId(i) {
  return RUNES[((i % RUNES.length) + RUNES.length) % RUNES.length].id;
}

/* ------------------------------------------------------------------------------------------------
 * Dinamik hücreler [lx,ly,lz,id] (sabit sıra → fark alma)
 * ---------------------------------------------------------------------------------------------- */
function panItems(sc, side) {
  const out = [];
  const fix = side === 'L' ? sc.fixL : sc.fixR;
  const hid = side === 'L' ? sc.hidL : sc.hidR;
  const add = side === 'L' ? sc.addL : sc.addR;
  for (let i = 0; i < fix.length; i++) out.push(WEIGHT_BLOCK[fix[i]]);
  for (let i = 0; i < hid.length; i++) out.push(MYSTERY);
  for (let i = 0; i < add.length; i++) out.push(WEIGHT_BLOCK[add[i]]);
  return out;
}

function dialRow(out, lay, side, lz, count) {
  for (let i = 0; i < 4; i++) {
    const lx = side === 'L' ? lay.x0 + i : lay.x1 - i;
    out.push([lx, -1, lz, i < count ? runeId(i) : B.BASALT]);
  }
}

function ringIndex(dx, dz) {
  for (let q = 0; q < 8; q++) if (RING[q][0] === dx && RING[q][1] === dz) return q;
  return 0;
}

function scaleCells(lay, idx, sc) {
  const spec = lay.scales[idx];
  const out = [];
  const lzc = spec.lz;
  const sides = ['L', 'R'];
  for (let s = 0; s < 2; s++) {
    const side = sides[s];
    const px = PAN_X[side];
    const layer = side === 'L' ? sc.pL : sc.pR;
    const items = panItems(sc, side);
    for (let ly = 0; ly <= 6; ly++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          let id = 0;
          if (ly === layer) id = PAN_BLOCK;
          else if (dx === 0 && dz === 0) id = ly > layer ? CHAIN : 0;
          else {
            const k = ly - layer - 1;
            if (k === 0 || k === 1) id = items[k * 8 + ringIndex(dx, dz)] || 0;
          }
          out.push([px + dx, ly, lzc + dz, id]);
        }
      }
    }
    if (spec.mode === 'target') {
      const t = side === 'L' ? spec.tL : spec.tR;
      dialRow(out, lay, side, lzc + 2, Math.min(4, t));
      dialRow(out, lay, side, lzc + 3, Math.max(0, Math.min(4, t - 4)));
    }
    if (spec.showSum) {
      const v = Math.min(8, visibleSum(sc, side));
      dialRow(out, lay, side, lzc - 2, Math.min(4, v));
      dialRow(out, lay, side, lzc - 3, Math.max(0, Math.min(4, v - 4)));
    }
  }
  out.push([0, 8, lzc, sc.ok ? B.LIGHT_BLOCK : B.BASALT]);
  return out;
}

function rackCells(lay, S) {
  const out = [];
  for (let k = 0; k < 4; k++) {
    for (let ly = 0; ly < RACK_MAX; ly++) {
      out.push([lay.x0, ly, lay.rackLz[k], ly < S.stock[k] ? WEIGHT_BLOCK[WEIGHTS[k]] : 0]);
    }
    out.push([lay.x0 - 1, 6, lay.rackLz[k], S.hand === WEIGHTS[k] ? runeId(k) : B.BASALT]);
  }
  return out;
}

function allCells(lay, S) {
  let out = rackCells(lay, S);
  for (let i = 0; i < lay.scales.length; i++) out = out.concat(scaleCells(lay, i, S.sc[i]));
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

function paintStatic(F, lay) {
  for (let k = 0; k < 4; k++) {
    for (let i = 0; i < 5; i++) F.set(lay.x0 + 1 + i, -1, lay.rackLz[k], i < WEIGHTS[k] ? runeId(i) : B.BASALT);
  }
  F.set(lay.emptyLever.lx, -1, lay.emptyLever.lz, B.CONCRETE_YELLOW);
  F.set(lay.resetLever.lx, -1, lay.resetLever.lz, B.CONCRETE_RED);
  for (let i = 0; i < lay.scales.length; i++) {
    const lz = lay.scales[i].lz;
    F.fill(0, 0, lz, 0, 6, lz, B.PILLAR);
    F.fill(lay.x0, 7, lz, lay.x1, 7, lz, B.PILLAR);
  }
}

function paintDynamic(ctx, F, lay, S) {
  F.lever(lay.emptyLever.lx, 0, lay.emptyLever.lz, false);
  F.lever(lay.resetLever.lx, 0, lay.resetLever.lz, false);
  const cells = allCells(lay, S);
  for (let i = 0; i < cells.length; i++) F.set(cells[i][0], cells[i][1], cells[i][2], cells[i][3]);
  setDoorOpen(ctx, doorOf(ctx, lay), S.done);
}

/* ------------------------------------------------------------------------------------------------
 * Metinler
 * ---------------------------------------------------------------------------------------------- */
function tiltWord(sc) {
  const d = panSum(sc, 'L') - panSum(sc, 'R');
  if (d === 0) return 'Kefeler dengede görünüyor.';
  return d > 0 ? 'Sol kefe ağır basıyor.' : 'Sağ kefe ağır basıyor.';
}

function stateText(lay, idx, sc) {
  const spec = lay.scales[idx];
  let t = tiltWord(sc);
  if (spec.mode === 'target' && spec.showSum) {
    t += ' Sol ' + visibleSum(sc, 'L') + '/' + spec.tL + ', sağ ' + visibleSum(sc, 'R') + '/' + spec.tR + '.';
  }
  return t;
}

function weightName(w) {
  return WEIGHT_NAME[w] + ' blok (' + w + ')';
}

function hintText(S) {
  const lay = S.lay;
  if (S.done) return 'Tamamlandı: teraziler dengede, arka kapı açık.';
  let idx = 0;
  for (let i = 0; i < lay.scales.length; i++) {
    if (!S.sc[i].ok) {
      idx = i;
      break;
    }
  }
  const spec = lay.scales[idx];
  const parts = [];
  if (spec.mode === 'target') parts.push('Zemindeki yanan rünler her kefenin hedef ağırlığını gösterir: kefeleri tam o sayılara getir.');
  else parts.push('Kefeleri dengele: iki tarafın toplam ağırlığı eşit olsun.');
  if (spec.hidden) parts.push('Gizemli kutunun ağırlığını terazinin eğiminden bul.');
  if (spec.minKinds > 0) parts.push('Her kefede en az ' + spec.minKinds + ' farklı ağırlık türü olmalı.');
  parts.push('Raftan blok al (sağ tık), kefeye sağ tıkla koy. Elinde: ' + (S.hand ? weightName(S.hand) : 'yok') + '.');
  parts.push(stateText(lay, idx, S.sc[idx]));
  return parts.join(' ');
}

/* ------------------------------------------------------------------------------------------------
 * Etkileşim
 * ---------------------------------------------------------------------------------------------- */
const _loc = { x: 0, y: 0, z: 0 };

function regionOf(lay, loc) {
  if (loc.x === lay.x0 && loc.y >= 0 && loc.y < RACK_MAX) {
    for (let k = 0; k < 4; k++) if (lay.rackLz[k] === loc.z) return { kind: 'rack', k };
  }
  for (let i = 0; i < lay.scales.length; i++) {
    const lz = lay.scales[i].lz;
    if (loc.z < lz - 1 || loc.z > lz + 1 || loc.y < 0 || loc.y > 6) continue;
    for (const side of ['L', 'R']) {
      if (loc.x >= PAN_X[side] - 1 && loc.x <= PAN_X[side] + 1) return { kind: 'pan', i, side };
    }
  }
  return null;
}

function weightIndex(w) {
  return WEIGHTS.indexOf(w);
}

function reevaluate(S) {
  for (let i = 0; i < S.lay.scales.length; i++) {
    if (!scaleBalanced(S.lay.scales[i], S.sc[i])) S.sc[i].ok = false;
  }
}

function applyChange(F, S, before, effects) {
  reevaluate(S);
  const eff = diffEffects(F, before, allCells(S.lay, S));
  if (eff) effects.push(eff);
}

function cellId(lay, S, loc) {
  const cells = allCells(lay, S);
  for (let i = 0; i < cells.length; i++) {
    if (cells[i][0] === loc.x && cells[i][1] === loc.y && cells[i][2] === loc.z) return cells[i][3];
  }
  return 0;
}

function handleUse(F, S, ev, loc, effects) {
  const lay = S.lay;
  if (loc.x === lay.emptyLever.lx && loc.y === 0 && loc.z === lay.emptyLever.lz) {
    effects.push(sfx('lever', ev.x, ev.y, ev.z));
    if (S.done) {
      effects.push(fx.message('Teraziler çözüldü; boşaltmaya gerek yok.'));
      return;
    }
    const before = allCells(lay, S);
    let n = 0;
    for (let i = 0; i < S.sc.length; i++) {
      const sc = S.sc[i];
      const all = sc.addL.concat(sc.addR);
      for (let q = 0; q < all.length; q++) {
        S.stock[weightIndex(all[q])] += 1;
        n++;
      }
      sc.addL = [];
      sc.addR = [];
    }
    if (S.hand) {
      S.stock[weightIndex(S.hand)] += 1;
      S.hand = 0;
      n++;
    }
    applyChange(F, S, before, effects);
    effects.push(fx.message(n > 0 ? 'Kefeler boşaltıldı: ' + n + ' ağırlık rafa döndü.' : 'Kefelerde alınacak ağırlık yok.'));
    return;
  }
  if (loc.x === lay.resetLever.lx && loc.y === 0 && loc.z === lay.resetLever.lz) {
    effects.push(sfx('lever', ev.x, ev.y, ev.z));
    effects.push(fx.message('Oda sıfırlanıyor: kefeler ve raf ilk haline döndü.'));
    effects.push(fx.reset());
    return;
  }
  const reg = regionOf(lay, loc);
  if (!reg) return;
  if (S.done) {
    effects.push(fx.message('Teraziler dengede; bulmaca çözüldü.'));
    return;
  }
  const before = allCells(lay, S);
  if (reg.kind === 'rack') {
    if (S.hand) {
      S.stock[weightIndex(S.hand)] += 1;
      S.hand = 0;
      effects.push(sfx('place', ev.x, ev.y, ev.z, 0.9));
      effects.push(fx.message('Ağırlık rafa geri bırakıldı.'));
    } else if (S.stock[reg.k] > 0) {
      S.stock[reg.k] -= 1;
      S.hand = WEIGHTS[reg.k];
      effects.push(sfx('pickup', ev.x, ev.y, ev.z, 0.8 + 0.12 * reg.k));
      effects.push(fx.message('Elinde: ' + weightName(S.hand) + '. Bir kefeye sağ tıkla koy.'));
    } else {
      effects.push(sfx('puzzle_wrong', ev.x, ev.y, ev.z));
      effects.push(fx.message('Bu ağırlık türü tükendi.'));
    }
    applyChange(F, S, before, effects);
    return;
  }
  const sc = S.sc[reg.i];
  const list = reg.side === 'L' ? sc.addL : sc.addR;
  if (S.hand) {
    if (weightCount(sc, reg.side) >= PAN_CAPACITY) {
      effects.push(fx.message('Kefe dolu.'));
      return;
    }
    const w = S.hand;
    list.push(w);
    S.hand = 0;
    effects.push(sfx('place', ev.x, ev.y, ev.z, 0.8 + 0.1 * weightIndex(w)));
    effects.push(sfx('step:metal', ev.x, ev.y, ev.z));
    effects.push(fx.message(weightName(w) + ' ' + (reg.side === 'L' ? 'sol' : 'sağ') + ' kefeye kondu. ' + stateText(lay, reg.i, sc)));
  } else if (list.length > 0) {
    const w = list.pop();
    S.hand = w;
    effects.push(sfx('pickup', ev.x, ev.y, ev.z, 0.8 + 0.1 * weightIndex(w)));
    effects.push(fx.message('Kefeden alındı: ' + weightName(w) + '. ' + stateText(lay, reg.i, sc)));
  } else {
    effects.push(fx.message('Kefede alabileceğin ağırlık yok: ön yüklü ve gizli kutular yerinde kalır.'));
    return;
  }
  applyChange(F, S, before, effects);
}

function handleBroken(S, ev, loc, effects) {
  const id = cellId(S.lay, S, loc);
  for (let k = 0; k < 4; k++) {
    if (id === WEIGHT_BLOCK[WEIGHTS[k]]) {
      effects.push(fx.setBlock(ev.x, ev.y, ev.z, id));
      effects.push({
        kind: 'takeItem', item: WEIGHT_ITEM[WEIGHTS[k]], count: 1, reason: 'terazi',
      });
      effects.push(fx.message('Bu ağırlık odaya ait: yerine geri kondu. Elinde taşımak için raftan sağ tıkla al.'));
      return;
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Bulmaca uygulaması
 * ---------------------------------------------------------------------------------------------- */
const impl = {
  type: TYPE,
  name: 'Denge Odası',
  summary: 'Taş, demir, altın ve kuantum ağırlıklarıyla terazileri dengele ya da hedef sayılara getir.',
  difficultyRange: [1, 5],

  footprint(difficulty) {
    return Object.assign(teraziSize(difficulty), { margin: 2 });
  },

  build(ctx) {
    const g = genFor(ctx);
    const lay = g.lay;
    const F = frameOf(ctx);
    const ch = buildChamber(ctx, chamberOpts(lay));
    DOORS.set(ctx, ch.doorBack);
    paintStatic(F, lay);
    const S = {
      v: 1,
      lay,
      t: 0,
      hand: 0,
      stock: g.init.stock,
      sc: g.init.sc,
      hold: 0,
      done: false,
      falls: 0,
    };
    paintDynamic(ctx, F, lay, S);
    const door = ch.doorBack;
    return {
      state: S,
      anchors: {
        empty: F.toWorld(lay.emptyLever.lx, 0, lay.emptyLever.lz),
        reset: F.toWorld(lay.resetLever.lx, 0, lay.resetLever.lz),
        rack: lay.rackLz.map((lz) => F.toWorld(lay.x0, 0, lz)),
        door: { x: door.x, y: door.y, z: door.z },
      },
    };
  },

  restore(ctx, S) {
    paintDynamic(ctx, frameOf(ctx), S.lay, S);
  },

  interact(ctx, S, ev) {
    const F = frameOf(ctx);
    const loc = F.toLocal(ev.x, ev.y, ev.z, _loc);
    const effects = [];
    if (ev.type === 'use') {
      handleUse(F, S, ev, loc, effects);
      return { state: S, effects, handled: effects.length > 0 };
    }
    if (ev.type === 'blockBroken') handleBroken(S, ev, loc, effects);
    return { state: S, effects };
  },

  tick(ctx, S, dt) {
    const lay = S.lay;
    const F = frameOf(ctx);
    S.t += dt;
    let effects = EMPTY;
    const add = (e) => {
      if (effects === EMPTY) effects = [];
      effects.push(e);
    };
    let all = true;
    for (let i = 0; i < lay.scales.length; i++) {
      const sc = S.sc[i];
      const tg = targetLayers(sc);
      let settled = true;
      if (sc.pL !== tg[0] || sc.pR !== tg[1]) {
        settled = false;
        sc.anim += dt;
        if (sc.anim >= ANIM_STEP) {
          const before = scaleCells(lay, i, sc);
          sc.pL += Math.sign(tg[0] - sc.pL);
          sc.pR += Math.sign(tg[1] - sc.pR);
          sc.anim = 0;
          const eff = diffEffects(F, before, scaleCells(lay, i, sc));
          if (eff) add(eff);
          const w = F.toWorld(0, 4, lay.scales[i].lz);
          add(sfx('step:metal', w.x, w.y, w.z, 0.8));
          settled = sc.pL === tg[0] && sc.pR === tg[1];
        }
      } else {
        sc.anim = 0;
      }
      if (settled && scaleBalanced(lay.scales[i], sc)) {
        if (!sc.ok) {
          sc.ok = true;
          const lz = lay.scales[i].lz;
          const eff = diffEffects(F, [[0, 8, lz, B.BASALT]], [[0, 8, lz, B.LIGHT_BLOCK]]);
          if (eff) add(eff);
          const w = F.toWorld(0, 8, lz);
          add(sfx('rune:4', w.x, w.y, w.z, 1.2));
          add(fx.particles('magicBurst', w.x + 0.5, w.y + 0.5, w.z + 0.5, 0xffd24a));
          add(fx.message(lay.scales.length > 1 ? 'Terazi ' + (i + 1) + ' dengede!' : 'Terazi dengede!'));
        }
      } else if (sc.ok && !scaleBalanced(lay.scales[i], sc)) {
        sc.ok = false;
      }
      if (!sc.ok) all = false;
    }
    if (all && !S.done) {
      S.hold += dt;
      if (S.hold >= HOLD_TIME) {
        S.done = true;
        const door = doorOf(ctx, lay);
        const dEff = doorEffects(door, true);
        for (let i = 0; i < dEff.length; i++) add(dEff[i]);
        add(sfx('door_open', door.x, door.y, door.z));
        add(fx.message('Teraziler dengede kaldı: arka kapı açıldı!'));
      }
    } else if (!all) {
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

export const terazi = registerPuzzle(TYPE, impl);
export default terazi;
