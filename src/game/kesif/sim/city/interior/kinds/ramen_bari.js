/*
 * KEŞİF sim/city/interior/kinds — 5 RAMEN BARI (design_city §7.2 #5: 14×9×4, açık+bölge; tezgâh, tabureler, buhar; sahip Usta Selvi, kehribar, buhar).
 * 3 varyant (V = hash % 3). Yemek salonu + mutfak arası cam geçişli bölme; tezgâhlar mutfak duvarına yaslıdır, taburelerin önü tezgâha bakar:
 *   V0 «Uzun Tezgâh»    salon + mutfak, mutfak kapısı solda (3 geniş kemer), 2–3 tezgâh, masa-sandalye grupları (kehribar-tuğla)
 *   V1 «L Tezgâh»       geniş ayak izinde yan mutfak (dikey bölme), dar ayak izinde duvar boyu köşe masaları; sıcak ahşap
 *   V2 «Çardak»         salon + mutfak + depo, kısa tezgâh + kabinli masalar (koyu ahşap-kırmızı)
 * Kilit yok. Oda başına ≤4 ışık.
 */
import { B } from '../../../blocks.js';
import { ID } from '../../cityEmit.js';
import { InteriorBuilder } from '../builder.js';
import {
  ensure, deferChip, deferPost, deferSignature, capKeys, against, againstTry, finishInterior, mkPal, paintWalls, put, putTry, frameDoors, roomRects, topUp, usableRect, wallAt, wallTry, twoPass,
} from '../furnishA.js';

const KIND = 'ramen_bari';
const CORE = ['ramen_tezgahi', 'tabure', 'mutfak_tezgahi', 'kafe_masasi', 'sandalye', 'buhar_cikisi', 'menu_tahtasi'];

const PALS = [
  mkPal('kehribar', {
    floor: B.PLANKS_OAK, floor2: B.PLANKS_ACACIA, wall: B.PLANKS_ACACIA, wall2: ID.BRICK, ceil: B.PLANKS_OAK, trim: ID.NEON_AMBER, glow: ID.NEON_AMBER, glow2: ID.NEON_PINK, cloth: B.CLOTH_RED, cloth2: B.CLOTH_ORANGE,
  }),
  mkPal('camgobegi', {
    floor: B.PLANKS_BIRCH, floor2: B.PLANKS_BAMBOO, wall: ID.WHITE, wall2: B.PLANKS_BIRCH, ceil: ID.WHITE, trim: ID.NEON_CYAN, glow: ID.NEON_CYAN, glow2: ID.NEON_AMBER, cloth: B.CLOTH_BLUE, cloth2: B.CLOTH_WHITE,
  }),
  mkPal('pembe', {
    floor: B.PLANKS_PINE, floor2: B.PLANKS_OAK, wall: ID.FACADE_DARK, wall2: ID.BRICK, ceil: ID.BLACK, trim: ID.NEON_PINK, glow: ID.NEON_PINK, glow2: ID.NEON_AMBER, cloth: B.CLOTH_RED, cloth2: B.CLOTH_BLACK,
  }),
];
const MOODS = [{ hue: 'kehribar', light: 12 }, { hue: 'camgobegi', light: 11 }, { hue: 'pembe', light: 11 }];
const LIGHT_NEON = ['neon_amber', 'neon_cyan', 'neon_pink'];
const DECOR = ['saksi_buyuk', 'akvaryum', 'otomat_icecek', 'kafe_masasi'];
const WALLDECOR = ['menu_tahtasi', 'neon_tabela_ic'];

function footprint() {
  return { w: 14, d: 9, h: 4 };
}

/** Kare masa + iki yan sandalye (masa merkezi uc,vc). */
function cafeTable(b, uc, vc, o) {
  const t = put(b, 'kafe_masasi', uc, vc, 0, o);
  if (!t) return null;
  put(b, 'sandalye', uc - 1.0, vc, 1);
  put(b, 'sandalye', uc + 1.0, vc, 3);
  return t;
}

/** Uzun masa (2×1) + öndeki/arkadaki sandalyeler. */
function longTable(b, uc, vc) {
  const t = put(b, 'masa', uc, vc, 0);
  if (!t) return null;
  put(b, 'sandalye', uc - 0.5, vc - 1.0, 0);
  put(b, 'sandalye', uc + 0.5, vc + 1.0, 2);
  return t;
}

/** Tezgâh sırası: bölme duvarına yaslı (wall at room.v1), tabureler önünde. skip: kemer yasak aralığı [u0,u1). */
function counters(b, room, skip, cap) {
  const out = [];
  let n = 0;
  for (let along = 1.5; along <= room.u1 - 1.5 && n < cap; along += 3) {
    if (skip && along + 1.5 > skip[0] && along - 1.5 < skip[1]) continue;
    const c = against(b, 'ramen_tezgahi', room, 0, along);
    if (!c) continue;
    n++;
    out.push(along);
    put(b, 'kase_seti', along - 0.7, room.v1 - 0.5, 2, { y: 1.125 });
    put(b, 'kase_seti', along + 0.6, room.v1 - 0.5, 2, { y: 1.125, variant: 1 });
    for (let k = -1; k <= 1; k++) put(b, 'tabure', along + k, room.v1 - 2.1, 0);
  }
  return out;
}

function kitchen(b, room, o) {
  const op = o || {};
  const w = room.u1 - room.u0;
  const depth = room.v1 - room.v0;
  // arka duvar: tezgâhlar + buzdolabı + çay ocağı
  const back = op.back === undefined ? 0 : op.back;
  const alongs = [];
  for (let a = room.u0 + 1.0; a <= room.u1 - 1.0; a += 2) alongs.push(a);
  let used = 0;
  const keys = ['mutfak_tezgahi', 'buzdolabi', 'mutfak_tezgahi', 'cay_ocagi', 'mutfak_tezgahi'];
  for (let i = 0; i < alongs.length && used < keys.length; i++) {
    const key = keys[used];
    const wd = key === 'mutfak_tezgahi' ? 2 : 1;
    const along = key === 'mutfak_tezgahi' ? alongs[i] : alongs[i] - 0.5;
    if (against(b, key, room, back, along)) {
      used++;
      if (wd === 2) i += 0;
    }
  }
  if (depth >= 3) {
    putTry(b, 'buhar_cikisi', [[room.u1 - 1.5, room.v0 + 1.0], [room.u0 + 2.5, room.v0 + 1.0], [room.u1 - 1.5, room.v1 - 1.5]], 0);
    putTry(b, 'buhar_cikisi', [[room.u0 + w / 2, room.v1 - 1.5], [room.u0 + 1.5, room.v1 - 1.5]], 0);
  }
}

/* ------------------------------------------------------------------------------------------------ V0 */
function planH(b, rng, f, R, V) {
  const ctx0 = b.ctx;
  const W = R[2];
  const D = R[3];
  const vs = D - 4 < 4 ? Math.max(3, D - 4) : D - 4;
  const sal = b.room('salon', [0, 0, W, vs], { role: 'salon' });
  const mut = b.room('mutfak', [0, vs + 1, V === 2 ? W - 4 : W, D], { role: 'mutfak' });
  let dep = null;
  if (V === 2) dep = b.room('depo', [W - 3, vs + 1, W, D], { role: 'depo' });
  const left = V !== 1;
  const wide = W >= 12;
  const dc = wide ? (left ? 2 : W - 3) : (left ? 1 : W - 2);
  b.door('d0', 'salon', 'mutfak', {
    axis: 'u', line: vs, c: dc, w: wide ? 3 : 1, kind: wide ? 'arch' : 'door',
  });
  if (dep) {
    // geniş salonda depo kapısı salondan; dar salonda mutfaktan (salon duvarı tezgâhlara kalsın)
    if (W >= 12) {
      b.door('d1', 'salon', 'depo', {
        axis: 'u', line: vs, c: W - 2, w: 1, kind: 'door',
      });
    } else {
      b.door('d1', 'mutfak', 'depo', {
        axis: 'v', line: W - 4, c: Math.floor((vs + 1 + D) / 2), w: 1, kind: 'door',
      });
    }
  }
  const skip = [dc - 1.6, dc + 2.6];
  const cs = counters(b, sal, skip, V === 2 ? 2 : 3);
  // menü/neon (bölme duvarında)
  wallAt(b, 'menu_tahtasi', sal, 0, left ? W - 1.5 : 1.5, { y: 2.2 });
  wallTry(b, 'menu_tahtasi', sal, 0, [left ? 5.0 : W - 5.0, 7.0], { y: 2.2, variant: 1 });
  wallAt(b, 'neon_tabela_ic', sal, 2, W - 2.5, { y: 1.8 });
  wallAt(b, 'neon_tabela_ic', sal, 2, 2.0, { y: 1.8, variant: 2 });
  // masa grupları
  const rows = [];
  for (let r = 2.0; r <= vs - 4.0; r += 3.0) rows.push(r);
  if (!rows.length) rows.push(2.0);
  const cols = [];
  for (let u = 1.5; u <= W - 1.5; u += 3.0) cols.push(u);
  let tn = 0;
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < cols.length; c++) {
      if (tn >= (V === 1 ? 6 : 5)) break;
      const useLong = (c + r) % 2 === 0 && V !== 1;
      const ok = useLong ? longTable(b, cols[c], rows[r]) : cafeTable(b, cols[c], rows[r]);
      if (ok) tn++;
    }
  }
  against(b, 'otomat_icecek', sal, 3, vs - 1.5);
  againstTry(b, 'akvaryum', sal, 1, [vs - 1.0, 2.0]);
  against(b, 'saksi_buyuk', sal, 2, W - 0.5);
  kitchen(b, mut);
  if (dep) {
    against(b, 'buzdolabi', dep, 0, dep.u0 + 0.5);
    against(b, 'saksi_buyuk', dep, 1, dep.v1 - 0.5);
    putTry(b, 'otomat_icecek', [[dep.u1 - 0.5, dep.v1 - 0.5]], 2);
  }
  const lights = [[1, 1], [W - 2, 1], [(W / 2) | 0, vs - 1]];
  b.light('salon', lights[0][0], lights[0][1], 'lantern');
  b.light('salon', lights[1][0], lights[1][1], 'lantern');
  b.light('salon', lights[2][0], lights[2][1], LIGHT_NEON[V]);
  b.light('mutfak', mut.u0 + 2, mut.v0 + 1, 'lantern');
  b.light('mutfak', mut.u1 - 3, mut.v0 + 1, 'panel');
  if (dep) b.light('depo', dep.u0 + 1, dep.v0 + 1, 'lantern');
  b.accent(0, vs - 1, W, vs, f.H - 1, f.H, ctx0.pal.glow);
  b.accent(0, 0, 1, vs, f.H - 1, f.H, ctx0.pal.glow);
  deferChip(b, dep || sal, [W - 1, dep ? D - 1 : 1], 0);
  deferSignature(b, ['ramen_tezgahi', 'kafe_masasi', 'masa'], sal, [cs.length ? cs[0] : 4, vs - 1]);
  const oc = cs.length ? cs[0] : 5;
  return {
    mood: MOODS[V],
    layout: { v: V, W, D, vs, dc, wide, counters: cs, rooms: roomRects(b) },
    ownerPost: deferPost(b, mut, [oc, mut.v0 + 1], 2),
  };
}

/* ------------------------------------------------------------------------------------------------ V1 (geniş: dikey yan mutfak) */
function planSide(b, rng, f, R) {
  const ctx0 = b.ctx;
  const W = R[2];
  const D = R[3];
  const kw = 4;
  const sal = b.room('salon', [0, 0, W - kw - 1, D], { role: 'salon' });
  const mut = b.room('mutfak', [W - kw, 0, W, D], { role: 'mutfak' });
  const dc = 2;
  b.door('d0', 'salon', 'mutfak', {
    axis: 'v', line: W - kw - 1, c: dc, w: 1, kind: 'door',
  });
  // salon: tezgâh sağ duvarda (mutfak duvarı), tabureler solunda; dört köşede masalar
  let n = 0;
  for (let along = D - 1.5; along >= 1.5 && n < 3; along -= 3) {
    if (along - 1.5 < dc + 2.6) continue;
    const c = against(b, 'ramen_tezgahi', sal, 1, along);
    if (!c) continue;
    n++;
    put(b, 'kase_seti', sal.u1 - 0.5, along - 0.7, 3, { y: 1.125 });
    for (let k = -1; k <= 1; k++) put(b, 'tabure', sal.u1 - 2.1, along + k, 1);
  }
  const rowsU = [1.5, sal.u1 - 4.8];
  const colsV = [2.0, 5.0, 8.0];
  for (let c = 0; c < colsV.length; c++) {
    for (let r = 0; r < rowsU.length; r++) cafeTable(b, rowsU[r] + 1.0, colsV[c]);
  }
  wallAt(b, 'menu_tahtasi', sal, 1, 2.0, { y: 2.2 });
  wallAt(b, 'neon_tabela_ic', sal, 2, 2.5, { y: 1.8 });
  wallAt(b, 'neon_tabela_ic', sal, 2, sal.u1 - 1.5, { y: 1.8, variant: 1 });
  wallAt(b, 'neon_tabela_ic', sal, 3, 6.0, { y: 1.8, variant: 2 });
  against(b, 'otomat_icecek', sal, 0, 0.5);
  againstTry(b, 'akvaryum', sal, 3, [3.0, 4.0]);
  against(b, 'saksi_buyuk', sal, 2, 0.5);
  // mutfak (4 geniş × D): sol duvar tezgâhlar, arka buzdolabı
  const keys = ['mutfak_tezgahi', 'mutfak_tezgahi', 'buzdolabi', 'cay_ocagi'];
  let k = 0;
  for (let a = 1.0; a <= D - 4.5 && k < keys.length; a += (keys[k] === 'mutfak_tezgahi' ? 2 : 1)) {
    if (against(b, keys[k], mut, 1, a + (keys[k] === 'mutfak_tezgahi' ? 0 : 0.5))) k++;
  }
  putTry(b, 'buhar_cikisi', [[mut.u0 + 1.5, mut.v1 - 1.5], [mut.u0 + 1.5, mut.v1 - 3.0]], 0);
  putTry(b, 'buhar_cikisi', [[mut.u1 - 1.5, mut.v0 + 1.5]], 0);
  b.light('salon', 2, 1, 'lantern');
  b.light('salon', sal.u1 - 3, 1, 'lantern');
  b.light('salon', 2, D - 2, 'neon_cyan');
  b.light('salon', sal.u1 - 3, D - 2, 'lantern');
  b.light('mutfak', mut.u0 + 1, 2, 'panel');
  b.accent(sal.u1 - 1, 0, sal.u1, D, f.H - 1, f.H, ctx0.pal.glow);
  deferChip(b, sal, [1, D - 1], 0);
  deferSignature(b, ['ramen_tezgahi', 'kafe_masasi'], sal, [sal.u1 - 1, 3]);
  return {
    mood: MOODS[1],
    layout: { v: 1, side: true, W, D, kw, rooms: roomRects(b) },
    ownerPost: deferPost(b, mut, [mut.u0 + 1, 3], 1),
  };
}

function build(ctx, lot, rng, variant, guard) {
  const gctx = guard ? ctx : Object.assign({}, ctx, { guard: false });
  const b = new InteriorBuilder(gctx);
  capKeys(b, 10, 38, CORE);
  const f = ctx.frame;
  const R = usableRect(f);
  const V = variant % 3;
  const side = V === 1 && R[2] >= 12 && R[3] >= 8 && f.door.u + 2 <= R[2] - 4 - 2;
  const res = side ? planSide(b, rng, f, R) : planH(b, rng, f, R, V);
  const sal = b.rooms.filter((r) => r.role === 'salon');
  ensure(b, rng, 'ramen_tezgahi', sal.concat(b.rooms));
  ensure(b, rng, 'tabure', sal.concat(b.rooms));
  ensure(b, rng, 'kafe_masasi', sal.concat(b.rooms));
  ensure(b, rng, 'mutfak_tezgahi', b.rooms.filter((r) => r.role === 'mutfak').concat(b.rooms));
  topUp(b, rng, sal, DECOR, 20, WALLDECOR);
  return finishInterior(b, Object.assign(res, { core: CORE, vendorKeys: ['ramen_tezgahi'] }));
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
  const sal = rect('salon');
  // bölme duvarı: cam geçiş penceresi (tezgâh hizası), süpürgelik ve üst kiriş
  paintWalls(kit, interior, (u, v, y, h) => {
    if (y === 0) return pal.wall2;
    if (y === h - 1) return pal.wall2;
    if (y === 1 || y === 2) {
      // tezgâh karşısı cam: yalnız salon-mutfak ayıran duvarda (dikdörtgen kenarına değen hücre)
      if (!L.side && v === L.vs && L.counters.some((c) => Math.abs(c - u - 0.5) < 1.2)) return pal.glass;
      if (L.side && u === sal[2] && v > 0 && v < L.D - 1 && (v * 2) % 3 !== 0) return pal.glass;
    }
    return undefined;
  });
  const mut = rect('mutfak');
  kit.floor(sal[0], sal[1], sal[2], sal[3], (u, v) => (((u >> 1) + v) & 1 ? pal.floor : pal.floor2));
  kit.floor(mut[0], mut[1], mut[2], mut[3], (u, v) => (((u + v) & 1) ? ID.WHITE : ID.POLISHED));
  const dep = rect('depo');
  if (dep) kit.floor(dep[0], dep[1], dep[2], dep[3], pal.cloth2);
  // salon halısı (tezgâh önü) ve girişten tezgâha kırmızı kilim
  if (!L.side) {
    kit.floor(1, L.vs - 3, sal[2] - 1, L.vs - 1, pal.cloth);
  } else {
    kit.floor(sal[2] - 3, 1, sal[2] - 1, sal[3] - 1, pal.cloth);
  }
  // ahşap kirişler (tavan, kolon yok)
  const H = ctx.frame.H;
  if (H >= 4) {
    for (let u = 3; u < sal[2]; u += 4) kit.box(u, sal[1], u + 1, sal[3], H - 1, H, pal.floor2);
  }
  frameDoors(kit, interior, pal, { archFrame: pal.wall2, frame: pal.wall2 });
  // noren: mutfak kemerinde sarkan kumaş (yalnız üst satır; yürümeyi engellemez)
  if (L.wide && H >= 4) kit.box(L.dc - 1, L.vs, L.dc + 2, L.vs + 1, 2, 3, pal.cloth);
}

export default {
  kind: KIND,
  name: 'Ramen Barı',
  footprint,
  palette: (it) => PALS[(it.variant | 0) % 3],
  autoDoors: false,
  plan,
  emit,
};
