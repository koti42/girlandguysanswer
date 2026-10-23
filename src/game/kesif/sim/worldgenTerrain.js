/*
 * KEŞİF sim — arazi, iklim ve biyom çekirdeği (saf, belirlenimci; worldgen.js kullanır).
 *
 * sampleColumn(g, x, z, o): tek bir (x,z) sütunu için TÜM 2B alanları hesaplar (chunk gerektirmez);
 * chunk üretimi ve heightAt/biomeAt aynı işlevi kullanır → ikisi birebir tutarlıdır.
 * Alanlar o'ya yazılır (ayırma yok): h (en üst katı blok y'si), cont, temp, hum, uplift, snow, forest, zone, biome ...
 *
 * Ölçekler (blok): kıta ~330, tepeler ~85, dağ sırtları ~160, nehir ağı ~170, göl ~90. Arazi parametreleri bölge sınırında
 * ±20 blokluk geçişle yumuşatılır (halka açılınca kesintisiz arazi).
 *
 * BİYOMLAR (22): kara biyomu ağırlıklı Voronoi hücrelerinden gelir (worldgenBiomeCells.js: ~210 blokluk, bükülmüş hücreler, bölge
 * temalı ağırlıklı seçim, bölge sınırında karışım); dağ yükseklikten, plaj/mercan kıyıdan, bataklık/mangrov alçak-ıslak arazide.
 */
import {
  BIOME_KEYS, SEA_LEVEL, WORLD_RADIUS, ZONES, ZONE_COUNT,
} from './constants.js';
import { createNoise } from './noise.js';
import { hash2, toSeedInt } from './rng.js';
import { DRY_ALIAS, biomeCellAt } from './worldgenBiomeCells.js';

export const BIOME_ID = Object.freeze(BIOME_KEYS.reduce((m, k, i) => {
  m[k] = i;
  return m;
}, {}));
const CAYIR = BIOME_ID.cayir;
const ORMAN = BIOME_ID.orman;
const KARACAM = BIOME_ID.karacam;
const COL = BIOME_ID.col;
const TUNDRA = BIOME_ID.tundra;
const DAG = BIOME_ID.dag;
const BATAKLIK = BIOME_ID.bataklik;
const PLAJ = BIOME_ID.plaj;
const KRISTAL = BIOME_ID.kristal;
const SONBAHAR = BIOME_ID.sonbahar;
const KIRAZ = BIOME_ID.kiraz;
const YAGMUR = BIOME_ID.yagmurorman;
const MANGROV = BIOME_ID.mangrov;
const SAVAN = BIOME_ID.savan;
const TAIGA = BIOME_ID.taiga;
const BUZUL = BIOME_ID.buzul;
const MANTAR = BIOME_ID.mantar;
const BAMBU = BIOME_ID.bambu;
const VOLKANIK = BIOME_ID.volkanik;
const MERCAN = BIOME_ID.mercan;
const CICEK = BIOME_ID.cicek;
const GOLGE = BIOME_ID.golge;

/** Mühür halkası yarıçapları: 0..3 bölge sınırları (kilitli), 4 dünya kenarı (kalıcı). */
export const SEAL_RING_RADII = Object.freeze(ZONES.map((z) => z.rOut));
export const SEAL_THICKNESS = 2;
/** Zirve yüksekliği için yumuşak üst sınır (derin dünya: dağlar ~y 200+ ulaşır; uçuş tavanı 362). */
export const TERRAIN_CAP = 250;
/** Dağ sırası yükselme ölçeği (blok; çarpan = bölge dağ çarpanı). Derin dünya: zirveler ~y 200+ ulaşır. */
export const UPLIFT_SCALE = 158;
const RING_COUNT = SEAL_RING_RADII.length;

/** Bir (x,z) sütunu bir mühür halkasında mı? Halka indeksi (0..4) ya da -1. Kalınlık 2 (yarıçapsal), 8-bağlantı sızdırmaz. */
export function ringIndexAt(x, z) {
  const px = x + 0.5;
  const pz = z + 0.5;
  const r = Math.sqrt(px * px + pz * pz);
  for (let i = 0; i < RING_COUNT; i++) {
    const R = SEAL_RING_RADII[i];
    if (r >= R - SEAL_THICKNESS / 2 && r < R + SEAL_THICKNESS / 2) return i;
  }
  return -1;
}

export function smooth(e0, e1, x) {
  const t = (x - e0) / (e1 - e0);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/* ------------------------------------------------------------------------------------------------
 * Bölge parametreleri (sürekli bölge koordinatı zc ile doğrusal harmanlanır)
 * ---------------------------------------------------------------------------------------------- */
//                       Vadi   Orman   Kanyon  Zirve   Çekirdek
const ZP_WET = [0.32, 0.28, 0.46, 0.27, 0.27]; // kıtasallık kayması (+ = daha çok kara)
const ZP_MOUNT = [0.64, 0.80, 1.05, 1.45, 1.15]; // dağ yükselme çarpanı
const ZP_ROUGH = [0.65, 0.95, 1.10, 1.20, 1.10]; // tepe genliği
const ZP_CANYON = [0, 0, 1, 0, 0.15];
const ZP_FROST = [0, 0, 0, 1, 0.15];
const BLEND = 20;
/** Bataklık/mangrov bu yüksekliğe (denizden) kadar sulak kalır; üstü kuru karşılığına (orman/yağmur ormanı) döner. */
const WETLAND_MAX = 13;
function zoneCoord(r) {
  let zc = 0;
  for (let i = 0; i < ZONE_COUNT - 1; i++) {
    const b = ZONES[i].rOut;
    zc += smooth(b - BLEND, b + BLEND, r);
  }
  return zc;
}

function zl(arr, zc) {
  let i = Math.floor(zc);
  if (i >= ZONE_COUNT - 1) i = ZONE_COUNT - 2;
  const f = zc - i;
  return arr[i] + (arr[i + 1] - arr[i]) * f;
}

/* ------------------------------------------------------------------------------------------------
 * Tohum başına üretici durumu (önbellekli)
 * ---------------------------------------------------------------------------------------------- */
const GEN_CACHE = new Map();
export function getGen(seed) {
  const s = toSeedInt(seed);
  let g = GEN_CACHE.get(s);
  if (!g) {
    if (GEN_CACHE.size >= 6) GEN_CACHE.delete(GEN_CACHE.keys().next().value);
    g = {
      seed: s,
      t: createNoise(s ^ 0x1b873593), // arazi
      c: createNoise(s ^ 0x85ebca6b), // iklim / çeşitli
      k: createNoise(s ^ 0xc2b2ae35), // mağara (3B)
      worms: new Map(),
      halls: new Map(),
      col: makeCol(),
    };
    GEN_CACHE.set(s, g);
  }
  return g;
}

export function makeCol() {
  return {
    h: 0, hf: 0, cont: 0, temp: 0, hum: 0, uplift: 0, snow: 0, forest: 0, zone: 0, zc: 0,
    biome: 0, river: 0, frost: 0, canyon: 0, coastal: false, wetland: 0,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Sütun örnekleme
 * ---------------------------------------------------------------------------------------------- */
export function sampleColumn(g, x, z, o) {
  const T = g.t;
  const C = g.c;
  const r = Math.sqrt(x * x + z * z);
  const zc = zoneCoord(r);
  const wet = zl(ZP_WET, zc);
  const mAmp = zl(ZP_MOUNT, zc);
  const rough = zl(ZP_ROUGH, zc);
  const canyon = zl(ZP_CANYON, zc);
  const frost = zl(ZP_FROST, zc);
  let zi = 0;
  while (zi < ZONE_COUNT - 1 && r >= ZONES[zi].rOut) zi++;

  // kıtasallık → kara tabanı
  const cont = T.fbm2(x * 0.0030, z * 0.0030, 3) * 1.3 + wet;
  const landBase = SEA_LEVEL + 6 + cont * 21;
  const roughN = 0.5 + 0.5 * Math.max(-1, Math.min(1, T.fbm2(x * 0.0045 + 77, z * 0.0045 - 31, 2) * 1.6));
  const hills = T.fbm2(x * 0.012 + 11, z * 0.012 - 23, 4);
  const detail = T.fbm2(x * 0.05, z * 0.05, 2);
  let hf = landBase + hills * (4 + 15 * roughN) * rough + detail * 1.5;

  // dağ sıraları
  const mm = T.fbm2(x * 0.0042 + 300, z * 0.0042 - 200, 2) * 1.6;
  const mMask = smooth(0.0, 0.5, mm);
  let uplift = 0;
  if (mMask > 0) {
    const ridge = T.ridged2(x * 0.0062, z * 0.0062 + 500, 4);
    const landF = smooth(SEA_LEVEL - 6, SEA_LEVEL + 10, landBase);
    // başlangıç vadisinin ortasında dağ yükselmesi bastırılır (doğuş çevresi yürünebilir kalsın; vadi kenarında dağlar yükselir)
    const vf = r < 80 ? 1 - 0.8 * smooth(80, 30, r) : 1;
    uplift = mMask * mAmp * Math.pow(ridge, 1.35) * UPLIFT_SCALE * landF * vf;
    hf += uplift;
  }

  // basamaklı uçurumlar / mesa (kanyonda belirgin)
  let tMask = smooth(0.12, 0.55, T.fbm2(x * 0.0055 + 800, z * 0.0055 - 300, 2) * 1.5);
  if (canyon > 0 && canyon * 0.92 > tMask) tMask = canyon * 0.92;
  if (tMask > 0 && hf > SEA_LEVEL + 7) {
    const step = canyon > 0.5 ? 8 : 6;
    const q = hf / step;
    const k = Math.floor(q);
    const f = q - k;
    const ht = (k + smooth(0.28, 0.72, f)) * step;
    hf += (ht - hf) * tMask * 0.88;
  }
  // dar kanyon yarıkları
  if (canyon > 0.01) {
    const cn = Math.abs(T.fbm2(x * 0.008 + 1200, z * 0.008 - 900, 3));
    const cut = smooth(0.1, 0.0, cn) * canyon * smooth(SEA_LEVEL + 8, SEA_LEVEL + 20, hf);
    hf -= cut * 26;
  }

  // nehirler (alçak arazide) ve göller
  const rv = Math.abs(T.fbm2(x * 0.0058 + 1500, z * 0.0058 - 700, 3));
  const lowland = smooth(68, 54, hf);
  let river = 0;
  if (lowland > 0 && rv < 0.2) {
    const valley = smooth(0.2, 0.0, rv) * lowland;
    const vf = SEA_LEVEL + 3;
    const target = hf > vf ? vf + (hf - vf) * 0.5 : hf;
    hf += (target - hf) * valley;
    river = smooth(0.05, 0.012, rv) * lowland;
    if (river > 0) hf += (SEA_LEVEL - 3 - detail * 1.5 - hf) * river;
  }
  const lk = T.fbm2(x * 0.011 + 2000, z * 0.011 - 600, 2) * 1.6;
  if (lk > 0.4) {
    const lakeT = smooth(0.4, 0.55, lk) * smooth(70, 54, hf);
    if (lakeT > 0) hf += (SEA_LEVEL - 2 - 4 * smooth(0.55, 0.85, lk) - hf) * lakeT;
  }

  // Başlangıç vadisi: spawn çevresi yumuşak, kuru çayır
  if (r < 52) {
    const flat = smooth(50, 6, r);
    const vh = SEA_LEVEL + 12 + hills * 2.5 + detail * 0.5;
    hf += (vh - hf) * flat * 0.9;
  }

  if (hf < 4) hf = 4;
  else if (hf > 96) hf = 96 + (TERRAIN_CAP - 96) * (1 - Math.exp(-(hf - 96) / (TERRAIN_CAP - 96))); // zirveler düzleşmeden yumuşak sınır
  const h = Math.floor(hf + 0.5);

  // iklim: hücre biyomunun sıcaklığı (+ küçük yerel sapma) − yükseklik soğutması (kıta + dağ sırası; tepe/ayrıntı gürültüsü hariç → biyom kenarları tepelere göre tırtıklanmaz)
  const cell = biomeCellAt(g, x, z);
  const hm = landBase + uplift;
  let temp = cell.temp * 0.88 + C.fbm2(x * 0.0044 - 1300, z * 0.0044 + 700, 1) * 0.16;
  if (hm > 64) temp -= (hm - 64) * 0.011;
  const forest = smooth(-0.25, 0.4, C.fbm2(x * 0.012 + 2200, z * 0.012 - 90, 2) * 1.5);
  const snow = 91 + temp * 13 - frost * 17;

  o.h = h;
  o.hf = hf;
  o.cont = cont;
  o.temp = temp;
  o.hum = 0;
  o.uplift = uplift;
  o.snow = snow;
  o.forest = forest;
  o.zone = zi;
  o.zc = zc;
  o.river = river;
  o.frost = frost;
  o.canyon = canyon;

  // biyom
  let b;
  const coastal = cont < -0.1;
  o.coastal = coastal;
  if (hf < SEA_LEVEL + 2.6 && coastal && (cell.temp > -0.3 && zi <= 2)) {
    // sıcak/ılıman kıyı: mercan ya da plaj; Z3/Z4'te ve soğuk hücrelerde kıyı kendi biyomunu (buzul, mantar, kristal…) korur
    b = cell.temp > 0.5 && zi <= 1 ? MERCAN : PLAJ; // mercan yalnız ilk iki bölgenin (Z0/Z1) tropik kıyısı; kurak bölge göl/nehir kıyısı plaj
  } else if (uplift > 28 + 10 * mAmp || hm > 92) {
    b = DAG;
  } else {
    b = cell.biome;
    // bataklık/mangrov yalnız alçak arazide; yüksek arazide kuru karşılığı (orman / yağmur ormanı)
    if ((b === BATAKLIK || b === MANGROV) && hf > SEA_LEVEL + WETLAND_MAX) b = DRY_ALIAS[b];
  }
  // sulak biyomlar: arazi düzleşir, sığ havuzlar/sazlıklar açılır (arazi yüksekliği biyomdan sonra alçalır)
  if ((b === BATAKLIK || b === MANGROV) && hf > SEA_LEVEL - 4 && hf <= SEA_LEVEL + WETLAND_MAX) {
    const pn = C.fbm2(x * 0.035 + 4800, z * 0.035 - 2100, 2) * 1.4;
    hf += (SEA_LEVEL + 1.8 - hf) * 0.6;
    if (pn > 0.05) hf += (SEA_LEVEL - 1.4 - hf) * smooth(0.05, 0.4, pn) * (b === MANGROV ? 0.95 : 0.85);
    o.hf = hf;
    o.h = Math.floor(hf + 0.5);
  }
  o.biome = b;
  return o;
}

/* ------------------------------------------------------------------------------------------------
 * Yüzey ve çukur (sinkhole) yardımcıları
 * ---------------------------------------------------------------------------------------------- */
const SINK_CELL = 96;
const sinkTmp = { x: 0, z: 0, r: 0 };

/** Çukur hücresi (cx,cz) için merkez ve yarıçap; yoksa false. sinkTmp'ye yazar. */
function sinkCell(g, ccx, ccz) {
  const h = hash2(ccx, ccz, g.seed ^ 0x51ac);
  if ((h & 1023) / 1024 > 0.3) return false;
  sinkTmp.x = ccx * SINK_CELL + 10 + ((h >>> 10) & 127) * 0.5 * (SINK_CELL - 20) / 64;
  sinkTmp.z = ccz * SINK_CELL + 10 + ((h >>> 17) & 127) * 0.5 * (SINK_CELL - 20) / 64;
  sinkTmp.r = 2.4 + ((h >>> 24) & 15) * 0.11;
  return true;
}

/** (x,z) sütunu çukur yarıçapı + margin içinde mi? (ağaç/spawn kaçınması ve oyma için) */
export function sinkholeNear(g, x, z, margin = 0) {
  const ccx = Math.floor(x / SINK_CELL);
  const ccz = Math.floor(z / SINK_CELL);
  if (!sinkCell(g, ccx, ccz)) return false;
  const dx = x + 0.5 - sinkTmp.x;
  const dz = z + 0.5 - sinkTmp.z;
  const rr = sinkTmp.r + margin;
  return dx * dx + dz * dz <= rr * rr;
}

/** Çukur hücresi merkezi ve yarıçapı → {x,z,r} | null (chunk oyması için). */
export function sinkholeInCell(g, ccx, ccz) {
  if (!sinkCell(g, ccx, ccz)) return null;
  return { x: sinkTmp.x, z: sinkTmp.z, r: sinkTmp.r };
}
export const SINKHOLE_CELL_SIZE = SINK_CELL;

export {
  CAYIR, ORMAN, KARACAM, COL, TUNDRA, DAG, BATAKLIK, PLAJ, KRISTAL, WORLD_RADIUS, SONBAHAR, KIRAZ, YAGMUR, MANGROV, SAVAN, TAIGA,
  BUZUL, MANTAR, BAMBU, VOLKANIK, MERCAN, CICEK, GOLGE,
};
