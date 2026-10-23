/*
 * KEŞİF render — arazi ufku (horizon) tıkama testi. SAF: three/DOM yok, node'da test edilir.
 *
 * Fikir: yerden bakınca yakın bir tepenin ARKASINDA kalan chunk'lar zaten görünmez ama kare-kare çizilir (üçgen + çizim çağrısı).
 * Her chunk 4×4 hücreye bölünür. Bir hücrenin 16 sütununun hepsinde ORTAK olarak "sağlam" (opak küp, kesintisiz) olan yükseklik bandı
 * [bandLo, topMin] hesaplanır: sütunun en üst opak bloğundan aşağı, ilk boşluğa (mağara/tünel/kemer altı) kadar kesintisiz dolu bölüm;
 * hücre bandı = sütun bantlarının kesişimi. Bandın İÇİNDE kalarak hücreyi baştan sona geçen her ışın KESİN bir bloğa çarpar.
 * Gözden 360 aralığa (≈1°) bölünmüş "ufuk" tutulur; her aralıkta (azimut) kapatılan eğim aralıkları birleştirilip saklanır.
 * Daha uzaktaki bir chunk, görülebilir içeriğinin tüm eğim aralığı [en alçak yüzey, en yüksek nokta] o azimutlardaki TEK bir birleşik
 * kapalı aralığın içinde kalıyorsa gizlenir.
 *
 * Güvenlik (yalnız yanlış-gizleme tehlikesi var, fazla-çizme yalnız maliyettir; her şey tutucu):
 *  - kemer/çatı/köprü/kapı üstü/mağara/tünel: sütun bandı yalnız kesintisiz dolu kısmı kapsar → altından/içinden geçen ışın kapalı sayılmaz;
 *  - ışın hücreyi baştan sona bandın içinde geçmiyorsa (üstten/yandan sıyırıyorsa) kapalı sayılmaz;
 *  - görülebilir içerik = en alçak sütun zemininden (1 blok pay) yukarısı: yüzeye açılan mağaraların içi de aynı ışınlarla görülür;
 *  - göz zeminin altındaysa (mağara/tünel içi) test tümden kapalıdır; göze 2 blok'tan yakın hücre tıkayıcı olmaz;
 *  - yalnız dmax ≤ chunk'ın en yakın uzaklığı olan hücreler kullanılır (hep önde); düzenlenmiş chunk'lar tıkayıcı sayılmaz.
 *
 *   OCC_N (=4) · OCC_BINS (=360) · OCC_STRIDE (=32)
 *   isGroundId(id)                          sağlam zemin bloğu mu (opak küp, kesik/şeffaf değil)
 *   computeOccCells(blocks, heightMap, out)  → Uint8Array(32): [0..15] hücre topMin (en alçak sütunun zemin yüksekliği = y+1, 0 yok),
 *                                              [16..31] hücre bandLo (sütun bandlarının en yükseği)
 *   groundTopAt(blocks, heightMap, lx, lz)   → bir sütunun zemin yüksekliği (y + 1), 0 yok
 *   createOcclusion() → { run(ex, ey, ez, chunks, n) }
 *       chunks[i] = { cx, cz, occ:Uint8Array(32)|null, edited:bool, box:[minx,miny,minz,maxx,maxy,maxz]|null, hasMesh:bool, occluded:bool }
 *       run, her chunks[i].occluded alanını yazar ve gizlenen sayısını döner. occ yoksa chunk tıkayıcı olmaz ama gizlenebilir.
 */
import { HAS, PASS_LUT, SHAPE_LUT, SHAPE_ID } from './mesherCore.js';

export const OCC_N = 4;
export const OCC_CELL = 4;
export const OCC_BINS = 360;
export const OCC_STRIDE = 32;
const RUN_CAP = 40; // bantta aranan en çok kesintisiz dolu kalınlık
const DELTA = 0.25; // bant kenarlarından iç pay (blok)
const SLOPE_EPS = 0.002;
const KSLOTS = 8; // aralık başına en çok birleşik kapalı eğim aralığı

const TAU = Math.PI * 2;
const BIN_W = TAU / OCC_BINS;
const COLS = 16;
const LAYER = 256;

const GROUND = new Uint8Array(256);
for (let id = 1; id < 256; id++) if (HAS[id] === 1 && PASS_LUT[id] === 0 && SHAPE_LUT[id] === SHAPE_ID.CUBE) GROUND[id] = 1;

export function isGroundId(id) {
  return GROUND[id & 255] === 1;
}

/**
 * Blok kaynağı: Chunk (kesitli; mutlak y, .get) ya da düz Uint8Array (indeks y*256 + z*16 + x; testler / eski görünüm).
 * Mutlak y'ler Int16'dır (derin dünya: negatif ve > 255 olabilir).
 */
function blockAt(src, lx, y, lz) {
  return typeof src.get === 'function' ? src.get(lx, y, lz) : src[y * LAYER + lz * COLS + lx];
}

function floorY(src) {
  return typeof src.get === 'function' ? src.yMin : 0;
}

/** (lx,lz) sütununda en üst sağlam zemin bloğunun y + 1 değeri (yoksa 0). heightMap en üst hava-olmayan bloğu gösterir. */
export function groundTopAt(src, heightMap, lx, lz) {
  const col = lz * COLS + lx;
  const hm = heightMap || src.heightMap;
  let y = hm ? hm[col] : 127;
  const lo = floorY(src);
  const stop = y - 48 < lo ? lo : y - 48;
  for (; y >= stop; y--) {
    if (GROUND[blockAt(src, lx, y, lz)] === 1) return y + 1;
  }
  return 0;
}

/** Zemin üstünden aşağı kesintisiz dolu bölümün alt sınırı (y); top = groundTopAt sonucu (y+1). */
function runBottom(src, lx, lz, top) {
  let y = top - 1;
  const lo = floorY(src);
  const stop = top - RUN_CAP < lo ? lo : top - RUN_CAP;
  while (y >= stop && GROUND[blockAt(src, lx, y, lz)] === 1) y--;
  return y + 1;
}

/**
 * Hücre başına [topMin, bandLo]. Herhangi bir sütunda zemin yoksa o hücre 0/0 (bilinmiyor). bandLo > topMin - 1 ise hücre tıkayıcı değildir.
 * @returns {Int16Array} 32 değer: önce 16 topMin, sonra 16 bandLo (mutlak y)
 */
export function computeOccCells(blocks, heightMap, out) {
  const res = out && out.length === OCC_STRIDE ? out : new Int16Array(OCC_STRIDE);
  for (let cz = 0; cz < OCC_N; cz++) {
    for (let cx = 0; cx < OCC_N; cx++) {
      let mn = 32767;
      let lo = 0;
      let known = true;
      for (let dz = 0; dz < OCC_CELL && known; dz++) {
        for (let dx = 0; dx < OCC_CELL; dx++) {
          const lx = cx * OCC_CELL + dx;
          const lz = cz * OCC_CELL + dz;
          const g = groundTopAt(blocks, heightMap, lx, lz);
          if (g === 0) {
            known = false;
            break;
          }
          if (g < mn) mn = g;
          const b = runBottom(blocks, lx, lz, g);
          if (b > lo) lo = b;
        }
      }
      const k = cz * OCC_N + cx;
      res[k] = known ? mn : 0;
      res[16 + k] = known ? lo : 0;
    }
  }
  return res;
}

function wrapPi(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

/** Dikdörtgenin (x0,z0)-(x1,z1) göze (ex,ez) en yakın/en uzak yatay uzaklığı ve açı aralığı → out [dmin,dmax,a0,a1]. */
function rectInfo(ex, ez, x0, z0, x1, z1, out) {
  const nx = ex < x0 ? x0 : ex > x1 ? x1 : ex;
  const nz = ez < z0 ? z0 : ez > z1 ? z1 : ez;
  const dminX = nx - ex;
  const dminZ = nz - ez;
  const fx = Math.abs(x0 - ex) > Math.abs(x1 - ex) ? x0 : x1;
  const fz = Math.abs(z0 - ez) > Math.abs(z1 - ez) ? z0 : z1;
  out[0] = Math.sqrt(dminX * dminX + dminZ * dminZ);
  out[1] = Math.sqrt((fx - ex) * (fx - ex) + (fz - ez) * (fz - ez));
  const ac = Math.atan2((z0 + z1) * 0.5 - ez, (x0 + x1) * 0.5 - ex);
  let lo = 0;
  let hi = 0;
  for (let k = 0; k < 4; k++) {
    const px = (k & 1) === 0 ? x0 : x1;
    const pz = (k & 2) === 0 ? z0 : z1;
    const d = wrapPi(Math.atan2(pz - ez, px - ex) - ac);
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  out[2] = ac + lo;
  out[3] = ac + hi;
}

export function createOcclusion() {
  const hLo = new Float32Array(OCC_BINS * KSLOTS);
  const hHi = new Float32Array(OCC_BINS * KSLOTS);
  const hCnt = new Uint8Array(OCC_BINS);
  let cellCap = 0;
  let cDmax = new Float32Array(0);
  let cLo = new Float32Array(0);
  let cHi = new Float32Array(0);
  let cB0 = new Int32Array(0);
  let cB1 = new Int32Array(0);
  let order = new Int32Array(0);
  let chunkOrder = new Int32Array(0);
  let chunkDmin = new Float32Array(0);
  const info = [0, 0, 0, 0];

  function ensureCells(n) {
    if (n <= cellCap) return;
    cellCap = Math.max(n, cellCap * 2, 256);
    cDmax = new Float32Array(cellCap);
    cLo = new Float32Array(cellCap);
    cHi = new Float32Array(cellCap);
    cB0 = new Int32Array(cellCap);
    cB1 = new Int32Array(cellCap);
    order = new Int32Array(cellCap);
  }

  function mod(i) {
    return ((i % OCC_BINS) + OCC_BINS) % OCC_BINS;
  }

  /** Aralığa (lo,hi) kapalı eğim aralığı ekle; çakışanlar birleşir; doluysa en dar olan atılır (atmak tutucudur). */
  function addInterval(bin, lo, hi) {
    const base = bin * KSLOTS;
    let n = hCnt[bin];
    let i = 0;
    while (i < n) {
      const a = hLo[base + i];
      const b = hHi[base + i];
      if (lo <= b && hi >= a) {
        if (a < lo) lo = a;
        if (b > hi) hi = b;
        n--;
        hLo[base + i] = hLo[base + n];
        hHi[base + i] = hHi[base + n];
        i = 0; // birleşen aralık başkalarıyla da çakışabilir
      } else {
        i++;
      }
    }
    if (n < KSLOTS) {
      hLo[base + n] = lo;
      hHi[base + n] = hi;
      n++;
    } else {
      let w = 0;
      let wv = hHi[base] - hLo[base];
      for (let j = 1; j < n; j++) {
        const v = hHi[base + j] - hLo[base + j];
        if (v < wv) {
          wv = v;
          w = j;
        }
      }
      if (hi - lo > wv) {
        hLo[base + w] = lo;
        hHi[base + w] = hi;
      }
    }
    hCnt[bin] = n;
  }

  /** bin'de [a,b] eğim aralığını TAMAMEN içeren tek bir kapalı aralık var mı? */
  function covered(bin, a, b) {
    const base = bin * KSLOTS;
    const n = hCnt[bin];
    for (let i = 0; i < n; i++) {
      if (hLo[base + i] <= a && hHi[base + i] >= b) return true;
    }
    return false;
  }

  /**
   * @param {number} ex,ey,ez göz konumu (dünya)
   * @param {Array} chunks bkz. dosya başı
   * @param {number} n kullanılacak öğe sayısı
   * @returns {number} gizlenen chunk sayısı
   */
  function run(ex, ey, ez, chunks, n) {
    let hidden = 0;
    for (let i = 0; i < n; i++) chunks[i].occluded = false;
    // göz zeminin altındaysa (mağara, tünel, oyuk) test kapalı: göz hücresinin en alçak sütun zemini
    const ecx = Math.floor(ex / 16);
    const ecz = Math.floor(ez / 16);
    for (let i = 0; i < n; i++) {
      const c = chunks[i];
      if (c.cx === ecx && c.cz === ecz) {
        if (!c.occ) return 0;
        const lx = Math.min(3, Math.max(0, Math.floor((ex - ecx * 16) / OCC_CELL)));
        const lz = Math.min(3, Math.max(0, Math.floor((ez - ecz * 16) / OCC_CELL)));
        const top = c.occ[lz * OCC_N + lx];
        if (top === 0 || ey < top - 0.5) return 0;
        break;
      }
    }
    // tıkayıcı hücreleri topla
    ensureCells(n * 16);
    let cn = 0;
    for (let i = 0; i < n; i++) {
      const c = chunks[i];
      if (!c.occ || c.edited) continue;
      const x0 = c.cx * 16;
      const z0 = c.cz * 16;
      for (let k = 0; k < 16; k++) {
        const top = c.occ[k];
        if (top === 0) continue;
        const bandLo = c.occ[16 + k];
        if (bandLo > top - 2) continue; // bant ≥ 2 blok kalın değil (kemer/çatı/oyuk)
        const cx0 = x0 + (k & 3) * OCC_CELL;
        const cz0 = z0 + (k >> 2) * OCC_CELL;
        rectInfo(ex, ez, cx0, cz0, cx0 + OCC_CELL, cz0 + OCC_CELL, info);
        const dmin = info[0];
        const dmax = info[1];
        if (dmin < 2) continue;
        // ışının hücreyi baştan sona bandın içinde geçmesi: her d∈{dmin,dmax} için bandLo+δ ≤ ey + s·d ≤ top−δ
        const nlo = bandLo + DELTA - ey;
        const nhi = top - DELTA - ey;
        const lo = Math.max(nlo / dmin, nlo / dmax);
        const hi = Math.min(nhi / dmin, nhi / dmax);
        if (!(lo < hi)) continue;
        cDmax[cn] = dmax;
        cLo[cn] = lo;
        cHi[cn] = hi;
        // tamamen kapsanan aralıklar: [ceil(a0/w), floor(a1/w) - 1]
        cB0[cn] = Math.ceil(info[2] / BIN_W);
        cB1[cn] = Math.floor(info[3] / BIN_W) - 1;
        if (cB1[cn] >= cB0[cn]) cn++;
      }
    }
    if (cn === 0) return 0;
    for (let i = 0; i < cn; i++) order[i] = i;
    sortIdx(order, cn, cDmax);
    // gizlenebilir chunk'lar en yakından uzağa
    if (chunkOrder.length < n) {
      chunkOrder = new Int32Array(n * 2);
      chunkDmin = new Float32Array(n * 2);
    }
    let qn = 0;
    for (let i = 0; i < n; i++) {
      const c = chunks[i];
      if (!c.hasMesh || !c.box) continue;
      const b = c.box;
      rectInfo(ex, ez, b[0], b[2], b[3], b[5], info);
      chunkDmin[i] = info[0];
      chunkOrder[qn++] = i;
    }
    sortIdx(chunkOrder, qn, chunkDmin);
    hCnt.fill(0);
    let ci = 0;
    for (let q = 0; q < qn; q++) {
      const idx = chunkOrder[q];
      const c = chunks[idx];
      const dmin = chunkDmin[idx];
      // bu chunk'tan kesin önde olan hücreleri ufka işle
      while (ci < cn && cDmax[order[ci]] <= dmin) {
        const o = order[ci++];
        const lo = cLo[o];
        const hi = cHi[o];
        for (let b = cB0[o]; b <= cB1[o]; b++) addInterval(mod(b), lo, hi);
      }
      if (dmin < 1) continue; // göz kutunun içinde/çok yakınında
      const b = c.box;
      rectInfo(ex, ez, b[0], b[2], b[3], b[5], info);
      const dmax = info[1];
      // görülebilir içeriğin yükseklik aralığı: en alçak sütun zemininden (1 pay) kutu tepesine
      let yLow = b[1];
      if (c.occ) {
        let g = 32767;
        for (let k = 0; k < 16; k++) {
          const t = c.occ[k];
          if (t === 0) {
            g = 0;
            break;
          }
          if (t < g) g = t;
        }
        if (g > 0 && g - 1 > yLow) yLow = g - 1;
      }
      const topRel = b[4] - ey;
      const lowRel = yLow - ey;
      const sMax = topRel >= 0 ? topRel / Math.max(dmin, 0.5) : topRel / dmax;
      const sMin = lowRel >= 0 ? lowRel / dmax : lowRel / Math.max(dmin, 0.5);
      const bs = Math.floor(info[2] / BIN_W);
      const be = Math.floor(info[3] / BIN_W);
      if (be - bs >= OCC_BINS) continue;
      let all = true;
      for (let bb = bs; bb <= be; bb++) {
        if (!covered(mod(bb), sMin - SLOPE_EPS, sMax + SLOPE_EPS)) {
          all = false;
          break;
        }
      }
      if (all) {
        c.occluded = true;
        hidden++;
      }
    }
    return hidden;
  }

  return { run };
}

/** idx[0..n) dizisini key[idx[i]] artan sırasına koyar (yerinde shell sort, ayırma yok). */
function sortIdx(idx, n, key) {
  let gap = 1;
  while (gap < n / 3) gap = gap * 3 + 1;
  for (; gap > 0; gap = (gap - 1) / 3) {
    for (let i = gap; i < n; i++) {
      const v = idx[i];
      const kv = key[v];
      let j = i;
      while (j >= gap && key[idx[j - gap]] > kv) {
        idx[j] = idx[j - gap];
        j -= gap;
      }
      idx[j] = v;
    }
  }
}
