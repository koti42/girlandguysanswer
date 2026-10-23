/*
 * perf_tuner (Faz 5) — chunk akış bütçesi:
 *  (1) kare başına mesh yükleme tavanı iki integrateArrived çağrısı arasında PAYLAŞILIR (eskiden çağrı başına: kare başına 2× tepe);
 *      birikim > 3× tavan iken tavan 2× (ilk dolum/ışınlanma) — hiçbir karede 2× tavanı geçmez.
 *  (2) şehir (neon) bantları hiçbir zaman mesh kademesi 2 ile istenmez (kademe 1 ile bayt-aynı → boşuna yeniden mesh); ana diyar kademe 2'yi korur.
 * İşçi havuzu yerine, işleri aynı fonksiyonlarla eşzamanlı çalıştırıp yanıtı tutan "geri döngü" havuzu kullanılır.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { World } from '../sim/world.js';
import { createChunkMaterials } from './materials.js';
import { computeAtlasLayout } from './atlasLayout.js';
import { TILE_COUNT } from '../sim/blocks.js';
import { createChunkManager } from './chunkManager.js';
import {
  chunkToTransfer, generateChunkData, generateSectionsData, makeGenContext, meshFromWire,
} from './chunkMgrCore.js';
import { QUALITY } from './quality.js';
import { dimSeed } from '../sim/dim/dimensions.js';

const layout = computeAtlasLayout({ tileCount: TILE_COUNT, tileSize: 32 });
const fakeAtlas = {
  map: null, normalMap: null, materialMap: null, width: layout.width, height: layout.height, cell: layout.cell, pad: layout.pad,
  tileSize: layout.tileSize, uvTable: layout.uvTable,
};

/** Geri döngü havuzu: gen/gensec yanıtı hemen teslim edilir; mesh yanıtı `held` kuyruğunda tutulur (teslimi test belirler). */
function loopbackPool(world, genInit) {
  const ctx = makeGenContext(genInit);
  const pool = {
    handlers: null, held: [], queued: [], meshMsgs: [], ready: true, alive: 1, decorate: false, inflight: 0,
    attach(h) { pool.handlers = h; },
    detach() { pool.handlers = null; },
    reinit() {},
    freeSlots() { return 64; },
    broadcast() {},
    dispose() {},
    post(m) {
      if (m.t === 'gen') {
        const tr = chunkToTransfer(generateChunkData(ctx, m.cx, m.cz, m.openRings, m.edits || null, m.overlay || null));
        pool.queued.push({ t: 'chunk', id: m.id, ep: m.ep, cx: m.cx, cz: m.cz, data: tr.data, ms: 1 });
      } else if (m.t === 'gensec') {
        const r = generateSectionsData(ctx, m.cx, m.cz, m.sis, m.openRings, m.edits || null);
        pool.queued.push({ t: 'sections', id: m.id, ep: m.ep, cx: m.cx, cz: m.cz, list: r.list, ms: 1 });
      } else if (m.t === 'mesh') {
        pool.meshMsgs.push({ lod: m.lod | 0, cx: m.cx, cz: m.cz });
        const mesh = meshFromWire(m.center, m.nb, layout.uvTable, undefined, m.lod | 0, m.band || null);
        pool.held.push({ t: 'meshed', id: m.id, ep: m.ep, cx: m.cx, cz: m.cz, version: m.version, mesh, ms: 1 });
      }
      return true;
    },
    flush() {
      const q = pool.queued.splice(0);
      q.forEach((r) => pool.handlers.onMessage(r));
    },
    deliver(n) {
      const take = pool.held.splice(0, n);
      take.forEach((r) => pool.handlers.onMessage(r));
      return take.length;
    },
  };
  return pool;
}

function rig(world, pool, view, uploads) {
  const scene = new THREE.Scene();
  const materials = createChunkMaterials(THREE, fakeAtlas, undefined, { quality: 'low' });
  const mgr = createChunkManager({
    THREE, scene, world, materials, atlas: fakeAtlas, quality: Object.assign({}, QUALITY.low, { viewDist: view, maxUploads: uploads }), useWorker: true, pool, releaseCpuData: false, planInterval: 0,
  });
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 900);
  camera.position.set(0.5, 65.6, 2.5);
  camera.updateMatrixWorld();
  return { mgr, camera, pos: { x: 0.5, y: 65.6, z: 2.5 } };
}

describe('chunk akış bütçesi (perf_tuner)', { timeout: 240000 }, () => {
  let hadWorker;
  beforeEach(() => {
    hadWorker = globalThis.Worker;
    globalThis.Worker = function FakeWorker() {};
  });
  afterEach(() => {
    if (hadWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = hadWorker;
  });

  it('kare başına yükleme tavanı iki çağrı arasında paylaşılır: birikim 2×tavan iken ilk karede ≤ tavan', () => {
    const seed = dimSeed(7, 'neon');
    const w = new World({ seed, mode: 'macera', dim: 'neon' });
    const pool = loopbackPool(w, { seed, gen: 'city', dim: 'neon', bounds: w.bounds });
    const UP = 3;
    const r = rig(w, pool, 3, UP);
    for (let i = 0; i < 80 && pool.held.length < UP * 2; i++) { r.mgr.update(r.pos, r.camera, 4); pool.flush(); }
    expect(pool.held.length).toBeGreaterThanOrEqual(UP * 2);
    // yalnızca 2×tavan sonuç teslim et (≤ 3× tavan: tavan ikiye katlanmaz)
    const before = r.mgr.getStats().meshesBuilt;
    expect(pool.deliver(UP * 2)).toBe(UP * 2);
    r.mgr.update(r.pos, r.camera, 4);
    const d1 = r.mgr.getStats().meshesBuilt - before;
    expect(d1).toBeGreaterThan(0);
    expect(d1).toBeLessThanOrEqual(UP);
    // sonraki karede kalanlar yüklenir; hiçbir karede 2× tavan geçilmez
    let prev = r.mgr.getStats().meshesBuilt;
    for (let i = 0; i < 6; i++) {
      r.mgr.update(r.pos, r.camera, 4);
      const now = r.mgr.getStats().meshesBuilt;
      expect(now - prev).toBeLessThanOrEqual(UP * 2);
      prev = now;
    }
  });

  it('büyük birikimde (> 3× tavan) tavan 2× olur ama aşılmaz', () => {
    const seed = dimSeed(7, 'neon');
    const w = new World({ seed, mode: 'macera', dim: 'neon' });
    const pool = loopbackPool(w, { seed, gen: 'city', dim: 'neon', bounds: w.bounds });
    const UP = 2;
    const r = rig(w, pool, 4, UP);
    for (let i = 0; i < 200 && pool.held.length < UP * 5; i++) { r.mgr.update(r.pos, r.camera, 4); pool.flush(); }
    expect(pool.held.length).toBeGreaterThanOrEqual(UP * 5);
    pool.deliver(pool.held.length);
    const before = r.mgr.getStats().meshesBuilt;
    r.mgr.update(r.pos, r.camera, 4);
    const d = r.mgr.getStats().meshesBuilt - before;
    expect(d).toBeGreaterThan(UP);
    expect(d).toBeLessThanOrEqual(UP * 2);
  });

  it('şehirde mesh kademesi 2 istenmez; ana diyarda (aynı görüş) kademe 2 yine istenir', () => {
    const seed = dimSeed(7, 'neon');
    const wc = new World({ seed, mode: 'macera', dim: 'neon' });
    const pc = loopbackPool(wc, { seed, gen: 'city', dim: 'neon', bounds: wc.bounds });
    const rc = rig(wc, pc, 7, 6);
    for (let i = 0; i < 220; i++) {
      rc.mgr.update(rc.pos, rc.camera, 4);
      pc.flush();
      pc.deliver(8);
    }
    const lodsCity = new Set(pc.meshMsgs.map((m) => m.lod));
    expect(pc.meshMsgs.length).toBeGreaterThan(20);
    expect(lodsCity.has(2)).toBe(false);
    expect(lodsCity.has(1)).toBe(true);
    rc.mgr.dispose();

    const wo = new World({ seed: 11, mode: 'macera' });
    const po = loopbackPool(wo, { seed: 11 });
    const ro = rig(wo, po, 6, 6);
    for (let i = 0; i < 260; i++) {
      ro.mgr.update(ro.pos, ro.camera, 4);
      po.flush();
      po.deliver(8);
    }
    expect(new Set(po.meshMsgs.map((m) => m.lod)).has(2)).toBe(true);
    ro.mgr.dispose();
  });
});
