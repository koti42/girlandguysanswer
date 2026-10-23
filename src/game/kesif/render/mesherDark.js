/*
 * KEŞİF render — "karanlık yüz" birleştirme (greedy) yardımcıları. Saf; three/DOM yok.
 *
 * Neden: yer altı mağara duvarlarının büyük çoğunluğu tam karanlıktır (gökyüzü 0, blok ışığı 0) ve ışık
 * `uMinLight` (≈0.02) kadardır → doku/AO ayrıntısı görünmez ama her biri 2 üçgen yer. Bir yüzün TÜM ışık örnek hücreleri
 * (yüzün baktığı hücre + düzlemdeki 8 komşusu) karanlıksa köşe ışıkları da 0'dır; bu yüzler aynı düzlemde
 * dikdörtgenlere birleştirilir (tek doku, AO yok) → mağaralı chunk'larda üçgen sayısı belirgin düşer, kör delik (gökyüzü sızması) OLMAZ.
 *
 * Yakın mod (far=false): gökyüzü 0 ve blok ışığı ≤ NEAR_MAX_BLK (çok loş); yalnız aynı blok-ışığı düzeyi birleşir (düzey tam korunur).
 * Uzak mod (far=true, uzak chunk'lar): gökyüzü 0 olan her yüz; blok ışığı 4 sınıfa nicelenir (lav/meşale parıltısı kabaca kalır).
 *
 *   resetDark()                          chunk başında
 *   plugDarkAir(maxY) → sayı             (yalnız uzak mod) chunk içindeki gökyüzü-0 hava hücrelerini sanal taş yapar (kapak yüzleri kalır)
 *   darkFaceCode(ci, d, far) → kod|-1    yüz birleştirilebilir mi (ci: kenar-dolgulu hücre indeksi, d: yön); kod = ışık sınıfı
 *   markDark(d, bx, by, bz, code)        yüzü kuyruğa al (chunk-yerel hücre)
 *   flushDark(tile, maxY)                birleştir + opak geçişe yaz
 *
 * Çatlak (T-kavşağı) önlemi: birleşik dörtgen düzlemin DARKINSET kadar içine itilir ve düzlem içinde DARKGROW kadar büyütülür;
 * komşu (ışıklı) yüzlerin altında kalır, aralarındaki alt-piksel çatlakları örter.
 */
import {
  P, L, S, SZ, SY, DN, passes, emitFace,
} from './mesherCore.js';
import { FILTER_LUT } from '../sim/blocks.js';

const DIM_X = 16;
const DIM_Y = 144; // en çok 9 kesit (MAX_BAND_SECTIONS * 16)
const DIM_Z = 16;
export const DARK_CELLS = DIM_X * DIM_Y * DIM_Z;
const dm = new Uint8Array(6 * DARK_CELLS);
let count = 0;
const DIMS = [DIM_X, DIM_Y, DIM_Z];
const STR = [1, DIM_X * DIM_Z, DIM_X]; // hücre indeksi ((y*16)+z)*16+x adımları: x, y, z
// d (0:+X 1:-X 2:+Y 3:-Y 4:+Z 5:-Z) → düzlem içi iki eksenin dolgulu-indeks adımları
const PU = [SZ, 1, 1];
const PV = [SY, SZ, SY];

export const DARKINSET = 0.003;
export const DARKGROW = 0.004;

/**
 * UZAK chunk'lar: gökyüzü ışığı 0 olan (mağara iç hacmi) hava hücrelerini mesh hesabı için SANAL taş sayar (yalnız dolgulu P kopyasında;
 * dünya verisi değişmez). Sonuç: iç yüzler hiç üretilmez; ışıklı havaya (mağara ağzı, ilk ~14 hücre) bakan sınırda "kapak" yüzleri
 * kalır → uzaktan bakınca delik/gökyüzü sızması OLMAZ, mağara ağzı karanlığa doğru kapanır. Dolgu hücrelerine (komşu chunk) dokunulmaz:
 * yakın-uzak chunk sınırında yüzler eksik kalmaz (kapak yüzü komşunun karanlık havasına bakar ve çizilir).
 * @param {number} maxY merkezdeki en yüksek dolu y
 * @returns {number} sanal taş yapılan hücre sayısı
 */
export function plugDarkAir(maxY) {
  let n = 0;
  for (let y = 0; y <= maxY; y++) {
    for (let z = 0; z < 16; z++) {
      let ci = ((y + 1) * 18 + (z + 1)) * 18 + 1;
      for (let x = 0; x < 16; x++, ci++) {
        if (P[ci] === 0 && L[ci] < 16) {
          P[ci] = 1;
          n++;
        }
      }
    }
  }
  return n;
}

export function resetDark() {
  if (count > 0) dm.fill(0);
  count = 0;
}

export function darkCount() {
  return count;
}

/** Işık sınıfı kodları: 0..NEAR_MAX_BLK yakın düzey; 3..6 uzak sınıflar (blok ışığı karşılıkları LIGHT_OF_CODE). */
export const NEAR_MAX_BLK = 2;
const LIGHT_OF_CODE = [0, 1, 2, 0, 3, 8, 13];

/**
 * Yüzün baktığı hücre `base` = ci + DN[d]. Hücre + düzlemdeki 8 komşusunun ışık tutanları gökyüzü 0 ve (yakın modda) blok ≤ eşik mi?
 * @returns {number} ışık sınıfı kodu ya da -1 (birleştirme)
 */
export function darkFaceCode(ci, d, far) {
  const base = ci + DN[d];
  const a = d >> 1;
  const u = PU[a];
  const v = PV[a];
  let mx = 0;
  for (let k = 0; k < 9; k++) {
    const j = base + OFF_U[k] * u + OFF_V[k] * v;
    if (FILTER_LUT[P[j]] < 15) {
      const l = L[j];
      if (l > 15) return -1;
      if (l > mx) mx = l;
    }
  }
  if (far) return mx <= 1 ? 3 : mx <= 5 ? 4 : mx <= 10 ? 5 : 6;
  return mx <= NEAR_MAX_BLK ? (L[base] & 15) : -1;
}
const OFF_U = [0, 1, -1, 0, 0, 1, 1, -1, -1];
const OFF_V = [0, 0, 0, 1, -1, 1, -1, 1, -1];

export function markDark(d, bx, by, bz, code) {
  dm[d * DARK_CELLS + (by * DIM_Z + bz) * DIM_X + bx] = code + 1;
  count++;
}

const ORG = [0, 0, 0];
const SIZE = [1, 1, 1];

/**
 * Kuyruktaki karanlık yüzleri dikdörtgenlere birleştirip opak geçişe yazar.
 * @param {number} tile ortak doku (taş gibi) atlas indeksi — ışık ~0 olduğundan fark görünmez
 * @param {number} maxY taranacak en yüksek hücre y
 * @returns {number} yazılan dörtgen sayısı
 */
export function flushDark(tile, maxY) {
  if (count === 0) return 0;
  let quads = 0;
  S.pass = passes[0];
  S.tint = 0;
  S.tintTop = false;
  S.aoOn = false;
  S.fbits = 0;
  S.defA = 0;
  S.region = [0, 0, 1, 1];
  S.vp = null;
  S.jit = 1;
  S.rot = 0;
  S.mir = 0;
  S.id = 1;
  for (let d = 0; d < 6; d++) {
    const a = d >> 1;
    const u = (a + 1) % 3;
    const v = (a + 2) % 3;
    const base = d * DARK_CELLS;
    const ka = a === 1 ? maxY + 1 : DIMS[a];
    const kv = v === 1 ? maxY + 1 : DIMS[v];
    const ku = u === 1 ? maxY + 1 : DIMS[u];
    for (let k = 0; k < ka; k++) {
      for (let jv = 0; jv < kv; jv++) {
        for (let ju = 0; ju < ku; ju++) {
          const i0 = k * STR[a] + jv * STR[v] + ju * STR[u];
          if (dm[base + i0] === 0) continue;
          let w = 1;
          const val = dm[base + i0];
          while (ju + w < ku && dm[base + i0 + w * STR[u]] === val) w++;
          let h = 1;
          for (; jv + h < kv; h++) {
            const row = i0 + h * STR[v];
            let ok = true;
            for (let t = 0; t < w; t++) {
              if (dm[base + row + t * STR[u]] !== val) {
                ok = false;
                break;
              }
            }
            if (!ok) break;
          }
          for (let r = 0; r < h; r++) {
            const row = base + i0 + r * STR[v];
            for (let t = 0; t < w; t++) dm[row + t * STR[u]] = 0;
          }
          ORG[a] = k;
          ORG[u] = ju;
          ORG[v] = jv;
          SIZE[a] = 1;
          SIZE[u] = w;
          SIZE[v] = h;
          S.bx = ORG[0];
          S.by = ORG[1];
          S.bz = ORG[2];
          // dolgulu indeks: yüzün ışık/AO örnek merkezi = kaynak hücrenin komşusu (karanlık)
          S.ci = ((ORG[1] + 1) * 18 + (ORG[2] + 1)) * 18 + ORG[0] + 1;
          emitDarkQuad(d, a, SIZE[0], SIZE[1], SIZE[2], tile, LIGHT_OF_CODE[val - 1]);
          quads++;
        }
      }
    }
  }
  count = 0;
  return quads;
}

function emitDarkQuad(d, a, sx, sy, sz, tile, blk) {
  // düzlem içinde büyüt, düzlemin içine (blok tarafına) it
  const g = DARKGROW;
  const ins = DARKINSET;
  const x0 = a === 0 ? 0 : -g;
  const y0 = a === 1 ? 0 : -g;
  const z0 = a === 2 ? 0 : -g;
  let ex0 = x0;
  let ey0 = y0;
  let ez0 = z0;
  let ex1 = a === 0 ? 1 : sx + g;
  let ey1 = a === 1 ? 1 : sy + g;
  let ez1 = a === 2 ? 1 : sz + g;
  // yüz düzlemi: +yönde yüksek uç, −yönde alçak uç → blok içine doğru it
  if (d === 0) ex1 -= ins;
  else if (d === 1) ex0 += ins;
  else if (d === 2) ey1 -= ins;
  else if (d === 3) ey0 += ins;
  else if (d === 4) ez1 -= ins;
  else ez0 += ins;
  emitFace(d, ex0, ey0, ez0, ex1, ey1, ez1, tile, S.ci + DN[d]);
  // birleşik dörtgenin ışığı tekdüze: sınıf düzeyi (gökyüzü 0)
  const p = passes[0];
  const v0 = p.vc - 4;
  const bl = blk / 15;
  for (let k = 0; k < 4; k++) {
    p.lit[(v0 + k) * 2] = 0;
    p.lit[(v0 + k) * 2 + 1] = bl;
  }
}
