/*
 * KEŞİF render — chunk üretim/mesh çekirdeği (SAF: three/DOM yok → Web Worker'da ve ana thread'de AYNI kod çalışır).
 *
 *   makeGenContext({seed, mode, base, bounds, decorate, gen?, dim?})   üretim bağlamı (gen: genRegistry anahtarı 'overworld'|'city'; dim: boyut kimliği)
 *   generateChunkData(g, cx, cz, openRings, packedEdits, overlay) → Chunk  (yüzey bandı: arazi + düzenleme + yükseklik + ışık)
 *   generateSectionsData(g, cx, cz, sis, openRings, packedEdits) → {list:[{si, b}], transfer}   derin kesitler (tembel)
 *   packEdits(map|null) → Uint32Array|null          (idx<<8 | blokKimliği) çiftleri; idx = ((y - yMin)<<8) + (z<<4) + x
 *   applyPackedToChunk(chunk, packed, onlySi?)      düzenlemeleri üretilmiş kesitlere uygular
 *   chunkToTransfer(chunk) → {data, transfer}       işçi → ana thread chunk (kesit başına blok + ışık; tek tip kesitler sayı)
 *   chunkToWire(chunk, sA, sB) → tel nesnesi        mesh işi için sütunun sA..sB kesitleri {cx,cz,yMin,sectionCount,s0,sb,sl,biomeMap}
 *   meshFromWire(center, nb, uvTable, opts, lod, band) → mesh   mesher.meshChunk sarmalayıcısı (stairs:'fixed' vb. varsayılanlar)
 *   BAND_SECTIONS, bandRange(b, n), bandCount(n), bandOfSection(si)     mesh bantları (3 kesit = 48 blok)
 *   MESH_DEFAULTS
 *
 * World#ensureChunk ile AYNI sırayı izler: generateChunk(light:false) → (harita katmanı) → düzenlemeler → yükseklik haritası
 * → computeChunkLight. Komşularla ışık dikişi (stitchChunk) ana thread'de, chunk World'e alınırken yapılır.
 */
import { getDimGen } from '../sim/dim/genRegistry.js';
import { Chunk } from '../sim/chunk.js';
import { B } from '../sim/blocks.js';
import { BEDROCK_TOP_Y, WORLD_Y_MIN } from '../sim/constants.js';
import { computeChunkLight } from '../sim/lighting.js';
import { meshChunk } from './mesher.js';

/** Bir mesh bandı kaç 16'lık kesit: 3 (= 48 blok). Macera 48 kesit → 16 bant; legacy 8 kesit → 3 bant (3+3+2). */
export const BAND_SECTIONS = 3;

export function bandCount(sectionCount) {
  return Math.ceil(sectionCount / BAND_SECTIONS);
}

export function bandOfSection(si) {
  return (si / BAND_SECTIONS) | 0;
}

/** Bandın kesit aralığı {s0, ns}. */
export function bandRange(b, sectionCount) {
  const s0 = b * BAND_SECTIONS;
  return { s0, ns: Math.min(BAND_SECTIONS, sectionCount - s0) };
}

/** Oyunda mesher'a verilen seçenekler. stairs:'fixed' → fizik çarpışmasıyla eşleşir (sözleşme eki). */
export const MESH_DEFAULTS = Object.freeze({
  stairs: 'fixed',
  ao: true,
  smoothLight: true,
  randomize: true,
  waterUnderside: true,
  nullNeighbor: 'replicate',
  mergeDark: true,
});

/** @returns {{seed:number, mode:string, base:string, bounds:object|null, decorate:Function|null}} */
export function makeGenContext(init) {
  const i = init || {};
  return {
    seed: i.seed === undefined ? 0 : i.seed,
    mode: i.mode === 'insa' || i.mode === 'harita' ? i.mode : 'macera',
    base: i.base || 'düz',
    bounds: i.bounds || null,
    decorate: typeof i.decorate === 'function' ? i.decorate : null,
    gen: typeof i.gen === 'string' ? i.gen : 'overworld',
    dim: typeof i.dim === 'string' && i.dim !== 'overworld' ? i.dim : undefined,
  };
}

/** Map<idx, id> (World._editsByChunk girdisi) → Uint32Array [idx<<8|id, …] | null. */
export function packEdits(map) {
  if (!map || map.size === 0) return null;
  const out = new Uint32Array(map.size);
  let n = 0;
  map.forEach((id, idx) => {
    out[n++] = ((idx << 8) | (id & 255)) >>> 0;
  });
  return out;
}

/**
 * Paketlenmiş düzenlemeleri chunk'ın ÜRETİLMİŞ kesitlerine yazar (onlySi verilirse yalnız o kesit). Yazılan sayıyı döner.
 * Üretilmemiş kesitlerin düzenlemeleri atlanır (kesit üretilince uygulanır).
 */
export function applyPackedToChunk(chunk, packed, onlySi) {
  if (!packed) return 0;
  let n = 0;
  for (let i = 0; i < packed.length; i++) {
    const v = packed[i];
    const idx = v >>> 8;
    const si = idx >> 12;
    if (si >= chunk.sectionCount || chunk.secGen[si] === 0) continue;
    if (onlySi !== undefined && si !== onlySi) continue;
    const id = v & 255;
    if (chunk.secBlocks[si] === null && chunk.secUniform[si] === id) continue;
    const arr = chunk.getSectionBlocksW(si);
    if (!chunk.legacy && (idx >> 8) + chunk.yMin <= BEDROCK_TOP_Y && arr[idx & 4095] === B.BEDROCK) continue; // taban ana kayası değişmez
    arr[idx & 4095] = id;
    n++;
  }
  return n;
}

/**
 * Chunk'ın yüzey bandını üretir (World#ensureChunk ile aynı sıra). Komşu dikişi YAPILMAZ.
 * @param {object} g makeGenContext sonucu
 * @param {number} openRings açık Mühür halkaları bit maskesi
 * @param {Uint32Array|null} packedEdits packEdits çıktısı
 * @param {Uint8Array|null} overlay harita modunda chunk blokları (32768) — üretilen tabanın üstüne yazılır
 */
export function generateChunkData(g, cx, cz, openRings, packedEdits, overlay) {
  const opts = {
    mode: g.mode,
    base: g.base,
    bounds: g.bounds || undefined,
    decorate: g.decorate || undefined,
    openRings: openRings | 0,
    light: false,
  };
  if (g.dim !== undefined) opts.dim = g.dim; // World._genOpts ile aynı (overworld'de alan yok → bayt-aynı)
  const c = getDimGen(g.gen || 'overworld').generateChunk(g.seed, cx, cz, opts);
  c.cx = cx;
  c.cz = cz;
  if (overlay && overlay.length === 32768 && c.legacy) c.loadDense(overlay, 0);
  if (packedEdits) {
    applyPackedToChunk(c, packedEdits);
    c.edited = true;
  }
  c.recomputeHeightMap();
  c.generated = true;
  computeChunkLight(c);
  return c;
}

/**
 * Derin kesitleri üretir (belirlenimci; World#ensureSection ile aynı sonuç). Düzenlemeler uygulanır. Işık ana thread'de
 * (lightNewSection) hesaplanır. list: [{si, b}] — b: Uint8Array(4096) (transfer edilir) | tek tip blok kimliği (sayı).
 */
export function generateSectionsData(g, cx, cz, sis, openRings, packedEdits) {
  const list = [];
  const transfer = [];
  const opts = {
    mode: g.mode, base: g.base, bounds: g.bounds || undefined, decorate: g.decorate || undefined, openRings: openRings | 0,
  };
  if (g.dim !== undefined) opts.dim = g.dim;
  const gen = getDimGen(g.gen || 'overworld');
  for (let k = 0; k < sis.length; k++) {
    const si = sis[k];
    const d = gen.generateSection(g.seed, cx, cz, si, opts);
    let blocks = d.blocks;
    let uniform = d.uniform;
    if (packedEdits) {
      for (let i = 0; i < packedEdits.length; i++) {
        const v = packedEdits[i];
        const idx = v >>> 8;
        if ((idx >> 12) !== si) continue;
        if (blocks === null) {
          blocks = new Uint8Array(4096);
          if (uniform !== 0) blocks.fill(uniform);
        }
        if (blocks[idx & 4095] === B.BEDROCK && WORLD_Y_MIN + si * 16 + ((idx >> 8) & 15) <= BEDROCK_TOP_Y) continue; // taban ana kayası değişmez
        blocks[idx & 4095] = v & 255;
      }
    }
    if (blocks) {
      list.push({ si, b: blocks });
      transfer.push(blocks.buffer);
    } else {
      list.push({ si, b: uniform });
    }
  }
  return { list, transfer };
}

/**
 * Chunk → işçiden ana thread'e aktarım nesnesi. data.secs düz dizi [si, b, l, ...] (b/l: Uint8Array | tek tip sayı);
 * transfer: devredilecek ArrayBuffer'lar (paylaşılan tek tip diziler HİÇBİR ZAMAN dahil edilmez).
 */
export function chunkToTransfer(c) {
  const secs = [];
  const transfer = [];
  for (let si = 0; si < c.sectionCount; si++) {
    if (c.secGen[si] === 0) continue;
    const b = c.secBlocks[si] !== null ? c.secBlocks[si] : c.secUniform[si];
    const l = c.secLight[si] !== null ? c.secLight[si] : c.secLightU[si];
    secs.push(si, b, l);
    if (typeof b !== 'number') transfer.push(b.buffer);
    if (typeof l !== 'number') transfer.push(l.buffer);
  }
  transfer.push(c.heightMap.buffer, c.biomeMap.buffer);
  return {
    data: {
      cx: c.cx, cz: c.cz, legacy: c.legacy, secs, heightMap: c.heightMap, biomeMap: c.biomeMap,
    },
    transfer,
  };
}

/**
 * Mesh işi için düz (klonlanabilir) sütun görünümü: kesit sA..sB (dahil, dünya aralığına kırpılır). Tipli diziler paylaşılır
 * (postMessage kopyalar). Üretilmemiş kesit null.
 */
export function chunkToWire(c, sA, sB) {
  const a = sA === undefined ? 0 : Math.max(0, sA);
  const b = sB === undefined ? c.sectionCount - 1 : Math.min(c.sectionCount - 1, sB);
  const sb = [];
  const sl = [];
  for (let si = a; si <= b; si++) {
    if (c.secGen[si] === 0) {
      sb.push(null);
      sl.push(null);
    } else {
      sb.push(c.secBlocks[si] !== null ? c.secBlocks[si] : c.secUniform[si]);
      sl.push(c.secLight[si] !== null ? c.secLight[si] : c.secLightU[si]);
    }
  }
  return {
    cx: c.cx, cz: c.cz, yMin: c.yMin, sectionCount: c.sectionCount, s0: a, sb, sl, biomeMap: c.biomeMap,
  };
}

/**
 * Chunk + komşular → mesh. center/nb: Chunk ya da chunkToWire nesnesi. nb anahtarları n,s,e,w,ne,nw,se,sw.
 * @param {Float32Array|object|Function} uvTable atlas UV tablosu (Float32Array önerilir)
 * @param {object} [opts] MESH_DEFAULTS üstüne yazılır
 * @param {number} [darkLod] mesh ayrıntı kademesi: 0 yakın; 1 = uzak chunk (karanlık yüz birleştirmede blok ışığı nicelenir, mesherDark.js);
 *   2 = çok uzak (1'e ek olarak küçük çapraz bitkiler atlanır, mesher `farFlora`)
 * @param {{s0:number, ns:number}} [band] meshlenecek kesit bandı (verilmezse y 0..127)
 */
export function meshFromWire(center, nb, uvTable, opts, darkLod, band) {
  let o = opts ? Object.assign({}, MESH_DEFAULTS, opts) : MESH_DEFAULTS;
  if (darkLod) o = Object.assign({}, o, { darkLod: 1, farFlora: darkLod >= 2 });
  if (band) o = Object.assign({}, o, { band });
  return meshChunk(center, nb || {}, uvTable, o);
}

export { Chunk };
