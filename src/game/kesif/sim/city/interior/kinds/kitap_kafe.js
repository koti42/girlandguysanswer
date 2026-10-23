/*
 * KEŞİF sim/city/interior/kinds — 11. KİTAP-KAFE (Ece, "Bu kitap sana göre."; sıcak ahşap/tuğla, ortam: sayfa hışırtısı; imza: gizemli kitap).
 * Rezerv 14×12×4 (14×12 ya da 12×14). Duvarlar gerçek KİTAPLIK blokları (18) ile kaplanır; ahşap zemin, kiriş tavan, sıcak lambalar. Üç varyant:
 *   V0 "Okuma Salonu"   : kafe tezgâhı + masalar + kanepe köşesi; arkada KİLİTLİ arşiv (kod; ipucu `kod_notu` salonda) ve açık okuma köşesi
 *   V1 "Gizli Raf"      : kafe + raf sıraları; arkada GİZLİ oda (`gizli_kapi_raf`, serbest — `hidden` olarak bildirilir) ve küçük depo
 *   V2 "Cam Bölmeli Kafe": cam bölmeyle ayrılmış ön kafe + arka kütüphane (kemer geçit) ve KİLİTLİ özel koleksiyon (Zar Mantığı)
 */
import { ID } from '../../cityEmit.js';
import { B } from '../../../blocks.js';
import { BuilderB, Deco } from '../kindKitB.js';
import { PALETTES } from '../kit.js';

const KIND = 'kitap_kafe';
const P = (o) => Object.freeze(o);
const PAL = [
  P(Object.assign({}, PALETTES.sicak, {
    floor: B.PLANKS_OAK, floor2: B.PLANKS_ACACIA, wall: ID.BRICK, wall2: B.PLANKS_BIRCH, ceil: B.PLANKS_OAK, trim: B.LOG_OAK, glow: ID.NEON_AMBER, glow2: ID.NEON_PINK, lamp: 'lantern',
  })),
  P(Object.assign({}, PALETTES.sicak, {
    floor: B.PLANKS_ACACIA, floor2: B.PLANKS_OAK, wall: B.PLANKS_BIRCH, wall2: ID.BRICK, ceil: B.PLANKS_ACACIA, trim: B.LOG_BIRCH, glow: ID.NEON_AMBER, glow2: ID.NEON_CYAN, lamp: 'lantern',
  })),
  P(Object.assign({}, PALETTES.sicak, {
    floor: B.PLANKS_BIRCH, floor2: B.PLANKS_OAK, wall: ID.BRICK, wall2: ID.WHITE, ceil: B.PLANKS_BIRCH, trim: B.LOG_OAK, glow: ID.NEON_AMBER, glow2: ID.NEON_CYAN, lamp: 'lantern', glass: B.GLASS_ORANGE,
  })),
];
const KEEP = ['kasa_masasi', 'kitaplik', 'kod_notu', 'gizli_kapi_raf'];
const PAD = ['kitap_yigini', 'saksi_buyuk', 'ayakli_lamba', 'koltuk', 'cerceve', 'tuval'];

function tables(b, u0, v0, n, step, vs) {
  let k = 0;
  for (let i = 0; i < n; i++) {
    const u = u0 + i * step;
    if (b.put('kafe_masasi', u, v0, 0, { variant: i % 3 })) {
      k++;
      b.place('sandalye', u, v0 - 1, 0, { variant: (i + 1) % 3 });
      b.place('sandalye', u, v0 + 1, 2, { variant: (i + 2) % 3 });
      b.place('kase_seti', u, v0, 0, { y: 0.875, variant: i % 3 });
      if (vs) b.place('masa_lambasi', u, v0, 0, { y: 0.875, variant: i % 3, du: 0.25, dv: 0.25 });
    }
  }
  return k;
}

function planV0(b, ctx, rng) {
  const W = b.uw;
  const D = b.ud;
  const H = b.H;
  const du = b.edu;
  const sd = D - 5;
  const flip = rng.chance(0.5);
  const aw = Math.max(4, Math.min(6, W >> 1));
  const arsiv = flip ? [W - aw, sd + 1, W, D] : [0, sd + 1, aw, D];
  const okuma = flip ? [0, sd + 1, W - aw - 1, D] : [aw + 1, sd + 1, W, D];
  b.room('salon', [0, 0, W, sd], { role: 'salon' });
  b.room('arsiv', arsiv, { role: 'arsiv' });
  b.room('okuma', okuma, { role: 'okuma' });
  b.door('d_okuma', 'salon', 'okuma', {
    axis: 'u', line: sd, c: b.doorC(okuma, sd, (okuma[0] + okuma[2]) >> 1, 3), w: 3, kind: 'arch',
  });
  const lk = b.lockedDoor('d_arsiv', 'salon', 'arsiv', {
    axis: 'u', line: sd, c: b.doorC(arsiv, sd, (arsiv[0] + arsiv[2]) >> 1, 1), w: 1,
  }, { kind: 'kod', tier: 1, data: { clue: 'prop' } });
  b.layout = {
    v: 0, rooms: { salon: b.rr('salon'), arsiv: b.rr('arsiv'), okuma: b.rr('okuma') }, flip, glass: null, rugs: [],
  };
  // kafe tezgâhı: kapıdan uzak yarıda ön duvar dibi
  const side = du < W / 2 ? 1 : -1;
  const cu = side > 0 ? Math.min(W - 3, du + 3) : Math.max(0, du - 4);
  b.put('kasa_masasi', cu, 2, 2, { variant: 1 });
  b.post(cu + 1, 3, 2, 'salon');
  b.signature(cu, 2, 1.2);
  b.put('mutfak_tezgahi', side > 0 ? W - 2 : 0, 0, 0, { flush: 2, variant: 0 });
  b.atFront('cay_ocagi', side > 0 ? W - 3 : 2, 0);
  b.wall('menu_tahtasi', side > 0 ? W - 5 : 3, 0, 2, { span: 2, y: 1.2 });
  // masalar + kanepe köşesi
  tables(b, side > 0 ? 1 : Math.max(0, W - 7), 3, 3, 2, true);
  b.atLeft('kanepe', 0, 4, { variant: 0 });
  b.atLeft('alcak_masa', 1, 4, { variant: 1 });
  b.place('robot_kedi', 3, 4, 0, { variant: 1 });
  b.wall('tuval', 0, 2, 3, { span: 1, y: 1.2 });
  b.wall('cerceve', W - 1, 2, 1, { span: 1, y: 1.2 });
  b.atRight('kitaplik', W - 1, 3, { variant: 0 });
  b.atBack('raf_unitesi', 1, sd - 1, { variant: 1 });
  b.atBack('kitaplik', 3, sd - 1, { variant: 2 });
  b.atBack('kitaplik', W - 3, sd - 1, { variant: 3 });
  b.run('saksi_buyuk', 0, sd - 1, 1, 'u', 0, { variant: 1 });
  // kod ipucu: kilidin önündeki salonda
  b.clueNote(lk.lock.id, (W >> 1), sd - 1, 0, 'salon');
  // okuma köşesi
  b.atBack('koltuk', okuma[0] + 1, D - 1, { variant: 2 });
  b.atBack('ayakli_lamba', okuma[0] + 3, D - 1, { variant: 1 });
  b.atBack('koltuk', okuma[2] - 3, D - 1, { variant: 3 });
  b.place('alcak_masa', okuma[0] + 1, D - 3, 0, { variant: 2 });
  b.wall('bitki_duvar', okuma[2] - 1, sd + 2, 1, { span: 2, y: 0.5 });
  b.place('kitap_yigini', okuma[0] + 1, D - 3, 0, { y: 0.5, variant: 1 });
  // arşiv
  b.run('kitaplik', arsiv[0], arsiv[1] + 1, 1, 'v', 1, { flush: 3 });
  b.atBack('kitaplik', arsiv[0] + 1, D - 1, { variant: 1 });
  b.atRight('raf_unitesi', arsiv[2] - 1, arsiv[1] + 1, { variant: 2 });
  b.chip('oda', arsiv[0] + 2, arsiv[1] + 2, 0);
  // ışık
  b.lightGrid('salon', 3, 'lantern');
  b.lamp('okuma', (okuma[0] + okuma[2]) >> 1, sd + 3, 'lantern');
  b.lamp('arsiv', (arsiv[0] + arsiv[2]) >> 1, sd + 3, 'neon_amber');
  b.accent(1, sd - 1, W - 1, sd, H - 1, H, ID.NEON_AMBER);
  b.pad(PAD, 30, rng);
  b.trim(38, KEEP);
}

function planV1(b, ctx, rng) {
  const W = b.uw;
  const D = b.ud;
  const H = b.H;
  const du = b.edu;
  const sd = D - 4;
  let gw = 5;
  // bant kapı önü satırını (sd-1) da kapsar: kule çekirdeği gizli kapının salon tarafını kapatmasın (QA2)
  let gu0 = b.fit((W - gw) >> 1, gw, sd - 1, D);
  while (gu0 < 0 && gw > 3) {
    gw--;
    gu0 = b.fit((W - gw) >> 1, gw, sd - 1, D);
  }
  if (gu0 < 0) gu0 = 1;
  const gizli = [gu0, sd + 1, gu0 + gw, D];
  b.room('salon', [0, 0, W, sd], { role: 'salon' });
  b.room('gizli', gizli, { role: 'gizli' });
  const hd = b.hiddenDoor('d_gizli', 'salon', 'gizli', {
    axis: 'u', line: sd, c: gu0 + 2,
  });
  b.setHidden({ room: 'gizli', door: hd.id, lock: null });
  b.layout = {
    v: 1, rooms: { salon: b.rr('salon'), gizli: b.rr('gizli') }, glass: null, hiddenAt: gu0 + 2 + b.ou,
  };
  const side = du < W / 2 ? 1 : -1;
  const cu = side > 0 ? Math.min(W - 3, du + 3) : Math.max(0, du - 4);
  b.put('kasa_masasi', cu, 2, 2, { variant: 2 });
  b.post(cu + 1, 3, 2, 'salon');
  b.signature(cu, 2, 1.2);
  b.put('mutfak_tezgahi', side > 0 ? W - 2 : 0, 0, 0, { flush: 2, variant: 1 });
  b.atFront('cay_ocagi', side > 0 ? W - 3 : 2, 0);
  b.wall('menu_tahtasi', side > 0 ? W - 5 : 3, 0, 2, { span: 2, y: 1.2 });
  b.wall('ilan_panosu', side > 0 ? 1 : W - 3, 0, 2, { span: 2, y: 1.2 });
  tables(b, side > 0 ? 1 : Math.max(0, W - 5), 3, 2, 2, false);
  // raf sıraları (ortada iki sıra, uçlarda geçit)
  const rs = 5;
  const k1 = b.run('kitaplik', 1, rs, Math.max(1, ((W - 4) >> 1)), 'u', 2, { flush: 0, variants: [0, 1, 2] });
  const k2 = b.run('kitaplik', 3, rs + 3, Math.max(1, ((W - 4) >> 1)), 'u', 0, { flush: 2, variants: [2, 3, 0] });
  void k1;
  void k2;
  b.atLeft('koltuk', 0, 3, { variant: 1 });
  b.atRight('kanepe', W - 1, 6, { variant: 2 });
  b.place('alcak_masa', W - 2, 6, 0, { variant: 0 });
  b.place('robot_kedi', 1, sd - 2, 0, { variant: 2 });
  b.atBack('raf_unitesi', 1, sd - 1, { variant: 0 });
  b.atBack('raf_unitesi', W - 3, sd - 1, { variant: 1 });
  b.wall('tuval', 1, sd - 1, 0, { span: 1, y: 1.2 });
  b.wall('cerceve', W - 2, sd - 1, 0, { span: 1, y: 1.2 });
  // gizli oda
  b.atBack('kanepe', gizli[0] + 1, D - 1, { variant: 3 });
  b.place('kitap_yigini', gizli[0] + 1, D - 1, 0, { y: 0.875, variant: 2, du: 0.5 });
  b.atLeft('ayakli_lamba', gizli[0], D - 1, { variant: 2 });
  b.chip('oda', gizli[0] + 2, gizli[1] + 1, 0);
  // ışık
  b.lightGrid('salon', 3, 'lantern');
  b.lamp('gizli', gizli[0] + 2, gizli[1] + 1, 'neon_amber');
  b.accent(1, 1, W - 1, 2, H - 1, H, ID.NEON_AMBER);
  b.pad(PAD, 30, rng);
  b.trim(38, KEEP);
}

function planV2(b, ctx, rng) {
  const W = b.uw;
  const D = b.ud;
  const H = b.H;
  const du = b.edu;
  const cd = Math.max(4, Math.min(6, Math.floor(D * 0.45)));
  const kw = 4;
  const flip = rng.chance(0.5);
  const lib = flip ? [kw + 1, cd + 1, W, D] : [0, cd + 1, W - kw - 1, D];
  const kol = flip ? [0, cd + 1, kw, D] : [W - kw, cd + 1, W, D];
  const sepU = flip ? kw : W - kw - 1;
  b.room('kafe', [0, 0, W, cd], { role: 'kafe' });
  b.room('kutuphane', lib, { role: 'kutuphane' });
  b.room('koleksiyon', kol, { role: 'koleksiyon' });
  b.door('d_kut', 'kafe', 'kutuphane', {
    axis: 'u', line: cd, c: b.doorC(lib, cd, Math.max(lib[0] + 1, Math.min(lib[2] - 2, du)), 3), w: 3, kind: 'arch',
  });
  let kc = cd + 1 + ((D - cd - 1) >> 1);
  for (let t = 0; t < 8; t++) {
    const c = cd + 1 + ((D - cd - 1) >> 1) + (t & 1 ? -((t + 1) >> 1) : (t >> 1));
    if (c >= cd + 1 && c < D && !b.coreAt([sepU - 1, c - 1, sepU + 2, c + 2])) { kc = c; break; }
  }
  b.lockedDoor('d_kol', 'kutuphane', 'koleksiyon', {
    axis: 'v', line: sepU, c: kc, w: 1,
  }, { kind: 'mini_hack', tier: 1, data: { game: 'dice' } });
  b.layout = {
    v: 2, rooms: { kafe: b.rr('kafe'), kutuphane: b.rr('kutuphane'), koleksiyon: b.rr('koleksiyon') }, glass: ['kutuphane'], sep: cd,
  };
  const side = du < W / 2 ? 1 : -1;
  const cu = side > 0 ? Math.min(W - 3, du + 3) : Math.max(0, du - 4);
  b.put('kasa_masasi', cu, 2, 2, { variant: 0 });
  b.post(cu + 1, 3, 2, 'kafe');
  b.signature(cu, 2, 1.2);
  b.put('mutfak_tezgahi', side > 0 ? W - 2 : 0, 0, 0, { flush: 2, variant: 0 });
  b.atFront('cay_ocagi', side > 0 ? W - 3 : 2, 0);
  b.wall('menu_tahtasi', side > 0 ? W - 5 : 3, 0, 2, { span: 2, y: 1.2 });
  tables(b, side > 0 ? 1 : Math.max(0, W - 7), 3, 3, 2, true);
  b.atLeft('kanepe', 0, 4, { variant: 2 });
  b.atRight('koltuk', W - 1, 4, { variant: 1 });
  b.run('saksi_buyuk', 0, cd - 1, 1, 'u', 0, { variant: 2 });
  b.run('saksi_buyuk', W - 1, cd - 1, 1, 'u', 0, { variant: 3 });
  // kütüphane: yan duvarlarda raf sıraları + ortada okuma masası
  const lw = lib[2] - lib[0];
  const mu = lib[0] + (lw >> 1) - 1;
  b.atLeft('kitaplik', lib[0], lib[1], { variant: 0 });
  b.atLeft('kitaplik', lib[0], lib[1] + 2, { variant: 1 });
  b.atRight('kitaplik', lib[2] - 1, lib[1], { variant: 2 });
  b.atRight('kitaplik', lib[2] - 1, lib[1] + 2, { variant: 3 });
  b.atBack('kitaplik', lib[0] + 2, D - 1, { variant: 1 });
  b.atBack('kitaplik', lib[2] - 4, D - 1, { variant: 0 });
  b.put('masa', mu, lib[1] + 2, 0, { variant: 1 });
  b.place('sandalye', mu, lib[1] + 1, 0, { variant: 0 });
  b.place('sandalye', mu, lib[1] + 3, 2, { variant: 2 });
  b.place('kitap_yigini', mu, lib[1] + 2, 0, { y: 0.875, variant: 3 });
  b.place('masa_lambasi', mu + 1, lib[1] + 2, 0, { y: 0.875, variant: 1 });
  b.place('robot_kedi', lib[0] + 1, lib[1] + 4, 0, { variant: 0 });
  // koleksiyon
  b.atBack('kitaplik', kol[0] + 1, D - 1, { variant: 2 });
  b.atLeft('kitaplik', kol[0], kol[1] + 1, { variant: 3 });
  b.place('kitap_yigini', kol[0] + 2, D - 2, 0, { y: 0, variant: 2 });
  b.chip('oda', kol[0] + 2, kol[1] + 1, 0);
  // ışık
  b.lightGrid('kafe', 2, 'lantern');
  b.lightGrid('kutuphane', 2, 'lantern');
  b.lamp('koleksiyon', kol[0] + 2, kol[1] + 1, 'neon_amber');
  b.accent(1, cd - 1, W - 1, cd, H - 1, H, ID.NEON_AMBER);
  b.pad(PAD, 30, rng);
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
  // zemin: ahşap dama
  kit.floor(0, 0, f.W, f.D, (u, v) => ((((u >> 1) + (v >> 1)) & 1) ? pal.floor : pal.floor2));
  // tavan: ahşap + kirişler
  kit.ceiling(0, 0, f.W, f.D, pal.ceil);
  Object.keys(L.rooms).forEach((k) => {
    const r = L.rooms[k];
    for (let u = r[0] + 1; u < r[2]; u += 3) kit.box(u, r[1], u + 1, r[3], H - 1, H, pal.trim);
  });
  // duvarlar: kitaplık blokları (0..2) + ahşap şerit; cam bölme (V2 kütüphane ön)
  Object.keys(L.rooms).forEach((k) => {
    const glass = L.glass && L.glass.indexOf(k) >= 0;
    const rr = L.rooms[k];
    const nT = rr[2] - rr[0] + 1;
    deco.ring(rr, 0, H, (side, t, y) => {
      if (glass && side === 2) return (y === 0 || y === H - 1 || (t % 4) === 0) ? pal.trim : pal.glass;
      if (y === H - 1) return pal.trim;
      if ((side === 0 || side === 2) && (t === 0 || t === nT) && y < H - 1) return ID.PILLAR;
      if (y === 0) return pal.wall2;
      return B.BOOKSHELF;
    });
  });
  // halılar: odanın ortasında kumaş halı (kenar kırmızı, iç turuncu)
  Object.keys(L.rooms).forEach((k) => {
    const r = L.rooms[k];
    const w = r[2] - r[0];
    const d = r[3] - r[1];
    if (w < 6 || d < 4) return;
    const ru0 = r[0] + ((w - 4) >> 1);
    const rv0 = r[1] + Math.max(1, ((d - 3) >> 1));
    kit.floor(ru0, rv0, ru0 + 4, rv0 + 3, (u, v) => ((u === ru0 || u === ru0 + 3 || v === rv0 || v === rv0 + 2) ? B.CLOTH_RED : B.CLOTH_ORANGE));
  });
  // kafe/salon ön bölge: tuğla dolgu (kitaplık yerine) — girişte sıcak karşılama
  const first = L.rooms.salon || L.rooms.kafe;
  if (first) {
    deco.ring([first[0], first[1], first[2], Math.min(first[3], first[1] + 3)], 1, H - 1, (side) => (side === 3 || side === 1 ? ID.BRICK : undefined));
  }
}

const impl = {
  kind: KIND,
  name: 'Kitap-Kafe',
  footprint() {
    return { w: 14, d: 12, h: 4 };
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
