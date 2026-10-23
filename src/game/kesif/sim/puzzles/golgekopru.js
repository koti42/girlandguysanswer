/*
 * KEŞİF bulmaca: GÖLGE MİMARİSİ ('golgekopru') — orijinal oyun fikri.
 *
 * Bir uçurumun (çukur) üstünde süzülen monolitler vardır. Işık kulesinin (lamba) yönünü dört kolla çevirirsin:
 *   MAVİ DAİRE rünlü kollar (−/+) → AZİMUT (yatay yön; dairesel),  SARI YILDIZ rünlü kollar (−/+) → YÜKSEKLİK.
 * Açı iki rün kadranında görünür: kulenin etrafındaki yer halkası (yanan rün = lambanın yönü) ve kule gövdesindeki
 * yükseklik sütunu (yanan rün = lambanın yüksekliği). Lamba parlayan bir ışık bloğudur; gölgeler lambanın TERSİNE düşer.
 * Monolitlerin gölgeleri uçurum zeminine siyah işaret olarak düşer; mavi şeritteki hedef dilimlere oturan monolit
 * "hizalı"dır (monolit ametiste, gölge kristale dönüşür). Hepsi hizalanınca gölge köprü hayalet camdan katı kristale
 * katılaşır (satır satır). Bölüm 4–5'te ikinci kule + ikinci uçurum zincirlenir.
 *
 * "Isınıyor" ipucu (erişilebilirlik): hint(state) hizalanma yüzdesini ve sıcaklık sözcüğünü verir; her kol çekişinde
 *   {kind:'sound', name:'rune:i', pitch} (i = sıcaklık kovası 0..4, pitch hizalanmayla yükselir), parçacık rengi soğuk
 *   maviden sıcak altına kayar ve {kind:'message'} ile yüzde okunur (onSpeak). Tam isabette ayrı bir ses/parçacık.
 *
 * Güvenlik: uçurum zemininde (köprü şeridi dışı) kurtarma plakaları → {kind:'teleport'} son geçilmiş bölgeye;
 * her uçurumun yakın kenarında çıkış rampası; kırmızı alt blokla işaretli kol odayı sıfırlar. Köprü katılaşınca bölüm kilitlenir.
 *
 * state: { v, lay, t, sec:[{az,el,bt}], pul:[lever darbe bitişleri], done, falls, lastFall }
 *   sec[k].bt = köprü kurulumuna başlandığından beri süre (−1 = kurulmadı).
 */
import { B, RUNES } from '../blocks.js';
import { frame } from './kitGeometry.js';
import { buildChamber, setDoorOpen, doorEffects } from './kitChamber.js';
import { subRng } from './kitCtx.js';
import { fx } from './kitEffects.js';
import { registerPuzzle } from './kitRegistry.js';
import {
  carvePit, chamberOf, clamp, sfx, teleportFx,
} from './ps2Shared.js';
import {
  alignment, bridgeDuration, bridgeStage, clampGolgeDifficulty, golgeLayout, golgeSize, lampOffset, ringOffsets, shadowCells,
} from './golgekopruLogic.js';

const TYPE = 'golgekopru';
const FLOOR = B.COBBLE;
const GROOVE = B.CONCRETE_BLUE;
const SHADOW = B.CONCRETE_BLACK;
const SHADOW_OK = B.CRYSTAL_ROCK;
const MONO = B.BASALT;
const MONO_OK = B.AMETHYST;
const GHOST = B.GLASS_BLUE;
const SOLID = B.CRYSTAL_ROCK;
const EMPTY = Object.freeze([]);
const RES = { state: null, effects: EMPTY };
const LEVER_NAMES = ['azM', 'azP', 'elM', 'elP'];

const FRAMES = new WeakMap();
const DOORS = new WeakMap();
const LAYOUTS = new Map();

function frameOf(ctx) {
  let F = FRAMES.get(ctx);
  if (!F) {
    F = frame(ctx);
    FRAMES.set(ctx, F);
  }
  return F;
}

function layoutFor(ctx) {
  const diff = clampGolgeDifficulty(ctx.difficulty);
  const key = ctx.seed + ':' + diff;
  let json = LAYOUTS.get(key);
  if (json === undefined) {
    json = JSON.stringify(golgeLayout(diff, subRng(ctx, 'golgekopru')));
    if (LAYOUTS.size > 64) LAYOUTS.clear();
    LAYOUTS.set(key, json);
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

function pitOf(L, sec) {
  return {
    x0: L.x0,
    x1: L.x1,
    lz0: sec.c0,
    lz1: sec.c1,
    stand: L.ps,
    floorId: FLOOR,
    ramp: true,
    plateOk: () => false,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Dinamik hücreler (sabit sırada [lx,ly,lz,id]; öncesi/sonrası farkı efekt üretir)
 * ---------------------------------------------------------------------------------------------- */
function runeId(i) {
  return RUNES[((i % RUNES.length) + RUNES.length) % RUNES.length].id;
}

function sectionCells(L, sec, ss, pul) {
  const out = [];
  const offs = ringOffsets(sec.nAz);
  const lampIdx = (ss.az + (sec.nAz >> 1)) % sec.nAz;
  for (let i = 0; i < sec.nAz; i++) {
    out.push([sec.P.lx + offs[i][0], -1, sec.P.lz + offs[i][1], i === lampIdx ? runeId(i) : B.BASALT]);
  }
  for (let e = 0; e < sec.nEl; e++) out.push([sec.P.lx, e, sec.P.lz, e === ss.el ? runeId(e) : B.BASALT]);
  for (let i = 0; i < sec.nAz; i++) {
    for (let e = 0; e < sec.nEl; e++) {
      out.push([sec.P.lx + offs[i][0], e, sec.P.lz + offs[i][1], i === lampIdx && e === ss.el ? B.LIGHT_BLOCK : 0]);
    }
  }
  const al = alignment(sec, ss.az, ss.el);
  const sh = shadowCells(sec, ss.az, ss.el);
  for (let k = 0; k < sec.mono.length; k++) {
    const m = sec.mono[k];
    for (let dz = 0; dz < m.dz; dz++) {
      for (let dx = 0; dx < m.w; dx++) out.push([m.bx + dx, m.by, m.bz + dz, al.perMono[k] ? MONO_OK : MONO]);
    }
  }
  for (let lz = sec.c0; lz <= sec.c1; lz++) {
    for (let lx = L.x0; lx <= L.x1; lx++) {
      let id = lx >= -1 && lx <= 1 ? GROOVE : FLOOR;
      let hit = 0;
      for (let k = 0; k < sec.mono.length; k++) {
        const s = sh[k];
        const m = sec.mono[k];
        if (lx >= s.x && lx < s.x + m.w && lz >= s.z && lz < s.z + m.dz) hit = Math.max(hit, al.perMono[k] ? 2 : 1);
      }
      if (hit === 2) id = SHADOW_OK;
      else if (hit === 1) id = SHADOW;
      out.push([lx, L.ps - 1, lz, id]);
    }
  }
  // kurtarma plakaları: şerit dışı hücrelerde; gölgenin düştüğü hücrede plaka yok (gölge tam görünsün)
  for (let lz = sec.c0; lz <= sec.c1; lz++) {
    for (let lx = L.x0; lx <= L.x1; lx++) {
      if (lx >= -1 && lx <= 1) continue;
      let hit = false;
      for (let k = 0; k < sec.mono.length && !hit; k++) {
        const s = sh[k];
        const m = sec.mono[k];
        if (lx >= s.x && lx < s.x + m.w && lz >= s.z && lz < s.z + m.dz) hit = true;
      }
      if (lz === sec.c0 && (lx === L.x0 || lx === L.x1)) continue;
      out.push([lx, L.ps, lz, hit ? 0 : B.PRESSURE_PLATE]);
    }
  }
  for (let row = 0; row < sec.G; row++) {
    const st = bridgeStage(row, ss.bt);
    const id = st === 0 ? 0 : (st === 1 ? GHOST : SOLID);
    for (let lx = -1; lx <= 1; lx++) out.push([lx, -1, sec.c0 + row, id]);
  }
  for (let q = 0; q < 4; q++) {
    const lv = sec.lev[LEVER_NAMES[q]];
    out.push([lv.lx, lv.ly, lv.lz, pul[sec.k * 4 + q] >= 0 ? B.LEVER_ON : B.LEVER]);
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

function paintStatic(F, L) {
  for (let k = 0; k < L.sections.length; k++) {
    const sec = L.sections[k];
    carvePit(F, pitOf(L, sec));
    F.set(sec.P.lx, sec.nEl, sec.P.lz, B.PILLAR);
    F.set(sec.lev.azM.lx, -1, sec.lev.azM.lz, B.RUNE_BLUE);
    F.set(sec.lev.azP.lx, -1, sec.lev.azP.lz, B.RUNE_BLUE);
    F.set(sec.lev.elM.lx, -1, sec.lev.elM.lz, B.RUNE_YELLOW);
    F.set(sec.lev.elP.lx, -1, sec.lev.elP.lz, B.RUNE_YELLOW);
    F.set(sec.lev.azM.lx + 1, -1, sec.lev.azM.lz + 1, B.CONCRETE_WHITE);
    F.set(sec.lev.azM.lx + 1, 0, sec.lev.azM.lz + 1, B.LANTERN);
  }
  F.set(L.reset.lx, L.reset.ly - 1, L.reset.lz, B.CONCRETE_RED);
}

function paintDynamic(ctx, F, L, S) {
  F.lever(L.reset.lx, L.reset.ly, L.reset.lz, false);
  for (let k = 0; k < L.sections.length; k++) {
    const cells = sectionCells(L, L.sections[k], S.sec[k], S.pul);
    for (let i = 0; i < cells.length; i++) F.set(cells[i][0], cells[i][1], cells[i][2], cells[i][3]);
  }
  setDoorOpen(ctx, doorOf(ctx, L), S.done);
}

/* ------------------------------------------------------------------------------------------------
 * İpucu / sıcaklık
 * ---------------------------------------------------------------------------------------------- */
function activeSection(L, S) {
  for (let k = 0; k < L.sections.length; k++) if (S.sec[k].bt < 0) return k;
  return -1;
}

function warmWord(pct) {
  if (pct >= 100) return 'Tam isabet';
  if (pct >= 75) return 'Çok sıcak';
  if (pct >= 50) return 'Isınıyorsun';
  if (pct >= 25) return 'Ilık';
  return 'Soğuk';
}

function bucket(pct) {
  return pct >= 100 ? 4 : Math.min(3, Math.floor(pct / 25));
}

function warmColor(pct) {
  const t = clamp(pct / 100, 0, 1);
  const r = Math.round(0x4a + (0xff - 0x4a) * t);
  const g = Math.round(0xa8 + (0xd2 - 0xa8) * t);
  const b = Math.round(0xff + (0x4a - 0xff) * t);
  return (r << 16) | (g << 8) | b;
}

/** Etkin bölümün hizalanma yüzdesi (0..100); hepsi tamamsa 100. HUD/erişilebilirlik için. */
export function alignmentPercent(S) {
  const k = activeSection(S.lay, S);
  if (k < 0) return 100;
  return alignment(S.lay.sections[k], S.sec[k].az, S.sec[k].el).pct;
}

function hintText(S) {
  const L = S.lay;
  if (S.done) return 'Tamamlandı: gölge köprüler katılaştı, arka kapı açık.';
  const k = activeSection(L, S);
  const pct = alignmentPercent(S);
  const where = L.sections.length > 1 ? ((k + 1) + '. kule: ') : '';
  return where + 'Mavi daire rünlü kollar ışığın yönünü, sarı yıldız rünlü kollar yüksekliğini değiştirir. '
    + 'Gölgeler lambanın tersine düşer: siyah gölgeleri mavi şeritteki dilimlere oturt. '
    + 'Hizalanma %' + pct + ' — ' + warmWord(pct) + '.';
}

/* ------------------------------------------------------------------------------------------------
 * Etkileşim yardımcıları
 * ---------------------------------------------------------------------------------------------- */
function sameCell(loc, c) {
  return loc.x === c.lx && loc.y === c.ly && loc.z === c.lz;
}

const _loc = { x: 0, y: 0, z: 0 };

function completedCount(L, S) {
  let n = 0;
  for (let k = 0; k < L.sections.length; k++) {
    if (S.sec[k].bt >= bridgeDuration(L.sections[k].G)) n++;
  }
  return n;
}

function turnLever(F, L, S, k, q, ev, effects) {
  const sec = L.sections[k];
  const ss = S.sec[k];
  if (ss.bt >= 0) {
    effects.push(fx.message('Bu gölge köprü katılaştı; artık değişmez.'));
    return;
  }
  const before = sectionCells(L, sec, ss, S.pul);
  if (q === 0) ss.az = (ss.az + sec.nAz - 1) % sec.nAz;
  else if (q === 1) ss.az = (ss.az + 1) % sec.nAz;
  else if (q === 2) ss.el = Math.max(0, ss.el - 1);
  else ss.el = Math.min(sec.nEl - 1, ss.el + 1);
  S.pul[k * 4 + q] = S.t + 0.35;
  const al = alignment(sec, ss.az, ss.el);
  const after = sectionCells(L, sec, ss, S.pul);
  const eff = diffEffects(F, before, after);
  if (eff) effects.push(eff);
  const lamp = lampOffset(sec, ss.az);
  const lw = F.toWorld(sec.P.lx + lamp[0], ss.el, sec.P.lz + lamp[1]);
  const lv = F.toWorld(sec.lev[LEVER_NAMES[q]].lx, 0, sec.lev[LEVER_NAMES[q]].lz);
  effects.push(sfx('lever', lv.x, lv.y, lv.z));
  effects.push(sfx('rune:' + bucket(al.pct), lw.x, lw.y, lw.z, 0.85 + 0.5 * (al.pct / 100)));
  effects.push(fx.particles('magicBurst', lw.x + 0.5, lw.y + 0.5, lw.z + 0.5, warmColor(al.pct)));
  if (al.aligned) {
    ss.bt = 0;
    effects.push(fx.message('Gölgeler hizalandı! Gölge köprü katılaşıyor.'));
    effects.push(sfx('portal', lw.x, lw.y, lw.z, 1.3));
    effects.push(fx.particles('levelUp', lw.x + 0.5, lw.y + 0.5, lw.z + 0.5, 0xffd24a));
  } else {
    effects.push(fx.message('Hizalanma %' + al.pct + ': ' + warmWord(al.pct) + '.'));
  }
}

/* ------------------------------------------------------------------------------------------------
 * Bulmaca uygulaması
 * ---------------------------------------------------------------------------------------------- */
const impl = {
  type: TYPE,
  name: 'Gölge Mimarisi',
  summary: 'Işık kulesini çevir: süzülen monolitlerin gölgeleri hizalanınca uçurumun üstünde gölge köprü katılaşır.',
  difficultyRange: [1, 5],

  footprint(difficulty) {
    return Object.assign(golgeSize(difficulty), { margin: 2 });
  },

  build(ctx) {
    const L = layoutFor(ctx);
    const F = frameOf(ctx);
    const ch = buildChamber(ctx, chamberOpts(L));
    DOORS.set(ctx, ch.doorBack);
    paintStatic(F, L);
    const S = {
      v: 1,
      lay: L,
      t: 0,
      sec: L.sections.map((s) => ({ az: s.start.az, el: s.start.el, bt: -1 })),
      pul: L.sections.flatMap(() => [-1, -1, -1, -1]),
      done: false,
      falls: 0,
      lastFall: -99,
    };
    paintDynamic(ctx, F, L, S);
    const levers = [];
    for (let k = 0; k < L.sections.length; k++) {
      for (let q = 0; q < 4; q++) {
        const lv = L.sections[k].lev[LEVER_NAMES[q]];
        levers.push(F.toWorld(lv.lx, lv.ly, lv.lz));
      }
    }
    const door = ch.doorBack;
    return {
      state: S,
      anchors: {
        reset: F.toWorld(L.reset.lx, L.reset.ly, L.reset.lz),
        levers,
        door: { x: door.x, y: door.y, z: door.z },
      },
    };
  },

  restore(ctx, S) {
    paintDynamic(ctx, frameOf(ctx), S.lay, S);
  },

  interact(ctx, S, ev) {
    const F = frameOf(ctx);
    const L = S.lay;
    const loc = F.toLocal(ev.x, ev.y, ev.z, _loc);
    const effects = [];
    if (ev.type === 'use') {
      if (sameCell(loc, L.reset)) {
        effects.push(sfx('lever', ev.x, ev.y, ev.z));
        effects.push(fx.message('Oda sıfırlanıyor.'));
        effects.push(fx.reset());
        return { state: S, effects };
      }
      for (let k = 0; k < L.sections.length; k++) {
        for (let q = 0; q < 4; q++) {
          if (!sameCell(loc, L.sections[k].lev[LEVER_NAMES[q]])) continue;
          turnLever(F, L, S, k, q, ev, effects);
          return { state: S, effects };
        }
      }
      return { state: S, effects };
    }
    if (ev.type === 'step') {
      for (let k = 0; k < L.sections.length; k++) {
        const sec = L.sections[k];
        if (loc.y !== L.ps || loc.z < sec.c0 || loc.z > sec.c1 || loc.x < L.x0 || loc.x > L.x1) continue;
        if (loc.x >= -1 && loc.x <= 1) continue;
        if (S.t - S.lastFall >= 1.5) {
          S.lastFall = S.t;
          S.falls += 1;
          const c = L.cps[Math.min(completedCount(L, S), L.cps.length - 1)];
          effects.push(teleportFx(F, c.lx, c.ly, c.lz, 'dusme'));
          effects.push(sfx('land', ev.x, ev.y, ev.z));
          effects.push(fx.message('Uçuruma düştün! Güvenli yere döndün.'));
        }
        break;
      }
    }
    return { state: S, effects };
  },

  tick(ctx, S, dt) {
    const L = S.lay;
    const F = frameOf(ctx);
    S.t += dt;
    let effects = EMPTY;
    const add = (e) => {
      if (effects === EMPTY) effects = [];
      effects.push(e);
    };
    for (let i = 0; i < S.pul.length; i++) {
      if (S.pul[i] >= 0 && S.t >= S.pul[i]) {
        S.pul[i] = -1;
        const k = i >> 2;
        const lv = L.sections[k].lev[LEVER_NAMES[i & 3]];
        const w = F.toWorld(lv.lx, lv.ly, lv.lz);
        add(fx.setBlock(w.x, w.y, w.z, B.LEVER));
      }
    }
    let allDone = true;
    for (let k = 0; k < L.sections.length; k++) {
      const sec = L.sections[k];
      const ss = S.sec[k];
      const dur = bridgeDuration(sec.G);
      if (ss.bt < 0) {
        allDone = false;
        continue;
      }
      if (ss.bt >= dur) continue;
      const prev = ss.bt;
      ss.bt = Math.min(dur + 0.5, prev + dt);
      for (let row = 0; row < sec.G; row++) {
        const s0 = bridgeStage(row, prev);
        const s1 = bridgeStage(row, ss.bt);
        if (s0 === s1) continue;
        const blocks = [];
        for (let lx = -1; lx <= 1; lx++) {
          const w = F.toWorld(lx, -1, sec.c0 + row);
          blocks.push([w.x, w.y, w.z, s1 === 1 ? GHOST : SOLID]);
        }
        add(fx.setBlocks(blocks));
        const wc = F.toWorld(0, -1, sec.c0 + row);
        if (s1 === 1) add(sfx('place', wc.x, wc.y, wc.z, 0.8 + 0.08 * row));
        else add(fx.particles('magicBurst', wc.x + 0.5, wc.y + 1, wc.z + 0.5, 0x9fe8ff));
      }
      if (ss.bt >= dur) {
        add(fx.message('Gölge köprü katılaştı. Karşıya geçebilirsin!'));
        add(sfx('zone_unlock', F.toWorld(0, 0, sec.c0).x, F.toWorld(0, 0, sec.c0).y, F.toWorld(0, 0, sec.c0).z));
      } else {
        allDone = false;
      }
    }
    if (allDone && !S.done) {
      S.done = true;
      const door = doorOf(ctx, L);
      const dEff = doorEffects(door, true);
      for (let i = 0; i < dEff.length; i++) add(dEff[i]);
      add(sfx('door_open', door.x, door.y, door.z));
    }
    RES.state = S;
    RES.effects = effects;
    return RES;
  },

  isSolved(S) {
    return S.done === true;
  },

  hint(S) {
    return hintText(S);
  },
};

export const golgekopru = registerPuzzle(TYPE, impl);
export default golgekopru;
