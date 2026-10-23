/*
 * KEŞİF interior/kinds/dron_kurye — DRON KURYE MERKEZİ (Şule, "Paketler beklemez!", turuncu, ortam 'pervane'). Sözleşme §8, design_city §7.2 #15. interiors_c.
 *
 * 3 varyant (it.variant): 0 Sevkiyat Salonu (karşılama + paket bandı/dron rıhtımları + kod kilitli kargo deposu)
 *                         1 Dron Hangarı (tek hacim: iniş pisti, dron rıhtımları halkası, kontrol kulesi platformu)
 *                         2 Mini Dağıtım (karşılama + ofis + sevkiyat + mini_hack kilitli şarj odası)
 * Kurye masası (`kurye_tezgahi`) → `interior.anchors[type:'courier_desk']` + `interior.pois` (Faz 4 görev panosu/kurye görevleri bunu okur).
 * Boyut 16×12×5 (ya da 12×16); kule çekirdeği arkadaysa `Dm`ye kadar. Dronlar dekor (`dron_istasyonu` rıhtımlarında).
 */
import { B } from '../../../blocks.js';
import { ID } from '../../cityEmit.js';
import { CPlan, mkPal, paintLayout } from '../cKit.js';

const KIND = 'dron_kurye';

const PALS = [
  mkPal('dron0', {
    floor: ID.FACADE_DARK, floor2: ID.ORANGE, wall: ID.WHITE, wall2: ID.ORANGE, ceil: ID.WHITE, trim: ID.NEON_AMBER, glow: ID.NEON_AMBER, glow2: ID.NEON_CYAN,
    cloth: B.CLOTH_ORANGE, cloth2: B.CLOTH_BLACK, glass: B.GLASS_ORANGE, lamp: 'panel',
  }),
  mkPal('dron1', {
    floor: ID.BLACK, floor2: ID.YELLOW, wall: ID.FACADE_DARK, wall2: ID.ORANGE, ceil: ID.FACADE_LIGHT, trim: ID.NEON_AMBER, glow: ID.NEON_AMBER, glow2: ID.NEON_CYAN,
    cloth: B.CLOTH_ORANGE, cloth2: B.CLOTH_BLACK, glass: B.GLASS_BLUE, lamp: 'panel',
  }),
  mkPal('dron2', {
    floor: ID.FACADE_DARK, floor2: ID.WHITE, wall: ID.WHITE, wall2: ID.ORANGE, ceil: ID.WHITE, trim: ID.NEON_AMBER, glow: ID.NEON_AMBER, glow2: ID.NEON_LIME,
    cloth: B.CLOTH_YELLOW, cloth2: B.CLOTH_ORANGE, glass: B.GLASS_ORANGE, lamp: 'panel',
  }),
];
const MOODS = [{ hue: 'turuncu', light: 11 }, { hue: 'turuncu', light: 12 }, { hue: 'sicak', light: 11 }];

/* ------------------------------------------------------------------------------------------------
 * Ortak parçalar
 * ---------------------------------------------------------------------------------------------- */
function look(p, rect, v) {
  p.op({
    t: 'floor', rect, pat: 'checker', a: 'floor', b: v === 1 ? ID.FACADE_DARK : ID.BLACK, n: 2,
  });
  p.op({ t: 'ceil', rect, pat: 'solid', a: 'ceil' });
  p.liner({
    pat: 'panels', n: 1, m: 4, a: 'wall2', b: 'wall', c: ID.IRON,
  });
}

function ceilBars(p, u0, u1, v0, v1, step) {
  for (let v = v0; v < v1; v += step) p.ceilStrip(u0, v, u1, v + 1, B.LIGHT_BLOCK);
}

/** Masa tarafı: kapıdan uzak yan (sol: true). */
function deskLeft(p) {
  return p.du - p.iu0 >= p.iu1 - 1 - p.du;
}

/** Karşılama: kurye masası + Şule + ilan panosu + terminal + bekleme sırası + posta kutuları. left: masa sol yanda. */
function reception(p, F, left) {
  const { du, iu0, iu1 } = p;
  const cu = left ? iu0 + 2 : iu1 - 3;
  const ly = left ? 1 : 3;
  const row = 1;
  const own = left ? iu0 : iu1 - 1;
  p.prop('kurye_tezgahi', cu, row, ly, { variant: 0 }) || p.near('kurye_tezgahi', cu, row, ly, null, 2);
  const front = left ? cu + 1 : cu - 1;
  const a = p.anchor('courier_desk', front, row, left ? 3 : 1, 0, { owner: p.ctx.bp.ownerId || null });
  p.pois.push({
    type: 'courier_desk', x: a.x, y: a.y, z: a.z, yaw: a.yaw,
  });
  p.stand(own, row, ly, 1);
  p.signature(cu, row, 1.2, 1);
  const wside = left ? 3 : 1;
  p.wallProp('ilan_panosu', own, row, wside, { y: 1.5, data: p.brandData('tuy_dron'), variant: 1 });
  p.mountWall('karsilama', left ? 1 : 3, 'posta_kutusu', {
    y: 1.3, count: 2, from: 1, step: 2,
  });
  p.fillWall('karsilama', 2, 'bekleme_sirasi', { count: 2, from: 1, step: 3 });
  p.fillWall('karsilama', 0, 'bilgi_terminali', { count: 2, from: left ? iu1 - iu0 - 3 : 1, step: 3 });
  p.mountWall('karsilama', 0, 'cerceve', {
    y: 1.8, count: 2, from: 2, step: 5,
  });
  p.wallProp('neon_tabela_ic', du, 0, 2, { y: 3.2, data: p.brandData('tuy_dron'), variant: p.v });
  p.prop('calisma_masasi', left ? iu1 - 2 : iu0 + 1, F - 1, 0, { variant: 1 });
}

/** Paket bandı (voksel): rect [u0,v,u1,v+1], 1 blok yüksek; üstünde koliler (prop y=1). */
function belt(p, u0, v, u1, gapC) {
  for (let u = u0; u < u1; u++) {
    if (gapC !== undefined && u >= gapC - 1 && u <= gapC + 1) continue;
    p.op({
      t: 'box', rect: [u, v, u + 1, v + 1], y0: 0, y1: 1, id: (u & 1) ? ID.FACADE_DARK : ID.BLACK,
    });
  }
  p.reserve([u0, v, u1, v + 1], 0, 1);
  p.op({
    t: 'floor', rect: [u0, v - 1, u1, v], pat: 'hazard', a: 'floor', b: ID.YELLOW, n: 1,
  });
  p.op({
    t: 'floor', rect: [u0, v + 1, u1, v + 2], pat: 'hazard', a: 'floor', b: ID.YELLOW, n: 1,
  });
  let k = 0;
  for (let u = u0 + 1; u < u1 - 1; u += 3) {
    if (gapC !== undefined && u >= gapC - 2 && u <= gapC + 2) continue;
    p.prop('koli', u, v, k & 1 ? 1 : 3, { y: 1, variant: k & 3 });
    k++;
  }
}

/* ------------------------------------------------------------------------------------------------
 * V0: Sevkiyat Salonu
 * ---------------------------------------------------------------------------------------------- */
function plan0(p) {
  const {
    H, iu0, iu1, iv1,
  } = p;
  const F = iv1 >= 10 ? 5 : 4;
  const hv0 = F + 1;
  const left = deskLeft(p);
  const dw = Math.min(4, Math.max(3, (iu1 - iu0 - 8) >> 1));
  // kargo deposu masanın karşı yanında; sevkiyat geri kalan
  const dl = !left;
  const d0 = dl ? iu0 : iu1 - dw;
  const d1 = dl ? iu0 + dw : iu1;
  const s0 = dl ? iu0 + dw + 1 : iu0;
  const s1 = dl ? iu1 : iu1 - dw - 1;
  p.room('karsilama', [iu0, 0, iu1, F], { role: 'giris' });
  p.room('sevk', [s0, hv0, s1, iv1], { role: 'sevk' });
  p.room('depo', [d0, hv0, d1, iv1], { role: 'depo' });
  const cs = (s0 + s1) >> 1;
  const cd = (d0 + d1) >> 1;
  p.door('gS', 'karsilama', 'sevk', {
    axis: 'u', line: F, c: cs, w: 3, kind: 'arch',
  });
  const lock = p.makeKod('d', 1, 4);
  const gD = p.door('gD', 'karsilama', 'depo', {
    axis: 'u', line: F, c: cd, w: 1, kind: 'door', lock,
  });
  look(p, [iu0, 0, iu1, iv1], 0);
  p.op({
    t: 'floor', rect: [iu0, 0, iu1, F], pat: 'checker', a: ID.WHITE, b: ID.FACADE_LIGHT, n: 2,
  });
  p.op({
    t: 'floor', rect: [d0, hv0, d1, iv1], pat: 'hazard', a: 'floor', b: ID.ORANGE, n: 2,
  });
  p.op({
    t: 'wall', axis: 'u', line: F, lo: iu0, hi: iu1, y0: 0, y1: H, pat: 'wains', n: 1, a: 'wall2', b: 'wall', c: ID.IRON,
  });
  p.op({
    t: 'wall', axis: 'v', line: dl ? d1 : s1, lo: hv0, hi: iv1, y0: 0, y1: H, pat: 'wains', n: 1, a: 'wall2', b: 'wall', c: ID.IRON,
  });
  ceilBars(p, iu0 + 2, iu1 - 2, 1, F, 3);
  ceilBars(p, s0 + 1, s1 - 1, hv0 + 1, iv1 - 1, 3);
  p.wallStrip('l', 3, 0, iv1, ID.NEON_AMBER);
  p.wallStrip('r', 3, 0, iv1, ID.NEON_AMBER);
  p.wallStrip('b', 3, iu0, iu1, ID.NEON_CYAN);
  reception(p, F, left);
  // paket bandı: sevk salonu ortasında, ortada geçit
  const vb = hv0 + 2;
  belt(p, s0 + 1, vb, s1 - 1, cs);
  const outer = dl ? 1 : 3; // sevk'in kabuk tarafı duvarı
  const inner = dl ? 3 : 1; // depo duvarı tarafı
  p.fillWall('sevk', outer, 'dron_istasyonu', { count: 3, from: 3 });
  p.fillWall('sevk', 0, 'dron_rafi', { count: 4, from: 1, step: 2 });
  p.fillWall('sevk', inner, 'sarj_istasyonu', { count: 2, from: 4, step: 2 });
  p.fillWall('sevk', 2, 'koli_yigini', { count: 1, from: 1 });
  p.mountWall('sevk', outer, 'cerceve', { y: 1.8, count: 1, from: 1 });
  // depo
  p.fillWall('depo', 0, 'koli_yigini', { count: 2, from: 0, step: 2 });
  p.fillWall('depo', dl ? 1 : 3, 'koli', { count: 2, from: 0, step: 2 });
  p.fillWall('depo', dl ? 3 : 1, 'raf_unitesi', { count: 2, from: 1, step: 3 });
  p.guard(gD, lock, 'karsilama', left ? [1, 0] : [3, 0]);
  p.lampGrid('karsilama', ['panel'], 2);
  p.lampGrid('sevk', ['panel', 'neon_amber'], 4);
  p.lampGrid('depo', ['panel'], 1);
  p.topUp(26, ['koli', 'sarj_istasyonu'], ['cerceve', 'ilan_panosu']);
  p.chip('depo', dl ? d1 - 1 : d0, iv1 - 1, 0);
}

/* ------------------------------------------------------------------------------------------------
 * V1: Dron Hangarı — iniş pisti, rıhtım halkası, kontrol kulesi
 * ---------------------------------------------------------------------------------------------- */
function plan1(p) {
  const { iu0, iu1, iv1 } = p;
  p.room('hangar', [iu0, 0, iu1, iv1], { role: 'hangar' });
  look(p, [iu0, 0, iu1, iv1], 1);
  const cu = (iu0 + iu1) >> 1;
  const cv = Math.max(6, Math.min(iv1 - 4, Math.round(iv1 * 0.55)));
  const rect = [iu0, 0, iu1, iv1];
  // iniş pisti: turuncu halka + sarı çizgili dış halka
  p.op({
    t: 'floor', rect, pat: 'disc', a: ID.ORANGE, b: ID.YELLOW, c: ID.BLACK, cu: cu + 0.5, cv: cv + 0.5, r: 4.4,
  });
  p.op({
    t: 'floor', rect, pat: 'disc', a: ID.BLACK, b: ID.ORANGE, c: ID.BLACK, cu: cu + 0.5, cv: cv + 0.5, r: 3.2,
  });
  p.accent(cu - 1, cv, cu + 2, cv + 1, -1, 0, ID.NEON_AMBER);
  p.accent(cu, cv - 1, cu + 1, cv + 2, -1, 0, ID.NEON_AMBER);
  p.liner({
    pat: 'panels', n: 1, m: 3, a: 'wall2', b: 'wall', c: ID.IRON,
  });
  ceilBars(p, iu0 + 2, iu1 - 2, 2, iv1 - 1, 3);
  p.wallStrip('l', 3, 0, iv1, ID.NEON_AMBER);
  p.wallStrip('r', 3, 0, iv1, ID.NEON_AMBER);
  p.wallStrip('b', 3, iu0, iu1, ID.NEON_CYAN);
  const left = deskLeft(p);
  const dcu = left ? iu0 + 2 : iu1 - 3;
  const dly = left ? 1 : 3;
  p.prop('kurye_tezgahi', dcu, 2, dly, { variant: 0 }) || p.near('kurye_tezgahi', dcu, 2, dly, null, 2);
  const a = p.anchor('courier_desk', left ? dcu + 1 : dcu - 1, 2, left ? 3 : 1, 0, { owner: p.ctx.bp.ownerId || null });
  p.pois.push({
    type: 'courier_desk', x: a.x, y: a.y, z: a.z, yaw: a.yaw,
  });
  p.stand(left ? iu0 : iu1 - 1, 2, dly, 1);
  p.signature(dcu, 2, 1.2, 1);
  p.wallProp('ilan_panosu', left ? iu0 : iu1 - 1, 2, left ? 3 : 1, { y: 1.5, data: p.brandData('tuy_dron'), variant: 0 });
  p.fillWall('hangar', 2, 'bekleme_sirasi', { count: 1, from: 1 });
  p.fillWall('hangar', 2, 'bilgi_terminali', { count: 1, from: left ? iu1 - iu0 - 3 : 1 });
  p.wallProp('neon_tabela_ic', p.du, 0, 2, { y: 3.2, data: p.brandData('tuy_dron'), variant: 1 });
  // rıhtım halkası (merkeze bakar): pistin çevresinde noktalar
  const ring = [[-5, 0], [5, 0], [-4, -3], [4, -3], [-4, 3], [4, 3], [0, 5]];
  ring.forEach((o, i) => {
    const u = cu + o[0];
    const v = cv + o[1];
    const ly = Math.abs(o[0]) >= Math.abs(o[1]) ? (o[0] < 0 ? 1 : 3) : (o[1] < 0 ? 0 : 2);
    p.prop('dron_istasyonu', u, v, ly, { variant: i % 3 }) || p.near('dron_istasyonu', u, v, ly, null, 1);
  });
  // yüksek raflar arka duvarda
  p.fillWall('hangar', 0, 'dron_rafi', { count: 5, from: 1, step: 2 });
  // kontrol kulesi platformu (arka köşe; çıkış yan taraftan plaka basamak)
  const px = left ? iu1 - 4 : iu0;
  const pz = iv1 - 4;
  p.op({
    t: 'raise', rect: [px, pz, px + 4, iv1], h2: 2, cube: 'wall', top: B.CLOTH_ORANGE,
  });
  p.op({
    t: 'raise', rect: [left ? px - 1 : px + 4, pz, left ? px : px + 5, pz + 2], h2: 1, slab: B.SLAB,
  });
  p.reserve([px, pz, px + 4, iv1], 0, 1);
  p.prop('calisma_masasi', px + 1, iv1 - 1, 2, { y: 1, variant: 2 }) || p.near('calisma_masasi', px + 1, iv1 - 1, 2, { y: 1 }, 1);
  p.prop('bilgi_terminali', px + 3, iv1 - 1, 2, { y: 1, variant: 1 });
  p.fillWall('hangar', left ? 3 : 1, 'sarj_istasyonu', { count: 1, from: 5 });
  p.fillWall('hangar', left ? 3 : 1, 'koli_yigini', { count: 1, from: 7 });
  p.mountWall('hangar', left ? 3 : 1, 'cerceve', {
    y: 1.8, count: 1, from: 9,
  });
  p.lampGrid('hangar', ['panel', 'neon_amber', 'panel', 'neon_amber'], 4);
  p.topUp(26, ['koli', 'sarj_istasyonu'], ['cerceve', 'ilan_panosu']);
  p.chip('hangar', left ? iu1 - 2 : iu0 + 1, iv1 - 1, 0);
}

/* ------------------------------------------------------------------------------------------------
 * V2: Mini Dağıtım — karşılama, ofis, sevkiyat, mini_hack kilitli şarj odası
 * ---------------------------------------------------------------------------------------------- */
function plan2(p) {
  const {
    H, iu0, iu1, iv1,
  } = p;
  const F = iv1 >= 10 ? 5 : 4;
  const hv0 = F + 1;
  const wide = iu1 - iu0 >= 13;
  const left = deskLeft(p);
  const order = wide ? (left ? ['ofis', 'sevk', 'sarj'] : ['sarj', 'sevk', 'ofis']) : (left ? ['sevk', 'sarj'] : ['sarj', 'sevk']);
  const fixed = { ofis: 4, sarj: wide ? 4 : 3 };
  const used = order.reduce((a, id) => a + (id === 'sevk' ? 0 : fixed[id]), 0) + (order.length - 1);
  const R = {};
  let x = iu0;
  order.forEach((id) => {
    const w = id === 'sevk' ? iu1 - iu0 - used : fixed[id];
    R[id] = [x, x + w];
    x += w + 1;
  });
  p.room('karsilama', [iu0, 0, iu1, F], { role: 'giris' });
  order.forEach((id) => p.room(id, [R[id][0], hv0, R[id][1], iv1], { role: id }));
  const hack = p.makeHack('s', 2, 'levers');
  const mid = (id) => (R[id][0] + R[id][1]) >> 1;
  p.door('gS', 'karsilama', 'sevk', {
    axis: 'u', line: F, c: mid('sevk'), w: 3, kind: 'arch',
  });
  const gC = p.door('gC', 'karsilama', 'sarj', {
    axis: 'u', line: F, c: mid('sarj'), w: 1, kind: 'door', lock: hack,
  });
  if (wide) {
    p.door('gO', 'karsilama', 'ofis', {
      axis: 'u', line: F, c: mid('ofis'), w: 1, kind: 'door',
    });
  }
  look(p, [iu0, 0, iu1, iv1], 2);
  p.op({
    t: 'floor', rect: [iu0, 0, iu1, F], pat: 'checker', a: ID.WHITE, b: ID.FACADE_LIGHT, n: 2,
  });
  p.op({
    t: 'floor', rect: [R.sarj[0], hv0, R.sarj[1], iv1], pat: 'checker', a: ID.WHITE, b: ID.ORANGE, n: 1,
  });
  p.op({
    t: 'wall', axis: 'u', line: F, lo: iu0, hi: iu1, y0: 0, y1: H, pat: 'wains', n: 1, a: 'wall2', b: 'wall', c: ID.IRON,
  });
  order.slice(0, -1).forEach((id) => {
    p.op({
      t: 'wall', axis: 'v', line: R[id][1], lo: hv0, hi: iv1, y0: 0, y1: H, pat: 'wains', n: 1, a: 'wall2', b: 'wall', c: ID.IRON,
    });
  });
  ceilBars(p, iu0 + 2, iu1 - 2, 1, F, 3);
  ceilBars(p, R.sevk[0] + 1, R.sevk[1] - 1, hv0 + 1, iv1 - 1, 3);
  p.wallStrip('l', 3, 0, iv1, ID.NEON_AMBER);
  p.wallStrip('r', 3, 0, iv1, ID.NEON_LIME);
  p.wallStrip('b', 3, iu0, iu1, ID.NEON_AMBER);
  reception(p, F, left);
  // sevkiyat: bant + rıhtım + raf
  const sv0 = R.sevk[0];
  const sv1 = R.sevk[1];
  const vb = hv0 + 2;
  belt(p, sv0 + 1, vb, sv1 - 1, (sv0 + sv1) >> 1);
  p.fillWall('sevk', 3, 'dron_istasyonu', { count: 2, from: 3 });
  p.fillWall('sevk', 1, 'dron_istasyonu', { count: 1, from: 3 });
  p.fillWall('sevk', 0, 'dron_rafi', { count: 4, from: 1, step: 2 });
  p.fillWall('sevk', 2, 'koli_yigini', { count: 1, from: 1 });
  // şarj odası
  p.fillWall('sarj', 1, 'sarj_istasyonu', { count: 2, from: 0, step: 3 });
  p.fillWall('sarj', 3, 'sarj_istasyonu', { count: 2, from: 1, step: 3 });
  p.fillWall('sarj', 0, 'dron_istasyonu', { count: 2, from: 0, step: 2 });
  p.prop('dron_istasyonu', mid('sarj'), hv0 + 3, 2, { variant: 1 });
  // ofis
  if (wide) {
    const oc = mid('ofis');
    p.prop('calisma_masasi', oc, hv0 + 2, 2, { variant: 0 });
    p.prop('calisma_masasi', oc, iv1 - 2, 0, { variant: 1 });
    p.fillWall('ofis', left ? 1 : 3, 'raf_unitesi', { count: 1, from: 4 });
    p.mountWall('ofis', left ? 1 : 3, 'cerceve', { y: 1.7, count: 1, from: 1 });
    p.mountWall('ofis', left ? 1 : 3, 'ilan_panosu', { y: 1.5, count: 1, from: 3 });
    p.lampGrid('ofis', ['panel'], 1);
  }
  p.guard(gC, hack, 'karsilama');
  p.lampGrid('karsilama', ['panel'], 2);
  p.lampGrid('sevk', ['panel', 'neon_amber'], 4);
  p.lampGrid('sarj', ['panel', 'neon_lime'], 2);
  p.topUp(26, ['koli', 'sarj_istasyonu'], ['cerceve', 'ilan_panosu']);
  p.chip('sarj', mid('sarj'), iv1 - 1, 0);
}

const PLANS = [plan0, plan1, plan2];

export const interior = {
  kind: KIND,
  name: 'Dron Kurye Merkezi',
  footprint() {
    return { w: 16, d: 12, h: 5 };
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
