/*
 * KEŞİF sim/city/interior/kinds — 3 HACKER ODASI (design_city §7.2 #3: 10×9×4, bsp 2 oda; sunucu rafı, çok ekran, kablo; sahip Tuna, mavi/yeşil, fan).
 * 3 varyant (V = hash % 3). Her varyantta sunucu odasının kapısı KİLİTLİ (kilit çözümü kilidin arkasında değil, DAG):
 *   V0 «Kod Kilidi»      çalışma + sunucu; sunucu kapısı `kod` kademe 1 (4 hane 1–6), ipucu: çalışma odasındaki kod notu
 *   V1 «Çözme Terminali» çalışma + sunucu + depo; sunucu kapısı `mini_hack` kademe 1 (simon|levers|dice); depo serbest
 *   V2 «Gizli Raf»       çalışma + sunucu (kod, kademe 1) + GİZLİ oda (raf kapısı, `serbest`); gizli oda `hidden` olarak bildirilir
 * Kilit kimliği DIM_ID_RE uyumlu; Interior.locks = [{id,kind,tier,data,door,clue:{type,...}|null}].
 */
import { B } from '../../../blocks.js';
import { ID } from '../../cityEmit.js';
import { InteriorBuilder } from '../builder.js';
import {
  ensure, deferChip, deferPost, deferSignature, capKeys, against, againstTry, finishInterior, lockOf, mkPal, paintWalls, put, putTry, frameDoors, holoPanel, roomRects, topUp, usableRect, wallAt, twoPass,
} from '../furnishA.js';

const KIND = 'hacker_odasi';
const CORE = ['kod_notu', 'sunucu_rafi', 'cok_ekranli_masa', 'is_tezgahi', 'calisma_masasi', 'oyuncu_koltugu', 'raf_unitesi'];

const PALS = [
  mkPal('mavi', {
    floor: ID.FACADE_DARK, floor2: ID.BLACK, wall: ID.FACADE_DARK, wall2: ID.BLUE, ceil: ID.FACADE_DARK, trim: ID.NEON_CYAN, glow: ID.NEON_CYAN, glow2: ID.NEON_LIME, cloth: B.CLOTH_BLUE, cloth2: B.CLOTH_BLACK,
  }),
  mkPal('yesil', {
    floor: ID.BLACK, floor2: ID.FACADE_DARK, wall: ID.FACADE_DARK, wall2: ID.GREEN, ceil: ID.BLACK, trim: ID.NEON_LIME, glow: ID.NEON_LIME, glow2: ID.NEON_CYAN, cloth: B.CLOTH_GREEN, cloth2: B.CLOTH_BLACK,
  }),
  mkPal('mor', {
    floor: ID.BLACK, floor2: ID.PURPLE, wall: ID.FACADE_DARK, wall2: ID.PURPLE, ceil: ID.BLACK, trim: ID.NEON_PINK, glow: ID.NEON_CYAN, glow2: ID.NEON_PINK, cloth: B.CLOTH_PURPLE, cloth2: B.CLOTH_BLACK,
  }),
];
const MOODS = [{ hue: 'mavi', light: 8 }, { hue: 'yesil', light: 9 }, { hue: 'mor', light: 8 }];
const DECOR = ['koli', 'kablo_demeti', 'raf_unitesi', 'sandalye', 'is_tezgahi'];
const WALLDECOR = ['kod_notu', 'holo_ekran', 'holo_ekran'];

function footprint() {
  return { w: 10, d: 9, h: 4 };
}

function codeOf(rng) {
  return [1 + rng.i(6), 1 + rng.i(6), 1 + rng.i(6), 1 + rng.i(6)];
}

/** Çalışma odası: iki masa istasyonu + tezgâh + raf; (lo,hi) kapı yanı boşluğu dışında kalan duvar aralığı. */
function workroom(b, rng, room, opt) {
  const W = room.u1;
  const o = opt || {};
  // sol duvar: çok ekranlı masa + koltuk
  against(b, 'cok_ekranli_masa', room, 3, room.v0 + 1.75);
  put(b, 'oyuncu_koltugu', room.u0 + 2.0, room.v0 + 1.75, 3);
  put(b, 'oyun_bilgisayari', room.u0 + 0.5, room.v0 + 2.8, 1, { y: 0.875 });
  // sağ duvar: çalışma masası + sandalye
  against(b, 'calisma_masasi', room, 1, room.v0 + 1.5);
  put(b, 'sandalye', W - 2.1, room.v0 + 1.5, 1);
  // arka duvar solu: lehim tezgâhı + raf + kablolar
  if (!o.noBench) againstTry(b, 'is_tezgahi', room, 0, [2.0, 5.0, 7.0]);
  againstTry(b, 'raf_unitesi', room, 0, [5.0, 4.0, 3.0, 6.0, 7.0, 8.0]);
  putTry(b, 'kablo_demeti', [[1.5, room.v1 - 0.5], [3.5, room.v1 - 1.5]], 0);
  putTry(b, 'koli', [[W - 1.5, room.v1 - 0.5], [W - 0.5, room.v1 - 1.5], [W - 0.5, 2.5]], 2);
  wallAt(b, 'holo_ekran', room, 3, room.v0 + 0.8, { y: 1.4 });
  wallAt(b, 'holo_ekran', room, 1, room.v0 + 1.0, { y: 1.4 });
  wallAt(b, 'holo_ekran', room, 2, W - 1.0, { y: 1.5 });
}

function serverRoom(b, room, fromU) {
  const n = room.u1 - room.u0;
  for (let u = 0; u < n; u++) {
    if (u === 4 && n > 7) continue; // ortada servis boşluğu
    against(b, 'sunucu_rafi', room, 0, room.u0 + u + 0.5);
  }
  put(b, 'kablo_demeti', room.u0 + 1.5, room.v0 + 0.8, 0);
  put(b, 'koli', room.u1 - 1.5, room.v0 + 0.6, 0);
  wallAt(b, 'holo_ekran', room, 3, room.v0 + 1.5, { y: 1.4 });
  wallAt(b, 'holo_ekran', room, 1, room.v0 + 1.0, { y: 1.4 });
  return fromU;
}

function clueNote(b, room, lockIdx, side, along, y) {
  const r = wallAt(b, 'kod_notu', room, side, along, { y, data: lockIdx });
  return r;
}

/* ------------------------------------------------------------------------------------------------ V0 */
function planV0(b, rng, f, R, lot) {
  const W = R[2];
  const D = R[3];
  const vf = D >= 8 ? 5 : Math.max(3, D - 4);
  const cal = b.room('calisma', [0, 0, W, vf], { role: 'calisma' });
  const sun = b.room('sunucu', [0, vf + 1, W, D], { role: 'sunucu' });
  const cdoor = W - 2;
  const lock = lockOf(lot.id, 0, 'kod', 1, { code: codeOf(rng), digits: 4 });
  const d = b.door('dsunucu', 'calisma', 'sunucu', {
    axis: 'u', line: vf, c: cdoor, w: 1, kind: 'door', lock,
  });
  b.lockPad(d, 'a', 'kod');
  workroom(b, rng, cal);
  const note = clueNote(b, cal, 0, 3, vf - 1.0, 1.4);
  serverRoom(b, sun, 0);
  b.light('calisma', 2, 1, 'holo');
  b.light('calisma', W - 3, 1, 'neon_cyan');
  b.light('calisma', 4, vf - 1, 'holo');
  b.light('sunucu', 2, sun.v0, 'neon_lime');
  b.light('sunucu', W - 3, sun.v0, 'neon_lime');
  b.accent(1, vf + 2, W - 1, vf + 3, -1, 0, ID.NEON_LIME);
  b.accent(0, 0, 1, vf, f.H - 1, f.H, ID.NEON_CYAN);
  deferChip(b, sun, [W - 2, sun.v0 + 1], 0);
  deferSignature(b, ['is_tezgahi', 'calisma_masasi', 'cok_ekranli_masa'], cal, [2, vf - 1]);
  return {
    mood: MOODS[0],
    layout: { v: 0, W, D, vf, rooms: roomRects(b) },
    ownerPost: deferPost(b, cal, [5, 2], 1),
    locks: [Object.assign({}, lock, { door: 'dsunucu', clue: { type: 'prop', key: 'kod_notu', room: 'calisma', slot: note ? note.slot : -1 } })],
  };
}

/* ------------------------------------------------------------------------------------------------ V1 */
function planV1(b, rng, f, R, lot) {
  const W = R[2];
  const D = R[3];
  const vf = D >= 8 ? 5 : Math.max(3, D - 4);
  const dw = 3;
  const cal = b.room('calisma', [0, 0, W, vf], { role: 'calisma' });
  const sun = b.room('sunucu', [0, vf + 1, W - dw - 1, D], { role: 'sunucu' });
  const dep = b.room('depo', [W - dw, vf + 1, W, D], { role: 'depo' });
  const games = ['simon', 'levers', 'dice'];
  const lock = lockOf(lot.id, 0, 'mini_hack', 1, { game: games[rng.i(3)] });
  const d = b.door('dsunucu', 'calisma', 'sunucu', {
    axis: 'u', line: vf, c: 2, w: 1, kind: 'door', lock,
  });
  b.lockPad(d, 'a', 'mini_hack');
  b.door('ddepo', 'calisma', 'depo', {
    axis: 'u', line: vf, c: W - 2, w: 1, kind: 'door',
  });
  workroom(b, rng, cal, { noBench: true });
  againstTry(b, 'is_tezgahi', cal, 0, [5.5, 4.5, 3.5]);
  serverRoom(b, sun, 0);
  // depo: kolilar, raf, kablo (3×3, giriş önü boş)
  against(b, 'raf_unitesi', dep, 0, dep.u0 + 1.0);
  put(b, 'koli', dep.u1 - 0.5, dep.v1 - 0.5, 2);
  put(b, 'koli', dep.u1 - 0.5, dep.v1 - 1.5, 2);
  wallAt(b, 'holo_ekran', dep, 1, dep.v0 + 1.5, { y: 1.4 });
  b.light('calisma', 2, 1, 'neon_lime');
  b.light('calisma', W - 3, 1, 'neon_cyan');
  b.light('calisma', 4, vf - 1, 'holo');
  b.light('sunucu', 2, sun.v0, 'neon_lime');
  b.light('sunucu', sun.u1 - 2, sun.v0, 'holo');
  b.light('depo', dep.u0 + 1, dep.v0 + 1, 'holo');
  b.accent(1, vf + 2, W - 1, vf + 3, -1, 0, ID.NEON_LIME);
  b.accent(W - 1, 0, W, vf, f.H - 1, f.H, ID.NEON_LIME);
  deferChip(b, dep, [dep.u0 + 1, dep.v1 - 1], 0);
  deferSignature(b, ['is_tezgahi', 'calisma_masasi', 'cok_ekranli_masa'], cal, [2, vf - 1]);
  return {
    mood: MOODS[1],
    layout: { v: 1, W, D, vf, rooms: roomRects(b) },
    ownerPost: deferPost(b, cal, [5, 2], 1),
    locks: [Object.assign({}, lock, { door: 'dsunucu', clue: null })],
  };
}

/* ------------------------------------------------------------------------------------------------ V2 */
function planV2(b, rng, f, R, lot) {
  const W = R[2];
  const D = R[3];
  const vf = D >= 8 ? 5 : Math.max(3, D - 4);
  const gw = 5;
  const cal = b.room('calisma', [0, 0, W, vf], { role: 'calisma' });
  const sun = b.room('sunucu', [0, vf + 1, W - gw - 1, D], { role: 'sunucu' });
  const giz = b.room('gizli', [W - gw, vf + 1, W, D], { role: 'gizli' });
  const lock = lockOf(lot.id, 0, 'kod', 1, { code: codeOf(rng), digits: 4 });
  const d = b.door('dsunucu', 'calisma', 'sunucu', {
    axis: 'u', line: vf, c: 2, w: 1, kind: 'door', lock,
  });
  b.lockPad(d, 'a', 'kod');
  // gizli oda kapısı: raf (3 geniş), `serbest` kilit
  const hl = lockOf(lot.id, 1, 'serbest', 0, { hidden: true });
  const hc = W - 3;
  const hd = b.door('dgizli', 'calisma', 'gizli', {
    axis: 'u', line: vf, c: hc, w: 3, kind: 'door', prop: false, lock: hl,
  });
  const slot = b._slot++;
  hd.prop = 'gizli_kapi_raf';
  hd.propSlot = slot;
  b._props.push({
    kind: 'gizli_kapi_raf', x: hd.x + 0.5, y: hd.y, z: hd.z + 0.5, yaw: hd.axis === 'x' ? 0 : 1, variant: 0, lotId: lot.id, slot,
  });
  workroom(b, rng, cal, { noBench: true });
  againstTry(b, 'is_tezgahi', cal, 0, [5.0, 4.0, 2.0]);
  const note = clueNote(b, cal, 0, 3, vf - 1.0, 1.4);
  serverRoom(b, sun, 0);
  // gizli oda: gizli çalışma köşesi
  against(b, 'cok_ekranli_masa', giz, 0, giz.u0 + 2.5);
  put(b, 'oyuncu_koltugu', giz.u0 + 2.5, giz.v1 - 2.0, 0);
  put(b, 'koli', giz.u1 - 0.5, giz.v1 - 0.5, 2);
  put(b, 'kablo_demeti', giz.u0 + 0.8, giz.v1 - 0.8, 0);
  wallAt(b, 'holo_ekran', giz, 1, giz.v0 + 1.5, { y: 1.4 });
  b.light('calisma', 2, 1, 'holo');
  b.light('calisma', 6, 1, 'neon_pink');
  b.light('calisma', 4, vf - 1, 'holo');
  b.light('sunucu', 2, sun.v0, 'neon_cyan');
  b.light('gizli', giz.u0 + 2, giz.v0, 'neon_pink');
  b.accent(1, vf + 2, W - 1, vf + 3, -1, 0, ID.NEON_PINK);
  b.accent(0, 0, 1, vf, f.H - 1, f.H, ID.NEON_CYAN);
  deferChip(b, giz, [giz.u1 - 1, giz.v0 + 1], 0);
  deferSignature(b, ['is_tezgahi', 'calisma_masasi', 'cok_ekranli_masa'], cal, [2, vf - 1]);
  return {
    mood: MOODS[2],
    layout: { v: 2, W, D, vf, rooms: roomRects(b) },
    ownerPost: deferPost(b, cal, [5, 2], 1),
    hidden: { room: 'gizli', door: 'dgizli', lock: hl.id },
    locks: [
      Object.assign({}, lock, { door: 'dsunucu', clue: { type: 'prop', key: 'kod_notu', room: 'calisma', slot: note ? note.slot : -1 } }),
      Object.assign({}, hl, { door: 'dgizli', clue: null }),
    ],
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
  const R1 = b.rooms.filter((r) => r.role === 'calisma');
  ensure(b, rng, 'cok_ekranli_masa', R1.concat(b.rooms));
  ensure(b, rng, 'is_tezgahi', R1.concat(b.rooms));
  ensure(b, rng, 'sunucu_rafi', b.rooms.filter((r) => r.role === 'sunucu').concat(b.rooms));
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
    if (y === 0) return pal.floor2;
    if (y === h - 1) return pal.wall2;
    if (y === 2 && (u + v) % 4 === 0) return pal.wall2;
    return undefined;
  });
  const cal = rect('calisma');
  const sun = rect('sunucu');
  kit.floor(cal[0], cal[1], cal[2], cal[3], (u, v) => ((u + v) & 1 ? pal.floor : pal.floor2));
  kit.floor(sun[0], sun[1], sun[2], sun[3], (u, v) => (v === sun[1] + 1 ? pal.wall2 : (((u >> 1) + v) & 1 ? pal.floor2 : pal.floor)));
  // kablo yolu: çalışma odasında kapıdan sunucuya zemin çizgisi
  kit.floor(0, 0, 1, cal[3], pal.wall2);
  if (L.v === 1) {
    const dep = rect('depo');
    kit.floor(dep[0], dep[1], dep[2], dep[3], pal.cloth2);
  } else if (L.v === 2) {
    const g = rect('gizli');
    kit.floor(g[0], g[1], g[2], g[3], pal.cloth);
  }
  // sunucu odası: cam bölme (çalışma odasından görünür), sunucu duvarında cam pencere
  const sv = sun[1] - 1;
  if (L.W - 6 > 5) holoPanel(kit, 4, L.vf, L.W - 6, L.vf + 1, 1, 3);
  kit.window(sun[2] - 3, sv, sun[2] - 1, sv + 1, 1, 3, pal.glass);
  frameDoors(kit, interior, pal, { frame: pal.wall2 });
}

export default {
  kind: KIND,
  name: 'Kod Odası',
  footprint,
  palette: (it) => PALS[(it.variant | 0) % 3],
  autoDoors: false,
  plan,
  emit,
};
