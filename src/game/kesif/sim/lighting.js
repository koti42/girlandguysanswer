/*
 * KEŞİF sim — ışık yayılımı (saf; DOM/three yok, worker-güvenli). KESİT tabanlı (derin dünya).
 *
 * Işık baytı: üst 4 bit gökyüzü (0..15), alt 4 bit blok ışığı (0..15). Saklanan değer, hücreye GİRİLDİKTEN sonraki seviyedir.
 * Opak hücrelerin kendi değeri 0'dır (yalnız ışık yayan opak bloklar kendi emisyonunu taşır).
 *
 * Kurallar (tam kapanış = tek doğru sonuç; artımlı güncelleme tam hesapla BİREBİR aynı çıkar):
 *   - Geçiş maliyeti: max(1, lightFilter(hedef)); lightFilter >= 15 olan blok ışığı tamamen durdurur.
 *   - Gökyüzü: üstü açık sütunda seviye 15; aşağı doğru 15 → 15 - filtre (hava: 15 kalır). 15'in altındaki
 *     seviyeler her yönde normal azalır (yaprak altı yavaşça kararır, su altı hızlı söner). Yanal yayılım BFS.
 *     Yer altı (üstü kapalı sütun) gökyüzü ışığı 0'dır; yalnız yüzeye açık delik/şaftlardan sızar.
 *   - Blok ışığı: emisyon kaynağı kendi hücresinde emisyon değerini taşır; komşulara emisyon-1 ...
 *
 * Depolama: Chunk kesitleri (bkz. chunk.js). Tek tip ışıklı kesitler dizi tutmaz (üstü açık hava = 0xF0, yer altı = 0); yazma
 * gerektiğinde kesit gerçek diziye çevrilir, bitince tek tipe dönenler (compactLight) diziyi bırakır.
 *
 * Alan (domain): dikdörtgen chunk bölgesi × TÜM dikey kesitler; koordinatlar bölgeye göre (gx, gz) ve yBase'e göre (gy).
 * Hızlı yol: 1×1 sütun (computeChunkLight), sınır dikişi 3×3 (stitchChunk / lightNewSection), artımlı ekleme/çıkarma
 * (updateLightBulk) herhangi bir dikdörtgen chunk alanında. Kuyruklar modül düzeyinde yeniden kullanılan tipli dizilerdir.
 *
 * Chunk erişimi `getChunk(cx,cz) → Chunk|null` ile yapılır (World.getChunk ya da test haritası).
 */
import { EMIT_LUT, FILTER_LUT } from './blocks.js';

const SKY = 0;
const BLK = 1;
const DX = [1, -1, 0, 0, 0, 0];
const DZ = [0, 0, 1, -1, 0, 0];
const DY = [0, 0, 0, 0, 1, -1];
const DOWN = 5;

/* ------------------------------------------------------------------------------------------------
 * Kuyruklar (artır / çıkar). Büyüyebilir; her çalıştırmada başa sarılır.
 * ---------------------------------------------------------------------------------------------- */
let aCap = 1 << 15;
let aX = new Int16Array(aCap);
let aZ = new Int16Array(aCap);
let aY = new Int16Array(aCap);
let aHead = 0;
let aTail = 0;

let rCap = 1 << 14;
let rX = new Int16Array(rCap);
let rZ = new Int16Array(rCap);
let rY = new Int16Array(rCap);
let rV = new Uint8Array(rCap);
let rHead = 0;
let rTail = 0;

function growA() {
  const n = aCap * 2;
  const x = new Int16Array(n);
  const z = new Int16Array(n);
  const y = new Int16Array(n);
  x.set(aX);
  z.set(aZ);
  y.set(aY);
  aX = x;
  aZ = z;
  aY = y;
  aCap = n;
}

function growR() {
  const n = rCap * 2;
  const x = new Int16Array(n);
  const z = new Int16Array(n);
  const y = new Int16Array(n);
  const v = new Uint8Array(n);
  x.set(rX);
  z.set(rZ);
  y.set(rY);
  v.set(rV);
  rX = x;
  rZ = z;
  rY = y;
  rV = v;
  rCap = n;
}

function pushA(x, z, y) {
  if (aTail >= aCap) growA();
  aX[aTail] = x;
  aZ[aTail] = z;
  aY[aTail] = y;
  aTail++;
}

function pushR(x, z, y, v) {
  if (rTail >= rCap) growR();
  rX[rTail] = x;
  rZ[rTail] = z;
  rY[rTail] = y;
  rV[rTail] = v;
  rTail++;
}

function resetQueues() {
  aHead = 0;
  aTail = 0;
  rHead = 0;
  rTail = 0;
}

/* ------------------------------------------------------------------------------------------------
 * Alan (domain)
 *   slot = si * per + sz * wc + sx      (si kesit indeksi, sz/sx chunk ofseti, per = wc*hc)
 *   blocks[slot]  Uint8Array(4096) (gerçek ya da paylaşılan tek tip) | null (üretilmemiş/komşu yok)
 *   light[slot]   Uint8Array(4096) (gerçek ya da paylaşılan tek tip) | null
 *   shared[slot]  1 = light[slot] paylaşılan tek tip dizidir → yazmadan önce gerçek diziye çevir
 * ---------------------------------------------------------------------------------------------- */
function makeDomain(getChunk, cx0, cz0, wc, hc, known) {
  let nS = 0;
  const cols = new Array(wc * hc);
  for (let sz = 0; sz < hc; sz++) {
    for (let sx = 0; sx < wc; sx++) {
      const cx = cx0 + sx;
      const cz = cz0 + sz;
      let c = known && known.cx === cx && known.cz === cz ? known : getChunk(cx, cz);
      if (c && !c.generated && c !== known) c = null;
      cols[sz * wc + sx] = c || null;
      if (c && c.sectionCount > nS) nS = c.sectionCount;
    }
  }
  let yBase = 0;
  for (let i = 0; i < cols.length; i++) {
    if (cols[i]) {
      yBase = cols[i].yMin;
      break;
    }
  }
  const per = wc * hc;
  const n = per * nS;
  const blocks = new Array(n).fill(null);
  const light = new Array(n).fill(null);
  const shared = new Uint8Array(n);
  for (let col = 0; col < per; col++) {
    const c = cols[col];
    if (!c) continue;
    for (let si = 0; si < c.sectionCount; si++) {
      if (c.secGen[si] === 0) continue;
      const slot = si * per + col;
      blocks[slot] = c.getSectionBlocks(si);
      light[slot] = c.getSectionLight(si);
      if (c.secLight[si] === null) shared[slot] = 1;
    }
  }
  return {
    cx0, cz0, wc, hc, per, nS, yBase, W: wc * 16, D: hc * 16, H: nS * 16, cols, blocks, light, shared,
    touched: new Uint8Array(n),
  };
}

/** Paylaşılan tek tip ışık dizisini yazılabilir gerçek diziyle değiştirir (chunk'a da kaydeder). */
function materialize(dom, slot) {
  const col = slot % dom.per;
  const si = (slot - col) / dom.per;
  const arr = dom.cols[col].getSectionLightW(si);
  dom.light[slot] = arr;
  dom.shared[slot] = 0;
  return arr;
}

/** Dokunulan kesitleri dirty yapar, ışık dizilerini sıkıştırır; dokunulan benzersiz chunk'ları döner. */
function markTouched(dom) {
  const out = [];
  const seen = dom.cols.length > 1 ? new Set() : null;
  const per = dom.per;
  for (let slot = 0; slot < dom.touched.length; slot++) {
    if (!dom.touched[slot]) continue;
    const col = slot % per;
    const c = dom.cols[col];
    if (!c) continue;
    const si = (slot - col) / per;
    c.compactLight(si);
    c.markSectionDirty(si);
    if (seen) {
      if (!seen.has(c)) {
        seen.add(c);
        out.push(c);
      }
    } else if (out.length === 0) {
      out.push(c);
    }
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Yayılım çekirdekleri
 * ---------------------------------------------------------------------------------------------- */
function drainAdd(dom, ch) {
  const sh = ch === SKY ? 4 : 0;
  const keep = ch === SKY ? 0x0f : 0xf0;
  const wc = dom.wc;
  const per = dom.per;
  const W = dom.W;
  const D = dom.D;
  const H = dom.H;
  const dB = dom.blocks;
  const dL = dom.light;
  const shared = dom.shared;
  const touched = dom.touched;
  while (aHead < aTail) {
    const x = aX[aHead];
    const z = aZ[aHead];
    const y = aY[aHead];
    aHead++;
    const sl = (y >> 4) * per + (z >> 4) * wc + (x >> 4);
    const v = (dL[sl][((y & 15) << 8) + ((z & 15) << 4) + (x & 15)] >> sh) & 15;
    if (v <= 1) continue;
    for (let d = 0; d < 6; d++) {
      const nx = x + DX[d];
      const nz = z + DZ[d];
      const ny = y + DY[d];
      if (nx < 0 || nz < 0 || ny < 0 || nx >= W || nz >= D || ny >= H) continue;
      const ns = (ny >> 4) * per + (nz >> 4) * wc + (nx >> 4);
      const nb = dB[ns];
      if (nb === null) continue;
      const li = ((ny & 15) << 8) + ((nz & 15) << 4) + (nx & 15);
      const f = FILTER_LUT[nb[li]];
      if (f >= 15) continue;
      const nv = (ch === SKY && d === DOWN && v === 15) ? 15 - f : v - (f > 1 ? f : 1);
      if (nv <= 0) continue;
      let nl = dL[ns];
      if (nv > ((nl[li] >> sh) & 15)) {
        if (shared[ns] === 1) nl = materialize(dom, ns);
        nl[li] = (nl[li] & keep) | (nv << sh);
        touched[ns] = 1;
        pushA(nx, nz, ny);
      }
    }
  }
}

function drainRemove(dom, ch) {
  const sh = ch === SKY ? 4 : 0;
  const keep = ch === SKY ? 0x0f : 0xf0;
  const wc = dom.wc;
  const per = dom.per;
  const W = dom.W;
  const D = dom.D;
  const H = dom.H;
  const dB = dom.blocks;
  const dL = dom.light;
  const shared = dom.shared;
  const touched = dom.touched;
  while (rHead < rTail) {
    const x = rX[rHead];
    const z = rZ[rHead];
    const y = rY[rHead];
    const v = rV[rHead];
    rHead++;
    for (let d = 0; d < 6; d++) {
      const nx = x + DX[d];
      const nz = z + DZ[d];
      const ny = y + DY[d];
      if (nx < 0 || nz < 0 || ny < 0 || nx >= W || nz >= D || ny >= H) continue;
      const ns = (ny >> 4) * per + (nz >> 4) * wc + (nx >> 4);
      const nb = dB[ns];
      if (nb === null) continue;
      const li = ((ny & 15) << 8) + ((nz & 15) << 4) + (nx & 15);
      let nl = dL[ns];
      const nv = (nl[li] >> sh) & 15;
      if (nv === 0) continue;
      const em = ch === BLK ? EMIT_LUT[nb[li]] : 0;
      if (em > 0 && nv <= em) {
        // bağımsız kaynak: dokunma, yeniden yaysın
        pushA(nx, nz, ny);
        continue;
      }
      if (nv < v || (ch === SKY && d === DOWN && v === 15 && nv === 15)) {
        if (shared[ns] === 1) nl = materialize(dom, ns);
        nl[li] = (nl[li] & keep) | (em << sh);
        touched[ns] = 1;
        pushR(nx, nz, ny, nv);
        if (em > 0) pushA(nx, nz, ny);
      } else {
        pushA(nx, nz, ny);
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Sütun gökyüzü + blok ışığı (tek chunk, komşusuz)
 * ---------------------------------------------------------------------------------------------- */
const LEVEL = new Uint8Array(256);

/** Sütun gökyüzü geçişi: her sütun için seviye 15'ten başlayıp aşağı iner. Kesit ışıklarını yazar (tek tip korunur). */
function skyColumnPass(chunk) {
  const n = chunk.sectionCount;
  LEVEL.fill(15);
  for (let si = n - 1; si >= 0; si--) {
    if (chunk.secGen[si] === 0) {
      LEVEL.fill(0);
      continue;
    }
    const bl = chunk.secBlocks[si];
    const uni = chunk.secUniform[si];
    if (bl === null) {
      const f = FILTER_LUT[uni];
      if (f >= 15) {
        chunk.setSectionLightUniform(si, 0);
        LEVEL.fill(0);
        continue;
      }
      if (f === 0) {
        // geçirgen tek tip (hava): ışık = sütun seviyesi (hepsi eşitse tek tip)
        const l0 = LEVEL[0];
        let same = true;
        for (let i = 1; i < 256; i++) {
          if (LEVEL[i] !== l0) {
            same = false;
            break;
          }
        }
        if (same) {
          chunk.setSectionLightUniform(si, l0 << 4);
        } else {
          const arr = chunk.getSectionLightW(si);
          for (let ly = 0; ly < 16; ly++) {
            const o = ly << 8;
            for (let col = 0; col < 256; col++) arr[o + col] = LEVEL[col] << 4;
          }
        }
        continue;
      }
    }
    const arr = chunk.getSectionLightW(si);
    arr.fill(0);
    for (let ly = 15; ly >= 0; ly--) {
      const o = ly << 8;
      for (let col = 0; col < 256; col++) {
        let level = LEVEL[col];
        if (level === 0) continue;
        const f = FILTER_LUT[bl !== null ? bl[o + col] : uni];
        if (f >= 15) {
          LEVEL[col] = 0;
          continue;
        }
        if (level === 15) level -= f;
        else level -= f > 1 ? f : 1;
        if (level <= 0) {
          LEVEL[col] = 0;
          continue;
        }
        LEVEL[col] = level;
        arr[o + col] = level << 4;
      }
    }
    chunk.compactLight(si);
  }
}

/**
 * Tek bir chunk'ın bağımsız (komşusuz) tam aydınlatması: sütun gökyüzü + gökyüzü BFS + blok ışığı BFS.
 * Üretilmiş TÜM kesitler için çalışır; sınırda komşu yok sayılır, komşularla dikiş için sonra stitchChunk çağrılır.
 */
export function computeChunkLight(chunk) {
  const n = chunk.sectionCount;
  for (let si = 0; si < n; si++) {
    chunk.secLight[si] = null;
    chunk.secLightU[si] = 0;
  }
  skyColumnPass(chunk);

  const dom = makeDomain(null, chunk.cx, chunk.cz, 1, 1, chunk);
  resetQueues();

  // gökyüzü tohumları: yanında daha karanlık geçirgen hücre olan aydınlık hücreler (yalnız dizili ışıklı kesitler)
  for (let si = 0; si < n; si++) {
    if (chunk.secGen[si] === 0) continue;
    const la = chunk.secLight[si];
    if (la === null) continue;
    const ba = dom.blocks[si];
    for (let ly = 0; ly < 16; ly++) {
      const yo = ly << 8;
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          const idx = yo + (z << 4) + x;
          const v = la[idx] >> 4;
          if (v < 2) continue;
          let seed = false;
          for (let d = 0; d < 4 && !seed; d++) {
            const nx = x + DX[d];
            const nz = z + DZ[d];
            if (nx < 0 || nz < 0 || nx > 15 || nz > 15) continue;
            const ni = yo + (nz << 4) + nx;
            const f = FILTER_LUT[ba[ni]];
            if (f >= 15) continue;
            if (v - (f > 1 ? f : 1) > (la[ni] >> 4)) seed = true;
          }
          if (seed) pushA(x, z, si * 16 + ly);
        }
      }
    }
  }
  drainAdd(dom, SKY);

  // blok ışığı kaynakları
  resetQueues();
  for (let si = 0; si < n; si++) {
    if (chunk.secGen[si] === 0) continue;
    seedEmitters(dom, si, 0, 0);
  }
  drainAdd(dom, BLK);
  for (let si = 0; si < n; si++) {
    if (chunk.secGen[si] === 1) chunk.compactLight(si);
  }
}

/** Kesitteki ışık yayan blokların emisyonunu yazar ve kuyruğa ekler (ox,oz: kesidin alan içi blok ofseti). */
function seedEmitters(dom, si, ox, oz) {
  const col = (oz >> 4) * dom.wc + (ox >> 4);
  const slot = si * dom.per + col;
  const ba = dom.blocks[slot];
  if (ba === null) return;
  const ch = dom.cols[col];
  // dizisiz tek tip kesit: yayıcı değilse tarama gerekmez
  if (ch.secBlocks[si] === null && EMIT_LUT[ch.secUniform[si]] === 0) return;
  let la = dom.light[slot];
  const base = si * 16;
  for (let i = 0; i < 4096; i++) {
    const e = EMIT_LUT[ba[i]];
    if (e > 0) {
      if (dom.shared[slot] === 1) la = materialize(dom, slot);
      la[i] |= e;
      dom.touched[slot] = 1;
      pushA(ox + (i & 15), oz + ((i >> 4) & 15), base + (i >> 8));
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Dikiş (yeni chunk / yeni kesit)
 * ---------------------------------------------------------------------------------------------- */
function seedPair(dom, ch, ix, iy, iz, ox, oy, oz) {
  const sh = ch === SKY ? 4 : 0;
  const wc = dom.wc;
  const per = dom.per;
  const si = (iy >> 4) * per + (iz >> 4) * wc + (ix >> 4);
  const so = (oy >> 4) * per + (oz >> 4) * wc + (ox >> 4);
  const bi = dom.blocks[si];
  const bo = dom.blocks[so];
  if (bi === null || bo === null) return;
  const li = ((iy & 15) << 8) + ((iz & 15) << 4) + (ix & 15);
  const lo = ((oy & 15) << 8) + ((oz & 15) << 4) + (ox & 15);
  const vi = (dom.light[si][li] >> sh) & 15;
  const vo = (dom.light[so][lo] >> sh) & 15;
  if (vi > 1) {
    const fo = FILTER_LUT[bo[lo]];
    if (fo < 15) {
      const nv = (ch === SKY && oy < iy && vi === 15) ? 15 - fo : vi - (fo > 1 ? fo : 1);
      if (nv > vo) pushA(ix, iz, iy);
    }
  }
  if (vo > 1) {
    const fi = FILTER_LUT[bi[li]];
    if (fi < 15) {
      const nv = (ch === SKY && iy < oy && vo === 15) ? 15 - fi : vo - (fi > 1 ? fi : 1);
      if (nv > vi) pushA(ox, oz, oy);
    }
  }
}

/** Yüz taraması gerekli mi? Biri yoksa ya da iki kesit de aynı tek tip ışıkta ise gerekmez. */
function faceNeedsSeed(dom, a, b) {
  if (dom.blocks[a] === null || dom.blocks[b] === null) return false;
  if (dom.shared[a] === 1 && dom.shared[b] === 1 && dom.light[a] === dom.light[b]) return false;
  return true;
}

function seedHorizontalFaces(dom, ch, si, hasW, hasE, hasN, hasS) {
  const per = dom.per;
  const cen = si * per + 4;
  const y0 = si * 16;
  if (hasW && faceNeedsSeed(dom, cen, si * per + 3)) {
    for (let ly = 0; ly < 16; ly++) for (let t = 0; t < 16; t++) seedPair(dom, ch, 16, y0 + ly, 16 + t, 15, y0 + ly, 16 + t);
  }
  if (hasE && faceNeedsSeed(dom, cen, si * per + 5)) {
    for (let ly = 0; ly < 16; ly++) for (let t = 0; t < 16; t++) seedPair(dom, ch, 31, y0 + ly, 16 + t, 32, y0 + ly, 16 + t);
  }
  if (hasN && faceNeedsSeed(dom, cen, si * per + 1)) {
    for (let ly = 0; ly < 16; ly++) for (let t = 0; t < 16; t++) seedPair(dom, ch, 16 + t, y0 + ly, 16, 16 + t, y0 + ly, 15);
  }
  if (hasS && faceNeedsSeed(dom, cen, si * per + 7)) {
    for (let ly = 0; ly < 16; ly++) for (let t = 0; t < 16; t++) seedPair(dom, ch, 16 + t, y0 + ly, 31, 16 + t, y0 + ly, 32);
  }
}

/** Sınır dikişi: yeni/yeniden kurulan chunk ile var olan komşuları arasında ışığı iki yönde yayar. */
export function stitchChunk(getChunk, chunk) {
  const dom = makeDomain(getChunk, chunk.cx - 1, chunk.cz - 1, 3, 3, chunk);
  const cols = dom.cols;
  const hasW = cols[3] !== null;
  const hasE = cols[5] !== null;
  const hasN = cols[1] !== null;
  const hasS = cols[7] !== null;
  if (!hasW && !hasE && !hasN && !hasS) return [];
  const n = chunk.sectionCount;
  for (let ch = 0; ch < 2; ch++) {
    resetQueues();
    for (let si = 0; si < n; si++) {
      if (chunk.secGen[si] === 0) continue;
      seedHorizontalFaces(dom, ch, si, hasW, hasE, hasN, hasS);
    }
    drainAdd(dom, ch);
  }
  return markTouched(dom);
}

/**
 * Yeni üretilen kesit (derin/tembel) için ışık: kesidin ışığı sıfırlanır, içindeki yayıcılar yayılır, altı-üstü-yanı komşu
 * kesitlerle (aynı chunk'ın dikey komşuları + yan chunk'lar) iki yönlü dikiş yapılır. Alan tüm dikey kesitleri kapsar
 * (örn. yüzeyden süzülen gökyüzü şaftı alt kesitlere akar). Dokunulan chunk'ları döner.
 */
export function lightNewSection(getChunk, chunk, si) {
  chunk.secLight[si] = null;
  chunk.secLightU[si] = 0;
  const dom = makeDomain(getChunk, chunk.cx - 1, chunk.cz - 1, 3, 3, chunk);
  const per = dom.per;
  const cen = si * per + 4;
  dom.touched[cen] = 1;
  const y0 = si * 16;
  const n = chunk.sectionCount;
  const cols = dom.cols;
  const hasW = cols[3] !== null;
  const hasE = cols[5] !== null;
  const hasN = cols[1] !== null;
  const hasS = cols[7] !== null;
  for (let ch = 0; ch < 2; ch++) {
    resetQueues();
    if (ch === BLK) seedEmitters(dom, si, 16, 16);
    seedHorizontalFaces(dom, ch, si, hasW, hasE, hasN, hasS);
    if (si > 0 && faceNeedsSeed(dom, cen, (si - 1) * per + 4)) {
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) seedPair(dom, ch, 16 + x, y0, 16 + z, 16 + x, y0 - 1, 16 + z);
    }
    if (si < n - 1 && faceNeedsSeed(dom, cen, (si + 1) * per + 4)) {
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) seedPair(dom, ch, 16 + x, y0 + 15, 16 + z, 16 + x, y0 + 16, 16 + z);
    }
    drainAdd(dom, ch);
  }
  return markTouched(dom);
}

/** Bağımsız hesap + dikiş (yeni üretilmiş chunk için). Dokunulan chunk'lar dizisini döner. */
export function relightChunk(getChunk, chunk) {
  computeChunkLight(chunk);
  return stitchChunk(getChunk, chunk);
}

/* ------------------------------------------------------------------------------------------------
 * Artımlı güncelleme
 * ---------------------------------------------------------------------------------------------- */
/**
 * Artımlı güncelleme: bloğu değişen hücreler için ışığı düzeltir. Blok kesitleri ZATEN güncellenmiş olmalı;
 * hücrelerin ışık değerleri hâlâ eskidir. cells: düz dizi [x0,y0,z0, x1,y1,z1, ...] (dünya koordinatları, mutlak y).
 * Dokunulan chunk'ları dirty yapar ve dizi olarak döner. Alan x/z'de 1 chunk pay ile ve TÜM dikey kesitleri kapsar
 * (dikey gökyüzü şaftı kaldırma/ekleme sınırsız derinliğe inebilir).
 */
export function updateLightBulk(getChunk, cells) {
  const n = cells.length / 3;
  if (n === 0) return [];
  let minCx = Infinity;
  let maxCx = -Infinity;
  let minCz = Infinity;
  let maxCz = -Infinity;
  for (let k = 0; k < n; k++) {
    const cx = cells[k * 3] >> 4;
    const cz = cells[k * 3 + 2] >> 4;
    if (cx < minCx) minCx = cx;
    if (cx > maxCx) maxCx = cx;
    if (cz < minCz) minCz = cz;
    if (cz > maxCz) maxCz = cz;
  }
  const cx0 = minCx - 1;
  const cz0 = minCz - 1;
  const dom = makeDomain(getChunk, cx0, cz0, maxCx - minCx + 3, maxCz - minCz + 3, null);
  if (dom.nS === 0) return [];
  const ox = cx0 * 16;
  const oz = cz0 * 16;
  const yBase = dom.yBase;
  const wc = dom.wc;
  const per = dom.per;
  const W = dom.W;
  const D = dom.D;
  const H = dom.H;

  for (let ch = 0; ch < 2; ch++) {
    const sh = ch === SKY ? 4 : 0;
    const keep = ch === SKY ? 0x0f : 0xf0;
    resetQueues();
    // 1) eski ışığı kaldır
    for (let k = 0; k < n; k++) {
      const gx = cells[k * 3] - ox;
      const gy = cells[k * 3 + 1] - yBase;
      const gz = cells[k * 3 + 2] - oz;
      if (gy < 0 || gy >= H) continue;
      const s = (gy >> 4) * per + (gz >> 4) * wc + (gx >> 4);
      let arr = dom.light[s];
      if (arr === null) continue;
      const li = ((gy & 15) << 8) + ((gz & 15) << 4) + (gx & 15);
      const v0 = (arr[li] >> sh) & 15;
      if (v0 > 0) {
        if (dom.shared[s] === 1) arr = materialize(dom, s);
        arr[li] &= keep;
        dom.touched[s] = 1;
        pushR(gx, gz, gy, v0);
      }
    }
    drainRemove(dom, ch);
    // 2) yeni kaynaklar ve açılan hücrelerin komşularından yeniden besleme
    for (let k = 0; k < n; k++) {
      const gx = cells[k * 3] - ox;
      const gy = cells[k * 3 + 1] - yBase;
      const gz = cells[k * 3 + 2] - oz;
      if (gy < 0 || gy >= H) continue;
      const s = (gy >> 4) * per + (gz >> 4) * wc + (gx >> 4);
      const barr = dom.blocks[s];
      if (barr === null) continue;
      const li = ((gy & 15) << 8) + ((gz & 15) << 4) + (gx & 15);
      const b = barr[li];
      const f = FILTER_LUT[b];
      if (ch === BLK) {
        const em = EMIT_LUT[b];
        if (em > 0) {
          let arr = dom.light[s];
          if (em > (arr[li] & 15)) {
            if (dom.shared[s] === 1) arr = materialize(dom, s);
            arr[li] = (arr[li] & 0xf0) | em;
          }
          dom.touched[s] = 1;
          pushA(gx, gz, gy);
        }
      } else if (f < 15 && gy === H - 1) {
        let arr = dom.light[s];
        const nv = 15 - f;
        if (nv > (arr[li] >> 4)) {
          if (dom.shared[s] === 1) arr = materialize(dom, s);
          arr[li] = (arr[li] & 0x0f) | (nv << 4);
          dom.touched[s] = 1;
          pushA(gx, gz, gy);
        }
      }
      if (f >= 15) continue;
      for (let d = 0; d < 6; d++) {
        const nx = gx + DX[d];
        const nz = gz + DZ[d];
        const ny = gy + DY[d];
        if (nx < 0 || nz < 0 || ny < 0 || nx >= W || nz >= D || ny >= H) continue;
        const ns = (ny >> 4) * per + (nz >> 4) * wc + (nx >> 4);
        const nl = dom.light[ns];
        if (nl === null) continue;
        if (((nl[((ny & 15) << 8) + ((nz & 15) << 4) + (nx & 15)] >> sh) & 15) > 0) pushA(nx, nz, ny);
      }
    }
    drainAdd(dom, ch);
  }
  return markTouched(dom);
}

/** Tek hücre için artımlı güncelleme (blok kesitleri zaten güncellenmiş olmalı). */
export function updateLightAt(getChunk, x, y, z) {
  return updateLightBulk(getChunk, [x, y, z]);
}

/** Işık baytı yardımcıları. */
export function skyOf(lightByte) {
  return lightByte >> 4;
}
export function blockOf(lightByte) {
  return lightByte & 15;
}
