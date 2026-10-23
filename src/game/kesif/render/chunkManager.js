/*
 * KEŞİF render — ChunkManager: sütun/kesit yükleme-boşaltma, bant mesh kuyruğu, işçi/yedek yol, frustum culling, istatistik.
 *
 *   createChunkManager({THREE, scene, world, materials, atlas, quality?, useWorker:'auto'|true|false, onStats?,
 *                       meshOpts?, autoRemesh:true, releaseCpuData:true, planInterval:0.1,
 *                       pool?, workerCount?, hidden?}) → manager
 *       pool: devralınacak işçi havuzu (boyut geçişi; yeniden 'init' edilir), workerCount: kendi havuzunun işçi sayısı (prewarm: 1),
 *       hidden: mesh kökü gizli kurulur (arka planda ısınan varış boyutu)
 *
 *   manager.update(playerPos, camera, budgetMs = 4)   her kare (render'dan önce) çağrılır
 *   manager.requestRemesh(cx, cz, {priority:'high'|'normal'})   sütunun tüm bantları
 *   manager.remeshBlockChange(x, y, z)       düzenlenen bloğun bandı + (kenardaysa) komşu bantlar: aynı karede, anında mesh'lenir
 *   manager.setViewDist(n) / getViewDist()   chunk cinsinden (3..12)
 *   manager.setQuality(q)                    kademe anahtarı ya da quality.js ayar nesnesi {viewDist, maxUploads}
 *   manager.setAtlas(atlas)                  atlas boyu değişti: malzeme uniform'ları + UV tablosu yenilenir, hepsi yeniden mesh'lenir
 *   manager.setMeshOptions(opts)             {ao, smoothLight, …} → tümünü yeniden mesh'ler
 *   manager.setFogDistance(d)                sisin tam kapandığı mesafe (blok): daha uzaktaki bant çizilmez
 *   manager.setOcclusion(bool)               arazi ufku tıkaması (chunkOcclusion.js; tepe arkasındaki sütunlar çizilmez) — varsayılan açık
 *   manager.isReady(radius = 2) / getLoadProgress(radius)   yükleme ekranı için
 *   manager.getSealDistance()                oyuncunun görüş alanındaki üretilemeyen (mühürlü) chunk'a mesafe (blok) | Infinity
 *   manager.getVerticalWindow()              {lo, hi, keepLo, keepHi} mutlak y (mesh + bellek pencereleri)
 *   manager.getStats() / manager.getMeshes() / manager.rebuildMeshes() (bağlam geri gelince) / manager.dispose({keepPool?})
 *   manager.whenReady(radius) → Promise<void>       yarıçap (chunk) içindeki tüm üretilebilir sütunlar mesh'lenince çözülür (update içinde denetlenir)
 *   manager.readiness(radius) → {ready, progress}   eşzamanlı sorgu (geçiş makinesi her karede sorar)
 *   manager.setHidden(b) / manager.hidden           mesh kökünün görünürlüğü (prewarm)
 *   manager.adoptPool(pool) / manager.releasePool() işçi havuzu devri
 *   manager.epoch                                    bu yöneticinin işçi epoch'u (süreç genelinde benzersiz; bayat yanıt atılır)
 *
 * ── Derin dünya: dikey akış ───────────────────────────────────────────────────────────────────────────────────────
 * Bir chunk sütunu 16'lık kesitlerden, mesh bantları 48 blokluk (3 kesit) dilimlerden oluşur. Chunk yüklenince yüzey bandı (y ≥ 0)
 * hazırdır; y < 0 kesitleri tembeldir: oyuncunun dikey penceresine (gözün 72 altı … 168 üstü) giren bantlar için gereken derin kesitler
 * işçiye (gensec) ya da ana thread'e üretttirilir; pencereden uzaklaşan kesitler bırakılır (düzenlemeler World'de kalır). Yalnız boş
 * olmayan, tamamen gömülü olmayan bantlar mesh'lenir; gömülü (yer altı) bantlar yer üstündeyken yalnız yakın çevrede (mağara ağızları),
 * yer altındayken DEEP_VIEW_CHUNKS yarıçapında çizilir. Yüzey bandı (yer üstündeyken tüm sütun yüksekliği aralığı) hep penceredir
 * (dağ zirveleri kesilmez).
 *
 * ── World ile bütünleşme ──────────────────────────────────────────────────────────────────────────────────────────
 * Sim verisinin TEK kaynağı ana thread'deki World'dür. İşçi (worker.js) yalnız hesaplar: sütun üretimi+ışık, derin kesit üretimi ve mesh.
 * İşçiden gelen sütun/kesitler `adoptChunk` / `adoptSections` ile World'e alınır (ensureChunk/ensureSection ile birebir aynı işlem,
 * düzenleme kaydı oluşmaz). Yedek yol (işçi yok/ölü) doğrudan World#ensureChunk/ensureSection kullanır. Özel `worldgen` verilmiş
 * World'lerde işçi kullanılmaz.
 *
 * Yükleme düzeni: veri yarıçapı = görüş+2, mesh yarıçapı = görüş: bir bant, 8 komşu sütununun verisi (ya da üretilemez olduğu) belli
 * olunca mesh'lenir. Komşu sonradan gelir/gider ya da bant sürümü değişirse bant yeniden mesh'lenir.
 */
import { chunkId } from '../sim/chunk.js';
import { pickHiddenBands } from './chunkMgrWarm.js';
import { generateChunk } from '../sim/worldgen.js';
import { QUALITY, VIEW_DIST_MAX, VIEW_DIST_MIN } from './quality.js';
import {
  NB_DIRS, chunkPriority, ema, spiralOffsets,
} from './chunkMgrQueue.js';
import {
  MESH_DEFAULTS, bandCount, chunkToWire, meshFromWire, packEdits,
} from './chunkMgrCore.js';
import { createWorkerPool, nextJobSeq, workersSupported } from './chunkMgrWorkers.js';
import { getDimGen } from '../sim/dim/genRegistry.js';
import { createMeshStore } from './chunkMgrMeshes.js';
import { computeOccCells } from './chunkOcclusion.js';
import { createCuller } from './chunkMgrCull.js';
import {
  anyBandInflight, bandStamp, neighborMask, planColumn, updateColBox,
} from './chunkMgrPlan.js';
import {
  adoptChunk, adoptSections, openRingMask, makeRec, makeBandRec, byScoreAsc, nowMs, makeStats,
} from './chunkMgrWorld.js';
import {
  DEEP_VIEW_CHUNKS, INTERIOR_NEAR_CHUNKS, WINDOW_SLACK, affectedBandsOfCell, columnSurfaceRange,
  verticalWindow,
} from './chunkMgrBands.js';
import { SURFACE_BAND_MIN_Y } from '../sim/constants.js';

const PLAN_INTERVAL_S = 0.1;
const MAX_URGENT_PER_FRAME = 8;
const NB_COUNT = NB_DIRS.length;
/** Planlama başına en çok bırakılan derin kesit ve yeniden hesaplanan oklüzyon sütunu. */
const MAX_UNLOAD_PER_PLAN = 96;
const MAX_OCC_PER_PLAN = 32;
/** Karede ana thread'e alınan işçi kesiti (ışık dikişi ana thread'de) ve bütçe (ms). */
const MAX_ADOPT_PER_FRAME = 24;
const ADOPT_BUDGET_MS = 3;
/** Tek gensec işinde en çok kesit. */
const SEC_BATCH = 8;

let EPOCH_SEQ = 0;

export function createChunkManager(opts) {
  const o = opts || {};
  const { THREE, scene, world, materials } = o;
  if (!THREE || !scene || !world || !materials) throw new TypeError('createChunkManager: THREE, scene, world, materials gerekli');
  const atlas = o.atlas || null;
  const store = createMeshStore(THREE, { materials, releaseCpuData: o.releaseCpuData !== false });
  const epoch = ++EPOCH_SEQ;
  store.root.visible = o.hidden !== true;
  scene.add(store.root);
  // şehir boyutu: mesher city seçeneği (aCity: neon boyası, ıslak yol, pencere grubu); ana diyar seçenekleri değişmez
  const cityMesh = !!(world.dimDef && world.dim !== 'overworld' && world.dimDef.gen === 'city');

  const q0 = typeof o.quality === 'string' ? QUALITY[o.quality] : o.quality;
  let viewDist = Math.max(VIEW_DIST_MIN, Math.min(VIEW_DIST_MAX, Math.round((q0 && q0.viewDist) || 7)));
  let maxUploads = (q0 && q0.maxUploads) || 4;
  const workerCount = o.workerCount > 0 ? o.workerCount | 0 : (q0 && q0.workers) || 2;
  let uvTable = atlas && atlas.uvTable ? atlas.uvTable : null;
  let meshOpts = o.meshOpts || cityMesh ? Object.assign({}, MESH_DEFAULTS, o.meshOpts || {}, cityMesh ? { city: true } : {}) : null;
  const autoRemesh = o.autoRemesh !== false;
  const planInterval = o.planInterval >= 0 ? o.planInterval : PLAN_INTERVAL_S;
  const deepSections = world.legacy ? 0 : (SURFACE_BAND_MIN_Y - world.yMin) >> 4; // si < deepSections ⇒ tembel derin kesit

  const recs = new Map(); // sütun kayıtları
  const jobs = new Map();
  const waiters = []; // whenReady bekleyenleri {r, resolve, reject}
  let genList = [];
  let meshList = [];
  let secList = [];
  let genIdx = 0;
  let meshIdx = 0;
  let secIdx = 0;
  const arrived = []; // işçiden gelen mesh sonuçları (yükleme sınırı için sıraya girer)
  const arrivedSecs = []; // işçiden gelen derin kesitler (ışık dikişi ana thread'de, bütçeli)
  const urgent = new Set(); // bant kayıtları
  let planDirty = true;
  let planTimer = 0;
  let sealDist = Infinity;
  let pcx = 0;
  let pcz = 0;
  let px = 0;
  let py = 64;
  let pz = 0;
  let fx = 0;
  let fz = -1;
  let lastPlanCx = 1e9;
  let lastPlanCz = 1e9;
  let lastPlanSy = 1e9;
  let turn = 0;
  let cooldown = 0;
  let statsTimer = 0;
  let lastT = 0;
  let disposed = false;
  let win = verticalWindow(py);
  const createdAt = nowMs();
  const range = { min: 0, max: 0 };

  const stats = makeStats(viewDist);
  const P = {
    world, store, cityMesh, culler: null, deepSections, win: null, fx: 0, fz: 0, py: 0, meshList: null, secList: null, unloadBudget: 0, sectionCount: 0,
  };
  const culler = createCuller({
    recs, store, stats, occlusion: o.occlusion !== false, getViewDist: () => viewDist, meshesBuilt: () => stats.meshesBuilt,
  });
  P.culler = culler;

  /* ------------------------------------------------------------------------------------------------
   * İşçi havuzu (varsa)
   * ---------------------------------------------------------------------------------------------- */
  let pool = null;
  let poolFailed = false;
  // işçi yolu yalnız boyutun KAYITLI üreticisiyle çalışır (overworld: worldgen.generateChunk, şehir: genRegistry 'city'); özel worldgen → ana thread
  const stdGen = world.dim === 'overworld' || !world.dimDef ? generateChunk : getDimGen(world.dimDef.gen).generateChunk;
  const customGen = world._worldgen && world._worldgen !== stdGen;
  const wantWorker = o.useWorker !== false && workersSupported() && !customGen;

  function freeJob(j) {
    if (j.type === 0) j.rec.genInflight = false;
    else if (j.type === 1) j.band.meshInflight = false;
    else j.rec.secInflight = false;
  }

  function failPool(why) {
    if (poolFailed) return;
    poolFailed = true;
    if (typeof console !== 'undefined' && console.warn) console.warn('[kesif] chunk işçileri bırakıldı, ana thread yoluna geçildi:', why);
    if (pool) pool.dispose();
    pool = null;
    jobs.forEach(freeJob); // uçuştaki işler yeniden istenir
    jobs.clear();
    planDirty = true;
  }

  function initMsg() {
    return {
      t: 'init',
      ep: epoch,
      seed: world.seed,
      mode: world.mode,
      base: world.base,
      bounds: world.bounds || null,
      decorate: !!world.decorate,
      uvTable,
      meshOpts,
      gen: world.dimDef && world.dim !== 'overworld' ? world.dimDef.gen : 'overworld',
      dim: world.dim !== 'overworld' ? world.dim : undefined,
    };
  }

  const poolHandlers = {
    onReady(decorateOk) {
      if (disposed) return;
      if (world.decorate && !decorateOk) failPool('işçi yapı kancasını yükleyemedi (dünya aynı kalsın diye ana thread kullanılacak)');
      planDirty = true;
    },
    onMessage: handleWorkerMessage,
    onLost(ids, allDead) {
      for (let i = 0; i < ids.length; i++) {
        const j = jobs.get(ids[i]);
        if (!j) continue;
        jobs.delete(ids[i]);
        freeJob(j);
      }
      if (allDead) failPool('tüm işçiler durdu');
      planDirty = true;
    },
  };

  if (wantWorker && uvTable) {
    try {
      if (o.pool) {
        // devralınan havuz: işleyiciler bu yöneticiye bağlanır ve işçilere bu dünyanın init'i (yeni epoch) gönderilir
        pool = o.pool;
        pool.attach(poolHandlers);
        pool.reinit(initMsg());
      } else {
        pool = createWorkerPool({
          count: workerCount,
          perWorker: 3,
          init: initMsg(),
          onReady: poolHandlers.onReady,
          onMessage: poolHandlers.onMessage,
          onLost: poolHandlers.onLost,
        });
      }
    } catch {
      pool = null;
      poolFailed = true;
    }
  }

  function usingWorkers() {
    return pool !== null && pool.ready && !poolFailed;
  }

  function workerPending() {
    return pool !== null && !pool.ready && !poolFailed && nowMs() - createdAt < 8000;
  }

  /* ------------------------------------------------------------------------------------------------
   * Yardımcılar
   * ---------------------------------------------------------------------------------------------- */
  function gatherNeighbors(rec, out) {
    for (let i = 0; i < NB_COUNT; i++) {
      out[NB_DIRS[i].key] = world.getChunk(rec.cx + NB_DIRS[i].dx, rec.cz + NB_DIRS[i].dz);
    }
    return out;
  }

  function wireNeighbors(rec, sA, sB) {
    const nb = {};
    for (let i = 0; i < NB_COUNT; i++) {
      const c = world.getChunk(rec.cx + NB_DIRS[i].dx, rec.cz + NB_DIRS[i].dz);
      nb[NB_DIRS[i].key] = c ? chunkToWire(c, sA, sB) : null;
    }
    return nb;
  }

  function clearBands(rec) {
    if (!rec.bands) return;
    for (let i = 0; i < rec.bands.length; i++) {
      const b = rec.bands[i];
      if (!b) continue;
      store.clear(b);
      urgent.delete(b);
      b.meshedVersion = -1;
      b.nbMask = -1;
    }
    rec.hasMesh = false;
    culler.dirtyBands();
  }

  function disposeRec(rec, unload) {
    clearBands(rec);
    rec.bands = null;
    recs.delete(rec.id);
    culler.dirtyRecs();
    culler.dirtyBands();
    if (unload && world.hasChunk(rec.cx, rec.cz)) world.unloadChunk(rec.cx, rec.cz);
  }

  /** Bant kaydı (yoksa oluşturur). Sütun yüklü olmalı. */
  function getBand(rec, b) {
    if (!rec.bands) {
      const ch = world.getChunk(rec.cx, rec.cz);
      if (!ch) return null;
      rec.bands = new Array(bandCount(ch.sectionCount)).fill(null);
    }
    let band = rec.bands[b];
    if (!band) {
      band = makeBandRec(rec, b, world.sectionCount, world.yMin);
      rec.bands[b] = band;
      culler.dirtyBands();
    }
    return band;
  }

  /* ------------------------------------------------------------------------------------------------
   * Mesh uygulama
   * ---------------------------------------------------------------------------------------------- */
  function installMesh(band, mesh, stamp, mask, lod) {
    store.apply(band, mesh);
    band.meshedVersion = stamp;
    band.nbMask = mask;
    band.meshedLod = lod | 0;
    stats.meshesBuilt++;
    updateColBox(band.col);
  }

  /** Ana thread'de eşzamanlı mesh (anında düzenleme + yedek yol). */
  function meshNow(band) {
    const rec = band.col;
    const ch = world.getChunk(rec.cx, rec.cz);
    if (!ch) return false;
    const t0 = nowMs();
    const nb = gatherNeighbors(rec, {});
    const lod = band.wantLod | 0;
    const stamp = bandStamp(ch, band);
    const mesh = meshFromWire(ch, nb, uvTable || (atlas && atlas.uvTable) || null, meshOpts, lod, { s0: band.s0, ns: band.ns });
    installMesh(band, mesh, stamp, neighborMask(world, rec), lod);
    stats.meshMs = ema(stats.meshMs, nowMs() - t0);
    return true;
  }

  function flushUrgent() {
    if (urgent.size === 0) return;
    let n = 0;
    const done = [];
    urgent.forEach((band) => {
      if (n >= MAX_URGENT_PER_FRAME) return;
      done.push(band);
      if (!band.col.loaded || recs.get(band.col.id) !== band.col) return;
      n++;
      meshNow(band);
    });
    for (let i = 0; i < done.length; i++) urgent.delete(done[i]);
  }

  /* ------------------------------------------------------------------------------------------------
   * İşçi mesajları
   * ---------------------------------------------------------------------------------------------- */
  function handleWorkerMessage(m) {
    if (disposed) return;
    if (m.ep !== undefined && m.ep !== epoch) return; // başka boyuttan/epoch'tan kalan bayat sonuç (devredilen havuz)
    if (m.t === 'chunk') {
      const j = jobs.get(m.id);
      if (!j) return;
      jobs.delete(m.id);
      const rec = j.rec;
      rec.genInflight = false;
      if (recs.get(rec.id) !== rec) return;
      stats.genMs = ema(stats.genMs, m.ms || 0);
      stats.chunksGenerated++;
      if (!world.hasChunk(rec.cx, rec.cz)) adoptChunk(world, m.data);
      rec.loaded = true;
      planDirty = true;
    } else if (m.t === 'sections') {
      const j = jobs.get(m.id);
      if (!j) return;
      jobs.delete(m.id);
      j.rec.secInflight = false;
      if (recs.get(j.rec.id) !== j.rec) return;
      stats.secMs = ema(stats.secMs, (m.ms || 0) / Math.max(1, m.list.length));
      arrivedSecs.push({ rec: j.rec, list: m.list });
    } else if (m.t === 'meshed') {
      const j = jobs.get(m.id);
      if (!j) return;
      jobs.delete(m.id);
      j.band.meshInflight = false;
      if (recs.get(j.band.col.id) !== j.band.col) return;
      stats.meshMs = ema(stats.meshMs, m.ms || 0);
      arrived.push({
        band: j.band, mesh: m.mesh, stamp: m.version, mask: j.mask, lod: j.lod,
      });
    } else if (m.t === 'error') {
      const j = jobs.get(m.id);
      if (j) {
        jobs.delete(m.id);
        freeJob(j);
        if (j.type === 0 || j.type === 2) j.rec.failed++;
        planDirty = true;
      }
      if (typeof console !== 'undefined' && console.warn) console.warn('[kesif] chunk işçisi hatası:', m.message);
    }
  }

  // kare başına yükleme tavanı İKİ integrateArrived çağrısı arasında paylaşılır (eskiden çağrı başına: kare başına 2× tepe → p99 sıçraması);
  // birikim büyükse (>3× tavan: ilk dolum/ışınlanma) tavan iki katına çıkar. perf_tuner (Faz 5)
  let uploadsFrame = 0;
  function integrateArrived() {
    let n = uploadsFrame;
    const cap = arrived.length > maxUploads * 3 ? maxUploads * 2 : maxUploads;
    while (arrived.length > 0 && n < cap) {
      const a = arrived.shift();
      const band = a.band;
      if (recs.get(band.col.id) !== band.col || !band.col.loaded || !band.wanted) continue;
      if (a.stamp < band.meshedVersion) continue; // anında mesh daha yeni
      installMesh(band, a.mesh, a.stamp, a.mask, a.lod);
      n++;
    }
    uploadsFrame = n;
  }

  function integrateSections() {
    if (arrivedSecs.length === 0) return;
    const t0 = nowMs();
    let n = 0;
    while (arrivedSecs.length > 0 && n < MAX_ADOPT_PER_FRAME && nowMs() - t0 < ADOPT_BUDGET_MS) {
      const a = arrivedSecs[0];
      if (recs.get(a.rec.id) !== a.rec || !world.hasChunk(a.rec.cx, a.rec.cz)) {
        arrivedSecs.shift();
        continue;
      }
      // kesitleri tek tek al (bütçe kesitte biter): list'ten çıkar
      const it = a.list.shift();
      if (it) {
        if (adoptSections(world, a.rec.cx, a.rec.cz, [it]) > 0) stats.sectionsGenerated++;
        n++;
      }
      if (a.list.length === 0) arrivedSecs.shift();
    }
    planDirty = true;
  }

  /* ------------------------------------------------------------------------------------------------
   * Planlama: hangi sütun/bant/kesit istenecek / mesh'lenecek / atılacak
   * ---------------------------------------------------------------------------------------------- */
  let occBudget = MAX_OCC_PER_PLAN;

  function plan() {
    const V = viewDist;
    const loadR = V + 2;
    const loadLim = (V + 2.0) * (V + 2.0); // mesh adaylarının (≤V+0.5) tüm komşuları (+√2) bu diskin içindedir
    const meshR = V + 0.5;
    const keepR = V + 3.5;
    if (typeof world._syncZones === 'function') world._syncZones();
    const sp = spiralOffsets(loadR);
    const cxf = px / 16;
    const czf = pz / 16;
    genList = [];
    meshList = [];
    secList = [];
    genIdx = 0;
    meshIdx = 0;
    secIdx = 0;
    occBudget = MAX_OCC_PER_PLAN;
    P.unloadBudget = MAX_UNLOAD_PER_PLAN;
    P.sectionCount = 0;
    let seal = Infinity;
    win = verticalWindow(py);
    const here = world.getChunk(pcx, pcz);
    let aboveGround = true;
    if (here) aboveGround = py >= here.heightMap[((Math.floor(pz) & 15) << 4) + (Math.floor(px) & 15)] - 24;

    for (let i = 0; i < sp.count; i++) {
      const cx = pcx + sp.dx[i];
      const cz = pcz + sp.dz[i];
      const id = chunkId(cx, cz);
      let rec = recs.get(id);
      const rx = cx + 0.5 - cxf;
      const rz = cz + 0.5 - czf;
      if (!rec) {
        if (rx * rx + rz * rz > loadLim) continue;
        if (world.hasChunk(cx, cz)) {
          rec = makeRec(cx, cz);
          rec.loaded = true;
          recs.set(id, rec);
          culler.dirtyRecs();
        } else if (world.canGenerate(cx, cz)) {
          rec = makeRec(cx, cz);
          recs.set(id, rec);
          culler.dirtyRecs();
        } else {
          const d = Math.sqrt(rx * rx + rz * rz) * 16 - 8;
          if (d < seal) seal = d;
          continue;
        }
      }
      if (!rec.loaded) {
        if (world.hasChunk(cx, cz)) rec.loaded = true;
        else if (!rec.genInflight && rec.failed < 3) {
          if (world.canGenerate(cx, cz)) {
            rec.score = chunkPriority(rx, rz, fx, fz);
            genList.push(rec);
          } else {
            const d = Math.sqrt(rx * rx + rz * rz) * 16 - 8;
            if (d < seal) seal = d;
          }
        }
      }
    }
    sealDist = seal;

    recs.forEach((rec) => {
      const rx = rec.cx + 0.5 - cxf;
      const rz = rec.cz + 0.5 - czf;
      const d = Math.sqrt(rx * rx + rz * rz);
      rec.dist = d;
      if (d > keepR) {
        if (!rec.genInflight && !rec.secInflight && !anyBandInflight(rec)) disposeRec(rec, true);
        return;
      }
      if (!rec.loaded) return;
      const ch = world.getChunk(rec.cx, rec.cz);
      if (!ch) {
        rec.loaded = false;
        clearBands(rec);
        rec.occ = null;
        rec.occVersion = -1;
        rec.planned = false;
        return;
      }
      if (rec.occVersion !== ch.version && (occBudget > 0 || rec.occ === null)) {
        // arazi ufku tıkaması için hücre zemin yükseklikleri (yalnız sürüm değişince; 256 sütun tarama)
        occBudget--;
        rec.occ = computeOccCells(ch, ch.heightMap, rec.occ);
        rec.occVersion = ch.version;
        rec.edited = !!ch.edited;
        columnSurfaceRange(ch, range);
        rec.hmMin = range.min;
        rec.hmMax = range.max;
      }
      P.win = win;
      P.fx = fx;
      P.fz = fz;
      P.py = py;
      P.meshList = meshList;
      P.secList = secList;
      planColumn(P, rec, ch, d, rx, rz, meshR, aboveGround);
    });
    stats.sectionsLoaded = P.sectionCount;
    genList.sort(byScoreAsc);
    meshList.sort(byScoreAsc);
    secList.sort(byScoreAsc);
    lastPlanCx = pcx;
    lastPlanCz = pcz;
    lastPlanSy = py;
    planDirty = false;
    planTimer = 0;
  }

  /* ------------------------------------------------------------------------------------------------
   * Gönderim: işçiye iş ver / yedek yolda çalıştır
   * ---------------------------------------------------------------------------------------------- */
  function dispatchGen(rec) {
    const id = nextJobSeq();
    const cid = rec.id;
    const editsMap = world._editsByChunk ? world._editsByChunk.get(cid) : null;
    const edits = packEdits(editsMap);
    let overlay = null;
    if (world._mapChunks && !(world.frame && !world.inBounds(rec.cx, rec.cz))) {
      const mb = world._mapChunks.get(rec.cx + ',' + rec.cz);
      if (mb && mb.length === 32768) overlay = mb;
    }
    const msg = {
      t: 'gen', id, ep: epoch, cx: rec.cx, cz: rec.cz, openRings: openRingMask(world), edits, overlay,
    };
    if (!pool.post(msg, edits ? [edits.buffer] : [])) return false;
    rec.genInflight = true;
    jobs.set(id, { type: 0, rec });
    return true;
  }

  function dispatchSec(item) {
    const rec = item.rec;
    const id = nextJobSeq();
    const sis = item.sis.length > SEC_BATCH ? item.sis.slice(0, SEC_BATCH) : item.sis;
    const editsMap = world._editsByChunk ? world._editsByChunk.get(rec.id) : null;
    const edits = packEdits(editsMap);
    const msg = {
      t: 'gensec', id, ep: epoch, cx: rec.cx, cz: rec.cz, sis, openRings: openRingMask(world), edits,
    };
    if (!pool.post(msg, edits ? [edits.buffer] : [])) return false;
    rec.secInflight = true;
    jobs.set(id, { type: 2, rec });
    return true;
  }

  function dispatchMesh(band) {
    const rec = band.col;
    const ch = world.getChunk(rec.cx, rec.cz);
    if (!ch) return true;
    const id = nextJobSeq();
    const mask = neighborMask(world, rec);
    const sA = Math.max(0, band.s0 - 1);
    const sB = Math.min(ch.sectionCount - 1, band.s0 + band.ns);
    const msg = {
      t: 'mesh',
      id,
      ep: epoch,
      cx: rec.cx,
      cz: rec.cz,
      band: { s0: band.s0, ns: band.ns },
      version: bandStamp(ch, band),
      lod: band.wantLod | 0,
      center: chunkToWire(ch, sA, sB),
      nb: wireNeighbors(rec, sA, sB),
    };
    if (!pool.post(msg)) return false;
    band.meshInflight = true;
    jobs.set(id, {
      type: 1, band, mask, lod: band.wantLod | 0,
    });
    return true;
  }

  /** İş türü seçimi (mesh / sütun / kesit): sırayla, boş olanı atla. 0 mesh, 1 gen, 2 sec, -1 yok. */
  function pickKind() {
    const haveMesh = meshIdx < meshList.length;
    const haveGen = genIdx < genList.length;
    const haveSec = secIdx < secList.length;
    if (!haveMesh && !haveGen && !haveSec) return -1;
    for (let t = 0; t < 3; t++) {
      const k = (turn + t) % 3;
      if ((k === 0 && haveMesh) || (k === 1 && haveGen) || (k === 2 && haveSec)) {
        turn = k + 1;
        return k;
      }
    }
    return -1;
  }

  function dispatchToWorkers() {
    let guard = 64;
    while (guard-- > 0 && pool.freeSlots() > 0) {
      const k = pickKind();
      if (k < 0) break;
      if (k === 0) {
        const band = meshList[meshIdx++];
        if (band.meshInflight || !band.col.loaded) continue;
        if (!dispatchMesh(band)) break;
      } else if (k === 1) {
        const rec = genList[genIdx++];
        if (rec.loaded || rec.genInflight) continue;
        if (world.hasChunk(rec.cx, rec.cz)) {
          rec.loaded = true;
          planDirty = true;
          continue;
        }
        if (!dispatchGen(rec)) break;
      } else {
        const item = secList[secIdx++];
        if (item.rec.secInflight || !item.rec.loaded) continue;
        if (!dispatchSec(item)) break;
      }
    }
  }

  /** Yedek yol: kare başına ≤ bütçe, her iş türü aynı fonksiyonlar. En az bir iş/kare (pahalıysa dinlendirmeli). */
  function runLocal(budgetMs, deadlineStart) {
    if (cooldown > 0) {
      cooldown--;
      return;
    }
    const pending = workerPending();
    let done = 0;
    for (let guard = 0; guard < 32; guard++) {
      const t = nowMs();
      if (done > 0 && t - deadlineStart >= budgetMs) break;
      const k = pickKind();
      if (k < 0) break;
      const t1 = nowMs();
      if (k === 0) {
        const band = meshList[meshIdx++];
        if (!band.col.loaded || band.meshInflight) continue;
        if (pending && band.col.dist > 1.6) continue;
        meshNow(band);
      } else if (k === 1) {
        const rec = genList[genIdx++];
        if (rec.loaded || rec.genInflight) continue;
        if (pending && rec.dist > 1.6) continue;
        const c = world.ensureChunk(rec.cx, rec.cz);
        if (!c) {
          rec.failed++;
          continue;
        }
        rec.loaded = true;
        planDirty = true;
        stats.chunksGenerated++;
        stats.genMs = ema(stats.genMs, nowMs() - t1);
      } else {
        const item = secList[secIdx++];
        if (!item.rec.loaded || item.rec.secInflight) continue;
        if (pending && item.rec.dist > 1.6) continue;
        let made = 0;
        for (let i = 0; i < item.sis.length && i < SEC_BATCH; i++) {
          if (world.ensureSection(item.rec.cx, item.rec.cz, item.sis[i])) {
            made++;
            stats.sectionsGenerated++;
          }
        }
        if (made > 0) {
          planDirty = true;
          stats.secMs = ema(stats.secMs, (nowMs() - t1) / made);
        }
      }
      done++;
      const cost = nowMs() - t1;
      if (cost > budgetMs * 2.5) {
        cooldown = Math.min(6, Math.round(cost / budgetMs / 2) - 1);
        break;
      }
    }
  }

  /* ------------------------------------------------------------------------------------------------
   * Kare güncellemesi
   * ---------------------------------------------------------------------------------------------- */
  function update(playerPos, camera, budgetMs) {
    if (disposed) return;
    const t0 = nowMs();
    const dt = lastT > 0 ? Math.min(0.25, Math.max(0, (t0 - lastT) / 1000)) : 1 / 60;
    lastT = t0;
    const budget = budgetMs > 0 ? budgetMs : 4;
    const p = playerPos || { x: 0, y: 64, z: 0 };
    px = p.x;
    py = Number.isFinite(p.y) ? p.y : 64;
    pz = p.z;
    pcx = Math.floor(px / 16);
    pcz = Math.floor(pz / 16);
    if (camera) {
      // bakış yönü (xz) — kamera −Z'ye bakar: matrixWorld üçüncü sütunun negatifi
      const e = camera.matrixWorld.elements;
      const lx = -e[8];
      const lz = -e[10];
      const l = Math.sqrt(lx * lx + lz * lz);
      if (l > 1e-4) {
        fx = lx / l;
        fz = lz / l;
      }
    }
    uploadsFrame = 0;
    flushUrgent();
    integrateArrived();
    integrateSections();
    planTimer += dt;
    culler.tick(dt);
    // dikey hareket (≥ 6 blok) de planı tetikler (pencere kayar)
    if (planDirty || pcx !== lastPlanCx || pcz !== lastPlanCz || Math.abs(py - lastPlanSy) >= 6 || planTimer >= planInterval) plan();
    if (usingWorkers()) dispatchToWorkers();
    else runLocal(budget, t0);
    integrateArrived();
    if (camera) culler.cull(camera);

    stats.viewDist = viewDist;
    stats.genQueue = Math.max(0, genList.length - genIdx) + Math.max(0, secList.length - secIdx);
    stats.meshQueue = Math.max(0, meshList.length - meshIdx) + arrived.length;
    stats.inflight = jobs.size;
    stats.workerMode = usingWorkers() ? 'worker' : 'main';
    stats.workers = pool ? pool.alive : 0;
    stats.sealDistance = sealDist;
    if (waiters.length > 0) settleWaiters();
    if (typeof o.onStats === 'function') {
      statsTimer += dt;
      if (statsTimer >= 0.5) {
        statsTimer = 0;
        o.onStats(stats);
      }
    }
  }

  function progressOf(radius) {
    const r = Math.min(radius === undefined ? 2 : Math.max(0, Math.floor(radius)), viewDist);
    const sp = spiralOffsets(r + 1);
    const cxf = px / 16;
    const czf = pz / 16;
    const lim = r + 0.5;
    let total = 0;
    let ok = 0;
    for (let i = 0; i < sp.count; i++) {
      const cx = pcx + sp.dx[i];
      const cz = pcz + sp.dz[i];
      const rx = cx + 0.5 - cxf;
      const rz = cz + 0.5 - czf;
      if (rx * rx + rz * rz > lim * lim) continue;
      if (!world.hasChunk(cx, cz) && !world.canGenerate(cx, cz)) continue;
      total++;
      const rec = recs.get(chunkId(cx, cz));
      if (rec && rec.loaded && rec.planned && rec.pending === 0) ok++;
    }
    return total === 0 ? 1 : ok / total;
  }

  function settleWaiters() {
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (progressOf(waiters[i].r) >= 1) {
        const w = waiters[i];
        waiters.splice(i, 1);
        w.resolve();
      }
    }
  }

  /* ------------------------------------------------------------------------------------------------
   * Dünya olayları
   * ---------------------------------------------------------------------------------------------- */
  const unsubs = [];
  if (typeof world.on === 'function') {
    if (autoRemesh) unsubs.push(world.on('blockChange', (e) => remeshBlockChange(e.x, e.y, e.z)));
    unsubs.push(world.on('zoneUnlock', () => { planDirty = true; }));
    unsubs.push(world.on('sealOpen', () => { planDirty = true; }));
    unsubs.push(world.on('chunkLoad', () => { planDirty = true; }));
    unsubs.push(world.on('sectionLoad', () => { planDirty = true; }));
    unsubs.push(world.on('chunkUnload', (e) => {
      const rec = recs.get(chunkId(e.cx, e.cz));
      if (rec && !rec.genInflight && !rec.secInflight && !anyBandInflight(rec)) disposeRec(rec, false);
      planDirty = true;
    }));
  }

  function remeshBlockChange(x, y, z) {
    const list = affectedBandsOfCell(world, x, y, z);
    for (let i = 0; i < list.length; i++) {
      const rec = recs.get(chunkId(list[i][0], list[i][1]));
      if (!rec || !rec.loaded) continue;
      const band = getBand(rec, list[i][2]);
      if (band && (band.hasMesh || band.wanted || band.meshedVersion >= 0)) {
        band.wanted = true;
        urgent.add(band);
      }
    }
  }

  /* ------------------------------------------------------------------------------------------------
   * Dışa açık API
   * ---------------------------------------------------------------------------------------------- */
  function invalidateAll() {
    recs.forEach((rec) => {
      if (!rec.bands) return;
      for (let i = 0; i < rec.bands.length; i++) {
        if (rec.bands[i]) {
          rec.bands[i].meshedVersion = -1;
          rec.bands[i].nbMask = -1;
        }
      }
    });
    planDirty = true;
  }

  return {
    update,

    requestRemesh(cx, cz, ropts) {
      const rec = recs.get(chunkId(cx, cz));
      if (!rec || !rec.loaded || !rec.bands) return false;
      for (let i = 0; i < rec.bands.length; i++) {
        const b = rec.bands[i];
        if (!b) continue;
        b.meshedVersion = -1;
        if (ropts && ropts.priority === 'high' && b.hasMesh) urgent.add(b);
      }
      planDirty = true;
      return true;
    },

    remeshBlockChange,

    setViewDist(n) {
      const v = Math.max(VIEW_DIST_MIN, Math.min(VIEW_DIST_MAX, Math.round(n)));
      if (v === viewDist) return viewDist;
      viewDist = v;
      planDirty = true;
      return viewDist;
    },

    getViewDist() {
      return viewDist;
    },

    /** Kalite anahtarı ('low'|'medium'|'high') ya da quality.js ayar nesnesi. */
    setQuality(q) {
      const s = typeof q === 'string' ? QUALITY[q] : q;
      if (!s) return;
      if (Number.isFinite(s.viewDist)) this.setViewDist(s.viewDist);
      if (Number.isFinite(s.maxUploads)) maxUploads = Math.max(1, s.maxUploads | 0);
    },

    setAtlas(a) {
      if (!a || !a.uvTable) return;
      uvTable = a.uvTable;
      const u = materials.uniforms;
      if (u && a.map) {
        // malzemeler yeni atlas dokularını/boyutlarını kullansın (createChunkMaterials'ın yaptığıyla aynı)
        u.uMap.value = a.map;
        u.uNormalMap.value = a.normalMap;
        u.uMaterialMap.value = a.materialMap;
        u.uAtlasSize.value.set(a.width, a.height);
        u.uCellSize.value.set(a.cell, a.cell);
        u.uPad.value = a.pad;
        u.uTile.value = a.tileSize;
      }
      if (pool) pool.broadcast({ t: 'setAtlas', uvTable });
      invalidateAll();
    },

    setMeshOptions(mo) {
      meshOpts = Object.assign({}, MESH_DEFAULTS, meshOpts || {}, mo || {});
      if (pool) pool.broadcast({ t: 'setMeshOpts', opts: meshOpts });
      invalidateAll();
    },

    /** Arazi ufku tıkamasını aç/kapa (varsayılan açık). Kapanınca tüm sütunlar yeniden görünür sayılır. */
    setOcclusion(on) {
      culler.setOcclusion(on);
    },

    isOcclusionEnabled() {
      return culler.isOcclusionEnabled();
    },

    setFogDistance(d) {
      culler.setFogDistance(d);
    },

    /** Mesh (lo..hi) ve derin kesit tutma (keepLo..keepHi) pencereleri (mutlak y). */
    getVerticalWindow() {
      return win;
    },

    /** (radius) chunk yarıçapındaki tüm üretilebilir sütunlar mesh'lendi mi? */
    isReady(radius) {
      return this.getLoadProgress(radius) >= 1;
    },

    /**
     * 0..1: yarıçap (chunk, gerçek oyuncu konumundan; en çok görüş mesafesi kadar) içindeki üretilebilir sütunların
     * (pencerelerindeki tüm bantların) mesh'lenmiş oranı. Mesh yarıçapıyla aynı ölçüt kullanılır → küçük görüş mesafesinde asla takılmaz.
     */
    getLoadProgress(radius) {
      return progressOf(radius);
    },

    /** Eşzamanlı hazırlık sorgusu (geçiş makinesi): {ready, progress}. İlk planlamadan önce progress 0. */
    readiness(radius) {
      if (disposed || recs.size === 0) return { ready: false, progress: 0 };
      const p = progressOf(radius);
      return { ready: p >= 1, progress: p };
    },

    /** (radius) içindeki tüm üretilebilir sütunlar mesh'lenince çözülür; yönetici atılırsa reddedilir. */
    whenReady(radius) {
      if (disposed) return Promise.reject(new Error('chunk yöneticisi atıldı'));
      return new Promise((resolve, reject) => {
        if (recs.size > 0 && progressOf(radius) >= 1) {
          resolve();
          return;
        }
        waiters.push({ r: radius, resolve, reject });
      });
    },

    setHidden(b) {
      store.root.visible = !b;
    },

    get hidden() {
      return !store.root.visible;
    },

    get epoch() {
      return epoch;
    },

    /** İşçi havuzunu (varsa) bu yöneticiden çıkarır ve döner; yönetici işçisiz (ana thread yoluna) geçer. İşleyiciler bırakılır. */
    releasePool() {
      const p = pool;
      if (p) p.detach();
      pool = null;
      jobs.forEach(freeJob);
      jobs.clear();
      planDirty = true;
      return p;
    },

    /** Boştaki bir havuzu devralır (yeni epoch ile yeniden init). Zaten havuzu varsa eskisi atılır. İşçi yolu desteklenmiyorsa false. */
    adoptPool(p) {
      if (disposed || !p || !(wantWorker && uvTable)) return false;
      if (pool && pool !== p) pool.dispose();
      jobs.forEach(freeJob);
      jobs.clear();
      pool = p;
      poolFailed = false;
      pool.attach(poolHandlers);
      pool.reinit(initMsg());
      planDirty = true;
      return true;
    },

    /** Test/araç: iç durum özeti. */
    info() {
      return {
        epoch, recs: recs.size, jobs: jobs.size, workers: pool ? pool.alive : 0, hasPool: pool !== null, waiters: waiters.length, hidden: !store.root.visible,
      };
    },

    getSealDistance() {
      return sealDist;
    },

    getStats() {
      return stats;
    },

    /** Hata ayıklama / seçim için görünür bant mesh'leri. */
    getMeshes() {
      const out = [];
      recs.forEach((rec) => {
        if (!rec.bands) return;
        for (let i = 0; i < rec.bands.length; i++) {
          const b = rec.bands[i];
          if (!b) continue;
          for (let p = 0; p < 3; p++) if (b.meshes[p]) out.push(b.meshes[p]);
        }
      });
      return out;
    },

    /**
     * Çizilmeyen (arkada/tıkalı) ama `far` blok içindeki, isDone(mesh) → false olan mesh'ler (en yakın ≤ max; out'a yazılır).
     * GPU'ya önceden yükleme içindir (bkz. chunkMgrWarm.js, gameWarmChunks.js).
     */
    pickHidden(x, y, z, far, max, isDone, out) {
      return pickHiddenBands(recs, x, y, z, far, max, isDone, out);
    },

    /** Bağlam geri geldiğinde (GPU tamponları gitti) tüm mesh'leri yeniden kur. */
    rebuildMeshes() {
      recs.forEach((rec) => clearBands(rec));
      arrived.length = 0;
      invalidateAll();
    },

    /** opts.keepPool: işçi havuzunu atmaz, döner (boyut geçişi: yeni yöneticiye devredilir). Aksi hâlde havuz kapatılır. */
    dispose(dopts) {
      if (disposed) return null;
      disposed = true;
      for (let i = 0; i < unsubs.length; i++) unsubs[i]();
      unsubs.length = 0;
      let kept = null;
      if (pool) {
        if (dopts && dopts.keepPool === true) {
          pool.detach();
          kept = pool;
        } else pool.dispose();
      }
      pool = null;
      for (let i = 0; i < waiters.length; i++) waiters[i].reject(new Error('chunk yöneticisi atıldı'));
      waiters.length = 0;
      jobs.clear();
      arrived.length = 0;
      arrivedSecs.length = 0;
      urgent.clear();
      recs.forEach((rec) => clearBands(rec));
      recs.clear();
      culler.clear();
      store.dispose();
      scene.remove(store.root);
      return kept;
    },

    /** Test/araç: işçi yolu etkin mi? */
    get workerMode() {
      return usingWorkers();
    },
  };
}

export { adoptChunk };
export { generateChunkData, makeGenContext } from './chunkMgrCore.js';
