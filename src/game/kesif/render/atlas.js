/*
 * KEŞİF render — prosedürel doku atlası.
 *
 * Boru hattı (hepsi saf JS, canvas YOK → node'da test edilir, worker'da çalışır):
 *   1) Her doku adı için 32×32 boyayıcı (atlasTiles*.js) → Float32 kanallar (renk, yükseklik, pürüzlülük, emisyon, AO, ton maskesi)
 *   2) İstenen doku boyuna yeniden örnekleme (16 düşük / 32 / 64)
 *   3) Normal haritası: yükseklikten Sobel (sarmalı → döşenen dokular kusursuz)
 *   4) Atlasa paketleme: RGBA8 üç tampon + her hücrede sarmalı dolgu (mip/bilinear sızıntısı komşuya değil kendine olur)
 *        color    : sRGB renk, A = kapsama/opaklık (kesik ve şeffaf geçişler için)
 *        normal   : teğet uzayı, OpenGL (+Y yukarı), A = 255
 *        material : R = pürüzlülük, G = emisyon, B = AO/boşluk (cavity), A = biyom tonu maskesi (255 = ton uygulanır)
 *
 * Dışa aktarım: generateAtlasPixels, createAtlasTextures, paintTileByName, tilePixel, TINT_DEFAULTS, SEAMLESS_TILES.
 */
import { TILE_NAMES, TILE_COUNT, BLOCKS, BLOCK_COLORS, RUNES } from '../sim/blocks.js';
import { computeAtlasLayout } from './atlasLayout.js';
import { N, createTile, cavityFromHeight, dilateColors, strSeed, ihash, setSpriteClip } from './atlasKit.js';
import * as T from './atlasTilesTerrain.js';
import * as F from './atlasTilesFlora.js';
import * as B from './atlasTilesBuild.js';
import * as FU from './atlasTilesFurniture.js';
import * as O from './atlasTilesOres.js';
import * as S from './atlasTilesSystem.js';
import { CRAFT_PAINTERS } from './atlasTilesCraft.js';
import { MAGIC_PAINTERS } from './atlasTilesMagic.js';
import { TREE_PAINTERS } from './atlasTilesTree.js';
import { TECH_PAINTERS } from './atlasTilesTech.js';
import { BIOME_PAINTERS } from './atlasTilesBiome.js';
import { CITY_PAINTERS } from './atlasTilesCity.js';

/** Biyom tonu uygulanan dokular için varsayılan (ikon/UI) renkleri. */
export const TINT_DEFAULTS = Object.freeze({ grass: 0x79bd4b, foliage: 0x5ea63a, water: 0x3a8fd9 });
const TINT_CODE = { grass: 1, foliage: 2, water: 3 };

/* ------------------------------------------------------------------------------------------------
 * Boyayıcı kayıt defteri (TILE_NAMES'in her adı için tam bir kayıt)
 * ---------------------------------------------------------------------------------------------- */
const REG = {
  taş: T.paintStone,
  kırıktaş: T.paintCobble,
  toprak: T.paintDirt,
  çimen_üst: T.paintGrassTop,
  çimen_yan: T.paintGrassSide,
  kar: T.paintSnow,
  çim_kar_yan: T.paintSnowGrassSide,
  kum: (t, s) => T.paintSand(t, s),
  kızıl_kum: T.paintRedSand,
  çakıl: T.paintGravel,
  buz: T.paintIce,
  kil: T.paintClay,
  kumtaşı_üst: T.paintSandstoneTop,
  kumtaşı_alt: T.paintSandstoneBottom,
  kumtaşı_yan: T.paintSandstoneSide,
  bazalt_üst: T.paintBasaltTop,
  bazalt_yan: T.paintBasaltSide,
  kristal_kaya: O.paintCrystalRock,
  çamur: T.paintMud,
  kaygan_buz: T.paintSlipperyIce,
  kanyon_üst: T.paintCanyonTop,
  kanyon_yan: T.paintCanyonSide,
  kitaplık_üst: FU.paintBookshelfTop,
  kitaplık_yan: FU.paintBookshelfSide,
  levha: FU.paintSign,
  su: T.paintWater,
  akan_su: T.paintWaterFlow,
  lav: (t, s) => T.paintLava(t, s, false),
  akan_lav: (t, s) => T.paintLava(t, s, true),
  cevher_kömür: (t, s) => O.paintOre(t, s, 'kömür'),
  cevher_bakır: (t, s) => O.paintOre(t, s, 'bakır'),
  cevher_demir: (t, s) => O.paintOre(t, s, 'demir'),
  cevher_altın: (t, s) => O.paintOre(t, s, 'altın'),
  cevher_elmas: (t, s) => O.paintOre(t, s, 'elmas'),
  cevher_kuantum: (t, s) => O.paintOre(t, s, 'kuantum'),
  cevher_kızıltaş: (t, s) => O.paintOre(t, s, 'kızıltaş'),
  cevher_zümrüt: (t, s) => O.paintOre(t, s, 'zümrüt'),
  ametist_kümesi: O.paintAmethyst,
  bakır_bloğu: (t, s) => B.paintMetal(t, s, 'bakır'),
  demir_bloğu: (t, s) => B.paintMetal(t, s, 'demir'),
  altın_bloğu: (t, s) => B.paintMetal(t, s, 'altın'),
  elmas_bloğu: (t, s) => B.paintMetal(t, s, 'elmas'),
  kuantum_bloğu: (t, s) => B.paintMetal(t, s, 'kuantum'),
  ışık_bloğu: B.paintLightBlock,
  zıplama_üst: B.paintBounceTop,
  zıplama_alt: B.paintBounceBottom,
  zıplama_yan: B.paintBounceSide,
  gelincik: (t, s) => F.paintPoppy(t, s, false),
  sarı_çiçek: (t, s) => F.paintPoppy(t, s, true),
  uzun_ot: F.paintTallGrass,
  çalı: F.paintBush,
  kaktüs_üst: (t, s) => F.paintCactusTop(t, s, false),
  kaktüs_alt: (t, s) => F.paintCactusTop(t, s, true),
  kaktüs_yan: F.paintCactusSide,
  ışıklı_mantar: F.paintMushroom,
  yosun: F.paintMoss,
  sarmaşık: F.paintVine,
  tuğla: B.paintBricks,
  taş_tuğla: B.paintStoneBrick,
  cilalı_taş: B.paintPolished,
  sütun_üst: B.paintPillarTop,
  sütun_yan: B.paintPillarSide,
  cam: (t, s) => B.paintGlass(t, s, null),
  fener: FU.paintLantern,
  meşale: FU.paintTorch,
  sandık_üst: (t, s) => FU.paintChestTop(t, s, false),
  sandık_yan: (t, s) => FU.paintChestSide(t, s, false),
  tezgah_üst: FU.paintWorkbenchTop,
  tezgah_yan: FU.paintWorkbenchSide,
  ocak_üst: FU.paintFurnaceTop,
  ocak_yan: FU.paintFurnaceSide,
  kapı: FU.paintDoor,
  yatak_üst: FU.paintBedTop,
  yatak_yan: FU.paintBedSide,
  ana_kaya: S.paintBedrock,
  mühür_bariyeri: S.paintBarrier,
  plaka: (t, s) => S.paintPlate(t, s, false),
  plaka_basılı: (t, s) => S.paintPlate(t, s, true),
  kol: (t, s) => S.paintLever(t, s, false),
  kol_açık: (t, s) => S.paintLever(t, s, true),
  mantık_kapısı: S.paintLogicGate,
  alıcı: (t, s) => S.paintReceiver(t, s, false),
  alıcı_aktif: (t, s) => S.paintReceiver(t, s, true),
  ayna: S.paintMirror,
  ışın_kaynağı: S.paintBeamSource,
  itilebilir_blok: S.paintPushBlock,
  hareketli_platform: S.paintMovingPlatform,
  kilitli_kapı: S.paintLockedDoor,
  ödül_sandığı_üst: (t, s) => FU.paintChestTop(t, s, true),
  ödül_sandığı: (t, s) => FU.paintChestSide(t, s, true),
  parkur_başlangıç: (t, s) => S.paintParkour(t, s, 'başlangıç'),
  parkur_bitiş: (t, s) => S.paintParkour(t, s, 'bitiş'),
  parkur_kontrol: (t, s) => S.paintParkour(t, s, 'kontrol'),
  portal_mavi: (t, s) => S.paintPortal(t, s, false),
  portal_turuncu: (t, s) => S.paintPortal(t, s, true),
  boss_kapısı: S.paintBossDoor,
  sunak_üst: S.paintAltarTop,
  sunak_yan: S.paintAltarSide,
  portal_çerçeve: S.paintPortalFrame,
  ...CRAFT_PAINTERS,
  ...MAGIC_PAINTERS,
  ...TREE_PAINTERS,
  ...TECH_PAINTERS,
  ...BIOME_PAINTERS,
  ...CITY_PAINTERS,
};

['meşe', 'huş', 'çam', 'akasya'].forEach((w) => {
  REG['kütük_' + w + '_üst'] = (t, s) => F.paintLogTop(t, s, w);
  REG['kütük_' + w + '_yan'] = (t, s) => F.paintLogSide(t, s, w);
  REG['tahta_' + w] = (t, s) => F.paintPlanks(t, s, w);
  REG['yaprak_' + w] = (t, s) => F.paintLeaves(t, s, w);
});
BLOCK_COLORS.forEach((c) => {
  REG['cam_' + c.key] = (t, s) => B.paintGlass(t, s, c.hex);
  REG['beton_' + c.key] = (t, s) => B.paintConcrete(t, s, c.hex);
  REG['kumaş_' + c.key] = (t, s) => B.paintCloth(t, s, c.hex);
});
RUNES.forEach((r) => {
  REG['rün_' + r.color] = (t, s) => S.paintRune(t, s, r.symbol, r.hex);
});

/** Kusursuz döşenmesi beklenen dokular (test + belge). */
export const SEAMLESS_TILES = Object.freeze([
  'taş', 'kırıktaş', 'toprak', 'çimen_üst', 'kum', 'kızıl_kum', 'çakıl', 'kar', 'buz', 'kil', 'kumtaşı_üst', 'kumtaşı_alt',
  'kumtaşı_yan', 'bazalt_üst', 'bazalt_yan', 'çamur', 'kanyon_üst', 'kanyon_yan', 'kaygan_buz', 'su', 'akan_su', 'lav',
  'akan_lav', 'yosun', 'tuğla', 'taş_tuğla', 'ana_kaya',
  'kütük_meşe_yan', 'kütük_huş_yan', 'kütük_çam_yan', 'kütük_akasya_yan',
  'tahta_meşe', 'tahta_huş', 'tahta_çam', 'tahta_akasya',
  'yaprak_meşe', 'yaprak_huş', 'yaprak_çam', 'yaprak_akasya',
].concat(BLOCK_COLORS.map((c) => 'beton_' + c.key)).concat(BLOCK_COLORS.map((c) => 'kumaş_' + c.key)));

/** Doku adı → boyayıcı var mı. */
export function hasPainter(name) {
  return typeof REG[name] === 'function';
}

/** Kayıtlı (boyayıcısı olan) tüm adlar. */
export function painterNames() {
  return Object.keys(REG);
}

/** Tek bir dokuyu 32×32 boyama alanında üretir (yükseklik/AO sonlandırılmış). Belirlenimci. */
export function paintTileByName(name, seed = 0) {
  const fn = REG[name];
  if (!fn) throw new Error('Doku boyayıcısı yok: ' + name);
  const t = createTile();
  setSpriteClip(false);
  try {
    fn(t, (strSeed(name) ^ ihash(seed, 0, 0)) >>> 0);
  } finally {
    setSpriteClip(false);
  }
  cavityFromHeight(t);
  let translucent = false;
  for (let i = 3; i < t.c.length; i += 4) {
    if (t.c[i] < 0.999) {
      translucent = true;
      break;
    }
  }
  if (translucent) dilateColors(t, 4);
  return t;
}

/* ------------------------------------------------------------------------------------------------
 * Yeniden örnekleme
 * ---------------------------------------------------------------------------------------------- */
function sampleWrap(arr, stride, n, x, y, ch) {
  return arr[(((y % n) + n) % n * n + (((x % n) + n) % n)) * stride + ch];
}

/** 32'lik kanalları n×n'e indirger/büyütür (alfa ağırlıklı renk). */
function resampleTile(t, n) {
  if (n === N) return t;
  const out = {
    n,
    c: new Float32Array(n * n * 4),
    h: new Float32Array(n * n),
    ro: new Float32Array(n * n),
    e: new Float32Array(n * n),
    ao: new Float32Array(n * n),
    tm: new Float32Array(n * n),
    bump: t.bump,
  };
  const scalar = [['h', 1], ['ro', 1], ['e', 1], ['ao', 1], ['tm', 1]];
  if (n < N) {
    const f = N / n;
    const area = f * f;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        const acc = { h: 0, ro: 0, e: 0, ao: 0, tm: 0 };
        for (let dy = 0; dy < f; dy++) {
          for (let dx = 0; dx < f; dx++) {
            const i = ((y * f + dy) * N + (x * f + dx));
            const al = t.c[i * 4 + 3];
            r += t.c[i * 4] * al;
            g += t.c[i * 4 + 1] * al;
            b += t.c[i * 4 + 2] * al;
            a += al;
            acc.h += t.h[i];
            acc.ro += t.ro[i];
            acc.e += t.e[i];
            acc.ao += t.ao[i];
            acc.tm += t.tm[i];
          }
        }
        const o = (y * n + x) * 4;
        const wa = a > 1e-6 ? a : 1;
        out.c[o] = r / wa;
        out.c[o + 1] = g / wa;
        out.c[o + 2] = b / wa;
        out.c[o + 3] = a / area;
        const j = y * n + x;
        out.h[j] = acc.h / area;
        out.ro[j] = acc.ro / area;
        out.e[j] = acc.e / area;
        out.ao[j] = acc.ao / area;
        out.tm[j] = acc.tm / area;
      }
    }
    return out;
  }
  // büyütme: çift doğrusal, sarmalı
  const f = N / n; // < 1
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const sx = (x + 0.5) * f - 0.5;
      const sy = (y + 0.5) * f - 0.5;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const tx = sx - x0;
      const ty = sy - y0;
      const o = (y * n + x) * 4;
      for (let ch = 0; ch < 4; ch++) {
        const a = sampleWrap(t.c, 4, N, x0, y0, ch);
        const b = sampleWrap(t.c, 4, N, x0 + 1, y0, ch);
        const c = sampleWrap(t.c, 4, N, x0, y0 + 1, ch);
        const d = sampleWrap(t.c, 4, N, x0 + 1, y0 + 1, ch);
        out.c[o + ch] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
      }
      for (let k = 0; k < scalar.length; k++) {
        const key = scalar[k][0];
        const a = sampleWrap(t[key], 1, N, x0, y0, 0);
        const b = sampleWrap(t[key], 1, N, x0 + 1, y0, 0);
        const c = sampleWrap(t[key], 1, N, x0, y0 + 1, 0);
        const d = sampleWrap(t[key], 1, N, x0 + 1, y0 + 1, 0);
        out[key][y * n + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
      }
    }
  }
  return out;
}

/** Yükseklikten teğet-uzayı normal (RGB bayt, sarmalı Sobel). out: Uint8 n*n*3. */
function buildNormals(t, n, out) {
  const h = t.h;
  const k = (t.bump || 1) * 2.4 * (n / N);
  const at = (x, y) => h[(((y % n) + n) % n) * n + (((x % n) + n) % n)];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const tl = at(x - 1, y - 1);
      const tt = at(x, y - 1);
      const tr = at(x + 1, y - 1);
      const l = at(x - 1, y);
      const r = at(x + 1, y);
      const bl = at(x - 1, y + 1);
      const bb = at(x, y + 1);
      const br = at(x + 1, y + 1);
      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) / 8;
      const dy = (bl + 2 * bb + br - (tl + 2 * tt + tr)) / 8;
      // sanat satırı aşağı artar; v yukarı artar → dh/dv = -dy; normal = (-dh/du, -dh/dv, 1)
      let nx = -dx * k;
      let ny = dy * k;
      const nz = 1;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= inv;
      ny *= inv;
      const nzz = nz * inv;
      const o = (y * n + x) * 3;
      out[o] = Math.round((nx * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((nzz * 0.5 + 0.5) * 255);
    }
  }
}

const q8 = (v) => {
  const x = Math.round(v * 255);
  return x < 0 ? 0 : x > 255 ? 255 : x;
};

/* ------------------------------------------------------------------------------------------------
 * Atlas üretimi
 * ---------------------------------------------------------------------------------------------- */
function tileSizeFor(opts) {
  if (opts.tileSize) {
    const s = opts.tileSize | 0;
    return s <= 16 ? 16 : s >= 64 ? 64 : 32;
  }
  const q = opts.quality || 'high';
  return q === 'low' ? 16 : 32;
}

/**
 * Tüm dokuları boyar ve atlas piksel tamponlarını üretir (canvas'sız).
 * @param {{tileSize?:number, quality?:'low'|'medium'|'high', seed?:number}} [opts]
 * @returns {{width:number,height:number,tileSize:number,pad:number,cell:number,cols:number,rows:number,tileCount:number,
 *   color:Uint8ClampedArray,normal:Uint8ClampedArray,material:Uint8ClampedArray,uvTable:Float32Array,
 *   uvFor:(i:number)=>number[],tileNames:readonly string[],tintKinds:Uint8Array,hash:string,seed:number}}
 */
export function generateAtlasPixels(opts = {}) {
  const b = createAtlasBuilder(opts);
  b.step(Infinity);
  return b.finish();
}

/** Atlas'ın doku boyu (kalite → 16 | 32 px); aynı boy = birebir aynı piksel (medium ve high özdeş). */
export function atlasTileSize(opts = {}) {
  return tileSizeFor(opts);
}

const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

/**
 * Artımlı atlas üreticisi: dokular tek tek boyanır; step(maxMs) bütçe dolunca durur (ana iş parçacığı takılmasın).
 *   const b = createAtlasBuilder({quality}); while (!b.step(6)) {...kare...}; const pixels = b.finish();
 * Sonuç generateAtlasPixels ile birebir aynıdır (aynı özet).
 */
export function createAtlasBuilder(opts = {}) {
  const seed = opts.seed === undefined ? 0 : opts.seed | 0;
  const n = tileSizeFor(opts);
  const layout = computeAtlasLayout({ tileCount: TILE_COUNT, tileSize: n });
  const { width: W, height: H, cell, pad, cols } = layout;
  const color = new Uint8ClampedArray(W * H * 4);
  const normal = new Uint8ClampedArray(W * H * 4);
  const material = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    normal[i * 4] = 128;
    normal[i * 4 + 1] = 128;
    normal[i * 4 + 2] = 255;
    normal[i * 4 + 3] = 255;
    material[i * 4] = 230;
    material[i * 4 + 2] = 255;
    material[i * 4 + 3] = 255;
  }
  const tintKinds = new Uint8Array(TILE_COUNT);
  for (let b = 0; b < BLOCKS.length; b++) {
    const rec = BLOCKS[b];
    if (!rec.tint) continue;
    const code = TINT_CODE[rec.tint] || 0;
    const faces = rec.tintFaces === 'top' ? [rec.tiles.top, rec.tiles.side] : [rec.tiles.top, rec.tiles.bottom, rec.tiles.side];
    faces.forEach((ti) => {
      if (ti >= 0 && !tintKinds[ti]) tintKinds[ti] = code;
    });
  }
  // Tek dörtgenlik sprite dokuları (çapraz bitki, meşale): sarmal dolgu karşı kenarın piksellerini taşır → uzun otun
  // kök satırı üst kenarda "kesik kesik koyu çizgi" olarak görünürdü. Bunlarda dolgu kenar pikselini TEKRARLAR (kenetli).
  const clampPad = new Uint8Array(TILE_COUNT);
  for (let b = 0; b < BLOCKS.length; b++) {
    const rec = BLOCKS[b];
    if (!rec || (rec.shape !== 'cross' && rec.shape !== 'torch') || !rec.tiles) continue;
    [rec.tiles.top, rec.tiles.bottom, rec.tiles.side].forEach((ti) => {
      if (ti >= 0 && ti < TILE_COUNT) clampPad[ti] = 1;
    });
  }
  const nrm = new Uint8Array(n * n * 3);
  let next = 0;
  function paintOne(i) {
    const name = TILE_NAMES[i];
    const clampT = clampPad[i] === 1;
    const t32 = paintTileByName(name, seed);
    const t = resampleTile(t32, n);
    buildNormals(t, n, nrm);
    const col = i % cols;
    const row = (i / cols) | 0;
    const cx0 = col * cell;
    const cy0 = row * cell;
    for (let gy = 0; gy < cell; gy++) {
      const rc = gy - pad;
      const ay = clampT ? n - 1 - Math.min(n - 1, Math.max(0, rc)) : (((n - 1 - rc) % n) + n) % n;
      const dstRow = cy0 + gy;
      for (let gx = 0; gx < cell; gx++) {
        const ax = clampT ? Math.min(n - 1, Math.max(0, gx - pad)) : ((((gx - pad) % n) + n) % n);
        const si = ay * n + ax;
        const di = (dstRow * W + cx0 + gx) * 4;
        color[di] = q8(t.c[si * 4]);
        color[di + 1] = q8(t.c[si * 4 + 1]);
        color[di + 2] = q8(t.c[si * 4 + 2]);
        color[di + 3] = q8(t.c[si * 4 + 3]);
        normal[di] = nrm[si * 3];
        normal[di + 1] = nrm[si * 3 + 1];
        normal[di + 2] = nrm[si * 3 + 2];
        normal[di + 3] = 255;
        material[di] = q8(t.ro[si]);
        material[di + 1] = q8(t.e[si]);
        material[di + 2] = q8(t.ao[si]);
        material[di + 3] = q8(t.tm[si]);
      }
    }
  }
  function finish() {
    while (next < TILE_COUNT) paintOne(next++);
    // FNV-1a özeti (belirlenimcilik testi / önbellek anahtarı)
    let hsh = 0x811c9dc5;
    for (let i = 0; i < color.length; i += 3) {
      hsh ^= color[i];
      hsh = Math.imul(hsh, 0x01000193);
    }
    for (let i = 0; i < material.length; i += 5) {
      hsh ^= material[i];
      hsh = Math.imul(hsh, 0x01000193);
    }
    return pack(hsh);
  }
  function pack(hsh) {
    return {
      width: W,
      height: H,
      tileSize: n,
      pad,
      cell,
      cols,
      rows: layout.rows,
      tileCount: TILE_COUNT,
      color,
      normal,
      material,
      uvTable: layout.uvTable,
      uvFor: layout.uvFor,
      tileNames: TILE_NAMES,
      tintKinds,
      hash: (hsh >>> 0).toString(16).padStart(8, '0'),
      seed,
    };
  }
  return {
    get done() { return next >= TILE_COUNT; },
    get progress() { return next / TILE_COUNT; },
    /** Bütçe (ms) dolana dek doku boyar; hepsi bittiyse true. En az bir doku ilerler. */
    step(maxMs) {
      const t0 = nowMs();
      while (next < TILE_COUNT) {
        paintOne(next++);
        if (nowMs() - t0 >= maxMs) break;
      }
      return next >= TILE_COUNT;
    },
    finish,
  };
}

/**
 * Bir dokunun bir pikselini (sanat koordinatı: y=0 üst) okur. which: 'color'|'normal'|'material'.
 * @returns {number[]} [r,g,b,a] 0..255
 */
export function tilePixel(pixels, tileIndex, x, y, which = 'color') {
  const n = pixels.tileSize;
  const col = tileIndex % pixels.cols;
  const row = (tileIndex / pixels.cols) | 0;
  const gx = col * pixels.cell + pixels.pad + x;
  const gy = row * pixels.cell + pixels.pad + (n - 1 - y);
  const i = (gy * pixels.width + gx) * 4;
  const buf = pixels[which];
  return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
}

/* ------------------------------------------------------------------------------------------------
 * three dokuları
 * ---------------------------------------------------------------------------------------------- */
/**
 * Piksel tamponlarından üç DataTexture üretir (canvas yok; premultiply/renk bozulması yok).
 * @param {object} THREE  three modülü
 * @param {object} pixels generateAtlasPixels sonucu
 * @param {{anisotropy?:number, pixelated?:boolean}} [opts]
 */
export function createAtlasTextures(THREE, pixels, opts = {}) {
  const { width, height } = pixels;
  const aniso = opts.anisotropy === undefined ? 4 : opts.anisotropy;
  const pixelated = opts.pixelated !== false;
  const make = (src, srgb, nearestMag) => {
    const data = new Uint8Array(src.buffer, src.byteOffset, src.length);
    const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = nearestMag ? THREE.NearestFilter : THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = aniso;
    tex.flipY = false;
    tex.premultiplyAlpha = false;
    tex.unpackAlignment = 4;
    tex.needsUpdate = true;
    return tex;
  };
  const map = make(pixels.color, true, pixelated);
  const normalMap = make(pixels.normal, false, false);
  const materialMap = make(pixels.material, false, pixelated);
  return {
    map,
    normalMap,
    materialMap,
    width,
    height,
    tileSize: pixels.tileSize,
    pad: pixels.pad,
    cell: pixels.cell,
    cols: pixels.cols,
    rows: pixels.rows,
    tileCount: pixels.tileCount,
    uvTable: pixels.uvTable,
    uvFor: pixels.uvFor,
    tintKinds: pixels.tintKinds,
    dispose() {
      map.dispose();
      normalMap.dispose();
      materialMap.dispose();
    },
  };
}
