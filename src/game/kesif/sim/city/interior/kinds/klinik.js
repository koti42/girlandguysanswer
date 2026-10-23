/*
 * KEŞİF sim/city/interior/kinds — 6 KLİNİK (design_city §7.2 #6: 18×14×4, bsp 5 oda; muayene, robot doktor, bekleme; sahip Dr. Bolt, beyaz/mint, bip).
 * 3 varyant (V = hash % 3), hepsi aydınlık (panel ışık) steril mekân; odalar: bekleme (giriş), muayene/doktor, tarama, arşiv|ilaç deposu:
 *   V0 «Koridor Kliniği»  ön bekleme salonu + orta koridor + iki yan sütunda 4 oda (arşiv serbest)
 *   V1 «BSP Kliniği»      BSP bölünmüş 5 odaya kadar, kapı ağacı; arşiv kapısı `kart` kademe 1 (kart şehirde bir kaynaktan; DAG)
 *   V2 «L Kliniği»        geniş bekleme + sağda ilaç deposu (`kod` kademe 1, ipucu: bekleme odasındaki bilgi terminali) + sol kanatta 2 oda
 * Kule çekirdeği taşarsa arka kırpılır. Oda başına ≤4 ışık.
 */
import { B } from '../../../blocks.js';
import { ID } from '../../cityEmit.js';
import { InteriorBuilder } from '../builder.js';
import { bsp, lshape, roomAt, spanning } from '../kitPlan.js';
import {
  ensure, deferChip, deferPost, deferSignature, capKeys, chairFor, finishInterior, fitAgainst, fitFloor, fitWall, lockOf, mkPal, paintWalls, frameDoors, roomRects, topUp, usableRect, twoPass,
} from '../furnishA.js';

const KIND = 'klinik';
const CORE = ['muayene_yatagi', 'robot_doktor_istasyonu', 'tarayici_cihaz', 'kasa_masasi', 'bekleme_sirasi', 'bilgi_terminali', 'saglik_dolabi', 'kod_notu'];
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const PALS = [
  mkPal('mint', {
    floor: ID.WHITE, floor2: ID.POLISHED, wall: ID.FACADE_LIGHT, wall2: ID.GREEN, ceil: ID.WHITE, trim: ID.NEON_CYAN, glow: ID.NEON_CYAN, glow2: ID.NEON_LIME, cloth: B.CLOTH_GREEN, cloth2: B.CLOTH_WHITE,
  }),
  mkPal('beyaz', {
    floor: ID.POLISHED, floor2: ID.WHITE, wall: B.CALCITE, wall2: ID.BLUE, ceil: ID.WHITE, trim: ID.BLUE, glow: ID.NEON_CYAN, glow2: ID.NEON_LIME, cloth: B.CLOTH_BLUE, cloth2: B.CLOTH_WHITE,
  }),
  mkPal('mint', {
    floor: ID.WHITE, floor2: ID.FACADE_LIGHT, wall: ID.FACADE_LIGHT, wall2: ID.GREEN, ceil: ID.WHITE, trim: ID.NEON_LIME, glow: ID.NEON_LIME, glow2: ID.NEON_CYAN, cloth: B.CLOTH_GREEN, cloth2: B.CLOTH_YELLOW,
  }),
];
const DECOR = ['saksi_buyuk', 'mini_robot', 'sandalye', 'dolap', 'bilgi_terminali', 'saglik_dolabi'];
const WALLDECOR = ['cerceve', 'holo_ekran', 'televizyon'];
const MOODS = [{ hue: 'mint', light: 14 }, { hue: 'beyaz', light: 13 }, { hue: 'mint', light: 14 }];

function footprint() {
  return { w: 18, d: 14, h: 4 };
}

/* ------------------------------------------------------------------------------------------------ oda donatımı */
function furnishWait(b, rng, room, hasDeskClue) {
  const desk = fitAgainst(b, rng, room, 'kasa_masasi', { sides: [0, 3, 1], step: 1 });
  if (desk) chairFor(b, desk, 'sandalye');
  for (let i = 0; i < 3; i++) fitAgainst(b, rng, room, 'bekleme_sirasi', { sides: [3, 1, 0, 2], step: 1 });
  fitAgainst(b, rng, room, 'bilgi_terminali', { sides: [0, 1, 3] });
  fitAgainst(b, rng, room, 'saksi_buyuk', { sides: [0, 1, 3, 2] });
  fitAgainst(b, rng, room, 'saksi_buyuk', { sides: [0, 1, 3, 2] });
  fitAgainst(b, rng, room, 'akvaryum', { sides: [0, 3, 1] });
  fitFloor(b, rng, room, 'hali', { ly: 0, variant: 1 });
  fitFloor(b, rng, room, 'mini_robot');
  fitWall(b, rng, room, 'holo_ekran', { y: 1.4, sides: [0, 3, 1] });
  fitWall(b, rng, room, 'televizyon', { y: 1.5, sides: [0, 3, 1] });
  fitWall(b, rng, room, 'cerceve', { y: 1.5 });
  fitWall(b, rng, room, 'cerceve', { y: 1.4, variant: 3 });
  void hasDeskClue;
}

function furnishExam(b, rng, room, doctor) {
  fitAgainst(b, rng, room, 'muayene_yatagi', { sides: [3, 1, 0] });
  const desk = fitAgainst(b, rng, room, 'calisma_masasi', { sides: [0, 1, 3] });
  if (desk) chairFor(b, desk, 'sandalye');
  let dr = null;
  if (doctor) dr = fitAgainst(b, rng, room, 'robot_doktor_istasyonu', { sides: [0, 1, 3, 2] });
  fitAgainst(b, rng, room, 'saglik_dolabi', { sides: [0, 1, 3, 2] });
  fitFloor(b, rng, room, 'mini_robot');
  fitWall(b, rng, room, 'holo_ekran', { y: 1.4 });
  fitWall(b, rng, room, 'cerceve', { y: 1.5 });
  fitAgainst(b, rng, room, 'saksi_buyuk', { sides: [0, 1, 3, 2] });
  return dr;
}

function furnishScan(b, rng, room) {
  const sc = fitAgainst(b, rng, room, 'tarayici_cihaz', { sides: [0, 1, 3] });
  fitAgainst(b, rng, room, 'bilgi_terminali', { sides: [0, 1, 3, 2] });
  fitAgainst(b, rng, room, 'muayene_yatagi', { sides: [3, 1, 0] });
  fitAgainst(b, rng, room, 'dolap', { sides: [0, 1, 3, 2] });
  const ch = fitFloor(b, rng, room, 'sandalye');
  fitWall(b, rng, room, 'holo_ekran', { y: 1.4 });
  fitWall(b, rng, room, 'cerceve', { y: 1.5 });
  void sc;
  void ch;
}

function furnishStore(b, rng, room) {
  for (let i = 0; i < 2; i++) fitAgainst(b, rng, room, 'dolap', { sides: [0, 1, 3, 2] });
  for (let i = 0; i < 2; i++) fitAgainst(b, rng, room, 'saglik_dolabi', { sides: [0, 1, 3, 2] });
  fitAgainst(b, rng, room, 'bilgi_terminali', { sides: [0, 1, 3] });
  fitFloor(b, rng, room, 'sandalye');
  fitWall(b, rng, room, 'cerceve', { y: 1.5 });
  fitWall(b, rng, room, 'holo_ekran', { y: 1.4 });
}

function lightRoom(b, room, n) {
  const w = room.u1 - room.u0;
  const d = room.v1 - room.v0;
  const spots = n <= 1 ? [[0.5, 0.5]] : n === 2 ? (w >= d ? [[0.28, 0.5], [0.72, 0.5]] : [[0.5, 0.28], [0.5, 0.72]]) : [[0.25, 0.3], [0.75, 0.3], [0.5, 0.78]];
  for (let i = 0; i < spots.length; i++) {
    const u = room.u0 + Math.min(w - 1, Math.floor(w * spots[i][0]));
    const v = room.v0 + Math.min(d - 1, Math.floor(d * spots[i][1]));
    b.light(room.id, u, v, 'panel');
  }
}

function finishCommon(b, f, rng, rooms, o) {
  rooms.forEach((r) => lightRoom(b, r, (r.u1 - r.u0) * (r.v1 - r.v0) > 40 ? 3 : (r.u1 - r.u0) * (r.v1 - r.v0) > 18 ? 2 : 1));
  const chipRoom = o.chipRoom;
  deferChip(b, chipRoom, [chipRoom.u1 - 1, chipRoom.v1 - 1], 0);
  void f;
  void rng;
}

/* ------------------------------------------------------------------------------------------------ V0 */
function planV0(b, rng, f, R, lot) {
  const W = R[2];
  const D = R[3];
  const du = f.door.u;
  const fh = clamp(Math.round(D * 0.36), 4, 6);
  const hall = b.room('bekleme', [0, 0, W, fh], { role: 'bekleme' });
  const cw = 3;
  const cu0 = clamp(du - 1, 5, W - 8);
  const cu1 = cu0 + cw;
  const kor = b.room('koridor', [cu0, fh + 1, cu1, D], { role: 'koridor' });
  b.door('d0', 'bekleme', 'koridor', {
    axis: 'u', line: fh, c: cu0 + 1, w: 3, kind: 'arch',
  });
  const band = D - (fh + 1);
  const two = band >= 8;
  const h1 = two ? Math.ceil((band - 1) / 2) : band;
  const ids = {
    L1: 'muayene1', L2: 'tarama', R1: 'muayene2', R2: 'arsiv',
  };
  const mk = (id, u0, v0, u1, v1, role) => b.room(id, [u0, v0, u1, v1], { role });
  const lw = cu0 - 1;
  const rw0 = cu1 + 1;
  const rooms2 = [];
  rooms2.push(mk(ids.L1, 0, fh + 1, lw, fh + 1 + h1, 'muayene'));
  if (two) rooms2.push(mk(ids.L2, 0, fh + 1 + h1 + 1, lw, D, 'tarama'));
  rooms2.push(mk(ids.R1, rw0, fh + 1, W, fh + 1 + h1, 'muayene'));
  const r1 = b.rooms[b.rooms.length - 1];
  let r2 = null;
  if (two) r2 = mk(ids.R2, rw0, r1.v1 + 1, W, D, 'arsiv');
  if (r2) rooms2.push(r2);
  const rowC = (r) => Math.floor((r.v0 + r.v1) / 2);
  b.door('d1', 'koridor', ids.L1, {
    axis: 'v', line: lw, c: rowC(rooms2[0]), w: 1, kind: 'door',
  });
  if (two) {
    b.door('d2', 'koridor', ids.L2, {
      axis: 'v', line: lw, c: rowC(rooms2[1]), w: 1, kind: 'door',
    });
  }
  b.door('d3', 'koridor', ids.R1, {
    axis: 'v', line: cu1, c: rowC(r1), w: 1, kind: 'door',
  });
  if (r2) {
    b.door('d4', 'koridor', ids.R2, {
      axis: 'v', line: cu1, c: rowC(r2), w: 1, kind: 'door',
    });
  }
  furnishWait(b, rng, hall);
  const dr = furnishExam(b, rng, rooms2[0], true);
  if (two) furnishScan(b, rng, rooms2[1]);
  furnishExam(b, rng, r1, false);
  if (r2) furnishStore(b, rng, r2);
  // koridor: duvar ekranları
  fitWall(b, rng, kor, 'holo_ekran', { y: 1.4, sides: [0] });
  fitWall(b, rng, kor, 'cerceve', { y: 1.5, sides: [1, 3] });
  fitFloor(b, rng, kor, 'mini_robot');
  const all = [hall, kor].concat(rooms2);
  finishCommon(b, f, rng, all, { chipRoom: r2 || r1 });
  deferSignature(b, ['calisma_masasi'], rooms2[0], dr && dr._l ? [dr._l.u, dr._l.v] : null);
  const dpost = deferPost(b, rooms2[0], dr && dr._l ? [dr._l.u, dr._l.v - 1] : [rooms2[0].u0, rooms2[0].v0], 2);
  b.accent(0, 0, 1, fh, f.H - 1, f.H, ID.NEON_CYAN);
  b.accent(W - 1, 0, W, fh, f.H - 1, f.H, ID.NEON_CYAN);
  return {
    mood: MOODS[0],
    layout: { v: 0, W, D, fh, cross: cu0 >= 4 ? [Math.max(1, Math.floor((cu0 - 1) / 2)), fh] : null, rooms: roomRects(b) },
    ownerPost: dpost,
    locks: [],
    lot,
  };
}

/* ------------------------------------------------------------------------------------------------ V1 */
function obstacleRects(frame, pad) {
  return frame.obstacles.map((o) => ({ u0: o.u0 - pad, v0: o.v0 - pad, u1: o.u1 + pad, v1: o.v1 + pad }));
}

function planV1(b, rng, f, R, lot) {
  const W = R[2];
  const D = R[3];
  const du = f.door.u;
  const noWall = [{ u0: du - 2, v0: 0, u1: du + 3, v1: 3 }];
  const P = bsp([0, 0, W, D], rng, { minU: 5, minV: 4, maxRooms: 5, noWall });
  const entry = roomAt(P.rooms, du, 0);
  const avoid = obstacleRects(f, 0);
  const edges = spanning(P.rooms, P.adj, entry.id, rng, { w: 3, avoid, extra: 0 });
  const connected = new Set([entry.id]);
  const parentOf = {};
  const kids = {};
  edges.forEach((e) => { connected.add(e.b); parentOf[e.b] = e; kids[e.a] = (kids[e.a] || 0) + 1; });
  const area = (r) => (r.u1 - r.u0) * (r.v1 - r.v0);
  const rest = P.rooms.filter((r) => connected.has(r.id) && r.id !== entry.id);
  const leaves = rest.filter((r) => !kids[r.id]).sort((x, y) => area(x) - area(y) || (x.id < y.id ? -1 : 1));
  const arch = rest.length >= 3 && leaves.length ? leaves[0] : null;
  const gate = arch && leaves.length >= 2 ? leaves[1] : null; // tier-0 kod kilidi (Kart-1 verir) → arşivin kart kilidi içeriden beslenir (DAG)
  const roleOf = {};
  roleOf[entry.id] = ['bekleme', 'bekleme'];
  if (arch) roleOf[arch.id] = ['arsiv', 'arsiv'];
  const names = [['muayene1', 'muayene'], ['tarama', 'tarama'], ['muayene2', 'muayene']];
  rest.filter((r) => r !== arch).sort((x, y) => area(y) - area(x) || (x.id < y.id ? -1 : 1)).forEach((r, i) => {
    roleOf[r.id] = i < names.length ? names[i] : ['muayene' + (i + 1), 'muayene'];
  });
  const idOf = {};
  const made = [];
  P.rooms.forEach((r) => {
    if (!connected.has(r.id)) return;
    const [id, role] = roleOf[r.id];
    idOf[r.id] = id;
    made.push(b.room(id, [r.u0, r.v0, r.u1, r.v1], { role }));
  });
  const archive = arch ? made.find((r) => r.role === 'arsiv') : null;
  const locks = [];
  const gateLock = gate ? lockOf(lot.id, 0, 'kod', 0, { code: [1 + rng.i(6), 1 + rng.i(6), 1 + rng.i(6)], digits: 3 }) : null;
  const archLock = gate ? lockOf(lot.id, 1, 'kart', 1, { card: 1 }) : null;
  let gateDoor = null;
  edges.forEach((e, i) => {
    const toArchive = gate && arch && e.b === arch.id;
    const toGate = gate && e.b === gate.id;
    const wide = e.w === 3 && e.a === entry.id && !toArchive && !toGate;
    const spec = {
      axis: e.adj.axis, line: e.adj.line, c: e.c, w: wide ? 3 : 1, kind: wide ? 'arch' : 'door',
    };
    if (toArchive) spec.lock = archLock;
    if (toGate) spec.lock = gateLock;
    const d = b.door('d' + i, idOf[e.a], idOf[e.b], spec);
    if (toArchive) {
      b.lockPad(d, 'a', 'kart');
      locks.push(Object.assign({}, archLock, { door: d.id, clue: { type: 'lock', source: gateLock.id, card: 1 } }));
    }
    if (toGate) {
      b.lockPad(d, 'a', 'kod');
      gateDoor = d.id;
    }
  });
  const byId = {};
  made.forEach((r) => { byId[r.id] = r; });
  let dr = null;
  made.forEach((r) => {
    if (r.role === 'bekleme') furnishWait(b, rng, r);
    else if (r.role === 'muayene') {
      const d0 = furnishExam(b, rng, r, r.id === 'muayene1');
      if (d0) dr = d0;
    } else if (r.role === 'tarama') furnishScan(b, rng, r);
    else furnishStore(b, rng, r);
  });
  if (gate) {
    const entryRoom = byId[idOf[entry.id]];
    const open = [entryRoom].concat(made.filter((r) => r !== entryRoom && r.id !== idOf[gate.id] && r.id !== idOf[arch.id]));
    let note = null;
    let noteRoom = entryRoom;
    open.forEach((r) => { if (!note) { note = fitWall(b, rng, r, 'kod_notu', { y: 1.3 }); noteRoom = r; } });
    locks.unshift(Object.assign({}, gateLock, { door: gateDoor, clue: { type: 'prop', key: 'kod_notu', room: noteRoom.id, slot: note ? note.slot : -1 } }));
  }
  finishCommon(b, f, rng, made, { chipRoom: archive || made[made.length - 1] });
  const dRoom = byId.muayene1 || made[0];
  deferSignature(b, ['calisma_masasi'], dRoom, dr && dr._l ? [dr._l.u, dr._l.v] : null);
  const dpost = deferPost(b, dRoom, dr && dr._l ? [dr._l.u, dr._l.v - 1] : [dRoom.u0, dRoom.v0], 2);
  b.accent(0, 0, 1, Math.min(3, D), f.H - 1, f.H, ID.NEON_CYAN);
  return {
    mood: MOODS[1],
    layout: { v: 1, W, D, rooms: roomRects(b) },
    ownerPost: dpost,
    locks,
  };
}

/* ------------------------------------------------------------------------------------------------ V2 */
function planV2(b, rng, f, R, lot) {
  const W = R[2];
  const D = R[3];
  const du = f.door.u;
  const mir = du >= W / 2; // ilaç deposu kapıdan uzak yanda
  const M = (u0, u1) => (mir ? [W - u1, W - u0] : [u0, u1]);
  const L = lshape(W, D, rng, { flip: mir, minArm: 4 });
  const on = L.rooms[0];
  const yan = L.rooms[1];
  const iw = 5;
  const bu = M(0, W - iw - 1);
  const iu = M(W - iw, W);
  const wait = b.room('bekleme', [bu[0], 0, bu[1], on.v1], { role: 'bekleme' });
  const ilac = b.room('ilac', [iu[0], 0, iu[1], on.v1], { role: 'arsiv' });
  const h = yan.v1 - yan.v0;
  const wing = [];
  if (h >= 8) {
    const h1 = Math.ceil((h - 1) / 2);
    wing.push(b.room('muayene1', [yan.u0, yan.v0, yan.u1, yan.v0 + h1], { role: 'muayene' }));
    wing.push(b.room('tarama', [yan.u0, yan.v0 + h1 + 1, yan.u1, yan.v1], { role: 'tarama' }));
  } else {
    wing.push(b.room('muayene1', [yan.u0, yan.v0, yan.u1, yan.v1], { role: 'muayene' }));
  }
  const lock = lockOf(lot.id, 0, 'kod', 1, { code: [1 + rng.i(6), 1 + rng.i(6), 1 + rng.i(6), 1 + rng.i(6)], digits: 4 });
  const dI = b.door('dilac', 'bekleme', 'ilac', {
    axis: 'v', line: mir ? iw : W - iw - 1, c: clamp(Math.floor(on.v1 / 2), 1, on.v1 - 2), w: 1, kind: 'door', lock,
  });
  b.lockPad(dI, 'a', 'kod');
  const lo = Math.max(bu[0], yan.u0) + 1;
  const hi = Math.min(bu[1], yan.u1) - 2;
  const mid = Math.floor((Math.max(bu[0], yan.u0) + Math.min(bu[1], yan.u1)) / 2);
  const c1 = hi < lo ? lo : clamp(mid, lo, hi);
  b.door('dk1', 'bekleme', 'muayene1', {
    axis: 'u', line: on.v1, c: c1, w: 1, kind: 'door',
  });
  const cxs = [c1 - 4, c1 + 4].filter((x) => x >= bu[0] + 1 && x <= bu[1] - 2);
  if (wing.length > 1) {
    b.door('dk2', 'muayene1', 'tarama', {
      axis: 'u', line: wing[0].v1, c: clamp(Math.floor((yan.u0 + yan.u1) / 2), yan.u0 + 1, yan.u1 - 2), w: 1, kind: 'door',
    });
  }
  furnishWait(b, rng, wait);
  let note = null;
  let noteRoom = wait;
  [wait].concat(wing).forEach((r) => { if (!note) { note = fitWall(b, rng, r, 'kod_notu', { y: 1.3 }); noteRoom = r; } });
  furnishStore(b, rng, ilac);
  const dr = furnishExam(b, rng, wing[0], true);
  if (wing.length > 1) furnishScan(b, rng, wing[1]);
  const all = [wait, ilac].concat(wing);
  finishCommon(b, f, rng, all, { chipRoom: ilac });
  deferSignature(b, ['calisma_masasi'], wing[0], dr && dr._l ? [dr._l.u, dr._l.v] : null);
  const dpost = deferPost(b, wing[0], dr && dr._l ? [dr._l.u, dr._l.v - 1] : [wing[0].u0, wing[0].v0], 2);
  b.accent(0, 0, W, 1, f.H - 1, f.H, ID.NEON_LIME);
  return {
    mood: MOODS[2],
    layout: { v: 2, W, D, cross: cxs.length ? [cxs[0], on.v1] : null, rooms: roomRects(b) },
    ownerPost: dpost,
    locks: [Object.assign({}, lock, { door: 'dilac', clue: { type: 'prop', key: 'kod_notu', room: noteRoom.id, slot: note ? note.slot : -1 } })],
  };
}

const PLANS = [planV0, planV1, planV2];

function build(ctx, lot, rng, variant, guard) {
  const gctx = guard ? ctx : Object.assign({}, ctx, { guard: false });
  const b = new InteriorBuilder(gctx);
  capKeys(b, 10, 38, CORE);
  const f = ctx.frame;
  const R = usableRect(f);
  const res = PLANS[variant % 3](b, rng, f, R, lot);
  delete res.lot;
  const ex = b.rooms.filter((r) => r.role === 'muayene');
  const sc = b.rooms.filter((r) => r.role === 'tarama');
  ensure(b, rng, 'muayene_yatagi', ex.concat(sc, b.rooms));
  ensure(b, rng, 'robot_doktor_istasyonu', ex.concat(sc, b.rooms));
  ensure(b, rng, 'tarayici_cihaz', sc.concat(ex, b.rooms));
  ensure(b, rng, 'kasa_masasi', b.rooms.filter((r) => r.role === 'bekleme').concat(b.rooms));
  topUp(b, rng, b.rooms.filter((r) => r.role !== 'arsiv'), DECOR, 22, WALLDECOR);
  return finishInterior(b, Object.assign(res, { core: CORE, vendorKeys: ['kasa_masasi'] }));
}

function plan(lot, rng, variant, ctx) {
  return twoPass(ctx, rng, (r, g) => build(ctx, lot, r, variant, g));
}

function emit(W, interior, ctx) {
  const { kit, pal, frame: f } = ctx;
  const L = interior.layout;
  if (!L) return;
  const rs = L.rooms;
  const H = f.H;
  paintWalls(kit, interior, (u, v, y, h) => {
    if (y === 0) return pal.wall2;
    if (y === h - 1) return pal.wall2;
    return undefined;
  });
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i];
    const id = r[6];
    if (id === 'bekleme') kit.floor(r[0], r[1], r[2], r[3], (u, v) => (((u >> 1) + (v >> 1)) & 1 ? pal.floor : pal.floor2));
    else if (id === 'koridor') kit.floor(r[0], r[1], r[2], r[3], (u) => (u === r[0] + 1 ? pal.cloth : pal.floor2));
    else if (id === 'arsiv' || id === 'ilac') kit.floor(r[0], r[1], r[2], r[3], pal.cloth2);
    else if (id === 'tarama') kit.floor(r[0], r[1], r[2], r[3], (u, v) => (((u + v) & 1) ? pal.cloth : pal.floor2));
    else kit.floor(r[0], r[1], r[2], r[3], pal.floor2);
  }
  // koridor/bekleme arası cam pencereler (bölme duvarında)
  if (L.v === 0) {
    const hall = rs.find((r) => r[6] === 'bekleme');
    const y = hall[3];
    for (let u = 1; u < L.W - 1; u += 4) if (u < rs.find((r) => r[6] === 'koridor')[0] - 1 || u > rs.find((r) => r[6] === 'koridor')[2]) kit.window(u, y, u + 2, y + 1, 1, 3, pal.glass);
  }
  // yeşil tıbbi artı işareti (beyaz duvarda 5 blok)
  if (L.cross && H >= 4) {
    const cx = L.cross[0];
    const cv = L.cross[1];
    kit.box(cx, cv, cx + 1, cv + 1, 1, 4, ID.GREEN);
    kit.box(cx - 1, cv, cx + 2, cv + 1, 2, 3, ID.GREEN);
  }
  frameDoors(kit, interior, pal, { archFrame: pal.wall2, frame: pal.wall2 });
}

export default {
  kind: KIND,
  name: 'Klinik',
  footprint,
  palette: (it) => PALS[(it.variant | 0) % 3],
  autoDoors: false,
  plan,
  emit,
};
