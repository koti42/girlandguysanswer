/*
 * KEŞİF bulmaca ① Basınç Plakası + Kapı  (tip: 'basincplakasi')
 *
 * Oda boydan boya "bölümlerden" oluşur (her bölüm 9 sıra; aralarında kapı duvarı). Bir bölümün plakalarının HEPSİ aynı anda
 * yanarsa (0,5 sn) bölümün kapısı yükselerek açılır; son bölüm bitince arka kapı açılır. Plaka türleri (renk + ŞEKİL):
 *   hafif   (mavi, artı '+')      oyuncu, yaratık ya da blok basabilir
 *   ağır    (kırmızı, çarpı 'x')  YALNIZCA blok ya da yaratık (oyuncunun kendi ağırlığı sayılmaz)
 *   zamanlı (turuncu, halka 'o')  basılıp ayrılınca N sn daha yanık kalır (blok kalıcı tutar) — koşarak yetiş
 * Plakanın zemin süsü sönükken türün rengindedir, yanınca parlar; zamanlı plakada halka yavaşça söner.
 * Bölümlerde itilebilir bloklar (kasa) doğar: yürüyerek ya da sağ tıklayarak it (yön yoksa en yakın boş plakaya doğru iter).
 *
 * Adalet: her bölümde blok sayısı ≥ (ağır + hafif−1) + 1 yedek; oyuncu bir hafif plakada durur. Blok sıkışırsa
 * (hiçbir plakaya ulaşamıyorsa) ve yeterli blok kalmazsa bloklar OTOMATİK yeniden doğar; duvardaki kol da aynısını yapar.
 *
 * Olay sözleşmesi (oyun → bulmaca):
 *   'step' plaka hücresinde (her kare)          plakayı tutar (ev.y plaka y'si ya da +1)
 *   'entity' plaka hücresinde                    yaratık (her tür plakayı tutar; ağır plakayı yalnızca yaratık/blok tutar)
 *   'step'|'use'|'push' kasa hücresinde          kasayı iter; yön: ev.dx/ev.dz (dünya) ya da ev.px/ev.pz (oyuncu konumu);
 *                                                'use' için yön yoksa en yakın boş plakaya doğru bir adım
 *   'use' duvardaki kolda                        bu bölümün bloklarını yeniden doğurur
 * Durum JSON; yerleşim state.L içinde saklanır (jeneratör değişse de eski kayıtlar geçerli kalır).
 */
import { B } from '../blocks.js';
import { registerPuzzle } from './kitRegistry.js';
import {
  chamberSize, frame, fx, localXRange, subRng, worldToLocal,
} from './kit.js';
import {
  EMPTY, applyDoor, chamberInfo, clearInterior, dynDiff, guardEffect, paintMap, put, pushDirection, shell, solvedEffects,
} from './kitP1Common.js';

const TYPE = 'basincplakasi';
const STRIDE = 10; // bölüm adımı: 9 sıra + kapı duvarı
const ROWS = 9;
const H = 5;
const SYNC_TIME = 0.5;
const GATE_STEP = 0.2;
const STEP_GRACE = 0.3;
const PUSH_COOLDOWN = 0.22;

const PLANS = [
  [['h', 'h']],
  [['h', 'h', 'h']],
  [['h', 't'], ['a', 'h']],
  [['t', 't'], ['a', 'h', 't'], ['a', 't']],
  [['t', 'h', 't'], ['a', 'a', 'h', 't'], ['a', 't', 'h']],
];
const T_BY_DIFF = [0, 0, 9, 8, 7];
const KIND_COLOR = { h: B.CONCRETE_BLUE, a: B.CONCRETE_RED, t: B.CONCRETE_ORANGE };
const RING = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
const PLUS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const CROSS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function clampD(d) {
  const n = Math.round(Number(d));
  return Math.max(1, Math.min(5, Number.isFinite(n) ? n : 1));
}

function sizeOf(d) {
  const plan = PLANS[d - 1];
  let nmax = 2;
  for (let i = 0; i < plan.length; i++) nmax = Math.max(nmax, plan[i].length);
  const w = Math.max(7, 3 * nmax + 1 - (nmax % 2));
  return chamberSize(w, STRIDE * plan.length - 1, H);
}

/* ------------------------------------------------------------------------------------------------
 * Üretim
 * ---------------------------------------------------------------------------------------------- */
function generate(ctx) {
  const d = clampD(ctx.difficulty);
  const plan = PLANS[d - 1];
  const size = sizeOf(d);
  const xr = localXRange(size.w);
  const rng = subRng(ctx, 'basinc');
  const zones = [];
  let po = 0;
  for (let z = 0; z < plan.length; z++) {
    const zs = STRIDE * z;
    const kinds = rng.shuffle(plan[z].slice());
    const n = kinds.length;
    const slack = Math.max(0, size.w - 3 - 3 * (n - 1));
    const s = rng.int(0, slack);
    const plates = [];
    let heavy = 0;
    let light = 0;
    for (let j = 0; j < n; j++) {
      plates.push({ x: xr.x0 + 1 + 3 * j + s, z: zs + rng.int(6, 7), k: kinds[j] });
      if (kinds[j] === 'a') heavy++;
      if (kinds[j] === 'h') light++;
    }
    const need = heavy + Math.max(0, light - 1);
    const crateN = Math.min(3, need + 1);
    const rows = rng.shuffle([1, 2, 3]).slice(0, crateN);
    const crates = [];
    for (let c = 0; c < crateN; c++) crates.push([rng.int(xr.x0 + 1, xr.x1 - 1), zs + rows[c]]);
    zones.push({
      zs, gz: z < plan.length - 1 ? zs + ROWS : -1, po, plates, crates, need,
    });
    po += n;
  }
  const crates = [];
  for (let z = 0; z < zones.length; z++) {
    for (let c = 0; c < zones[z].crates.length; c++) crates.push([zones[z].crates[c][0], zones[z].crates[c][1], z]);
  }
  const Z = zones.length;
  const zeros = (n) => new Array(n).fill(0);
  return {
    v: 1,
    lv: d,
    done: false,
    L: {
      w: size.w, d: size.d, h: size.h, x0: xr.x0, x1: xr.x1, T: T_BY_DIFF[d - 1], zones,
    },
    crates,
    hold: zeros(po),
    vs: zeros(po),
    zs: zeros(Z),
    gate: zeros(Z),
    gt: zeros(Z),
    sync: zeros(Z),
    cool: 0,
    fin: 0,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Görünüm (dyn haritası)
 * ---------------------------------------------------------------------------------------------- */
function padCells(kind) {
  if (kind === 'h') return PLUS;
  if (kind === 'a') return CROSS;
  return RING;
}

function dyn(state, info) {
  const L = state.L;
  const m = new Map();
  const wall = info.theme.pillar;
  for (let z = 0; z < L.zones.length; z++) {
    const Zn = L.zones[z];
    // plakalar ve süsler
    for (let j = 0; j < Zn.plates.length; j++) {
      const p = Zn.plates[j];
      const v = state.vs[Zn.po + j];
      put(m, p.x, 0, p.z, v > 0 ? B.PRESSURE_PLATE_ON : B.PRESSURE_PLATE);
      const cells = padCells(p.k);
      const lit = p.k === 't' ? v : (v > 0 ? cells.length : 0);
      for (let c = 0; c < cells.length; c++) {
        put(m, p.x + cells[c][0], -1, p.z + cells[c][1], c < lit ? B.LIGHT_BLOCK : KIND_COLOR[p.k]);
      }
    }
    // duvardaki yeniden doğurma kolu
    put(m, L.x1, 0, Zn.zs, B.LEVER);
    // kapı duvarı
    if (Zn.gz >= 0) {
      const open = state.gate[z];
      for (let lx = L.x0; lx <= L.x1; lx++) {
        for (let ly = 0; ly < L.h; ly++) {
          const door = lx >= -1 && lx <= 1 && ly <= 2;
          let id = wall;
          if (door) id = ly < 3 - open ? B.LOCKED_DOOR : 0;
          else if (lx >= -1 && lx <= 1 && ly === 3) id = open >= 3 ? B.LIGHT_BLOCK : B.CONCRETE_RED;
          put(m, lx, ly, Zn.gz, id);
        }
      }
    }
  }
  // blok(kasa)lar: plaka üstündekinin üstüne lamba
  for (let c = 0; c < state.crates.length; c++) {
    const cr = state.crates[c];
    put(m, cr[0], 0, cr[1], B.PUSH_BLOCK);
    if (plateIndexAt(L, cr[0], cr[1]) >= 0) put(m, cr[0], 1, cr[1], B.LANTERN);
  }
  return m;
}

/** (x,z) konumundaki plakanın düz indeksi ya da −1. */
function plateIndexAt(L, x, z) {
  for (let q = 0; q < L.zones.length; q++) {
    const pl = L.zones[q].plates;
    for (let j = 0; j < pl.length; j++) if (pl[j].x === x && pl[j].z === z) return L.zones[q].po + j;
  }
  return -1;
}

function plateAt(L, idx) {
  for (let q = 0; q < L.zones.length; q++) {
    const Zn = L.zones[q];
    if (idx >= Zn.po && idx < Zn.po + Zn.plates.length) return { zone: q, plate: Zn.plates[idx - Zn.po] };
  }
  return null;
}

function crateAt(state, x, z) {
  for (let c = 0; c < state.crates.length; c++) {
    if (state.crates[c][0] === x && state.crates[c][1] === z) return c;
  }
  return -1;
}

/** Görünüm imzası: plaka başına 0 (sönük) … 8 (zamanlı) / 1 (diğer). */
function computeVs(state, out) {
  const L = state.L;
  for (let z = 0; z < L.zones.length; z++) {
    const Zn = L.zones[z];
    for (let j = 0; j < Zn.plates.length; j++) {
      const p = Zn.plates[j];
      const i = Zn.po + j;
      const full = p.k === 't' ? 8 : 1;
      let v = 0;
      if (state.zs[z] || crateAt(state, p.x, p.z) >= 0) v = full;
      else if (state.hold[i] > 0) {
        v = p.k === 't' ? Math.max(1, Math.min(8, Math.ceil((8 * state.hold[i]) / Math.max(0.1, L.T)))) : 1;
      }
      out[i] = v;
    }
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Hareket kuralları
 * ---------------------------------------------------------------------------------------------- */
/** Hücre kasa için model olarak boş mu? (duvar/kapı/diğer kasa; dünya engelleri ayrıca denetlenir) */
function modelFree(state, x, z, except) {
  const L = state.L;
  if (x < L.x0 || x > L.x1 || z < 0 || z > L.d - 1) return false;
  for (let q = 0; q < L.zones.length; q++) {
    const Zn = L.zones[q];
    if (Zn.gz === z) return false; // kasalar kapıdan geçmez (bölümler bağımsız)
  }
  for (let c = 0; c < state.crates.length; c++) {
    if (c !== except && state.crates[c][0] === x && state.crates[c][1] === z) return false;
  }
  return true;
}

/** Oyuncunun itme için duracağı hücre (kasanın gerisi) var mı (iyimser: kasalar yok sayılır). */
function standable(state, x, z) {
  const L = state.L;
  if (z === -1) return x >= -1 && x <= 1;
  if (x < L.x0 || x > L.x1 || z < 0 || z > L.d - 1) return false;
  for (let q = 0; q < L.zones.length; q++) {
    if (L.zones[q].gz === z) return state.gate[q] >= 3 && x >= -1 && x <= 1;
  }
  return true;
}

function firstUnsolved(state) {
  for (let z = 0; z < state.zs.length; z++) if (!state.zs[z]) return z;
  return -1;
}

/** Kasa (x,z)'den hedef kümesine iyimser en kısa itme yolu: ilk adım {x,z} ya da null; dist (adım). */
function route(state, sx, sz, except, targets) {
  const L = state.L;
  if (targets.length === 0) return null;
  const W = L.w;
  const D = L.d;
  const key = (x, z) => (z * W) + (x - L.x0);
  const goal = new Set();
  for (let i = 0; i < targets.length; i++) goal.add(key(targets[i][0], targets[i][1]));
  if (goal.has(key(sx, sz))) return { x: 0, z: 0, dist: 0 };
  const prev = new Map();
  prev.set(key(sx, sz), -1);
  const queue = [[sx, sz]];
  for (let qi = 0; qi < queue.length; qi++) {
    const [x, z] = queue[qi];
    for (let k = 0; k < 4; k++) {
      const dx = DIRS[k][0];
      const dz = DIRS[k][1];
      const nx = x + dx;
      const nz = z + dz;
      if (nz < 0 || nz >= D || !modelFree(state, nx, nz, except)) continue;
      if (!standable(state, x - dx, z - dz)) continue;
      const kk = key(nx, nz);
      if (prev.has(kk)) continue;
      prev.set(kk, key(x, z) * 8 + k);
      if (goal.has(kk)) {
        // geri izle → ilk adım
        let cur = kk;
        let dist = 0;
        let first = k;
        while (prev.get(cur) !== -1) {
          const pv = prev.get(cur);
          first = pv % 8;
          cur = Math.floor(pv / 8);
          dist++;
        }
        return { x: DIRS[first][0], z: DIRS[first][1], dist };
      }
      queue.push([nx, nz]);
    }
  }
  return null;
}

/** Boş (kasasız) plakalar: öncelik ağır > hafif > zamanlı; yalnızca çözülmemiş bölümler. */
function freePlateTargets(state, except) {
  const L = state.L;
  const buckets = { a: [], h: [], t: [] };
  for (let z = 0; z < L.zones.length; z++) {
    if (state.zs[z]) continue;
    const pl = L.zones[z].plates;
    for (let j = 0; j < pl.length; j++) {
      const c = crateAt(state, pl[j].x, pl[j].z);
      if (c >= 0 && c !== except) continue;
      buckets[pl[j].k].push([pl[j].x, pl[j].z]);
    }
  }
  if (buckets.a.length) return buckets.a;
  if (buckets.h.length) return buckets.h;
  return buckets.t;
}

/** Bölümün "yaşayan" blok sayısı: en az bir plakaya ulaşabilen kasalar. */
function aliveCrates(state, zone) {
  const pl = state.L.zones[zone].plates;
  const targets = pl.map((p) => [p.x, p.z]);
  let n = 0;
  for (let c = 0; c < state.crates.length; c++) {
    const cr = state.crates[c];
    if (route(state, cr[0], cr[1], c, targets) !== null) n++;
  }
  return n;
}

/** Bölümün kasalarını başlangıç konumlarına döndürür (başka bölümden gelen engelleyici kasalar silinir). */
function respawn(state, zone) {
  const Zn = state.L.zones[zone];
  const keep = [];
  for (let c = 0; c < state.crates.length; c++) if (state.crates[c][2] !== zone) keep.push(state.crates[c]);
  const fresh = Zn.crates.map((p) => [p[0], p[1], zone]);
  const out = [];
  for (let c = 0; c < keep.length; c++) {
    let clash = false;
    for (let f = 0; f < fresh.length; f++) if (keep[c][0] === fresh[f][0] && keep[c][1] === fresh[f][1]) clash = true;
    if (!clash) out.push(keep[c]);
  }
  state.crates = out.concat(fresh);
  for (let j = 0; j < Zn.plates.length; j++) state.hold[Zn.po + j] = 0;
}

/**
 * Kasayı bir adım iter (c: kasa indeksi, dir: yerel {x,z}). Geçerliyse durumu günceller ve true döner.
 * Dünya engeli: hedef hücrede hava/plaka dışı blok (oyuncunun koyduğu) varsa itme olmaz.
 */
function tryPush(ctx, state, c, dir) {
  const cr = state.crates[c];
  const nx = cr[0] + dir.x;
  const nz = cr[1] + dir.z;
  if (!modelFree(state, nx, nz, c)) return false;
  const w = worldCell(ctx, nx, nz);
  const b = ctx.getBlock ? ctx.getBlock(w.x, w.y, w.z) : 0;
  if (b !== null && b !== undefined && b !== 0 && b !== B.PRESSURE_PLATE && b !== B.PRESSURE_PLATE_ON) return false;
  cr[0] = nx;
  cr[1] = nz;
  return true;
}

function worldCell(ctx, lx, lz) {
  return frame(ctx).toWorld(lx, 0, lz);
}

/* ------------------------------------------------------------------------------------------------
 * Ortak güncelleme: eski görünüm → değişiklik → yeni görünüm → efektler
 * ---------------------------------------------------------------------------------------------- */
const SCRATCH = [];

function scratchVs(n) {
  while (SCRATCH.length < n) SCRATCH.push(0);
  return SCRATCH;
}

function plateSoundFx(F, effects, plate) {
  const w = F.toWorld(plate.x, 0, plate.z);
  effects.push(fx.sound('plate', w.x, w.y, w.z));
  const color = plate.k === 'a' ? 0xe0443e : (plate.k === 't' ? 0xe8842a : 0x3d7be0);
  effects.push(fx.particles('magicBurst', w.x, w.y + 1, w.z, color));
}

/**
 * Görünüm imzasını yeniler, bölüm çözümünü/kapı animasyonunu ilerletir ve değişen blokları efekt yapar.
 * pre: değişiklikten ÖNCE alınmış dyn haritası (kasa hareketi gibi doğrudan değişiklikler için); yoksa değişim yokken
 * hiçbir şey üretmez.
 */
function settle(state, dt, effects, F, info, pre) {
  const L = state.L;
  const n = state.vs.length;
  const nv = computeVs(state, scratchVs(n));
  let changed = false;
  for (let i = 0; i < n; i++) if (nv[i] !== state.vs[i]) changed = true;
  let solveZone = -1;
  const z = firstUnsolved(state);
  if (z >= 0) {
    const Zn = L.zones[z];
    let all = true;
    for (let j = 0; j < Zn.plates.length; j++) if (!(nv[Zn.po + j] > 0)) all = false;
    if (all) {
      state.sync[z] += dt;
      if (state.sync[z] >= SYNC_TIME) solveZone = z;
    } else state.sync[z] = 0;
  }
  let gateStep = -1;
  for (let q = 0; q < L.zones.length; q++) {
    if (state.zs[q] && state.gate[q] < 3 && L.zones[q].gz >= 0) {
      state.gt[q] += dt;
      if (state.gt[q] >= GATE_STEP) gateStep = q;
    }
  }
  if (!pre && !changed && solveZone < 0 && gateStep < 0) return;
  const before = pre || dyn(state, info);
  const old = state.vs.slice();
  for (let i = 0; i < n; i++) state.vs[i] = nv[i];
  if (changed) {
    for (let i = 0; i < n; i++) {
      if (old[i] === 0 && state.vs[i] > 0) plateSoundFx(F, effects, plateAt(L, i).plate);
    }
  }
  if (gateStep >= 0) {
    state.gate[gateStep] += 1;
    state.gt[gateStep] = 0;
  }
  let finished = false;
  if (solveZone >= 0) {
    state.zs[solveZone] = 1;
    state.sync[solveZone] = 0;
    computeVs(state, state.vs);
    if (solveZone === L.zones.length - 1) {
      state.done = true;
      finished = true;
    } else {
      const w = F.toWorld(0, 1, L.zones[solveZone].gz);
      effects.push(fx.sound('door', w.x, w.y, w.z));
      effects.push(fx.message('Kapı yükseliyor! Bir sonraki bölüme geç.'));
    }
  }
  dynDiff(F, before, dyn(state, info), effects);
  if (finished) solvedEffects(info, 'Tüm plakalar yandı! Arka kapı açıldı.', effects);
}

/* ------------------------------------------------------------------------------------------------
 * Arayüz
 * ---------------------------------------------------------------------------------------------- */
const TMP = { x: 0, y: 0, z: 0 };
const IDLE = { state: null, effects: EMPTY };

function interact(ctx, state, ev) {
  const t = ev.type;
  if (!Number.isFinite(ev.x) || !Number.isFinite(ev.y) || !Number.isFinite(ev.z) || state.done) {
    return { state, effects: [], handled: false };
  }
  const L = state.L;
  const l = worldToLocal(ctx.origin, ctx.facing, Math.floor(ev.x), Math.floor(ev.y), Math.floor(ev.z), TMP);
  const lx = l.x;
  const ly = l.y;
  const lz = l.z;
  // plakayı tutma (her kare gelir; ucuz yol)
  if (t === 'step' || t === 'entity') {
    for (let q = 0; q < L.zones.length; q++) {
      if (state.zs[q]) continue;
      const Zn = L.zones[q];
      for (let j = 0; j < Zn.plates.length; j++) {
        const p = Zn.plates[j];
        if (p.x !== lx || p.z !== lz || (ly !== 0 && ly !== 1)) continue;
        // ağır plakayı yalnızca yaratık ('entity') tutar; oyuncu adımı sayılmaz
        if (p.k !== 'a' || t === 'entity') {
          const grace = p.k === 't' ? L.T : STEP_GRACE;
          if (state.hold[Zn.po + j] < grace) state.hold[Zn.po + j] = grace;
        }
        return { state, effects: [], handled: false };
      }
    }
  }
  const F = frame(ctx);
  const info = chamberInfo(ctx, L);
  const effects = [];
  if (t === 'blockBroken' || t === 'blockPlaced') {
    const g = guardEffect(F, dyn(state, info), ev);
    if (g) effects.push(g);
    return { state, effects, handled: effects.length > 0 };
  }
  if (t !== 'use' && t !== 'step' && t !== 'push') return { state, effects, handled: false };
  // duvar kolu: bölümün bloklarını yeniden doğur
  if (t === 'use' && ly === 0 && lx === L.x1) {
    for (let q = 0; q < L.zones.length; q++) {
      if (lz !== L.zones[q].zs) continue;
      if (state.zs[q]) {
        effects.push(fx.message('Bu bölüm çözüldü.'));
        return { state, effects, handled: true };
      }
      const pre = dyn(state, info);
      respawn(state, q);
      settle(state, 0, effects, F, info, pre);
      effects.push(fx.sound('lever', ev.x, ev.y, ev.z));
      effects.push(fx.message('Bloklar yeniden yerleştirildi.'));
      return { state, effects, handled: true };
    }
  }
  // kasa itme
  if (ly !== 0 && ly !== 1) return { state, effects, handled: false };
  const c = crateAt(state, lx, lz);
  if (c < 0) return { state, effects, handled: false };
  if (t !== 'use' && state.cool > 0) return { state, effects, handled: true };
  let dir = pushDirection(F, ev, lx, lz);
  if (!dir) {
    if (t !== 'use') return { state, effects, handled: false };
    const r = route(state, lx, lz, c, freePlateTargets(state, c));
    if (r && r.dist === 0) {
      effects.push(fx.message('Bu blok zaten bir plakanın üstünde.'));
      return { state, effects, handled: true };
    }
    if (!r) {
      effects.push(fx.message('Bu blok daha fazla ilerleyemiyor. Duvardaki kolla blokları yenileyebilirsin.'));
      return { state, effects, handled: true };
    }
    dir = { x: r.x, z: r.z };
  }
  const pre = dyn(state, info);
  if (!tryPush(ctx, state, c, dir)) return { state, effects, handled: t === 'use' };
  state.cool = PUSH_COOLDOWN;
  const w = F.toWorld(state.crates[c][0], 0, state.crates[c][1]);
  effects.push(fx.sound('place:taş', w.x, w.y, w.z));
  settle(state, 0, effects, F, info, pre);
  // sıkışma denetimi: yeterli blok kalmadıysa otomatik yeniden doğurma
  const z = firstUnsolved(state);
  if (z >= 0 && aliveCrates(state, z) < L.zones[z].need) {
    const pre2 = dyn(state, info);
    respawn(state, z);
    settle(state, 0, effects, F, info, pre2);
    effects.push(fx.sound('puzzle_wrong', w.x, w.y, w.z));
    effects.push(fx.message('Blok sıkıştı! Bloklar yeniden yerleştirildi.'));
  }
  return { state, effects, handled: true };
}

function tick(ctx, state, dt) {
  if (state.done) {
    IDLE.state = state;
    return IDLE;
  }
  const L = state.L;
  if (state.cool > 0) state.cool = Math.max(0, state.cool - dt);
  for (let i = 0; i < state.hold.length; i++) {
    if (state.hold[i] > 0) state.hold[i] = Math.max(0, state.hold[i] - dt);
  }
  // değişen bir şey var mı? (imza, bölüm sayacı, kapı animasyonu)
  const n = state.vs.length;
  const nv = computeVs(state, scratchVs(n));
  let busy = false;
  for (let i = 0; i < n && !busy; i++) if (nv[i] !== state.vs[i]) busy = true;
  for (let q = 0; q < L.zones.length && !busy; q++) {
    if (state.sync[q] > 0 || (state.zs[q] && state.gate[q] < 3 && L.zones[q].gz >= 0)) busy = true;
  }
  if (!busy) {
    const z = firstUnsolved(state);
    if (z >= 0) {
      const Zn = L.zones[z];
      let all = true;
      for (let j = 0; j < Zn.plates.length; j++) if (!(nv[Zn.po + j] > 0)) all = false;
      busy = all;
    }
  }
  if (!busy) {
    IDLE.state = state;
    return IDLE;
  }
  const effects = [];
  settle(state, dt, effects, frame(ctx), chamberInfo(ctx, L), null);
  return { state, effects };
}

function isSolved(state) {
  return !!(state && state.done);
}

function hint(state) {
  const L = state.L;
  if (state.done) return 'Tüm plakalar yandı, arka kapı açık.';
  const z = firstUnsolved(state);
  const Zn = L.zones[Math.max(0, z)];
  const parts = [];
  const seen = {};
  for (let j = 0; j < Zn.plates.length; j++) {
    const k = Zn.plates[j].k;
    if (seen[k]) continue;
    seen[k] = true;
    if (k === 'h') parts.push('mavi artı plakaya herkes (sen, yaratık, blok) basabilir');
    else if (k === 'a') parts.push('kırmızı çarpı plakaya yalnızca blok ya da yaratık konabilir (sen duramazsın)');
    else parts.push('turuncu halka plaka bastıktan sonra ' + L.T + ' saniye yanık kalır, bir blok koyarsan kalıcı olur');
  }
  const stage = L.zones.length > 1 ? ' (' + (z + 1) + '/' + L.zones.length + '. bölüm)' : '';
  return 'Bölümdeki plakaların hepsi AYNI ANDA yanmalı' + stage + ': ' + parts.join('; ')
    + '. Blokları yürüyerek ya da sağ tıklayarak it; sıkışırsan duvardaki kolu çek.';
}

function footprint(difficulty) {
  const s = sizeOf(clampD(difficulty));
  return { w: s.w, d: s.d, h: s.h, margin: 2 };
}

function build(ctx) {
  const state = generate(ctx);
  const info = shell(ctx, state.L);
  const F = frame(ctx);
  paintMap(F, dyn(state, info));
  const anchors = {
    levers: [], plates: [], crates: [], door: info.doorBack,
  };
  for (let z = 0; z < state.L.zones.length; z++) {
    const Zn = state.L.zones[z];
    anchors.levers.push(F.toWorld(state.L.x1, 0, Zn.zs));
    for (let j = 0; j < Zn.plates.length; j++) anchors.plates.push(F.toWorld(Zn.plates[j].x, 0, Zn.plates[j].z));
  }
  for (let c = 0; c < state.crates.length; c++) anchors.crates.push(F.toWorld(state.crates[c][0], 0, state.crates[c][1]));
  return { state, anchors };
}

function restore(ctx, state) {
  const info = chamberInfo(ctx, state.L);
  const F = frame(ctx);
  clearInterior(F, info);
  paintMap(F, dyn(state, info));
  applyDoor(ctx, info, state.done);
}

const impl = {
  type: TYPE,
  name: 'Basınç Plakası',
  summary: 'Plakaların hepsini aynı anda yak: bloklarla, yaratıkla ya da kendi ağırlığınla; kapılar sırayla açılır.',
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
