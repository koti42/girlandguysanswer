/*
 * KEŞİF sim — MAĞARA STİLLERİ, yeraltı nehirleri ve yüzey yarıkları (saf, belirlenimci; worldgenCaves.js / worldgenDeep.js kullanır).
 *
 * Mağara hücreleri hâlâ eski oyma adımlarıyla (peynir/spagetti gürültüsü, solucan, salon, şaft) açılır; bu modül oyulmuş boşluğun
 * KAPLAMASINI ve süsünü bölgesel olarak değiştirir:
 *   0 Mağara (normal)   1 Çiçekli Mağara (yosun, çiçekli yosun, parlak meyve sarmaşığı, ışıklı mantar, eğrelti)
 *   2 Kristal Geod (kalsit/ametist duvar)   3 Sarkıt Mağarası (sarkıt taşı sarkıt/dikit)   4 Buzul Mağarası (paketli buz, buz sivri)
 *   5 Lav Tüpü (bazalt/magma duvar, lav göletleri)   6 Antik Harabe (taş tuğla duvar, sütun, yosun)
 * Stil, (x,z) 2B gürültü bölgesi × bölge (zone) × derinlik bandı tablosuyla seçilir → mutlak koordinatın işlevi: yüzey bandı ve
 * derin kesitler dikişsiz birleşir. Yalnız taş/bazalt yüzeyler değişir (maden damarlarına dokunulmaz); kesit/chunk sınırında komşu
 * hücre bilinmediğinden o sınır düzleminde (≈1/16 yüz) kaplama atlanabilir — görünmez.
 *
 * Ayrıca: yeraltı nehirleri (derin kesitlerde y ≈ -70..-36; 3–5 geniş, 2 derin su kanalı) ve yüzey yarıkları (128 blokluk hücre başına
 * ≤ 1 yarık; tabanda gölet; bazılarında kenardan akan su sütunu = şelale).
 */
import { SEA_LEVEL, zoneIndexAt } from './constants.js';
import { B } from './blocks.js';
import { hash2, hash3 } from './rng.js';
import { getGen } from './worldgenTerrain.js';

export const CAVE = Object.freeze({
  NORMAL: 0, CICEKLI: 1, GEOD: 2, DRIPSTONE: 3, BUZUL: 4, LAVTUP: 5, HARABE: 6,
});
export const CAVE_COUNT = 7;
const INV32 = 1 / 4294967296;

// [Mağara, Çiçekli, Geod, Sarkıt, Buzul, Lav tüpü, Harabe]: bölge × derinlik bandı (A ≥ -80, B -80..-220, C < -220)
const TABLE = [
  /* Z0 */ [[0.40, 0.34, 0, 0.26, 0, 0, 0], [0.40, 0.12, 0.18, 0.22, 0, 0, 0.08], [0.34, 0, 0.26, 0.2, 0, 0.1, 0.1]],
  /* Z1 */ [[0.25, 0.42, 0.05, 0.22, 0, 0, 0.06], [0.30, 0.20, 0.16, 0.20, 0, 0.04, 0.10], [0.30, 0.04, 0.22, 0.16, 0, 0.14, 0.14]],
  /* Z2 */ [[0.25, 0.02, 0.15, 0.28, 0, 0.22, 0.08], [0.26, 0, 0.18, 0.20, 0, 0.26, 0.10], [0.26, 0, 0.18, 0.12, 0, 0.30, 0.14]],
  /* Z3 */ [[0.22, 0, 0.12, 0.10, 0.48, 0, 0.08], [0.24, 0, 0.18, 0.08, 0.38, 0, 0.12], [0.26, 0, 0.22, 0.08, 0.20, 0.10, 0.14]],
  /* Z4 */ [[0.18, 0.12, 0.34, 0.12, 0.04, 0.08, 0.12], [0.16, 0.06, 0.32, 0.10, 0.04, 0.12, 0.20], [0.16, 0.02, 0.28, 0.08, 0.04, 0.20, 0.22]],
];
const CUM = TABLE.map((zone) => zone.map((row) => {
  const sum = row.reduce((a, b) => a + b, 0);
  let acc = 0;
  return row.map((w) => {
    acc += w / sum;
    return acc;
  });
}));

export function bandOf(y) {
  return y >= -80 ? 0 : (y >= -220 ? 1 : 2);
}

/** (x,z) bölge değeri 0..1 (≈ 150 blokluk yamalar). */
function regionU(g, wx, wz) {
  const v = g.c.simplex2(wx * 0.0068 + 6100, wz * 0.0068 - 3300);
  const u = 0.5 + 0.5 * Math.max(-1, Math.min(1, v * 1.5));
  return u;
}

/** u (0..1), bölge, bant → stil kimliği. */
function styleFromU(u, zone, band) {
  const cum = CUM[zone][band];
  for (let i = 0; i < CAVE_COUNT; i++) if (u <= cum[i]) return i;
  return 0;
}

/** Bir (x,y,z) mağara hücresinin stili (yüzey bandı ve derin üretim aynı işlevi kullanır). */
export function caveStyleId(g, wx, wz, y) {
  return styleFromU(regionU(g, wx, wz), zoneIndexAt(wx, wz), bandOf(y));
}

/** HUD/ses/parçacık için: seed + dünya konumu → stil kimliği. */
export function caveStyleAt(seed, x, y, z) {
  return caveStyleId(getGen(seed), Math.floor(x), Math.floor(z), Math.floor(y));
}

/* ------------------------------------------------------------------------------------------------
 * Kaplama + süs geçişi
 * ---------------------------------------------------------------------------------------------- */
const STYLE_COL = new Int8Array(256 * 3);

function isRock(b) {
  return b === B.STONE || b === B.BASALT;
}

/** Duvar kaplaması: stil + yüz yönü (0 yan, 1 üst yüz [zemin], 2 alt yüz [tavan]) + zar (0..1) → yeni blok (0 = değişmez). */
function wallBlock(style, face, r, b) {
  switch (style) {
    case CAVE.CICEKLI:
      if (face === 1) return r < 0.55 ? B.MOSS : (r < 0.7 ? B.FLOWERING_MOSS : 0);
      return r < 0.22 ? B.MOSS : (r < 0.27 ? B.FLOWERING_MOSS : 0);
    case CAVE.GEOD:
      return r < 0.34 ? B.CALCITE : (r < 0.46 ? B.AMETHYST : (r < 0.55 ? B.CRYSTAL_ROCK : 0));
    case CAVE.DRIPSTONE:
      return r < 0.5 ? B.DRIPSTONE : 0;
    case CAVE.BUZUL:
      return r < 0.55 ? B.PACKED_ICE : (r < 0.7 ? B.ICE : 0);
    case CAVE.LAVTUP:
      if (face === 1 && r > 0.88) return B.MAGMA_ROCK;
      return b === B.BASALT || r < 0.7 ? B.BASALT : 0;
    case CAVE.HARABE:
      return r < 0.42 ? B.STONE_BRICK : (r < 0.52 ? B.MOSS : 0);
    default:
      return 0;
  }
}

/**
 * Bir pencereye (blocks: indeks ((y - yBase) << 8) + (lz << 4) + lx) mağara stillerini uygular.
 *   yA..yB   işlenecek mutlak y aralığı (dahil; pencere içinde kalmalı)      x0,z0  chunk başlangıcı
 *   ht       (Int16Array 256 | null)  sütun yüzey yükseklikleri: verilirse y ≤ ht-5 ile sınırlanır (yüzey bozulmaz)
 *   salt     karar tuzu (yüzey/derin farklı olabilir ama sonuç hash'e bağlı; aynı mutlak hücre aynı karar)
 */
export function applyCaveStyles(g, blocks, yBase, yA, yB, x0, z0, ht) {
  const rowsHi = yB;
  let any = false;
  STYLE_COL.fill(-1);
  const seed = g.seed ^ 0x57c9a1;
  const zoneBase = zoneIndexAt(x0 + 8, z0 + 8);
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const col = (lz << 4) + lx;
      const wx = x0 + lx;
      const wz = z0 + lz;
      const top = ht ? Math.min(rowsHi, ht[col] - 5) : rowsHi;
      if (top < yA) continue;
      let u = -1;
      for (let y = yA; y <= top; y++) {
        const i = ((y - yBase) << 8) + col;
        const b = blocks[i];
        const band = bandOf(y);
        let st = STYLE_COL[col * 3 + band];
        if (st < 0) {
          if (u < 0) u = regionU(g, wx, wz);
          // bölge: sütunun kendi (x,z) bölgesi; yakın chunk merkezi yerine her sütun kendi bölgesini kullanır (dikişsiz)
          st = styleFromU(u, zoneIndexAt(wx, wz), band);
          STYLE_COL[col * 3 + band] = st;
        }
        if (st === 0) continue;
        any = true;
        if (b === 0) {
          // boşluk hücresi: zemin/tavan süsü
          const below = y > yA ? blocks[i - 256] : -1;
          const above = y < top ? blocks[i + 256] : -1;
          const floor = below > 0 && isSolidForDecor(below);
          const ceil = above > 0 && isSolidForDecor(above);
          if (!floor && !ceil) continue;
          const h = hash3(wx, y, wz, seed);
          const r = h * INV32;
          if (floor) decorateFloor(st, blocks, i, y, yBase, top, r, h, below);
          if (ceil) decorateCeil(st, blocks, i, y, yA, r, h);
          continue;
        }
        if (!isRock(b)) continue;
        // kaya hücresi: hava komşusuna bakan yüz var mı?
        let face = -1;
        if (y < top && blocks[i + 256] === 0) face = 1;
        else if (y > yA && blocks[i - 256] === 0) face = 2;
        else if ((lx > 0 && blocks[i - 1] === 0) || (lx < 15 && blocks[i + 1] === 0)
          || (lz > 0 && blocks[i - 16] === 0) || (lz < 15 && blocks[i + 16] === 0)) face = 0;
        if (face < 0) continue;
        const r = hash3(wx, y, wz, seed ^ 0x11) * INV32;
        const nb = wallBlock(st, face, r, b);
        if (nb) blocks[i] = nb;
      }
    }
  }
  void zoneBase;
  return any;
}

function isSolidForDecor(b) {
  return b !== 0 && b !== B.WATER && b !== B.LAVA && b !== B.WATER_FLOW && b !== B.LAVA_FLOW && b !== B.VINE && b !== B.GLOW_BERRIES;
}

function decorateFloor(st, blocks, i, y, yBase, top, r, h, below) {
  switch (st) {
    case CAVE.CICEKLI:
      if (below === B.MOSS || below === B.FLOWERING_MOSS || below === B.STONE) {
        if (r < 0.05) blocks[i] = B.FERN;
        else if (r < 0.085) blocks[i] = B.MUSHROOM;
        else if (r < 0.1 && below !== B.STONE) blocks[i] = B.TALL_GRASS;
        else if (r < 0.108 && below !== B.STONE) blocks[i] = B.BLUEBELL;
      }
      break;
    case CAVE.GEOD:
      if (r < 0.02) blocks[i] = B.AMETHYST;
      break;
    case CAVE.DRIPSTONE:
      if (r < 0.07) {
        const len = 1 + ((h >>> 9) % 3);
        for (let k = 0; k < len && y + k < top && blocks[i + k * 256] === 0; k++) blocks[i + k * 256] = B.DRIPSTONE;
      }
      break;
    case CAVE.BUZUL:
      if (r < 0.035) {
        const len = 1 + ((h >>> 9) % 3);
        for (let k = 0; k < len && y + k < top && blocks[i + k * 256] === 0; k++) blocks[i + k * 256] = B.PACKED_ICE;
      }
      break;
    case CAVE.LAVTUP:
      // taban boşluğu: seyrek lav göleti (1 derin); yanında hava olduğunda taşar → yalnız taş zeminli
      if (r < 0.045 && (below === B.BASALT || below === B.MAGMA_ROCK || below === B.STONE)) blocks[i] = B.LAVA;
      break;
    case CAVE.HARABE: {
      if (r < 0.012) blocks[i] = B.STONE_BRICK;
      else if (r < 0.0016 + 0.012) blocks[i] = B.MOSS;
      else if (r > 0.9988) {
        // sütun: tavana dayanana kadar (en çok 9)
        let k = 0;
        while (k < 9 && y + k < top && blocks[i + k * 256] === 0) k++;
        if (k >= 3 && y + k <= top && blocks[i + k * 256] !== 0) for (let j = 0; j < k; j++) blocks[i + j * 256] = B.PILLAR;
      }
      break;
    }
    default:
      break;
  }
  void yBase;
}

function decorateCeil(st, blocks, i, y, yA, r, h) {
  switch (st) {
    case CAVE.CICEKLI:
      if (r < 0.09) {
        const len = 1 + ((h >>> 9) % 3);
        for (let k = 0; k < len && y - k > yA && blocks[i - k * 256] === 0; k++) blocks[i - k * 256] = B.GLOW_BERRIES;
      } else if (r < 0.13) blocks[i] = B.VINE;
      break;
    case CAVE.GEOD:
      if (r < 0.035) blocks[i] = B.AMETHYST;
      break;
    case CAVE.DRIPSTONE:
      if (r < 0.11) {
        const len = 1 + ((h >>> 9) % 5);
        for (let k = 0; k < len && y - k > yA && blocks[i - k * 256] === 0; k++) blocks[i - k * 256] = B.DRIPSTONE;
      }
      break;
    case CAVE.BUZUL:
      if (r < 0.1) {
        const len = 1 + ((h >>> 9) % 4);
        for (let k = 0; k < len && y - k > yA && blocks[i - k * 256] === 0; k++) blocks[i - k * 256] = B.PACKED_ICE;
      }
      break;
    case CAVE.LAVTUP:
      if (r < 0.05) {
        const len = 1 + ((h >>> 9) % 2);
        for (let k = 0; k < len && y - k > yA && blocks[i - k * 256] === 0; k++) blocks[i - k * 256] = B.BASALT;
      }
      break;
    case CAVE.HARABE:
      if (r < 0.04) blocks[i] = B.VINE;
      break;
    default:
      break;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Yeraltı nehirleri (derin kesitler; y ≈ -70..-36)
 * ---------------------------------------------------------------------------------------------- */
export const RIVER_Y_MIN = -80;
export const RIVER_Y_MAX = -30;

function riverField(g, wx, wz) {
  return g.c.fbm2(wx * 0.0046 + 7000, wz * 0.0046 - 5100, 2);
}

/** Sütunun yeraltı nehri taban seviyesi (su yüzeyi) ve gücü; nehir yoksa yR = null. */
function riverAt(g, wx, wz) {
  const f = Math.abs(riverField(g, wx, wz));
  const W = 0.02;
  if (f >= W) return null;
  const k = 1 - f / W; // 0..1 (orta = 1)
  const yR = -52 + Math.floor(g.c.simplex2(wx * 0.002 + 10, wz * 0.0023 - 7) * 13);
  return { k, yR };
}

/**
 * Pencereye yeraltı nehri oyar: orta hat boyunca 5 blok yüksek, 2 blok derin su; blocks indeksi ((y - yBase) << 8) + col.
 * Yalnız taş/bazalt/boşluk/su hücrelerini değiştirir (maden, ana kaya, mühür bozulmaz).
 */
export function carveUndergroundRivers(g, blocks, yBase, yA, yB, x0, z0) {
  if (yB < RIVER_Y_MIN || yA > RIVER_Y_MAX) return;
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const rv = riverAt(g, x0 + lx, z0 + lz);
      if (!rv) continue;
      const col = (lz << 4) + lx;
      const yr = rv.yR;
      const yLo = Math.max(yA, yr - 1);
      const yHi = Math.min(yB, yr + (rv.k > 0.45 ? 4 : 3));
      for (let y = yLo; y <= yHi; y++) {
        const i = ((y - yBase) << 8) + col;
        const b = blocks[i];
        if (b !== 0 && b !== B.STONE && b !== B.BASALT && b !== B.WATER && b !== B.GRAVEL && b !== B.DIRT) continue;
        blocks[i] = y <= yr ? B.WATER : 0;
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Yüzey yarıkları (ravine) + şelale
 * ---------------------------------------------------------------------------------------------- */
const RAVINE_CELL = 128;

/** Yarık hücresi: {x,z,cos,sin,len,wid,depth,fall} | null. */
export function ravineInCell(g, rx, rz) {
  if (!g.ravines) g.ravines = new Map();
  const key = (rx + 1024) * 4096 + (rz + 1024);
  let v = g.ravines.get(key);
  if (v !== undefined) return v;
  v = null;
  const h = hash2(rx, rz, g.seed ^ 0x7a71e);
  if (((h & 1023) / 1024) < 0.34) {
    const x = rx * RAVINE_CELL + 24 + ((h >>> 10) & 255) / 255 * (RAVINE_CELL - 48);
    const z = rz * RAVINE_CELL + 24 + ((h >>> 18) & 255) / 255 * (RAVINE_CELL - 48);
    const ang = (((h >>> 6) & 255) / 255) * Math.PI;
    v = {
      x, z, cos: Math.cos(ang), sin: Math.sin(ang),
      len: 34 + ((h >>> 3) & 31), wid: 2.2 + ((h >>> 12) & 7) * 0.35, depth: 26 + ((h >>> 20) & 31),
      fall: ((h >>> 26) & 3) === 0,
    };
  }
  if (g.ravines.size > 300) g.ravines.clear();
  g.ravines.set(key, v);
  return v;
}

/**
 * Yüzey yarıkları: yüzeyden aşağı dar, uzun bir kesik (uçlara doğru sığlaşır); taban gölet; bazılarında (fall) bir uç duvarından
 * aşağı akan su sütunu. blocks: yüzey bandı yoğun penceresi ((y << 8) + col), ht: sütun yükseklikleri.
 */
export function carveRavines(g, blocks, x0, z0, ht) {
  const a = Math.floor((x0 - 40) / RAVINE_CELL);
  const b = Math.floor((x0 + 55) / RAVINE_CELL);
  const c = Math.floor((z0 - 40) / RAVINE_CELL);
  const d = Math.floor((z0 + 55) / RAVINE_CELL);
  for (let rz = c; rz <= d; rz++) {
    for (let rx = a; rx <= b; rx++) {
      const rv = ravineInCell(g, rx, rz);
      if (!rv) continue;
      const reach = rv.len * 0.5 + rv.wid + 3;
      if (rv.x + reach < x0 || rv.x - reach > x0 + 16 || rv.z + reach < z0 || rv.z - reach > z0 + 16) continue;
      for (let lz = 0; lz < 16; lz++) {
        const dz = z0 + lz + 0.5 - rv.z;
        for (let lx = 0; lx < 16; lx++) {
          const dx = x0 + lx + 0.5 - rv.x;
          const u = (dx * rv.cos + dz * rv.sin) / (rv.len * 0.5);
          const v = (-dx * rv.sin + dz * rv.cos) / (rv.wid * 0.5);
          // yarık gövdesi: u ekseninde elips, v ekseninde dar; uçlara doğru daralır
          const taper = Math.max(0, 1 - u * u);
          const q = v * v / (taper * 0.9 + 0.12) + (g.c.simplex2((x0 + lx) * 0.2, (z0 + lz) * 0.2) * 0.18);
          if (q >= 1 || u * u > 1.05) continue;
          const col = (lz << 4) + lx;
          const hh = ht[col];
          if (hh < SEA_LEVEL + 3) continue; // yarık yalnız karada
          const depth = Math.floor(rv.depth * (0.35 + 0.65 * taper));
          const yBot = Math.max(6, hh - depth);
          for (let y = hh; y >= yBot; y--) {
            const i = (y << 8) + col;
            const bl = blocks[i];
            if (bl === B.BEDROCK || bl === B.SEAL_BARRIER) break;
            blocks[i] = 0;
          }
          // taban gölet (2 blok su)
          if (taper > 0.2) {
            for (let y = yBot; y < yBot + 2; y++) blocks[(y << 8) + col] = B.WATER;
          }
          // şelale: ucundaki dar sütun (u ≈ ±0.92), kenardan tabana
          if (rv.fall && u > 0.86 && u < 0.96 && Math.abs(v) < 0.35) {
            for (let y = hh; y > yBot + 1; y--) {
              if (blocks[(y << 8) + col] === 0) blocks[(y << 8) + col] = B.WATER_FLOW;
            }
          }
        }
      }
    }
  }
}
