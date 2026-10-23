/*
 * KEŞİF interior/kinds/arcade — ARCADE (Bülent, "Para yok, skor var.", çok renkli, ortam 'chiptune'). Sözleşme §8, design_city §7.2 #14. interiors_c.
 *
 * 3 varyant (it.variant): 0 Klasik Salon (tek geniş salon: duvar boyunca + ada sırası, ödül tezgâhı)
 *                         1 Çift Salon (karşılama + oyun salonu + kod kilitli bakım odası)
 *                         2 Turnuva Salonu (yükseltilmiş turnuva sahnesi + mini_hack kilitli bakım koridoru)
 * Makineler `arcade_makinesi` (variant/data 0..5 = mini oyun programı; aile dostu, ≤3 Hz değişen emisyon ekranı render tarafında),
 * `interior.screens[0].games[]` her makinenin oyun adını verir. Boyut 18×14×5 (ya da 14×18); kule çekirdeği arkadaysa `Dm`ye kadar.
 */
import { B } from '../../../blocks.js';
import { ID } from '../../cityEmit.js';
import { CPlan, mkPal, paintLayout } from '../cKit.js';

const KIND = 'arcade';
const GAMES = ['yilan_kovala', 'tugla_zipla', 'uzay_gezgin', 'labirent_gezgin', 'balon_topla', 'bulmaca_kup'];

const PALS = [
  mkPal('arcade0', {
    floor: ID.BLACK, floor2: ID.PURPLE, wall: ID.FACADE_DARK, wall2: ID.PURPLE, ceil: ID.FACADE_DARK, trim: ID.NEON_PINK, glow: ID.NEON_PINK, glow2: ID.NEON_CYAN,
    cloth: B.CLOTH_PURPLE, cloth2: B.CLOTH_BLACK, glass: B.GLASS_PURPLE, lamp: 'neon_pink',
  }),
  mkPal('arcade1', {
    floor: ID.FACADE_DARK, floor2: ID.BLUE, wall: ID.FACADE_DARK, wall2: ID.BLUE, ceil: ID.FACADE_DARK, trim: ID.NEON_LIME, glow: ID.NEON_LIME, glow2: ID.NEON_CYAN,
    cloth: B.CLOTH_BLUE, cloth2: B.CLOTH_YELLOW, glass: B.GLASS_BLUE, lamp: 'neon_cyan',
  }),
  mkPal('arcade2', {
    floor: ID.BLACK, floor2: ID.FACADE_DARK, wall: ID.FACADE_DARK, wall2: ID.ORANGE, ceil: ID.FACADE_DARK, trim: ID.NEON_AMBER, glow: ID.NEON_AMBER, glow2: ID.NEON_PINK,
    cloth: B.CLOTH_RED, cloth2: B.CLOTH_YELLOW, glass: B.GLASS_ORANGE, lamp: 'neon_amber',
  }),
];
const MOODS = [{ hue: 'renkli', light: 12 }, { hue: 'camgobegi', light: 12 }, { hue: 'turuncu', light: 12 }];

/* ------------------------------------------------------------------------------------------------
 * Ortak parçalar
 * ---------------------------------------------------------------------------------------------- */
function mkCab(p) {
  return (u, v, ly, y) => {
    const g = (p.vc = (p.vc || 0) + 1) % 6;
    return p.prop('arcade_makinesi', u, v, ly, { variant: g, data: g, y: y || 0 });
  };
}

/** Hücre listesine (sırayla) en çok max makine yerleştirir; yerleşemeyeni atlar. cells: [[u,v,ly,y?]]. */
function cabs(cab, cells, max) {
  let n = 0;
  for (let i = 0; i < cells.length && n < max; i++) if (cab(cells[i][0], cells[i][1], cells[i][2], cells[i][3])) n++;
  return n;
}

/** Ada: ortada 2 hücrelik geçit, iki yandan simetrik doldurma; sırt sırta iki sıra (vI: -v'ye bakar, vI+1: +v'ye bakar). */
function islandCells(u0, u1, cu, vI) {
  const out = [];
  for (let k = 0; k < 20; k++) {
    [cu - 2 - k, cu + 1 + k].forEach((u) => {
      if (u >= u0 && u < u1) {
        out.push([u, vI, 2]);
        out.push([u, vI + 1, 0]);
      }
    });
  }
  return out;
}

function floorLook(p, rect, v) {
  const [u0, v0, u1, v1] = rect;
  const stripe = v === 0 ? ID.PURPLE : v === 1 ? ID.BLUE : ID.ORANGE;
  p.op({ t: 'floor', rect, pat: 'grid', a: 'floor', b: stripe, n: 3 });
  const cols = v === 0 ? [B.CLOTH_RED, B.CLOTH_BLUE, B.CLOTH_YELLOW] : v === 1 ? [B.CLOTH_GREEN, B.CLOTH_YELLOW, B.CLOTH_RED] : [B.CLOTH_RED, B.CLOTH_YELLOW, B.CLOTH_ORANGE];
  cols.forEach((c, i) => p.op({ t: 'floor', rect: [u0, v0, u1, v1], pat: 'speckle', a: null, b: c, s: 31 + i * 7, pct: 5 }));
}

function linerLook(p, v) {
  if (v === 1) p.liner({ pat: 'dash', m: 3, a: 'wall2', c: ID.FACADE_LIGHT });
  else p.liner({ pat: 'panels', n: 1, m: 4, a: 'wall', b: 'wall2', c: ID.FACADE_LIGHT });
}

/** Ödül köşesi: tezgâh + sahip + vitrin + tabureler (left: sol ön köşe). */
function prizeCorner(p, left) {
  const { iu0, iu1 } = p;
  const cu = left ? iu0 + 2 : iu1 - 3;
  const ly = left ? 1 : 3;
  const own = left ? iu0 : iu1 - 1;
  p.prop('odul_tezgahi', cu, 2, ly) || p.near('odul_tezgahi', cu, 2, ly, null, 2);
  p.anchor('prize_counter', cu, 2, ly, 0);
  p.stand(own, 2, ly, 1);
  p.signature(cu, 2, 1.2, 1);
  p.prop('vitrin', own, 5, ly) || p.near('vitrin', own, 5, ly, null, 2);
  p.prop('tabure', left ? cu + 2 : cu - 2, 2, 0, { variant: 1 });
  p.prop('tabure', left ? cu + 2 : cu - 2, 3, 0, { variant: 2 });
}

function loungeCorner(p, left) {
  const { iu0, iu1 } = p;
  const u0 = left ? iu0 + 1 : iu1 - 2;
  p.prop('puf', u0, 1, 0, { variant: 0 });
  p.prop('puf', left ? u0 + 1 : u0 - 1, 3, 0, { variant: 1 });
  p.prop('otomat_icecek', left ? iu0 : iu1 - 1, 5, left ? 1 : 3);
  p.prop('otomat_atistirmalik', left ? iu0 : iu1 - 1, 7, left ? 1 : 3);
}

function frontSign(p) {
  p.wallProp('neon_tabela_ic', p.du, 0, 2, { y: 3.1, data: p.brandData('skor_arcade'), variant: p.v });
}

function scoreBoard(p, u, vWall, side) {
  return p.wallProp('skor_tablosu', u, vWall, side, { y: 2.45, data: p.brandData('skor_arcade') });
}

/* ------------------------------------------------------------------------------------------------
 * V0: Klasik Salon
 * ---------------------------------------------------------------------------------------------- */
function plan0(p) {
  const {
    W, iu0, iu1, iv1,
  } = p;
  const cab = mkCab(p);
  p.room('salon', [iu0, 0, iu1, iv1], { role: 'salon' });
  floorLook(p, [iu0, 0, iu1, iv1], 0);
  p.op({ t: 'ceil', rect: [iu0, 0, iu1, iv1], pat: 'grid', a: 'ceil', b: 'floor', n: 3 });
  linerLook(p, 0);
  const cu = W >> 1;
  p.ceilStrip(cu - 1, 1, cu, iv1 - 1, ID.NEON_CYAN);
  p.ceilStrip(iu0 + 3, 1, iu0 + 4, iv1 - 1, ID.NEON_PINK);
  p.ceilStrip(iu1 - 4, 1, iu1 - 3, iv1 - 1, ID.NEON_PINK);
  p.wallStrip('l', 3, 0, iv1, ID.NEON_PINK);
  p.wallStrip('r', 3, 0, iv1, ID.NEON_CYAN);
  p.wallStrip('b', 3, iu0, iu1, ID.NEON_AMBER);
  const left = p.rng.chance(0.5);
  prizeCorner(p, !left);
  loungeCorner(p, left);
  frontSign(p);
  const wallStart = 8;
  const wl = [];
  const wr = [];
  for (let v = wallStart; v < iv1; v++) {
    wl.push([iu0, v, 1]);
    wr.push([iu1 - 1, v, 3]);
  }
  cabs(cab, wl, 5);
  cabs(cab, wr, 5);
  const back = [];
  for (let u = cu - 3; u < cu + 3; u++) back.push([u, iv1 - 1, 2]);
  cabs(cab, back, 6);
  const vI = Math.max(wallStart + 1, (iv1 >> 1) - 1);
  cabs(cab, islandCells(iu0 + 3, iu1 - 3, cu, vI), 10);
  scoreBoard(p, cu, iv1 - 1, 0);
  p.near('hoparlor', iu0, iv1 - 2, 1, null, 1);
  p.near('hoparlor', iu1 - 1, iv1 - 2, 3, null, 1);
  p.lampGrid('salon', ['neon_pink', 'neon_cyan', 'neon_cyan', 'neon_pink'], 4);
  p.topUp(22, ['hoparlor', 'puf'], ['cerceve']);
  p.chip('oda', iu0 + 1, iv1 - 2, 0);
}

/* ------------------------------------------------------------------------------------------------
 * V1: Çift Salon — karşılama + oyun salonu + kod kilitli bakım odası
 * ---------------------------------------------------------------------------------------------- */
function plan1(p) {
  const {
    H, iu0, iu1, iv1,
  } = p;
  const cab = mkCab(p);
  const F = iv1 >= 11 ? 5 : 4;
  const bw = 4;
  const hv0 = F + 1;
  const wo = iu1 - bw - 1; // oyun salonu bitişi (duvar u = wo)
  p.room('giris', [iu0, 0, iu1, F], { role: 'giris' });
  p.room('oyun', [iu0, hv0, wo, iv1], { role: 'salon' });
  p.room('bakim', [wo + 1, hv0, iu1, iv1], { role: 'bakim' });
  const co = (iu0 + wo) >> 1;
  p.door('gO', 'giris', 'oyun', {
    axis: 'u', line: F, c: co, w: 3, kind: 'arch',
  });
  const lock = p.makeKod('b', 1, 3);
  const gB = p.door('gB', 'giris', 'bakim', {
    axis: 'u', line: F, c: wo + 1 + (bw >> 1), w: 1, kind: 'door', lock,
  });
  floorLook(p, [iu0, 0, iu1, F], 1);
  floorLook(p, [iu0, hv0, wo, iv1], 1);
  p.op({
    t: 'floor', rect: [wo + 1, hv0, iu1, iv1], pat: 'checker', a: 'floor', b: 'floor2', n: 2,
  });
  p.op({ t: 'ceil', rect: [iu0, 0, iu1, iv1], pat: 'grid', a: 'ceil', b: 'floor', n: 3 });
  linerLook(p, 1);
  p.op({ t: 'wall', axis: 'u', line: F, lo: iu0, hi: iu1, y0: 0, y1: H, pat: 'wains', n: 1, a: 'wall2', b: 'wall', c: 'wall2' });
  p.op({ t: 'wall', axis: 'v', line: wo, lo: hv0, hi: iv1, y0: 0, y1: H, pat: 'wains', n: 1, a: 'wall2', b: 'wall', c: 'wall2' });
  p.wallStrip('l', 3, 0, iv1, ID.NEON_LIME);
  p.wallStrip('r', 3, 0, iv1, ID.NEON_CYAN);
  p.wallStrip('b', 3, iu0, iu1, ID.NEON_LIME);
  p.ceilStrip(iu0 + 2, 1, iu0 + 3, F, ID.NEON_LIME);
  p.ceilStrip(iu1 - 3, 1, iu1 - 2, F, ID.NEON_CYAN);
  p.ceilStrip(co, hv0 + 1, co + 1, iv1 - 1, ID.NEON_CYAN);
  // karşılama
  prizeCorner(p, p.rng.chance(0.5));
  loungeCorner(p, p.rng.chance(0.5));
  frontSign(p);
  p.wallProp('cerceve', p.du - 4, 0, 2, { variant: 1, y: 1.6 });
  p.wallProp('cerceve', p.du + 4, 0, 2, { variant: 5, y: 1.6 });
  // bakım odası (önce: kırpma sırasında boş kalmasın)
  const bu = wo + 1;
  p.fillWall('bakim', 1, 'raf_unitesi', { count: 1, from: 1 });
  p.fillWall('bakim', 3, 'raf_unitesi', { count: 1, from: 2 });
  p.fillWall('bakim', 0, 'koli', { count: 2, from: 0, step: 1 });
  p.fillWall('bakim', 2, 'dolap_sirali', { count: 1, from: 0 });
  p.near('arcade_makinesi', iu1 - 1, hv0 + 1, 3, { variant: 2, data: 2 }, 1);
  p.prop('koli_yigini', bu, iv1 - 1, 0, { variant: 1 });
  // oyun salonu: duvar boyunca + iki ada sırası (üst sınırlı)
  const wlc = [];
  for (let v = hv0 + 1; v < iv1; v++) wlc.push([iu0, v, 1]);
  cabs(cab, wlc, 5);
  const backc = [];
  for (let u = co - 3; u < co + 3; u++) backc.push([u, iv1 - 1, 2]);
  cabs(cab, backc, 6);
  cabs(cab, islandCells(iu0 + 2, wo - 1, co, hv0 + 3), 8);
  if (hv0 + 8 < iv1 - 1) cabs(cab, islandCells(iu0 + 2, wo - 1, co, hv0 + 7), 6);
  scoreBoard(p, co, iv1 - 1, 0);
  p.guard(gB, lock, 'giris', [0, 1, 2]);
  p.lampGrid('giris', ['neon_cyan', 'panel'], 2);
  p.lampGrid('oyun', ['neon_pink', 'neon_cyan', 'neon_lime', 'neon_pink'], 4);
  p.lampGrid('bakim', ['panel'], 1);
  p.topUp(22, ['hoparlor', 'puf'], ['cerceve']);
  p.chip('bakim', iu1 - 1, iv1 - 1, 0);
}

/* ------------------------------------------------------------------------------------------------
 * V2: Turnuva Salonu — yükseltilmiş sahne + mini_hack kilitli bakım koridoru
 * ---------------------------------------------------------------------------------------------- */
function plan2(p) {
  const {
    W, H, iu0, iu1, iv1,
  } = p;
  const cab = mkCab(p);
  const bw = W >= 18 ? 4 : 3;
  // bakım koridoru kapıdan uzak yanda (giriş hücresi ana salonda kalsın)
  const right = p.du < (iu0 + iu1) / 2;
  let sx0;
  let sx1;
  let bx0;
  let bx1;
  let wl;
  if (right) {
    sx0 = iu0; sx1 = iu1 - bw - 1; wl = sx1; bx0 = wl + 1; bx1 = iu1;
  } else {
    bx0 = iu0; bx1 = iu0 + bw; wl = bx1; sx0 = wl + 1; sx1 = iu1;
  }
  p.room('salon', [sx0, 0, sx1, iv1], { role: 'salon' });
  p.room('bakim', [bx0, 0, bx1, iv1], { role: 'bakim' });
  const hack = p.makeHack('b', 2, 'dice');
  const gB = p.door('gB', right ? 'salon' : 'bakim', right ? 'bakim' : 'salon', {
    axis: 'v', line: wl, c: 3, w: 1, kind: 'door', lock: hack,
  });
  floorLook(p, [sx0, 0, sx1, iv1], 2);
  p.op({
    t: 'floor', rect: [bx0, 0, bx1, iv1], pat: 'hazard', a: 'floor', b: B.CLOTH_YELLOW, n: 2,
  });
  p.op({ t: 'ceil', rect: [iu0, 0, iu1, iv1], pat: 'grid', a: 'ceil', b: 'floor', n: 3 });
  linerLook(p, 2);
  p.op({ t: 'wall', axis: 'v', line: wl, lo: 0, hi: iv1, y0: 0, y1: H, pat: 'wains', n: 1, a: 'wall2', b: 'wall', c: 'wall2' });
  p.wallStrip('l', 3, 0, iv1, ID.NEON_AMBER);
  p.wallStrip('r', 3, 0, iv1, ID.NEON_AMBER);
  p.wallStrip('b', 3, iu0, iu1, ID.NEON_PINK);
  const cuS = (sx0 + sx1) >> 1;
  const hw = Math.max(2, Math.min(4, ((sx1 - sx0) >> 1) - 1));
  const sv0 = iv1 - 4;
  const su0 = cuS - hw;
  const su1 = cuS + hw;
  if (iv1 >= 12) {
    // sahne (arka duvar önünde 3 satır) + ada sıraları + izleyici
    p.op({
      t: 'raise', rect: [su0, sv0, su1, sv0 + 1], h2: 1, slab: B.SLAB,
    });
    p.op({
      t: 'raise', rect: [su0, sv0 + 1, su1, iv1], h2: 2, cube: 'wall', top: B.CLOTH_RED,
    });
    p.reserve([su0, sv0, su1, iv1], 0, 1);
    p.accent(su0, sv0 - 1, su1, sv0, -1, 0, ID.NEON_AMBER);
    [su0, cuS - 1, cuS, su1 - 1].forEach((u) => cab(u, iv1 - 2, 2, 1));
    scoreBoard(p, cuS, iv1 - 1, 0);
    p.ceilStrip(cuS - 1, Math.max(1, sv0 - 6), cuS, iv1 - 1, ID.NEON_PINK);
    p.ceilStrip(su0, 1, su0 + 1, iv1 - 1, ID.NEON_AMBER);
    p.ceilStrip(su1 - 1, 1, su1, iv1 - 1, ID.NEON_AMBER);
    const vI = Math.max(7, sv0 - 5);
    for (let u = sx0 + 2; u < sx1 - 2; u++) {
      if (u === cuS - 1 || u === cuS) continue;
      cab(u, vI, 2);
      cab(u, vI + 1, 0);
    }
    if (sv0 - 2 > vI + 2) {
      for (let u = cuS - 3; u <= cuS + 3; u += 2) p.prop(u & 2 ? 'tabure' : 'puf', u, sv0 - 2, 0, { variant: u & 3 });
    }
    for (let v = 8; v < iv1 - 4; v++) {
      cab(sx0, v, 1);
      cab(sx1 - 1, v, 3);
    }
  } else {
    // sığ (kule çekirdekli) parsel: sahnesiz, duvar boyunca + ada sırası + küçük skor köşesi
    scoreBoard(p, cuS, iv1 - 1, 0);
    p.ceilStrip(cuS - 1, 1, cuS, iv1 - 1, ID.NEON_PINK);
    p.ceilStrip(sx0 + 2, 1, sx0 + 3, iv1 - 1, ID.NEON_AMBER);
    p.ceilStrip(sx1 - 3, 1, sx1 - 2, iv1 - 1, ID.NEON_AMBER);
    for (let v = 6; v < iv1; v++) {
      cab(sx0, v, 1);
      cab(sx1 - 1, v, 3);
    }
    for (let u = sx0 + 1; u < sx1 - 1; u++) cab(u, iv1 - 1, 2);
    const vI = Math.max(6, (iv1 >> 1));
    for (let u = sx0 + 3; u < sx1 - 3; u++) {
      if (u === cuS - 1 || u === cuS) continue;
      cab(u, vI, 2);
      cab(u, vI + 1, 0);
    }
  }
  frontSign(p);
  prizeCorner(p, right ? true : false);
  const vend = right ? sx1 - 1 : sx0;
  p.prop('otomat_icecek', vend, 1, right ? 3 : 1);
  p.prop('otomat_atistirmalik', vend, 3, right ? 3 : 1);
  p.near('hoparlor', su0 - 1, sv0, 0, null, 1);
  p.near('hoparlor', su1, sv0, 0, null, 1);
  // bakım koridoru
  const bl = right ? bx0 : bx1 - 1;
  const br = right ? bx1 - 1 : bx0;
  const lyIn = right ? 1 : 3;
  const lyOut = right ? 3 : 1;
  p.near('raf_unitesi', bl, 2, lyIn, null, 1);
  p.near('raf_unitesi', br, 5, lyOut, null, 1);
  p.prop('koli_yigini', bl, 8, lyIn, { variant: 1 }) || p.near('koli_yigini', bl, 8, lyIn, null, 2);
  p.prop('koli', br, 9, lyOut, { variant: 2 });
  p.near('arcade_makinesi', bl, iv1 - 2, lyIn, { variant: 4, data: 4 }, 2);
  p.near('arcade_makinesi', br, iv1 - 2, lyOut, { variant: 5, data: 5 }, 2);
  p.prop('dolap_sirali', bl, 11, lyIn, { variant: 2 });
  p.guard(gB, hack, 'salon');
  p.lampGrid('salon', ['neon_amber', 'neon_pink', 'neon_pink', 'neon_amber'], 4);
  p.lampGrid('bakim', ['panel'], 2);
  p.topUp(22, ['hoparlor', 'puf'], ['cerceve']);
  p.chip('bakim', br, iv1 - 1, 0);
}

const PLANS = [plan0, plan1, plan2];

export const interior = {
  kind: KIND,
  name: 'Arcade',
  footprint() {
    return { w: 18, d: 14, h: 5 };
  },
  palette(it) {
    return PALS[(it.variant | 0) % 3];
  },
  plan(lot, rng, variant, ctx) {
    const p = new CPlan(ctx, rng, variant);
    PLANS[variant % 3](p);
    return p.finish({
      mood: MOODS[variant % 3],
      post(it) {
        it.screens = [{
          kind: 'arcade',
          games: it.props.filter((q) => q.kind === 'arcade_makinesi').map((q) => ({ slot: q.slot, game: GAMES[q.variant % 6] })),
        }];
      },
    });
  },
  emit(W, interior, ctx) {
    paintLayout(ctx.kit, ctx.pal, interior.layout);
  },
};

export default interior;
