/*
 * KEŞİF sim/city/interior/kinds — 10. ÇATI BAHÇESİ (Bahar Hanım, "Bitkiler de şehirli."; yeşil/gün ışığı, ortam: kuş + rüzgâr; imza: tohum paketi).
 * Rezerv 20×20×5, kapı çizgisine bitişik tek kat. Çatı/terastan esinli AÇIK HAVA hissi: tavan gökyüzü freski (mavi + bulut), kuş/rüzgâr ortamı, saksı/yatak/ağaç dolu bahçe,
 * cam seralar. (Rezerv zemin kattan başlar; gerçek çatı yüzeyi ve `anchors.roofItems` kabuk yazıcısına (cityBuildings) aittir: `impl.emit` yalnız rezerv hacmi yazar.)
 * Üç varyant:
 *   V0 "Cam Sera Bahçesi" : ön bahçe (4 yatak, çapraz yol) + arkada cam cepheli KİLİTLİ sera (Rün Dizisi, kademe 0) + bahçıvan kulübesi
 *   V1 "Teras Kafe"       : sol çay kafesi (meyve barı, masalar, cam çardak) + sağ bahçe + arkada KİLİTLİ sera (kod, ipucu sahipte)
 *   V2 "Havuz Bahçesi"    : açık salon, ortada havuz + halka yataklar, ağaçlar; arkada KİLİTLİ cam sera (Renk Kolları) ve alet kulübesi
 * Çekirdek (kule asansör bacası) varsa bahçe onun çevresini dolanır.
 */
import { ID, cellHash } from '../../cityEmit.js';
import { B } from '../../../blocks.js';
import { getCatalogDef } from '../../../props/propCatalog.js';
import { worldBoxes } from '../../../props/propDefs.js';
import { BuilderB, Deco } from '../kindKitB.js';
import { PALETTES } from '../kit.js';

const KIND = 'cati_bahcesi';
const P = (o) => Object.freeze(o);
const PAL = [
  P(Object.assign({}, PALETTES.yesil, {
    floor: ID.POLISHED, floor2: ID.WHITE, wall: ID.WHITE, wall2: ID.GREEN, ceil: ID.BLUE, trim: ID.GREEN, glow: ID.NEON_LIME, glow2: ID.NEON_AMBER, lamp: 'panel', glass: B.GLASS_GREEN,
  })),
  P(Object.assign({}, PALETTES.yesil, {
    floor: ID.STONE_BRICK, floor2: B.PLANKS_BIRCH, wall: ID.WHITE, wall2: B.PLANKS_BIRCH, ceil: ID.BLUE, trim: B.PLANKS_ACACIA, glow: ID.NEON_AMBER, glow2: ID.NEON_LIME, lamp: 'lantern', glass: B.GLASS,
  })),
  P(Object.assign({}, PALETTES.yesil, {
    floor: ID.POLISHED, floor2: ID.FACADE_LIGHT, wall: ID.FACADE_LIGHT, wall2: ID.BLUE, ceil: ID.BLUE, trim: ID.NEON_CYAN, glow: ID.NEON_CYAN, glow2: ID.NEON_LIME, lamp: 'panel', glass: B.GLASS_BLUE,
  })),
];
const KEEP = ['havuz_dekor', 'meyve_bari', 'masa', 'sera_rafi'];
const PAD = ['saksi_buyuk', 'sera_rafi', 'sandalye', 'kafe_masasi', 'bitki_duvar'];
const FLOWERS = [B.TULIP, B.LAVENDER, B.DAISY, B.BLUEBELL, B.PEONY, B.FLOWER_RED, B.FLOWER_YELLOW, B.FERN, B.TALL_GRASS];

/** Çekirdeğe (etkin) değmeyen yatak dikdörtgenleri. */
function bed(b, list, rect) {
  if (rect[2] - rect[0] < 2 || rect[3] - rect[1] < 2) return false;
  if (b.coreAt(rect)) return false;
  list.push([rect[0] + b.ou, rect[1], rect[2] + b.ou, rect[3]]);
  return true;
}

function tree(b, list, u, v) {
  if (b.coreAt([u - 1, v - 1, u + 2, v + 2])) return false;
  list.push([u + b.ou, v]);
  return true;
}

/** Arka bant: çekirdek varsa onun iki yanından oda dikdörtgenleri [sol, sağ] (en az 4 geniş) ya da null. */
function backRooms(b, bs, D, W) {
  const cr = b.coreRect();
  if (!cr || cr[3] <= bs) return { left: [0, bs, Math.min(W - 6, 12), D], right: [Math.min(W - 6, 12) + 1, bs, W, D] };
  const left = [0, bs, Math.max(4, cr[0] - 1), D];
  const right = [Math.min(W - 4, cr[2] + 1), bs, W, D];
  return { left, right };
}

function planV0(b, ctx, rng) {
  const W = b.uw;
  const D = b.ud;
  const H = b.H;
  const bs = D - 6;
  const { left, right } = backRooms(b, bs + 1, D, W);
  b.room('bahce', [0, 0, W, bs], { role: 'bahce' });
  const flip = rng.chance(0.5);
  const sera = flip ? right : left;
  const kul = flip ? left : right;
  b.room('sera', sera, { role: 'sera' });
  b.room('kulube', kul, { role: 'kulube' });
  b.lockedDoor('d_sera', 'bahce', 'sera', {
    axis: 'u', line: bs, c: b.doorC(sera, bs, (sera[0] + sera[2]) >> 1, 1), w: 1,
  }, { kind: 'mini_hack', tier: 0, data: { game: 'simon' } });
  b.door('d_kulube', 'bahce', 'kulube', {
    axis: 'u', line: bs, c: b.doorC(kul, bs, (kul[0] + kul[2]) >> 1, 1), w: 1, kind: 'door',
  });
  const beds = [];
  const trees = [];
  const mu = W >> 1;
  const mv = (bs >> 1) + 1;
  bed(b, beds, [1, 2, mu - 2, mv - 1]);
  bed(b, beds, [mu + 2, 2, W - 1, mv - 1]);
  bed(b, beds, [1, mv + 2, mu - 2, bs - 1]);
  bed(b, beds, [mu + 2, mv + 2, W - 1, bs - 1]);
  tree(b, trees, 3, 4);
  tree(b, trees, W - 4, 4);
  tree(b, trees, 3, bs - 3);
  tree(b, trees, W - 4, bs - 3);
  b.layout = {
    v: 0, rooms: { bahce: b.rr('bahce'), sera: b.rr('sera'), kulube: b.rr('kulube') }, beds, trees, ponds: [], canopy: null, glass: ['sera'],
  };
  // bahçe: kafe köşesi (kapıdan uzak yarıda) + saksılar + sera rafları
  const du = b.edu;
  const cu = du < W / 2 ? Math.min(W - 4, du + 3) : Math.max(1, du - 5);
  b.put('masa', cu, 2, 0, { variant: 0 });
  b.run('sandalye', cu, 1, 2, 'u', 0, { variants: [0, 1] });
  b.run('sandalye', cu, 3, 2, 'u', 2, { variants: [2, 1] });
  b.post(cu + 3, 2, 3, 'bahce');
  b.signature(cu, 2, 0.875);
  b.atFront('otomat_icecek', du < W / 2 ? W - 1 : 0, 0);
  b.atFront('cay_ocagi', du < W / 2 ? W - 2 : 1, 0);
  b.wall('menu_tahtasi', du < W / 2 ? W - 4 : 3, 0, 2, { span: 2, y: 1.2 });
  b.atLeft('sera_rafi', 0, mv - 1, { variant: 0 });
  b.atRight('sera_rafi', W - 1, mv - 1, { variant: 1 });
  b.run('saksi_buyuk', 1, 1, 2, 'u', 0, { variants: [0, 1] });
  b.run('saksi_buyuk', W - 3, 1, 2, 'u', 0, { variants: [2, 3] });
  b.wall('bitki_duvar', 2, bs - 1, 0, { span: 2, y: 0.5 });
  b.wall('bitki_duvar', W - 4, bs - 1, 0, { span: 2, y: 0.5 });
  b.wall('bitki_duvar', mu - 1, bs - 1, 0, { span: 2, y: 0.5 });
  b.run('sarkik_bitki', mu - 3, mv, 2, 'u', 0, { step: 4, variants: [0, 1] });
  b.run('sarkik_bitki', 2, mv - 2, 2, 'u', 0, { step: W - 5, variants: [2, 0] });
  b.atBack('sera_rafi', 1, bs - 1, { variant: 2 });
  b.atBack('sera_rafi', W - 3, bs - 1, { variant: 0 });
  // sera + kulübe
  b.run('sera_rafi', sera[0], sera[1] + 1, 2, 'v', 1, { flush: 3, variants: [0, 1] });
  b.atBack('sera_rafi', sera[0] + 2, D - 1, { variant: 1 });
  b.run('saksi_buyuk', sera[2] - 2, sera[1] + 1, 2, 'v', 0, { variants: [1, 2] });
  b.chip('oda', sera[0] + 2, D - 2, 0);
  b.atBack('masa', kul[0] + 1, D - 1, { variant: 1 });
  b.run('sandalye', kul[0] + 1, D - 3, 2, 'u', 0, { variants: [0, 2] });
  b.atRight('cay_ocagi', kul[2] - 1, kul[1] + 1);
  b.atLeft('sera_rafi', kul[0], kul[1] + 1, { variant: 2 });
  // ışık: güneş panelleri + fener
  b.lamp('bahce', 4, 3, 'panel');
  b.lamp('bahce', W - 5, 3, 'panel');
  b.lamp('bahce', 4, bs - 3, 'lantern');
  b.lamp('bahce', W - 5, bs - 3, 'lantern');
  b.lamp('sera', (sera[0] + sera[2]) >> 1, sera[1] + 2, 'neon_lime');
  b.lamp('kulube', (kul[0] + kul[2]) >> 1, kul[1] + 2, 'lantern');
  b.accent(sera[0], sera[1], sera[2], sera[1] + 1, H - 1, H, ID.NEON_LIME);
  b.pad(PAD, 28, rng);
  b.trim(38, KEEP);
}

function planV1(b, ctx, rng) {
  const W = b.uw;
  const D = b.ud;
  const H = b.H;
  const du = b.edu;
  const half = W >> 1;
  let kw = du < half ? Math.max(du + 3, half) : Math.min(du - 3, half);
  kw = Math.max(5, Math.min(W - 6, kw));
  const bs = D - 6;
  const kafe = [0, 0, kw, D];
  const bahce = [kw + 1, 0, W, bs];
  const sera = [kw + 1, bs + 1, W, D];
  b.room('kafe', kafe, { role: 'kafe' });
  b.room('bahce', bahce, { role: 'bahce' });
  b.room('sera', sera, { role: 'sera' });
  b.door('d_kafe', 'kafe', 'bahce', {
    axis: 'v', line: kw, c: 5, w: 3, kind: 'arch',
  });
  b.lockedDoor('d_sera', 'bahce', 'sera', {
    axis: 'u', line: bs, c: b.doorC(sera, bs, (sera[0] + sera[2]) >> 1, 1), w: 1,
  }, { kind: 'kod', tier: 1, data: { clue: 'owner' } });
  const beds = [];
  const trees = [];
  bed(b, beds, [bahce[0] + 1, 2, bahce[2] - 1, bs - 1]);
  tree(b, trees, bahce[0] + 2, 3);
  tree(b, trees, bahce[2] - 3, bs - 3);
  b.layout = {
    v: 1, rooms: { kafe: b.rr('kafe'), bahce: b.rr('bahce'), sera: b.rr('sera') }, beds, trees, ponds: [], canopy: [kafe[0] + b.ou, 1, kafe[2] + b.ou, Math.min(D - 1, 9)], glass: ['sera'],
  };
  // kafe: meyve barı arka duvarda, masalar çardağın altında
  b.atBack('meyve_bari', 1, D - 1, { variant: 1 });
  b.post(2, D - 2, 2, 'kafe');
  b.signature(1, D - 1, 1.125);
  b.run('sandalye', 1, D - 3, 3, 'u', 2, { variants: [0, 1, 2] });
  b.atBack('cay_ocagi', 5, D - 1);
  b.atBack('otomat_icecek', 6, D - 1);
  for (let i = 0; i < 3; i++) {
    const mu = 1 + i * 3;
    b.put('kafe_masasi', mu, 3, 0, { variant: i });
    b.place('sandalye', mu, 2, 0, { variant: (i + 1) % 3 });
    b.place('sandalye', mu, 4, 2, { variant: (i + 2) % 3 });
  }
  b.put('masa', 1, 6, 0, { variant: 2 });
  b.run('sandalye', 1, 5, 2, 'u', 0, { variants: [1, 0] });
  b.run('sandalye', 1, 7, 2, 'u', 2, { variants: [2, 1] });
  b.wall('menu_tahtasi', 3, D - 1, 0, { span: 2, y: 1.2 });
  b.atLeft('saksi_buyuk', 0, 1, { variant: 0 });
  b.atLeft('saksi_buyuk', 0, 6, { variant: 3 });
  b.wall('bitki_duvar', 1, 0, 2, { span: 2, y: 0.5 });
  b.run('sarkik_bitki', 2, 3, 3, 'u', 0, { step: 3, variants: [0, 1, 2] });
  // bahçe
  b.run('saksi_buyuk', bahce[0], 1, 2, 'u', 0, { variants: [1, 2] });
  b.atRight('sera_rafi', bahce[2] - 1, 3, { variant: 0 });
  b.atRight('sera_rafi', bahce[2] - 1, 6, { variant: 1 });
  b.atBack('sera_rafi', bahce[0] + 1, bs - 1, { variant: 2 });
  b.atBack('saksi_buyuk', bahce[2] - 2, bs - 1, { variant: 0 });
  b.wall('bitki_duvar', bahce[0] + 2, bs - 1, 0, { span: 2, y: 0.5 });
  b.wall('bitki_duvar', bahce[2] - 4, bs - 1, 0, { span: 2, y: 0.5 });
  b.place('kafe_masasi', bahce[0] + 1, 1, 0, { variant: 1 });
  // sera
  b.run('sera_rafi', sera[0], sera[1] + 1, 2, 'v', 1, { flush: 3, variants: [0, 1] });
  b.atBack('sera_rafi', sera[0] + 2, D - 1, { variant: 2 });
  b.run('saksi_buyuk', sera[2] - 2, sera[1] + 1, 2, 'v', 0, { variants: [3, 2] });
  b.chip('oda', sera[0] + 2, D - 2, 0);
  // ışık
  b.lamp('kafe', 3, 3, 'lantern');
  b.lamp('kafe', 3, D - 4, 'lantern');
  b.lamp('kafe', kw - 3, (D >> 1), 'panel');
  b.lamp('bahce', bahce[0] + 3, 3, 'panel');
  b.lamp('bahce', bahce[2] - 4, bs - 3, 'panel');
  b.lamp('sera', (sera[0] + sera[2]) >> 1, sera[1] + 2, 'neon_lime');
  b.accent(kafe[0] + 1, 1, kafe[2] - 1, 2, H - 1, H, ID.NEON_AMBER);
  b.pad(PAD, 28, rng);
  b.trim(38, KEEP);
}

function planV2(b, ctx, rng) {
  const W = b.uw;
  const D = b.ud;
  const H = b.H;
  const du = b.edu;
  const bs = D - 6;
  const { left, right } = backRooms(b, bs + 1, D, W);
  b.room('bahce', [0, 0, W, bs], { role: 'bahce' });
  const flip = rng.chance(0.5);
  const sera = flip ? left : right;
  const alet = flip ? right : left;
  b.room('sera', sera, { role: 'sera' });
  b.room('alet', alet, { role: 'kulube' });
  b.lockedDoor('d_sera', 'bahce', 'sera', {
    axis: 'u', line: bs, c: b.doorC(sera, bs, (sera[0] + sera[2]) >> 1, 1), w: 1,
  }, { kind: 'mini_hack', tier: 1, data: { game: 'levers' } });
  b.door('d_alet', 'bahce', 'alet', {
    axis: 'u', line: bs, c: b.doorC(alet, bs, (alet[0] + alet[2]) >> 1, 1), w: 1, kind: 'door',
  });
  const beds = [];
  const trees = [];
  const ponds = [];
  const mu = W >> 1;
  const mv = (bs >> 1);
  // havuz ortada (3×2 dekor prop) + halka yatak
  const pu = mu - 1;
  const pv = mv - 1;
  const pondOk = !b.coreAt([pu - 2, pv - 2, pu + 5, pv + 4]);
  if (pondOk) {
    b.place('havuz_dekor', pu + 1, pv, 0, { variant: 0, du: 0, dv: 0.5 });
    ponds.push([pu + b.ou, pv, pu + 3 + b.ou, pv + 2]);
    bed(b, beds, [pu - 2, pv - 2, pu + 5, pv + 4]);
  }
  bed(b, beds, [1, 2, 5, bs - 1]);
  bed(b, beds, [W - 5, 2, W - 1, bs - 1]);
  tree(b, trees, 3, 3);
  tree(b, trees, W - 4, 3);
  tree(b, trees, 3, bs - 3);
  tree(b, trees, W - 4, bs - 3);
  b.layout = {
    v: 2, rooms: { bahce: b.rr('bahce'), sera: b.rr('sera'), alet: b.rr('alet') }, beds, trees, ponds, canopy: null, glass: ['sera'],
  };
  const cu = du < W / 2 ? Math.min(W - 6, du + 3) : Math.max(5, du - 6);
  b.put('masa', cu, 1, 0, { variant: 1 });
  b.run('sandalye', cu, 0, 2, 'u', 0, { variants: [0, 2] });
  b.run('sandalye', cu, 2, 2, 'u', 2, { variants: [1, 0] });
  b.post(cu + 3, 1, 3, 'bahce');
  b.signature(cu, 1, 0.875);
  b.atFront('otomat_icecek', du < W / 2 ? W - 1 : 0, 0);
  b.atFront('cay_ocagi', du < W / 2 ? W - 2 : 1, 0);
  b.wall('menu_tahtasi', du < W / 2 ? W - 4 : 3, 0, 2, { span: 2, y: 1.2 });
  b.atLeft('sera_rafi', 0, mv - 1, { variant: 1 });
  b.atRight('sera_rafi', W - 1, mv - 1, { variant: 2 });
  b.atLeft('saksi_buyuk', 0, 1, { variant: 1 });
  b.atRight('saksi_buyuk', W - 1, 1, { variant: 2 });
  b.atLeft('saksi_buyuk', 0, bs - 2, { variant: 0 });
  b.atRight('saksi_buyuk', W - 1, bs - 2, { variant: 3 });
  b.wall('bitki_duvar', 2, bs - 1, 0, { span: 2, y: 0.5 });
  b.wall('bitki_duvar', W - 4, bs - 1, 0, { span: 2, y: 0.5 });
  b.wall('bitki_duvar', mu - 1, bs - 1, 0, { span: 2, y: 0.5 });
  b.run('sarkik_bitki', mu - 3, mv - 3, 2, 'u', 0, { step: 4, variants: [0, 1] });
  b.run('sarkik_bitki', mu - 3, mv + 3, 2, 'u', 0, { step: 4, variants: [2, 0] });
  b.atBack('sera_rafi', 1, bs - 1, { variant: 0 });
  b.atBack('sera_rafi', W - 3, bs - 1, { variant: 1 });
  // sera + alet kulübesi
  b.run('sera_rafi', sera[0], sera[1] + 1, 2, 'v', 1, { flush: 3, variants: [2, 1] });
  b.atBack('sera_rafi', sera[0] + 2, D - 1, { variant: 0 });
  b.run('saksi_buyuk', sera[2] - 2, sera[1] + 1, 2, 'v', 0, { variants: [0, 1] });
  b.chip('oda', sera[0] + 2, D - 2, 0);
  b.atBack('masa', alet[0] + 1, D - 1, { variant: 0 });
  b.run('sandalye', alet[0] + 1, D - 3, 2, 'u', 0, { variants: [1, 2] });
  b.atLeft('sera_rafi', alet[0], alet[1] + 1, { variant: 1 });
  b.atRight('cay_ocagi', alet[2] - 1, alet[1] + 1);
  // ışık
  b.lamp('bahce', 4, 3, 'panel');
  b.lamp('bahce', W - 5, 3, 'panel');
  b.lamp('bahce', 4, bs - 3, 'lantern');
  b.lamp('bahce', W - 5, bs - 3, 'lantern');
  b.lamp('sera', (sera[0] + sera[2]) >> 1, sera[1] + 2, 'neon_cyan');
  b.lamp('alet', (alet[0] + alet[2]) >> 1, alet[1] + 2, 'lantern');
  b.accent(sera[0], sera[1], sera[2], sera[1] + 1, H - 1, H, ID.NEON_CYAN);
  b.pad(PAD, 28, rng);
  b.trim(38, KEEP);
}

/* ------------------------------------------------------------------------------------------------
 * Yayım
 * ---------------------------------------------------------------------------------------------- */
/** Çarpışmalı propların kapladığı (u,v) hücreleri (bitki dikimi bunları atlar). */
function propCells(interior, f) {
  const set = new Set();
  interior.props.forEach((p) => {
    const def = getCatalogDef(p.kind);
    if (!def || !def.colliders.length) return;
    const boxes = worldBoxes(def, p.x, p.y, p.z, p.yaw, []);
    boxes.forEach((bx) => {
      for (let x = Math.floor(bx[0] + 1e-6); x < Math.ceil(bx[3] - 1e-6); x++) {
        for (let z = Math.floor(bx[2] + 1e-6); z < Math.ceil(bx[5] - 1e-6); z++) {
          const l = f.local(x, z);
          set.add(l[0] + ',' + l[1]);
        }
      }
    });
  });
  return set;
}

function inAny(rects, u, v) {
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (u >= r[0] && u < r[2] && v >= r[1] && v < r[3]) return true;
  }
  return false;
}

function emit(W, interior, ctx) {
  const { kit, pal, frame: f } = ctx;
  const L = interior.layout;
  const deco = new Deco(kit, f);
  const H = f.H;
  const occ = propCells(interior, f);
  const seraR = L.rooms.sera;
  const kulR = L.rooms.kulube || L.rooms.alet || null;
  // zemin: taş yol, yataklar çim/yosun
  kit.floor(0, 0, f.W, f.D, (u, v) => (((u + v) & 1) ? pal.floor : pal.floor2));
  L.beds.forEach((r) => {
    kit.floor(r[0], r[1], r[2], r[3], (u, v) => {
      const h = cellHash(f.wx(u, v), f.wz(u, v), 17) % 100;
      return h < 12 ? B.FLOWERING_MOSS : h < 30 ? B.MOSS : B.GRASS;
    });
  });
  L.ponds.forEach((r) => kit.floor(r[0] - 1, r[1] - 1, r[2] + 1, r[3] + 1, (u, v) => ((u >= r[0] && u < r[2] && v >= r[1] && v < r[3]) ? ID.BLUE : B.GLASS_BLUE)));
  // sera: nemli zemin + cam duvar
  kit.floor(seraR[0], seraR[1], seraR[2], seraR[3], (u, v) => (((u + v) & 1) ? B.MOSS : B.GRASS));
  if (kulR) kit.floor(kulR[0], kulR[1], kulR[2], kulR[3], (u, v) => (((u >> 1) + (v >> 1)) & 1 ? B.PLANKS_OAK : B.PLANKS_BIRCH));
  if (L.rooms.kafe) {
    const k = L.rooms.kafe;
    kit.floor(k[0], k[1], k[2], k[3], (u, v) => (((u >> 1) + (v >> 1)) & 1 ? B.PLANKS_BIRCH : B.PLANKS_OAK));
  }
  // bitkiler (çiçekler: geçilebilir, çarpışmasız)
  L.beds.forEach((r) => {
    for (let v = r[1]; v < r[3]; v++) {
      for (let u = r[0]; u < r[2]; u++) {
        if (occ.has(u + ',' + v)) continue;
        const h = cellHash(f.wx(u, v), f.wz(u, v), 29) % 100;
        if (h < 46) kit.setAir(u, v, 0, FLOWERS[cellHash(f.wx(u, v), f.wz(u, v), 31) % FLOWERS.length]);
      }
    }
  });
  for (let v = seraR[1]; v < seraR[3]; v++) {
    for (let u = seraR[0]; u < seraR[2]; u++) {
      if (occ.has(u + ',' + v)) continue;
      const h = cellHash(f.wx(u, v), f.wz(u, v), 37) % 100;
      if (h < 40) kit.setAir(u, v, 0, FLOWERS[cellHash(f.wx(u, v), f.wz(u, v), 41) % FLOWERS.length]);
    }
  }
  // ağaçlar: gövde 3 + taç (3×3, 2 kat)
  L.trees.forEach((t) => {
    const [u, v] = t;
    if (occ.has(u + ',' + v)) return;
    kit.box(u, v, u + 1, v + 1, 0, 3, B.LOG_OAK);
    for (let dv = -1; dv <= 1; dv++) {
      for (let du = -1; du <= 1; du++) {
        if (du === 0 && dv === 0) continue;
        if (inAny(kulR ? [seraR, kulR] : [seraR], u + du, v + dv)) continue;
        kit.setAir(u + du, v + dv, H - 2, du === 0 || dv === 0 ? B.LEAVES_OAK : B.LEAVES_BIRCH);
        kit.setAir(u + du, v + dv, H - 1, B.LEAVES_OAK);
      }
    }
    kit.setAir(u, v, H - 2, B.LEAVES_OAK);
    kit.setAir(u, v, H - 1, B.LEAVES_OAK);
  });
  // duvarlar: beyaz + yeşil şerit; sera ön duvarı cam
  Object.keys(L.rooms).forEach((k) => {
    const glass = L.glass.indexOf(k) >= 0;
    deco.ring(L.rooms[k], 0, H, (side, t, y) => {
      if (glass && side === 2) return (y === 0 || y === H - 1 || (t % 4) === 0) ? ID.WHITE : pal.glass;
      if (y === 0) return pal.wall2;
      if (y === H - 1) return pal.wall2;
      return undefined;
    });
  });
  // tavan: gökyüzü freski (mavi + bulut); cam çardak
  const sky = (u, v) => {
    const h = cellHash(f.wx(u, v) >> 1, f.wz(u, v) >> 1, 43) % 100;
    return h < 22 ? ID.WHITE : ID.BLUE;
  };
  kit.ceiling(0, 0, f.W, f.D, sky);
  if (L.canopy) {
    const c = L.canopy;
    for (let v = c[1]; v < c[3]; v++) {
      for (let u = c[0]; u < c[2]; u++) {
        const beam = ((u - c[0]) % 3 === 0) || ((v - c[1]) % 3 === 0);
        kit.set(u, v, H - 2, beam ? B.LOG_OAK : pal.glass);
      }
    }
  }
}

const impl = {
  kind: KIND,
  name: 'Çatı Bahçesi',
  footprint() {
    return { w: 20, d: 20, h: 5 };
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
    it.fx = { sky: true, wind: true };
    // binanın çatı çapaları (bahçe çatısı: saksı/bank/klima): kabuk yazıcısı ve çatı rotaları bunları kullanır; iç mekân kaydı bilgi olarak taşır
    it.roofAnchors = ctx.bp && ctx.bp.anchors && ctx.bp.roof ? { y: ctx.bp.roof.y, kind: ctx.bp.roof.kind, items: ctx.bp.anchors.roofItems.map((q) => ({ kind: q.kind, x: q.x, y: q.y, z: q.z, yaw: q.yaw })) } : null;
    return it;
  },
  emit,
};

export default impl;
