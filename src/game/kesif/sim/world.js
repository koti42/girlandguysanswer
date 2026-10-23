/*
 * KEŞİF sim — World (saf; DOM/three yok, worker-güvenli). Derin dünya: chunk sütunları 16'lık KESİTLERDEN oluşur.
 *
 * Chunk'ları tutar, blok okuma/yazma, düzenleme kaydı (edits), ışık, olaylar, sınırlar ve bölge mührü farkındalığı sağlar.
 *
 *   new World({seed, mode:'macera'|'insa'|'harita', worldgen?, bounds?, zoneUnlocked?, base?, decorate?, mapChunks?})
 *
 *  - Dikey aralık: macera y ∈ [-400, 362] (yMin/yMax/yTop/sectionCount), insa/harita y ∈ [0, 127]. API MUTLAK y alır.
 *  - getBlock(x,y,z): chunk/kesit yüklü değilse null (çağıran ensureChunk/ensureSection etmeli); macera'da y < yMin ana kaya,
 *    y > yMax hava (legacy modlarda aralık dışı hava). Sınırlı modlarda (insa/harita) çerçeve dışı hücre ana kaya sayılır.
 *  - setBlock(x,y,z,id,{record:true,silent:false}): bloğu yazar, ışığı artımlı günceller, kesitleri kirletir, düzenlemeyi
 *    `edits` Map'ine (anahtar "x,y,z" → id) yazar, `blockChange` olayı yayar. Üretilmemiş derin kesidi önce üretir.
 *    Macera tabanındaki ana kayayı (y ≤ BEDROCK_TOP_Y) hiçbir yol silemez; y > yMax'a blok konamaz.
 *  - ensureChunk: chunk'ı eşzamanlı üretir (yüzey bandı y ≥ 0 hemen; derin kesitler tembel). Düzenlemeler üretimden SONRA uygulanır.
 *    Mühürlü bölgenin ötesi (ilk kilitli bölge sınırının ötesinde merkezi kalan chunk) üretilmez: null döner.
 *  - ensureSection(cx,cz,si) / ensureSectionsNear(x,y,z,rXZ,rY): derin kesitleri ihtiyaç olunca üretir (belirlenimci; üretim sırası
 *    sonucu değiştirmez). unloadSection: bellekten atar (düzenlemeler `edits`te kalır).
 *  - unlockZone(i): bölge i erişilebilir olur → i-1 ile i arasındaki Mühür halkası açılır (bariyer blokları doğal araziye döner).
 *
 * Boyutlar (KESIF_CITY_CONTRACT §5): `opts.dim` 'overworld' (varsayılan) | 'neon'. neon: sınırlı (bounds), bölge mührü yok, üretici
 *   genRegistry'den, kırma/yerleştirme koruması dimRules ile (yalnız oyuncu yazımı: record:false ve force:true muaf).
 *   `retire({mode,onStale})` eski boyutun dünyasına yapılan okuma/yazmayı yakalar (bayat başvuru tuzağı), `revive()` geri alır.
 *
 * Olay dinleyicileri: on(type, cb) → off(). Türler:
 *   'blockDenied'  {type,x,y,z,id,oldId,newId,reason,message,dim}   (boyut koruması bir yazımı reddetti)
 *   'blockChange'  {type,x,y,z,id,oldId,newId,record}
 *   'chunkLoad'    {type,chunk}      'chunkUnload' {type,cx,cz}
 *   'sectionLoad'  {type,cx,cz,si}   'sectionUnload' {type,cx,cz,si}
 *   'sealOpen'     {type,ring,zone,chunks}     'zoneUnlock' {type,zone}
 */
import {
  BEDROCK_TOP_Y, CHUNK_SIZE, CHUNK_VOLUME, MAP_H, MAX_BLOCK_ID, SURFACE_BAND_MIN_Y, WORLD_RADIUS, WORLD_Y_MAX, WORLD_Y_MIN,
  ZONE_COUNT, zoneIndexAt,
} from './constants.js';
import { B, EMIT_LUT, FILTER_LUT, SOLID_LUT } from './blocks.js';
import { isBiomeFlora } from './biomeData.js';
import { toSeedInt } from './rng.js';
import { Chunk, chunkId, chunkKey } from './chunk.js';
import {
  computeChunkLight, lightNewSection, stitchChunk, updateLightBulk,
} from './lighting.js';
import {
  DEFAULT_BOUNDS, SEAL_RING_RADII, generateChunk, generateSection, ringIndexAt, zoneForChunk,
} from './worldgen.js';
import { getDim } from './dim/dimensions.js';
import { getDimGen } from './dim/genRegistry.js';
import { checkSetBlock } from './dim/dimRules.js';

const CS = CHUNK_SIZE;
export const KILL_PLANE_Y = -24;
/** Yüzey bandının ilk kesit indeksi (macera): bunun altı tembel/derin. */
const SURFACE_SECTION = (SURFACE_BAND_MIN_Y - WORLD_Y_MIN) >> 4;

/** retire() varsayılan kipi: testte 'throw' (bayat başvuru testi kırar), üretimde 'count' (sayaç + zararsız dönüş). */
function defaultRetireMode() {
  try {
    const pr = typeof globalThis !== 'undefined' ? globalThis.process : undefined;
    return pr && pr.env && pr.env.NODE_ENV === 'test' ? 'throw' : 'count';
  } catch {
    return 'count';
  }
}

function isLogOrLeaf(id) {
  return (id >= 40 && id <= 43) || (id >= 48 && id <= 51) || isBiomeFlora(id);
}

export class World {
  constructor(opts = {}) {
    this.rawSeed = opts.seed === undefined ? 0 : opts.seed;
    this.seed = toSeedInt(this.rawSeed);
    this.mode = opts.mode === 'insa' || opts.mode === 'harita' ? opts.mode : 'macera';
    // boyut: yalnız macera modunda ('overworld' dışı boyutlar sınırlı/korumalı; insa/harita her zaman overworld)
    this.dim = this.mode === 'macera' && getDim(opts.dim) !== null ? opts.dim : 'overworld';
    this.dimDef = getDim(this.dim);
    const dimGen = this.dim !== 'overworld' ? getDimGen(this.dimDef.gen) : null;
    this.zones = this.dimDef.rules.zones !== false;
    this._retired = null;
    this.staleHits = 0;
    this._dimBudget = null;
    this._cityMemo = null;
    this.base = opts.base || 'düz';
    this.decorate = opts.decorate || null;
    this._worldgen = typeof opts.worldgen === 'function' ? opts.worldgen : dimGen ? dimGen.generateChunk : generateChunk;
    this._sectionGen = typeof opts.sectionGen === 'function' ? opts.sectionGen : dimGen ? dimGen.generateSection : generateSection;
    this._zoneUnlocked = typeof opts.zoneUnlocked === 'function' ? opts.zoneUnlocked : null;
    this.frame = this.mode !== 'macera';
    this.legacy = this.frame;
    if (opts.bounds) this.bounds = Object.assign({}, opts.bounds);
    else if (this.frame) this.bounds = Object.assign({}, DEFAULT_BOUNDS);
    else this.bounds = this.dimDef.bounds ? Object.assign({}, this.dimDef.bounds) : null;
    // sınırlı boyut (macera): sınır dışı hücre ana kaya sayılır → fizik dışarı çıkamaz, mesh komşu beklemez
    this._wall = !this.frame && this.dim !== 'overworld' && this.bounds !== null;
    // dikey aralık
    this.yMin = this.legacy ? 0 : this.dimDef.yMin !== undefined ? this.dimDef.yMin : WORLD_Y_MIN;
    this.yMax = this.legacy ? MAP_H - 1 : this.dimDef.yMax !== undefined ? this.dimDef.yMax : WORLD_Y_MAX;
    this.yTop = this.yMax + 1;
    this.sectionCount = this.legacy ? MAP_H >> 4 : (this.yMax + 1 - this.yMin + 15) >> 4;
    // macera: kill plane yok sayılır (taban ana kaya mühürlü); yalnız aralık dışı hatalar için kurtarma düzlemi
    this.killPlaneY = this.legacy ? KILL_PLANE_Y : this.yMin - 48;

    this.chunks = new Map();
    this.edits = new Map();
    this._editsByChunk = new Map();
    this._unlocked = new Set();
    this._mapChunks = opts.mapChunks instanceof Map ? opts.mapChunks : null;
    this._lcx = 0;
    this._lcz = 0;
    this._lc = null;
    this._listeners = {
      blockChange: [], chunkLoad: [], chunkUnload: [], sectionLoad: [], sectionUnload: [], sealOpen: [], zoneUnlock: [], blockDenied: [],
    };
    this._getChunkFn = (cx, cz) => this.chunks.get(chunkId(cx, cz)) || null;
  }

  /* ---------------------------------------------------------------------------------------------
   * Olaylar
   * ------------------------------------------------------------------------------------------- */
  on(type, cb) {
    const list = this._listeners[type];
    if (!list || typeof cb !== 'function') return () => {};
    list.push(cb);
    return () => {
      const i = list.indexOf(cb);
      if (i >= 0) list.splice(i, 1);
    };
  }

  onBlockChange(cb) {
    return this.on('blockChange', cb);
  }

  _emit(type, evt) {
    const list = this._listeners[type];
    if (list.length === 0) return;
    const copy = list.length === 1 ? list : list.slice();
    for (let i = 0; i < copy.length; i++) copy[i](evt);
  }

  /* ---------------------------------------------------------------------------------------------
   * Anahtarlar / erişim
   * ------------------------------------------------------------------------------------------- */
  chunkKey(cx, cz) {
    return chunkKey(cx, cz);
  }

  getChunk(cx, cz) {
    return this.chunks.get(chunkId(cx, cz)) || null;
  }

  hasChunk(cx, cz) {
    return this.chunks.has(chunkId(cx, cz));
  }

  /** Dünya koordinatındaki (blok) chunk; yüklü değilse null. */
  getChunkAt(x, z) {
    return this._chunkAtBlock(x, z);
  }

  forEachChunk(cb) {
    this.chunks.forEach(cb);
  }

  get chunkCount() {
    return this.chunks.size;
  }

  zoneForChunk(cx, cz) {
    return this.zones ? zoneForChunk(cx, cz) : 0;
  }

  inBounds(cx, cz) {
    const b = this.bounds;
    if (!b) return true;
    return cx >= b.minCx && cx <= b.maxCx && cz >= b.minCz && cz <= b.maxCz;
  }

  /** Blok koordinatı sınırlar içinde mi (sınırsız dünyada her zaman true). */
  isBlockInBounds(x, z) {
    return this.inBounds(x >> 4, z >> 4);
  }

  _isFrameChunk(cx, cz) {
    return this.frame && !this.inBounds(cx, cz);
  }

  _chunkAtBlock(x, z) {
    const cx = x >> 4;
    const cz = z >> 4;
    if (this._lc !== null && cx === this._lcx && cz === this._lcz) return this._lc;
    const c = this.chunks.get(chunkId(cx, cz)) || null;
    if (c !== null) {
      this._lcx = cx;
      this._lcz = cz;
      this._lc = c;
    }
    return c;
  }

  _missing(x, z) {
    if (this.frame) {
      const b = this.bounds;
      const cx = x >> 4;
      const cz = z >> 4;
      if (cx < b.minCx - 1 || cx > b.maxCx + 1 || cz < b.minCz - 1 || cz > b.maxCz + 1) return B.BEDROCK;
    } else if (this._wall && !this.inBounds(x >> 4, z >> 4)) {
      return B.BEDROCK;
    }
    return null;
  }

  /** Mutlak y → kesit indeksi (bu dünyanın düzeninde). */
  sectionOf(y) {
    return (y - this.yMin) >> 4;
  }

  /** y bu dünyanın blok aralığında mı? */
  inRangeY(y) {
    return y >= this.yMin && y <= this.yMax;
  }

  /* ---------------------------------------------------------------------------------------------
   * Bölgeler / mühür
   * ------------------------------------------------------------------------------------------- */
  isZoneUnlocked(i) {
    if (i <= 0 || !this.zones) return true;
    if (this._unlocked.has(i)) return true;
    return this._zoneUnlocked ? !!this._zoneUnlocked(i) : false;
  }

  /** Dış durumdan (zoneUnlocked) açılmış ama halkası henüz açılmamış bölgeleri açar. */
  _syncZones() {
    if (!this._zoneUnlocked || this.frame || !this.zones) return;
    for (let k = 1; k < ZONE_COUNT; k++) {
      if (!this._unlocked.has(k) && this._zoneUnlocked(k)) this.unlockZone(k);
    }
  }

  _openMask() {
    let m = 0;
    for (let k = 1; k < ZONE_COUNT; k++) if (this.isZoneUnlocked(k)) m |= 1 << (k - 1);
    return m;
  }

  /** Bu chunk şimdi üretilebilir mi (sınırlar + mühür kuralı)? */
  canGenerate(cx, cz) {
    const b = this.bounds;
    if (b) {
      if (this.inBounds(cx, cz)) return true;
      if (this.frame) return cx >= b.minCx - 1 && cx <= b.maxCx + 1 && cz >= b.minCz - 1 && cz <= b.maxCz + 1;
      return false;
    }
    const mx = cx * CS + 8;
    const mz = cz * CS + 8;
    const lim = WORLD_RADIUS + CS;
    if (mx * mx + mz * mz > lim * lim) return false;
    const zi = zoneIndexAt(mx, mz);
    for (let k = 1; k <= zi; k++) if (!this.isZoneUnlocked(k)) return false;
    return true;
  }

  /**
   * Bölge i erişilebilir olur: i-1 ile i arasındaki Mühür halkasının bariyer blokları, yüklü chunk'larda (derin kesitler dahil)
   * doğal arazi içeriğine döner; sonradan üretilecek chunk'lar halkasız üretilir.
   * Etkilenen chunk sayısını döner (zaten açıksa 0). Sınırlı modlarda etkisizdir.
   */
  unlockZone(i) {
    if (this.frame || !this.zones || !(i >= 1 && i < ZONE_COUNT) || this._unlocked.has(i)) return 0;
    this._unlocked.add(i);
    const n = this._openRing(i - 1);
    this._emit('zoneUnlock', { type: 'zoneUnlock', zone: i });
    return n;
  }

  /** Bölge i'nin dış mührü (i → i+1'i açan halka) açılır: unlockZone(i + 1) ile aynı. */
  openSeal(i) {
    return this.unlockZone(i + 1);
  }

  _openRing(ring) {
    const R = SEAL_RING_RADII[ring];
    const mask = this._openMask() | (1 << ring);
    const opts = this._genOpts(mask);
    const touched = [];
    const list = [];
    this.chunks.forEach((c) => list.push(c));
    const SEAL = B.SEAL_BARRIER;
    for (let n = 0; n < list.length; n++) {
      const c = list[n];
      const rc = Math.sqrt((c.cx * CS + 8) * (c.cx * CS + 8) + (c.cz * CS + 8) * (c.cz * CS + 8));
      if (Math.abs(rc - R) > 13.5) continue;
      const x0 = c.cx * CS;
      const z0 = c.cz * CS;
      const cols = [];
      for (let lz = 0; lz < CS; lz++) {
        for (let lx = 0; lx < CS; lx++) if (ringIndexAt(x0 + lx, z0 + lz) === ring) cols.push((lz << 4) + lx);
      }
      if (cols.length === 0) continue;
      let pristine = null;
      const cells = [];
      for (let si = 0; si < c.sectionCount; si++) {
        if (c.secGen[si] === 0 || c.secBlocks[si] === null) continue;
        const arr = c.secBlocks[si];
        let hasSeal = false;
        for (let k = 0; k < cols.length && !hasSeal; k++) {
          for (let ly = 0; ly < 16; ly++) {
            if (arr[(ly << 8) + cols[k]] === SEAL) {
              hasSeal = true;
              break;
            }
          }
        }
        if (!hasSeal) continue;
        let pr;
        if (!this.legacy && si < SURFACE_SECTION) {
          const d = this._sectionGen(this.seed, c.cx, c.cz, si, opts);
          pr = d.blocks || null;
          if (pr === null) {
            const u = d.uniform;
            for (let k = 0; k < cols.length; k++) {
              for (let ly = 0; ly < 16; ly++) {
                const i = (ly << 8) + cols[k];
                if (arr[i] === SEAL && u !== SEAL) {
                  arr[i] = u;
                  cells.push(x0 + (cols[k] & 15), c.yMin + si * 16 + ly, z0 + (cols[k] >> 4));
                }
              }
            }
            continue;
          }
        } else {
          if (pristine === null) pristine = this._worldgen(this.seed, c.cx, c.cz, opts);
          pr = pristine.getSectionBlocks(si);
          if (pr === null) continue;
        }
        for (let k = 0; k < cols.length; k++) {
          for (let ly = 0; ly < 16; ly++) {
            const i = (ly << 8) + cols[k];
            if (arr[i] === SEAL && pr[i] !== SEAL) {
              arr[i] = pr[i];
              cells.push(x0 + (cols[k] & 15), c.yMin + si * 16 + ly, z0 + (cols[k] >> 4));
            }
          }
        }
      }
      if (cells.length === 0) continue;
      c.recomputeHeightMap();
      c.markDirty();
      updateLightBulk(this._getChunkFn, cells);
      this._markNeighborsDirty(c.cx, c.cz, 0, 0, true);
      touched.push(c);
    }
    this._emit('sealOpen', { type: 'sealOpen', ring, zone: ring + 1, chunks: touched });
    return touched.length;
  }

  /* ---------------------------------------------------------------------------------------------
   * Üretim
   * ------------------------------------------------------------------------------------------- */
  _genOpts(openRings) {
    const o = {
      mode: this.mode,
      base: this.base,
      bounds: this.bounds || undefined,
      decorate: this.decorate || undefined,
      openRings,
      light: false,
    };
    if (this.dim !== 'overworld') o.dim = this.dim;
    return o;
  }

  /** Bekleyen (üretimden önce kaydedilmiş) düzenlemeleri chunk'ın ÜRETİLMİŞ kesitlerine uygular. */
  _applyPending(c, siOnly) {
    const pend = this._editsByChunk.get(chunkId(c.cx, c.cz));
    if (!pend) return false;
    let any = false;
    pend.forEach((val, idx) => {
      const si = idx >> 12;
      if (siOnly !== undefined && si !== siOnly) return;
      if (si >= c.sectionCount || c.secGen[si] === 0) return;
      if (c.secBlocks[si] === null && c.secUniform[si] === val) return;
      const arr = c.getSectionBlocksW(si);
      // taban ana kayası bozuk/kurcalanmış kayıtla da değişmez
      if (!this.legacy && (idx >> 8) + this.yMin <= BEDROCK_TOP_Y && arr[idx & 4095] === B.BEDROCK) return;
      arr[idx & 4095] = val;
      any = true;
    });
    return any;
  }

  /** Chunk'ı (yoksa) eşzamanlı üretir ve komşularla ışık dikişini yapar. Üretilemezse null. */
  ensureChunk(cx, cz) {
    if (this._retired !== null) return this._stale('ensureChunk', null);
    const id = chunkId(cx, cz);
    const have = this.chunks.get(id);
    if (have) return have;
    this._syncZones();
    if (!this.canGenerate(cx, cz)) return null;
    let c = this._worldgen(this.seed, cx, cz, this._genOpts(this._openMask()));
    c.cx = cx;
    c.cz = cz;
    if (c.legacy !== this.legacy) c = this._convertLayout(c);
    if (this._mapChunks && !this._isFrameChunk(cx, cz)) {
      const mb = this._mapChunks.get(chunkKey(cx, cz));
      if (mb && mb.length === CHUNK_VOLUME) c.loadDense(mb, 0);
    }
    const pend = this._editsByChunk.get(id);
    if (pend) {
      this._applyPending(c);
      c.edited = true;
    }
    c.recomputeHeightMap();
    c.generated = true;
    computeChunkLight(c);
    this.chunks.set(id, c);
    stitchChunk(this._getChunkFn, c);
    c.markDirty();
    this._markNeighborsDirty(cx, cz, 0, 0, true);
    this._emit('chunkLoad', { type: 'chunkLoad', chunk: c });
    return c;
  }

  /**
   * Özel üreticinin (testler/araçlar) dünyadan farklı dikey düzende ürettiği chunk'ı dünyanın düzenine çevirir: macera düzeni (48 kesit)
   * → legacy (y 0..127) ya da tersi (legacy içerik macera dünyasında y 0..127'ye gömülür; üstü hava, altı tembel derin dünya).
   */
  _convertLayout(src) {
    const n = new Chunk(src.cx, src.cz, { legacy: this.legacy, lazy: !this.legacy });
    n.loadDense(src.toDense(0, MAP_H), 0);
    if (!this.legacy) for (let si = n.sectionOf(MAP_H); si < n.sectionCount; si++) n.fillSection(si, 0);
    n.biomeMap.set(src.biomeMap);
    return n;
  }

  /**
   * Chunk'ın `si` kesidini (yoksa) üretir: belirlenimci derin üretim + bekleyen düzenlemeler + ışık dikişi.
   * Chunk yüklü değilse önce ensureChunk. Üretilirse true (zaten varsa da true), olmazsa false.
   */
  ensureSection(cx, cz, si) {
    if (this._retired !== null) return this._stale('ensureSection', false);
    let c = this.chunks.get(chunkId(cx, cz));
    if (!c) c = this.ensureChunk(cx, cz);
    if (!c || si < 0 || si >= c.sectionCount) return false;
    if (c.secGen[si] === 1) return true;
    const d = this._sectionGen(this.seed, cx, cz, si, this._genOpts(this._openMask()));
    this._installSection(c, si, d.blocks || null, d.uniform | 0);
    return true;
  }

  /** İşçiden/dışarıdan gelen hazır kesidi alır (üretilmemişse). Alındıysa true. */
  adoptSection(cx, cz, si, blocks, uniform) {
    if (this._retired !== null) return this._stale('adoptSection', false);
    const c = this.chunks.get(chunkId(cx, cz));
    if (!c || si < 0 || si >= c.sectionCount || c.secGen[si] === 1) return false;
    this._installSection(c, si, blocks || null, uniform | 0);
    return true;
  }

  _installSection(c, si, blocks, uniform) {
    c.setSection(si, blocks, uniform);
    const pend = this._editsByChunk.get(chunkId(c.cx, c.cz));
    if (pend && this._applyPending(c, si)) c.edited = true;
    // üstündeki kesit hava değilse heightMap bu kesitten etkilenmez; üstü üretilmemişse bilinmeyen katı varsayımı değişir
    lightNewSection(this._getChunkFn, c, si);
    c.markSectionDirty(si);
    this._markSectionNeighborsDirty(c, si);
    this._emit('sectionLoad', { type: 'sectionLoad', cx: c.cx, cz: c.cz, si });
  }

  /**
   * (x,y,z) çevresindeki derin kesitleri üretir: yatayda ±rXZ blok, dikeyde ±rY blok (varsayılan 1 chunk / 16 blok).
   * Yalnız YÜKLÜ chunk'larda çalışır. limit: tek çağrıda en çok kaç kesit üretilsin. Üretilen kesit sayısını döner.
   */
  ensureSectionsNear(x, y, z, rXZ = 8, rY = 16, limit = Infinity) {
    if (this._retired !== null) return this._stale('ensureSectionsNear', 0);
    const yLo = Math.max(this.yMin, Math.floor(y - rY));
    const yHi = Math.min(this.yMax, Math.floor(y + rY));
    if (yHi < yLo) return 0;
    const s0 = (yLo - this.yMin) >> 4;
    const s1 = (yHi - this.yMin) >> 4;
    const cx0 = (x - rXZ) >> 4;
    const cx1 = (x + rXZ) >> 4;
    const cz0 = (z - rXZ) >> 4;
    const cz1 = (z + rXZ) >> 4;
    let made = 0;
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.chunks.get(chunkId(cx, cz));
        if (!c) continue;
        for (let si = s0; si <= s1; si++) {
          if (c.secGen[si] === 1) continue;
          if (made >= limit) return made;
          if (this.ensureSection(cx, cz, si)) made++;
        }
      }
    }
    return made;
  }

  /** Kesidi bellekten atar (düzenlemeler `edits`te kalır; yeniden ensureSection'da uygulanır). */
  unloadSection(cx, cz, si) {
    const c = this.chunks.get(chunkId(cx, cz));
    if (!c || si < 0 || si >= c.sectionCount || c.secGen[si] === 0) return false;
    c.secGen[si] = 0;
    c.secBlocks[si] = null;
    c.secUniform[si] = 0;
    c.secLight[si] = null;
    c.secLightU[si] = 0;
    this._markSectionNeighborsDirty(c, si);
    this._emit('sectionUnload', { type: 'sectionUnload', cx, cz, si });
    return true;
  }

  /** Chunk'ı bellekten atar; düzenlemeler `edits`te kalır, yeniden ensureChunk'ta uygulanır. */
  unloadChunk(cx, cz) {
    const id = chunkId(cx, cz);
    if (!this.chunks.delete(id)) return false;
    if (this._lc !== null && this._lcx === cx && this._lcz === cz) this._lc = null;
    this._markNeighborsDirty(cx, cz, 0, 0, true);
    this._emit('chunkUnload', { type: 'chunkUnload', cx, cz });
    return true;
  }

  /** Işık bozulduysa bir chunk'ı baştan hesaplar (komşu dikişi dahil). */
  relightChunk(cx, cz) {
    const c = this.getChunk(cx, cz);
    if (!c) return false;
    computeChunkLight(c);
    stitchChunk(this._getChunkFn, c);
    c.markDirty();
    return true;
  }

  _markNeighborsDirty(cx, cz, lx, lz, all) {
    const xs = all || lx === 0 ? -1 : 0;
    const xe = all || lx === CS - 1 ? 1 : 0;
    const zs = all || lz === 0 ? -1 : 0;
    const ze = all || lz === CS - 1 ? 1 : 0;
    for (let dz = zs; dz <= ze; dz++) {
      for (let dx = xs; dx <= xe; dx++) {
        if (dx === 0 && dz === 0) continue;
        const n = this.chunks.get(chunkId(cx + dx, cz + dz));
        if (n) n.markDirty();
      }
    }
  }

  /** Bir kesidin mesh'ini etkileyen komşu kesitler (dikey + 8 yan chunk'ın aynı ± 1 kesidi) kirlenir. */
  _markSectionNeighborsDirty(c, si) {
    c.markSectionDirty(si - 1);
    c.markSectionDirty(si + 1);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const n = this.chunks.get(chunkId(c.cx + dx, c.cz + dz));
        if (!n) continue;
        n.markSectionDirty(si - 1);
        n.markSectionDirty(si);
        n.markSectionDirty(si + 1);
      }
    }
  }

  /** (lx,ly,lz) hücresindeki değişimin mesh'ini etkilediği komşu kesitleri kirletir (sınırdaysa). */
  _markBorderDirty(c, si, lx, ly, lz) {
    const ex = lx === 0 ? -1 : lx === 15 ? 1 : 0;
    const ez = lz === 0 ? -1 : lz === 15 ? 1 : 0;
    const ey = ly === 0 ? -1 : ly === 15 ? 1 : 0;
    if (ex === 0 && ez === 0 && ey === 0) return;
    for (let az = 0; az <= 1; az++) {
      if (az === 1 && ez === 0) continue;
      for (let ax = 0; ax <= 1; ax++) {
        if (ax === 1 && ex === 0) continue;
        for (let ay = 0; ay <= 1; ay++) {
          if (ay === 1 && ey === 0) continue;
          if (ax === 0 && az === 0 && ay === 0) continue;
          const dx = ax ? ex : 0;
          const dz = az ? ez : 0;
          const dy = ay ? ey : 0;
          const n = dx === 0 && dz === 0 ? c : this.chunks.get(chunkId(c.cx + dx, c.cz + dz));
          if (n) n.markSectionDirty(si + dy);
        }
      }
    }
  }

  /* ---------------------------------------------------------------------------------------------
   * Blok / ışık erişimi
   * ------------------------------------------------------------------------------------------- */
  getBlock(x, y, z) {
    if (this._retired !== null) return this._stale('getBlock', null);
    const yo = y - this.yMin;
    if (yo < 0) return this.legacy ? B.AIR : B.BEDROCK;
    if (y > this.yMax) return B.AIR;
    const c = this._chunkAtBlock(x, z);
    if (c === null) return this._missing(x, z);
    const si = yo >> 4;
    const a = c.secBlocks[si];
    if (a !== null) return a[((yo & 15) << 8) + ((z & 15) << 4) + (x & 15)];
    return c.secGen[si] === 1 ? c.secUniform[si] : null;
  }

  /**
   * Işık baytı (üst 4 bit gökyüzü, alt 4 bit blok). Dünya tavanı üstü tam gökyüzü, yüklenmemiş chunk gökyüzü sayılır;
   * taban altı ve üretilmemiş derin kesit karanlık (0).
   */
  getLight(x, y, z) {
    if (this._retired !== null) return this._stale('getLight', 0);
    const yo = y - this.yMin;
    if (y > this.yMax) return 0xf0;
    if (yo < 0) return 0;
    const c = this._chunkAtBlock(x, z);
    if (c === null) return 0xf0;
    const si = yo >> 4;
    if (c.secGen[si] === 0) return 0;
    const a = c.secLight[si];
    if (a !== null) return a[((yo & 15) << 8) + ((z & 15) << 4) + (x & 15)];
    return c.secLightU[si];
  }

  getSkyLight(x, y, z) {
    return this.getLight(x, y, z) >> 4;
  }

  getBlockLight(x, y, z) {
    return this.getLight(x, y, z) & 15;
  }

  /** Sütunun biyom kimliği (BIOME_KEYS indeksi); chunk yoksa -1. */
  getBiome(x, z) {
    if (this._retired !== null) return this._stale('getBiome', -1);
    const c = this._chunkAtBlock(x, z);
    if (c === null) return -1;
    return c.biomeMap[((z & 15) << 4) + (x & 15)];
  }

  /**
   * Sütunun en üst KATI bloğunun y'si (yaprak/kütük dahil; mühür bariyeri hariç). Chunk yüklü değilse yMin - 1.
   * (Eski sözleşme: -1; macera'da yMin-1 = -401, legacy'de -1.)
   * opts.ignoreFoliage: yaprak ve kütükleri atla (zemin). opts.liquid: sıvı yüzeyinde dur.
   */
  surfaceY(x, z, opts) {
    if (this._retired !== null) return this._stale('surfaceY', this.yMin - 1);
    const c = this._chunkAtBlock(x, z);
    if (c === null) return this.yMin - 1;
    const col = ((z & 15) << 4) + (x & 15);
    const ignoreFoliage = !!(opts && opts.ignoreFoliage);
    const liquid = !!(opts && opts.liquid);
    const yMin = c.yMin;
    let y = c.heightMap[col];
    while (y >= yMin) {
      const si = (y - yMin) >> 4;
      if (c.secGen[si] === 0) return y; // bilinmeyen kesit katı sayılır
      const a = c.secBlocks[si];
      const b = a !== null ? a[((y & 15) << 8) + col] : c.secUniform[si];
      if (b === 0 || b === B.SEAL_BARRIER) {
        y--;
        continue;
      }
      if (liquid && (b === B.WATER || b === B.WATER_FLOW || b === B.LAVA || b === B.LAVA_FLOW)) return y;
      if (!SOLID_LUT[b] || (ignoreFoliage && isLogOrLeaf(b))) {
        y--;
        continue;
      }
      return y;
    }
    return this.yMin - 1;
  }

  /**
   * Bloğu yazar. Chunk yüklü değilse, değer aynıysa, geçersizse, aralık dışıysa ya da sınırlı modda çerçeve chunk'ıysa false.
   * opts.record (varsayılan true): `edits`e yazar ve chunk'ı edited yapar. opts.silent: olay yayma.
   */
  setBlock(x, y, z, id, opts) {
    if (this._retired !== null) return this._stale('setBlock', false);
    if (y < this.yMin || y > this.yMax || !(id >= 0 && id <= MAX_BLOCK_ID)) return false;
    const c = this._chunkAtBlock(x, z);
    if (c === null) return false;
    if (this.frame && !this.inBounds(c.cx, c.cz)) return false;
    const si = (y - this.yMin) >> 4;
    if (c.secGen[si] === 0) {
      if (!this.ensureSection(c.cx, c.cz, si)) return false;
    }
    const lx = x & 15;
    const lz = z & 15;
    const ly = y & 15;
    let arr = c.secBlocks[si];
    let old;
    if (arr === null) {
      old = c.secUniform[si];
      if (old === id) return false;
    } else {
      old = arr[(ly << 8) + (lz << 4) + lx];
      if (old === id) return false;
    }
    // taban ana kayası silinemez/değiştirilemez (derin dünya mühürlü)
    if (!this.legacy && y <= BEDROCK_TOP_Y && old === B.BEDROCK) return false;
    // boyut koruması (şehir): yalnız oyuncu yazımı; record:false (sistem geçişi/kayıttan uygulama) ve force muaf
    if (this.dim !== 'overworld' && (!opts || (opts.record !== false && opts.force !== true))) {
      const rule = checkSetBlock(this, x, y, z, old, id);
      if (!rule.ok) {
        if (!opts || !opts.silent) {
          this._emit('blockDenied', {
            type: 'blockDenied', x, y, z, id, newId: id, oldId: old, reason: rule.reason, message: rule.message, dim: this.dim,
          });
        }
        return false;
      }
    }
    if (arr === null) arr = c.getSectionBlocksW(si);
    arr[(ly << 8) + (lz << 4) + lx] = id;
    const col = (lz << 4) + lx;
    const hm = c.heightMap[col];
    if (id !== 0) {
      if (y > hm) c.heightMap[col] = y;
    } else if (y === hm) {
      c.recomputeColumn(lx, lz);
    }
    if (FILTER_LUT[old] !== FILTER_LUT[id] || EMIT_LUT[old] !== EMIT_LUT[id]) {
      updateLightBulk(this._getChunkFn, [x, y, z]);
    }
    c.markSectionDirty(si);
    this._markBorderDirty(c, si, lx, ly, lz);
    const record = !opts || opts.record !== false;
    if (record) {
      // şehir: oyuncunun yerleştirip sonra kırdığı blok (y ≥ 64: doğal dolgu/sıvı yok → özgün hücre hava) düzenleme kaydından SİLİNİR; aksi halde bütçe boşalmaz
      if (id === 0 && y >= 64 && this.dim !== 'overworld' && this.edits.get(x + ',' + y + ',' + z) === old) this._dropEdit(x, y, z, c);
      else this._recordEdit(x, y, z, id, c);
      c.edited = true;
    }
    if (!opts || !opts.silent) {
      this._emit('blockChange', {
        type: 'blockChange', x, y, z, id, newId: id, oldId: old, record,
      });
    }
    return true;
  }

  /** Düzenleme kaydını siler (hücre özgün üretim değerine döner). */
  _dropEdit(x, y, z, chunk) {
    this.edits.delete(x + ',' + y + ',' + z);
    const m = this._editsByChunk.get(chunk ? chunkId(chunk.cx, chunk.cz) : chunkId(x >> 4, z >> 4));
    if (m) m.delete(((y - this.yMin) << 8) + ((z & 15) << 4) + (x & 15));
  }

  _recordEdit(x, y, z, id, chunk) {
    this.edits.set(x + ',' + y + ',' + z, id);
    const cid = chunk ? chunkId(chunk.cx, chunk.cz) : chunkId(x >> 4, z >> 4);
    let m = this._editsByChunk.get(cid);
    if (!m) {
      m = new Map();
      this._editsByChunk.set(cid, m);
    }
    m.set(((y - this.yMin) << 8) + ((z & 15) << 4) + (x & 15), id);
  }

  /* ---------------------------------------------------------------------------------------------
   * Düzenleme kaydı
   * ------------------------------------------------------------------------------------------- */
  /**
   * Düzenleme listesini uygular. Kaynak: Map("x,y,z" → id) | düz nesne | [[x,y,z,id],...].
   * Yüklü chunk/kesitlere hemen (olaysız), yüklenmemişlere chunk/kesit üretilince uygulanır. Uygulanan sayıyı döner.
   */
  applyEdits(src) {
    const entries = [];
    const yMin = this.yMin;
    const yMax = this.yMax;
    const push = (x, y, z, id) => {
      if (Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) && y >= yMin && y <= yMax
        && Number.isInteger(id) && id >= 0 && id <= MAX_BLOCK_ID) entries.push(x, y, z, id);
    };
    const fromKey = (k, id) => {
      const p = String(k).split(',');
      if (p.length === 3) push(Number(p[0]), Number(p[1]), Number(p[2]), id);
    };
    if (src instanceof Map) src.forEach((id, k) => fromKey(k, id));
    else if (Array.isArray(src)) src.forEach((e) => { if (e && e.length >= 4) push(e[0], e[1], e[2], e[3]); });
    else if (src && typeof src === 'object') Object.keys(src).forEach((k) => fromKey(k, src[k]));
    for (let k = 0; k < entries.length; k += 4) {
      const x = entries[k];
      const y = entries[k + 1];
      const z = entries[k + 2];
      const id = entries[k + 3];
      const c = this._chunkAtBlock(x, z);
      this._recordEdit(x, y, z, id, c);
      if (c) {
        const si = (y - yMin) >> 4;
        if (c.secGen[si] === 1) {
          this.setBlock(x, y, z, id, { record: false, silent: true });
          c.edited = true;
        }
      }
    }
    return entries.length / 4;
  }

  /** Düzenlemeleri düz nesne olarak döner: {"x,y,z": id} (anahtar sıralı, belirlenimci). */
  serializeEdits() {
    const out = {};
    const keys = Array.from(this.edits.keys()).sort();
    for (let i = 0; i < keys.length; i++) out[keys[i]] = this.edits.get(keys[i]);
    return out;
  }

  /**
   * Chunk'ın y 0..127 aralığındaki bloklarını verilen düz diziyle (32768 bayt, harita/legacy biçimi) değiştirir (kayıttan yükleme).
   * Chunk üretilir (gerekirse), farklar `edits`e yazılır, ışık artımlı düzeltilir, chunk edited olur. Değişen hücre sayısını
   * döner; chunk üretilemezse -1.
   */
  setChunkBlocks(cx, cz, blocks) {
    if (this._retired !== null) return this._stale('setChunkBlocks', -1);
    if (!blocks || blocks.length !== CHUNK_VOLUME) return -1;
    const c = this.ensureChunk(cx, cz);
    if (!c || this._isFrameChunk(cx, cz)) return -1;
    const x0 = cx * CS;
    const z0 = cz * CS;
    const y0 = Math.max(0, this.yMin);
    const cur = c.toDense(y0, MAP_H);
    const cells = [];
    const touchedSec = new Set();
    for (let i = 0; i < CHUNK_VOLUME; i++) {
      const nv = blocks[i];
      if (nv === cur[i] || nv > MAX_BLOCK_ID) continue;
      const lx = i & 15;
      const lz = (i >> 4) & 15;
      const y = y0 + (i >> 8);
      const si = (y - c.yMin) >> 4;
      if (c.secGen[si] === 0) continue;
      c.getSectionBlocksW(si)[((y & 15) << 8) + (lz << 4) + lx] = nv;
      touchedSec.add(si);
      cells.push(x0 + lx, y, z0 + lz);
      this._recordEdit(x0 + lx, y, z0 + lz, nv, c);
    }
    const n = cells.length / 3;
    if (n > 0) {
      c.recomputeHeightMap();
      updateLightBulk(this._getChunkFn, cells);
      c.markDirty();
      this._markNeighborsDirty(cx, cz, 0, 0, true);
    }
    c.edited = true;
    return n;
  }

  /* ---------------------------------------------------------------------------------------------
   * Emekli dünya (boyut geçişi): bayat başvuru tuzağı
   * ------------------------------------------------------------------------------------------- */
  /**
   * Bu dünyayı emekli eder: blok okuma/yazma/üretim çağrıları yakalanır (sistemler `G.world`ü çağrı ötesinde önbelleğe ALMAMALI).
   * opts.mode: 'throw' (varsayılan: test ortamında) → Error fırlatır; 'count' (varsayılan: üretimde) → `staleHits++`, zararsız değer döner
   * (getBlock null, setBlock false, ensureChunk null, ensureSection false). opts.onStale(name, world): her yakalamada çağrılır (örn. G.debug.staleWorldHits++).
   * Serileştirme (edits, serializeEdits), olaylar, chunk tablosu, unload/dispose serbesttir. Geri almak için revive().
   */
  retire(opts) {
    const o = opts || {};
    const mode = o.mode === 'throw' || o.mode === 'count' ? o.mode : defaultRetireMode();
    this._retired = { mode, onStale: typeof o.onStale === 'function' ? o.onStale : null };
    return this;
  }

  /** Emekliliği kaldırır (boyuta geri dönüş). */
  revive() {
    this._retired = null;
    return this;
  }

  get retired() {
    return this._retired !== null;
  }

  _stale(name, fallback) {
    const r = this._retired;
    this.staleHits++;
    if (r.onStale) r.onStale(name, this);
    if (r.mode === 'throw') throw new Error('Emekli dünyaya erişim (' + name + ', boyut ' + this.dim + '): sistem eski G.world başvurusunu tutuyor');
    return fallback;
  }

  dispose() {
    this.chunks.clear();
    this.edits.clear();
    this._editsByChunk.clear();
    this._lc = null;
    Object.keys(this._listeners).forEach((k) => {
      this._listeners[k].length = 0;
    });
  }
}
