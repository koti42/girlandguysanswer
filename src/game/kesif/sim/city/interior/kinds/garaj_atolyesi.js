/*
 * KEŞİF sim/city/interior/kinds — 7. GARAJ ATÖLYESİ (Usta Cengiz, "Her cıvata bir hikâye."; turuncu/endüstriyel, ortam: pnömatik; imza: araç boyası).
 * Rezerv 20×16×6 (kapı çizgisine göre 20×16 ya da 16×20). Üç varyant (V = parsel hash % 3):
 *   V0 "Servis Hattı"  : ön karşılama holü + KİLİTLİ parça deposu (Rün Dizisi) + 3 bölmeli atölye (2 lift + park yeri) ve rulo kapı
 *   V1 "Boyahane"      : geniş ön atölye (lift + park yerleri) + arkada cam cepheli KİLİTLİ boyahane (Renk Kolları) + ofis
 *   V2 "Yarış Hangarı" : yüksek tavanlı hangar (lift/park yerleri) + yan şeritte ofis ve KİLİTLİ depo (Zar Mantığı), mavi/çelik
 * Araç bölmeleri: `anchors` type:'park_slot' (Faz 3: park yeri; {bay}), lift üstünde sergilenen 'arac_govdesi' (dekor). Sahip: ownerPost + type:'owner'.
 * Her interior: ≥24 prop, oda başına ≤4 ışık, aksan ≤120 hücre; kilit = kapı arkası ödül odası (çip), ipucu gerekmez (mini oyun).
 */
import { ID } from '../../cityEmit.js';
import { B } from '../../../blocks.js';
import { BuilderB, Deco, pickStrip } from '../kindKitB.js';
import { PALETTES } from '../kit.js';

const KIND = 'garaj_atolyesi';
const BAY_W = 4;
const BAY_D = 5;

const P = (o) => Object.freeze(o);
const PAL = [
  P(Object.assign({}, PALETTES.turuncu, {
    floor: ID.FACADE_DARK, floor2: ID.IRON, wall: ID.FACADE_LIGHT, wall2: ID.ORANGE, ceil: ID.FACADE_DARK, trim: ID.NEON_AMBER, glow: ID.NEON_AMBER, glow2: ID.NEON_CYAN, lamp: 'lantern',
  })),
  P(Object.assign({}, PALETTES.turuncu, {
    floor: ID.FACADE_DARK, floor2: ID.WHITE, wall: ID.WHITE, wall2: ID.YELLOW, ceil: ID.FACADE_LIGHT, trim: ID.NEON_AMBER, glow: ID.NEON_AMBER, glow2: ID.NEON_PINK, lamp: 'panel', glass: B.GLASS_BLUE,
  })),
  P(Object.assign({}, PALETTES.turuncu, {
    floor: ID.BLACK, floor2: ID.IRON, wall: ID.FACADE_DARK, wall2: ID.BLUE, ceil: ID.BLACK, trim: ID.NEON_CYAN, glow: ID.NEON_CYAN, glow2: ID.NEON_AMBER, lamp: 'neon_cyan', glass: B.GLASS_BLUE,
  })),
];

const KEEP = ['arac_lifti', 'arac_govdesi', 'otomat_enerji', 'ilan_panosu', 'is_tezgahi'];
const PAD = ['koli', 'koli_yigini', 'kablo_demeti', 'takim_dolabi', 'parca_rafi'];
const GAMES = ['simon', 'levers', 'dice'];

/** Bölme ızgarası: rect içinde BAY_W×BAY_D bölmeler (en çok cap). */
function bayGrid(rect, cap) {
  const [u0, v0, u1, v1] = rect;
  const cols = Math.max(1, Math.floor((u1 - u0) / BAY_W));
  const rows = Math.max(1, Math.floor((v1 - v0) / BAY_D));
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (out.length >= cap) break;
      const bu = u0 + c * BAY_W;
      const bv = v0 + r * BAY_D;
      if (bu + BAY_W > u1 || bv + BAY_D > v1) continue;
      out.push({ u0: bu, v0: bv, u1: bu + BAY_W, v1: bv + BAY_D });
    }
  }
  return out;
}

function placeBays(b, bays, lifts, variant) {
  const placed = [];
  bays.forEach((bay, i) => {
    if (b.coreAt([bay.u0, bay.v0, bay.u1, bay.v1])) return;
    if (i < lifts) {
      const l = b.place('arac_lifti', bay.u0 + 1, bay.v0 + 1, 0, { du: 0, dv: 0 });
      if (!l) return;
      b.place('arac_govdesi', bay.u0 + 1, bay.v0 + 1, i & 1 ? 0 : 2, { y: 1, variant: (variant + i) & 3, du: 0, dv: 0 });
      placed.push({ type: 'lift', rect: [bay.u0 + b.ou, bay.v0, bay.u1 + b.ou, bay.v1] });
    } else {
      b.anchor('park_slot', bay.u0 + 1, bay.v0 + 2, 0, 0, { bay: i });
      placed.push({ type: 'park', rect: [bay.u0 + b.ou, bay.v0, bay.u1 + b.ou, bay.v1] });
    }
  });
  return placed;
}

/** Arka duvar boyunca tezgâh/dolap dizisi + duvar aletleri. */
function backBenches(b, u0, u1, v1, variant) {
  const seq = ['is_tezgahi', 'takim_dolabi', 'is_tezgahi', 'servo_tezgahi', 'takim_dolabi'];
  let u = u0;
  for (let i = 0; i < seq.length && u < u1 - 1; i++) {
    const r = b.atBack(seq[i], u, v1 - 1, { variant: (variant + i) % 3 });
    u += r ? (seq[i] === 'takim_dolabi' ? 1 : seq[i] === 'servo_tezgahi' ? 3 : 2) : 1;
  }
  for (let i = 0; i < 3 && u0 + i * 3 + 2 <= u1; i++) b.wall('alet_duvari', u0 + i * 3 + 1, v1 - 1, 0, { span: 2, y: 1 });
}

function planV0(b, ctx, rng) {
  const W = b.uw;
  const D = b.ud;
  const H = b.H;
  const du = b.edu;
  const hd = 5;
  const pw = 6;
  const flip = rng.chance(0.5);
  const pr = flip ? [W - pw, hd + 1, W, D] : [0, hd + 1, pw, D];
  const ar = flip ? [0, hd + 1, W - pw - 1, D] : [pw + 1, hd + 1, W, D];
  b.room('hol', [0, 0, W, hd], { role: 'giris' });
  b.room('parca', pr, { role: 'depo' });
  b.room('atolye', ar, { role: 'atolye' });
  const ac = Math.max(ar[0] + 1, Math.min(ar[2] - 2, du));
  b.door('d_at', 'hol', 'atolye', {
    axis: 'u', line: hd, c: ac, w: 3, kind: 'arch',
  });
  const pc = pr[0] + 2;
  b.lockedDoor('d_parca', 'hol', 'parca', {
    axis: 'u', line: hd, c: pc, w: 1,
  }, { kind: 'mini_hack', tier: 0, data: { game: GAMES[0] } });
  b.layout = { v: 0, rooms: { hol: b.rr('hol'), parca: b.rr('parca'), atolye: b.rr('atolye') }, flip };

  // --- karşılama holü: tezgâh kapıdan uzak yarıda
  const side = du < W / 2 ? 1 : -1;
  const cu = side > 0 ? Math.min(W - 4, du + 3) : Math.max(1, du - 4);
  b.put('is_tezgahi', cu, 2, 2, { variant: 1 });
  b.post(cu, 3, 2, 'hol');
  b.signature(cu, 2, 1.0);
  const wing = side > 0 ? 0 : W - 1;
  b.atFront('otomat_enerji', wing, 0);
  b.atFront('otomat_atistirmalik', side > 0 ? 1 : W - 2, 0);
  b.put('dolap_sirali', side > 0 ? W - 1 : 0, 2, side > 0 ? 3 : 1, { flush: side > 0 ? 1 : 3, variant: 0 });
  b.atBack('koli_yigini', side > 0 ? 3 : W - 5, hd - 1, { variant: 1 });
  b.atBack('sarj_istasyonu', side > 0 ? 6 : W - 7, hd - 1);
  b.put('kablo_demeti', side > 0 ? 8 : W - 9, 2, 0, {});
  b.put('koli', side > 0 ? W - 2 : 1, hd - 1, 0, { flush: 0, variant: 2 });
  b.wall('ilan_panosu', side > 0 ? du - 4 : du + 4, 0, 2, { span: 2 });

  // --- atölye
  const bays = bayGrid([ar[0], ar[1] + 2, ar[2], ar[3] - 3], 4);
  b.layout.bays = placeBays(b, bays, Math.min(2, bays.length - 1), ctx.variant);
  backBenches(b, ar[0], ar[2], ar[3], ctx.variant);
  b.atRight('robot_kol', ar[2] - 1, ar[1] + 2, { flush: 1 });
  b.put('kablo_demeti', ar[0] + 1, ar[1] + 1, 0, {});
  b.put('koli', ar[2] - 2, ar[3] - 4, 0, { variant: 0 });
  b.put('koli', ar[2] - 2, ar[3] - 5, 0, { variant: 1 });
  b.atLeft('dolap_sirali', flip ? ar[0] : ar[0], ar[3] - 6, { variant: 2 });
  // --- parça deposu
  const ph = pr[3] - pr[1];
  for (let i = 0; i + 2 <= ph - 2; i += 2) {
    b.put('parca_rafi', pr[0], pr[1] + 1 + i, flip ? 3 : 1, { flush: flip ? 1 : 3, variant: i % 3 });
    b.put('parca_rafi', pr[2] - 1, pr[1] + 1 + i, flip ? 1 : 3, { flush: flip ? 3 : 1, variant: (i + 1) % 3 });
  }
  b.atBack('koli_yigini', pr[0] + 2, pr[3] - 1, { variant: 0 });
  b.atBack('koli', pr[0] + 1, pr[3] - 1, { variant: 1 });
  b.atBack('koli', pr[0] + 4, pr[3] - 1, { variant: 2 });
  b.chip('oda', pr[0] + 3, pr[3] - 3, 0);
  // --- ışık
  b.lamp('hol', 2, 2, 'panel');
  b.lamp('hol', W - 3, 2, 'panel');
  b.lightGrid('atolye', 3, 'lantern');
  b.lamp('atolye', ac, ar[1] + 3, 'neon_amber');
  b.lamp('parca', pr[0] + 2, pr[1] + 3, 'lantern');
  b.accent(ar[0] + 1, ar[1] + 2, ar[0] + 2, ar[3] - 1, H - 1, H, ID.NEON_AMBER);
  b.accent(ar[2] - 2, ar[1] + 2, ar[2] - 1, ar[3] - 1, H - 1, H, ID.NEON_AMBER);
  b.accent(2, hd - 1, W - 2, hd, H - 1, H, ID.NEON_AMBER);
  b.pad(PAD, 30, rng);
  b.trim(38, KEEP);
}

function planV1(b, ctx, rng) {
  const W = b.uw;
  const D = b.ud;
  const H = b.H;
  const du = b.edu;
  const flip = rng.chance(0.5);
  const ad = D - 8;
  const bw = 8;
  const boya = flip ? [W - bw, D - 7, W, D] : [0, D - 7, bw, D];
  const ofis = flip ? [0, D - 7, W - bw - 1, D] : [bw + 1, D - 7, W, D];
  const at = [0, 0, W, ad];
  b.room('atolye', at, { role: 'atolye' });
  b.room('boya', boya, { role: 'boyahane' });
  b.room('ofis', ofis, { role: 'ofis' });
  const oc = (ofis[0] + ofis[2]) >> 1;
  b.door('d_ofis', 'atolye', 'ofis', {
    axis: 'u', line: ad, c: oc, w: 1, kind: 'door',
  });
  const bc = boya[0] + 3;
  b.lockedDoor('d_boya', 'atolye', 'boya', {
    axis: 'u', line: ad, c: bc, w: 1,
  }, { kind: 'mini_hack', tier: 1, data: { game: GAMES[1] } });
  b.layout = { v: 1, rooms: { atolye: b.rr('atolye'), boya: b.rr('boya'), ofis: b.rr('ofis') }, flip };
  // atölye: bölmeler + yanlar
  const bays = bayGrid([1, 2, W - 1, ad], 4);
  b.layout.bays = placeBays(b, bays, Math.min(2, bays.length - 1), ctx.variant);
  b.atLeft('dolap_sirali', 0, ad - 3, { variant: 1 });
  b.atRight('takim_dolabi', W - 1, ad - 2);
  b.atRight('is_tezgahi', W - 1, 2, { variant: 2 });
  b.atLeft('is_tezgahi', 0, 2, { variant: 0 });
  const dside = du < W / 2 ? W - 3 : 2;
  b.atFront('otomat_enerji', dside, 0);
  b.atFront('sarj_istasyonu', dside + (du < W / 2 ? -2 : 2), 0);
  b.wall('alet_duvari', 1, ad - 1, 0, { span: 2, y: 1 });
  b.wall('alet_duvari', W - 3, ad - 1, 0, { span: 2, y: 1 });
  b.wall('ilan_panosu', du < W / 2 ? du + 4 : du - 4, 0, 2, { span: 2 });
  b.put('koli_yigini', W - 2, ad - 2, 0, { variant: 2 });
  b.put('kablo_demeti', 3, 1, 0, {});
  b.put('robot_kol', ofis[0], ofis[1], 0, {});
  b.atLeft('koli', 0, ad - 5, { variant: 1 });
  // ofis
  b.atBack('is_tezgahi', ofis[0] + 1, ofis[3] - 1, { variant: 1 });
  b.post(ofis[0] + 2, ofis[3] - 2, 2, 'ofis');
  b.signature(ofis[0] + 1, ofis[3] - 1, 1.0);
  b.atBack('dolap_sirali', ofis[2] - 3, ofis[3] - 1, { variant: 2 });
  b.atFront('otomat_atistirmalik', ofis[2] - 1, ofis[1]);
  b.atBack('koli_yigini', ofis[0] + 4, ofis[3] - 1, { variant: 0 });
  b.wall('ilan_panosu', ofis[0] + 2, ofis[1], 2, { span: 2 });
  // boyahane
  b.atBack('parca_rafi', boya[0] + 1, boya[3] - 1, { variant: 1 });
  b.atBack('koli', boya[2] - 2, boya[3] - 1, {});
  b.atLeft('takim_dolabi', boya[0], boya[1] + 2);
  b.atRight('takim_dolabi', boya[2] - 1, boya[1] + 2);
  b.atRight('robot_kol', boya[2] - 1, boya[1] + 4, { flush: 1 });
  b.chip('oda', boya[0] + 4, boya[3] - 2, 0);
  // ışık
  b.lightGrid('atolye', 4, 'panel');
  b.lamp('ofis', oc, ofis[1] + 2, 'lantern');
  b.lamp('boya', boya[0] + 3, boya[1] + 3, 'neon_cyan');
  b.accent(1, 1, W - 1, 2, H - 1, H, ID.NEON_AMBER);
  b.accent(boya[0], boya[1], boya[2], boya[1] + 1, H - 1, H, ID.NEON_CYAN);
  b.pad(PAD, 30, rng);
  b.trim(38, KEEP);
}

function planV2(b, ctx, rng) {
  const W = b.uw;
  const D = b.ud;
  const H = b.H;
  const du = b.edu;
  const { right, sw } = pickStrip(W, du, 6);
  const hang = right ? [0, 0, W - sw - 1, D] : [sw + 1, 0, W, D];
  const strip = right ? [W - sw, 0, W, D] : [0, 0, sw, D];
  const hdo = (D >> 1) - 1;
  const ofis = [strip[0], 0, strip[2], hdo];
  const depo = [strip[0], hdo + 1, strip[2], D];
  b.room('hangar', hang, { role: 'atolye' });
  b.room('ofis', ofis, { role: 'ofis' });
  b.room('depo', depo, { role: 'depo' });
  const lineU = right ? W - sw - 1 : sw;
  b.door('d_ofis', 'hangar', 'ofis', {
    axis: 'v', line: lineU, c: 2, w: 1, kind: 'door',
  });
  b.lockedDoor('d_depo', 'ofis', 'depo', {
    axis: 'u', line: hdo, c: strip[0] + 2, w: 1,
  }, { kind: 'mini_hack', tier: 2, data: { game: GAMES[2] } });
  b.layout = { v: 2, rooms: { hangar: b.rr('hangar'), ofis: b.rr('ofis'), depo: b.rr('depo') }, right };
  rng.i(2);
  // hangar: iki lift + park
  const bays = bayGrid([hang[0] + 1, 2, hang[2] - 1, D - 2], 4);
  b.layout.bays = placeBays(b, bays, Math.min(2, bays.length - 1), ctx.variant);
  const lw = right ? 0 : hang[0];
  const rw = right ? hang[2] - 1 : W - 1;
  b.atLeft('dolap_sirali', lw, 1, { variant: 0 });
  b.atLeft('dolap_sirali', lw, D - 3, { variant: 1 });
  b.atRight('is_tezgahi', rw, 2, { variant: 2 });
  b.atRight('is_tezgahi', rw, D - 3, { variant: 0 });
  backBenches(b, hang[0] + 1, hang[2] - 1, D, ctx.variant);
  b.put('robot_kol', rw, D >> 1, 3, { flush: 1 });
  b.put('koli_yigini', lw, D >> 1, 1, { flush: 3 });
  b.put('koli', lw, (D >> 1) + 2, 1, { flush: 3, variant: 1 });
  b.put('kablo_demeti', hang[0] + 2, 1, 0, {});
  b.atFront('otomat_enerji', right ? hang[2] - 1 : hang[0], 0);
  b.wall('ilan_panosu', du + (right ? 4 : -4), 0, 2, { span: 2 });
  // ofis
  const oc = ofis[0] + 2;
  b.atBack('is_tezgahi', ofis[0] + 1, ofis[3] - 1, { variant: 1 });
  b.post(ofis[0] + 2, ofis[3] - 2, 2, 'ofis');
  b.signature(ofis[0] + 1, ofis[3] - 1, 1.0);
  b.atFront('otomat_atistirmalik', ofis[2] - 1, ofis[1]);
  b.atRight('sarj_istasyonu', ofis[2] - 1, ofis[1] + 2);
  b.wall('ilan_panosu', right ? ofis[2] - 1 : ofis[0], ofis[1] + 3, right ? 1 : 3, { span: 2 });
  // depo
  for (let i = 0; i + 2 <= depo[3] - depo[1] - 2; i += 2) b.put('parca_rafi', depo[0], depo[1] + 1 + i, 1, { flush: 3, variant: i % 3 });
  b.atBack('koli_yigini', depo[2] - 3, depo[3] - 1, { variant: 1 });
  b.atBack('koli', depo[2] - 1, depo[3] - 1, {});
  b.atRight('koli', depo[2] - 1, depo[1] + 1, { flush: 1 });
  b.chip('oda', depo[2] - 2, depo[1] + 2, 0);
  // ışık
  b.lightGrid('hangar', 4, 'lantern');
  b.lamp('ofis', oc + 1, ofis[1] + 2, 'panel');
  b.lamp('depo', depo[0] + 3, depo[1] + 3, 'neon_cyan');
  b.accent(hang[0] + 1, 2, hang[0] + 2, D - 2, H - 1, H, ID.NEON_CYAN);
  b.accent(hang[2] - 2, 2, hang[2] - 1, D - 2, H - 1, H, ID.NEON_CYAN);
  b.pad(PAD, 30, rng);
  b.trim(38, KEEP);
}

/* ------------------------------------------------------------------------------------------------
 * Yayım
 * ---------------------------------------------------------------------------------------------- */
const rectsOf = (L) => Object.keys(L.rooms).map((k) => L.rooms[k]);
const checker = (r, a, c) => (u, v) => ((((u - r[0]) >> 1) + ((v - r[1]) >> 1)) & 1 ? a : c);

function floorPattern(kit, pal, L, f) {
  kit.floor(0, 0, f.W, f.D, (u, v) => (((u + 1) % 5 === 0 || (v + 1) % 5 === 0) ? pal.floor2 : pal.floor));
  const R = L.rooms;
  if (L.v === 0) {
    kit.floor(R.hol[0], R.hol[1], R.hol[2], R.hol[3], checker(R.hol, ID.FACADE_LIGHT, ID.WHITE));
    kit.floor(R.parca[0], R.parca[1], R.parca[2], R.parca[3], (u, v) => (((u + v) & 1) ? ID.IRON : ID.FACADE_DARK));
  } else if (L.v === 1) {
    kit.floor(R.boya[0], R.boya[1], R.boya[2], R.boya[3], (u, v) => (((u + v) & 1) ? ID.WHITE : ID.FACADE_LIGHT));
    kit.floor(R.ofis[0], R.ofis[1], R.ofis[2], R.ofis[3], checker(R.ofis, B.PLANKS_OAK, B.PLANKS_ACACIA));
  } else {
    kit.floor(R.ofis[0], R.ofis[1], R.ofis[2], R.ofis[3], checker(R.ofis, ID.FACADE_LIGHT, ID.WHITE));
    kit.floor(R.depo[0], R.depo[1], R.depo[2], R.depo[3], (u, v) => (((u + v) & 1) ? ID.IRON : ID.FACADE_DARK));
  }
  (L.bays || []).forEach((bay) => {
    const r = bay.rect;
    kit.floor(r[0], r[1], r[2], r[3], (u, v) => {
      const edge = u === r[0] || u === r[2] - 1 || v === r[1] || v === r[3] - 1;
      if (bay.type === 'lift' && u < r[0] + 3 && v < r[1] + 3) return ((u + v) & 1) ? ID.YELLOW : ID.BLACK;
      return edge ? (bay.type === 'lift' ? pal.wall2 : ID.YELLOW) : undefined;
    });
  });
}

function wallStyle(deco, pal, f, rect) {
  const H = f.H;
  deco.ring(rect, 0, H, (side, t, y) => {
    if (y === 0) return ID.IRON; // tekmelik
    if (y === H - 1) return pal.wall2;
    if (y === H - 2) return ID.FACADE_DARK;
    if ((t & 3) === 3 && y < H - 2) return ID.IRON;
    return undefined;
  });
}

function ceilingBeams(kit, f, rect, alongU) {
  const [u0, v0, u1, v1] = rect;
  const y = f.H - 1;
  if (alongU) for (let v = v0 + 1; v < v1; v += 4) kit.box(u0, v, u1, v + 1, y, y + 1, ID.IRON);
  else for (let u = u0 + 1; u < u1; u += 4) kit.box(u, v0, u + 1, v1, y, y + 1, ID.IRON);
}

function emit(W, interior, ctx) {
  const { kit, pal, frame: f } = ctx;
  const L = interior.layout;
  const deco = new Deco(kit, f);
  const H = f.H;
  floorPattern(kit, pal, L, f);
  rectsOf(L).forEach((r) => wallStyle(deco, pal, f, r));
  if (L.v === 0) {
    const ar = L.rooms.atolye;
    ceilingBeams(kit, f, ar, true);
    const bk = ar[3];
    const du0 = ar[0] + 2;
    const du1 = ar[2] - 2;
    deco.ring([du0, ar[1], du1, bk], 0, 4, (side, t, y, u) => {
      if (side !== 0 || u < du0 || u >= du1) return undefined;
      return y === 3 ? ID.YELLOW : (y & 1 ? ID.IRON : ID.FACADE_DARK);
    });
    deco.ring(ar, H - 3, H - 2, (side) => (side === 0 ? pal.glass : undefined));
  } else if (L.v === 1) {
    ceilingBeams(kit, f, L.rooms.atolye, false);
    const by = L.rooms.boya;
    for (let u = by[0] + 1; u < by[2] - 1; u++) kit.box(u, by[1] - 1, u + 1, by[1], 1, 3, pal.glass);
    kit.ceiling(by[0], by[1], by[2], by[3], (u, v) => ((u + v) & 1 ? ID.WHITE : ID.FACADE_LIGHT));
    deco.ring(by, 1, H - 1, (side, t, y) => (y < 2 ? ID.BLUE : ID.WHITE));
  } else {
    const hg = L.rooms.hangar;
    ceilingBeams(kit, f, hg, false);
    deco.ring(hg, 1, 4, (side, t) => ((t % 6) < 3 ? pal.wall2 : undefined));
    deco.ring(hg, H - 3, H - 2, (side) => (side === 0 || side === 1 || side === 3 ? pal.glass : undefined));
  }
}

const impl = {
  kind: KIND,
  name: 'Garaj Atölyesi',
  footprint(variant) {
    return { w: 20, d: 16, h: variant === 2 ? 7 : 6 };
  },
  palette(it) {
    return PAL[(it.variant | 0) % 3];
  },
  plan(lot, rng, variant, ctx) {
    const b = new BuilderB(ctx);
    if (variant === 0) planV0(b, ctx, rng);
    else if (variant === 1) planV1(b, ctx, rng);
    else planV2(b, ctx, rng);
    return b.build();
  },
  emit,
};

export default impl;
