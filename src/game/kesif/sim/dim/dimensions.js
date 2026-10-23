/*
 * KEŞİF sim — BOYUT tablosu (saf; DOM/three yok, worker-güvenli). Sözleşme KESIF_CITY_CONTRACT §1.2/§1.3/§1.7/§1.12, §5.
 *
 *   DIMS            {overworld, neon}: boyut tanımları (donuk). idx = kayıt/maske sırası, gen = genRegistry anahtarı.
 *   DIM_IDS         ['overworld','neon']
 *   getDim(id)      tanım | null   (bilinmeyen / prototip anahtarı güvenle null)
 *   isDimId(id)     bilinen boyut kimliği mi
 *   dimSeed(worldSeed, id)   boyutun üretim tohumu (uint32). 'overworld' = dünya tohumunun kendisi,
 *                   'neon' = hash2(worldSeed|0, 0x4E454F4E, 0x4D455244) >>> 0  (her kayıdın kendi şehri)
 *   subHash(seed, id, tag)   alt akış: hash3(id|0, tag|0, 0, seed|0) — paylaşımlı rng yok, her akış kendi hash'i
 *   neonCityDay / missionDayN   şehir günü ve görev panosu günü yardımcıları
 *   TERMINAL_COUNT  16 (0 = Kapı Meydanı, 1–6 bölge merkezleri, 7–14 Çevreyolu kavşakları, 15 = Tepe terası)
 *   NEON_BOUNDS     chunk sınırları (1600×1600 blok: x,z ∈ [-800, 800))
 *   DIM_SAVE_LIMITS kayıt sınırları (§14): düzenleme ≤250 KB, prop ≤40 KB, city ≤60 KB, boyut toplamı ≤400 KB
 *
 * Şehir (neon) yüksekliği overworld ile aynıdır (y -400..362): kayıt farkı kodlaması (saveEdits) ve ana kaya kuralı ortaktır.
 */
import { WORLD_Y_MAX, WORLD_Y_MIN } from '../constants.js';
import { hash2, hash3, toSeedInt } from '../rng.js';

export const DIM_IDS = Object.freeze(['overworld', 'neon']);
export const TERMINAL_COUNT = 16;
/** Şehir günü uzunluğu (sn) ve başlangıç fazı (19:30). */
export const NEON_DAY_SEC = 600;
export const NEON_START_PHASE = 0.8125;
/** Görev panosu yenileme aralığı (şehir oyun süresi sn; saatten bağımsız). */
export const MISSION_BOARD_SEC = 1200;
/** Şehir yarıçapı: 1600×1600 → chunk cx,cz ∈ [-50, 49]. */
export const NEON_BOUNDS = Object.freeze({
  minCx: -50, maxCx: 49, minCz: -50, maxCz: 49,
});
export const NEON_SIZE = 1600;

/** Boyut başına kayıt sınırları (bayt; UTF-8 JSON / kodlanmış metin uzunluğu). §14. */
export const DIM_SAVE_LIMITS = Object.freeze({
  edits: 250 * 1024,
  props: 40 * 1024,
  city: 60 * 1024,
  total: 400 * 1024,
  stash: 64,
  entities: 180,
  chests: 600,
  /** Düzenleme bütçesi bu orana ulaşınca yerleştirme reddedilir ("Şehirde yer doldu"). */
  editFullFrac: 0.9,
});

const NEON_SEED_X = 0x4e454f4e; // 'NEON'
const NEON_SEED_SALT = 0x4d455244; // 'MERD'

export const DIMS = Object.freeze({
  overworld: Object.freeze({
    id: 'overworld',
    idx: 0,
    gen: 'overworld',
    name: 'Ana Diyar',
    rules: Object.freeze({
      zones: true, structures: true, puzzles: true, beds: 'normal', protected: false,
    }),
  }),
  neon: Object.freeze({
    id: 'neon',
    idx: 1,
    gen: 'city',
    name: 'Neon Meridyen',
    yMin: WORLD_Y_MIN,
    yMax: WORLD_Y_MAX,
    groundY: 64,
    bounds: NEON_BOUNDS,
    size: NEON_SIZE,
    terminals: TERMINAL_COUNT,
    day: Object.freeze({ lenSec: NEON_DAY_SEC, startPhase: NEON_START_PHASE }),
    weather: 'neon',
    spawnProfile: 'neon',
    palette: 'neon',
    audio: 'neon',
    rules: Object.freeze({
      zones: false, structures: false, puzzles: false, beds: 'skipOnly', protected: true,
    }),
  }),
});

const HAS = Object.prototype.hasOwnProperty;

/** Boyut tanımı | null (bilinmeyen, prototip anahtarı, string olmayan). */
export function getDim(id) {
  return typeof id === 'string' && HAS.call(DIMS, id) ? DIMS[id] : null;
}

export function isDimId(id) {
  return getDim(id) !== null;
}

/** Boyut kimliğini doğrular: bilinmiyorsa 'overworld'. */
export function cleanDimId(id) {
  return isDimId(id) ? id : 'overworld';
}

/**
 * Boyutun üretim tohumu (uint32). worldSeed sayı | metin olabilir (NaN/Infinity → 0). Belirlenimci; farklı kayıt → farklı şehir.
 * Bilinmeyen boyut → atar (programcı hatası; kayıttan gelen kimlikler önce cleanDimId'den geçer).
 */
export function dimSeed(worldSeed, id) {
  const s = toSeedInt(worldSeed);
  if (id === 'overworld') return s;
  if (id === 'neon') return hash2(s | 0, NEON_SEED_X, NEON_SEED_SALT) >>> 0;
  throw new Error('Bilinmeyen boyut: ' + String(id));
}

/** Alt akış hash'i: aynı (seed,id,tag) → aynı uint32; paylaşımlı rng yok. */
export function subHash(seed, id, tag) {
  return hash3(id | 0, tag | 0, 0, seed | 0);
}

/** Şehir gün sayısı (0 tabanlı) — şehir saati sn cinsinden. */
export function neonCityDay(citySeconds) {
  const s = Number(citySeconds);
  return Number.isFinite(s) && s > 0 ? Math.floor(s / NEON_DAY_SEC) : 0;
}

/** Görev panosu günü: floor(citySeconds / 1200); saatten bağımsız. */
export function missionDayN(citySeconds) {
  const s = Number(citySeconds);
  return Number.isFinite(s) && s > 0 ? Math.floor(s / MISSION_BOARD_SEC) : 0;
}

/** Chunk, boyutun sınırları içinde mi (sınırsız boyutta her zaman true). */
export function dimChunkInBounds(id, cx, cz) {
  const d = getDim(id);
  if (!d || !d.bounds) return true;
  const b = d.bounds;
  return cx >= b.minCx && cx <= b.maxCx && cz >= b.minCz && cz <= b.maxCz;
}
