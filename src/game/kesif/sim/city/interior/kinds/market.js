/*
 * KEŞİF sim/city/interior/kinds — 9. MARKET (Hasan Amca, "Sepet dolsun!"; beyaz/aydınlık, ortam: market; imza: enerji hücresi).
 * Rezerv 20×14×4 (kapı çizgisine göre 20×14 ya da 14×20). Raf sıraları, soğutucu duvar, kasa. Satıcı çapası: type:'vendor' (Faz 4: satıcı NPC; kasa masası = dükkân propu),
 * sahip duruşu: ownerPost (kasanın arkası). Üç varyant:
 *   V0 "Mahalle Marketi" : kapıdan derine uzanan 3 reyon koridoru + ön kasa + arkada KİLİTLİ depo (Rün Dizisi, kademe 0 → gri kart ödülü) ve personel odası
 *   V1 "Gece Marketi"    : kapıya paralel yılan raf sıraları, uzun soğutucu duvarı, otomat köşesi + yan şeritte KİLİTLİ depo (Renk Kolları, kademe 1)
 *   V2 "Pazar Salonu"    : açık salon, ortada ada vitrinleri, meyve/koli tezgâhları, arkada depo (kod kilidi, ipucu sahipte) ve ofis
 * Reyon renk kodu: yeşil (meyve) · turuncu (fırın) · mavi (içecek) · sarı (atıştırmalık) — zeminde renkli şerit + tavanda asılı reyon bayrakları.
 */
import { ID } from '../../cityEmit.js';
import { B } from '../../../blocks.js';
import { BuilderB, Deco, brandSign, pickStrip } from '../kindKitB.js';
import { PALETTES } from '../kit.js';

const KIND = 'market';
const P = (o) => Object.freeze(o);
const PAL = [
  P(Object.assign({}, PALETTES.beyaz, {
    floor: ID.WHITE, floor2: ID.FACADE_LIGHT, wall: ID.WHITE, wall2: ID.BLUE, ceil: ID.WHITE, trim: ID.BLUE, glow: ID.NEON_CYAN, glow2: ID.NEON_LIME, lamp: 'panel',
  })),
  P(Object.assign({}, PALETTES.beyaz, {
    floor: ID.FACADE_DARK, floor2: ID.WHITE, wall: ID.FACADE_LIGHT, wall2: ID.GREEN, ceil: ID.WHITE, trim: ID.NEON_LIME, glow: ID.NEON_LIME, glow2: ID.NEON_PINK, lamp: 'panel', glass: B.GLASS_GREEN,
  })),
  P(Object.assign({}, PALETTES.beyaz, {
    floor: B.PLANKS_BIRCH, floor2: B.PLANKS_OAK, wall: ID.WHITE, wall2: ID.ORANGE, ceil: ID.WHITE, trim: ID.NEON_AMBER, glow: ID.NEON_AMBER, glow2: ID.NEON_CYAN, lamp: 'lantern', glass: B.GLASS_ORANGE,
  })),
];
const KEEP = ['kasa_masasi', 'market_rafi', 'bilgi_terminali', 'neon_tabela_ic', 'market_buzluk'];
const PAD = ['koli', 'saksi_buyuk', 'koli_yigini', 'sandalye', 'raf_unitesi'];
const AISLE = [ID.GREEN, ID.ORANGE, ID.BLUE, ID.YELLOW];
const BANNER = [B.CLOTH_GREEN, B.CLOTH_ORANGE, B.CLOTH_BLUE, B.CLOTH_YELLOW];

/** Kasa masası: tercih (ku) çevresinde ön bölgede ilk yerleşen konum; sahip duruşu + satıcı çapası + imza. Dönüş yerel u. */
function counter(b, ku, W, variant) {
  const cands = [];
  [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5].forEach((d) => {
    const u = Math.max(0, Math.min(W - 2, ku + d));
    cands.push([u, 2, 2, { variant }], [u, 3, 2, { variant }]);
  });
  const r = b.putFirst('kasa_masasi', cands);
  if (!r) return -1;
  const [u, v] = b.lastCand;
  b.post(u + 1, v + 1, 2, 'satis');
  b.anchor('vendor', u + 1, v + 1, 2, 0);
  b.signature(u, v, 1.2);
  return u;
}

/** Kapıdan derine uzanan raf koridoru: u konumunda çift sıra (sol/sağ), v0..v1 boyunca market_rafi (2 uzun, v ekseninde). */
function aisleShelves(b, u, v0, v1, k) {
  let n = 0;
  let v = v0;
  const keys = ['market_rafi', 'market_rafi', 'raf_unitesi', 'market_rafi', 'market_buzluk'];
  while (v + 2 <= v1) {
    const key = keys[((v - v0) >> 1) % keys.length];
    if (b.put(key, u, v, 1, { flush: 3, variant: (k * 2 + ((v - v0) >> 1)) % 6 })) n++;
    if (b.put(key === 'market_buzluk' ? 'market_rafi' : key, u + 3, v, 3, { flush: 1, variant: (k * 3 + ((v - v0) >> 1) + 1) % 6 })) n++;
    v += 2;
  }
  return n;
}

function planV0(b, ctx, rng) {
  const W = b.uw;
  const D = b.ud;
  const H = b.H;
  const du = b.edu;
  const sd = D - 5; // satış katı derinliği
  const dw = Math.min(8, W >> 1);
  const flip = rng.chance(0.5);
  b.room('satis', [0, 0, W, sd], { role: 'satis' });
  const depo = flip ? [W - dw, sd + 1, W, D] : [0, sd + 1, dw, D];
  const ofis = flip ? [0, sd + 1, W - dw - 1, D] : [dw + 1, sd + 1, W, D];
  b.room('depo', depo, { role: 'depo' });
  b.room('ofis', ofis, { role: 'personel' });
  b.lockedDoor('d_depo', 'satis', 'depo', {
    axis: 'u', line: sd, c: b.doorC(depo, sd, (depo[0] + depo[2]) >> 1, 1), w: 1,
  }, { kind: 'mini_hack', tier: 0, data: { game: 'simon' } });
  b.door('d_ofis', 'satis', 'ofis', {
    axis: 'u', line: sd, c: b.doorC(ofis, sd, (ofis[0] + ofis[2]) >> 1, 1), w: 1, kind: 'door',
  });
  b.layout = {
    v: 0, rooms: { satis: b.rr('satis'), depo: b.rr('depo'), ofis: b.rr('ofis') }, aisles: [], flip,
  };
  // kasa (kapının yanında, kapıdan uzak yarıda): sahip + satıcı
  const side = du < W / 2 ? 1 : -1;
  const ku = side > 0 ? Math.min(W - 3, du + 3) : Math.max(0, du - 4);
  counter(b, ku, W, 1);
  b.atFront('otomat_atistirmalik', side > 0 ? 0 : W - 1, 0);
  b.atFront('otomat_icecek', side > 0 ? 1 : W - 2, 0);
  b.atFront('otomat_enerji', side > 0 ? 2 : W - 3, 0);
  b.wall('neon_tabela_ic', Math.max(1, Math.min(W - 2, du + (side > 0 ? -4 : 4))), 0, 2, { span: 3, y: 2, data: brandSign(b), variant: 0 });
  b.put('sandalye', side > 0 ? W - 1 : 0, 1, 0, { variant: 1 });
  b.atFront('saksi_buyuk', side > 0 ? W - 2 : 1, 0, { variant: 2 });
  // reyonlar: kapıdan derine (v=5 ..)
  const nA = Math.max(2, Math.min(3, Math.floor((W - 1) / 5)));
  const span = Math.floor((W - 1) / nA);
  let shelves = 0;
  for (let a = 0; a < nA; a++) {
    const u = Math.max(0, Math.min(W - 4, 1 + a * span));
    const color = a % 4;
    shelves += aisleShelves(b, u, 5, sd - 1, a);
    b.layout.aisles.push({ u: u + b.ou + 1, v0: 4, v1: sd, color });
  }
  // son duvar boyunca soğutucu + vitrin
  b.atBack('market_buzluk', 0, sd - 1, { variant: 0 });
  b.atBack('market_buzluk', W - 2, sd - 1, { variant: 1 });
  b.atBack('vitrin', (W >> 1) - 1, sd - 1, { variant: 1 });
  b.atBack('bilgi_terminali', (W >> 1) + 1, sd - 1);
  b.put('koli_yigini', W - 2, 6, 3, { flush: 1, variant: 0 });
  b.atRight('saksi_buyuk', W - 1, sd - 3, { variant: 0 });
  b.atLeft('saksi_buyuk', 0, sd - 3, { variant: 3 });
  // depo
  b.atBack('koli_yigini', depo[0] + 1, D - 1, { variant: 1 });
  b.atBack('koli', depo[2] - 2, D - 1, { variant: 2 });
  b.run('koli', depo[0] + 1, sd + 2, 2, 'v', 0, { variants: [0, 1] });
  b.atRight('raf_unitesi', depo[2] - 1, sd + 2, { variant: 2 });
  b.chip('oda', depo[0] + 3, D - 2, 0);
  // personel odası
  b.atBack('kasa_masasi', ofis[0] + 1, D - 1, { variant: 0 });
  b.atBack('raf_unitesi', ofis[2] - 3, D - 1, { variant: 1 });
  b.atFront('koli', ofis[0], sd + 1, { variant: 1 });
  b.atRight('sandalye', ofis[2] - 1, sd + 2);
  // ışık
  b.lightGrid('satis', 4, 'panel');
  b.lamp('depo', (depo[0] + depo[2]) >> 1, sd + 3, 'lantern');
  b.lamp('ofis', (ofis[0] + ofis[2]) >> 1, sd + 3, 'panel');
  b.accent(1, sd - 1, W - 1, sd, H - 1, H, ID.NEON_CYAN);
  b.accent(1, 1, W - 1, 2, H - 1, H, ID.NEON_LIME);
  b.pad(PAD, 28, rng);
  b.trim(38, KEEP);
  void shelves;
}

function planV1(b, ctx, rng) {
  const W = b.uw;
  const D = b.ud;
  const H = b.H;
  const du = b.edu;
  const { right, sw } = pickStrip(W, du, 6);
  const hall = right ? [0, 0, W - sw - 1, D] : [sw + 1, 0, W, D];
  const strip = right ? [W - sw, 0, W, D] : [0, 0, sw, D];
  const hs = (D >> 1) - 1;
  const ofis = [strip[0], 0, strip[2], hs];
  const depo = [strip[0], hs + 1, strip[2], D];
  b.room('satis', hall, { role: 'satis' });
  b.room('ofis', ofis, { role: 'personel' });
  b.room('depo', depo, { role: 'depo' });
  const lineU = right ? W - sw - 1 : sw;
  b.door('d_ofis', 'satis', 'ofis', {
    axis: 'v', line: lineU, c: 2, w: 1, kind: 'door',
  });
  b.lockedDoor('d_depo', 'ofis', 'depo', {
    axis: 'u', line: hs, c: strip[0] + 2, w: 1,
  }, { kind: 'mini_hack', tier: 1, data: { game: 'levers' } });
  b.layout = {
    v: 1, rooms: { satis: b.rr('satis'), ofis: b.rr('ofis'), depo: b.rr('depo') }, rows: [], right,
  };
  const hl = hall[0];
  const hr = hall[2];
  const hw = hr - hl;
  // kasa + otomat köşesi
  const ku = right ? Math.min(hr - 3, du + 3) : Math.max(hl, du - 4);
  counter(b, ku, hr, 2);
  const vend = right ? hl : hr - 1;
  b.atFront('otomat_enerji', vend, 0);
  b.atFront('otomat_icecek', right ? hl + 1 : hr - 2, 0);
  b.atFront('otomat_atistirmalik', right ? hl + 2 : hr - 3, 0);
  b.wall('neon_tabela_ic', Math.max(hl + 1, Math.min(hr - 2, du + (right ? -4 : 4))), 0, 2, { span: 3, y: 2, data: brandSign(b), variant: 1 });
  // soğutucu duvarı (arka)
  const nCool = Math.max(2, Math.min(5, Math.floor(hw / 2)));
  for (let i = 0; i < nCool; i++) b.atBack('market_buzluk', hl + i * 2, D - 1, { variant: i & 1 });
  // yılan raf sıraları (kapıya paralel): v = 5, 8, 11 ... ; boşluk yönü ardışık sıralarda değişir
  let row = 0;
  for (let v = 5; v + 2 < D - 2; v += 3, row++) {
    const gapLeft = (row & 1) === 0;
    const u0 = gapLeft ? hl + 3 : hl;
    const u1 = gapLeft ? hr : hr - 3;
    let n = 0;
    for (let u = u0; u + 2 <= u1; u += 2) {
      if (b.put(row % 2 ? 'market_rafi' : 'raf_unitesi', u, v, 2, { variant: (row * 2 + n) % 6, flush: 0 })) n++;
    }
    b.layout.rows.push({ v: v + 0, gapLeft, u0: u0 + b.ou, u1: u1 + b.ou });
  }
  b.atLeft('saksi_buyuk', hl, 6, { variant: 1 });
  b.atRight('koli_yigini', hr - 1, 7, { variant: 2 });
  b.atRight('bilgi_terminali', hr - 1, 4);
  b.put('manken', hl + 1, 3, 0, { variant: 1 });
  // personel + depo
  b.atBack('kasa_masasi', ofis[0] + 1, ofis[3] - 1, { variant: 0 });
  b.atBack('raf_unitesi', ofis[2] - 3, ofis[3] - 1, { variant: 3 });
  b.atFront('sandalye', ofis[0] + 3, 0);
  b.atBack('raf_unitesi', depo[0] + 1, depo[3] - 1, { variant: 2 });
  b.atBack('koli_yigini', depo[2] - 3, depo[3] - 1, { variant: 0 });
  b.run('koli', depo[0], depo[1] + 1, 2, 'v', 0, { variants: [1, 2] });
  b.atRight('koli', depo[2] - 1, depo[1] + 1, { variant: 0 });
  b.chip('oda', depo[0] + 3, depo[1] + 3, 0);
  // ışık
  b.lightGrid('satis', 4, 'panel');
  b.lamp('ofis', ofis[0] + 3, 3, 'lantern');
  b.lamp('depo', depo[0] + 3, depo[1] + 3, 'neon_lime');
  b.accent(hl + 1, D - 2, hr - 1, D - 1, H - 1, H, ID.NEON_LIME);
  b.accent(hl + 1, 4, hr - 1, 5, H - 1, H, ID.NEON_PINK);
  b.pad(PAD, 28, rng);
  b.trim(38, KEEP);
}

function planV2(b, ctx, rng) {
  const W = b.uw;
  const D = b.ud;
  const H = b.H;
  const du = b.edu;
  const bd = 5;
  const sd = D - bd - 1;
  const flip = rng.chance(0.5);
  const dw = Math.min(8, W >> 1);
  b.room('satis', [0, 0, W, sd], { role: 'satis' });
  const depo = flip ? [W - dw, sd + 1, W, D] : [0, sd + 1, dw, D];
  const ofis = flip ? [0, sd + 1, W - dw - 1, D] : [dw + 1, sd + 1, W, D];
  b.room('depo', depo, { role: 'depo' });
  b.room('ofis', ofis, { role: 'personel' });
  b.lockedDoor('d_depo', 'satis', 'depo', {
    axis: 'u', line: sd, c: b.doorC(depo, sd, (depo[0] + depo[2]) >> 1, 1), w: 1,
  }, { kind: 'kod', tier: 0, data: { clue: 'owner' } });
  b.door('d_ofis', 'satis', 'ofis', {
    axis: 'u', line: sd, c: b.doorC(ofis, sd, (ofis[0] + ofis[2]) >> 1, 3), w: 3, kind: 'arch',
  });
  b.layout = {
    v: 2, rooms: { satis: b.rr('satis'), depo: b.rr('depo'), ofis: b.rr('ofis') }, flip,
  };
  // kasa kapıdan uzak yarıda, sahip arkasında
  const side = du < W / 2 ? 1 : -1;
  const ku = side > 0 ? Math.min(W - 3, du + 3) : Math.max(0, du - 4);
  counter(b, ku, W, 0);
  b.atFront('otomat_icecek', side > 0 ? 0 : W - 1, 0);
  b.atFront('otomat_enerji', side > 0 ? 1 : W - 2, 0);
  b.wall('neon_tabela_ic', Math.max(1, Math.min(W - 2, du + (side > 0 ? -4 : 4))), 0, 2, { span: 3, y: 2, data: brandSign(b), variant: 2 });
  // orta ada: vitrinler + tezgâhlar (çapraz yürüyüş boşluğu bırakılır)
  const cu = (W >> 1) - 3;
  const cv = Math.max(4, Math.min(sd - 5, (sd >> 1) - 1));
  b.put('vitrin', cu, cv, 2, { variant: 0, flush: 0 });
  b.put('vitrin', cu + 4, cv, 2, { variant: 1, flush: 0 });
  b.put('vitrin', cu, cv + 2, 0, { variant: 2, flush: 2 });
  b.put('vitrin', cu + 4, cv + 2, 0, { variant: 0, flush: 2 });
  b.place('manken', cu + 3, cv + 1, 0, { variant: 2 });
  b.put('koli_yigini', 1, 5, 0, { variant: 0 });
  b.put('koli', 4, 5, 0, { variant: 1 });
  b.put('koli', 5, 5, 0, { variant: 2 });
  b.put('koli_yigini', W - 3, 5, 0, { variant: 1 });
  b.put('koli', W - 5, 5, 0, { variant: 0 });
  b.atLeft('market_rafi', 0, 8, { variant: 3 });
  b.atLeft('market_rafi', 0, 10, { variant: 4 });
  b.atRight('market_rafi', W - 1, 8, { variant: 5 });
  b.atRight('market_buzluk', W - 1, 10, { variant: 0 });
  b.atBack('market_buzluk', 1, sd - 1, { variant: 1 });
  b.atBack('market_buzluk', 3, sd - 1, { variant: 0 });
  b.atBack('bilgi_terminali', W >> 1, sd - 1);
  b.atBack('saksi_buyuk', W - 3, sd - 1, { variant: 1 });
  b.atBack('saksi_buyuk', W - 5, sd - 1, { variant: 2 });
  b.atLeft('saksi_buyuk', 0, sd - 3, { variant: 0 });
  b.put('sandalye', side > 0 ? W - 1 : 0, 1, 0, { variant: 0 });
  // depo, ofis
  b.atBack('raf_unitesi', depo[0] + 1, D - 1, { variant: 0 });
  b.atBack('koli_yigini', depo[2] - 3, D - 1, { variant: 2 });
  b.run('koli', depo[0], sd + 2, 2, 'v', 0, { variants: [0, 2] });
  b.chip('oda', depo[0] + 3, D - 2, 0);
  b.atBack('kasa_masasi', ofis[0] + 1, D - 1, { variant: 1 });
  b.atBack('raf_unitesi', ofis[2] - 3, D - 1, { variant: 2 });
  b.atRight('sandalye', ofis[2] - 1, sd + 2);
  // ışık
  b.lightGrid('satis', 4, 'lantern');
  b.lamp('depo', (depo[0] + depo[2]) >> 1, sd + 3, 'lantern');
  b.lamp('ofis', (ofis[0] + ofis[2]) >> 1, sd + 3, 'panel');
  b.accent(1, 1, W - 1, 2, H - 1, H, ID.NEON_AMBER);
  b.accent(1, sd - 1, W - 1, sd, H - 1, H, ID.NEON_AMBER);
  b.accent(cu, cv - 1, cu + 8, cv, H - 1, H, ID.NEON_CYAN);
  b.pad(PAD, 28, rng);
  b.trim(38, KEEP);
}

/* ------------------------------------------------------------------------------------------------
 * Yayım
 * ---------------------------------------------------------------------------------------------- */
function emit(W, interior, ctx) {
  const { kit, pal, frame: f } = ctx;
  const L = interior.layout;
  const deco = new Deco(kit, f);
  const H = f.H;
  const S = L.rooms.satis;
  if (L.v === 0) {
    kit.floor(S[0], S[1], S[2], S[3], (u, v) => (((u >> 1) + (v >> 1)) & 1 ? ID.FACADE_LIGHT : ID.WHITE));
    (L.aisles || []).forEach((a) => {
      // reyon koridoru ortası: renkli şerit + kapıdan itibaren tavanda renkli bayrak
      kit.floor(a.u, a.v0, a.u + 2, a.v1, AISLE[a.color]);
      kit.box(a.u - 1, a.v0, a.u + 3, a.v0 + 1, H - 1, H, BANNER[a.color]);
    });
  } else if (L.v === 1) {
    kit.floor(S[0], S[1], S[2], S[3], (u, v) => (((u + v) & 1) ? ID.FACADE_DARK : ID.BLACK));
    (L.rows || []).forEach((r, i) => {
      kit.floor(r.u0, r.v - 1, r.u1, r.v, (u) => ((u & 1) ? AISLE[i % 4] : undefined));
    });
    kit.floor(S[0], 1, S[2], 2, ID.WHITE);
  } else {
    kit.floor(S[0], S[1], S[2], S[3], (u, v) => (((u >> 1) + (v >> 1)) & 1 ? B.PLANKS_BIRCH : B.PLANKS_OAK));
    const cu = (S[0] + S[2]) >> 1;
    kit.floor(cu - 4, 4, cu + 4, S[3] - 1, (u, v) => (((u + v) & 1) ? ID.ORANGE : ID.YELLOW));
  }
  const O = L.rooms.ofis;
  kit.floor(O[0], O[1], O[2], O[3], (u, v) => (((u + v) & 1) ? ID.FACADE_LIGHT : ID.WHITE));
  const Dp = L.rooms.depo;
  kit.floor(Dp[0], Dp[1], Dp[2], Dp[3], (u, v) => (((u + v) & 1) ? ID.IRON : ID.FACADE_DARK));
  // duvarlar: alt şerit renkli, üst beyaz
  Object.keys(L.rooms).forEach((k) => {
    deco.ring(L.rooms[k], 0, H, (side, t, y) => {
      if (y === 0) return ID.IRON;
      if (y === 1) return pal.wall2;
      if (y === H - 1) return pal.wall2;
      return undefined;
    });
  });
  // kasa tarafı: sütun şeritleri
  deco.ring(S, 1, H - 1, (side, t) => ((t % 5) === 4 && side !== 2 ? ID.FACADE_LIGHT : undefined));
}

const impl = {
  kind: KIND,
  name: 'Market',
  footprint() {
    return { w: 20, d: 14, h: 4 };
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
