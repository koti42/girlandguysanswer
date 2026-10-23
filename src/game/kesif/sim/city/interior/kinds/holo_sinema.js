/*
 * KEŞİF interior/kinds/holo_sinema — HOLO SİNEMA (Kemal, mor loş, ortam 'film'). Sözleşme §8, design_city §7.2 #16. interiors_c.
 *
 * 3 varyant (it.variant): 0 Kadife Salon (basamaklı salon, perde fuaye ile salon arasındaki duvarda; seyirci perdeye doğru iner)
 *                         1 Mini Salonlar (iki küçük salon, arka duvarda birer perde; B salonu kod kilitli)
 *                         2 Gül Salonu (düz zemin, yüksek perde, yan VIP loca — loca mini_hack kilitli)
 * Boyut: 18×16×7 (ya da 16×18); kule çekirdeği (engel) arkadaysa kullanılabilir derinlik `Dm`ye kadar. Kabuğa bitişik yanlarda 1 hücrelik kaplama.
 * Perde: holo_perde propları (aile dostu reklam döngüsü: interior.screens[].ads, ≤3 Hz değişim render tarafında) + HOLO bloklarından perde zemini.
 */
import { B } from '../../../blocks.js';
import { ID } from '../../cityEmit.js';
import { CPlan, mkPal, paintLayout } from '../cKit.js';

const KIND = 'holo_sinema';

const PALS = [
  mkPal('sinema0', {
    floor: ID.BLACK, floor2: ID.PURPLE, wall: ID.FACADE_DARK, wall2: ID.PURPLE, ceil: ID.FACADE_DARK, trim: ID.NEON_PINK, glow: ID.NEON_PINK, glow2: ID.NEON_CYAN,
    cloth: B.CLOTH_RED, cloth2: B.CLOTH_BLACK, glass: B.GLASS_PURPLE, lamp: 'holo',
  }),
  mkPal('sinema1', {
    floor: ID.FACADE_DARK, floor2: ID.BLUE, wall: ID.FACADE_DARK, wall2: ID.BLUE, ceil: ID.FACADE_DARK, trim: ID.NEON_CYAN, glow: ID.NEON_CYAN, glow2: ID.NEON_PINK,
    cloth: B.CLOTH_BLUE, cloth2: B.CLOTH_BLACK, glass: B.GLASS_BLUE, lamp: 'holo',
  }),
  mkPal('sinema2', {
    floor: ID.BLACK, floor2: ID.FACADE_DARK, wall: ID.FACADE_DARK, wall2: ID.PURPLE, ceil: ID.FACADE_DARK, trim: ID.NEON_AMBER, glow: ID.NEON_AMBER, glow2: ID.NEON_PINK,
    cloth: B.CLOTH_ORANGE, cloth2: B.CLOTH_PURPLE, glass: B.GLASS_PURPLE, lamp: 'holo',
  }),
];
const MOODS = [{ hue: 'mor', light: 8 }, { hue: 'mavi', light: 9 }, { hue: 'pembe', light: 9 }];

/** Perde reklam döngüsü (CITY_AD_LINES kimlikleri; aile dostu, gerçek film/marka yok). */
const ADS = ['a_sinema', 'a_dron', 'a_kedi', 'a_sanat', 'a_gulumse', 'a_sirin'];

/* ------------------------------------------------------------------------------------------------
 * Ortak parçalar
 * ---------------------------------------------------------------------------------------------- */
/** Ön salon (fuaye): bilet tezgâhı + sahip, atıştırmalık otomatları, bekleme sırası, afişler, bitkiler, halı, tabela. */
function foyer(p, F, side) {
  const { du, iu0, iu1 } = p;
  const cu = side === 'l' ? iu0 + 1 : iu1 - 2;
  const ly = side === 'l' ? 1 : 3;
  const row = F >= 4 ? 2 : 1;
  p.prop('kasa_masasi', cu, row, ly) || p.near('kasa_masasi', cu, row, ly, null, 2);
  p.anchor('ticket_desk', cu, row, ly, 0);
  p.stand(side === 'l' ? iu0 : iu1 - 1, row, ly, 1);
  p.signature(cu, row, 1.2, 1);
  // otomatlar karşı yanda
  const oc = side === 'l' ? iu1 - 1 : iu0;
  const oly = side === 'l' ? 3 : 1;
  p.prop('otomat_atistirmalik', oc, row, oly) || p.near('otomat_atistirmalik', oc, row, oly, null, 2);
  p.prop('otomat_atistirmalik', oc, F - 1, oly) || p.near('otomat_atistirmalik', oc, F - 1, oly, null, 1);
  // bekleme sıraları ön duvar boyunca
  p.prop('bekleme_sirasi', du - 5 >= iu0 + 1 ? du - 5 : du + 4, 0, 0);
  p.prop('bekleme_sirasi', du + 5 < iu1 - 1 ? du + 5 : du - 4, 0, 0);
  // afişler (ara duvar fuaye yüzü ve ön duvar)
  const posters = [[iu0 + 4, F - 1, 0], [iu1 - 5, F - 1, 0], [du - 3, 0, 2], [du + 3, 0, 2]];
  let n = 0;
  for (let i = 0; i < posters.length && n < 3; i++) if (p.wallProp('cerceve', posters[i][0], posters[i][1], posters[i][2], { variant: p.rng.i(8), y: 1.5 })) n++;
  p.wallProp('neon_tabela_ic', Math.max(iu0 + 2, Math.min(iu1 - 3, du)), F - 1, 0, { y: 2.6, data: p.brandData('perde_holo'), variant: p.v });
  p.near('saksi_buyuk', iu0, 0, 0, { variant: p.rng.i(4) }, 1);
  p.near('saksi_buyuk', iu1 - 1, F - 1, 0, { variant: p.rng.i(4) }, 1);
  p.prop('bilgi_terminali', side === 'l' ? iu1 - 2 : iu0 + 1, 0, 0);
  p.prop('hali', du, 2, 0, { variant: p.v });
}

/** Perde propları: cells = [[u,v,side]] (side: duvara yön). Dönen: yerleşenlerin kapladığı u aralığı [a,b) (yoksa null). */
function addScreens(p, cells, y) {
  const slots = [];
  let a = 1e9;
  let b = -1e9;
  cells.forEach((c, i) => {
    const s = p.wallProp('holo_perde', c[0], c[1], c[2], { y, data: p.adData(ADS[i % ADS.length]), variant: p.v });
    if (s) {
      slots.push(s.slot);
      a = Math.min(a, c[0] - 1);
      b = Math.max(b, c[0] + 2);
    }
  });
  p.screens.push({ kind: 'ads', slots, ads: ADS.slice(), periodSec: 12 });
  return slots.length ? [a, b] : null;
}

/** Tavanda seyrek 'yıldız' (tek hücre holo bloğu, aksan bütçesine sayılır). */
function stars(p, u0, v0, u1, v1, n) {
  for (let k = 0; k < n; k++) {
    const u = u0 + p.rng.i(Math.max(1, u1 - u0));
    const v = v0 + p.rng.i(Math.max(1, v1 - v0));
    p.ceilStrip(u, v, u + 1, v + 1, ID.HOLO);
  }
}

function foyerLook(p, F) {
  const { iu0, iu1 } = p;
  p.op({ t: 'floor', rect: [iu0, 0, iu1, F], pat: 'checker', a: 'floor', b: 'floor2', n: 2 });
  p.op({ t: 'ceil', rect: [iu0, 0, iu1, F], pat: 'grid', a: 'ceil', b: 'wall2', n: 3 });
  p.op({
    t: 'floor', rect: [p.du - 1, 0, p.du + 2, F], pat: 'stripeU', a: B.CLOTH_RED, b: B.CLOTH_RED, n: 1,
  });
  p.ceilStrip(iu0 + 2, 1, iu0 + 6, 2, p.v === 1 ? ID.NEON_CYAN : ID.NEON_PINK);
  p.ceilStrip(iu1 - 6, 1, iu1 - 2, 2, p.v === 1 ? ID.NEON_CYAN : ID.NEON_PINK);
  p.lampGrid('fuaye', ['panel'], 2);
}

/* ------------------------------------------------------------------------------------------------
 * V0: Kadife Salon — basamaklı salon, perde fuaye ile salon arasındaki duvarda
 * ---------------------------------------------------------------------------------------------- */
function plan0(p) {
  const {
    W, H, iu0, iu1, iv1,
  } = p;
  const cu = W >> 1;
  const F = iv1 >= 11 ? 4 : 3;
  const hv0 = F + 1;
  p.room('fuaye', [iu0, 0, iu1, F], { role: 'giris' });
  p.room('salon', [iu0, hv0, iu1, iv1], { role: 'salon' });
  p.door('gA', 'fuaye', 'salon', { axis: 'u', line: F, c: iu0 + 1, w: 3, kind: 'arch' });
  p.door('gB', 'fuaye', 'salon', { axis: 'u', line: F, c: iu1 - 2, w: 3, kind: 'arch' });
  const A = iv1 - hv0 >= 9 ? 2 : 1;
  const R = Math.max(0, Math.min(3, H - 4, Math.floor((iv1 - hv0 - A) / 2)));
  const carpet = B.CLOTH_PURPLE;
  foyerLook(p, F);
  p.op({ t: 'floor', rect: [iu0, hv0, iu1, iv1], pat: 'border', a: carpet, b: 'floor', n: 1 });
  p.op({ t: 'ceil', rect: [iu0, hv0, iu1, iv1], pat: 'grid', a: 'ceil', b: 'floor', n: 3 });
  p.liner({ pat: 'panels', n: 1, m: 4, a: 'wall', b: 'wall2', c: ID.FACADE_LIGHT });
  p.op({ t: 'wall', axis: 'u', line: F, lo: iu0, hi: iu1, y0: 0, y1: H, pat: 'panels', n: 1, m: 4, a: 'wall', b: 'wall2', c: ID.FACADE_LIGHT });
  // yan duvar neon çizgileri (kaplama sütunlarına gömülü)
  p.wallStrip('l', 5, hv0, iv1, ID.NEON_PINK);
  p.wallStrip('r', 5, hv0, iv1, ID.NEON_PINK);
  // proplar önce: perde aralığı buna göre belirlenir
  foyer(p, F, p.v === 0 ? 'l' : 'r');
  const sc = [];
  [cu - 3, cu, cu + 3].forEach((u) => sc.push([u, hv0, 2]));
  const rng = addScreens(p, sc, 1);
  if (rng) {
    p.op({ t: 'face', axis: 'u', line: F, lo: rng[0] - 1, hi: rng[1] + 1, y0: 0, y1: 5, id: 'wall' });
    p.accent(rng[0], F, rng[1], F + 1, 1, 4, ID.HOLO);
    p.accent(rng[0], F, rng[1], F + 1, 0, 1, ID.NEON_PINK);
    p.accent(rng[0], F, rng[1], F + 1, 4, 5, ID.NEON_CYAN);
  }
  // basamaklar, koltuklar
  const L = [];
  const Rr = [];
  for (let u = iu0 + 1; u <= cu - 2; u++) L.push(u);
  for (let u = cu + 1; u <= iu1 - 2; u++) Rr.push(u);
  const seatCols = L.concat(Rr);
  const aisles = [[iu0, iu0 + 1], [cu - 1, cu + 1], [iu1 - 1, iu1]];
  const mine = L.slice(1, -1).concat(Rr.slice(1, -1));
  for (let r = 0; r < R; r++) {
    const vA = hv0 + A + 2 * r;
    const vB = r === R - 1 ? iv1 : vA + 2;
    p.op({
      t: 'raise', rect: [iu0, vA, iu1, vB], h2: 2 * (r + 1), cube: 'wall', top: carpet,
    });
    aisles.forEach((a) => {
      p.op({
        t: 'box', rect: [a[0], vA, a[1], vA + 1], y0: r, y1: r + 1, id: 0,
      });
      p.op({
        t: 'box', rect: [a[0], vA, a[1], vA + 1], y0: r, y1: r + 1, id: B.SLAB,
      });
    });
    for (let u = iu0 + 1; u < iu1 - 1; u += 2) if (!(u >= cu - 1 && u <= cu)) p.accent(u, vA, u + 1, vA + 1, r, r + 1, ID.NEON_PINK);
    const vs = vA + 1;
    seatCols.forEach((u, i) => {
      if (r === 0 && mine.indexOf(u) >= 0) return;
      if (i % 3 === 2) return; // 3'lü koltuk grupları arasında geçit
      p.op({
        t: 'box', rect: [u, vs, u + 1, vs + 1], y0: r + 1, y1: r + 2, id: (u + r) & 1 ? B.CLOTH_RED : B.CLOTH_ORANGE,
      });
      p.op({
        t: 'box', rect: [u, vs, u + 1, vs + 1], y0: r + 2, y1: r + 3, id: (u + r) & 1 ? B.CLOTH_PURPLE : B.CLOTH_RED,
      });
      p.reserve([u, vs, u + 1, vs + 1], r + 1, r + 3);
    });
  }
  if (R > 0) {
    const vs = hv0 + A + 1;
    mine.forEach((u) => p.prop('sinema_koltugu', u, vs, 2, { y: 1, variant: u & 1 }));
  }
  // tavan şeritleri + gömülü lambalar
  for (let q = 0; q < 3; q++) {
    const u = q === 0 ? iu0 : q === 1 ? cu : iu1 - 1;
    p.ceilStrip(u, hv0 + 1, u + 1, iv1 - 1, q === 1 ? ID.NEON_CYAN : ID.NEON_PINK);
  }
  p.lampGrid('salon', ['neon_pink', 'neon_pink', 'neon_cyan', 'neon_cyan'], 4);
  stars(p, iu0 + 2, hv0 + 1, iu1 - 2, iv1 - 1, 8);
  p.prop('projektor', cu, Math.max(hv0 + 3, iv1 - 2), 2);
  p.prop('hoparlor', iu0, hv0, 1, { variant: 0 });
  p.prop('hoparlor', iu1 - 1, hv0, 3, { variant: 1 });
  p.wallProp('cerceve', iu0, hv0 + A + 2, 3, { variant: p.rng.i(8), y: 2.5 });
  p.wallProp('cerceve', iu1 - 1, hv0 + A + 2, 1, { variant: p.rng.i(8), y: 2.5 });
  p.near('saksi_buyuk', iu0, iv1 - 1, 0, { variant: p.rng.i(4) }, 1);
  p.near('saksi_buyuk', iu1 - 1, iv1 - 1, 0, { variant: p.rng.i(4) }, 1);
  p.topUp(22, ['saksi_buyuk', 'hoparlor'], ['cerceve']);
  p.chip('oda', iu1 - 2, iv1 - 1, R > 0 ? R : 0);
}

/* ------------------------------------------------------------------------------------------------
 * V1: Mini Salonlar — fuaye + iki küçük salon (B kod kilitli)
 * ---------------------------------------------------------------------------------------------- */
function plan1(p) {
  const {
    H, iu0, iu1, iv1,
  } = p;
  const F = iv1 >= 11 ? 4 : 3;
  const hv0 = F + 1;
  const wA = (iu0 + iu1) >> 1;
  p.room('fuaye', [iu0, 0, iu1, F], { role: 'giris' });
  p.room('salonA', [iu0, hv0, wA, iv1], { role: 'salon' });
  p.room('salonB', [wA + 1, hv0, iu1, iv1], { role: 'salon' });
  const lock = p.makeKod('b', 1, 3);
  const cA = (iu0 + wA) >> 1;
  const cB = (wA + 1 + iu1) >> 1;
  p.door('gA', 'fuaye', 'salonA', { axis: 'u', line: F, c: cA, w: 3, kind: 'arch' });
  const gB = p.door('gB', 'fuaye', 'salonB', {
    axis: 'u', line: F, c: cB, w: 3, kind: 'door', lock,
  });
  foyerLook(p, F);
  p.op({ t: 'floor', rect: [iu0, hv0, wA, iv1], pat: 'border', a: B.CLOTH_BLUE, b: 'floor', n: 1 });
  p.op({ t: 'floor', rect: [wA + 1, hv0, iu1, iv1], pat: 'border', a: B.CLOTH_PURPLE, b: 'floor', n: 1 });
  p.op({ t: 'ceil', rect: [iu0, hv0, iu1, iv1], pat: 'grid', a: 'ceil', b: 'floor', n: 3 });
  p.liner({ pat: 'panels', n: 1, m: 4, a: 'wall', b: 'wall2', c: ID.FACADE_LIGHT });
  p.op({ t: 'wall', axis: 'u', line: F, lo: iu0, hi: iu1, y0: 0, y1: H, pat: 'panels', n: 1, m: 4, a: 'wall', b: 'wall2', c: ID.FACADE_LIGHT });
  p.op({ t: 'wall', axis: 'v', line: wA, lo: hv0, hi: iv1, y0: 0, y1: H, pat: 'panels', n: 1, m: 4, a: 'wall', b: 'wall2', c: ID.FACADE_LIGHT });
  p.wallStrip('l', 4, hv0, iv1, ID.NEON_CYAN);
  p.wallStrip('r', 4, hv0, iv1, ID.NEON_PINK);
  p.ceilStrip(cA, hv0 + 1, cA + 1, iv1 - 1, ID.NEON_CYAN);
  p.ceilStrip(cB, hv0 + 1, cB + 1, iv1 - 1, ID.NEON_PINK);
  foyer(p, F, 'l');
  // perdeler: arka duvarda (v = iv1), salon başına bir tane
  const sA = addScreens(p, [[cA, iv1 - 1, 0]], 1);
  const sB = addScreens(p, [[cB, iv1 - 1, 0]], 1);
  [[sA, ID.NEON_CYAN], [sB, ID.NEON_PINK]].forEach(([r, col]) => {
    if (!r) return;
    p.op({
      t: 'face', axis: 'u', line: iv1, lo: r[0] - 1, hi: r[1] + 1, y0: 0, y1: 5, id: 'wall',
    });
    p.accent(r[0], iv1, r[1], iv1 + 1, 1, 4, ID.HOLO);
    p.accent(r[0], iv1, r[1], iv1 + 1, 0, 1, col);
  });
  // salonlarda ikişer sıra koltuk/puf (perdeye bakar: +v)
  const rowsFor = (a, b2) => {
    for (let r = 0; r < 2; r++) {
      const v = hv0 + 1 + r * 3;
      const lo = a + 1 + r;
      const hi = b2 - 1 - r;
      for (let u = lo; u < hi; u++) p.prop(r === 0 ? 'sinema_koltugu' : 'koltuk', u, v, 0, { variant: (u + r) & 3 });
    }
  };
  rowsFor(iu0, wA);
  rowsFor(wA + 1, iu1);
  p.near('hoparlor', iu0, iv1 - 1, 0, null, 1);
  p.near('hoparlor', iu1 - 1, iv1 - 1, 0, null, 1);
  p.near('saksi_buyuk', wA - 1, hv0, 0, { variant: 1 }, 1);
  p.near('saksi_buyuk', iu1 - 1, hv0, 0, { variant: 2 }, 1);
  p.wallProp('cerceve', iu0, hv0 + 3, 3, { variant: p.rng.i(8), y: 1.6 });
  p.wallProp('cerceve', iu1 - 1, hv0 + 3, 1, { variant: p.rng.i(8), y: 1.6 });
  p.prop('projektor', cA, hv0 + 3, 0);
  p.prop('projektor', cB, hv0 + 3, 0);
  p.guard(gB, lock, 'fuaye', [0, 3]);
  p.lampGrid('salonA', ['neon_cyan', 'holo'], 2);
  p.lampGrid('salonB', ['neon_pink', 'holo'], 2);
  p.topUp(22, ['saksi_buyuk', 'hoparlor'], ['cerceve']);
  p.chip('oda', iu1 - 2, iv1 - 1, 0);
}

/* ------------------------------------------------------------------------------------------------
 * V2: Gül Salonu — düz zeminli geniş salon, yüksek perde, sağda VIP loca (mini_hack)
 * ---------------------------------------------------------------------------------------------- */
function plan2(p) {
  const {
    H, iu0, iu1, iv1,
  } = p;
  const F = iv1 >= 11 ? 4 : 3;
  const hv0 = F + 1;
  const lw = 4;
  const wm = iu1 - lw - 1;
  p.room('fuaye', [iu0, 0, iu1, F], { role: 'giris' });
  p.room('salon', [iu0, hv0, wm, iv1], { role: 'salon' });
  p.room('loca', [wm + 1, hv0, iu1, iv1], { role: 'loca' });
  const hack = p.makeHack('l', 2, 'levers');
  const cs = (iu0 + wm) >> 1;
  p.door('gA', 'fuaye', 'salon', {
    axis: 'u', line: F, c: cs, w: 3, kind: 'arch',
  });
  const gL = p.door('gL', 'fuaye', 'loca', {
    axis: 'u', line: F, c: wm + 1 + (lw >> 1), w: 1, kind: 'door', lock: hack,
  });
  foyerLook(p, F);
  p.op({ t: 'floor', rect: [iu0, hv0, wm, iv1], pat: 'border', a: B.CLOTH_PURPLE, b: 'floor', n: 1 });
  p.op({
    t: 'floor', rect: [wm + 1, hv0, iu1, iv1], pat: 'stripeV', a: B.CLOTH_ORANGE, b: B.CLOTH_PURPLE, n: 1,
  });
  p.op({ t: 'ceil', rect: [iu0, hv0, iu1, iv1], pat: 'grid', a: 'ceil', b: 'floor', n: 3 });
  p.liner({ pat: 'panels', n: 1, m: 4, a: 'wall', b: 'wall2', c: ID.FACADE_LIGHT });
  p.op({ t: 'wall', axis: 'u', line: F, lo: iu0, hi: iu1, y0: 0, y1: H, pat: 'panels', n: 1, m: 4, a: 'wall', b: 'wall2', c: ID.FACADE_LIGHT });
  p.op({ t: 'wall', axis: 'v', line: wm, lo: hv0, hi: iv1, y0: 0, y1: H, pat: 'panels', n: 1, m: 4, a: 'wall', b: 'wall2', c: ID.FACADE_LIGHT });
  p.wallStrip('l', 4, hv0, iv1, ID.NEON_PINK);
  p.wallStrip('r', 4, hv0, iv1, ID.NEON_AMBER);
  foyer(p, F, 'r');
  // yüksek perde arka duvarda (v = iv1)
  const sy = 2;
  const sc = [[cs - 3, iv1 - 1, 0], [cs, iv1 - 1, 0], [cs + 3, iv1 - 1, 0]];
  const rng = addScreens(p, sc, sy);
  if (rng) {
    p.op({
      t: 'face', axis: 'u', line: iv1, lo: rng[0] - 1, hi: rng[1] + 1, y0: sy - 1, y1: sy + 4, id: 'wall',
    });
    p.accent(rng[0], iv1, rng[1], iv1 + 1, sy, sy + 3, ID.HOLO);
    p.accent(rng[0], iv1, rng[1], iv1 + 1, sy - 1, sy, ID.NEON_AMBER);
    p.accent(rng[0], iv1, rng[1], iv1 + 1, sy + 3, sy + 4, ID.NEON_PINK);
  }
  // koltuklar: 3 sıra, ortada koridor
  const rowStep = iv1 - hv0 >= 8 ? 3 : 2;
  for (let k = 0; k < 3; k++) {
    const v = hv0 + 1 + k * rowStep;
    if (v > iv1 - 2) break;
    for (let u = cs - 4; u <= cs + 3; u++) {
      if (u === cs - 1 || u === cs) continue;
      if (u <= iu0 || u >= wm - 1) continue;
      p.prop(k === 2 ? 'koltuk' : 'sinema_koltugu', u, v, 0, { variant: (u + k) % 3 });
    }
  }
  p.prop('projektor', cs, hv0 + 1, 0);
  p.near('hoparlor', iu0, iv1 - 1, 1, null, 1);
  p.near('hoparlor', wm - 1, iv1 - 1, 3, null, 1);
  p.wallProp('cerceve', iu0, hv0 + 3, 3, { variant: p.rng.i(8), y: 1.5 });
  p.ceilStrip(cs - 1, hv0 + 1, cs, iv1 - 1, ID.NEON_AMBER);
  p.ceilStrip(cs + 2, hv0 + 1, cs + 3, iv1 - 1, ID.NEON_PINK);
  p.lampGrid('salon', ['neon_pink', 'neon_amber'], 4);
  // loca
  const lc = wm + 1 + (lw >> 1);
  p.prop('alcak_masa', lc, iv1 - 3, 0, { variant: 1 }) || p.near('alcak_masa', lc, iv1 - 3, 0, null, 2);
  p.prop('kanepe', lc, iv1 - 5, 2, { variant: 2 }) || p.near('kanepe', lc, iv1 - 5, 2, null, 2);
  p.prop('koltuk', wm + 1, iv1 - 1, 3, { variant: 3 });
  p.prop('koltuk', iu1 - 1, iv1 - 1, 1, { variant: 1 });
  p.near('saksi_buyuk', iu1 - 1, hv0, 0, { variant: 3 }, 1);
  p.wallProp('cerceve', iu1 - 1, hv0 + 3, 1, { variant: p.rng.i(8), y: 1.6 });
  p.guard(gL, hack, 'fuaye');
  p.lampGrid('loca', ['panel', 'neon_amber'], 2);
  p.ceilStrip(wm + 2, hv0 + 1, wm + 3, iv1 - 1, ID.NEON_AMBER);
  p.topUp(22, ['saksi_buyuk', 'hoparlor'], ['cerceve']);
  p.chip('loca', iu1 - 1, hv0 + 1, 0);
}

const PLANS = [plan0, plan1, plan2];

export const interior = {
  kind: KIND,
  name: 'Holo Sinema',
  footprint() {
    return { w: 18, d: 16, h: 7 };
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
