/*
 * KEŞİF sim/city/interior/kinds — 2 LOFT (design_city §7.2 #2: 16×12×5, açık+bölge, asma kat; kanepe, dev holo ekran, bitki; sahip Kerem, camgöbeği, şehir uğultusu).
 * 3 varyant (V = hash % 3):
 *   V0 «Asma Kat»        kitPlan.loft: tam yükseklik oturma salonu + arka alt bölüm (mutfak/çalışma) + üstte asma yatak katı (merdiven, cam bölme); camgöbeği-beyaz
 *   V1 «Panorama»        tek yükseklikte geniş salon + arka yatak ve çalışma odaları (kemerli); sıcak ahşap-tuğla endüstriyel
 *   V2 «Sanatçı Lofti»   yarım asma kat: sol arka alt bölüm + üstte asma, sağ arkada tam yükseklik atölye (cam duvar), renkli
 * Dar/kısa ayak izlerinde (kule çekirdeği kırpması) güvenli «düz» plana düşer. Alçak (asma altı) odalarda yalnız ≤2 yüksek proplar ve panel ışık.
 */
import { B } from '../../../blocks.js';
import { ID } from '../../cityEmit.js';
import { InteriorBuilder } from '../builder.js';
import { loft } from '../kitPlan.js';
import {
  ensure, deferChip, deferPost, deferSignature, capKeys, chairFor, finishInterior, fitAgainst, fitFloor, fitWall, mkPal, paintWalls, putTry, frameDoors, roomRects, topUp, usableRect, wallAt, twoPass,
} from '../furnishA.js';

const KIND = 'loft';
const CORE = ['kanepe', 'dev_holo_ekran', 'yatak', 'mutfak_tezgahi', 'masa', 'sandalye', 'buzdolabi'];
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const PALS = [
  mkPal('camgobegi', {
    floor: ID.POLISHED, floor2: ID.WHITE, wall: ID.WHITE, wall2: ID.FACADE_LIGHT, ceil: ID.WHITE, trim: ID.NEON_CYAN, glow: ID.NEON_CYAN, glow2: ID.NEON_PINK, cloth: B.CLOTH_BLUE, cloth2: B.CLOTH_WHITE,
  }),
  mkPal('sicak', {
    floor: B.PLANKS_OAK, floor2: B.PLANKS_BIRCH, wall: ID.BRICK, wall2: B.PLANKS_ACACIA, ceil: ID.FACADE_DARK, trim: ID.NEON_AMBER, glow: ID.NEON_AMBER, glow2: ID.NEON_CYAN, cloth: B.CLOTH_ORANGE, cloth2: B.CLOTH_RED,
  }),
  mkPal('renkli', {
    floor: ID.WHITE, floor2: ID.POLISHED, wall: ID.WHITE, wall2: ID.PURPLE, ceil: ID.WHITE, trim: ID.NEON_PINK, glow: ID.NEON_PINK, glow2: ID.NEON_LIME, cloth: B.CLOTH_YELLOW, cloth2: B.CLOTH_PURPLE,
  }),
];
const DECOR = ['saksi_buyuk', 'puf', 'ayakli_lamba', 'heykel', 'masa', 'koltuk'];
const WALLDECOR = ['cerceve', 'tuval', 'kod_notu'];
const MOODS = [{ hue: 'camgobegi', light: 11 }, { hue: 'sicak', light: 12 }, { hue: 'renkli', light: 12 }];
const LOW_OK = ['masa', 'alcak_masa', 'calisma_masasi', 'kanepe', 'koltuk', 'puf', 'buzdolabi', 'dolap', 'raf_unitesi', 'saksi_buyuk', 'tabure', 'mutfak_tezgahi', 'yatak'];

function footprint() {
  return { w: 16, d: 12, h: 5 };
}

/** Kısa (≤2 yüksek) odada üst sınırı aşmayacak prop anahtarı mı. */
function lowOk(key) {
  return LOW_OK.indexOf(key) >= 0;
}

/* ------------------------------------------------------------------------------------------------ oturma/yemek takımları */
function livingSet(b, rng, room, sideWall) {
  // dev ekran bir yan duvarda, kanepe ona bakar, alçak masa ve puflar ortada
  const vm = (room.v0 + room.v1) / 2;
  const left = sideWall === 3;
  wallAt(b, 'dev_holo_ekran', room, sideWall, vm, { y: 1.2 });
  const su = left ? room.u0 + 3.7 : room.u1 - 3.7;
  const ly = left ? 3 : 1;
  const sofa = putTry(b, 'kanepe', [[su, vm], [su + (left ? 0.3 : -0.3), vm]], ly);
  const cu = left ? room.u0 + 2.1 : room.u1 - 2.1;
  putTry(b, 'alcak_masa', [[cu, vm], [cu + (left ? 0.2 : -0.2), vm]], left ? 1 : 3);
  putTry(b, 'puf', [[cu, vm - 1.7], [cu, vm - 1.2]], left ? 1 : 3);
  putTry(b, 'puf', [[cu, vm + 1.7], [cu, vm + 1.2]], left ? 1 : 3);
  putTry(b, 'hali', [[cu, vm]], 0, { variant: 2 });
  void sofa;
}

function kitchenSet(b, rng, room, wall) {
  fitAgainst(b, rng, room, 'mutfak_tezgahi', { sides: [wall] });
  fitAgainst(b, rng, room, 'mutfak_tezgahi', { sides: [wall] });
  fitAgainst(b, rng, room, 'buzdolabi', { sides: [wall] });
  const t = fitAgainst(b, rng, room, 'masa', { sides: [wall === 1 ? 0 : 0, 2, 1] });
  if (t) {
    chairFor(b, t, 'sandalye', { side: -0.5 });
    chairFor(b, t, 'sandalye', { side: 0.5 });
  }
}

function plantsArt(b, rng, room, n) {
  for (let i = 0; i < n; i++) {
    fitAgainst(b, rng, room, 'saksi_buyuk', { sides: [0, 1, 3, 2] });
    fitWall(b, rng, room, 'tuval', { y: 1.5 + (i & 1) * 0.5, variant: (i * 3) & 7 });
  }
}

function lightRoomWide(b, room, n, type) {
  const w = room.u1 - room.u0;
  const d = room.v1 - room.v0;
  const pts = n === 1 ? [[0.5, 0.5]] : n === 2 ? [[0.25, 0.5], [0.75, 0.5]] : n === 3 ? [[0.2, 0.4], [0.8, 0.4], [0.5, 0.8]] : [[0.2, 0.3], [0.8, 0.3], [0.2, 0.8], [0.8, 0.8]];
  for (let i = 0; i < pts.length; i++) {
    b.light(room.id, room.u0 + Math.min(w - 1, Math.floor(w * pts[i][0])), room.v0 + Math.min(d - 1, Math.floor(d * pts[i][1])), Array.isArray(type) ? type[i % type.length] : type);
  }
}

/* ------------------------------------------------------------------------------------------------ düz yedek plan (kısa alan) */
function planFlat(b, rng, f, R, V) {
  const W = R[2];
  const D = R[3];
  const vs = Math.max(3, D - 4);
  const sal = b.room('on', [0, 0, W, vs], { role: 'on' });
  const yat = b.room('arka', [0, vs + 1, W, D], { role: 'arka' });
  b.door('d0', 'on', 'arka', {
    axis: 'u', line: vs, c: clamp(f.door.u, 2, W - 3), w: 3, kind: 'arch',
  });
  livingSet(b, rng, sal, f.door.u >= W / 2 ? 3 : 1);
  kitchenSet(b, rng, sal, f.door.u >= W / 2 ? 1 : 3);
  fitAgainst(b, rng, yat, 'yatak', { sides: [0, 3, 1] });
  fitAgainst(b, rng, yat, 'dolap', { sides: [0, 3, 1] });
  fitAgainst(b, rng, yat, 'raf_unitesi', { sides: [0, 3, 1] });
  plantsArt(b, rng, sal, 2);
  fitWall(b, rng, yat, 'cerceve', { y: 1.5 });
  lightRoomWide(b, sal, 3, ['neon_cyan', 'lantern', 'neon_cyan']);
  lightRoomWide(b, yat, 1, 'lantern');
  b.accent(0, 0, W, 1, f.H - 1, f.H, ID.NEON_CYAN);
  deferChip(b, yat, [W - 1, D - 1], 0);
  deferSignature(b, ['alcak_masa', 'masa'], sal, [Math.min(W - 1, f.door.u + 3), 2]);
  return {
    mood: MOODS[V], layout: { v: V, flat: true, W, D, rooms: roomRects(b) }, ownerPost: deferPost(b, sal, [f.door.u, 2], 0),
  };
}

/* ------------------------------------------------------------------------------------------------ V0 / V2 ortak: asma plan */
function stairLeft(W, D1, m, left, u0, span) {
  const rise = m + 1;
  const run = rise * 2;
  const u = left ? u0 + 1 : u0 + span - 2;
  const du = left ? 1 : -1;
  const v = D1 + 2;
  const lastU = u + du * (run - 1);
  return {
    stair: {
      u, v, dir: left ? 1 : 3, rise, width: 2, y0: 0, hole: m,
    },
    spec: {
      kind: 'stair', from: [u - du, v], to: [lastU + du, v], rect: [Math.min(u, lastU), v, Math.max(u, lastU) + 1, v + 2],
    },
  };
}

function planMezz(b, rng, f, R, V, geom) {
  const W = R[2];
  const D = R[3];
  const du = f.door.u;
  const m = 2;
  let P = null;
  let D1;
  let wm = W;
  let stair;
  let spec;
  let rooms;
  if (geom === 0) {
    P = loft(W, D, f.H, rng, { doorU: du });
    if (!P) return null;
    D1 = P.D1;
    stair = P.stair;
    spec = P.spec;
    rooms = P.rooms;
  } else {
    // V2: sol arka alt + asma, sağ arka tam yükseklik atölye
    if (W < 14 || D < 9 || f.H < 5) return null;
    D1 = Math.max(4, Math.min(D - 5, Math.round(D * 0.42)));
    wm = Math.max(9, Math.min(W - 7, Math.round(W * 0.58)));
    const left = rng.chance(0.5);
    const S = stairLeft(W, D1, m, true, 0, wm);
    stair = S.stair;
    spec = S.spec;
    void left;
    rooms = [
      { id: 'on', u0: 0, v0: 0, u1: W, v1: D1, y0: 0, y1: f.H, role: 'on' },
      { id: 'arka', u0: 0, v0: D1 + 1, u1: wm, v1: D, y0: 0, y1: m, role: 'arka' },
      { id: 'asma', u0: 0, v0: D1 + 1, u1: wm, v1: D, y0: m + 1, y1: f.H, role: 'asma' },
      { id: 'atolye', u0: wm + 1, v0: D1 + 1, u1: W, v1: D, y0: 0, y1: f.H, role: 'atolye' },
    ];
  }
  rooms.forEach((r) => b.room(r.id, [r.u0, r.v0, r.u1, r.v1], { y0: r.y0, y1: r.y1, role: r.role }));
  const on = b.rooms.find((r) => r.id === 'on');
  const arka = b.rooms.find((r) => r.id === 'arka');
  const asma = b.rooms.find((r) => r.id === 'asma');
  const atolye = b.rooms.find((r) => r.id === 'atolye');
  const c0 = geom === 0 ? P.door.c : clamp(Math.min(du, wm - 3), 2, wm - 3);
  b.door('d0', 'on', 'arka', {
    axis: 'u', line: D1, c: c0, w: 3, h: m, kind: 'arch',
  });
  b.vertical('m1', 'arka', 'asma', spec);
  if (atolye) {
    b.door('d1', 'on', 'atolye', {
      axis: 'u', line: D1, c: clamp(Math.floor((atolye.u0 + atolye.u1) / 2), atolye.u0 + 1, atolye.u1 - 2), w: 3, kind: 'arch', h: 3,
    });
  }
  // --- ön salon (tam yükseklik)
  livingSet(b, rng, on, du >= W / 2 ? 3 : 1);
  kitchenSet(b, rng, on, du >= W / 2 ? 1 : 3);
  plantsArt(b, rng, on, V === 2 ? 3 : 2);
  if (V === 2) { fitAgainst(b, rng, on, 'heykel', { sides: [0, 1, 3] }); fitFloor(b, rng, on, 'kitap_yigini'); }
  fitWall(b, rng, on, 'bitki_duvar', { y: 1.0 });
  fitWall(b, rng, on, 'cerceve', { y: 1.8, variant: 5 });
  if (V === 0) fitAgainst(b, rng, on, 'akvaryum', { sides: [1, 3, 0] });
  fitFloor(b, rng, on, 'robot_kedi');
  // --- arka alt bölüm (≤2 yüksek)
  const lowKeys = V === 0 ? ['calisma_masasi', 'raf_unitesi', 'dolap', 'koltuk'] : ['mutfak_tezgahi', 'buzdolabi', 'raf_unitesi', 'puf'];
  lowKeys.forEach((k) => { if (lowOk(k)) fitAgainst(b, rng, arka, k, { sides: [0, 3, 1, 2] }); });
  const wk = fitAgainst(b, rng, arka, 'calisma_masasi', { sides: [0, 1, 3] });
  if (wk) chairFor(b, wk, 'tabure');
  fitWall(b, rng, arka, 'cerceve', { y: 1.0 });
  fitWall(b, rng, arka, 'kod_notu', { y: 1.0 });
  // --- asma (yatak katı)
  fitAgainst(b, rng, asma, 'yatak', { sides: [0, 3, 1], y: m + 1 });
  fitAgainst(b, rng, asma, 'dolap', { sides: [0, 1, 3], y: m + 1 });
  fitAgainst(b, rng, asma, 'ayakli_lamba', { sides: [0, 1, 3], y: m + 1 });
  fitAgainst(b, rng, asma, 'raf_unitesi', { sides: [0, 1, 3], y: m + 1 });
  fitFloor(b, rng, asma, 'puf', { y: m + 1 });
  fitWall(b, rng, asma, 'tuval', { y: m + 1.5, sides: [0, 1, 3] });
  fitWall(b, rng, asma, 'cerceve', { y: m + 1.5, sides: [0, 1, 3], variant: 4 });
  // --- atölye (V2)
  if (atolye) {
    fitAgainst(b, rng, atolye, 'heykel', { sides: [0, 1] });
    fitAgainst(b, rng, atolye, 'heykel', { sides: [0, 1, 2] });
    fitFloor(b, rng, atolye, 'saksi_buyuk');
    fitWall(b, rng, atolye, 'tuval', { y: 1.4, variant: 6 });
    fitWall(b, rng, atolye, 'tuval', { y: 2.2, variant: 1 });
    fitWall(b, rng, atolye, 'tuval', { y: 1.4, variant: 7 });
    fitWall(b, rng, atolye, 'bitki_duvar', { y: 1.0, sides: [1, 0] });
    fitFloor(b, rng, atolye, 'kitap_yigini');
    fitAgainst(b, rng, atolye, 'dolap', { sides: [1, 0] });
  }
  // --- ışık
  lightRoomWide(b, on, 3, V === 0 ? ['neon_cyan', 'panel', 'neon_cyan'] : ['neon_pink', 'lantern', 'neon_pink']);
  lightRoomWide(b, arka, 2, 'panel');
  lightRoomWide(b, asma, 1, 'lantern');
  if (atolye) lightRoomWide(b, atolye, 2, ['neon_pink', 'neon_lime']);
  b.accent(0, 0, W, 1, f.H - 1, f.H, V === 0 ? ID.NEON_CYAN : ID.NEON_PINK);
  b.accent(0, D1 - 1, W, D1, f.H - 1, f.H, V === 0 ? ID.NEON_CYAN : ID.NEON_PINK);
  deferChip(b, asma, [asma.u1 - 1, asma.v1 - 1], m + 1);
  const side = du >= W / 2 ? W - 1 : 0;
  deferSignature(b, ['alcak_masa', 'masa'], on, [side === 0 ? 1 : W - 2, 1]);
  return {
    mood: MOODS[V],
    layout: {
      v: V, W, D, D1, m, wm, stair, rooms: roomRects(b),
    },
    ownerPost: deferPost(b, on, [clamp(du + 2, 1, W - 2), 2], 0),
  };
}

/* ------------------------------------------------------------------------------------------------ V1 panorama */
function planPano(b, rng, f, R) {
  const W = R[2];
  const D = R[3];
  const du = f.door.u;
  const vs = clamp(Math.round(D * 0.55), 4, D - 5);
  const on = b.room('salon', [0, 0, W, vs], { role: 'salon' });
  const aw = Math.max(5, Math.round(W * 0.45));
  const yat = b.room('yatak', [0, vs + 1, aw, D], { role: 'yatak' });
  const cal = b.room('calisma', [aw + 1, vs + 1, W, D], { role: 'calisma' });
  b.door('d0', 'salon', 'yatak', {
    axis: 'u', line: vs, c: clamp(Math.floor(aw / 2), 1, aw - 2), w: aw >= 6 ? 3 : 1, kind: aw >= 6 ? 'arch' : 'door',
  });
  b.door('d1', 'salon', 'calisma', {
    axis: 'u', line: vs, c: clamp(Math.floor((aw + 1 + W) / 2), aw + 2, W - 3), w: 3, kind: 'arch',
  });
  livingSet(b, rng, on, du >= W / 2 ? 3 : 1);
  kitchenSet(b, rng, on, du >= W / 2 ? 1 : 3);
  fitAgainst(b, rng, on, 'kitaplik', { sides: [0, 1, 3] });
  fitAgainst(b, rng, on, 'kitaplik', { sides: [0, 1, 3] });
  fitAgainst(b, rng, on, 'akvaryum', { sides: [0, 1, 3] });
  plantsArt(b, rng, on, 2);
  fitWall(b, rng, on, 'bitki_duvar', { y: 1.0 });
  fitFloor(b, rng, on, 'robot_kedi');
  fitFloor(b, rng, on, 'heykel');
  // yatak odası
  fitAgainst(b, rng, yat, 'yatak', { sides: [0, 3] });
  fitAgainst(b, rng, yat, 'dolap', { sides: [3, 1, 0] });
  fitAgainst(b, rng, yat, 'ayakli_lamba', { sides: [0, 3, 1] });
  fitFloor(b, rng, yat, 'hali', { ly: 0, variant: 4 });
  fitWall(b, rng, yat, 'tuval', { y: 1.5 });
  fitWall(b, rng, yat, 'cerceve', { y: 1.5 });
  // çalışma odası
  const desk = fitAgainst(b, rng, cal, 'calisma_masasi', { sides: [0, 1, 3] });
  if (desk) chairFor(b, desk, 'sandalye');
  fitAgainst(b, rng, cal, 'kitaplik', { sides: [0, 1, 3] });
  fitAgainst(b, rng, cal, 'raf_unitesi', { sides: [0, 1, 3] });
  fitWall(b, rng, cal, 'kod_notu', { y: 1.4 });
  fitWall(b, rng, cal, 'holo_ekran', { y: 1.4 });
  fitFloor(b, rng, cal, 'kitap_yigini');
  lightRoomWide(b, on, 4, ['lantern', 'neon_amber', 'lantern', 'neon_amber']);
  lightRoomWide(b, yat, 1, 'lantern');
  lightRoomWide(b, cal, 1, 'panel');
  b.accent(0, 0, W, 1, f.H - 1, f.H, ID.NEON_AMBER);
  b.accent(0, vs - 1, W, vs, f.H - 1, f.H, ID.NEON_AMBER);
  deferChip(b, cal, [cal.u1 - 1, cal.v1 - 1], 0);
  deferSignature(b, ['alcak_masa', 'masa'], on, [du >= W / 2 ? W - 2 : 1, 1]);
  return {
    mood: MOODS[1], layout: { v: 1, W, D, vs, aw, rooms: roomRects(b) }, ownerPost: deferPost(b, on, [clamp(du + 2, 1, W - 2), 2], 0),
  };
}

function build(ctx, lot, rng, variant, guard) {
  const gctx = guard ? ctx : Object.assign({}, ctx, { guard: false });
  const b = new InteriorBuilder(gctx);
  capKeys(b, 10, 38, CORE);
  const f = ctx.frame;
  const R = usableRect(f);
  const V = variant % 3;
  let res = null;
  if (f.H >= 5 && R[3] >= 8 && R[2] >= 10) {
    if (V === 1) res = planPano(b, rng, f, R);
    else {
      res = planMezz(b, rng, f, R, V, V === 0 ? 0 : 2);
      if (!res && V === 2) res = planMezz(b, rng, f, R, 2, 0);
    }
  }
  if (res) {
    const main = b.rooms.filter((r) => r.role === 'on' || r.role === 'salon' || r.role === 'atolye');
    const bed = b.rooms.filter((r) => r.role === 'asma' || r.role === 'yatak');
    ensure(b, rng, 'kanepe', main.concat(b.rooms));
    ensure(b, rng, 'yatak', bed.concat(b.rooms));
    ensure(b, rng, 'dev_holo_ekran', main);
    ensure(b, rng, 'masa', main);
    topUp(b, rng, main, DECOR, 24, WALLDECOR);
  }
  if (!res) {
    // dönüştürülemediyse (builder boş değilse) sıfırla
    const b2 = new InteriorBuilder(gctx);
    capKeys(b2, 10, 38, CORE);
    res = planFlat(b2, rng, f, R, V);
    topUp(b2, rng, b2.rooms.filter((r) => r.role === 'on'), DECOR, 24, WALLDECOR);
    return finishInterior(b2, Object.assign(res, { core: CORE }));
  }
  return finishInterior(b, Object.assign(res, { core: CORE }));
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
  const rect = (id) => rs.find((r) => r[6] === id);
  paintWalls(kit, interior, (u, v, y, h) => {
    if (y === 0) return pal.wall2;
    if (y === h - 1) return pal.wall2;
    return undefined;
  });
  const on = rect('on') || rect('salon');
  kit.floor(on[0], on[1], on[2], on[3], (u, v) => (((u >> 1) + (v >> 1)) & 1 ? pal.floor : pal.floor2));
  if (L.stair) {
    const arka = rect('arka');
    const asma = rect('asma');
    kit.floor(arka[0], arka[1], arka[2], arka[3], pal.cloth2);
    // asma döşeme (arka alt bölümün tavanı) + merdiven
    kit.box(asma[0], asma[1], asma[2], asma[3], L.m, L.m + 1, pal.cloth);
    kit.stair(L.stair);
    // asma katın salona bakan cam bölmesi (duvarın yalnız üst satırları)
    kit.window(asma[0], on[3], asma[2], on[3] + 1, L.m + 1, H, pal.glass);
    const at = rect('atolye');
    if (at) {
      kit.floor(at[0], at[1], at[2], at[3], (u, v) => (((u + v) & 1) ? pal.cloth : pal.cloth2));
      kit.window(asma[2], at[1], asma[2] + 1, at[3], L.m + 1, H, pal.glass);
    }
    kit.floor(on[0] + 1, on[1] + 1, on[2] - 1, on[1] + 2, pal.cloth2);
  } else if (rect('yatak')) {
    const y = rect('yatak');
    const c = rect('calisma');
    kit.floor(y[0], y[1], y[2], y[3], pal.cloth);
    kit.floor(c[0], c[1], c[2], c[3], pal.cloth2);
    // salon-arka bölme duvarında yatak odası penceresi
    kit.window(y[0] + 1, y[1] - 1, y[0] + 2, y[1], 1, 3, pal.glass);
  } else {
    const a = rect('arka');
    kit.floor(a[0], a[1], a[2], a[3], pal.cloth);
  }
  // salonda tavan kirişleri
  if (H >= 5) {
    for (let u = 2; u < on[2]; u += 4) kit.box(u, on[1], u + 1, on[3], H - 1, H, pal.wall2);
  }
  frameDoors(kit, interior, pal, { archFrame: pal.wall2, frame: pal.wall2 });
}

export default {
  kind: KIND,
  name: 'Loft',
  footprint,
  palette: (it) => PALS[(it.variant | 0) % 3],
  autoDoors: false,
  plan,
  emit,
};
