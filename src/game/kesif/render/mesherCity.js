/*
 * KEŞİF render — mesher şehir kanalı `aCity` (saf; three/DOM yok, worker-güvenli).
 *
 * `meshChunk(..., {city:true})` her köşeye ek bir öznitelik yazar: `aCity` = Uint8×4 (shader'da NORMALIZED 0..1). Yalnız şehir mesh'lerinde;
 * `opts.city` kapalıyken hiçbir şey yazılmaz/döndürülmez → ana diyar mesh'i bayt-bayt aynıdır. Bit düzeni ve shader çözümü: sim/cityData.js.
 *
 *   a   bit7 WET     ıslak yüzeyin (WET_BLOCK_IDS) ÜST yüzü
 *       bit6 WINDOW  yanık pencere (234/235) yüzü; düşük 2 bit = grup 0..2, r = gece eşiği baytı
 *       bit0–5       neon şiddeti 0..63
 *   rgb neon ton ipucu (NEON_HUE, sRGB bayt)
 *
 * Neon boyası: köşe blok ışığı ≥ 8 ve yüzün baktığı hücre çevresindeki 3×3×3'teki EN GÜÇLÜ emisyon (eşitlikte ton tablosunda olan, sonra tarama
 * sırası) neon/holo ise rgb = ton, şiddet = (blokIşığı − 7) / 8. Islak yansıma ipucu: ıslak üst yüzün 3×3 sütunu × 6 yukarı en güçlü ton
 * (yakınlık ağırlıklı); yoksa neon boyası.
 *
 * Maliyet: chunk başına bir tarama (yayıcılardan 3×3×3 "emisyon ızgarası", yüz başına O(1) okuma; ton yayıcı yoksa hiçbir şey yapılmaz) +
 * ıslak üst yüzlerde ≤54 okuma.
 */
import { EMIT_LUT } from '../sim/blocks.js';
import {
  CITY_BLOCK_IDS, NEON_HUE, WET_BLOCK_IDS, WINDOW_LIT_IDS, WINDOW_GROUP_THRESHOLD_BYTES,
} from '../sim/cityData.js';

// Yerel takma adlar: içe aktarılan bağlamalar sıcak döngülerde (bazı derleyicilerde/test çalıştırıcılarında) nesne özelliği okuması olur.
const EMIT = EMIT_LUT;
const WIN_THR = WINDOW_GROUP_THRESHOLD_BYTES;

/** Dolgulu kopya ölçüleri (mesherCore ile aynı; test eşitliği doğrular). */
export const CITY_PW = 18;
export const CITY_PH = 146;
const SZ = CITY_PW;
const SY = CITY_PW * CITY_PW;

export const CITY_FLAG = Object.freeze({ WET: 128, WINDOW: 64, INTENSITY_MASK: 63 });
export const CITY_MODE = Object.freeze({ NONE: 0, WINDOW: 1, WET: 2 });

const HAS_HUE = new Uint8Array(256);
const HUE_R = new Uint8Array(256);
const HUE_G = new Uint8Array(256);
const HUE_B = new Uint8Array(256);
Object.keys(NEON_HUE).forEach((k) => {
  const id = Number(k);
  HAS_HUE[id] = 1;
  HUE_R[id] = NEON_HUE[k][0];
  HUE_G[id] = NEON_HUE[k][1];
  HUE_B[id] = NEON_HUE[k][2];
});

/** Blok kimliği → kip: 1 yanık pencere, 2 ıslak yüzey, 0 diğer. */
export const CITY_MODE_LUT = new Uint8Array(256);
WINDOW_LIT_IDS.forEach((id) => { CITY_MODE_LUT[id] = CITY_MODE.WINDOW; });
WET_BLOCK_IDS.forEach((id) => { CITY_MODE_LUT[id] = CITY_MODE.WET; });

/** Üst yüzü rastgele döndürülen/aynalanan şehir blokları (çizgisiz asfalt ve kaldırım; işaretli yol blokları yönlüdür). */
export const CITY_ROTATE_LUT = new Uint8Array(256);
CITY_ROTATE_LUT[CITY_BLOCK_IDS.ASPHALT] = 1;
CITY_ROTATE_LUT[CITY_BLOCK_IDS.SIDEWALK] = 1;

/**
 * Emisyon ızgarası: her hücre için çevresindeki (dolguya kenetli) 3×3×3'teki EN GÜÇLÜ emisyonun (skor << 8 | kimlik) değeri.
 * Yayıcılar seyrektir → ızgara yayıcılardan 27 hücreye "genişletilerek" kurulur; yüz başına tek okuma.
 * Skor = emisyon×2 + (ton tablosunda mı); eşitlikte TARAMA SIRASI (y, z, x artan) kazanır (kesin büyük karşılaştırma).
 */
const BEST = new Uint16Array(CITY_PW * CITY_PH * CITY_PW);
let bestUsed = 0;

function dilate(c, val) {
  const x = c % CITY_PW;
  const z = ((c / CITY_PW) | 0) % CITY_PW;
  const y = (c / SY) | 0;
  const x0 = x > 0 ? x - 1 : 0;
  const x1 = x < CITY_PW - 1 ? x + 1 : CITY_PW - 1;
  const z0 = z > 0 ? z - 1 : 0;
  const z1 = z < CITY_PW - 1 ? z + 1 : CITY_PW - 1;
  const y0 = y > 0 ? y - 1 : 0;
  const y1 = y < CITY_PH - 1 ? y + 1 : CITY_PH - 1;
  const sc = val >> 8;
  for (let yy = y0; yy <= y1; yy++) {
    for (let zz = z0; zz <= z1; zz++) {
      let i = (yy * CITY_PW + zz) * CITY_PW + x0;
      for (let xx = x0; xx <= x1; xx++, i++) {
        if (sc > (BEST[i] >> 8)) BEST[i] = val;
      }
    }
  }
}

/**
 * Chunk başına bir kez (fillPadded'dan sonra): dolgulu bölgedeki (satır 0..maxY+3) yayıcılardan emisyon ızgarasını kurar.
 * @returns {boolean} bölgede ton yayıcı (neon/holo) var mı — yoksa yüz başına hiçbir tarama yapılmaz.
 */
export function cityPrepare(P, maxY) {
  if (bestUsed > 0) BEST.fill(0, 0, bestUsed);
  const end = Math.min(P.length, (maxY + 4) * SY);
  bestUsed = Math.min(BEST.length, (maxY + 5) * SY);
  let hue = false;
  for (let i = 0; i < end; i++) {
    const id = P[i];
    const e = EMIT[id];
    if (e === 0) continue;
    const h = HAS_HUE[id];
    if (h === 1) hue = true;
    dilate(i, ((e * 2 + h) << 8) | id);
  }
  return hue;
}

let colId = 0;
let colInt = 0;
/** Islak yüzey: ci'nin 3×3 sütunu × 6 yukarı en güçlü ton yayıcısı (yakın ve parlak olan kazanır). colId/colInt'e yazar. */
function scanColumns(P, ci) {
  const row = (ci / SY) | 0;
  const kmax = Math.min(6, CITY_PH - 1 - row);
  let bestScore = 0;
  let bestK = 0;
  colId = 0;
  for (let k = 1; k <= kmax; k++) {
    const rb = ci + k * SY;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const id = P[rb + dz * SZ + dx];
        if (HAS_HUE[id] === 1) {
          const score = EMIT[id] * (8 - k);
          if (score > bestScore) {
            bestScore = score;
            colId = id;
            bestK = k;
          }
        }
      }
    }
  }
  colInt = colId === 0 ? 0 : (EMIT[colId] / 15) * (1 - (bestK - 1) / 7);
}

/** Platform bayt sırası: aCity köşesi tek 32 bit yazımla (r,g,b,a bayt sırası belleğe göre). */
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
/** (r,g,b,a) bayt dörtlüsü → bellekte r,g,b,a sırasıyla görünen 32 bit sözcük. */
export function packCity(r, g, b, a) {
  return LITTLE_ENDIAN ? (r | (g << 8) | (b << 16) | (a << 24)) >>> 0 : ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}
const ZERO = packCity(0, 0, 0, 0);
const WET_ONLY = packCity(0, 0, 0, CITY_FLAG.WET);

/** emitFree köşeleri (çapraz bitki, meşale…): aCity yok → sıfırla. cty32: geçiş tamponunun Uint32 görünümü. */
export function zeroCityVerts(cty32, vbase) {
  cty32[vbase] = 0;
  cty32[vbase + 1] = 0;
  cty32[vbase + 2] = 0;
  cty32[vbase + 3] = 0;
}

/**
 * Tek yüzün 4 köşesine aCity yaz.
 * @param {Uint32Array} c32 geçiş aCity tamponunun Uint32 görünümü (köşe başına 1 sözcük); vbase ilk köşe
 * @param {number} mode CITY_MODE_LUT[blok]; grp pencere grubu 0..2
 * @param {Uint8Array} P dolgulu blok kopyası; ci bloğun, base yüzün baktığı (ışık örnek) hücrenin indeksi
 * @param {Float32Array} bks köşe blok ışığı (0..15), ilk 4 değer
 * @param {boolean} top yüz +Y mi; hue chunk'ta ton yayıcı var mı
 */
export function fillCityFace(c32, vbase, mode, grp, P, ci, base, bks, top, hue) {
  if (mode === CITY_MODE.WINDOW) {
    const w = packCity(WIN_THR[grp], 0, 0, CITY_FLAG.WINDOW | grp);
    c32[vbase] = w;
    c32[vbase + 1] = w;
    c32[vbase + 2] = w;
    c32[vbase + 3] = w;
    return;
  }
  const wet = mode === CITY_MODE.WET && top;
  const flag = wet ? CITY_FLAG.WET : 0;
  if (hue) {
    if (wet) {
      scanColumns(P, ci);
      if (colId !== 0) {
        const w = packCity(HUE_R[colId], HUE_G[colId], HUE_B[colId], flag | Math.min(63, Math.round(colInt * 63)));
        c32[vbase] = w;
        c32[vbase + 1] = w;
        c32[vbase + 2] = w;
        c32[vbase + 3] = w;
        return;
      }
    }
    if (bks[0] >= 8 || bks[1] >= 8 || bks[2] >= 8 || bks[3] >= 8) {
      const bv = BEST[base];
      const id = bv & 255;
      if (HAS_HUE[id] === 1) {
        const r = HUE_R[id];
        const g = HUE_G[id];
        const b = HUE_B[id];
        const none = packCity(0, 0, 0, flag);
        for (let k = 0; k < 4; k++) {
          const t = (bks[k] - 7) / 8;
          c32[vbase + k] = t <= 0 ? none : packCity(r, g, b, flag | (t >= 1 ? 63 : Math.round(t * 63)));
        }
        return;
      }
    }
  }
  const z = wet ? WET_ONLY : ZERO;
  c32[vbase] = z;
  c32[vbase + 1] = z;
  c32[vbase + 2] = z;
  c32[vbase + 3] = z;
}
