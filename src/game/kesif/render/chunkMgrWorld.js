/*
 * KEŞİF render — chunkManager'ın World'e dokunan küçük yardımcıları.
 *
 *   adoptChunk(world, data)   işçiden gelen hazır SÜTUN verisini (chunkMgrCore.chunkToTransfer çıktısı) World'e alır
 *                             (World#ensureChunk'ın "kur → ekle → ışık dikişi → komşuları kirlet → chunkLoad" adımlarının birebiri;
 *                             düzenleme kaydı OLUŞTURMAZ)
 *   adoptSections(world, cx, cz, list)  işçiden gelen derin kesitleri alır (World#adoptSection: düzenleme + ışık dikişi)
 *   openRingMask(world)       açık Mühür halkaları bit maskesi (World#_openMask ile aynı)
 *   makeRec(cx, cz)           sütun kaydı (yükleme durumu + oklüzyon)
 *   makeBandRec(col, b, sectionCount, yMin)   bant (mesh) kaydı: chunk sütununun 48 blokluk dikey dilimi
 *   byScoreAsc / byScoreDesc / nowMs
 */
import { Chunk, chunkId } from '../sim/chunk.js';
import { stitchChunk } from '../sim/lighting.js';
import { ZONE_COUNT } from '../sim/constants.js';
import { NB_DIRS } from './chunkMgrQueue.js';
import { bandRange } from './chunkMgrCore.js';

const NB_COUNT = NB_DIRS.length;

/** World#ensureChunk'ın yaptığı "chunk'ı dünyaya al" adımı — hazır veriyle (bkz. dosya başı). */
export function adoptChunk(world, data) {
  const cx = data.cx;
  const cz = data.cz;
  if (world.hasChunk(cx, cz)) return null;
  const c = new Chunk(cx, cz, { legacy: !!data.legacy, lazy: true });
  const secs = data.secs;
  for (let i = 0; i < secs.length; i += 3) {
    const si = secs[i];
    const b = secs[i + 1];
    const l = secs[i + 2];
    if (typeof b === 'number') {
      c.secBlocks[si] = null;
      c.secUniform[si] = b;
    } else {
      c.secBlocks[si] = b;
      c.secUniform[si] = 0;
    }
    c.secGen[si] = 1;
    if (typeof l === 'number') {
      c.secLight[si] = null;
      c.secLightU[si] = l;
    } else {
      c.secLight[si] = l;
      c.secLightU[si] = 0;
    }
  }
  c.heightMap = data.heightMap;
  c.biomeMap = data.biomeMap;
  c.generated = true;
  const id = chunkId(cx, cz);
  c.edited = !!(world._editsByChunk && world._editsByChunk.has(id));
  world.chunks.set(id, c);
  stitchChunk((x, z) => world.getChunk(x, z), c);
  c.markDirty();
  for (let i = 0; i < NB_COUNT; i++) {
    const n = world.getChunk(cx + NB_DIRS[i].dx, cz + NB_DIRS[i].dz);
    if (n) n.markDirty();
  }
  if (typeof world._emit === 'function') world._emit('chunkLoad', { type: 'chunkLoad', chunk: c });
  return c;
}

/** İşçiden gelen derin kesitler: World#adoptSection (bekleyen düzenlemeler + ışık). Alınan kesit sayısını döner. */
export function adoptSections(world, cx, cz, list) {
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    const ok = typeof it.b === 'number'
      ? world.adoptSection(cx, cz, it.si, null, it.b)
      : world.adoptSection(cx, cz, it.si, it.b, 0);
    if (ok) n++;
  }
  return n;
}

export function openRingMask(world) {
  let m = 0;
  for (let k = 1; k < ZONE_COUNT; k++) if (world.isZoneUnlocked(k)) m |= 1 << (k - 1);
  return m;
}

export function byScoreAsc(a, b) {
  return a.score - b.score;
}

export function byScoreDesc(a, b) {
  return b.score - a.score;
}

export function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** Sütun kaydı: yükleme + oklüzyon verisi. bands: bant kayıtları (tembel oluşur). */
export function makeRec(cx, cz) {
  return {
    cx,
    cz,
    id: chunkId(cx, cz),
    loaded: false,
    genInflight: false,
    secInflight: false,
    failed: 0,
    dist: 0,
    bands: null,
    hmMin: 0,
    hmMax: 0,
    hmVersion: -1,
    pending: 0, // pencerede mesh bekleyen bant sayısı (isReady için)
    planned: false,
    meshedAny: false,
    hasMesh: false,
    box: new Float64Array([cx * 16, 0, cz * 16, cx * 16 + 16, 128, cz * 16 + 16]), // yüzey bantlarının dünya kutusu (oklüzyon)
    score: 0,
    occ: null, // 4×4 hücre zemin yüksekliği (chunkOcclusion.js); chunk verisinden hesaplanır
    occVersion: -1,
    edited: false,
    occluded: false, // arazi ufku arkasında (chunkOcclusion) → çizilmez
  };
}

/** Bant (mesh) kaydı: sütunun b. dikey dilimi. */
export function makeBandRec(col, b, sectionCount, yMin) {
  const r = bandRange(b, sectionCount);
  const baseY = yMin + r.s0 * 16;
  const h = r.ns * 16;
  return {
    col,
    cx: col.cx,
    cz: col.cz,
    id: col.id * 64 + b,
    b,
    s0: r.s0,
    ns: r.ns,
    baseY,
    topY: baseY + h - 1,
    meshInflight: false,
    meshedVersion: -1,
    nbMask: -1,
    meshedLod: 0, // 0 yakın ayrıntı, 1 uzak, 2 çok uzak
    wantLod: 0,
    hasMesh: false,
    meshes: [null, null, null],
    tris: [0, 0, 0],
    sphere: { x: col.cx * 16 + 8, y: baseY + h / 2, z: col.cz * 16 + 8, r: 40 },
    box: new Float64Array([col.cx * 16, baseY, col.cz * 16, col.cx * 16 + 16, baseY + h, col.cz * 16 + 16]),
    visible: true,
    score: 0,
    dist: 0,
    wanted: false,
    interior: false,
    trivialStamp: -1,
    trivial: false,
  };
}

export function makeStats(viewDist) {
  return {
    drawCalls: 0,
    triangles: 0,
    chunksLoaded: 0,
    chunksMeshed: 0,
    chunksVisible: 0,
    chunksOccluded: 0,
    bandsMeshed: 0,
    sectionsLoaded: 0,
    genQueue: 0,
    meshQueue: 0,
    inflight: 0,
    workerMode: 'main',
    workers: 0,
    genMs: 0,
    meshMs: 0,
    secMs: 0,
    viewDist,
    sealDistance: Infinity,
    meshesBuilt: 0,
    chunksGenerated: 0,
    sectionsGenerated: 0,
  };
}
  