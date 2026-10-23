/*
 * KEŞİF sim — DenseChunk: ÜRETİM penceresi (saf; DOM/three yok, worker-güvenli).
 *
 * Dünya üretimi (arazi, ağaç, yapı kancası, harita tabanları) hızlı olsun diye düz bir pencerede çalışır:
 *   blocks     Uint8Array(height*256)  indeks ((y*16)+z)*16+x, y = pencere içi (0 = mutlak y 0)
 *   heightMap  Int16Array(256)         en üstteki hava-olmayan bloğun y'si (boşsa 0)
 *   biomeMap   Uint8Array(256)
 * Pencere macerada y 0..367 (height = GEN_TOP_Y), harita/inşa modlarında 0..127 (height = MAP_H). Bitince `Chunk.loadDense`
 * ile kesitlere dönüştürülür (tek tip kesitler dizi tutmaz). Eski Chunk ile aynı alan adlarını taşıdığı için yapı kancası
 * (decorateChunk) ve tüm üretim işlevleri değişmeden çalışır.
 *
 * acquireDense: modül düzeyinde yeniden kullanılan pencere (üretim eşzamanlıdır; iç içe ÇAĞRILMAZ).
 */
import { CHUNK_AREA, CHUNK_SIZE, GEN_TOP_Y, MAP_H } from './constants.js';

const CS = CHUNK_SIZE;

export class DenseChunk {
  constructor(cx, cz, height) {
    this.cx = cx;
    this.cz = cz;
    this.height = height;
    this.blocks = new Uint8Array(height * CHUNK_AREA);
    this.heightMap = new Int16Array(CHUNK_AREA);
    this.biomeMap = new Uint8Array(CHUNK_AREA);
  }

  /** Sıfırlar ve koordinatları atar (yeniden kullanım). */
  reset(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.blocks.fill(0);
    this.heightMap.fill(0);
    this.biomeMap.fill(0);
    return this;
  }

  get originX() {
    return this.cx * CS;
  }

  get originZ() {
    return this.cz * CS;
  }

  get(lx, y, lz) {
    return this.blocks[((y * CS) + lz) * CS + lx];
  }

  set(lx, y, lz, id) {
    this.blocks[((y * CS) + lz) * CS + lx] = id;
  }

  topY(lx, lz) {
    return this.heightMap[lz * CS + lx];
  }

  /** Sütunun heightMap değerini yeniden tarar (üstten aşağı); boşsa 0. */
  recomputeColumn(lx, lz) {
    const blocks = this.blocks;
    const col = lz * CS + lx;
    let y = this.height - 1;
    while (y > 0 && blocks[(y << 8) + col] === 0) y--;
    this.heightMap[col] = y;
    return y;
  }

  recomputeHeightMap() {
    for (let lz = 0; lz < CS; lz++) {
      for (let lx = 0; lx < CS; lx++) this.recomputeColumn(lx, lz);
    }
  }

  /** En yüksek hava-olmayan y (heightMap'ten); hepsi boşsa 0. */
  maxTop() {
    let m = 0;
    const h = this.heightMap;
    for (let i = 0; i < CHUNK_AREA; i++) if (h[i] > m) m = h[i];
    return m;
  }
}

const scratch = new Map();

/** Yeniden kullanılan, sıfırlanmış üretim penceresi. height: GEN_TOP_Y (macera) | MAP_H (harita). */
export function acquireDense(cx, cz, height) {
  let d = scratch.get(height);
  if (!d) {
    d = new DenseChunk(cx, cz, height);
    scratch.set(height, d);
    return d;
  }
  return d.reset(cx, cz);
}

export { GEN_TOP_Y, MAP_H };
