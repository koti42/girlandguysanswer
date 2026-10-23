/*
 * KEŞİF interior/kinds/sanat_studyosu — SANAT STÜDYOSU (Piraye, "Duvar tuvaldir.", renkli, ortam 'firca'). Sözleşme §8, design_city §7.2 #12. interiors_c.
 *
 * 3 varyant (it.variant): 0 Atölye + Galeri (şövaleler, çalışma masaları; yan galeri tuvaller ve heykellerle)
 *                         1 Heykel Atölyesi (ortada yükseltilmiş kürsü, köşede dinlenme alanı; kod kilitli malzeme deposu)
 *                         2 Gizli Oda (atölye + arkada `gizli_kapi_raf` ile gizlenmiş sergi odası)
 * Boyut 16×12×6 (ya da 12×16); kule çekirdeği arkadaysa `Dm`ye kadar. Duvar/zemin boya lekeli, parlak (beyaz tavan şeritleri). Her oda ≤4 ışık.
 */
import { B } from '../../../blocks.js';
import { ID } from '../../cityEmit.js';
import { CPlan, mkPal, paintLayout } from '../cKit.js';

const KIND = 'sanat_studyosu';

const PALS = [
  mkPal('sanat0', {
    floor: B.PLANKS_BIRCH, floor2: B.PLANKS_OAK, wall: ID.WHITE, wall2: ID.BLUE, ceil: ID.WHITE, trim: ID.NEON_PINK, glow: ID.NEON_PINK, glow2: ID.NEON_CYAN,
    cloth: B.CLOTH_YELLOW, cloth2: B.CLOTH_RED, glass: B.GLASS, lamp: 'panel',
  }),
  mkPal('sanat1', {
    floor: B.PLANKS_ACACIA, floor2: B.PLANKS_PINE, wall: ID.WHITE, wall2: ID.ORANGE, ceil: ID.WHITE, trim: ID.NEON_AMBER, glow: ID.NEON_AMBER, glow2: ID.NEON_PINK,
    cloth: B.CLOTH_ORANGE, cloth2: B.CLOTH_GREEN, glass: B.GLASS_ORANGE, lamp: 'panel',
  }),
  mkPal('sanat2', {
    floor: B.PLANKS_OAK, floor2: B.PLANKS_BIRCH, wall: ID.WHITE, wall2: ID.PURPLE, ceil: ID.WHITE, trim: ID.NEON_PINK, glow: ID.NEON_PINK, glow2: ID.NEON_LIME,
    cloth: B.CLOTH_PURPLE, cloth2: B.CLOTH_PURPLE, glass: B.GLASS_PURPLE, lamp: 'panel',
  }),
];
const MOODS = [{ hue: 'renkli', light: 12 }, { hue: 'turuncu', light: 12 }, { hue: 'pembe', light: 12 }];

/* ------------------------------------------------------------------------------------------------
 * Ortak parçalar
 * ---------------------------------------------------------------------------------------------- */
function paints(v) {
  const base = [ID.RED, ID.BLUE, ID.YELLOW, ID.GREEN, ID.ORANGE, ID.PURPLE];
  return [base[(v * 2) % 6], base[(v * 2 + 1) % 6], base[(v * 2 + 3) % 6], base[(v * 2 + 5) % 6]];
}

/** Boya lekeli duvar kaplaması (liner) + istenen bölme duvarları; zemin: tahta şeritler + leke; tavan: beyaz. */
function look(p, rect, wallOps) {
  const cols = paints(p.v);
  p.op({ t: 'floor', rect, pat: 'stripeV', a: 'floor', b: 'floor2', n: 1 });
  cols.forEach((c, i) => p.op({
    t: 'floor', rect, pat: 'speckle', a: null, b: c, s: 5 + i * 13, pct: 3,
  }));
  p.op({ t: 'ceil', rect, pat: 'solid', a: 'ceil' });
  const dress = (base) => {
    p.op(Object.assign({ pat: 'solid', a: 'wall', y0: 0, y1: p.H }, base, { t: 'wall' }));
    cols.forEach((c, i) => p.op(Object.assign({ pat: 'speckle', a: null, b: c, s: 17 + i * 9, pct: 5, y0: 0, y1: p.H }, base, { t: 'wall' })));
  };
  [p.iu0 > 0 ? { axis: 'v', line: p.iu0 - 1, lo: 0, hi: p.iv1 + 1 } : null,
    p.iu1 < p.W ? { axis: 'v', line: p.iu1, lo: 0, hi: p.iv1 + 1 } : null,
    p.iv1 < p.Dm ? { axis: 'u', line: p.iv1, lo: p.iu0, hi: p.iu1 } : null].forEach((b) => { if (b) dress(b); });
  (wallOps || []).forEach((b) => dress(b));
}

function lightsArt(p, roomId, n) {
  p.lampGrid(roomId, ['panel'], n);
}

function ceilingStrips(p, u0, u1, v0, v1, step) {
  for (let v = v0; v < v1; v += step) p.ceilStrip(u0, v, u1, v + 1, B.LIGHT_BLOCK);
}

/** Atölye donanımı: şövaleler, çalışma masaları, boya rafları, mankenler, tuvaller. rect: [u0,v0,u1,v1] oda iç dikdörtgeni. */
function atelier(p, room, rect, o) {
  const [u0, v0, u1, v1] = rect;
  const cu = (u0 + u1) >> 1;
  const stands = o && o.owner;
  // şövaleler (3)
  p.prop('sovale', cu - 3, v0 + 5, 2, { variant: 0 }) || p.near('sovale', cu - 3, v0 + 5, 2, null, 2);
  p.prop('sovale', cu + 2, v0 + 6, 3, { variant: 1 }) || p.near('sovale', cu + 2, v0 + 6, 3, null, 2);
  p.prop('sovale', cu - 1, v0 + 8, 2, { variant: 2 }) || p.near('sovale', cu - 1, v0 + 8, 2, null, 2);
  p.prop('tabure', cu - 3, v0 + 7, 1, { variant: 1 });
  p.prop('tabure', cu + 3, v0 + 8, 3, { variant: 2 });
  p.prop('hali', cu - 2, v0 + 6, 0, { variant: 4 });
  // çalışma masaları
  p.prop('is_tezgahi', u0 + 1, v0 + 3, 1, { variant: 0 }) || p.near('is_tezgahi', u0 + 1, v0 + 3, 1, null, 2);
  p.prop('is_tezgahi', u1 - 2, v1 - 2, 2, { variant: 1 }) || p.near('is_tezgahi', u1 - 2, v1 - 2, 2, null, 2);
  p.prop('boya_rafi', u0, v0 + 6, 1, { variant: 0 });
  p.prop('boya_rafi', u1 - 1, v0 + 6, 3, { variant: 1 });
  p.prop('manken', u1 - 1, v0 + 3, 3, { variant: 1 });
  p.prop('manken', u0, v1 - 2, 1, { variant: 3 });
  p.prop('raf_unitesi', u0, v0 + 9, 1, { variant: 2 }) || p.near('raf_unitesi', u0, v0 + 9, 1, null, 1);
  p.prop('saksi_buyuk', u1 - 1, v0 + 1, 3, { variant: 1 }) || p.near('saksi_buyuk', u1 - 1, v0 + 1, 3, null, 1);
  p.prop('saksi_buyuk', u0, v0 + 1, 1, { variant: 3 });
  // duvar tuvalleri
  const side = [[u0, v0 + 5, 3], [u0, v0 + 8, 3], [u1 - 1, v0 + 8, 1], [cu - 2, v1 - 1, 0], [cu + 2, v1 - 1, 0]];
  let n = 0;
  side.forEach((c) => { if (p.wallProp('tuval', c[0], c[1], c[2], { variant: p.rng.i(8), y: 1.6 })) n++; });
  p.wallProp('cerceve', u1 - 1, v0 + 5, 1, { variant: p.rng.i(8), y: 1.7 });
  p.prop('asili_lamba', cu - 3, v0 + 6, 0, { variant: 0 });
  p.prop('asili_lamba', cu + 3, v0 + 6, 0, { variant: 1 });
  void room;
  void stands;
  return n;
}

function ownerSpot(p, u, v, ly, sigU, sigV) {
  p.stand(u, v, ly, 2);
  p.signature(sigU === undefined ? u : sigU, sigV === undefined ? v : sigV, 1.0, 2);
}

/* ------------------------------------------------------------------------------------------------
 * V0: Atölye + Galeri
 * ---------------------------------------------------------------------------------------------- */
function plan0(p) {
  const { iu0, iu1, iv1 } = p;
  const sp = p.split(5);
  p.room('atolye', [sp.m0, 0, sp.m1, iv1], { role: 'atolye' });
  p.room('galeri', [sp.s0, 0, sp.s1, iv1], { role: 'galeri' });
  const dv = Math.min(iv1 - 3, 6);
  p.door('gG', sp.right ? 'atolye' : 'galeri', sp.right ? 'galeri' : 'atolye', {
    axis: 'v', line: sp.wl, c: dv, w: 3, kind: 'arch',
  });
  look(p, [iu0, 0, iu1, iv1], [{ axis: 'v', line: sp.wl, lo: 0, hi: iv1 }]);
  p.liner({ pat: 'wains', n: 1, a: 'wall2', b: null, c: null });
  ceilingStrips(p, sp.m0 + 1, sp.m1 - 1, 2, iv1 - 1, 4);
  ceilingStrips(p, sp.s0 + 1, sp.s1 - 1, 3, iv1 - 1, 4);
  const n = atelier(p, 'atolye', [sp.m0, 0, sp.m1, iv1]);
  ownerSpot(p, (sp.m0 + sp.m1) >> 1, 3, 1, sp.m0 + 1, 3);
  // galeri
  const gcu = (sp.s0 + sp.s1) >> 1;
  const gl = sp.right ? sp.s0 : sp.s1 - 1;
  const gr = sp.right ? sp.s1 - 1 : sp.s0;
  const lyIn = sp.right ? 1 : 3;
  const lyOut = sp.right ? 3 : 1;
  for (let v = 2; v < iv1 - 1; v += 3) {
    p.wallProp('tuval', gr, v, lyOut, { variant: p.rng.i(8), y: 1.6 });
    if (v !== dv - 1 && v !== dv && v !== dv + 1 && Math.abs(v - dv) > 2) p.wallProp('tuval', gl, v, lyIn, { variant: p.rng.i(8), y: 1.6 });
  }
  // heykeller kürsüde (beyaz beton blok + heykel)
  [[gcu, 3], [gcu, 7]].forEach((c, i) => {
    if (c[1] >= iv1 - 1) return;
    p.op({
      t: 'box', rect: [c[0], c[1], c[0] + 1, c[1] + 1], y0: 0, y1: 1, id: i ? ID.PURPLE : ID.WHITE,
    });
    p.reserve([c[0], c[1], c[0] + 1, c[1] + 1], 0, 1);
    p.prop('heykel', c[0], c[1], 2, { variant: i, y: 1 });
  });
  p.prop('vitrin', gcu, iv1 - 1, 2, { variant: 1 }) || p.near('vitrin', gcu, iv1 - 1, 2, null, 2);
  p.prop('hali', gcu, 5, 0, { variant: 5 });
  p.prop('tabure', gcu + (sp.right ? 1 : -1), 5, 0, { variant: 0 });
  p.prop('saksi_buyuk', gr, 1, lyOut, { variant: 2 }) || p.near('saksi_buyuk', gr, 1, lyOut, null, 1);
  p.wallProp('neon_tabela_ic', p.du, 0, 2, { y: 3.4, data: p.brandData('duvar_tuval'), variant: 2 });
  lightsArt(p, 'atolye', 4);
  lightsArt(p, 'galeri', 2);
  p.topUp(26, ['saksi_buyuk', 'tabure'], ['tuval', 'cerceve']);
  p.chip('oda', sp.right ? sp.s1 - 2 : sp.s0 + 1, iv1 - 2, 0);
  void n;
}

/* ------------------------------------------------------------------------------------------------
 * V1: Heykel Atölyesi — ortada kürsü, köşede dinlenme, kod kilitli malzeme deposu
 * ---------------------------------------------------------------------------------------------- */
function plan1(p) {
  const { iu0, iu1, iv1 } = p;
  const sp = p.split(4);
  p.room('salon', [sp.m0, 0, sp.m1, iv1], { role: 'atolye' });
  p.room('depo', [sp.s0, 0, sp.s1, iv1], { role: 'depo' });
  const lock = p.makeKod('d', 1, 3);
  const dv = Math.min(iv1 - 2, 4);
  const gD = p.door('gD', sp.right ? 'salon' : 'depo', sp.right ? 'depo' : 'salon', {
    axis: 'v', line: sp.wl, c: dv, w: 1, kind: 'door', lock,
  });
  look(p, [iu0, 0, iu1, iv1], [{ axis: 'v', line: sp.wl, lo: 0, hi: iv1 }]);
  p.liner({ pat: 'wains', n: 1, a: 'wall2', b: null, c: null });
  ceilingStrips(p, sp.m0 + 1, sp.m1 - 1, 2, iv1 - 1, 3);
  const cu = (sp.m0 + sp.m1) >> 1;
  const cv = Math.max(5, iv1 >> 1);
  // ortadaki kürsü: 6×4 yarım yükseklik (plaka) + üstte 3 heykel
  const dw = Math.min(3, (sp.m1 - sp.m0 - 4) >> 1);
  const d0 = cu - dw;
  const d1 = cu + dw;
  p.op({
    t: 'raise', rect: [d0, cv - 2, d1, cv + 2], h2: 1, slab: B.SLAB_BIRCH,
  });
  p.reserve([d0, cv - 2, d1, cv + 2], 0, 0.5);
  p.accent(d0, cv - 2, d1, cv - 1, -1, 0, ID.NEON_AMBER);
  [[d0 + 1, cv - 1], [cu, cv], [d1 - 2, cv + 1]].forEach((c, i) => p.prop('heykel', c[0], c[1], 2, { variant: i, y: 0.5 }));
  p.prop('asili_lamba', cu, cv, 0, { variant: 2 });
  // atölye: tezgâhlar, raflar
  p.prop('is_tezgahi', sp.m0, 3, 1, { variant: 0 }) || p.near('is_tezgahi', sp.m0, 3, 1, null, 2);
  p.prop('is_tezgahi', sp.m1 - 1, 3, 3, { variant: 1 }) || p.near('is_tezgahi', sp.m1 - 1, 3, 3, null, 2);
  p.prop('is_tezgahi', cu, iv1 - 1, 2, { variant: 2 }) || p.near('is_tezgahi', cu, iv1 - 1, 2, null, 2);
  p.prop('raf_unitesi', sp.m0, iv1 - 2, 1, { variant: 1 });
  p.prop('boya_rafi', sp.m1 - 1, iv1 - 2, 3, { variant: 2 });
  p.prop('sovale', cu + dw + 1, cv + 1, 2, { variant: 3 }) || p.near('sovale', sp.m1 - 3, cv, 2, null, 2);
  p.prop('manken', sp.m0, cv, 1, { variant: 2 });
  // dinlenme köşesi
  p.prop('yatak', sp.m0 + 2, iv1 - 4, 1, { variant: 2 }) || p.near('yatak', sp.m0 + 2, iv1 - 4, 1, null, 2);
  p.prop('ayakli_lamba', sp.m0, iv1 - 4, 1, { variant: 1 });
  p.prop('saksi_buyuk', sp.m1 - 1, 1, 3, { variant: 1 }) || p.near('saksi_buyuk', sp.m1 - 1, 1, 3, null, 1);
  p.prop('tabure', cu - 2, cv + 3, 1, { variant: 2 });
  [[sp.m0, cv - 3, 3], [sp.m1 - 1, cv - 2, 1], [sp.m1 - 1, iv1 - 3, 1], [cu - 3, iv1 - 1, 0], [cu + 3, iv1 - 1, 0]].forEach((c) => {
    p.wallProp('tuval', c[0], c[1], c[2], { variant: p.rng.i(8), y: 1.6 });
  });
  p.wallProp('neon_tabela_ic', p.du, 0, 2, { y: 3.4, data: p.brandData('duvar_tuval'), variant: 1 });
  ownerSpot(p, cu - 2, 3, 0, cu - 2, 3);
  // depo
  const bl = sp.right ? sp.s0 : sp.s1 - 1;
  const br = sp.right ? sp.s1 - 1 : sp.s0;
  const lyIn = sp.right ? 1 : 3;
  const lyOut = sp.right ? 3 : 1;
  p.near('raf_unitesi', bl, 2, lyIn, null, 1);
  p.near('raf_unitesi', br, 5, lyOut, null, 1);
  p.prop('boya_rafi', bl, 8, lyIn, { variant: 1 }) || p.near('boya_rafi', bl, 8, lyIn, null, 2);
  p.prop('koli', br, iv1 - 2, lyOut, { variant: 1 });
  p.prop('koli_yigini', bl, iv1 - 2, lyIn, { variant: 2 }) || p.near('koli_yigini', bl, iv1 - 2, lyIn, null, 2);
  p.wallProp('tuval', br, 8, lyOut, { variant: 3, y: 1.6 });
  p.guard(gD, lock, 'salon', sp.right ? [1, 0] : [3, 0]);
  lightsArt(p, 'salon', 4);
  lightsArt(p, 'depo', 1);
  p.topUp(26, ['saksi_buyuk', 'tabure'], ['tuval', 'cerceve']);
  p.chip('depo', br, iv1 - 1, 0);
}

/* ------------------------------------------------------------------------------------------------
 * V2: Gizli Oda — atölye + arkada gizli_kapi_raf ile saklı sergi odası
 * ---------------------------------------------------------------------------------------------- */
function plan2(p) {
  const { iu0, iu1, iv1 } = p;
  const hv = Math.max(6, iv1 - 5);
  const cx = (iu0 + iu1) >> 1;
  const gw = Math.min(4, ((iu1 - iu0) >> 1) - 1);
  p.room('atolye', [iu0, 0, iu1, hv], { role: 'atolye' });
  p.room('gizli', [cx - gw, hv + 1, cx + gw, iv1], { role: 'gizli' });
  const hl = { id: `k${(p.ctx.lot.id >>> 0).toString(36)}h`, kind: 'serbest', tier: 0, data: { hidden: true } };
  const gG = p.door('gG', 'atolye', 'gizli', {
    axis: 'u', line: hv, c: cx, w: 3, kind: 'door', prop: false, lock: hl,
  });
  p.doorProp(gG, 'gizli_kapi_raf', { variant: 0 });
  p.locks.push({
    id: hl.id, kind: 'serbest', tier: 0, data: hl.data, door: 'gG', clue: null, pad: -1,
  });
  look(p, [iu0, 0, iu1, iv1], [{ axis: 'u', line: hv, lo: iu0, hi: iu1 }]);
  p.liner({ pat: 'wains', n: 1, a: 'wall2', b: null, c: null });
  ceilingStrips(p, iu0 + 1, iu1 - 1, 2, hv, 3);
  atelier(p, 'atolye', [iu0, 0, iu1, hv]);
  p.wallProp('neon_tabela_ic', p.du, 0, 2, { y: 3.4, data: p.brandData('duvar_tuval'), variant: 3 });
  ownerSpot(p, (iu0 + iu1) >> 1, 3, 0, iu0 + 1, 3);
  // gizli oda: pembe neon, tuvaller, şövaleler
  p.op({ t: 'floor', rect: [cx - gw, hv + 1, cx + gw, iv1], pat: 'checker', a: B.CLOTH_PURPLE, b: B.CLOTH_BLACK, n: 1 });
  p.accent(cx - gw, hv + 1, cx - gw + 1, iv1, p.H - 1, p.H, ID.NEON_PINK);
  p.accent(cx + gw - 1, hv + 1, cx + gw, iv1, p.H - 1, p.H, ID.NEON_CYAN);
  for (let v = hv + 1; v < iv1; v += 2) {
    p.wallProp('tuval', cx - gw, v, 3, { variant: p.rng.i(8), y: 1.6 });
    p.wallProp('tuval', cx + gw - 1, v, 1, { variant: p.rng.i(8), y: 1.6 });
  }
  p.wallProp('tuval', cx, iv1 - 1, 0, { variant: p.rng.i(8), y: 1.8 });
  p.prop('sovale', cx - 1, hv + 3, 2, { variant: 3 }) || p.near('sovale', cx - 1, hv + 3, 2, null, 1);
  p.prop('heykel', cx + 1, hv + 2, 2, { variant: 3 }) || p.near('heykel', cx + 1, hv + 2, 2, null, 1);
  p.prop('boya_rafi', cx + gw - 1, iv1 - 1, 3, { variant: 2 });
  lightsArt(p, 'atolye', 4);
  p.lampGrid('gizli', ['panel'], 2);
  p.topUp(26, ['saksi_buyuk', 'tabure'], ['tuval', 'cerceve']);
  p.chip('gizli', cx, iv1 - 2, 0);
  return { hidden: { room: 'gizli', door: 'gG', lock: hl.id } };
}

const PLANS = [plan0, plan1, plan2];

export const interior = {
  kind: KIND,
  name: 'Sanat Stüdyosu',
  footprint() {
    return { w: 16, d: 12, h: 6 };
  },
  palette(it) {
    return PALS[(it.variant | 0) % 3];
  },
  plan(lot, rng, variant, ctx) {
    const p = new CPlan(ctx, rng, variant);
    const extra = PLANS[variant % 3](p) || {};
    return p.finish(Object.assign({ mood: MOODS[variant % 3] }, extra));
  },
  emit(W, interior, ctx) {
    paintLayout(ctx.kit, ctx.pal, interior.layout);
  },
};

export default interior;
