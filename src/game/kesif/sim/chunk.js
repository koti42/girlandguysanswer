/*
 * KEŞİF sim — Chunk sütunu (saf; DOM/three yok, worker-güvenli).
 *
 * Bir chunk 16×16 tabanlı DİKEY SÜTUNDUR ve 16 yüksekliğinde KESİTLERDEN (section) oluşur:
 *   macera (varsayılan)  48 kesit, y -400..367   (WORLD_Y_MIN..)
 *   legacy (harita/inşa) 8 kesit,  y 0..127      ({legacy:true}; paylaşılan harita biçimi)
 * Kesit içi indeks (ly<<8)+(lz<<4)+lx (ly = y & 15). API MUTLAK y alır (negatif olabilir).
 *
 * Depolama (kesit başına, paralel diziler — nesne ayırmaz):
 *   secGen[si]      0 = henüz üretilmedi (tembel derin kesit), 1 = üretildi
 *   secBlocks[si]   Uint8Array(4096) | null   null + üretilmiş ⇒ TEK TİP kesit: secUniform[si] değeri her hücrede
 *   secUniform[si]  tek tip kesidin blok kimliği (hava = 0, katı taş vb.)
 *   secLight[si]    Uint8Array(4096) | null   null ⇒ tek tip ışık baytı secLightU[si] (üst 4 bit gökyüzü, alt 4 bit blok)
 *   secVersion[si]  bu kesidin son değişim sürümü (chunk.version'dan; mesh önbelleği/işçi yarışı için)
 * Salt-okunur PAYLAŞILAN tek tip diziler uniformArray(v) ile alınır (YAZMA!); yazmak için getSectionBlocksW/getSectionLightW
 * kesidi gerçek diziye çevirir. compactSection/compactLight tek tipe dönen kesidin dizisini bırakır (bellek).
 *
 *   heightMap  Int16Array(256)  sütundaki EN ÜSTTEKİ hava-olmayan bloğun MUTLAK y'si (sütun boşsa yMin); indeks z*16+x
 *   biomeMap   Uint8Array(256)  sütunun biyom kimliği (BIOME_KEYS indeksi); indeks z*16+x
 *   dirty / version / generated / edited  (World ve chunkManager kullanır)
 *
 * Eski düz-dizi kullanımı için: Chunk.fromBlocks(cx,cz,Uint8Array(32768)) (legacy chunk), chunk.toDense(y0,h), chunk.loadDense(...).
 */
import {
  CHUNK_AREA, CHUNK_SIZE, CHUNK_VOLUME, MAP_H, MAP_SECTION_COUNT, SECTION_H, SECTION_VOLUME,
  WORLD_SECTION_COUNT, WORLD_Y_MIN,
} from './constants.js';

const CS = CHUNK_SIZE;
const SV = SECTION_VOLUME;

/** "cx,cz" — harita biçimi ve kayıt anahtarlarıyla aynı metin anahtarı. */
export function chunkKey(cx, cz) {
  return cx + ',' + cz;
}

/** Sıcak yol için sayısal anahtar (|cx|,|cz| < 32768 varsayımı; dünya yarıçapı ≪ bu). */
export function chunkId(cx, cz) {
  return (cx + 32768) * 65536 + (cz + 32768);
}

/** "cx,cz" → {cx,cz} | null. */
export function parseChunkKey(key) {
  if (typeof key !== 'string') return null;
  const i = key.indexOf(',');
  if (i <= 0) return null;
  const cx = Number(key.slice(0, i));
  const cz = Number(key.slice(i + 1));
  if (!Number.isInteger(cx) || !Number.isInteger(cz)) return null;
  return { cx, cz };
}

/** Dünya koordinatı → chunk koordinatı (negatifler dahil). */
export function chunkCoord(v) {
  return Math.floor(v / CS);
}

/* ------------------------------------------------------------------------------------------------
 * Paylaşılan tek tip diziler (SALT OKUNUR)
 * ---------------------------------------------------------------------------------------------- */
const UNIFORM = new Array(256).fill(null);

/** Her hücresi `v` olan paylaşılan Uint8Array(4096). YAZMA: yalnız okumak içindir. */
export function uniformArray(v) {
  const k = v & 255;
  let a = UNIFORM[k];
  if (a === null) {
    a = new Uint8Array(SV);
    if (k !== 0) a.fill(k);
    UNIFORM[k] = a;
  }
  return a;
}

/** Dizi tek bir değerden mi oluşuyor? Değeri döner, değilse -1. */
export function uniformValueOf(arr) {
  const v = arr[0];
  for (let i = 1; i < SV; i++) if (arr[i] !== v) return -1;
  return v;
}

export class Chunk {
  /**
   * @param {number} cx
   * @param {number} cz
   * @param {{legacy?:boolean, lazy?:boolean}} [opts] legacy: 8 kesit y 0..127 (harita). lazy: kesitler üretilmemiş başlar
   *   (worldgen); varsayılan: tüm kesitler üretilmiş + hava (eski "sıfır dolu chunk" davranışı; testler/araçlar için).
   */
  constructor(cx, cz, opts) {
    const o = opts || {};
    const legacy = o.legacy === true;
    this.cx = cx;
    this.cz = cz;
    this.legacy = legacy;
    this.yMin = legacy ? 0 : WORLD_Y_MIN;
    this.sectionCount = legacy ? MAP_SECTION_COUNT : WORLD_SECTION_COUNT;
    this.yTop = this.yMin + this.sectionCount * SECTION_H; // hariç
    const n = this.sectionCount;
    this.secBlocks = new Array(n).fill(null);
    this.secUniform = new Uint8Array(n);
    this.secGen = new Uint8Array(n);
    this.secLight = new Array(n).fill(null);
    this.secLightU = new Uint8Array(n);
    this.secVersion = new Uint32Array(n);
    if (!o.lazy) this.secGen.fill(1);
    this.heightMap = new Int16Array(CHUNK_AREA).fill(this.yMin);
    this.biomeMap = new Uint8Array(CHUNK_AREA);
    this.dirty = true;
    this.version = 0;
    this.generated = false;
    this.edited = false;
  }

  /** Dünya x'i (blok) bu chunk'ın sol kenarı. */
  get originX() {
    return this.cx * CS;
  }

  get originZ() {
    return this.cz * CS;
  }

  /* --------------------------------------------------------------------------------------------
   * Aralık / kesit yardımcıları
   * ------------------------------------------------------------------------------------------ */
  inRangeY(y) {
    return y >= this.yMin && y < this.yTop;
  }

  /** Mutlak y → kesit indeksi (aralık dışı için geçersiz değer döner; inRangeY ile denetle). */
  sectionOfY(y) {
    return (y - this.yMin) >> 4;
  }

  /** Kesidin en alçak mutlak y'si. */
  sectionBase(si) {
    return this.yMin + si * SECTION_H;
  }

  hasSection(si) {
    return si >= 0 && si < this.sectionCount && this.secGen[si] === 1;
  }

  /** Kesit tek tip mi (üretilmiş + dizi yok)? */
  isUniformSection(si) {
    return this.secGen[si] === 1 && this.secBlocks[si] === null;
  }

  /** Tek tip kesidin değeri; tek tip değilse ya da üretilmemişse -1. */
  uniformId(si) {
    return this.secGen[si] === 1 && this.secBlocks[si] === null ? this.secUniform[si] : -1;
  }

  /** Okuma için kesit dizisi: gerçek dizi ya da paylaşılan tek tip dizi; üretilmemişse null. YAZMA. */
  getSectionBlocks(si) {
    if (this.secGen[si] === 0) return null;
    const a = this.secBlocks[si];
    return a !== null ? a : uniformArray(this.secUniform[si]);
  }

  /** Yazılabilir dizi: tek tip kesit gerçek diziye çevrilir; üretilmemiş kesit hava olarak başlatılır. */
  getSectionBlocksW(si) {
    let a = this.secBlocks[si];
    if (a === null) {
      a = new Uint8Array(SV);
      if (this.secGen[si] === 1) {
        const u = this.secUniform[si];
        if (u !== 0) a.fill(u);
      } else {
        this.secGen[si] = 1;
      }
      this.secBlocks[si] = a;
    }
    return a;
  }

  /**
   * Kesidi dışarıdan alır (üretim/işçi). blocks: Uint8Array(4096) (sahiplenilir) | null ⇒ tek tip `uniform`.
   * Tek tipe dönüşen dizi bırakılır.
   */
  setSection(si, blocks, uniform) {
    if (blocks) {
      const u = uniformValueOf(blocks);
      if (u >= 0) {
        this.secBlocks[si] = null;
        this.secUniform[si] = u;
      } else {
        this.secBlocks[si] = blocks;
        this.secUniform[si] = 0;
      }
    } else {
      this.secBlocks[si] = null;
      this.secUniform[si] = uniform & 255;
    }
    this.secGen[si] = 1;
  }

  /** Tek tipe dönmüşse diziyi bırakır; true = artık tek tip. */
  compactSection(si) {
    const a = this.secBlocks[si];
    if (a === null) return this.secGen[si] === 1;
    const u = uniformValueOf(a);
    if (u < 0) return false;
    this.secBlocks[si] = null;
    this.secUniform[si] = u;
    return true;
  }

  /** Kesidin tüm hücrelerini tek değerle doldurur (üretilmiş sayılır). */
  fillSection(si, id) {
    this.secBlocks[si] = null;
    this.secUniform[si] = id & 255;
    this.secGen[si] = 1;
  }

  /** Işık: okuma dizisi (gerçek ya da paylaşılan tek tip); üretilmemişse null. YAZMA. */
  getSectionLight(si) {
    if (this.secGen[si] === 0) return null;
    const a = this.secLight[si];
    return a !== null ? a : uniformArray(this.secLightU[si]);
  }

  /** Yazılabilir ışık dizisi: tek tip ışık gerçek diziye çevrilir. */
  getSectionLightW(si) {
    let a = this.secLight[si];
    if (a === null) {
      a = new Uint8Array(SV);
      const u = this.secLightU[si];
      if (u !== 0) a.fill(u);
      this.secLight[si] = a;
    }
    return a;
  }

  /** Tek tip ışık değeri (dizi yoksa), aksi halde -1. */
  lightUniformId(si) {
    return this.secLight[si] === null ? this.secLightU[si] : -1;
  }

  setSectionLightUniform(si, v) {
    this.secLight[si] = null;
    this.secLightU[si] = v & 255;
  }

  /** Işık dizisi tek tipe dönmüşse bırakır; true = artık tek tip. */
  compactLight(si) {
    const a = this.secLight[si];
    if (a === null) return true;
    const u = uniformValueOf(a);
    if (u < 0) return false;
    this.secLight[si] = null;
    this.secLightU[si] = u;
    return true;
  }

  /* --------------------------------------------------------------------------------------------
   * Hücre erişimi (mutlak y)
   * ------------------------------------------------------------------------------------------ */
  get(lx, y, lz) {
    const si = (y - this.yMin) >> 4;
    if (si < 0 || si >= this.sectionCount) return 0;
    const a = this.secBlocks[si];
    if (a !== null) return a[((y & 15) << 8) + (lz << 4) + lx];
    return this.secGen[si] === 1 ? this.secUniform[si] : 0;
  }

  /** Hücreyi yazar (kesit gerekirse gerçek diziye çevrilir/başlatılır). Değer değiştiyse true. Aralık dışı false. */
  set(lx, y, lz, id) {
    const si = (y - this.yMin) >> 4;
    if (si < 0 || si >= this.sectionCount) return false;
    let a = this.secBlocks[si];
    if (a === null) {
      if (this.secGen[si] === 1 && this.secUniform[si] === id) return false;
      a = this.getSectionBlocksW(si);
    }
    const i = ((y & 15) << 8) + (lz << 4) + lx;
    if (a[i] === id) return false;
    a[i] = id;
    return true;
  }

  /** Işık baytı (üst 4 bit gökyüzü, alt 4 bit blok); aralık dışı/üretilmemiş 0. */
  getLight(lx, y, lz) {
    const si = (y - this.yMin) >> 4;
    if (si < 0 || si >= this.sectionCount || this.secGen[si] === 0) return 0;
    const a = this.secLight[si];
    return a !== null ? a[((y & 15) << 8) + (lz << 4) + lx] : this.secLightU[si];
  }

  setLight(lx, y, lz, v) {
    const si = (y - this.yMin) >> 4;
    if (si < 0 || si >= this.sectionCount || this.secGen[si] === 0) return;
    if (this.secLight[si] === null && this.secLightU[si] === v) return;
    this.getSectionLightW(si)[((y & 15) << 8) + (lz << 4) + lx] = v;
  }

  getSkyLight(lx, y, lz) {
    return this.getLight(lx, y, lz) >> 4;
  }

  getBlockLight(lx, y, lz) {
    return this.getLight(lx, y, lz) & 15;
  }

  /* --------------------------------------------------------------------------------------------
   * Sürüm / kirli
   * ------------------------------------------------------------------------------------------ */
  /** Tüm sütun yeniden mesh'lensin: dirty=true, sürüm artışı, tüm kesit sürümleri güncellenir. */
  markDirty() {
    this.dirty = true;
    const v = ++this.version;
    this.secVersion.fill(v);
  }

  /** Yalnız bir kesit değişti. */
  markSectionDirty(si) {
    if (si < 0 || si >= this.sectionCount) return;
    this.dirty = true;
    this.secVersion[si] = ++this.version;
  }

  /** Kesit aralığındaki (dahil) en yeni sürüm. */
  sectionsVersion(s0, s1) {
    let m = 0;
    const a = s0 < 0 ? 0 : s0;
    const b = s1 >= this.sectionCount ? this.sectionCount - 1 : s1;
    for (let i = a; i <= b; i++) if (this.secVersion[i] > m) m = this.secVersion[i];
    return m;
  }

  /* --------------------------------------------------------------------------------------------
   * Yükseklik haritası
   * ------------------------------------------------------------------------------------------ */
  /** Sütundaki en üst hava-olmayan blok y'si (heightMap) — bellekten, taramasız. */
  topY(lx, lz) {
    return this.heightMap[lz * CS + lx];
  }

  /**
   * Bir sütunun heightMap değerini yeniden tarar (üstten aşağı). Üretilmemiş kesit "bilinmeyen katı" sayılır
   * (tarama orada durur). Sütun boşsa yMin.
   */
  recomputeColumn(lx, lz) {
    const col = lz * CS + lx;
    for (let si = this.sectionCount - 1; si >= 0; si--) {
      if (this.secGen[si] === 0) {
        const y = this.yMin + si * SECTION_H + SECTION_H - 1;
        this.heightMap[col] = y;
        return y;
      }
      const a = this.secBlocks[si];
      if (a === null) {
        if (this.secUniform[si] !== 0) {
          const y = this.yMin + si * SECTION_H + SECTION_H - 1;
          this.heightMap[col] = y;
          return y;
        }
        continue;
      }
      for (let ly = SECTION_H - 1; ly >= 0; ly--) {
        if (a[(ly << 8) + col] !== 0) {
          const y = this.yMin + si * SECTION_H + ly;
          this.heightMap[col] = y;
          return y;
        }
      }
    }
    this.heightMap[col] = this.yMin;
    return this.yMin;
  }

  /** Tüm heightMap'i blok verisinden kurar. */
  recomputeHeightMap() {
    for (let lz = 0; lz < CS; lz++) {
      for (let lx = 0; lx < CS; lx++) this.recomputeColumn(lx, lz);
    }
  }

  /* --------------------------------------------------------------------------------------------
   * Sorgular
   * ------------------------------------------------------------------------------------------ */
  /** Hiç hava-olmayan blok var mı? (hızlı boşluk sınaması; üretilmemiş kesitler yok sayılır) */
  isEmpty() {
    for (let si = 0; si < this.sectionCount; si++) {
      if (this.secGen[si] === 0) continue;
      const a = this.secBlocks[si];
      if (a === null) {
        if (this.secUniform[si] !== 0) return false;
        continue;
      }
      for (let i = 0; i < SV; i++) if (a[i] !== 0) return false;
    }
    return true;
  }

  /** Hava-olmayan blok sayısı (üretilmiş kesitlerde). */
  countSolid() {
    let n = 0;
    for (let si = 0; si < this.sectionCount; si++) {
      if (this.secGen[si] === 0) continue;
      const a = this.secBlocks[si];
      if (a === null) {
        if (this.secUniform[si] !== 0) n += SV;
        continue;
      }
      for (let i = 0; i < SV; i++) if (a[i] !== 0) n++;
    }
    return n;
  }

  /** Üretilmiş kesit sayısı. */
  generatedSections() {
    let n = 0;
    for (let si = 0; si < this.sectionCount; si++) n += this.secGen[si];
    return n;
  }

  /** Yaklaşık bellek (bayt): gerçek diziler + sabit alanlar (tek tip kesitler yalnız parça başı bayt). */
  memoryBytes() {
    let n = CHUNK_AREA * 3 + this.sectionCount * 12;
    for (let si = 0; si < this.sectionCount; si++) {
      if (this.secBlocks[si] !== null) n += SV;
      if (this.secLight[si] !== null) n += SV;
    }
    return n;
  }

  /* --------------------------------------------------------------------------------------------
   * Düz dizi köprüsü (harita biçimi, kayıt farkı, testler, üretim penceresi)
   * ------------------------------------------------------------------------------------------ */
  /** Mutlak y ∈ [y0, y0+h) aralığını düz Uint8Array(h*256) olarak kopyalar (indeks ((y-y0)*16+z)*16+x). h 16'nın katı, y0 kesit hizalı. */
  toDense(y0 = 0, h = MAP_H) {
    const out = new Uint8Array(h * CHUNK_AREA);
    const s0 = (y0 - this.yMin) >> 4;
    const ns = h >> 4;
    for (let k = 0; k < ns; k++) {
      const si = s0 + k;
      if (si < 0 || si >= this.sectionCount || this.secGen[si] === 0) continue;
      const a = this.secBlocks[si];
      const off = k * SV;
      if (a !== null) out.set(a, off);
      else if (this.secUniform[si] !== 0) out.fill(this.secUniform[si], off, off + SV);
    }
    return out;
  }

  /**
   * Düz diziden (y0'dan başlayarak h = dense.length/256 yükseklik) kesitleri kurar; tek tip kesitler dizi tutmaz.
   * Tek tip olmayan her kesit için küçük bir dizi kopyalanır.
   */
  loadDense(dense, y0 = 0, maxRow = Infinity) {
    const ns = (dense.length / CHUNK_AREA) >> 4;
    const s0 = (y0 - this.yMin) >> 4;
    for (let k = 0; k < ns; k++) {
      const si = s0 + k;
      if (si < 0 || si >= this.sectionCount) continue;
      if (k * SECTION_H > maxRow) {
        // pencerede bu satırın üstü kesin boş: taramadan tek tip hava
        this.secBlocks[si] = null;
        this.secUniform[si] = 0;
        this.secGen[si] = 1;
        continue;
      }
      const off = k * SV;
      const v = dense[off];
      let uni = true;
      for (let i = 1; i < SV; i++) {
        if (dense[off + i] !== v) {
          uni = false;
          break;
        }
      }
      if (uni) {
        this.secBlocks[si] = null;
        this.secUniform[si] = v;
      } else {
        this.secBlocks[si] = dense.slice(off, off + SV);
        this.secUniform[si] = 0;
      }
      this.secGen[si] = 1;
    }
  }

  /** Verilen düz dizi (32768 bayt, y 0..127; kopyalanır) → legacy (harita) chunk; heightMap hesaplanır. */
  static fromBlocks(cx, cz, blocks) {
    if (!blocks || blocks.length !== CHUNK_VOLUME) {
      throw new RangeError('Chunk blok dizisi ' + CHUNK_VOLUME + ' bayt olmalı');
    }
    const c = new Chunk(cx, cz, { legacy: true });
    c.loadDense(blocks, 0);
    c.recomputeHeightMap();
    c.generated = true;
    return c;
  }

  /** Blok + ışık + biyom verisinin derin kopyası. */
  clone() {
    const c = new Chunk(this.cx, this.cz, { legacy: this.legacy, lazy: true });
    for (let si = 0; si < this.sectionCount; si++) {
      c.secGen[si] = this.secGen[si];
      c.secUniform[si] = this.secUniform[si];
      c.secLightU[si] = this.secLightU[si];
      c.secVersion[si] = this.secVersion[si];
      if (this.secBlocks[si] !== null) c.secBlocks[si] = this.secBlocks[si].slice();
      if (this.secLight[si] !== null) c.secLight[si] = this.secLight[si].slice();
    }
    c.heightMap.set(this.heightMap);
    c.biomeMap.set(this.biomeMap);
    c.dirty = this.dirty;
    c.version = this.version;
    c.generated = this.generated;
    c.edited = this.edited;
    return c;
  }
}
