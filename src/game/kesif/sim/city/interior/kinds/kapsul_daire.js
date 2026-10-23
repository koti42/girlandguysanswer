/*
 * KEŞİF sim/city/interior/kinds — 1 KAPSÜL DAİRE (design_city §7.2 #1: 8×6×4, hücre; yatak kapsülü, mini mutfak, duş; sahip Nehir Abla, mor, vent).
 * 3 varyant (V = hash % 3), her biri ayrı kat planı + palet + ışık:
 *   V0 «Klasik Kapsül»   ön oturma/mutfak + arka uyku kovuğu (3 geniş kemer), mor/pembe
 *   V1 «Hat Kapsülü»     sığ giriş koridoru + uyku odası + ayrı duş odası, camgöbeği/beyaz steril
 *   V2 «Güverte»         ön oturma odası + yarım plaka yükseltili uyku güvertesi, sıcak ahşap
 * Ayak izi 8×6 (ya da 6×8 döndürülmüş); kule çekirdeği taşarsa arka kırpılır. Her oda ≤4 ışık; aksanlar ≤40 hücre.
 */
import { B } from '../../../blocks.js';
import { ID } from '../../cityEmit.js';
import { InteriorBuilder } from '../builder.js';
import {
  deferChip, deferPost, deferSignature, capKeys, putTry, against, againstTry, ensure, finishInterior, mkPal, paintWalls, put, frameDoors, roomRects, topUp, usableRect, wallAt, twoPass,
} from '../furnishA.js';

const KIND = 'kapsul_daire';
const CORE = ['kapsul_yatak', 'dus_kabini', 'mutfak_tezgahi', 'buzdolabi', 'katlanir_masa', 'holo_ekran'];
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const PALS = [
  mkPal('mor', {
    floor: ID.BLACK, floor2: ID.PURPLE, wall: ID.FACADE_DARK, wall2: ID.PURPLE, ceil: ID.BLACK, trim: ID.NEON_PINK, glow: ID.NEON_PINK, glow2: ID.NEON_CYAN, cloth: B.CLOTH_PURPLE, cloth2: B.CLOTH_BLACK,
  }),
  mkPal('camgobegi', {
    floor: ID.WHITE, floor2: ID.POLISHED, wall: B.CALCITE, wall2: ID.FACADE_LIGHT, ceil: ID.WHITE, trim: ID.NEON_CYAN, glow: ID.NEON_CYAN, glow2: ID.NEON_LIME, cloth: B.CLOTH_BLUE, cloth2: B.CLOTH_WHITE,
  }),
  mkPal('sicak', {
    floor: B.PLANKS_OAK, floor2: B.PLANKS_BIRCH, wall: B.PLANKS_BIRCH, wall2: B.PLANKS_ACACIA, ceil: B.PLANKS_OAK, trim: B.PLANKS_ACACIA, glow: ID.NEON_AMBER, glow2: ID.NEON_PINK, cloth: B.CLOTH_ORANGE, cloth2: B.CLOTH_RED,
  }),
];
const MOODS = [{ hue: 'mor', light: 9 }, { hue: 'camgobegi', light: 11 }, { hue: 'sicak', light: 10 }];

const DECOR = ['cerceve', 'saksi_buyuk', 'ayakli_lamba', 'mini_robot', 'raf_unitesi', 'dolap'];
const WALLDECOR = ['cerceve', 'cerceve', 'kod_notu', 'posta_kutusu', 'holo_ekran'];

function footprint() {
  return { w: 8, d: 6, h: 4 };
}

/* ------------------------------------------------------------------------------------------------ V0 */
function planV0(b, rng, f, R) {
  const W = R[2];
  const D = R[3];
  const du = f.door.u;
  const vh = D >= 7 ? 4 : 3;
  const yasam = b.room('yasam', [0, 0, W, vh], { role: 'yasam' });
  const uyku = b.room('uyku', [0, vh + 1, W, D], { role: 'uyku' });
  const cc = clamp(du, 2, W - 3);
  b.door('d0', 'yasam', 'uyku', {
    axis: 'u', line: vh, c: cc, w: 3, kind: 'arch',
  });
  // öncelik: uyku kapsülü (kapı kemerine göre sol ya da sağ duvar) ve duş
  const mid0 = (uyku.v0 + uyku.v1) / 2;
  if (!against(b, 'kapsul_yatak', uyku, 3, mid0)) against(b, 'kapsul_yatak', uyku, 1, mid0);
  againstTry(b, 'dus_kabini', uyku, 0, [W - 1.5, 1.5, W - 2.5, 2.5, 3.5, W - 3.5]);
  // yaşam: mutfak solda, masa sağda
  against(b, 'mutfak_tezgahi', yasam, 3, 1.0);
  against(b, 'buzdolabi', yasam, 0, 0.5);
  against(b, 'katlanir_masa', yasam, 1, 1.5);
  put(b, 'tabure', W - 2.0, 1.0, 1);
  put(b, 'tabure', W - 2.0, 2.0, 1);
  wallAt(b, 'holo_ekran', yasam, 2, W - 1.0, { y: 1.0 });
  wallAt(b, 'posta_kutusu', yasam, 2, 1.5, { y: 1.0 });
  wallAt(b, 'cerceve', yasam, 0, W - 1.5, { y: 1.25 });
  wallAt(b, 'kod_notu', yasam, 3, vh - 0.5, { y: 1.25 });
  wallAt(b, 'cerceve', yasam, 3, 1.5, { y: 1.5, variant: 2 });
  const mr = put(b, 'mini_robot', W - 2.4, vh - 0.5, 2);
  // uyku: lamba, dolap
  againstTry(b, 'ayakli_lamba', uyku, 0, [2.75, W - 3.0, 3.5]);
  againstTry(b, 'dolap', uyku, 0, [W - 0.5, 0.5, W - 1.5]);
  wallAt(b, 'holo_ekran', uyku, 0, 1.5, { y: 1.75 });
  wallAt(b, 'cerceve', uyku, 1, uyku.v0 + 0.5, { y: 1.25 });
  // ışık, aksan
  b.light('yasam', 1, 1, 'lantern');
  b.light('yasam', W - 2, vh - 1, 'lantern');
  b.light('uyku', 1, uyku.v0, 'neon_pink');
  b.light('uyku', W - 2, uyku.v0, 'holo');
  b.accent(0, D - 1, W, D, f.H - 1, f.H, ID.NEON_PINK);
  deferChip(b, uyku, [3, uyku.v0], 0);
  deferSignature(b, ['katlanir_masa', 'mutfak_tezgahi'], uyku, [3, uyku.v0]);
  return {
    mood: MOODS[0], layout: { v: 0, vh, W, D, rooms: roomRects(b) }, ownerPost: deferPost(b, yasam, [1, vh - 1], 0), mr,
  };
}

/* ------------------------------------------------------------------------------------------------ V1 */
function planV1(b, rng, f, R) {
  const W = R[2];
  const D = R[3];
  const dusW = 3;
  const hall = b.room('koridor', [0, 0, W, 2], { role: 'koridor' });
  const uyku = b.room('uyku', [0, 3, W - dusW - 1, D], { role: 'uyku' });
  const dus = b.room('dus', [W - dusW, 3, W, D], { role: 'dus' });
  b.door('d0', 'koridor', 'uyku', { axis: 'u', line: 2, c: clamp(W - dusW - 2, 1, W - dusW - 2), w: 1, kind: 'door' });
  b.door('d1', 'koridor', 'dus', { axis: 'u', line: 2, c: W - 2, w: 1, kind: 'door' });
  // öncelik: kapsül ve duş
  const cap = put(b, 'kapsul_yatak', 0.75, D - 1.25, 0);
  against(b, 'dus_kabini', dus, 0, W - 1.5);
  // koridor: mutfak ön duvarda, buzdolabı arka duvarda
  againstTry(b, 'mutfak_tezgahi', hall, 2, [1.0, W - 1.0]);
  againstTry(b, 'buzdolabi', hall, 0, [0.5, W - 0.5]);
  wallAt(b, 'holo_ekran', hall, 2, W - 1.0, { y: 1.0 });
  wallAt(b, 'posta_kutusu', hall, 2, 2.5, { y: 1.0 });
  wallAt(b, 'cerceve', hall, 0, 1.5, { y: 1.5 });
  wallAt(b, 'kod_notu', hall, 3, 0.5, { y: 1.25 });
  // uyku: masa arka duvarda
  against(b, 'katlanir_masa', uyku, 0, uyku.u1 - 1.25);
  put(b, 'tabure', uyku.u1 - 1.5, D - 1.9, 0);
  against(b, 'raf_unitesi', uyku, 3, uyku.v0 + 1.0, { y: 0 });
  wallAt(b, 'cerceve', uyku, 0, 2.5, { y: 1.75 });
  wallAt(b, 'holo_ekran', uyku, 1, uyku.v0 + 1.5, { y: 1.0 });
  // duş
  against(b, 'saksi_buyuk', dus, 1, D - 0.5);
  wallAt(b, 'cerceve', dus, 1, 4.5, { y: 1.5 });
  b.light('koridor', 1, 0, 'neon_cyan');
  b.light('koridor', W - 2, 0, 'neon_cyan');
  b.light('uyku', 1, 4, 'panel');
  b.light('dus', W - 2, 4, 'holo');
  b.accent(1, 0, W - 1, 1, f.H - 1, f.H, ID.NEON_CYAN);
  deferChip(b, uyku, [uyku.u1 - 1, uyku.v0], 0);
  deferSignature(b, ['katlanir_masa', 'mutfak_tezgahi'], uyku, [3, D - 1]);
  return {
    mood: MOODS[1], layout: { v: 1, W, D, rooms: roomRects(b) }, ownerPost: deferPost(b, hall, [2, 1], 1), cap,
  };
}

/* ------------------------------------------------------------------------------------------------ V2 */
function planV2(b, rng, f, R) {
  const W = R[2];
  const D = R[3];
  const du = f.door.u;
  const vh = D >= 7 ? 4 : 3;
  const deck = f.H >= 4;
  const yasam = b.room('yasam', [0, 0, W, vh], { role: 'yasam' });
  const guverte = b.room('guverte', [0, vh + 1, W, D], { role: 'uyku' });
  b.door('d0', 'yasam', 'guverte', {
    axis: 'u', line: vh, c: clamp(du, 2, W - 3), w: 3, kind: 'arch',
  });
  const dy = deck ? 0.5 : 0;
  // öncelik: güvertede kapsül (kısa kenar boyunca) ve duş
  const midg = (guverte.v0 + guverte.v1) / 2;
  const cap = against(b, 'kapsul_yatak', guverte, 3, midg, { y: dy }) || against(b, 'kapsul_yatak', guverte, 1, midg, { y: dy });
  putTry(b, 'dus_kabini', [[1.5, vh - 0.5], [W - 1.5, vh - 0.5], [W - 2.5, vh - 0.5], [2.5, vh - 0.5]], 2);
  // yaşam: mutfak sağda, masa solda (V0'ın aynası)
  against(b, 'mutfak_tezgahi', yasam, 1, 1.0);
  against(b, 'buzdolabi', yasam, 0, W - 0.5);
  against(b, 'katlanir_masa', yasam, 3, 1.5);
  put(b, 'tabure', 2.0, 1.0, 3);
  put(b, 'tabure', 2.0, 2.0, 3);
  wallAt(b, 'holo_ekran', yasam, 2, 1.0, { y: 1.0 });
  wallAt(b, 'cerceve', yasam, 2, W - 1.5, { y: 1.25 });
  wallAt(b, 'kod_notu', yasam, 1, vh - 0.5, { y: 1.25 });
  wallAt(b, 'posta_kutusu', yasam, 2, W - 2.5, { y: 1.0 });
  put(b, 'saksi_buyuk', W - 1.5, vh - 0.5, 2);
  const cu = (W / 2) | 0;
  against(b, 'raf_unitesi', guverte, 3, guverte.v0 + 1.0, { y: dy });
  against(b, 'dolap', guverte, 1, guverte.v0 + 0.5, { y: dy });
  wallAt(b, 'cerceve', guverte, 0, 1.5, { y: 1.75 });
  wallAt(b, 'holo_ekran', guverte, 0, W - 2.0, { y: 1.75 });
  b.light('yasam', 1, 1, 'lantern');
  b.light('yasam', W - 2, 1, 'lantern');
  b.light('guverte', 1, guverte.v0, 'lantern');
  b.light('guverte', W - 2, guverte.v0, 'lantern');
  b.accent(0, D - 1, W, D, f.H - 1, f.H, ID.NEON_AMBER);
  deferChip(b, guverte, [cu - 1, guverte.v0], 0);
  deferSignature(b, ['katlanir_masa', 'mutfak_tezgahi'], guverte, [cu - 2, guverte.v0 + 1]);
  return {
    mood: MOODS[2], layout: { v: 2, vh, W, D, deck, rooms: roomRects(b) }, ownerPost: deferPost(b, yasam, [W - 2, vh - 1], 3), cap,
  };
}

const PLANS = [planV0, planV1, planV2];

function build(ctx, lot, rng, variant, guard) {
  const gctx = guard ? ctx : Object.assign({}, ctx, { guard: false });
  const b = new InteriorBuilder(gctx);
  capKeys(b, 10, 38, CORE);
  const f = ctx.frame;
  const R = usableRect(f);
  const V = variant % 3;
  const res = PLANS[V](b, rng, f, R);
  const sleepRooms = b.rooms.filter((r) => r.role === 'uyku');
  const yOf = (r) => (V === 2 && f.H >= 4 && r.role === 'uyku' ? { y: 0.5 } : undefined);
  ensure(b, rng, 'kapsul_yatak', sleepRooms.concat(b.rooms), yOf(sleepRooms[0] || b.rooms[0]));
  ensure(b, rng, 'dus_kabini', b.rooms);
  ensure(b, rng, 'mutfak_tezgahi', b.rooms.filter((r) => r.role !== 'dus' && r.role !== 'uyku').concat(b.rooms));
  ensure(b, rng, 'katlanir_masa', b.rooms.filter((r) => r.role !== 'dus'));
  topUp(b, rng, b.rooms.filter((r) => r.role !== 'dus'), DECOR, 20, WALLDECOR);
  const o = { mood: res.mood, layout: res.layout, ownerPost: res.ownerPost, locks: [] };
  return finishInterior(b, Object.assign(o, { core: CORE }));
}

/* ------------------------------------------------------------------------------------------------ yayım */
function plan(lot, rng, variant, ctx) {
  return twoPass(ctx, rng, (r, g) => build(ctx, lot, r, variant, g));
}

function emit(W, interior, ctx) {
  const { kit, frame: f, pal } = ctx;
  const L = interior.layout;
  if (!L) return;
  const H = f.H;
  const rs = L.rooms;
  const rect = (id) => rs.find((r) => r[6] === id);
  const V = L.v;
  const W0 = L.W;
  // bölme duvarları: süpürgelik + üst bant
  paintWalls(kit, interior, (u, v, y, h) => {
    if (y === 0) return pal.wall2;
    if (y === h - 1) return pal.wall2;
    return undefined;
  });
  if (V === 0) {
    const y = rect('yasam');
    const k = rect('uyku');
    kit.floor(y[0], y[1], y[2], y[3], (u, v) => ((((u >> 1) + (v >> 1)) & 1) ? pal.floor : pal.floor2));
    kit.floor(k[0], k[1], k[2], k[3], pal.cloth);
    kit.floor(k[0], k[1], k[2], k[1] + 1, pal.cloth2);
    kit.floor(0, 0, 1, y[3], pal.cloth2);
  } else if (V === 1) {
    const h = rect('koridor');
    const k = rect('uyku');
    const d = rect('dus');
    kit.floor(h[0], h[1], h[2], h[3], (u, v) => ((u + v) & 1 ? pal.floor : pal.floor2));
    kit.floor(k[0], k[1], k[2], k[3], pal.cloth);
    kit.floor(d[0], d[1], d[2], d[3], (u, v) => (((u + v) & 1) ? B.GLASS_BLUE : pal.floor2));
    // koridor-oda bölmesi: göz hizasında cam bant (arkadaki kapsül/duş camdan görünür)
    kit.window(1, h[3], W0 - 1, h[3] + 1, 1, 3, pal.glass);
  } else {
    const y = rect('yasam');
    const g = rect('guverte');
    kit.floor(y[0], y[1], y[2], y[3], pal.floor);
    kit.floor(2, 1, y[2] - 2, y[3] - 1, pal.cloth);
    kit.floor(3, 1, y[2] - 3, 2, pal.cloth2);
    if (L.deck) kit.box(g[0], g[1], g[2], g[3], 0, 1, B.SLAB_BIRCH);
    else kit.floor(g[0], g[1], g[2], g[3], pal.cloth);
  }
  // kolon: kapı karşısı tavan kirişi
  if (H >= 4) {
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      kit.trimBand([r[0], r[1], r[2], r[3]], H - 1, pal.wall2);
    }
  }
  frameDoors(kit, interior, pal, { archFrame: pal.wall2, frame: pal.wall2 });
}

export default {
  kind: KIND,
  name: 'Kapsül Daire',
  footprint,
  palette: (it) => PALS[(it.variant | 0) % 3],
  autoDoors: false,
  plan,
  emit,
};


