/*
 * KEŞİF render — atlas yerleşimi (saf; three/DOM yok, worker-güvenli).
 *
 * Her doku `tileSize`×`tileSize` piksel içerik + her kenarda `pad` piksellik "sarmalı" dolgudan oluşan bir
 * hücreye yerleşir (dolgu, doku kendini tekrar ettiği için karşı kenarın piksellerini taşır → mip/bilinear
 * sızıntısı komşu dokuyu değil kendi dokusunu okur). Atlas boyutu 2'nin kuvvetidir.
 *
 * Doku koordinatı sırası "GL sırasıdır": piksel satırı 0 = v 0 (atlasın altı). Bu yüzden uvFor(i) = [u0,v0,u1,v1]
 * için v0 dokunun ALT kenarı, v1 ÜST kenarıdır (v0 < v1); resim yukarı bakacak şekilde yerleştirilmiştir ve
 * three tarafında `flipY=false` kalır.
 */

/** Verilen doku boyutu için dolgu (piksel). */
export function padFor(tileSize) {
  return Math.max(2, tileSize >> 3);
}

function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Atlas yerleşimini hesaplar (boyama gerekmez; mesher varsayılan olarak bunu kullanır).
 * @returns {{tileSize:number,pad:number,cell:number,cols:number,rows:number,width:number,height:number,
 *   tileCount:number,uvTable:Float32Array,uvFor:(i:number)=>number[]}}
 */
export function computeAtlasLayout({ tileCount, tileSize = 32, pad } = {}) {
  const count = Math.max(1, tileCount | 0);
  const n = Math.max(4, tileSize | 0);
  const p = pad === undefined ? padFor(n) : pad | 0;
  const cell = n + 2 * p;
  let best = null;
  for (let w = 64; w <= 4096; w <<= 1) {
    const cols = Math.floor(w / cell);
    if (cols < 1) continue;
    const rows = Math.ceil(count / cols);
    const h = nextPow2(rows * cell);
    if (h > 4096) continue;
    const area = w * h;
    const side = Math.max(w, h);
    if (!best || area < best.area || (area === best.area && side < best.side)) {
      best = { w, h, cols, rows, area, side };
    }
  }
  if (!best) throw new RangeError('Atlas sığmıyor: ' + count + ' doku, ' + n + ' px');
  const { w, h, cols, rows } = best;
  const uvTable = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = (i / cols) | 0;
    const x0 = col * cell + p;
    const y0 = row * cell + p;
    uvTable[i * 4] = x0 / w;
    uvTable[i * 4 + 1] = y0 / h;
    uvTable[i * 4 + 2] = (x0 + n) / w;
    uvTable[i * 4 + 3] = (y0 + n) / h;
  }
  return {
    tileSize: n,
    pad: p,
    cell,
    cols,
    rows,
    width: w,
    height: h,
    tileCount: count,
    uvTable,
    uvFor(i) {
      const o = i * 4;
      return [uvTable[o], uvTable[o + 1], uvTable[o + 2], uvTable[o + 3]];
    },
  };
}

/**
 * Özel yüzey bölgeleri (doku-uzayı 0..1, v YUKARI artar): mesher bu dikdörtgenleri kutu yüzeylerine bütün olarak
 * yayar (fiziksel kırpma yerine). Atlas boyayıcıları aynı değerleri kullanır → sanat ve geometri uyuşur.
 *   fener.top : fenerin üst/alt kapak sanatı (sol-üst 12×12 px)
 */
export const TILE_REGIONS = Object.freeze({
  fenerCap: Object.freeze([0, 20 / 32, 12 / 32, 1]),
});
