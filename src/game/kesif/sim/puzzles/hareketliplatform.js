/*
 * KEŞİF bulmaca: HAREKETLİ PLATFORM SALONU ('hareketliplatform') — çukurlar, hareketli platformlar, kollar, yok olan taşlar.
 *
 * Oyuncu odaya girer; salon çukurlarla bölünmüştür. Her çukuru, sistem bloğu 'hareketli platform' ile (kayan/yükselen
 * platformlar, kollu platformlar, kaybolan taşlar) zamanlayarak geçer. Adalarda KONTROL NOKTASI plakaları vardır
 * (basılan plaka yanar). Çukura düşmek ölümcül DEĞİL: çukur zeminindeki kurtarma plakaları oyuncuyu son kontrol
 * noktasına taşır; ayrıca her çukurun yakın kenarında 1 basamaklık çıkış rampası vardır (oyun efekti desteklemese de
 * çukurdan yürüyerek çıkılır). Son adadaki bitiş plakasına basınca bulmaca çözülür ve arka kapı açılır.
 * Giriş adasındaki kırmızı alt blokla işaretli kol odayı sıfırlar.
 *
 * ── Zamana bağlı belirlenimlilik ─────────────────────────────────────────────────────────────────
 * Tüm hareket state.t'nin (yalnızca tick'te ilerler; oyuncu uzaktayken donar) işlevidir. state JSON'da: yerleşim
 * (state.lay), t, cp (ulaşılan en son kontrol noktası indeksi; 0 = giriş), lev[i] (i. çukurun kolunun çekildiği an
 * ya da −1), done, falls, lastFall, movers[]. Kayıttan yükleme/sıfırlama platformları tam konumlarına geri çizer.
 *
 * ── Oyun (fizik) için taşıma verisi ───────────────────────────────────────────────────────────────
 * 1) state.movers[] (her tick güncellenir; yerinde; platform başına bir kayıt, dünya koordinatlarında):
 *      { id:'p0', kind:'platform',
 *        x0,y0,z0,x1,y1,z1,   platformun BLOK hücrelerinin dünya AABB'si (uçlar dahil; üst yüzey y = y1+1)
 *        vx,vy,vz }           sürekli hız (blok/sn); platformun 'ideal yumuşak' yol türevi
 *    Oyuncu, ayakları üst yüzeyde (x0 ≤ ayak.x < x1+1, z0 ≤ ayak.z < z1+1, |ayak.y − (y1+1)| ≤ 0.1) iken platform
 *    hücre değiştirdiğinde TAM O HÜCRE KAYMASI kadar taşınmalıdır (blok kaydığında oyuncu yerinde kalıp düşmesin).
 * 2) Efekt (olay güdümlü, hücre kaydığı kare bir kez, kitin bilinmeyen-efekt kuralıyla onEffect'e gider):
 *      { kind:'carry', id, dx,dy,dz, box:{x0,y0,z0,x1,y1,z1} }   box = platformun ESKİ hücre AABB'si (dünya, uçlar dahil)
 *    Ayakları box üst yüzeyinde duran gövdeyi (dx,dy,dz) kadar ötele (varlıklar için de aynı).
 * 3) Efekt { kind:'teleport', x,y,z, yaw, reason } oyuncuyu (x,y,z) AYAK konumuna taşır (hızı sıfırla). Çukur zemini
 *    plakasına 'step' olayı geldiğinde (ya da state.falls artınca) üretilir.
 *
 * ── Olaylar ──────────────────────────────────────────────────────────────────────────────────────
 * 'use' kol hücresinde: kollu platformu çalıştırır (3 tur) / sıfırlama kolu odayı sıfırlar.
 * 'step' plaka hücresinde (oyuncu üstündeyken her kare): kontrol noktası / bitiş / kurtarma (çukur zemini).
 */
import { B } from '../blocks.js';
import { FACINGS, frame, normFacing } from './kitGeometry.js';
import { buildChamber, setDoorOpen, doorEffects } from './kitChamber.js';
import { subRng } from './kitCtx.js';
import { fx } from './kitEffects.js';
import { registerPuzzle } from './kitRegistry.js';
import {
  carvePit, chamberOf, pitBackground, sfx, teleportFx,
} from './ps2Shared.js';
import {
  clampPlatformDifficulty, platformLayout, platformSize, slideCell, slideFrac, slideVel, stoneStage,
} from './hareketliplatformLogic.js';

const TYPE = 'hareketliplatform';
const FLOOR_PIT = B.BASALT;
const STONE_ON = B.MOVING_PLATFORM;
const STONE_WARN = B.GLASS_ORANGE;
const EMPTY = Object.freeze([]);
const RES = { state: null, effects: EMPTY };

/* ------------------------------------------------------------------------------------------------
 * Önbellekler (ctx başına çerçeve/kapı; yerleşim için küçük LRU)
 * ---------------------------------------------------------------------------------------------- */
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
  const diff = clampPlatformDifficulty(ctx.difficulty);
  const key = ctx.seed + ':' + diff;
  let json = LAYOUTS.get(key);
  if (json === undefined) {
    json = JSON.stringify(platformLayout(diff, subRng(ctx, 'hareketliplatform')));
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

function pitOf(L, seg) {
  return {
    x0: L.x0, x1: L.x1, lz0: seg.lz0, lz1: seg.lz1, stand: seg.ps, floorId: FLOOR_PIT, ramp: seg.ramp,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Çizim
 * ---------------------------------------------------------------------------------------------- */
function paintStatic(F, L, theme) {
  const fl = theme.floor;
  const fa = theme.floorAlt;
  const wall = theme.wall;
  for (let i = 0; i < L.isl.length; i++) {
    const e = L.isl[i];
    if (e.y > 0) {
      F.paint(L.x0, 0, e.lz0, L.x1, e.y - 1, e.lz1, (lx, ly, lz) => {
        if (ly === e.y - 1) return ((lx + lz) & 1) === 0 ? fl : fa;
        return wall;
      });
    }
  }
  // Yükselti içeren salonlarda bitiş adası kapı eşiğinden (zemin) yüksektir: arka kapı 3 blok yüksekliğinde ve zeminden başladığı için
  // ada üstündeki oyuncu (boy 1,8) kapıya SIĞMIYORDU, çözülen salondan çıkılamıyordu (hazine odası/sonraki oda ulaşılmazdı).
  // Kapıya bakan son sıra bir basamak alçaltılır: ada → basamak → kapı eşiği, her adım en çok bir blok iner.
  for (let i = 1; i < L.isl.length; i++) {
    const e = L.isl[i];
    if (e.role !== 'goal' || e.y < 2) continue;
    F.fill(L.x0, e.y - 1, e.lz1, L.x1, e.y - 1, e.lz1, 0);
    F.paint(L.x0, e.y - 2, e.lz1, L.x1, e.y - 2, e.lz1, (lx, ly, lz) => (((lx + lz) & 1) === 0 ? fl : fa));
  }
  for (let i = 0; i < L.segs.length; i++) carvePit(F, pitOf(L, L.segs[i]));
  F.set(L.reset.lx, L.reset.ly - 1, L.reset.lz, B.CONCRETE_RED);
  for (let i = 0; i < L.segs.length; i++) {
    const lv = L.segs[i].lever;
    if (lv) F.set(lv.lx, lv.ly - 1, lv.lz, B.CONCRETE_YELLOW);
  }
  for (let k = 1; k < L.isl.length; k++) {
    const e = L.isl[k];
    if (e.role === 'goal') {
      F.set(-2, e.y, e.plate.lz, B.LANTERN);
      F.set(2, e.y, e.plate.lz, B.LANTERN);
      F.set(-1, e.y - 1, e.plate.lz, B.QUANTUM_BLOCK);
      F.set(1, e.y - 1, e.plate.lz, B.QUANTUM_BLOCK);
    } else {
      F.set(-2, e.y, e.plate.lz, B.TORCH);
    }
  }
}

function fillPlat(F, p, cell, id) {
  for (let lz = 0; lz < p.sz; lz++) {
    for (let lx = 0; lx < p.sx; lx++) F.set(cell[0] + lx, cell[1], cell[2] + lz, id);
  }
}

function paintDynamic(ctx, F, L, S) {
  F.lever(L.reset.lx, L.reset.ly, L.reset.lz, false);
  for (let k = 1; k < L.isl.length; k++) {
    const e = L.isl[k];
    const on = e.role === 'goal' ? S.done : S.cp >= k;
    F.set(e.plate.lx, e.y, e.plate.lz, on ? B.PRESSURE_PLATE_ON : B.PRESSURE_PLATE);
  }
  const cell = [0, 0, 0];
  for (let i = 0; i < L.segs.length; i++) {
    const seg = L.segs[i];
    const pit = pitOf(L, seg);
    if (seg.lever) F.lever(seg.lever.lx, seg.lever.ly, seg.lever.lz, S.lev[i] >= 0);
    if (seg.plat) {
      const p = seg.plat;
      const yLo = Math.min(p.from[1], p.to[1]);
      const yHi = Math.max(p.from[1], p.to[1]);
      for (let lz = seg.lz0; lz <= seg.lz1; lz++) {
        for (let lx = p.from[0]; lx < p.from[0] + p.sx; lx++) {
          for (let ly = yLo; ly <= yHi; ly++) F.set(lx, ly, lz, pitBackground(pit, lx, ly, lz));
        }
      }
      slideCell(p, slideFrac(p, S.t, S.lev[i]), cell);
      fillPlat(F, p, cell, B.MOVING_PLATFORM);
    } else if (seg.stones) {
      for (let k = 0; k < seg.stones.length; k++) {
        const st = seg.stones[k];
        const stage = stoneStage(seg.st, st, S.t);
        for (let dz = 0; dz < seg.st.ss; dz++) {
          for (let dx = 0; dx < seg.st.ss; dx++) {
            const lx = st.lx + dx;
            const lz = st.lz + dz;
            F.set(lx, seg.y0 - 1, lz, stage === 1 ? STONE_ON : (stage === 2 ? STONE_WARN : pitBackground(pit, lx, seg.y0 - 1, lz)));
          }
        }
      }
    }
  }
  setDoorOpen(ctx, doorOf(ctx, L), S.done);
}

/* ------------------------------------------------------------------------------------------------
 * movers (yerinde güncelleme)
 * ---------------------------------------------------------------------------------------------- */
const _a = { x: 0, y: 0, z: 0 };
const _b = { x: 0, y: 0, z: 0 };
const _v = [0, 0, 0];
const _c0 = [0, 0, 0];
const _c1 = [0, 0, 0];

function r3(v) {
  return Math.round(v * 1000) / 1000;
}

function writeMover(F, seg, S, m, cell) {
  const p = seg.plat;
  F.toWorld(cell[0], cell[1], cell[2], _a);
  F.toWorld(cell[0] + p.sx - 1, cell[1], cell[2] + p.sz - 1, _b);
  m.x0 = Math.min(_a.x, _b.x);
  m.x1 = Math.max(_a.x, _b.x);
  m.z0 = Math.min(_a.z, _b.z);
  m.z1 = Math.max(_a.z, _b.z);
  m.y0 = _a.y;
  m.y1 = _a.y;
  slideVel(p, S.t, S.lev[seg.i], _v);
  const f = FACINGS[normFacing(F.facing)];
  m.vx = r3(_v[0] * f.rx + _v[2] * f.fx);
  m.vy = r3(_v[1]);
  m.vz = r3(_v[0] * f.rz + _v[2] * f.fz);
}

function initMovers(F, L, S) {
  S.movers = [];
  const cell = [0, 0, 0];
  for (let i = 0; i < L.segs.length; i++) {
    const seg = L.segs[i];
    if (!seg.plat) continue;
    const m = { id: seg.plat.id, kind: 'platform' };
    slideCell(seg.plat, slideFrac(seg.plat, S.t, S.lev[i]), cell);
    writeMover(F, seg, S, m, cell);
    S.movers.push(m);
  }
}

function moverFor(S, id) {
  for (let i = 0; i < S.movers.length; i++) if (S.movers[i].id === id) return S.movers[i];
  return null;
}

/* ------------------------------------------------------------------------------------------------
 * Efekt yardımcıları
 * ---------------------------------------------------------------------------------------------- */
function plateEffect(F, lx, ly, lz, on) {
  const w = F.toWorld(lx, ly, lz);
  return fx.setBlock(w.x, w.y, w.z, on ? B.PRESSURE_PLATE_ON : B.PRESSURE_PLATE);
}

function leverEffect(F, lv, on) {
  const w = F.toWorld(lv.lx, lv.ly, lv.lz);
  return fx.setBlock(w.x, w.y, w.z, on ? B.LEVER_ON : B.LEVER);
}

function plateWorld(F, e) {
  return F.toWorld(e.plate.lx, e.y, e.plate.lz);
}

/* ------------------------------------------------------------------------------------------------
 * İpucu
 * ---------------------------------------------------------------------------------------------- */
function hintText(S) {
  const L = S.lay;
  if (S.done) return 'Tamamlandı: arka kapı açık, ilerleyebilirsin.';
  const next = Math.min(S.cp, L.segs.length - 1);
  const seg = L.segs[next];
  const parts = [];
  if (seg.plat && seg.plat.lever && S.lev[next] < 0) {
    parts.push('Kolu çek: platform bir süre çalışır, sonra durur.');
  } else if (seg.plat) {
    parts.push('Platformun ritmine bak: kenarda bekle, platform hizalanınca bin ve karşı yakada in.');
  } else {
    parts.push('Turuncu saydam görünen taş kaybolmak üzere: sağlam taşa atla, bekleme.');
  }
  parts.push('Düşersen son kontrol noktasına dönersin. Kırmızı işaretli kol odayı sıfırlar.');
  return parts.join(' ');
}

/* ------------------------------------------------------------------------------------------------
 * Bulmaca uygulaması
 * ---------------------------------------------------------------------------------------------- */
function sameCell(loc, lx, ly, lz) {
  return loc.x === lx && loc.y === ly && loc.z === lz;
}

const _loc = { x: 0, y: 0, z: 0 };

const impl = {
  type: TYPE,
  name: 'Hareketli Platform Salonu',
  summary: 'Çukurları kayan platformlar, kollar ve kaybolan taşlarla zamanlayarak geç; düşersen kontrol noktasına dön.',
  difficultyRange: [1, 5],

  footprint(difficulty) {
    return Object.assign(platformSize(difficulty), { margin: 2 });
  },

  build(ctx) {
    const L = layoutFor(ctx);
    const F = frameOf(ctx);
    const ch = buildChamber(ctx, chamberOpts(L));
    DOORS.set(ctx, ch.doorBack);
    paintStatic(F, L, ch.theme);
    const S = {
      v: 1,
      lay: L,
      t: 0,
      cp: 0,
      lev: L.segs.map(() => -1),
      done: false,
      falls: 0,
      lastFall: -99,
      movers: [],
    };
    initMovers(F, L, S);
    paintDynamic(ctx, F, L, S);
    const levers = [];
    for (let i = 0; i < L.segs.length; i++) {
      const lv = L.segs[i].lever;
      if (lv) levers.push(F.toWorld(lv.lx, lv.ly, lv.lz));
    }
    const plates = [];
    for (let k = 1; k < L.isl.length; k++) plates.push(plateWorld(F, L.isl[k]));
    const door = ch.doorBack;
    return {
      state: S,
      anchors: {
        reset: F.toWorld(L.reset.lx, L.reset.ly, L.reset.lz),
        levers,
        plates,
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
      if (sameCell(loc, L.reset.lx, L.reset.ly, L.reset.lz)) {
        effects.push(sfx('lever', ev.x, ev.y, ev.z));
        effects.push(fx.message('Oda sıfırlanıyor.'));
        effects.push(fx.reset());
        return { state: S, effects };
      }
      for (let i = 0; i < L.segs.length; i++) {
        const lv = L.segs[i].lever;
        if (!lv || !sameCell(loc, lv.lx, lv.ly, lv.lz)) continue;
        if (S.lev[i] >= 0) {
          effects.push(fx.message('Platform zaten çalışıyor.'));
        } else {
          S.lev[i] = S.t;
          effects.push(leverEffect(F, lv, true));
          effects.push(sfx('lever', ev.x, ev.y, ev.z));
          effects.push(fx.message('Kol çekildi: platform birkaç tur çalışacak.'));
        }
        return { state: S, effects };
      }
      return { state: S, effects };
    }
    if (ev.type !== 'step') return { state: S, effects };
    // kontrol noktası / bitiş plakaları
    for (let k = 1; k < L.isl.length; k++) {
      const e = L.isl[k];
      if (!sameCell(loc, e.plate.lx, e.y, e.plate.lz)) continue;
      if (e.role === 'goal') {
        if (!S.done) {
          S.done = true;
          S.cp = Math.max(S.cp, k);
          effects.push(plateEffect(F, e.plate.lx, e.y, e.plate.lz, true));
          const door = doorOf(ctx, L);
          const dEff = doorEffects(door, true);
          for (let q = 0; q < dEff.length; q++) effects.push(dEff[q]);
          effects.push(sfx('door_open', door.x, door.y, door.z));
          effects.push(fx.particles('levelUp', ev.x, ev.y + 1, ev.z, 0xffd24a));
          effects.push(fx.message('Harika! Salonu geçtin, arka kapı açıldı.'));
        }
      } else if (S.cp < k) {
        S.cp = k;
        effects.push(plateEffect(F, e.plate.lx, e.y, e.plate.lz, true));
        effects.push(sfx('checkpoint', ev.x, ev.y, ev.z));
        effects.push(fx.particles('magicBurst', ev.x, ev.y + 1, ev.z, 0x7ae0ff));
        effects.push(fx.message('Kontrol noktası kaydedildi.'));
      }
      return { state: S, effects };
    }
    // çukur zemini kurtarma plakası
    for (let i = 0; i < L.segs.length; i++) {
      const seg = L.segs[i];
      if (loc.y !== seg.ps || loc.z < seg.lz0 || loc.z > seg.lz1 || loc.x < L.x0 || loc.x > L.x1) continue;
      if (S.t - S.lastFall >= 1.5) {
        S.lastFall = S.t;
        S.falls += 1;
        const c = L.cps[Math.min(S.cp, L.cps.length - 1)];
        effects.push(teleportFx(F, c.lx, c.ly, c.lz, 'dusme'));
        effects.push(sfx('land', ev.x, ev.y, ev.z));
        effects.push(fx.message('Düştün! Son kontrol noktasına döndün.'));
      }
      return { state: S, effects };
    }
    return { state: S, effects };
  },

  tick(ctx, S, dt) {
    const L = S.lay;
    const F = frameOf(ctx);
    const tPrev = S.t;
    S.t = tPrev + dt;
    let effects = EMPTY;
    const add = (e) => {
      if (effects === EMPTY) effects = [];
      effects.push(e);
    };
    const c0 = _c0;
    const c1 = _c1;
    for (let i = 0; i < L.segs.length; i++) {
      const seg = L.segs[i];
      if (seg.plat) {
        const p = seg.plat;
        slideCell(p, slideFrac(p, tPrev, S.lev[i]), c0);
        if (S.lev[i] >= 0 && S.t >= S.lev[i] + p.W) {
          S.lev[i] = -1;
          if (seg.lever) add(leverEffect(F, seg.lever, false));
          add(fx.message('Platform durdu. Kolu yeniden çekebilirsin.'));
        }
        slideCell(p, slideFrac(p, S.t, S.lev[i]), c1);
        const mv = moverFor(S, p.id);
        if (mv) writeMover(F, seg, S, mv, c1);
        if (c0[0] === c1[0] && c0[1] === c1[1] && c0[2] === c1[2]) continue;
        const pit = pitOf(L, seg);
        const blocks = [];
        for (let lz = 0; lz < p.sz; lz++) {
          for (let lx = 0; lx < p.sx; lx++) {
            const ox = c0[0] + lx;
            const oy = c0[1];
            const oz = c0[2] + lz;
            const inNew = ox >= c1[0] && ox < c1[0] + p.sx && oz >= c1[2] && oz < c1[2] + p.sz && oy === c1[1];
            if (inNew) continue;
            const w = F.toWorld(ox, oy, oz);
            blocks.push([w.x, w.y, w.z, pitBackground(pit, ox, oy, oz)]);
          }
        }
        for (let lz = 0; lz < p.sz; lz++) {
          for (let lx = 0; lx < p.sx; lx++) {
            const w = F.toWorld(c1[0] + lx, c1[1], c1[2] + lz);
            blocks.push([w.x, w.y, w.z, B.MOVING_PLATFORM]);
          }
        }
        add(fx.setBlocks(blocks));
        const a = F.toWorld(c0[0], c0[1], c0[2]);
        const a2 = F.toWorld(c0[0] + p.sx - 1, c0[1], c0[2] + p.sz - 1);
        const n = F.toWorld(c1[0], c1[1], c1[2]);
        add({
          kind: 'carry',
          id: p.id,
          dx: n.x - a.x,
          dy: n.y - a.y,
          dz: n.z - a.z,
          box: {
            x0: Math.min(a.x, a2.x), y0: a.y, z0: Math.min(a.z, a2.z), x1: Math.max(a.x, a2.x), y1: a.y, z1: Math.max(a.z, a2.z),
          },
        });
        add(sfx('step:metal', n.x, n.y, n.z));
      } else if (seg.stones) {
        const pit = pitOf(L, seg);
        for (let k = 0; k < seg.stones.length; k++) {
          const st = seg.stones[k];
          const s0 = stoneStage(seg.st, st, tPrev);
          const s1 = stoneStage(seg.st, st, S.t);
          if (s0 === s1) continue;
          const blocks = [];
          for (let dz = 0; dz < seg.st.ss; dz++) {
            for (let dx = 0; dx < seg.st.ss; dx++) {
              const lx = st.lx + dx;
              const lz = st.lz + dz;
              const w = F.toWorld(lx, seg.y0 - 1, lz);
              blocks.push([w.x, w.y, w.z, s1 === 1 ? STONE_ON : (s1 === 2 ? STONE_WARN : pitBackground(pit, lx, seg.y0 - 1, lz))]);
            }
          }
          add(fx.setBlocks(blocks));
          const wc = F.toWorld(st.lx, seg.y0 - 1, st.lz);
          if (s1 === 2) {
            add(sfx('plate', wc.x, wc.y, wc.z, 1.5));
            add(fx.particles('blockDust', wc.x + 1, wc.y + 1, wc.z + 1, 0xff9a3a));
          } else if (s1 === 1) {
            add(sfx('place', wc.x, wc.y, wc.z, 1.2));
          }
        }
      }
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

export const hareketliplatform = registerPuzzle(TYPE, impl);
export default hareketliplatform;
