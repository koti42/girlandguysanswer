/*
 * KEŞİF sim/city/interior/kinds — 4 OYUNCU ODASI (design_city §7.2 #4: 9×9×4, açık+bölge; koltuk, 3 ekran, neon raf; sahip Defne, pembe/mor, oyun_bip).
 * 3 varyant (V = hash % 3):
 *   V0 «Üç Ekran»        tek açık oda, bölgeler: ekran masası / sinema köşesi / arcade duvarı (pembe-mor)
 *   V1 «Maç Odası»       ön oyun odası (iki istasyon + arcade) + arka dinlenme odası (kanepeler, dev ekran), camgöbeği-pembe
 *   V2 «Yayın Kulübesi»  ön salon + arka yayın kabini + depo; turuncu-mor
 * Kilit yok. Oda başına ≤4 ışık; aksanlar ≤48 hücre.
 */
import { B } from '../../../blocks.js';
import { ID } from '../../cityEmit.js';
import { InteriorBuilder } from '../builder.js';
import {
  ensure, deferChip, deferPost, deferSignature, capKeys, against, againstTry, finishInterior, mkPal, paintWalls, put, putTry, frameDoors, roomRects, topUp, usableRect, wallAt, twoPass,
} from '../furnishA.js';

const KIND = 'oyuncu_odasi';
const CORE = ['cok_ekranli_masa', 'oyuncu_koltugu', 'arcade_makinesi', 'dev_holo_ekran', 'kanepe', 'neon_raf', 'neon_tabela_ic'];

const PALS = [
  mkPal('pembe', {
    floor: ID.BLACK, floor2: ID.FACADE_DARK, wall: ID.FACADE_DARK, wall2: ID.PURPLE, ceil: ID.FACADE_DARK, trim: ID.NEON_PINK, glow: ID.NEON_PINK, glow2: ID.NEON_CYAN, cloth: B.CLOTH_PURPLE, cloth2: B.CLOTH_RED,
  }),
  mkPal('camgobegi', {
    floor: ID.FACADE_DARK, floor2: ID.BLACK, wall: ID.BLACK, wall2: ID.BLUE, ceil: ID.BLACK, trim: ID.NEON_CYAN, glow: ID.NEON_CYAN, glow2: ID.NEON_PINK, cloth: B.CLOTH_BLUE, cloth2: B.CLOTH_PURPLE,
  }),
  mkPal('turuncu', {
    floor: ID.FACADE_DARK, floor2: ID.IRON, wall: ID.FACADE_LIGHT, wall2: ID.PURPLE, ceil: ID.FACADE_DARK, trim: ID.NEON_AMBER, glow: ID.NEON_AMBER, glow2: ID.NEON_PINK, cloth: B.CLOTH_ORANGE, cloth2: B.CLOTH_PURPLE,
  }),
];
const MOODS = [{ hue: 'pembe', light: 12 }, { hue: 'camgobegi', light: 11 }, { hue: 'turuncu', light: 11 }];
const DECOR = ['puf', 'hoparlor', 'saksi_buyuk', 'raf_unitesi', 'dolap', 'arcade_makinesi'];
const WALLDECOR = ['cerceve', 'neon_raf', 'televizyon', 'kod_notu'];

function footprint() {
  return { w: 9, d: 9, h: 4 };
}

/** Oyun istasyonu: masa duvara yaslı, koltuk ona bakar. */
function station(b, room, side, along, o) {
  const t = against(b, 'cok_ekranli_masa', room, side, along, o);
  if (!t) return null;
  const s = side & 3;
  const back = 1.6;
  let cu = along;
  let cv = along;
  let ly = 0;
  if (s === 0) { cu = along; cv = room.v1 - back; ly = 0; }
  else if (s === 2) { cu = along; cv = room.v0 + back; ly = 2; }
  else if (s === 1) { cu = room.u1 - back; cv = along; ly = 1; }
  else { cu = room.u0 + back; cv = along; ly = 3; }
  // koltuk masadan biraz uzakta (ekranlar duvarda: koltuk duvara DOĞRU bakar)
  put(b, 'oyuncu_koltugu', s === 1 ? room.u1 - 2.2 : s === 3 ? room.u0 + 2.2 : cu, s === 0 ? room.v1 - 2.2 : s === 2 ? room.v0 + 2.2 : cv, ly);
  return t;
}

function loungeSet(b, room, dir, anchorU, o) {
  // dev ekran arka duvarda; kanepe ona bakar; alçak masa ortada; puflar yanlarda
  const op = o || {};
  const cx = anchorU;
  const depth = room.v1 - room.v0;
  if (depth >= 5) {
    wallAt(b, 'dev_holo_ekran', room, 0, cx, { y: 1.0 });
    const vC = room.v1 - 3.4;
    putTry(b, 'kanepe', [[cx, vC], [cx, vC - 0.5]], 2, op);
    putTry(b, 'alcak_masa', [[cx, vC + 1.5], [cx, vC + 1.2]], 0);
    putTry(b, 'puf', [[cx - 2.0, vC + 1.2], [cx - 2.0, vC + 0.8]], 0);
    putTry(b, 'puf', [[cx + 2.0, vC + 1.2], [cx + 2.0, vC + 0.8]], 0);
  } else {
    // sığ oda: ekran sol duvarda, kanepe ona bakar (kapı boşluğu ortada kalır)
    const vm = (room.v0 + room.v1) / 2;
    wallAt(b, 'dev_holo_ekran', room, 3, vm, { y: 1.0 });
    putTry(b, 'kanepe', [[room.u0 + 2.4, vm], [room.u0 + 2.2, vm]], 3, op);
    putTry(b, 'alcak_masa', [[room.u0 + 1.4, vm]], 1);
    putTry(b, 'puf', [[room.u0 + 1.0, room.v0 + 0.5], [room.u0 + 1.0, room.v1 - 0.5]], 1);
  }
  void dir;
}

/* ------------------------------------------------------------------------------------------------ V0 */
function planV0(b, rng, f, R) {
  const W = R[2];
  const D = R[3];
  const room = b.room('salon', [0, 0, W, D], { role: 'salon' });
  const mid = (W / 2) | 0;
  // sağ duvar: ekran istasyonu + ikinci masa
  station(b, room, 1, 2.25);
  against(b, 'calisma_masasi', room, 1, 4.5);
  put(b, 'oyuncu_koltugu', W - 2.2, 4.5, 1);
  put(b, 'oyun_bilgisayari', W - 0.5, 4.1, 3, { y: 0.875 });
  // sol duvar: arcade makineleri + hoparlör
  againstTry(b, 'arcade_makinesi', room, 3, [1.5, 2.5, 3.5]);
  againstTry(b, 'arcade_makinesi', room, 3, [3.5, 2.5, 4.5, 5.5]);
  against(b, 'hoparlor', room, 3, 6.0);
  // arka: sinema köşesi
  loungeSet(b, room, 0, mid - 0.5 + (D > 8 ? 0 : 0));
  against(b, 'akvaryum', room, 0, W - 2.0);
  against(b, 'saksi_buyuk', room, 0, 0.5);
  wallAt(b, 'neon_tabela_ic', room, 2, W - 2.5, { y: 1.6 });
  wallAt(b, 'neon_raf', room, 3, 7.0, { y: 1.5 });
  wallAt(b, 'neon_raf', room, 1, 7.0, { y: 1.5 });
  wallAt(b, 'televizyon', room, 2, 1.5, { y: 1.5 });
  wallAt(b, 'cerceve', room, 3, 5.0, { y: 1.5 });
  putTry(b, 'hali', [[mid - 0.5, D - 3.0]], 0, { variant: 2 });
  put(b, 'kablo_demeti', 2.5, D - 1.5, 0);
  b.light('salon', 2, 2, 'neon_pink');
  b.light('salon', W - 3, 2, 'neon_pink');
  b.light('salon', mid, D - 2, 'holo');
  b.light('salon', 2, D - 2, 'neon_cyan');
  b.accent(0, 0, W, 1, -1, 0, ID.NEON_PINK);
  b.accent(0, D - 1, W, D, f.H - 1, f.H, ID.NEON_CYAN);
  deferChip(b, room, [1, D - 1], 0);
  deferSignature(b, ['alcak_masa', 'calisma_masasi', 'cok_ekranli_masa'], room, [mid + 2, D - 2]);
  return {
    mood: MOODS[0], layout: { v: 0, W, D, rooms: roomRects(b) }, ownerPost: deferPost(b, room, [mid, D - 3], 2),
  };
}

/* ------------------------------------------------------------------------------------------------ V1 */
function planV1(b, rng, f, R) {
  const W = R[2];
  const D = R[3];
  const vf = Math.max(3, D - 4);
  const oyun = b.room('oyun', [0, 0, W, vf], { role: 'oyun' });
  const din = b.room('dinlenme', [0, vf + 1, W, D], { role: 'dinlenme' });
  const mid = (W / 2) | 0;
  b.door('d0', 'oyun', 'dinlenme', {
    axis: 'u', line: vf, c: clampC(mid, W), w: 3, kind: 'arch',
  });
  // ön oda: iki istasyon (sol, sağ) + arcade
  station(b, oyun, 3, 1.75);
  station(b, oyun, 1, 1.75);
  againstTry(b, 'arcade_makinesi', oyun, 0, [0.5, 1.5]);
  againstTry(b, 'arcade_makinesi', oyun, 0, [W - 0.5, W - 1.5]);
  wallAt(b, 'neon_tabela_ic', oyun, 2, W - 2.0, { y: 1.6 });
  wallAt(b, 'televizyon', oyun, 2, 1.5, { y: 1.5 });
  wallAt(b, 'neon_raf', oyun, 3, vf - 0.5, { y: 1.5 });
  wallAt(b, 'neon_raf', oyun, 1, vf - 0.5, { y: 1.5 });
  putTry(b, 'puf', [[mid + 0.5, vf - 1.5], [mid - 1.5, vf - 1.5]], 0);
  // arka: dinlenme
  loungeSet(b, din, 0, mid - 0.5);
  against(b, 'akvaryum', din, 3, din.v0 + 1.0);
  against(b, 'dolap', din, 1, din.v0 + 0.5);
  against(b, 'hoparlor', din, 0, 0.5);
  against(b, 'hoparlor', din, 0, W - 0.5);
  putTry(b, 'hali', [[mid - 0.5, din.v0 + 1.5]], 0, { variant: 3 });
  wallAt(b, 'cerceve', din, 3, din.v0 + 2.5, { y: 1.5 });
  b.light('oyun', 2, 1, 'neon_cyan');
  b.light('oyun', W - 3, 1, 'neon_pink');
  b.light('dinlenme', 2, din.v0 + 1, 'neon_pink');
  b.light('dinlenme', W - 3, din.v0 + 1, 'holo');
  b.accent(0, 0, 1, vf, f.H - 1, f.H, ID.NEON_CYAN);
  b.accent(W - 1, 0, W, vf, f.H - 1, f.H, ID.NEON_PINK);
  b.accent(0, D - 1, W, D, -1, 0, ID.NEON_PINK);
  deferChip(b, din, [din.u1 - 1, din.v1 - 1], 0);
  deferSignature(b, ['alcak_masa', 'cok_ekranli_masa'], din, [mid + 2, din.v1 - 1]);
  return {
    mood: MOODS[1], layout: { v: 1, W, D, vf, rooms: roomRects(b) }, ownerPost: deferPost(b, oyun, [mid, 2], 0),
  };
}

function clampC(c, W) {
  return c < 2 ? 2 : c > W - 3 ? W - 3 : c;
}

/* ------------------------------------------------------------------------------------------------ V2 */
function planV2(b, rng, f, R) {
  const W = R[2];
  const D = R[3];
  const vf = Math.max(3, D - 4);
  const salon = b.room('salon', [0, 0, W, vf], { role: 'salon' });
  const yw = Math.max(4, W - 5);
  const yayin = b.room('yayin', [0, vf + 1, yw, D], { role: 'yayin' });
  const depo = b.room('depo', [yw + 1, vf + 1, W, D], { role: 'depo' });
  const mid = (W / 2) | 0;
  b.door('d0', 'salon', 'yayin', {
    axis: 'u', line: vf, c: 1, w: 1, kind: 'door',
  });
  b.door('d1', 'salon', 'depo', {
    axis: 'u', line: vf, c: W - 2, w: 1, kind: 'door',
  });
  // salon: kanepeler + arcade + dev ekran (sağ duvar)
  against(b, 'kanepe', salon, 3, vf - 1.5);
  against(b, 'kanepe', salon, 3, 1.25, { gap: 0 });
  putTry(b, 'alcak_masa', [[2.5, vf / 2], [3.0, vf / 2]], 1);
  wallAt(b, 'dev_holo_ekran', salon, 1, vf / 2, { y: 1.0 });
  putTry(b, 'puf', [[W - 3.0, 1.0], [W - 3.5, 1.5]], 3);
  putTry(b, 'puf', [[W - 3.0, 2.0], [W - 3.5, 2.5]], 3);
  againstTry(b, 'arcade_makinesi', salon, 0, [mid + 1.5, mid + 2.5, mid]);
  wallAt(b, 'neon_tabela_ic', salon, 2, W - 2.0, { y: 1.6 });
  wallAt(b, 'neon_raf', salon, 3, vf - 0.5, { y: 1.8 });
  wallAt(b, 'televizyon', salon, 2, 1.5, { y: 1.5 });
  // yayın kabini
  against(b, 'cok_ekranli_masa', yayin, 0, yayin.u0 + 2.5);
  put(b, 'oyuncu_koltugu', yayin.u0 + 2.5, yayin.v1 - 2.2, 0);
  against(b, 'hoparlor', yayin, 3, yayin.v0 + 1.0);
  against(b, 'hoparlor', yayin, 1, yayin.v0 + 1.0);
  wallAt(b, 'neon_tabela_ic', yayin, 0, yayin.u0 + 2.0, { y: 2.1 });
  wallAt(b, 'cerceve', yayin, 1, yayin.v0 + 2.0, { y: 1.5 });
  // depo
  against(b, 'raf_unitesi', depo, 0, depo.u0 + 1.0);
  against(b, 'dolap', depo, 1, depo.v1 - 0.5);
  put(b, 'kablo_demeti', depo.u0 + 0.8, depo.v1 - 0.8, 0);
  b.light('salon', 2, 1, 'neon_pink');
  b.light('salon', W - 3, vf - 1, 'neon_pink');
  b.light('yayin', 2, yayin.v0 + 1, 'neon_pink');
  b.light('depo', depo.u0 + 1, depo.v0 + 1, 'holo');
  b.accent(0, 0, W, 1, -1, 0, ID.NEON_AMBER);
  b.accent(0, D - 1, yw, D, f.H - 1, f.H, ID.NEON_PINK);
  deferChip(b, depo, [depo.u1 - 1, depo.v1 - 1], 0);
  deferSignature(b, ['alcak_masa', 'cok_ekranli_masa'], salon, [3, vf - 1]);
  return {
    mood: MOODS[2], layout: { v: 2, W, D, vf, rooms: roomRects(b) }, ownerPost: deferPost(b, salon, [W - 3, vf - 2], 3),
  };
}

const PLANS = [planV0, planV1, planV2];

function build(ctx, lot, rng, variant, guard) {
  const gctx = guard ? ctx : Object.assign({}, ctx, { guard: false });
  const b = new InteriorBuilder(gctx);
  capKeys(b, 10, 38, CORE);
  const f = ctx.frame;
  const R = usableRect(f);
  const res = PLANS[variant % 3](b, rng, f, R);
  const main = b.rooms.filter((r) => r.role !== 'depo');
  ensure(b, rng, 'cok_ekranli_masa', main.concat(b.rooms));
  ensure(b, rng, 'kanepe', main.concat(b.rooms));
  ensure(b, rng, 'arcade_makinesi', main.concat(b.rooms));
  ensure(b, rng, 'dev_holo_ekran', main);
  topUp(b, rng, b.rooms.filter((r) => r.role !== 'depo'), DECOR, 20, WALLDECOR);
  return finishInterior(b, Object.assign(res, { core: CORE }));
}

function plan(lot, rng, variant, ctx) {
  return twoPass(ctx, rng, (r, g) => build(ctx, lot, r, variant, g));
}

function emit(W, interior, ctx) {
  const { kit, pal } = ctx;
  const L = interior.layout;
  if (!L) return;
  const rs = L.rooms;
  const rect = (id) => rs.find((r) => r[6] === id);
  paintWalls(kit, interior, (u, v, y, h) => {
    if (y === 0) return pal.wall2;
    if (y === h - 1) return pal.wall2;
    if (y === 2 && ((u + v) & 1) === 0) return pal.wall2;
    return undefined;
  });
  const chk = (a, b2) => (u, v) => (((u + v) & 1) ? a : b2);
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i];
    if (r[6] === 'depo') kit.floor(r[0], r[1], r[2], r[3], pal.cloth2);
    else kit.floor(r[0], r[1], r[2], r[3], chk(pal.floor, pal.floor2));
  }
  // neon ızgara şeritleri: kapıdan içeri parlayan yol (zemin)
  if (L.v === 0) {
    const r = rect('salon');
    kit.floor(r[0] + 1, r[1] + 4, r[2] - 1, r[1] + 5, pal.cloth);
    kit.floor(2, r[3] - 5, r[2] - 2, r[3] - 1, pal.cloth2);
  } else if (L.v === 1) {
    const d = rect('dinlenme');
    kit.floor(d[0] + 1, d[1], d[2] - 1, d[3] - 1, pal.cloth);
  } else {
    const y = rect('yayin');
    kit.floor(y[0], y[1], y[2], y[3], pal.cloth);
    const s = rect('salon');
    kit.floor(1, 1, 5, s[3] - 1, pal.cloth2);
  }
  frameDoors(kit, interior, pal, { archFrame: pal.wall2, frame: pal.wall2 });
}

export default {
  kind: KIND,
  name: 'Oyuncu Odası',
  footprint,
  palette: (it) => PALS[(it.variant | 0) % 3],
  autoDoors: false,
  plan,
  emit,
};


