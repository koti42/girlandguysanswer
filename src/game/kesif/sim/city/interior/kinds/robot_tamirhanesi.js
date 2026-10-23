/*
 * KEŞİF interior/kinds/robot_tamirhanesi — ROBOT TAMİRHANESİ (Çıkrık, "Vida lazım mı?", mavi, ortam 'servo'). Sözleşme §8, design_city §7.2 #13. interiors_c.
 *
 * 3 varyant (it.variant): 0 Çift Bay (karşılama + iki tamir bayı; zeminde kalibrasyon halkaları)
 *                         1 Parça Pazarı (raf koridorları, şarj sırası, arkada kod kilitli depo)
 *                         2 Kalibrasyon (açık atölye + yanda mini_hack kilitli kalibrasyon odası)
 * Dost robotlar yalnız DEKOR: mini_robot / robot_kedi / robot_kol / şarj istasyonları (şiddet yok, saldırı yok). Boyut 14×12×5; kule çekirdeği arkadaysa `Dm`ye kadar.
 */
import { B } from '../../../blocks.js';
import { ID } from '../../cityEmit.js';
import { CPlan, mkPal, paintLayout } from '../cKit.js';

const KIND = 'robot_tamirhanesi';

const PALS = [
  mkPal('robot0', {
    floor: ID.FACADE_DARK, floor2: ID.YELLOW, wall: ID.WHITE, wall2: ID.BLUE, ceil: ID.WHITE, trim: ID.NEON_CYAN, glow: ID.NEON_CYAN, glow2: ID.NEON_LIME,
    cloth: B.CLOTH_BLUE, cloth2: B.CLOTH_WHITE, glass: B.GLASS_BLUE, lamp: 'panel',
  }),
  mkPal('robot1', {
    floor: ID.FACADE_DARK, floor2: ID.IRON, wall: ID.WHITE, wall2: ID.BLUE, ceil: ID.FACADE_LIGHT, trim: ID.NEON_CYAN, glow: ID.NEON_CYAN, glow2: ID.NEON_AMBER,
    cloth: B.CLOTH_BLUE, cloth2: B.CLOTH_YELLOW, glass: B.GLASS_BLUE, lamp: 'panel',
  }),
  mkPal('robot2', {
    floor: ID.BLACK, floor2: ID.FACADE_DARK, wall: ID.WHITE, wall2: ID.GREEN, ceil: ID.WHITE, trim: ID.NEON_LIME, glow: ID.NEON_LIME, glow2: ID.NEON_CYAN,
    cloth: B.CLOTH_GREEN, cloth2: B.CLOTH_WHITE, glass: B.GLASS_GREEN, lamp: 'panel',
  }),
];
const MOODS = [{ hue: 'mavi', light: 11 }, { hue: 'camgobegi', light: 11 }, { hue: 'yesil', light: 11 }];

/* ------------------------------------------------------------------------------------------------
 * Ortak parçalar
 * ---------------------------------------------------------------------------------------------- */
/** Zemin/duvar/tavan görünümü: koyu zemin + sarı-siyah çizgili bay işaretleri, açık-mavi panelli duvar, demir kirişli tavan. */
function look(p, rect, v) {
  const [u0, v0, u1, v1] = rect;
  p.op({ t: 'floor', rect, pat: 'checker', a: 'floor', b: v === 1 ? ID.BLACK : ID.FACADE_DARK, n: 2 });
  p.op({ t: 'ceil', rect, pat: 'solid', a: 'ceil' });
  // demir kirişler (tavanın hemen altı, uzunlamasına), aralarda beyaz ışık şeritleri
  for (let u = u0 + 1; u < u1 - 1; u += 4) p.op({ t: 'box', rect: [u, v0, u + 1, v1], y0: p.H - 1, y1: p.H, id: ID.IRON });
  p.liner({ pat: 'panels', n: 1, m: 4, a: 'wall2', b: 'wall', c: ID.WHITE });
}

function strips(p, u0, u1, v0, v1) {
  for (let u = u0 + 3; u < u1 - 1; u += 4) p.ceilStrip(u, v0 + 1, u + 1, v1 - 1, B.LIGHT_BLOCK);
}

/** Kalibrasyon halkası (zemin diski): merkez (cu, cv), yarıçap r. */
function pad(p, rect, cu, cv, r, ring) {
  p.op({
    t: 'floor', rect, pat: 'disc', a: ID.WHITE, b: ring || ID.BLUE, c: ID.WHITE, cu: cu + 0.5, cv: cv + 0.5, r,
  });
}

function front(p, F, o) {
  const { du, iu0, iu1 } = p;
  const cu = Math.max(iu0 + 3, Math.min(iu1 - 4, o && o.cu !== undefined ? o.cu : du));
  p.prop('servo_tezgahi', cu, F - 2, 2, { variant: 0 }) || p.near('servo_tezgahi', cu, F - 2, 2, null, 2);
  p.stand(cu, F - 1, 2, 1);
  p.signature(cu, F - 2, 1.1, 1);
  p.prop('robot_kedi', cu + 2, F - 2, 2, { variant: 1 });
  [iu0, iu1 - 1].forEach((u, i) => {
    p.prop('sarj_istasyonu', u, 1, i ? 3 : 1);
    p.prop('mini_robot', i ? u - 1 : u + 1, 1, i ? 3 : 1, { variant: i + 1 });
  });
  p.prop('otomat_enerji', iu1 - 1, 3, 3);
  p.wallProp('cerceve', du - 4, 0, 2, { variant: 2, y: 1.7 });
  p.wallProp('cerceve', du + 4, 0, 2, { variant: 6, y: 1.7 });
  p.wallProp('neon_tabela_ic', du, 0, 2, { y: 3.2, data: p.brandData('cirak_robot'), variant: 1 });
  p.prop('kablo_demeti', du + 3, 0, 0);
}

function bay(p, u0, v0, u1, v1, k) {
  const cu = (u0 + u1) >> 1;
  const cv = (v0 + v1) >> 1;
  p.prop('is_tezgahi', cu, v1 - 1, 2, { variant: k }) || p.near('is_tezgahi', cu, v1 - 1, 2, null, 2);
  p.prop('robot_kol', cu, v1 - 2, 2, { variant: 0 }) || p.near('robot_kol', cu, v1 - 3, 2, null, 2);
  p.prop('parca_rafi', u0, cv, 1, { variant: k }) || p.near('parca_rafi', u0, cv, 1, null, 2);
  p.prop('takim_dolabi', u1 - 1, cv, 3, { variant: 0 }) || p.near('takim_dolabi', u1 - 1, cv, 3, null, 2);
  p.wallProp('alet_duvari', u0 + 1, v1 - 1, 0, { y: 1.2 });
  p.prop('dolap_sirali', u1 - 1, v0 + 1, 3, { variant: k });
  p.prop('mini_robot', cu - 1, cv - 1, 0, { variant: k });
  p.prop('koli', u0, v0 + 1, 1, { variant: k });
  p.prop('sarj_istasyonu', u1 - 1, v1 - 1, 3);
}

/* ------------------------------------------------------------------------------------------------
 * V0: Çift Bay
 * ---------------------------------------------------------------------------------------------- */
function plan0(p) {
  const {
    H, iu0, iu1, iv1,
  } = p;
  const F = iv1 >= 10 ? 5 : 4;
  const hv0 = F + 1;
  const wA = (iu0 + iu1) >> 1;
  p.room('kabul', [iu0, 0, iu1, F], { role: 'giris' });
  p.room('bayA', [iu0, hv0, wA, iv1], { role: 'bay' });
  p.room('bayB', [wA + 1, hv0, iu1, iv1], { role: 'bay' });
  const cA = (iu0 + wA) >> 1;
  const cB = (wA + 1 + iu1) >> 1;
  p.door('gA', 'kabul', 'bayA', { axis: 'u', line: F, c: cA, w: 3, kind: 'arch' });
  p.door('gB', 'kabul', 'bayB', { axis: 'u', line: F, c: cB, w: 3, kind: 'arch' });
  look(p, [iu0, 0, iu1, iv1], 0);
  p.op({ t: 'floor', rect: [iu0, 0, iu1, F], pat: 'checker', a: ID.WHITE, b: ID.FACADE_LIGHT, n: 2 });
  p.op({ t: 'wall', axis: 'u', line: F, lo: iu0, hi: iu1, y0: 0, y1: H, pat: 'wains', n: 1, a: 'wall2', b: 'wall', c: ID.IRON });
  p.op({ t: 'wall', axis: 'v', line: wA, lo: hv0, hi: iv1, y0: 0, y1: H, pat: 'wains', n: 1, a: 'wall2', b: 'wall', c: ID.IRON });
  pad(p, [iu0, hv0, wA, iv1], cA, (hv0 + iv1) >> 1, 2.6, ID.BLUE);
  pad(p, [wA + 1, hv0, iu1, iv1], cB, (hv0 + iv1) >> 1, 2.6, ID.GREEN);
  p.accent(cA - 1, (hv0 + iv1) >> 1, cA + 2, ((hv0 + iv1) >> 1) + 1, -1, 0, ID.NEON_CYAN);
  strips(p, iu0, iu1, 0, iv1);
  p.wallStrip('l', 3, hv0, iv1, ID.NEON_CYAN);
  p.wallStrip('r', 3, hv0, iv1, ID.NEON_LIME);
  p.wallStrip('b', 3, iu0, iu1, ID.NEON_CYAN);
  front(p, F, { cu: wA });
  bay(p, iu0, hv0, wA, iv1, 0);
  bay(p, wA + 1, hv0, iu1, iv1, 1);
  p.lampGrid('kabul', ['panel'], 2);
  p.lampGrid('bayA', ['panel', 'neon_cyan'], 2);
  p.lampGrid('bayB', ['panel', 'neon_lime'], 2);
  p.topUp(26, ['mini_robot', 'koli', 'kablo_demeti'], ['cerceve', 'alet_duvari']);
  p.chip('oda', iu1 - 1, iv1 - 1, 0);
}

/* ------------------------------------------------------------------------------------------------
 * V1: Parça Pazarı — raf koridorları, şarj sırası, arkada kod kilitli depo
 * ---------------------------------------------------------------------------------------------- */
function plan1(p) {
  const {
    H, du, iu0, iu1, iv1,
  } = p;
  const hv = Math.max(6, iv1 - 4);
  p.room('dukkan', [iu0, 0, iu1, hv], { role: 'dukkan' });
  p.room('depo', [iu0, hv + 1, iu1, iv1], { role: 'depo' });
  const lock = p.makeKod('d', 1, 3);
  const cd = Math.min(iu1 - 2, Math.max(iu0 + 1, iu1 - 3));
  const gD = p.door('gD', 'dukkan', 'depo', {
    axis: 'u', line: hv, c: cd, w: 1, kind: 'door', lock,
  });
  look(p, [iu0, 0, iu1, iv1], 1);
  p.op({ t: 'wall', axis: 'u', line: hv, lo: iu0, hi: iu1, y0: 0, y1: H, pat: 'wains', n: 1, a: 'wall2', b: 'wall', c: ID.IRON });
  p.op({ t: 'floor', rect: [iu0, hv + 1, iu1, iv1], pat: 'hazard', a: 'floor', b: ID.YELLOW, n: 2 });
  strips(p, iu0, iu1, 0, iv1);
  p.wallStrip('l', 3, 0, iv1, ID.NEON_CYAN);
  p.wallStrip('r', 3, 0, iv1, ID.NEON_AMBER);
  p.wallStrip('b', 3, iu0, iu1, ID.NEON_CYAN);
  // tezgâh sağ önde, şarj sırası solda
  p.prop('servo_tezgahi', iu1 - 3, 2, 3, { variant: 1 }) || p.near('servo_tezgahi', iu1 - 3, 2, 3, null, 2);
  p.stand(iu1 - 1, 2, 3, 1);
  p.signature(iu1 - 3, 2, 1.1, 1);
  for (let k = 0; k < 3; k++) {
    p.prop('sarj_istasyonu', iu0, 1 + k * 2, 1);
    p.prop('mini_robot', iu0 + 1, 1 + k * 2, 1, { variant: k });
  }
  p.prop('robot_kedi', iu0 + 3, 2, 1, { variant: 2 });
  // raf koridorları
  for (let u = iu0 + 2; u <= iu1 - 2; u += 2) {
    if (u >= du - 1 && u <= du + 1) continue;
    p.prop('parca_rafi', u, 4, 2, { variant: (u >> 1) % 3 });
  }
  if (hv > 7) {
    for (let u = iu0 + 2; u <= iu1 - 2; u += 2) {
      if (u >= iu1 - 3) continue;
      p.prop('parca_rafi', u, hv - 1, 0, { variant: ((u >> 1) + 1) % 3 });
    }
  }
  p.prop('takim_dolabi', iu1 - 1, 5, 3, { variant: 0 });
  p.wallProp('alet_duvari', iu0, hv - 2, 3, { y: 1.2 });
  p.wallProp('neon_tabela_ic', du, 0, 2, { y: 3.2, data: p.brandData('cirak_robot'), variant: 0 });
  p.wallProp('cerceve', du - 4, 0, 2, { variant: 3, y: 1.7 });
  p.prop('otomat_enerji', iu1 - 1, 0, 3);
  // depo
  p.near('koli_yigini', iu0, iv1 - 1, 1, null, 1);
  p.near('koli_yigini', iu0 + 2, iv1 - 1, 0, null, 1);
  p.prop('koli', iu0, hv + 2, 1, { variant: 2 });
  p.prop('koli', iu0 + 1, hv + 2, 1, { variant: 1 });
  p.near('parca_rafi', iu1 - 3, iv1 - 1, 0, null, 1);
  p.near('robot_kol', iu1 - 2, hv + 2, 3, null, 1);
  p.guard(gD, lock, 'dukkan', [3, 1]);
  p.lampGrid('dukkan', ['panel', 'neon_cyan'], 4);
  p.lampGrid('depo', ['panel'], 2);
  p.topUp(26, ['mini_robot', 'koli', 'kablo_demeti'], ['cerceve', 'alet_duvari']);
  p.chip('depo', iu1 - 1, iv1 - 1, 0);
}

/* ------------------------------------------------------------------------------------------------
 * V2: Kalibrasyon — açık atölye + yanda mini_hack kilitli kalibrasyon odası
 * ---------------------------------------------------------------------------------------------- */
function plan2(p) {
  const {
    H, du, iu0, iu1, iv1,
  } = p;
  const sp = p.split(5);
  p.room('atolye', [sp.m0, 0, sp.m1, iv1], { role: 'atolye' });
  if (!sp.none) p.room('kalib', [sp.s0, 0, sp.s1, iv1], { role: 'lab' });
  const hack = p.makeHack('k', 2, 'simon');
  let gK = null;
  if (!sp.none) {
    gK = p.door('gK', sp.right ? 'atolye' : 'kalib', sp.right ? 'kalib' : 'atolye', {
      axis: 'v', line: sp.wl, c: Math.min(iv1 - 2, 4), w: 1, kind: 'door', lock: hack,
    });
  }
  look(p, [iu0, 0, iu1, iv1], 2);
  if (!sp.none) p.op({ t: 'wall', axis: 'v', line: sp.wl, lo: 0, hi: iv1, y0: 0, y1: H, pat: 'wains', n: 1, a: 'wall2', b: 'wall', c: ID.IRON });
  strips(p, iu0, iu1, 0, iv1);
  p.wallStrip('l', 3, 0, iv1, ID.NEON_LIME);
  p.wallStrip('r', 3, 0, iv1, ID.NEON_CYAN);
  p.wallStrip('b', 3, iu0, iu1, ID.NEON_LIME);
  const cu = (sp.m0 + sp.m1) >> 1;
  // atölye: orta tezgâh, tezgâh sırası
  const farL = sp.m0;
  const farR = sp.m1 - 1;
  p.prop('servo_tezgahi', cu, 5, 2, { variant: 0 }) || p.near('servo_tezgahi', cu, 5, 2, null, 2);
  p.stand(cu, 6, 2, 1);
  p.signature(cu, 5, 1.1, 1);
  p.prop('is_tezgahi', farL, 3, 1, { variant: 2 }) || p.near('is_tezgahi', farL, 3, 1, null, 2);
  p.prop('is_tezgahi', farR, 3, 3, { variant: 1 }) || p.near('is_tezgahi', farR, 3, 3, null, 2);
  p.prop('robot_kol', farL + 1, 3, 1, { variant: 0 });
  p.prop('robot_kol', farR - 1, iv1 - 2, 2, { variant: 0 });
  p.prop('parca_rafi', farL, iv1 - 2, 1, { variant: 1 });
  p.prop('parca_rafi', farR, iv1 - 4, 3, { variant: 2 });
  p.prop('takim_dolabi', cu - 2, iv1 - 1, 2, { variant: 0 });
  p.prop('dolap_sirali', cu + 2, iv1 - 1, 2, { variant: 2 });
  p.prop('sarj_istasyonu', farL, 7, 1);
  p.prop('mini_robot', farL + 1, 7, 1, { variant: 1 });
  p.prop('mini_robot', cu + 1, 8, 0, { variant: 2 });
  p.prop('robot_kedi', cu - 1, 8, 0, { variant: 0 });
  p.prop('otomat_enerji', farR, 1, 3);
  p.prop('kablo_demeti', cu + 3, 7, 0);
  p.wallProp('alet_duvari', farL, iv1 - 5, 3, { y: 1.2 });
  p.wallProp('neon_tabela_ic', du, 0, 2, { y: 3.2, data: p.brandData('cirak_robot'), variant: 2 });
  p.wallProp('cerceve', du - 4, 0, 2, { variant: 4, y: 1.7 });
  pad(p, [sp.m0, 0, sp.m1, iv1], cu, (iv1 + 5) >> 1, 2.6, ID.GREEN);
  p.lampGrid('atolye', ['panel', 'neon_lime'], 4);
  // kalibrasyon odası
  if (!sp.none) {
    const kc = (sp.s0 + sp.s1) >> 1;
    const kv = iv1 >> 1;
    p.op({ t: 'floor', rect: [sp.s0, 0, sp.s1, iv1], pat: 'checker', a: ID.WHITE, b: ID.FACADE_LIGHT, n: 1 });
    pad(p, [sp.s0, 0, sp.s1, iv1], kc, kv, 2.5, ID.BLUE);
    p.accent(kc, kv, kc + 1, kv + 1, -1, 0, ID.NEON_CYAN);
    p.prop('robot_kol', kc - 1, kv - 2, 0, { variant: 0 });
    p.prop('robot_kol', kc + 1, kv + 2, 2, { variant: 0 });
    p.prop('mini_robot', kc, kv - 1, 0, { variant: 1 });
    p.near('sarj_istasyonu', sp.right ? sp.s1 - 1 : sp.s0, 1, sp.right ? 3 : 1, null, 1);
    p.near('sarj_istasyonu', sp.right ? sp.s1 - 1 : sp.s0, iv1 - 2, sp.right ? 3 : 1, null, 1);
    p.wallProp('alet_duvari', sp.right ? sp.s1 - 1 : sp.s0, kv, sp.right ? 1 : 3, { y: 1.2 });
    p.guard(gK, hack, 'atolye');
    p.lampGrid('kalib', ['panel', 'neon_cyan'], 2);
    p.chip('kalib', sp.right ? sp.s1 - 1 : sp.s0, iv1 - 1, 0);
  } else p.chip('oda', iu1 - 1, iv1 - 1, 0);
  p.topUp(26, ['mini_robot', 'koli', 'kablo_demeti'], ['cerceve', 'alet_duvari']);
}

const PLANS = [plan0, plan1, plan2];

export const interior = {
  kind: KIND,
  name: 'Robot Tamirhanesi',
  footprint() {
    return { w: 14, d: 12, h: 5 };
  },
  palette(it) {
    return PALS[(it.variant | 0) % 3];
  },
  plan(lot, rng, variant, ctx) {
    const p = new CPlan(ctx, rng, variant);
    PLANS[variant % 3](p);
    return p.finish({ mood: MOODS[variant % 3] });
  },
  emit(W, interior, ctx) {
    paintLayout(ctx.kit, ctx.pal, interior.layout);
  },
};

export default interior;
