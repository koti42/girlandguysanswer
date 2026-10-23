/*
 * KEŞİF sim/city/interior/kinds — 8. KULÜP (DJ Mira, "Ritim şehrin kalbi."; renkli yavaş ışık yıkaması, STROBO YOK; ortam: synthwave; imza: ses plağı).
 * Rezerv 22×18×7. Kulüpler çoğunlukla kule tabanındadır: 4×4 asansör çekirdeği ortada-arkada durur (plan çekirdeğin YANLARINDAN dolaşır). Üç varyant:
 *   V0 "Neon Salon"    : büyük salon (pist, bar, DJ sahnesi) + arkada sol KİLİTLİ kulis (Rün Dizisi) + sağ açık VIP köşesi
 *   V1 "Işık Salonu"   : ön lounge + arka pist (sahne sol duvar) + yan şeritte KİLİTLİ VIP (Renk Kolları, kademe 2)
 *   V2 "Sahne Salonu"  : geniş salon (sahne tam sol duvar, uzun bar) + yan şeritte kulis ve KİLİTLİ depo (kod, ipucu sahipte)
 * Işık: renkli YAVAŞ yıkama = renkli neon aksan şeritleri + 'isik_demeti' (tavan) + 'dans_zemini'; hiçbir yerde ≤3 Hz'den hızlı değişim yok (hepsi sabit/yavaş).
 */
import { ID } from '../../cityEmit.js';
import { B } from '../../../blocks.js';
import { BuilderB, Deco, brandSign, pickStrip } from '../kindKitB.js';
import { PALETTES } from '../kit.js';

const KIND = 'kulup';
const P = (o) => Object.freeze(o);
const PAL = [
  P(Object.assign({}, PALETTES.renkli, {
    floor: ID.BLACK, floor2: ID.PURPLE, wall: ID.FACADE_DARK, wall2: ID.PURPLE, ceil: ID.BLACK, trim: ID.NEON_PINK, glow: ID.NEON_PINK, glow2: ID.NEON_CYAN, lamp: 'neon_pink',
  })),
  P(Object.assign({}, PALETTES.renkli, {
    floor: ID.BLACK, floor2: ID.BLUE, wall: ID.BLACK, wall2: ID.BLUE, ceil: ID.BLACK, trim: ID.NEON_CYAN, glow: ID.NEON_CYAN, glow2: ID.NEON_PINK, lamp: 'neon_cyan', glass: B.GLASS_BLUE,
  })),
  P(Object.assign({}, PALETTES.renkli, {
    floor: ID.FACADE_DARK, floor2: ID.PURPLE, wall: ID.FACADE_DARK, wall2: ID.RED, ceil: ID.BLACK, trim: ID.NEON_AMBER, glow: ID.NEON_AMBER, glow2: ID.NEON_PINK, lamp: 'neon_amber', glass: B.GLASS_PURPLE,
  })),
];
const KEEP = ['dj_standi', 'dans_zemini', 'meyve_bari', 'isik_demeti', 'dev_holo_ekran', 'neon_tabela_ic'];
const PAD = ['puf', 'tabure', 'hoparlor', 'kafe_masasi'];
const GLOW = [ID.NEON_PINK, ID.NEON_CYAN, ID.NEON_AMBER, ID.NEON_LIME];

function danceFloor(b, u, v, n) {
  let k = 0;
  const rects = [];
  for (let i = 0; i < n; i++) {
    const r = b.place('dans_zemini', u + 1 + i * 3, v + 1, 0, { variant: (i + b.variant) % 3, du: 0, dv: 0 });
    if (r) {
      k++;
      rects.push([u + i * 3, v, u + i * 3 + 3, v + 3]);
    }
  }
  return { k, rects };
}

function lightsOver(b, rects, H) {
  // pistin üstünde 'isik_demeti' tavan propları (renkli; 4 varyant = 4 yavaş renk)
  rects.forEach((r, i) => {
    b.place('isik_demeti', r[0], r[1], 0, { variant: i % 4, y: H - 0.5 });
    b.place('isik_demeti', r[2] - 1, r[3] - 1, 0, { variant: (i + 2) % 4, y: H - 0.5 });
  });
}

function planV0(b, ctx, rng) {
  const W = b.uw;
  const D = b.ud;
  const H = b.H;
  const sh = D - 6;
  const kw = 7;
  b.room('salon', [0, 0, W, sh], { role: 'salon' });
  b.room('kulis', [0, sh + 1, kw, D], { role: 'kulis' });
  b.room('vip', [W - kw, sh + 1, W, D], { role: 'vip' });
  b.lockedDoor('d_kulis', 'salon', 'kulis', {
    axis: 'u', line: sh, c: b.doorC([0, 0, kw, 1], sh, 3, 1), w: 1,
  }, { kind: 'mini_hack', tier: 1, data: { game: 'simon' } });
  b.door('d_vip', 'salon', 'vip', {
    axis: 'u', line: sh, c: b.doorC([W - kw, 0, W, 1], sh, W - 4, 1), w: 1, kind: 'door',
  });
  const stageRect = [W - 6, 4, W, 10];
  b.layout = {
    v: 0,
    rooms: { salon: b.rr('salon'), kulis: b.rr('kulis'), vip: b.rr('vip') },
    stage: [stageRect[0] + b.ou, stageRect[1], stageRect[2] + b.ou, stageRect[3]],
    dance: null,
  };
  // pist
  const du = Math.max(2, Math.min(W - 9, (W >> 1) - 4));
  const df = danceFloor(b, du, 4, 2);
  b.layout.dance = df.rects.map((r) => [r[0] + b.ou, r[1], r[2] + b.ou, r[3]]);
  lightsOver(b, df.rects, H);
  // DJ sahnesi (sağ duvar)
  b.put('dj_standi', W - 2, 6, 3, { flush: 1, y: 0.5, variant: 0 });
  b.post(W - 3, 6, 3, 'salon');
  b.atRight('hoparlor', W - 1, 4, { y: 0.5 });
  b.atRight('hoparlor', W - 1, 9, { y: 0.5 });
  b.wall('dev_holo_ekran', W - 1, 6, 1, { y: 2, span: 3 });
  b.signature(W - 3, 7, 1.6);
  // bar (sol duvar)
  b.atLeft('meyve_bari', 0, 6, { variant: 0 });
  b.run('tabure', 2, 6, 3, 'v', 0, { variants: [0, 1, 2] });
  b.atLeft('otomat_icecek', 0, 2);
  b.wall('neon_tabela_ic', 0, 8, 3, { span: 3, y: 2, data: brandSign(b), variant: 1 });
  // lounge (ön)
  b.put('kanepe', 1, 1, 0, { flush: 2, variant: 1 });
  b.put('kanepe', W - 4, 1, 0, { flush: 2, variant: 2 });
  b.place('alcak_masa', 2, 2, 0, { du: 0.5, variant: 0 });
  b.place('alcak_masa', W - 4, 2, 0, { du: 0.5, variant: 1 });
  b.run('puf', 5, 1, 2, 'u', 0, { variants: [0, 3] });
  b.run('puf', W - 7, 1, 2, 'u', 0, { variants: [1, 2] });
  b.wall('neon_tabela_ic', Math.max(2, Math.min(W - 3, ctx.frame.door.u - b.ou + 4)), 0, 2, { span: 3, y: 2, data: brandSign(b), variant: 0 });
  b.wall('neon_raf', 3, sh - 1, 0, { span: 2, y: 1.5 });
  b.wall('neon_raf', W - 5, sh - 1, 0, { span: 2, y: 1.5 });
  b.wall('bitki_duvar', 6, sh - 1, 0, { span: 2, y: 0.5 });
  b.wall('bitki_duvar', W - 9, sh - 1, 0, { span: 2, y: 0.5 });
  b.atLeft('hoparlor', 0, 3);
  b.put('kafe_masasi', 2, 8, 0, { variant: 0 });
  b.run('tabure', 1, 9, 2, 'u', 0, {});
  // kulis
  b.atBack('kanepe', 1, D - 1, { variant: 3 });
  b.atLeft('puf', 0, sh + 2, { variant: 2 });
  b.atRight('hoparlor', kw - 1, sh + 2);
  b.place('puf', 3, D - 3, 0, { variant: 1 });
  b.wall('bitki_duvar', 3, D - 1, 0, { span: 2, y: 0.5 });
  b.chip('oda', 5, D - 2, 0);
  // vip
  b.atBack('kanepe', W - 6, D - 1, { variant: 0 });
  b.atBack('alcak_masa', W - 3, D - 1, { variant: 2 });
  b.atRight('otomat_icecek', W - 1, sh + 2);
  b.put('puf', W - 6, sh + 2, 0, { variant: 0 });
  b.put('puf', W - 4, sh + 2, 0, { variant: 3 });
  // ışık
  b.lamp('salon', 3, 3, 'neon_pink');
  b.lamp('salon', W - 4, 3, 'neon_cyan');
  b.lamp('salon', 3, sh - 2, 'neon_amber');
  b.lamp('salon', W - 4, sh - 2, 'neon_pink');
  b.lamp('kulis', 3, sh + 3, 'neon_cyan');
  b.lamp('vip', W - 4, sh + 3, 'neon_pink');
  const y0 = H - 1;
  b.accent(1, 1, W - 1, 2, y0, H, ID.NEON_PINK);
  b.accent(1, sh - 2, W - 1, sh - 1, y0, H, ID.NEON_CYAN);
  b.accent(1, 3, 2, sh - 3, y0, H, ID.NEON_AMBER);
  b.accent(W - 2, 3, W - 1, sh - 3, y0, H, ID.NEON_LIME);
  b.pad(PAD, 34, rng);
  b.trim(38, KEEP);
}

function planV1(b, ctx, rng) {
  const W = b.uw;
  const D = b.ud;
  const H = b.H;
  const flip = rng.chance(0.5);
  const lh = 5;
  const vw = 7;
  const pist = flip ? [vw + 1, lh + 1, W, D] : [0, lh + 1, W - vw - 1, D];
  const vip = flip ? [0, lh + 1, vw, D] : [W - vw, lh + 1, W, D];
  b.room('lounge', [0, 0, W, lh], { role: 'lounge' });
  b.room('pist', pist, { role: 'salon' });
  b.room('vip', vip, { role: 'vip' });
  const pc = Math.max(pist[0] + 1, Math.min(pist[2] - 2, b.edu));
  b.door('d_pist', 'lounge', 'pist', {
    axis: 'u', line: lh, c: b.doorC(pist, lh, pc, 3), w: 3, kind: 'arch',
  });
  b.lockedDoor('d_vip', 'lounge', 'vip', {
    axis: 'u', line: lh, c: b.doorC(vip, lh, (vip[0] + vip[2]) >> 1, 1), w: 1,
  }, { kind: 'mini_hack', tier: 2, data: { game: 'levers' } });
  b.layout = {
    v: 1, rooms: { lounge: b.rr('lounge'), pist: b.rr('pist'), vip: b.rr('vip') }, flip, stage: null, dance: null,
  };
  // lounge
  b.put('kanepe', 1, 0, 0, { flush: 2, variant: 0 });
  b.put('kanepe', W - 4, 0, 0, { flush: 2, variant: 1 });
  b.place('alcak_masa', 2, 1, 0, { du: 0.5, variant: 2 });
  b.place('alcak_masa', W - 4, 1, 0, { du: 0.5, variant: 0 });
  b.atBack('meyve_bari', flip ? W - 4 : 1, lh - 1, { variant: 1 });
  b.run('tabure', flip ? W - 4 : 1, lh - 3, 3, 'u', 0, { variants: [0, 1, 2] });
  b.post(flip ? W - 3 : 2, lh - 1, 2, 'lounge');
  b.atFront('otomat_icecek', W >> 1, 0);
  b.wall('neon_tabela_ic', 4, 0, 2, { span: 3, y: 2, data: brandSign(b), variant: 2 });
  b.wall('dev_holo_ekran', (W >> 1) + 3, 0, 2, { span: 3, y: 2 });
  b.signature(flip ? W - 3 : 2, lh - 2, 1.2);
  b.put('puf', 6, 1, 0, { variant: 1 });
  b.put('puf', W - 7, 1, 0, { variant: 2 });
  b.wall('bitki_duvar', W - 3, 0, 2, { span: 2, y: 0.5 });
  // pist
  const pw = pist[2] - pist[0];
  const du = pist[0] + Math.max(1, ((pw - 6) >> 1));
  const df = danceFloor(b, du, lh + 2, 2);
  b.layout.dance = df.rects.map((r) => [r[0] + b.ou, r[1], r[2] + b.ou, r[3]]);
  lightsOver(b, df.rects, H);
  const stageU = flip ? pist[2] - 1 : pist[0];
  b.layout.stage = [stageU + b.ou - (flip ? 4 : 0), D - 6, stageU + b.ou + (flip ? 1 : 5), D - 1];
  if (flip) b.atRight('dj_standi', stageU, D - 5, { y: 0.5 });
  else b.atLeft('dj_standi', stageU, D - 5, { y: 0.5 });
  b.atBack('hoparlor', pist[0] + 1, D - 1, { y: 0 });
  b.atBack('hoparlor', pist[2] - 2, D - 1, { y: 0 });
  b.wall('dev_holo_ekran', (pist[0] + pist[2]) >> 1, D - 1, 0, { span: 3, y: 2 });
  b.wall('neon_raf', pist[0] + 2, D - 1, 0, { span: 2, y: 1.5 });
  b.atLeft('hoparlor', pist[0], lh + 2);
  b.atRight('hoparlor', pist[2] - 1, lh + 2);
  b.atRight('kanepe', pist[2] - 1, lh + 5, { variant: 3 });
  b.atLeft('kanepe', pist[0], lh + 5, { variant: 3 });
  b.wall('bitki_duvar', pist[2] - 1, lh + 7, 1, { span: 2, y: 0.5 });
  // vip
  b.atBack('kanepe', vip[0] + 1, D - 1, { variant: 1 });
  b.atBack('alcak_masa', vip[0] + 1, D - 3, { variant: 1 });
  b.put('puf', vip[0] + 1, lh + 2, 0, { variant: 3 });
  b.put('puf', vip[0] + 4, lh + 2, 0, { variant: 0 });
  b.atLeft('hoparlor', vip[0], D - 2);
  b.chip('oda', vip[0] + 3, D - 3, 0);
  // ışık
  b.lamp('lounge', 3, 2, 'neon_pink');
  b.lamp('lounge', W - 4, 2, 'neon_cyan');
  b.lamp('pist', pist[0] + 3, lh + 3, 'neon_cyan');
  b.lamp('pist', pist[2] - 4, lh + 3, 'neon_amber');
  b.lamp('pist', pist[0] + 3, D - 3, 'neon_pink');
  b.lamp('pist', pist[2] - 4, D - 3, 'neon_lime');
  b.lamp('vip', vip[0] + 3, lh + 3, 'neon_pink');
  const y0 = H - 1;
  b.accent(1, 1, W - 1, 2, y0, H, ID.NEON_PINK);
  b.accent(pist[0] + 1, lh + 1, pist[2] - 1, lh + 2, y0, H, ID.NEON_CYAN);
  b.accent(pist[0] + 1, D - 2, pist[2] - 1, D - 1, y0, H, ID.NEON_AMBER);
  b.pad(PAD, 34, rng);
  b.trim(38, KEEP);
}

function planV2(b, ctx, rng) {
  const W = b.uw;
  const D = b.ud;
  const H = b.H;
  const du = b.edu;
  const { right, sw } = pickStrip(W, du, 6);
  const salon = right ? [0, 0, W - sw - 1, D] : [sw + 1, 0, W, D];
  const strip = right ? [W - sw, 0, W, D] : [0, 0, sw, D];
  const hk = (D >> 1) - 1;
  const kulis = [strip[0], 0, strip[2], hk];
  const depo = [strip[0], hk + 1, strip[2], D];
  b.room('salon', salon, { role: 'salon' });
  b.room('kulis', kulis, { role: 'kulis' });
  b.room('depo', depo, { role: 'depo' });
  const lineU = right ? W - sw - 1 : sw;
  b.door('d_kulis', 'salon', 'kulis', {
    axis: 'v', line: lineU, c: 2, w: 1, kind: 'door',
  });
  b.lockedDoor('d_depo', 'kulis', 'depo', {
    axis: 'u', line: hk, c: strip[0] + 2, w: 1,
  }, { kind: 'kod', tier: 1, data: { clue: 'owner' } });
  b.layout = {
    v: 2, rooms: { salon: b.rr('salon'), kulis: b.rr('kulis'), depo: b.rr('depo') }, right, stage: null, dance: null,
  };
  const sl = salon[0];
  const sr = salon[2];
  // sahne: salonun duvar tarafı (şerit karşısı)
  const stageLeft = right;
  const sU = stageLeft ? sl : sr - 1;
  b.layout.stage = [sU + b.ou - (stageLeft ? 0 : 4), 3, sU + b.ou + (stageLeft ? 5 : 1), D - 3];
  if (stageLeft) b.atLeft('dj_standi', sU, (D >> 1) - 1, { y: 0.5 });
  else b.atRight('dj_standi', sU, (D >> 1) - 1, { y: 0.5 });
  b.post(stageLeft ? sU + 1 : sU - 1, (D >> 1) - 1, stageLeft ? 1 : 3, 'salon');
  b.signature(stageLeft ? sU + 1 : sU - 1, D >> 1, 1.2);
  if (stageLeft) {
    b.atLeft('hoparlor', sU, 4, { y: 0.5 });
    b.atLeft('hoparlor', sU, D - 5, { y: 0.5 });
  } else {
    b.atRight('hoparlor', sU, 4, { y: 0.5 });
    b.atRight('hoparlor', sU, D - 5, { y: 0.5 });
  }
  b.wall('dev_holo_ekran', sU, D >> 1, stageLeft ? 3 : 1, { y: 2, span: 3 });
  // pist
  const df = danceFloor(b, stageLeft ? sl + 6 : sr - 12, 4, 2);
  const df2 = danceFloor(b, stageLeft ? sl + 6 : sr - 12, 7, 2);
  const rects = df.rects.concat(df2.rects);
  b.layout.dance = rects.map((r) => [r[0] + b.ou, r[1], r[2] + b.ou, r[3]]);
  lightsOver(b, rects, H);
  // uzun bar (stage karşısı)
  const barU = stageLeft ? sr - 1 : sl;
  if (stageLeft) b.atRight('meyve_bari', barU, 3, { variant: 1 });
  else b.atLeft('meyve_bari', barU, 3, { variant: 1 });
  if (stageLeft) b.atRight('meyve_bari', barU, 6, { variant: 0 });
  else b.atLeft('meyve_bari', barU, 6, { variant: 0 });
  b.run('tabure', stageLeft ? barU - 2 : barU + 1, 3, 3, 'v', 0, { variants: [0, 1, 2] });
  b.run('tabure', stageLeft ? barU - 2 : barU + 1, 6, 3, 'v', 0, { variants: [2, 1, 0] });
  b.atFront('otomat_icecek', stageLeft ? sr - 2 : sl + 1, 0);
  b.put('kanepe', stageLeft ? sl + 6 : sr - 9, 0, 0, { flush: 2, variant: 1 });
  b.put('kanepe', stageLeft ? sl + 9 : sr - 6, D - 1, 2, { flush: 0, variant: 2 });
  b.atBack('alcak_masa', stageLeft ? sl + 6 : sr - 9, D - 1, { variant: 0 });
  b.run('puf', stageLeft ? sl + 8 : sr - 10, 1, 2, 'u', 0, { variants: [0, 3] });
  b.wall('neon_tabela_ic', Math.max(sl + 2, Math.min(sr - 4, du + 4)), 0, 2, { span: 3, y: 2, data: brandSign(b), variant: 3 });
  b.wall('neon_raf', stageLeft ? sr - 4 : sl + 1, D - 1, 0, { span: 2, y: 1.5 });
  b.wall('bitki_duvar', stageLeft ? sl + 6 : sr - 8, D - 1, 0, { span: 2, y: 0.5 });
  // kulis
  b.atBack('kanepe', kulis[0] + 1, kulis[3] - 1, { variant: 3 });
  b.atRight('puf', kulis[2] - 1, 2, { variant: 1 });
  b.atLeft('hoparlor', kulis[0], 2);
  b.atFront('otomat_icecek', kulis[2] - 1, 0);
  // depo
  b.atBack('hoparlor', depo[0] + 1, depo[3] - 1, {});
  b.atBack('hoparlor', depo[2] - 2, depo[3] - 1, {});
  b.atLeft('puf', depo[0], depo[1] + 1, { variant: 2 });
  b.chip('oda', depo[0] + 3, depo[3] - 3, 0);
  // ışık
  b.lamp('salon', sl + 3, 3, 'neon_pink');
  b.lamp('salon', sr - 4, 3, 'neon_cyan');
  b.lamp('salon', sl + 3, D - 4, 'neon_amber');
  b.lamp('salon', sr - 4, D - 4, 'neon_lime');
  b.lamp('kulis', kulis[0] + 3, 3, 'neon_pink');
  b.lamp('depo', depo[0] + 3, depo[1] + 3, 'neon_cyan');
  const y0 = H - 1;
  b.accent(sl + 1, 1, sr - 1, 2, y0, H, ID.NEON_AMBER);
  b.accent(sl + 1, D - 2, sr - 1, D - 1, y0, H, ID.NEON_PINK);
  b.accent(sl + 5, 2, sl + 6, D - 2, y0, H, ID.NEON_CYAN);
  b.pad(PAD, 34, rng);
  b.trim(38, KEEP);
}

/* ------------------------------------------------------------------------------------------------
 * Yayım
 * ---------------------------------------------------------------------------------------------- */
const WASH = [ID.PURPLE, ID.BLUE, ID.PURPLE, ID.RED];

function emit(W, interior, ctx) {
  const { kit, pal, frame: f } = ctx;
  const L = interior.layout;
  const deco = new Deco(kit, f);
  const H = f.H;
  // zemin: koyu + ince ızgara; pist altı renkli levhalar
  kit.floor(0, 0, f.W, f.D, (u, v) => (((u & 3) === 0 || (v & 3) === 0) ? ID.PURPLE : ((((u >> 1) + (v >> 1)) & 1) ? ID.FACADE_DARK : pal.floor)));
  (L.dance || []).forEach((r, i) => {
    kit.floor(r[0], r[1], r[2], r[3], (u, v) => {
      const k = ((u - r[0]) + (v - r[1]) + i) % 3;
      return k === 0 ? ID.PURPLE : k === 1 ? ID.BLUE : ID.RED;
    });
  });
  // sahne: yarım blok platform (plaka) + parlak kenar
  if (L.stage) {
    const s = L.stage;
    kit.box(s[0], s[1], s[2], s[3], 0, 1, B.SLAB);
    kit.floor(s[0], s[1], s[2], s[3], (u, v) => (((u + v) & 1) ? ID.BLACK : ID.FACADE_DARK));
  }
  // duvarlar: renkli paneller (yıkama) + siyah kenarlar
  Object.keys(L.rooms).forEach((k) => {
    const r = L.rooms[k];
    deco.ring(r, 0, H, (side, t, y) => {
      if (y === 0 || y >= H - 2) return ID.BLACK;
      const c = WASH[(t / 3 | 0) % WASH.length];
      return c;
    });
  });
  // tavan: kafes
  kit.ceiling(0, 0, f.W, f.D, (u, v) => (((u % 3) === 1 || (v % 3) === 1) ? ID.FACADE_DARK : ID.BLACK));
  // çelik kafes (ışık demetlerinin asıldığı hat)
  (L.dance || []).forEach((r) => {
    kit.box(r[0] - 1, r[1] - 1, r[2] + 1, r[1], H - 1, H, ID.FACADE_DARK);
    kit.box(r[0] - 1, r[3], r[2] + 1, r[3] + 1, H - 1, H, ID.FACADE_DARK);
  });
  void GLOW;
}

const impl = {
  kind: KIND,
  name: 'Kulüp',
  footprint() {
    return { w: 22, d: 18, h: 7 };
  },
  palette(it) {
    return PAL[(it.variant | 0) % 3];
  },
  plan(lot, rng, variant, ctx) {
    const b = new BuilderB(ctx);
    if (variant === 0) planV0(b, ctx, rng);
    else if (variant === 1) planV1(b, ctx, rng);
    else planV2(b, ctx, rng);
    const it = b.build();
    it.fx = { wash: true, periodSec: 6, strobe: false };
    return it;
  },
  emit,
};

export default impl;
